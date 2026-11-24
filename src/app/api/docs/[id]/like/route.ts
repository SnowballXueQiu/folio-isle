import { handler, json } from "@/lib/api";
import { needUser, idParam } from "@/lib/guard";
import { clientIp } from "@/lib/auth";
import { nodeAccess, HttpError } from "@/lib/perms";
import { tx } from "@/lib/db";
import { audit } from "@/lib/audit";

export const POST = handler(async (_req, { params }: { params: Promise<{ id: string }> }) => {
  const id = await idParam(params);
  const user = await needUser();
  const acc = await nodeAccess(user, id);
  if (!acc?.canReadPublished || !acc.node.published_version_id) throw new HttpError(404, "不存在");
  const result = await tx(async (t) => {
    const del = await t`DELETE FROM likes WHERE node_id = ${id} AND user_id = ${user.id} RETURNING 1`;
    if (!del.length) await t`INSERT INTO likes (node_id, user_id) VALUES (${id}, ${user.id})`;
    await audit(t, { projectId: acc.project.id, actorId: user.id, objectType: "doc", objectId: id, action: del.length ? "like.remove" : "like.add", ip: await clientIp() });
    const [{ n }] = await t<{ n: number }[]>`SELECT count(*)::int n FROM likes WHERE node_id = ${id}`;
    return { liked: !del.length, count: n };
  });
  return json(result);
});
