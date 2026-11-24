import "server-only";
import { randomUUID } from "node:crypto";
import type { Db, Tx } from "./db";
import { sha256 } from "./crypto";
import { audit } from "./audit";
import { HttpError } from "./perms";

export type TreeNode = {
  id: number;
  parent_id: number | null;
  kind: "doc" | "group";
  title: string;
  position: number;
  published_version_id: number | null;
  head_version_id: number | null;
};

export type Version = {
  id: number;
  node_id: number;
  title: string;
  content: string;
  content_hash: string;
  created_by: number | null;
  created_at: Date;
  source: string;
  rollback_of: number | null;
};

type Ctx = { actorId: number; projectId: number; ip?: string | null };

/** Ask the AI worker to re-plan this project (no-op when AI is off). Same transaction as the change. */
export async function requestAiPlan(db: Db, projectId: number) {
  const r = await db`UPDATE projects SET ai_plan_requested_at = now() WHERE id = ${projectId} AND ai_enabled RETURNING id`;
  if (r.length) await db`SELECT pg_notify('folio_ai', ${String(projectId)})`;
}

export async function loadTree(db: Db, libraryId: number): Promise<TreeNode[]> {
  return db<TreeNode[]>`
    SELECT id, parent_id, kind, title, position, published_version_id, head_version_id
    FROM nodes WHERE library_id = ${libraryId} AND deleted_at IS NULL ORDER BY position, id`;
}

async function siblingIds(db: Db, libraryId: number, parentId: number | null, exclude?: number) {
  const rows = await db<{ id: number }[]>`
    SELECT id FROM nodes
    WHERE library_id = ${libraryId} AND deleted_at IS NULL
      AND parent_id IS NOT DISTINCT FROM ${parentId} AND id <> ${exclude ?? -1}
    ORDER BY position, id`;
  return rows.map((r) => r.id);
}

async function renumber(db: Db, ids: number[]) {
  for (let i = 0; i < ids.length; i++) await db`UPDATE nodes SET position = ${(i + 1) * 10} WHERE id = ${ids[i]}`;
}

async function indexOf(db: Db, node: { id: number; library_id: number; parent_id: number | null }) {
  const ids = await siblingIds(db, node.library_id, node.parent_id);
  return ids.indexOf(node.id);
}

export async function createNode(
  t: Tx,
  ctx: Ctx,
  input: { libraryId: number; parentId: number | null; kind: "doc" | "group"; title: string; content?: string }
) {
  if (input.parentId) {
    const [p] = await t`SELECT id FROM nodes WHERE id = ${input.parentId} AND library_id = ${input.libraryId} AND deleted_at IS NULL`;
    if (!p) throw new HttpError(400, "父节点不存在");
  }
  const sibs = await siblingIds(t, input.libraryId, input.parentId);
  const [node] = await t<{ id: number }[]>`
    INSERT INTO nodes (library_id, parent_id, kind, title, position, created_by)
    VALUES (${input.libraryId}, ${input.parentId}, ${input.kind}, ${input.title}, ${(sibs.length + 1) * 10}, ${ctx.actorId})
    RETURNING id`;
  if (input.kind === "doc") {
    const content = input.content ?? "";
    const [v] = await t<{ id: number }[]>`
      INSERT INTO doc_versions (node_id, title, content, content_hash, created_by, source)
      VALUES (${node.id}, ${input.title}, ${content}, ${sha256(content)}, ${ctx.actorId}, ${input.content ? "import" : "save"})
      RETURNING id`;
    await t`UPDATE nodes SET head_version_id = ${v.id} WHERE id = ${node.id}`;
  }
  const after = { library_id: input.libraryId, parent_id: input.parentId, index: sibs.length, title: input.title, kind: input.kind };
  await t`INSERT INTO tree_events (project_id, library_id, node_id, actor_id, action, after)
          VALUES (${ctx.projectId}, ${input.libraryId}, ${node.id}, ${ctx.actorId}, 'create', ${t.json(after)})`;
  await audit(t, { ...ctx, objectType: "node", objectId: node.id, action: `${input.kind}.create`, detail: { title: input.title, library_id: input.libraryId } });
  return node.id;
}

export type SaveResult =
  | { ok: true; changed: boolean; versionId: number; savedAt: string }
  | { ok: false; conflict: { versionId: number; title: string; content: string; by: string | null; at: string } };

