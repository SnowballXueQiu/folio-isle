import "server-only";
import { sql } from "./db";
import type { TreeItem } from "@/components/LibraryTree";

/** Tree for the sidebar. Readers only see published docs (and containers that lead to them). */
export async function sidebarItems(libraryId: number, canEdit: boolean): Promise<TreeItem[]> {
  const rows = await sql<{ id: number; parent_id: number | null; kind: "doc" | "group"; title: string; published: boolean; dirty: boolean }[]>`
    SELECT id, parent_id, kind, title, published_version_id IS NOT NULL AS published,
           (published_version_id IS NOT NULL AND published_version_id <> head_version_id) AS dirty
    FROM nodes WHERE library_id = ${libraryId} AND deleted_at IS NULL ORDER BY position, id`;
  if (canEdit) return rows.map((r) => ({ ...r, linkable: r.kind === "doc" }));
  const byId = new Map(rows.map((r) => [r.id, r]));
  const keep = new Set<number>();
  for (const r of rows) {
    if (r.kind === "doc" && r.published) {
      let cur: typeof r | undefined = r;
      while (cur && !keep.has(cur.id)) {
        keep.add(cur.id);
        cur = cur.parent_id ? byId.get(cur.parent_id) : undefined;
      }
    }
  }
  return rows
    .filter((r) => keep.has(r.id))
    .map((r) => ({ id: r.id, parent_id: r.parent_id, kind: r.kind, title: r.title, published: r.published || r.kind === "group", linkable: r.kind === "doc" && r.published }));
}

export async function projectLibraries(projectId: number, member: boolean) {
  return sql<{ id: number; name: string }[]>`
    SELECT id, name FROM libraries WHERE project_id = ${projectId} AND deleted_at IS NULL AND (is_public OR ${member}) ORDER BY position, id`;
}
