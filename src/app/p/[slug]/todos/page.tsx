import { DatePicker } from "@/components/ui/DatePicker";
import { Select } from "@/components/ui/Select";
import { NavSelect } from "@/components/ui/NavSelect";
import { FileText } from "lucide-react";
import Link from "next/link";
import { currentUser, displayName } from "@/lib/auth";
import { sql } from "@/lib/db";
import { loadProject, requireProjectRole, atLeast } from "@/lib/perms";
import { projectDocOptions, projectMembers } from "@/lib/project-data";
import { createTodo, updateTodo, archiveTodo } from "@/app/actions/todos";
import { StatusSelect } from "@/components/TodoBits";
import { DocPicker, type DocOption } from "@/components/DocPicker";
import { Avatar } from "@/components/Avatar";
import { Empty } from "@/components/Empty";
import { cx } from "@/lib/util";

export const dynamic = "force-dynamic";
export const metadata = { title: "待办" };

type Todo = {
  id: number; title: string; description: string; assignee_id: number | null; due_date: string | null; status: string;
  archived_at: Date | null; assignee: string | null; assignee_name: string | null; avatar: string | null; docs: { id: number; title: string }[] | null;
};

function TodoForm({ action, members, docs, todo, submit }: { action: (f: FormData) => Promise<void>; members: Awaited<ReturnType<typeof projectMembers>>; docs: DocOption[]; todo?: Todo; submit: string }) {
  return (
    <form action={action} className="space-y-3">
      <input name="title" className="input" placeholder="待办标题" required maxLength={200} defaultValue={todo?.title} />
      <textarea name="description" className="input" rows={2} placeholder="说明（可选）" maxLength={5000} defaultValue={todo?.description} />
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className="label">负责人</label>
          <Select
            name="assignee"
            className="w-full"
            defaultValue={todo?.assignee_id ? String(todo.assignee_id) : ""}
            searchable={members.length > 5}
            options={[{ value: "", label: "未分配" }, ...members.map((m) => ({ value: String(m.id), label: displayName(m), hint: `@${m.username}` }))]}
          />
        </div>
        <div>
          <label className="label">截止日期</label>
          <DatePicker name="due" defaultValue={todo?.due_date ?? ""} placeholder="无截止日期" />
        </div>
      </div>
      <DocPicker options={docs} initial={todo?.docs?.map((d) => d.id) ?? []} />
      <button className="btn btn-primary btn-sm">{submit}</button>
    </form>
  );
}