export async function saveDraft(t: Tx, ctx: Ctx, nodeId: number, input: { title: string; content: string; baseVersionId: number | null }): Promise<SaveResult> {
  const [node] = await t<{ id: number; title: string; kind: string; head_version_id: number | null; library_id: number }[]>`
    SELECT id, title, kind, head_version_id, library_id FROM nodes WHERE id = ${nodeId} AND deleted_at IS NULL FOR UPDATE`;
  if (!node || node.kind !== "doc") throw new HttpError(404, "文档不存在");
  const [head] = node.head_version_id
    ? await t<(Version & { username: string | null })[]>`
        SELECT v.*, u.username FROM doc_versions v LEFT JOIN users u ON u.id = v.created_by WHERE v.id = ${node.head_version_id}`
    : [];
  if (head && input.baseVersionId !== head.id) {
    return { ok: false, conflict: { versionId: head.id, title: head.title, content: head.content, by: head.username, at: head.created_at.toISOString() } };
  }
  const hash = sha256(input.content);
  const titleChanged = input.title !== node.title;
  if (head && head.content_hash === hash && !titleChanged) {
    return { ok: true, changed: false, versionId: head.id, savedAt: head.created_at.toISOString() };
  }
  const [v] = await t<{ id: number; created_at: Date }[]>`
    INSERT INTO doc_versions (node_id, title, content, content_hash, parent_version_id, created_by)
    VALUES (${nodeId}, ${input.title}, ${input.content}, ${hash}, ${head?.id ?? null}, ${ctx.actorId})
    RETURNING id, created_at`;
  await t`UPDATE nodes SET head_version_id = ${v.id}, title = ${input.title}, updated_at = now() WHERE id = ${nodeId}`;
  if (titleChanged) {
    await t`INSERT INTO tree_events (project_id, library_id, node_id, actor_id, action, before, after)
            VALUES (${ctx.projectId}, ${node.library_id}, ${nodeId}, ${ctx.actorId}, 'rename', ${t.json({ title: node.title })}, ${t.json({ title: input.title })})`;
    await audit(t, { ...ctx, objectType: "node", objectId: nodeId, action: "node.rename", detail: { from: node.title, to: input.title } });
  }
  await audit(t, { ...ctx, objectType: "doc", objectId: nodeId, action: "doc.save", detail: { version_id: v.id, base_version_id: head?.id ?? null, bytes: Buffer.byteLength(input.content) } });
  return { ok: true, changed: true, versionId: v.id, savedAt: v.created_at.toISOString() };
}

export async function publish(t: Tx, ctx: Ctx, nodeId: number, versionId?: number) {
  const [node] = await t<{ head_version_id: number | null; published_version_id: number | null; kind: string }[]>`
    SELECT head_version_id, published_version_id, kind FROM nodes WHERE id = ${nodeId} AND deleted_at IS NULL FOR UPDATE`;
  if (!node || node.kind !== "doc" || !node.head_version_id) throw new HttpError(404, "文档不存在");
  const vid = versionId ?? node.head_version_id;
  const [v] = await t`SELECT id FROM doc_versions WHERE id = ${vid} AND node_id = ${nodeId}`;
  if (!v) throw new HttpError(400, "版本不存在");
  await t`UPDATE nodes SET published_version_id = ${vid}, published_at = now() WHERE id = ${nodeId}`;
  await audit(t, { ...ctx, objectType: "doc", objectId: nodeId, action: "doc.publish", detail: { version_id: vid, previous: node.published_version_id } });
  await requestAiPlan(t, ctx.projectId);
}

export async function unpublish(t: Tx, ctx: Ctx, nodeId: number) {
  const [node] = await t<{ published_version_id: number | null }[]>`SELECT published_version_id FROM nodes WHERE id = ${nodeId} FOR UPDATE`;
  if (!node?.published_version_id) return;
  await t`UPDATE nodes SET published_version_id = NULL, published_at = NULL WHERE id = ${nodeId}`;
  await audit(t, { ...ctx, objectType: "doc", objectId: nodeId, action: "doc.unpublish", detail: { version_id: node.published_version_id } });
  await requestAiPlan(t, ctx.projectId);
}

