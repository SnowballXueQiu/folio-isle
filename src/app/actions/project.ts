"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { tx, sql } from "@/lib/db";
import { requireUser, clientIp } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { projectRole, atLeast, HttpError, type Role } from "@/lib/perms";
import { randomToken, sha256 } from "@/lib/crypto";
import { deleteLibrary, restoreLibrary, revertTreeEvent, restoreNode } from "@/lib/docs";

async function ctxFor(projectId: number, need: Role) {
  const user = await requireUser();
  const role = await projectRole(user, projectId);
  if (!atLeast(role, need)) throw new HttpError(403, "权限不足");
  return { user, role: role!, ctx: { actorId: user.id, projectId, ip: await clientIp() } };
}

export type CreateProjectState = { error?: string; field?: "name" | "slug" | "description"; values?: Record<string, string> } | null;

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;

async function slugTaken(slug: string) {
  const [row] = await sql`SELECT 1 FROM projects WHERE slug = ${slug}`;
  return !!row;
}

export async function createProject(_prev: CreateProjectState, form: FormData): Promise<CreateProjectState> {
  const user = await requireUser("/p/new");
  const values = { name: String(form.get("name") ?? ""), slug: String(form.get("slug") ?? ""), description: String(form.get("description") ?? "") };
  const parsed = z
    .object({
      name: z.string().trim().min(1, "请填写项目名称").max(60, "项目名称最多 60 个字"),
      slug: z.string().trim().toLowerCase().regex(SLUG_RE, "链接标识需为 3-40 位小写字母、数字或连字符，且不能以连字符开头或结尾"),
      description: z.string().trim().max(300, "简介最多 300 字").default(""),
    })
    .safeParse(values);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { error: issue.message, field: issue.path[0] as "name" | "slug" | "description", values };
  }
  const data = parsed.data;
  if (await slugTaken(data.slug)) return { error: `「${data.slug}」已被其他项目使用，换一个吧`, field: "slug", values };
  try {
    await tx(async (t) => {
      const [p] = await t<{ id: number }[]>`INSERT INTO projects (slug, name, description, created_by) VALUES (${data.slug}, ${data.name}, ${data.description}, ${user.id}) RETURNING id`;
      await t`INSERT INTO project_members (project_id, user_id, role) VALUES (${p.id}, ${user.id}, 'admin')`;
      const [l] = await t<{ id: number }[]>`INSERT INTO libraries (project_id, name, description, created_by) VALUES (${p.id}, '默认知识库', '', ${user.id}) RETURNING id`;
      await audit(t, { projectId: p.id, actorId: user.id, objectType: "project", objectId: p.id, action: "project.create", detail: { name: data.name, slug: data.slug }, ip: await clientIp() });
      await audit(t, { projectId: p.id, actorId: user.id, objectType: "library", objectId: l.id, action: "library.create", detail: { name: "默认知识库" } });
    });
  } catch (e) {
    // lost a race on the unique slug
    if ((e as { code?: string }).code === "23505") return { error: `「${data.slug}」已被其他项目使用，换一个吧`, field: "slug", values };
    throw e;
  }
  redirect(`/p/${data.slug}`);
}

export async function updateProject(projectId: number, form: FormData) {
  const { ctx } = await ctxFor(projectId, "admin");
  const data = z.object({ name: z.string().trim().min(1).max(60), description: z.string().trim().max(300).default("") }).parse(Object.fromEntries(form));
  await tx(async (t) => {
    await t`UPDATE projects SET name = ${data.name}, description = ${data.description} WHERE id = ${projectId}`;
    await audit(t, { ...ctx, objectType: "project", objectId: projectId, action: "project.update", detail: data });
  });
  revalidatePath("/p", "layout");
}

