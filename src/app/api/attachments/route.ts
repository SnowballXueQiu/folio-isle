import { randomUUID } from "node:crypto";
import { handler, json } from "@/lib/api";
import { nodeCtx } from "@/lib/guard";
import { tx } from "@/lib/db";
import { sha256 } from "@/lib/crypto";
import { audit } from "@/lib/audit";
import { HttpError } from "@/lib/perms";

const ALLOWED = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);
const MAX = 10 * 1024 * 1024;

export const POST = handler(async (req) => {
  const form = await req.formData();
  const nodeId = Number(form.get("nodeId"));
  const file = form.get("file");
  const { ctx } = await nodeCtx(nodeId);
  if (!(file instanceof File)) throw new HttpError(400, "缺少文件");
  if (!ALLOWED.has(file.type)) throw new HttpError(400, "仅支持 PNG / JPEG / GIF / WebP 图片");
  if (file.size > MAX) throw new HttpError(400, "图片不能超过 10MB");
  const data = Buffer.from(await file.arrayBuffer());
  const id = randomUUID();
  await tx(async (t) => {
    await t`INSERT INTO attachments (id, project_id, node_id, uploaded_by, filename, mime, size, sha256, data)
            VALUES (${id}, ${ctx.projectId}, ${nodeId}, ${ctx.actorId}, ${file.name.slice(0, 200)}, ${file.type}, ${file.size}, ${sha256(data)}, ${data})`;
    await audit(t, { ...ctx, objectType: "attachment", objectId: id, action: "attachment.upload", detail: { node_id: nodeId, size: file.size, mime: file.type } });
  });
  return json({ id, url: `/api/files/${id}` });
});