/** Rollback creates a new draft version with the old body; history is kept. */
export async function rollback(t: Tx, ctx: Ctx, nodeId: number, versionId: number) {
  const [node] = await t<{ head_version_id: number | null; title: string }[]>`
    SELECT head_version_id, title FROM nodes WHERE id = ${nodeId} AND deleted_at IS NULL FOR UPDATE`;
  if (!node) throw new HttpError(404, "文档不存在");
  const [old] = await t<Version[]>`SELECT * FROM doc_versions WHERE id = ${versionId} AND node_id = ${nodeId}`;
  if (!old) throw new HttpError(404, "版本不存在");
  const [v] = await t<{ id: number }[]>`
    INSERT INTO doc_versions (node_id, title, content, content_hash, parent_version_id, created_by, source, rollback_of)
    VALUES (${nodeId}, ${node.title}, ${old.content}, ${old.content_hash}, ${node.head_version_id}, ${ctx.actorId}, 'rollback', ${old.id})
    RETURNING id`;
  await t`UPDATE nodes SET head_version_id = ${v.id}, updated_at = now() WHERE id = ${nodeId}`;
  await audit(t, { ...ctx, objectType: "doc", objectId: nodeId, action: "doc.rollback", detail: { to_version: old.id, new_version: v.id, previous_head: node.head_version_id } });
  return v.id;
}

async function isDescendant(db: Db, ancestorId: number, nodeId: number) {
  const rows = await db`
    WITH RECURSIVE up AS (
      SELECT id, parent_id FROM nodes WHERE id = ${nodeId}
      UNION ALL SELECT n.id, n.parent_id FROM nodes n JOIN up ON n.id = up.parent_id
    ) SELECT 1 FROM up WHERE id = ${ancestorId}`;
  return rows.length > 0;
}

export async function moveNode(
  t: Tx,
  ctx: Ctx,
  nodeId: number,
  target: { libraryId: number; parentId: number | null; index: number },
  opts: { action?: string; reverting?: number } = {}
) {
  const [node] = await t<{ id: number; library_id: number; parent_id: number | null; title: string }[]>`
    SELECT id, library_id, parent_id, title FROM nodes WHERE id = ${nodeId} AND deleted_at IS NULL FOR UPDATE`;
  if (!node) throw new HttpError(404, "节点不存在");
  const [lib] = await t`SELECT id FROM libraries WHERE id = ${target.libraryId} AND project_id = ${ctx.projectId} AND deleted_at IS NULL`;
  if (!lib) throw new HttpError(400, "目标知识库不存在");
  if (target.parentId) {
    const [p] = await t`SELECT id FROM nodes WHERE id = ${target.parentId} AND library_id = ${target.libraryId} AND deleted_at IS NULL`;
    if (!p) throw new HttpError(400, "目标父节点不存在");
    if (target.parentId === nodeId || (await isDescendant(t, nodeId, target.parentId))) throw new HttpError(400, "不能移动到自身或子节点下");
  }
  const before = { library_id: node.library_id, parent_id: node.parent_id, index: await indexOf(t, node) };
  const sibs = await siblingIds(t, target.libraryId, target.parentId, nodeId);
  const idx = Math.max(0, Math.min(target.index, sibs.length));
  sibs.splice(idx, 0, nodeId);
  await t`UPDATE nodes SET parent_id = ${target.parentId}, library_id = ${target.libraryId}, updated_at = now() WHERE id = ${nodeId}`;
  if (target.libraryId !== node.library_id) {
    await t`
      WITH RECURSIVE sub AS (
        SELECT id FROM nodes WHERE parent_id = ${nodeId}
        UNION ALL SELECT n.id FROM nodes n JOIN sub ON n.parent_id = sub.id
      ) UPDATE nodes SET library_id = ${target.libraryId} WHERE id IN (SELECT id FROM sub)`;
  }
  await renumber(t, sibs);
  if (node.parent_id !== target.parentId || node.library_id !== target.libraryId) {
    await renumber(t, await siblingIds(t, node.library_id, node.parent_id));
  }
  const after = { library_id: target.libraryId, parent_id: target.parentId, index: idx };
  if (JSON.stringify(before) === JSON.stringify(after)) return;
  const action = opts.action ?? (before.parent_id === after.parent_id && before.library_id === after.library_id ? "reorder" : "move");
  await t`INSERT INTO tree_events (project_id, library_id, node_id, actor_id, action, before, after)
          VALUES (${ctx.projectId}, ${target.libraryId}, ${nodeId}, ${ctx.actorId}, ${action}, ${t.json(before)}, ${t.json({ ...after, reverting: opts.reverting })})`;
  await audit(t, { ...ctx, objectType: "node", objectId: nodeId, action: opts.reverting ? "tree.revert" : `node.${action}`, detail: { title: node.title, before, after, reverting: opts.reverting } });
  if (target.libraryId !== node.library_id) await requestAiPlan(t, ctx.projectId);
}

