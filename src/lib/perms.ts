import "server-only";
import { notFound } from "next/navigation";
import { sql, type Db } from "./db";
import type { User } from "./auth";

export type Role = "admin" | "editor" | "member";
export const ROLE_LABEL: Record<Role, string> = { admin: "管理员", editor: "编辑者", member: "成员" };
const RANK: Record<Role, number> = { member: 1, editor: 2, admin: 3 };

export type Project = {
  id: number;
  slug: string;
  name: string;
  description: string;
  ai_enabled: boolean;
  ai_paused: boolean;
  ai_enabled_at: Date | null;
};

export async function projectRole(user: User | null, projectId: number, db: Db = sql): Promise<Role | null> {
  if (!user) return null;
  if (user.is_site_admin) return "admin";
  const [m] = await db<{ role: Role }[]>`SELECT role FROM project_members WHERE project_id = ${projectId} AND user_id = ${user.id}`;
  return m?.role ?? null;
}

export const atLeast = (role: Role | null, need: Role) => !!role && RANK[role] >= RANK[need];

export async function loadProject(slug: string): Promise<Project> {
  const [p] = await sql<Project[]>`SELECT id, slug, name, description, ai_enabled, ai_paused, ai_enabled_at FROM projects WHERE slug = ${slug}`;
  if (!p) notFound();
  return p;
}

/** Project internals (todos, notes, AI, settings) are members-only. Guests get a 404. */
export async function requireProjectRole(user: User | null, project: Project, need: Role = "member"): Promise<Role> {
  const role = await projectRole(user, project.id);
  if (!atLeast(role, need)) notFound();
  return role!;
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function assertRole(role: Role | null, need: Role) {
  if (!atLeast(role, need)) throw new HttpError(role ? 403 : 404, role ? "权限不足" : "不存在");
}

export type NodeAccess = {
  node: {
    id: number;
    library_id: number;
    parent_id: number | null;
    kind: "doc" | "group";
    title: string;
    head_version_id: number | null;
    published_version_id: number | null;
    published_at: Date | null;
    deleted_at: Date | null;
    updated_at: Date;
  };
  library: { id: number; name: string; is_public: boolean; project_id: number; deleted_at: Date | null };
  project: Project;
  role: Role | null;
  canReadPublished: boolean;
  canEdit: boolean;
};

export async function nodeAccess(user: User | null, nodeId: number, db: Db = sql): Promise<NodeAccess | null> {
  if (!Number.isSafeInteger(nodeId)) return null;
  const [row] = await db<(NodeAccess["node"] & { l_name: string; l_public: boolean; l_deleted: Date | null; project_id: number })[]>`
    SELECT n.id, n.library_id, n.parent_id, n.kind, n.title, n.head_version_id, n.published_version_id, n.published_at,
           n.deleted_at, n.updated_at, l.name AS l_name, l.is_public AS l_public, l.deleted_at AS l_deleted, l.project_id
    FROM nodes n JOIN libraries l ON l.id = n.library_id WHERE n.id = ${nodeId}`;
  if (!row) return null;
  const [project] = await db<Project[]>`SELECT id, slug, name, description, ai_enabled, ai_paused, ai_enabled_at FROM projects WHERE id = ${row.project_id}`;
  const role = await projectRole(user, project.id, db);
  const { l_name, l_public, l_deleted, project_id, ...node } = row;
  const alive = !node.deleted_at && !l_deleted;
  return {
    node,
    library: { id: node.library_id, name: l_name, is_public: l_public, project_id, deleted_at: l_deleted },
    project,
    role,
    canReadPublished: alive && (l_public || !!role),
    canEdit: alive && atLeast(role, "editor"),
  };
}

export async function libraryAccess(user: User | null, libraryId: number) {
  if (!Number.isSafeInteger(libraryId)) return null;
  const [lib] = await sql<{ id: number; project_id: number; name: string; description: string; is_public: boolean; deleted_at: Date | null }[]>`
    SELECT id, project_id, name, description, is_public, deleted_at FROM libraries WHERE id = ${libraryId}`;
  if (!lib) return null;
  const [project] = await sql<Project[]>`SELECT id, slug, name, description, ai_enabled, ai_paused, ai_enabled_at FROM projects WHERE id = ${lib.project_id}`;
  const role = await projectRole(user, project.id);
  return { lib, project, role, canRead: !lib.deleted_at && (lib.is_public || !!role), canEdit: !lib.deleted_at && atLeast(role, "editor") };
}