export async function addMember(projectId: number, form: FormData) {
  const { ctx } = await ctxFor(projectId, "admin");
  const username = String(form.get("username") ?? "").trim().replace(/^@/, "");
  const role = z.enum(["admin", "editor", "member"]).parse(form.get("role"));
  const [u] = await sql<{ id: number }[]>`SELECT id FROM users WHERE lower(username) = lower(${username})`;
  if (!u) return { error: `未找到用户 @${username}（对方需先登录一次）` };
  await tx(async (t) => {
    await t`INSERT INTO project_members (project_id, user_id, role) VALUES (${projectId}, ${u.id}, ${role})
            ON CONFLICT (project_id, user_id) DO UPDATE SET role = EXCLUDED.role`;
    await audit(t, { ...ctx, objectType: "member", objectId: u.id, action: "member.add", detail: { username, role } });
  });
  revalidatePath("/p", "layout");
  return { ok: true };
}

export async function setMemberRole(projectId: number, userId: number, role: string) {
  const { ctx } = await ctxFor(projectId, "admin");
  const r = z.enum(["admin", "editor", "member", "remove"]).parse(role);
  await tx(async (t) => {
    const [{ n }] = await t<{ n: number }[]>`SELECT count(*)::int n FROM project_members WHERE project_id = ${projectId} AND role = 'admin' AND user_id <> ${userId}`;
    if (n === 0) throw new HttpError(400, "项目至少需要一位管理员");
    if (r === "remove") {
      await t`DELETE FROM project_members WHERE project_id = ${projectId} AND user_id = ${userId}`;
      await audit(t, { ...ctx, objectType: "member", objectId: userId, action: "member.remove" });
    } else {
      await t`UPDATE project_members SET role = ${r} WHERE project_id = ${projectId} AND user_id = ${userId}`;
      await audit(t, { ...ctx, objectType: "member", objectId: userId, action: "member.role", detail: { role: r } });
    }
  });
  revalidatePath("/p", "layout");
}

export async function createLibrary(projectId: number, form: FormData) {
  const { ctx } = await ctxFor(projectId, "editor");
  const data = z.object({ name: z.string().trim().min(1).max(60), description: z.string().trim().max(300).default("") }).parse(Object.fromEntries(form));
  let id = 0;
  await tx(async (t) => {
    const [{ pos }] = await t<{ pos: number }[]>`SELECT coalesce(max(position), 0) + 10 AS pos FROM libraries WHERE project_id = ${projectId}`;
    const [l] = await t<{ id: number }[]>`INSERT INTO libraries (project_id, name, description, position, created_by) VALUES (${projectId}, ${data.name}, ${data.description}, ${pos}, ${ctx.actorId}) RETURNING id`;
    id = l.id;
    await t`INSERT INTO tree_events (project_id, library_id, actor_id, action, after) VALUES (${projectId}, ${l.id}, ${ctx.actorId}, 'library.create', ${t.json(data)})`;
    await audit(t, { ...ctx, objectType: "library", objectId: l.id, action: "library.create", detail: data });
  });
  const [p] = await sql<{ slug: string }[]>`SELECT slug FROM projects WHERE id = ${projectId}`;
  redirect(`/p/${p.slug}/kb/${id}`);
}

export async function updateLibrary(projectId: number, libraryId: number, form: FormData) {
  const { ctx } = await ctxFor(projectId, "editor");
  const data = z.object({ name: z.string().trim().min(1).max(60), description: z.string().trim().max(300).default("") }).parse(Object.fromEntries(form));
  await tx(async (t) => {
    await t`UPDATE libraries SET name = ${data.name}, description = ${data.description} WHERE id = ${libraryId} AND project_id = ${projectId}`;
    await audit(t, { ...ctx, objectType: "library", objectId: libraryId, action: "library.update", detail: data });
  });
  revalidatePath("/p", "layout");
}

export async function setLibraryVisibility(projectId: number, libraryId: number, isPublic: boolean) {
  const { ctx } = await ctxFor(projectId, "admin");
  await tx(async (t) => {
    await t`UPDATE libraries SET is_public = ${isPublic} WHERE id = ${libraryId} AND project_id = ${projectId}`;
    await audit(t, { ...ctx, objectType: "library", objectId: libraryId, action: "library.visibility", detail: { is_public: isPublic } });
  });
  revalidatePath("/p", "layout");
}