export async function renameNode(t: Tx, ctx: Ctx, nodeId: number, title: string, reverting?: number) {
  const [node] = await t<{ title: string; library_id: number }[]>`SELECT title, library_id FROM nodes WHERE id = ${nodeId} AND deleted_at IS NULL FOR UPDATE`;
  if (!node) throw new HttpError(404, "节点不存在");
  if (node.title === title) return;
  await t`UPDATE nodes SET title = ${title}, updated_at = now() WHERE id = ${nodeId}`;
  await t`INSERT INTO tree_events (project_id, library_id, node_id, actor_id, action, before, after)
          VALUES (${ctx.projectId}, ${node.library_id}, ${nodeId}, ${ctx.actorId}, 'rename', ${t.json({ title: node.title })}, ${t.json({ title, reverting: reverting ?? null })})`;
  await audit(t, { ...ctx, objectType: "node", objectId: nodeId, action: reverting ? "tree.revert" : "node.rename", detail: { from: node.title, to: title, reverting } });
}

export async function deleteNode(t: Tx, ctx: Ctx, nodeId: number) {
  const [node] = await t<{ id: number; library_id: number; parent_id: number | null; title: string }[]>`
    SELECT id, library_id, parent_id, title FROM nodes WHERE id = ${nodeId} AND deleted_at IS NULL FOR UPDATE`;
  if (!node) throw new HttpError(404, "节点不存在");
  const batch = randomUUID();
  const index = await indexOf(t, node);
  const rows = await t<{ id: number }[]>`
    WITH RECURSIVE sub AS (
      SELECT id FROM nodes WHERE id = ${nodeId}
      UNION ALL SELECT n.id FROM nodes n JOIN sub ON n.parent_id = sub.id WHERE n.deleted_at IS NULL
    ) UPDATE nodes SET deleted_at = now(), deleted_by = ${ctx.actorId}, delete_batch = ${batch}
      WHERE id IN (SELECT id FROM sub) RETURNING id`;
  await t`INSERT INTO tree_events (project_id, library_id, node_id, actor_id, action, before, after)
          VALUES (${ctx.projectId}, ${node.library_id}, ${nodeId}, ${ctx.actorId}, 'delete',
                  ${t.json({ library_id: node.library_id, parent_id: node.parent_id, index, title: node.title })}, ${t.json({ batch, count: rows.length })})`;
  await audit(t, { ...ctx, objectType: "node", objectId: nodeId, action: "node.delete", detail: { title: node.title, batch, count: rows.length } });
  await renumber(t, await siblingIds(t, node.library_id, node.parent_id));
  await requestAiPlan(t, ctx.projectId);
}

/** Restore a deleted subtree. Restored documents come back unpublished. */
export async function restoreNode(t: Tx, ctx: Ctx, nodeId: number) {
  const [node] = await t<{ id: number; library_id: number; parent_id: number | null; delete_batch: string | null; title: string; deleted_at: Date | null }[]>`
    SELECT id, library_id, parent_id, delete_batch, title, deleted_at FROM nodes WHERE id = ${nodeId} FOR UPDATE`;
  if (!node?.deleted_at) throw new HttpError(400, "该节点未被删除");
  const [lib] = await t`SELECT deleted_at FROM libraries WHERE id = ${node.library_id}`;
  if (lib.deleted_at) throw new HttpError(400, "请先恢复所属知识库");
  let parentId = node.parent_id;
  if (parentId) {
    const [p] = await t<{ deleted_at: Date | null }[]>`SELECT deleted_at FROM nodes WHERE id = ${parentId}`;
    if (p.deleted_at) parentId = null; // parent still in the trash: put it back at the root
  }
  const restored = await t<{ id: number }[]>`
    UPDATE nodes SET deleted_at = NULL, deleted_by = NULL, delete_batch = NULL, published_version_id = NULL, published_at = NULL, updated_at = now()
    WHERE delete_batch = ${node.delete_batch} RETURNING id`;
  const sibs = await siblingIds(t, node.library_id, parentId, nodeId);
  sibs.push(nodeId);
  await t`UPDATE nodes SET parent_id = ${parentId} WHERE id = ${nodeId}`;
  await renumber(t, sibs);
  await t`INSERT INTO tree_events (project_id, library_id, node_id, actor_id, action, after)
          VALUES (${ctx.projectId}, ${node.library_id}, ${nodeId}, ${ctx.actorId}, 'restore', ${t.json({ parent_id: parentId, count: restored.length })})`;
  await audit(t, { ...ctx, objectType: "node", objectId: nodeId, action: "node.restore", detail: { title: node.title, count: restored.length } });
}

