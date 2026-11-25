// Split a library: every top-level group becomes its own library (same name, children keep order).
//
//   node dist/scripts/split-library.js --library <id> --user <username> [--delete-empty] [--dry-run]
//
// Uses moveNode/deleteNode, so tree history, audit and the AI plan stay consistent. Top-level docs
// stay where they are. --delete-empty soft-deletes the source library when nothing is left in it
// (restorable from 设置 → 知识库).
import { makeSql } from "../lib/db";
import { moveNode, deleteNode, deleteLibrary } from "../lib/docs";
import { audit } from "../lib/audit";

async function main() {
  const args = process.argv.slice(2);
  const opt = (k: string) => {
    const i = args.indexOf(k);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const libraryId = Number(opt("--library"));
  const username = opt("--user");
  const dryRun = args.includes("--dry-run");
  const deleteEmpty = args.includes("--delete-empty");
  if (!libraryId || !username) {
    console.error("usage: split-library --library <id> --user <username> [--delete-empty] [--dry-run]");
    process.exit(2);
  }
  const sql = makeSql(2);
  try {
    const [lib] = await sql<{ id: number; project_id: number; name: string; position: number }[]>`
      SELECT id, project_id, name, position FROM libraries WHERE id = ${libraryId} AND deleted_at IS NULL`;
    if (!lib) throw new Error(`library ${libraryId} not found`);
    const [user] = await sql<{ id: number }[]>`SELECT id FROM users WHERE username = ${username}`;
    if (!user) throw new Error(`user ${username} not found`);
    const ctx = { actorId: user.id, projectId: lib.project_id, ip: null };

    await sql.begin(async (t) => {
      const roots = await t<{ id: number; kind: string; title: string }[]>`
        SELECT id, kind, title FROM nodes WHERE library_id = ${libraryId} AND parent_id IS NULL AND deleted_at IS NULL ORDER BY position, id`;
      const [{ pos }] = await t<{ pos: number }[]>`SELECT coalesce(max(position), 0) AS pos FROM libraries WHERE project_id = ${lib.project_id}`;
      let next = pos;
      const created: string[] = [];
      for (const g of roots.filter((r) => r.kind === "group")) {
        const kids = await t<{ id: number; title: string }[]>`
          SELECT id, title FROM nodes WHERE parent_id = ${g.id} AND deleted_at IS NULL ORDER BY position, id`;
        console.log(`📚 ${g.title}  (${kids.length} 项)`);
        if (dryRun) continue;
        next += 10;
        const [nl] = await t<{ id: number }[]>`
          INSERT INTO libraries (project_id, name, description, position, created_by)
          VALUES (${lib.project_id}, ${g.title}, '', ${next}, ${user.id}) RETURNING id`;
        await t`INSERT INTO tree_events (project_id, library_id, actor_id, action, after)
                VALUES (${lib.project_id}, ${nl.id}, ${user.id}, 'library.create', ${t.json({ name: g.title, split_from: libraryId })})`;
        await audit(t, { ...ctx, objectType: "library", objectId: nl.id, action: "library.create", detail: { name: g.title, split_from: libraryId } });
        for (let i = 0; i < kids.length; i++) await moveNode(t, ctx, kids[i].id, { libraryId: nl.id, parentId: null, index: i });
        await deleteNode(t, ctx, g.id); // now-empty group
        created.push(g.title);
      }
      if (dryRun) return;
      await audit(t, { ...ctx, objectType: "library", objectId: libraryId, action: "library.split", detail: { into: created } });
      const [{ left }] = await t<{ left: number }[]>`SELECT count(*)::int AS left FROM nodes WHERE library_id = ${libraryId} AND deleted_at IS NULL`;
      if (deleteEmpty && left === 0) {
        await deleteLibrary(t, ctx, libraryId);
        console.log(`「${lib.name}」已清空并删除（可在设置中恢复）`);
      }
      console.log(`split 「${lib.name}」 into ${created.length} libraries`);
    });
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
