import { z } from "zod";
import { handler, json } from "@/lib/api";
import { needUser, idParam } from "@/lib/guard";
import { clientIp } from "@/lib/auth";
import { nodeAccess, HttpError } from "@/lib/perms";
import { tx } from "@/lib/db";
import { audit } from "@/lib/audit";

/** Any logged-in user who can read the published document may comment or reply. */
export const POST = handler(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const id = await idParam(params);
  const user = await needUser();
  const acc = await nodeAccess(user, id);
  if (!acc?.canReadPublished || !acc.node.published_version_id) throw new HttpError(404, "不存在");
  const body = z.object({ body: z.string().trim().min(1).max(4000), parentId: z.number().int().nullable().default(null) }).parse(await req.json());
  const cid = await tx(async (t) => {
    let parentId = body.parentId;
    if (parentId) {
      const [p] = await t<{ id: number; parent_id: number | null }[]>`SELECT id, parent_id FROM comments WHERE id = ${parentId} AND node_id = ${id}`;
      if (!p) throw new HttpError(400, "回复的评论不存在");
      parentId = p.parent_id ?? p.id; // threads are one level deep
    }
    const [c] = await t<{ id: number }[]>`INSERT INTO comments (node_id, user_id, parent_id, body) VALUES (${id}, ${user.id}, ${parentId}, ${body.body}) RETURNING id`;
    await audit(t, { projectId: acc.project.id, actorId: user.id, objectType: "comment", objectId: c.id, action: "comment.create", detail: { node_id: id, parent_id: parentId }, ip: await clientIp() });
    return c.id;
  });
  return json({ id: cid });
});
