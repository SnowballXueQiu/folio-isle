import { currentUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { projectRole } from "@/lib/perms";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response("not found", { status: 404 });
  const [f] = await sql<{ project_id: number; mime: string; data: Buffer; sha256: string; is_public: boolean | null }[]>`
    SELECT a.project_id, a.mime, a.data, a.sha256, (l.is_public AND l.deleted_at IS NULL) AS is_public
    FROM attachments a LEFT JOIN nodes n ON n.id = a.node_id LEFT JOIN libraries l ON l.id = n.library_id
    WHERE a.id = ${id}`;
  if (!f) return new Response("not found", { status: 404 });
  if (!f.is_public && !(await projectRole(await currentUser(), f.project_id))) return new Response("not found", { status: 404 });
  return new Response(f.data as unknown as BodyInit, {
    headers: {
      "content-type": f.mime,
      etag: `"${f.sha256}"`,
      "cache-control": f.is_public ? "public, max-age=31536000, immutable" : "private, max-age=31536000, immutable",
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'",
    },
  });
}