export default async function TodosPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ assignee?: string; status?: string; archived?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const project = await loadProject(slug);
  const user = (await currentUser())!;
  const role = await requireProjectRole(user, project);
  const canEdit = atLeast(role, "editor");
  const members = await projectMembers(project.id);
  const docs = canEdit ? await projectDocOptions(project.id) : [];
  const assignee = sp.assignee === "me" ? user.id : sp.assignee === "none" ? 0 : sp.assignee ? Number(sp.assignee) : null;
  const status = ["todo", "doing", "done"].includes(sp.status ?? "") ? sp.status! : null;
  const archived = sp.archived === "1";

  const todos = await sql<Todo[]>`
    SELECT t.id, t.title, t.description, t.assignee_id, to_char(t.due_date, 'YYYY-MM-DD') AS due_date, t.status, t.archived_at,
      u.username AS assignee, u.display_name AS assignee_name, u.avatar_url AS avatar,
      (SELECT json_agg(json_build_object('id', n.id, 'title', n.title)) FROM todo_links tl JOIN nodes n ON n.id = tl.node_id WHERE tl.todo_id = t.id AND n.deleted_at IS NULL) AS docs
    FROM todos t LEFT JOIN users u ON u.id = t.assignee_id
    WHERE t.project_id = ${project.id}
      AND ${archived ? sql`t.archived_at IS NOT NULL` : sql`t.archived_at IS NULL`}
      ${assignee === null ? sql`` : assignee === 0 ? sql`AND t.assignee_id IS NULL` : sql`AND t.assignee_id = ${assignee}`}
      ${status ? sql`AND t.status = ${status}` : sql``}
    ORDER BY CASE t.status WHEN 'doing' THEN 0 WHEN 'todo' THEN 1 ELSE 2 END, t.due_date NULLS LAST, t.id DESC`;

  const q = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams(Object.entries({ assignee: sp.assignee ?? null, status: sp.status ?? null, archived: sp.archived ?? null, ...patch }).filter(([, v]) => v) as [string, string][]);
    const s = p.toString();
    return `/p/${slug}/todos${s ? `?${s}` : ""}`;
  };
  const pill = (active: boolean) => cx("px-3 py-1 rounded-full text-sm border hairline", active ? "bg-[var(--text)] text-[var(--bg)] border-transparent" : "hover:bg-[var(--panel-2)]");
  const today = new Date().toISOString().slice(0, 10);

  return (
    <main className="shell py-8">
      <div className="flex flex-wrap gap-2 items-center">
        <Link href={q({ assignee: null })} className={pill(!sp.assignee)}>全部</Link>
        <Link href={q({ assignee: "me" })} className={pill(sp.assignee === "me")}>我负责的</Link>
        <Link href={q({ assignee: "none" })} className={pill(sp.assignee === "none")}>未分配</Link>
        <NavSelect
          size="sm"
          value={sp.assignee && !["me", "none"].includes(sp.assignee) ? sp.assignee : ""}
          placeholder="按成员"
          minWidth={200}
          aria-label="按成员筛选"
          triggerClassName={cx("!rounded-full !h-8", !!sp.assignee && !["me", "none"].includes(sp.assignee) && "!bg-[var(--text)] !text-[var(--bg)] !border-[var(--text)]")}
          options={members.map((m) => ({ value: String(m.id), label: displayName(m), hint: `@${m.username}`, href: q({ assignee: String(m.id) }) }))}
        />
        <span className="w-px h-5 bg-[var(--line)] mx-1" />
        {[["", "所有状态"], ["todo", "待开始"], ["doing", "进行中"], ["done", "已完成"]].map(([k, l]) => (
          <Link key={k} href={q({ status: k || null })} className={pill((sp.status ?? "") === k)}>{l}</Link>
        ))}
        <span className="flex-1" />
        <Link href={q({ archived: archived ? null : "1" })} className="text-sm muted hover:underline">{archived ? "返回进行中的待办" : "查看已归档"}</Link>
      </div>

      <div className="grid lg:grid-cols-[1fr_340px] gap-6 mt-6">
        <section className="stagger space-y-2">
          {todos.length === 0 && <Empty title="没有符合条件的待办" />}
          {todos.map((t) => {
            const overdue = t.due_date && t.due_date < today && t.status !== "done";
            return (
              <div key={t.id} className={cx("panel p-4", t.status === "done" && "opacity-70")}>
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className={cx("font-medium", t.status === "done" && "line-through")}>{t.title}</div>
                    {t.description && <p className="text-sm muted mt-1 whitespace-pre-wrap">{t.description}</p>}
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs muted">
                      <span className="flex items-center gap-1.5">
                        {t.assignee ? <><Avatar name={t.assignee_name || t.assignee} url={t.avatar} size={18} /> {t.assignee_name || t.assignee}</> : "未分配"}
                      </span>
                      {t.due_date && <span className={cx(overdue && "text-[#d12c43] font-medium")}>截止 {t.due_date}{overdue && "（已逾期）"}</span>}
                      {t.docs?.map((d) => (
                        <Link key={d.id} href={`/d/${d.id}`} className="inline-flex items-center gap-1 underline underline-offset-2 hover:text-[var(--text)]"><FileText size={12} /> {d.title}</Link>
                      ))}
                    </div>
                  </div>
                  <StatusSelect projectId={project.id} todoId={t.id} status={t.status} canChange={canEdit || t.assignee_id === user.id} />
                </div>
                {canEdit && (
                  <details className="mt-3 text-sm">
                    <summary className="muted cursor-pointer text-xs">编辑 / 归档</summary>
                    <div className="mt-3">
                      <TodoForm action={updateTodo.bind(null, project.id, t.id)} members={members} docs={docs} todo={t} submit="保存修改" />
                      <form action={archiveTodo.bind(null, project.id, t.id, !t.archived_at)} className="mt-2">
                        <button className="btn btn-sm btn-ghost">{t.archived_at ? "取消归档" : "归档"}</button>
                      </form>
                    </div>
                  </details>
                )}
              </div>
            );
          })}
        </section>
        <aside>
          {canEdit ? (
            <div className="panel p-4 lg:sticky lg:top-20">
              <div className="font-semibold text-sm mb-3">新建待办</div>
              <TodoForm action={createTodo.bind(null, project.id)} members={members} docs={docs} submit="创建" />
            </div>
          ) : (
            <div className="panel p-4 text-sm muted">你可以更新分配给自己的待办状态；创建和编辑待办需要编辑者权限。</div>
          )}
        </aside>
      </div>
    </main>
  );
}
