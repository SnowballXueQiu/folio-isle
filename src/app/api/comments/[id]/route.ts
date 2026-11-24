import { z } from "zod";
import { handler, json } from "@/lib/api";
import { needUser, idParam } from "@/lib/guard";
import { clientIp } from "@/lib/auth";
import { nodeAccess, HttpError, atLeast } from "@/lib/perms";
import { sql, tx } from "@/lib/db";
import { audit } from "@/lib/audit";

/** Comment moderation: project admins hide/unhide; authors may hide their own. */
export const PATCH = handler(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const id = await idParam(params);
  const user = await needUser();
  const [c] = await sql<{ node_id: number; user_id: number }[]>`SELECT node_id, user_id FROM comments WHERE id = ${id}`;
  if (!c) throw new HttpError(404, "不存在");
  const acc = await nodeAccess(user, c.node_id);
  if (!acc) throw new HttpError(404, "不存在");
  const { hidden } = z.object({ hidden: z.boolean() }).parse(await req.json());
  const isAdmin = atLeast(acc.role, "admin");
  if (!isAdmin && !(c.user_id === user.id && hidden)) throw new HttpError(403, "权限不足");
  await tx(async (t) => {
    await t`UPDATE comments SET hidden_at = ${hidden ? new Date() : null}, hidden_by = ${hidden ? user.id : null} WHERE id = ${id}`;
    await audit(t, { projectId: acc.project.id, actorId: user.id, objectType: "comment", objectId: id, action: hidden ? "comment.hide" : "comment.unhide", detail: { node_id: c.node_id, author_id: c.user_id }, ip: await clientIp() });
  });
  return json({ ok: true });
});
