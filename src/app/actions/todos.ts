"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { tx, sql } from "@/lib/db";
import { requireUser, clientIp } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { projectRole, atLeast, HttpError } from "@/lib/perms";
import { validDocIds } from "@/lib/project-data";

const STATUS = z.enum(["todo", "doing", "done"]);
const fields = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000).default(""),
  assignee: z.string().optional(),
  due: z.string().optional(),
});

async function base(projectId: number) {
  const user = await requireUser();
  const role = await projectRole(user, projectId);
  if (!role) throw new HttpError(404, "不存在");
  return { user, role, ctx: { actorId: user.id, projectId, ip: await clientIp() } };
}

function parse(form: FormData) {
  const f = fields.parse({ title: form.get("title"), description: form.get("description") ?? "", assignee: form.get("assignee") ?? "", due: form.get("due") ?? "" });
  return {
    title: f.title,
    description: f.description,
    assignee: f.assignee ? Number(f.assignee) : null,
    due: f.due && /^\d{4}-\d{2}-\d{2}$/.test(f.due) ? f.due : null,
    docs: form.getAll("docs").map(Number).filter(Number.isSafeInteger),
  };
}

async function checkAssignee(projectId: number, assignee: number | null) {
  if (!assignee) return;
  const [m] = await sql`SELECT 1 FROM project_members WHERE project_id = ${projectId} AND user_id = ${assignee}`;
  if (!m) throw new HttpError(400, "负责人必须是项目成员");
}

export async function createTodo(projectId: number, form: FormData) {
  const { role, ctx } = await base(projectId);
  if (!atLeast(role, "editor")) throw new HttpError(403, "权限不足");
  const d = parse(form);
  await checkAssignee(projectId, d.assignee);
  await tx(async (t) => {
    const [row] = await t<{ id: number }[]>`
      INSERT INTO todos (project_id, title, description, assignee_id, due_date, created_by)
      VALUES (${projectId}, ${d.title}, ${d.description}, ${d.assignee}, ${d.due}, ${ctx.actorId}) RETURNING id`;
    for (const id of await validDocIds(t, projectId, d.docs)) await t`INSERT INTO todo_links (todo_id, node_id) VALUES (${row.id}, ${id})`;
    await audit(t, { ...ctx, objectType: "todo", objectId: row.id, action: "todo.create", detail: { title: d.title, assignee_id: d.assignee, due: d.due, docs: d.docs } });
  });
  revalidatePath("/p/[slug]/todos", "page");
}

export async function updateTodo(projectId: number, todoId: number, form: FormData) {
  const { role, ctx } = await base(projectId);
  if (!atLeast(role, "editor")) throw new HttpError(403, "权限不足");
  const d = parse(form);
  await checkAssignee(projectId, d.assignee);
  await tx(async (t) => {
    const [before] = await t`SELECT title, description, assignee_id, due_date FROM todos WHERE id = ${todoId} AND project_id = ${projectId} FOR UPDATE`;
    if (!before) throw new HttpError(404, "不存在");
    await t`UPDATE todos SET title = ${d.title}, description = ${d.description}, assignee_id = ${d.assignee}, due_date = ${d.due}, updated_at = now() WHERE id = ${todoId}`;
    await t`DELETE FROM todo_links WHERE todo_id = ${todoId}`;
    for (const id of await validDocIds(t, projectId, d.docs)) await t`INSERT INTO todo_links (todo_id, node_id) VALUES (${todoId}, ${id})`;
    await audit(t, { ...ctx, objectType: "todo", objectId: todoId, action: "todo.update", detail: { before, after: { title: d.title, assignee_id: d.assignee, due: d.due, docs: d.docs } } });
  });
  revalidatePath("/p/[slug]/todos", "page");
}

/** Editors may change any todo's status; the assignee may change their own. */
export async function setTodoStatus(projectId: number, todoId: number, status: string) {
  const { user, role, ctx } = await base(projectId);
  const s = STATUS.parse(status);
  await tx(async (t) => {
    const [todo] = await t<{ assignee_id: number | null; status: string }[]>`SELECT assignee_id, status FROM todos WHERE id = ${todoId} AND project_id = ${projectId} FOR UPDATE`;
    if (!todo) throw new HttpError(404, "不存在");
    if (!atLeast(role, "editor") && todo.assignee_id !== user.id) throw new HttpError(403, "只有负责人或编辑者可以更新状态");
    if (todo.status === s) return;
    await t`UPDATE todos SET status = ${s}, updated_at = now() WHERE id = ${todoId}`;
    await audit(t, { ...ctx, objectType: "todo", objectId: todoId, action: "todo.status", detail: { from: todo.status, to: s } });
  });
  revalidatePath("/p/[slug]/todos", "page");
}

export async function archiveTodo(projectId: number, todoId: number, archived: boolean) {
  const { role, ctx } = await base(projectId);
  if (!atLeast(role, "editor")) throw new HttpError(403, "权限不足");
  await tx(async (t) => {
    await t`UPDATE todos SET archived_at = ${archived ? new Date() : null}, updated_at = now() WHERE id = ${todoId} AND project_id = ${projectId}`;
    await audit(t, { ...ctx, objectType: "todo", objectId: todoId, action: archived ? "todo.archive" : "todo.unarchive" });
  });
  revalidatePath("/p/[slug]/todos", "page");
}
