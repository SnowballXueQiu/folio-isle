import JSZip from "jszip";
import { handler } from "@/lib/api";
import { idParam } from "@/lib/guard";
import { currentUser } from "@/lib/auth";
import { nodeAccess, HttpError, atLeast } from "@/lib/perms";
import { sql } from "@/lib/db";
import { attachmentIds } from "@/lib/docs";

const EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp", "image/svg+xml": "svg" };

export const GET = handler(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const id = await idParam(params);
  const url = new URL(req.url);
  const user = await currentUser();
  const acc = await nodeAccess(user, id);
  if (!acc?.canReadPublished || acc.node.kind !== "doc") throw new HttpError(404, "不存在");
  const isEditor = atLeast(acc.role, "editor");
  const vParam = url.searchParams.get("v");
  const versionId = vParam ? Number(vParam) : acc.node.published_version_id ?? (isEditor ? acc.node.head_version_id : null);
  if (!versionId) throw new HttpError(404, "文档未发布");
  // non-editors may only export the published version
  if (!isEditor && versionId !== acc.node.published_version_id) throw new HttpError(403, "权限不足");
  const [v] = await sql<{ title: string; content: string }[]>`SELECT title, content FROM doc_versions WHERE id = ${versionId} AND node_id = ${id}`;
  if (!v) throw new HttpError(404, "版本不存在");
  const safeName = v.title.replace(/[\\/:*?"<>|]+/g, "_").slice(0, 80) || "document";
  const md = `# ${v.title}\n\n${v.content}`;
  if (url.searchParams.get("format") !== "zip") {
    return new Response(md, {
      headers: { "content-type": "text/markdown; charset=utf-8", "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(safeName)}.md` },
    });
  }
  const zip = new JSZip();
  let body = md;
  const ids = attachmentIds(v.content);
  if (ids.length) {
    const files = await sql<{ id: string; mime: string; data: Buffer }[]>`SELECT id, mime, data FROM attachments WHERE id = ANY(${ids}::uuid[]) AND project_id = ${acc.project.id}`;
    for (const f of files) {
      const name = `assets/${f.id}.${EXT[f.mime] ?? "bin"}`;
      zip.file(name, f.data);
      body = body.split(`/api/files/${f.id}`).join(name);
    }
  }
  zip.file(`${safeName}.md`, body);
  const buf = await zip.generateAsync({ type: "uint8array" });
  return new Response(buf as unknown as BodyInit, {
    headers: { "content-type": "application/zip", "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(safeName)}.zip` },
  });
});