/** Undo a single directory change (move / reorder / rename / delete). */
export async function revertTreeEvent(t: Tx, ctx: Ctx, eventId: number) {
  const [ev] = await t<{ id: number; node_id: number; action: string; before: Record<string, unknown> | null }[]>`
    SELECT id, node_id, action, before FROM tree_events WHERE id = ${eventId} AND project_id = ${ctx.projectId}`;
  if (!ev) throw new HttpError(404, "记录不存在");
  const b = ev.before ?? {};
  if (ev.action === "move" || ev.action === "reorder") {
    await moveNode(t, ctx, ev.node_id, { libraryId: Number(b.library_id), parentId: (b.parent_id as number | null) ?? null, index: Number(b.index) }, { action: ev.action, reverting: ev.id });
  } else if (ev.action === "rename") {
    await renameNode(t, ctx, ev.node_id, String(b.title), ev.id);
  } else if (ev.action === "delete") {
    await restoreNode(t, ctx, ev.node_id);
  } else {
    throw new HttpError(400, "该操作不支持撤销");
  }
}

export async function deleteLibrary(t: Tx, ctx: Ctx, libraryId: number) {
  const [l] = await t<{ name: string }[]>`UPDATE libraries SET deleted_at = now(), deleted_by = ${ctx.actorId} WHERE id = ${libraryId} AND deleted_at IS NULL RETURNING name`;
  if (!l) throw new HttpError(404, "知识库不存在");
  await t`INSERT INTO tree_events (project_id, library_id, actor_id, action, before) VALUES (${ctx.projectId}, ${libraryId}, ${ctx.actorId}, 'library.delete', ${t.json({ name: l.name })})`;
  await audit(t, { ...ctx, objectType: "library", objectId: libraryId, action: "library.delete", detail: { name: l.name } });
  await requestAiPlan(t, ctx.projectId);
}

/** Restored libraries come back private. */
export async function restoreLibrary(t: Tx, ctx: Ctx, libraryId: number) {
  const [l] = await t<{ name: string }[]>`
    UPDATE libraries SET deleted_at = NULL, deleted_by = NULL, is_public = false WHERE id = ${libraryId} AND deleted_at IS NOT NULL AND project_id = ${ctx.projectId} RETURNING name`;
  if (!l) throw new HttpError(404, "知识库不存在或未删除");
  await t`INSERT INTO tree_events (project_id, library_id, actor_id, action, after) VALUES (${ctx.projectId}, ${libraryId}, ${ctx.actorId}, 'library.restore', ${t.json({ is_public: false })})`;
  await audit(t, { ...ctx, objectType: "library", objectId: libraryId, action: "library.restore", detail: { name: l.name, is_public: false } });
  await requestAiPlan(t, ctx.projectId);
}

export function buildTree<T extends { id: number; parent_id: number | null }>(rows: T[]) {
  type N = T & { children: N[] };
  const map = new Map<number, N>();
  rows.forEach((r) => map.set(r.id, { ...r, children: [] }));
  const roots: N[] = [];
  for (const n of map.values()) {
    const p = n.parent_id ? map.get(n.parent_id) : undefined;
    (p ? p.children : roots).push(n);
  }
  return roots;
}

/** attachment ids referenced by a markdown body: ![..](/api/files/<uuid>) */
export function attachmentIds(md: string): string[] {
  return [...new Set([...md.matchAll(/\/api\/files\/([0-9a-f-]{36})/g)].map((m) => m[1]))];
}