export async function setLibraryGlossary(projectId: number, libraryId: number, on: boolean) {
  const { ctx } = await ctxFor(projectId, "admin");
  await tx(async (t) => {
    await t`UPDATE libraries SET is_glossary = ${on} WHERE id = ${libraryId} AND project_id = ${projectId}`;
    await audit(t, { ...ctx, objectType: "library", objectId: libraryId, action: "library.glossary", detail: { is_glossary: on } });
  });
  revalidatePath("/p", "layout");
  revalidatePath("/d", "layout");
}

export async function removeLibrary(projectId: number, libraryId: number) {
  const { ctx } = await ctxFor(projectId, "admin");
  await tx((t) => deleteLibrary(t, ctx, libraryId));
  revalidatePath("/p", "layout");
}

export async function bringBackLibrary(projectId: number, libraryId: number) {
  const { ctx } = await ctxFor(projectId, "admin");
  await tx((t) => restoreLibrary(t, ctx, libraryId));
  revalidatePath("/p", "layout");
}

export async function bringBackNode(projectId: number, nodeId: number) {
  const { ctx } = await ctxFor(projectId, "admin");
  const [n] = await sql<{ project_id: number }[]>`SELECT l.project_id FROM nodes n JOIN libraries l ON l.id = n.library_id WHERE n.id = ${nodeId}`;
  if (n?.project_id !== projectId) throw new HttpError(404, "不存在");
  await tx((t) => restoreNode(t, ctx, nodeId));
  revalidatePath("/p", "layout");
}

export async function revertEvent(projectId: number, eventId: number) {
  const { ctx } = await ctxFor(projectId, "admin");
  await tx((t) => revertTreeEvent(t, ctx, eventId));
  revalidatePath("/p", "layout");
}

export type TokenState = { token?: string; name?: string; error?: string } | null;

/** Creates a read-only MCP token; the plain token is returned once and only its hash is stored. */
export async function createProjectToken(projectId: number, _prev: TokenState, form: FormData): Promise<TokenState> {
  const { ctx, user } = await ctxFor(projectId, "admin");
  const name = String(form.get("name") ?? "").trim().slice(0, 60);
  if (!name) return { error: "请给令牌起个名字，比如「Claude Code - 我的电脑」" };
  const includePrivate = form.get("include_private") === "on";
  const [{ n }] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM project_tokens WHERE project_id = ${projectId} AND revoked_at IS NULL`;
  if (n >= 20) return { error: "每个项目最多 20 个有效令牌，请先吊销不用的" };
  const token = `fio_${randomToken(30)}`;
  await tx(async (t) => {
    const [row] = await t<{ id: number }[]>`
      INSERT INTO project_tokens (project_id, name, token_hash, token_hint, include_private, created_by)
      VALUES (${projectId}, ${name}, ${sha256(token)}, ${token.slice(-4)}, ${includePrivate}, ${user.id}) RETURNING id`;
    await audit(t, { ...ctx, objectType: "token", objectId: row.id, action: "token.create", detail: { name, include_private: includePrivate } });
  });
  revalidatePath(`/p/[slug]/settings`, "page");
  return { token, name };
}

export async function revokeProjectToken(projectId: number, tokenId: number) {
  const { ctx } = await ctxFor(projectId, "admin");
  await tx(async (t) => {
    const [row] = await t<{ name: string }[]>`UPDATE project_tokens SET revoked_at = now() WHERE id = ${tokenId} AND project_id = ${projectId} AND revoked_at IS NULL RETURNING name`;
    if (row) await audit(t, { ...ctx, objectType: "token", objectId: tokenId, action: "token.revoke", detail: { name: row.name } });
  });
  revalidatePath(`/p/[slug]/settings`, "page");
}
