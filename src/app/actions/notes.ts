"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { tx } from "@/lib/db";
import { requireUser, clientIp } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { projectRole, atLeast, HttpError } from "@/lib/perms";
import { validDocIds } from "@/lib/project-data";

async function editor(projectId: number) {
  const user = await requireUser();
  const role = await projectRole(user, projectId);
  if (!atLeast(role, "editor")) throw new HttpError(403, "权限不足");
  return { actorId: user.id, projectId, ip: await clientIp() };
}

function parse(form: FormData) {
  const body = z.string().trim().min(1).max(20000).parse(form.get("body"));
  const tags = [...new Set(String(form.get("tags") ?? "").split(/[\s,，#]+/).map((t) => t.trim()).filter(Boolean))].slice(0, 12).map((t) => t.slice(0, 30));
  const docs = form.getAll("docs").map(Number).filter(Number.isSafeInteger);
  return { body, tags, docs };
}

export async function createNote(projectId: number, form: FormData) {
  const ctx = await editor(projectId);
  const d = parse(form);
  await tx(async (t) => {
    const [n] = await t<{ id: number }[]>`INSERT INTO notes (project_id, body, tags, created_by) VALUES (${projectId}, ${d.body}, ${d.tags}, ${ctx.actorId}) RETURNING id`;
    for (const id of await validDocIds(t, projectId, d.docs)) await t`INSERT INTO note_links (note_id, node_id) VALUES (${n.id}, ${id})`;
    await audit(t, { ...ctx, objectType: "note", objectId: n.id, action: "note.create", detail: { tags: d.tags, docs: d.docs, length: d.body.length } });
  });
  revalidatePath("/p/[slug]/notes", "page");
}

export async function updateNote(projectId: number, noteId: number, form: FormData) {
  const ctx = await editor(projectId);
  const d = parse(form);
  await tx(async (t) => {
    const [before] = await t<{ body: string; tags: string[] }[]>`SELECT body, tags FROM notes WHERE id = ${noteId} AND project_id = ${projectId} FOR UPDATE`;
    if (!before) throw new HttpError(404, "不存在");
    await t`UPDATE notes SET body = ${d.body}, tags = ${d.tags}, updated_at = now() WHERE id = ${noteId}`;
    await t`DELETE FROM note_links WHERE note_id = ${noteId}`;
    for (const id of await validDocIds(t, projectId, d.docs)) await t`INSERT INTO note_links (note_id, node_id) VALUES (${noteId}, ${id})`;
    // keep the previous text in the audit trail so edits are recoverable
    await audit(t, { ...ctx, objectType: "note", objectId: noteId, action: "note.update", detail: { previous_body: before.body, previous_tags: before.tags, tags: d.tags, docs: d.docs } });
  });
  revalidatePath("/p/[slug]/notes", "page");
}

export async function archiveNote(projectId: number, noteId: number, archived: boolean) {
  const ctx = await editor(projectId);
  await tx(async (t) => {
    await t`UPDATE notes SET archived_at = ${archived ? new Date() : null} WHERE id = ${noteId} AND project_id = ${projectId}`;
    await audit(t, { ...ctx, objectType: "note", objectId: noteId, action: archived ? "note.archive" : "note.unarchive" });
  });
  revalidatePath("/p/[slug]/notes", "page");
}
