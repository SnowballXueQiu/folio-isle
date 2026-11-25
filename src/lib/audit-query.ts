import "server-only";
import { sql } from "./db";

export type AuditFilter = { projectId?: number | null; actor?: string; objectType?: string; objectId?: string; action?: string; from?: string; to?: string; page?: number };
export type AuditRow = { id: number; created_at: Date; actor: string | null; actor_name: string | null; avatar: string | null; object_type: string; object_id: string | null; action: string; detail: Record<string, unknown>; ip: string | null; project: string | null };

const PAGE = 30;

export async function queryAudit(f: AuditFilter) {
  const page = Math.max(1, f.page ?? 1);
  const day = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null);
  const from = day(f.from), to = day(f.to);
  const where = sql`true
      ${f.projectId ? sql`AND a.project_id = ${f.projectId}` : sql``}
      ${f.actor ? sql`AND lower(u.username) = lower(${f.actor.replace(/^@/, "")})` : sql``}
      ${f.objectType ? sql`AND a.object_type = ${f.objectType}` : sql``}
      ${f.objectId ? sql`AND a.object_id = ${f.objectId}` : sql``}
      ${f.action ? sql`AND a.action LIKE ${f.action.replace(/[%_]/g, "") + "%"}` : sql``}
      ${from ? sql`AND a.created_at >= ${from}::date` : sql``}
      ${to ? sql`AND a.created_at < ${to}::date + 1` : sql``}`;
  const [{ total }] = await sql<{ total: number }[]>`SELECT count(*)::int AS total FROM audit_events a LEFT JOIN users u ON u.id = a.actor_id WHERE ${where}`;
  const rows = await sql<AuditRow[]>`
    SELECT a.id, a.created_at, u.username AS actor, u.display_name AS actor_name, u.avatar_url AS avatar, a.object_type, a.object_id, a.action, a.detail, a.ip, p.slug AS project
    FROM audit_events a LEFT JOIN users u ON u.id = a.actor_id LEFT JOIN projects p ON p.id = a.project_id
    WHERE ${where}
    ORDER BY a.id DESC LIMIT ${PAGE} OFFSET ${(page - 1) * PAGE}`;
  return { rows, total, page, pages: Math.max(1, Math.ceil(total / PAGE)) };
}
