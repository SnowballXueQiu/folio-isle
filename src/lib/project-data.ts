import "server-only";
import { sql, type Db } from "./db";
import type { DocOption } from "@/components/DocPicker";

export async function projectDocOptions(projectId: number): Promise<DocOption[]> {
  return sql<DocOption[]>`
    SELECT n.id, n.title, l.name AS library FROM nodes n JOIN libraries l ON l.id = n.library_id
    WHERE l.project_id = ${projectId} AND n.kind = 'doc' AND n.deleted_at IS NULL AND l.deleted_at IS NULL
    ORDER BY l.position, n.title`;
}

export async function projectMembers(projectId: number) {
  return sql<{ id: number; username: string; display_name: string | null; avatar_url: string | null; role: string }[]>`
    SELECT u.id, u.username, u.display_name, u.avatar_url, m.role FROM project_members m JOIN users u ON u.id = m.user_id
    WHERE m.project_id = ${projectId} ORDER BY m.role, u.username`;
}

/** Keep only document ids that belong to the project. */
export async function validDocIds(db: Db, projectId: number, ids: number[]) {
  if (!ids.length) return [];
  const rows = await db<{ id: number }[]>`
    SELECT n.id FROM nodes n JOIN libraries l ON l.id = n.library_id WHERE l.project_id = ${projectId} AND n.id = ANY(${ids}::bigint[]) AND n.kind = 'doc'`;
  return rows.map((r) => r.id);
}
