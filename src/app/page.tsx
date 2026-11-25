/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { TopBar } from "@/components/TopBar";
import { Empty } from "@/components/Empty";
import { currentUser, displayName } from "@/lib/auth";
import { sql } from "@/lib/db";
import { ROLE_LABEL, type Role } from "@/lib/perms";
import { timeAgo } from "@/lib/util";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await currentUser();
  const projects = user
    ? await sql<{ slug: string; name: string; description: string; role: Role; libs: number; docs: number; todos: number }[]>`
        SELECT p.slug, p.name, p.description, coalesce(m.role, 'admin') AS role,
          (SELECT count(*)::int FROM libraries l WHERE l.project_id = p.id AND l.deleted_at IS NULL) AS libs,
          (SELECT count(*)::int FROM nodes n JOIN libraries l ON l.id = n.library_id WHERE l.project_id = p.id AND n.kind = 'doc' AND n.deleted_at IS NULL AND l.deleted_at IS NULL) AS docs,
          (SELECT count(*)::int FROM todos t WHERE t.project_id = p.id AND t.status <> 'done' AND t.archived_at IS NULL) AS todos
        FROM projects p LEFT JOIN project_members m ON m.project_id = p.id AND m.user_id = ${user.id}
        WHERE m.user_id IS NOT NULL OR ${user.is_site_admin}
        ORDER BY p.created_at DESC`
    : [];
  const publicLibs = await sql<{ id: number; name: string; description: string; slug: string; project: string; docs: number; updated: Date | null }[]>`
    SELECT l.id, l.name, l.description, p.slug, p.name AS project,
      count(n.id)::int AS docs, max(n.published_at) AS updated
    FROM libraries l JOIN projects p ON p.id = l.project_id
    LEFT JOIN nodes n ON n.library_id = l.id AND n.deleted_at IS NULL AND n.published_version_id IS NOT NULL
    WHERE l.is_public AND l.deleted_at IS NULL
    GROUP BY l.id, p.slug, p.name ORDER BY max(n.published_at) DESC NULLS LAST LIMIT 30`;
  const myTodos = user
    ? await sql<{ id: number; title: string; due_date: string | null; status: string; slug: string; project: string }[]>`
        SELECT t.id, t.title, to_char(t.due_date, 'YYYY-MM-DD') AS due_date, t.status, p.slug, p.name AS project
        FROM todos t JOIN projects p ON p.id = t.project_id
        WHERE t.assignee_id = ${user.id} AND t.status <> 'done' AND t.archived_at IS NULL
        ORDER BY t.due_date NULLS LAST, t.id LIMIT 8`
    : [];

  return (
    <>
      <TopBar />
      <main className="shell py-10">
        {user ? (
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold">你好，{displayName(user)}</h1>
              <p className="muted text-sm mt-1">你参与的项目、分配给你的待办和公开知识库都在这里。</p>
            </div>
            <Link href="/p/new" className="btn btn-primary">新建项目</Link>
          </div>
        ) : (
          <section className="panel overflow-hidden">
            <div className="grid md:grid-cols-[1.3fr_1fr]">
              <div className="p-8 md:p-12">
                <div className="chip">Inf Network</div>
                <h1 className="text-3xl md:text-4xl font-semibold mt-4 tracking-tight">言屿 · 项目式知识库</h1>
                <p className="muted mt-3 leading-relaxed max-w-md">
                  每个项目都有知识库、待办、随笔与 AI 分析。文档版本长期保留，跨库关系一目了然。
                </p>
                <div className="flex gap-2 mt-6">
                  <a href="/api/auth/login" className="btn btn-primary">使用 Inf 通行证登录</a>
                  <a href="#public" className="btn">浏览公开知识库</a>
                </div>
              </div>
              <div className="hidden md:flex items-center justify-center bg-[#1b1630] p-10">
                <img src="/logo.png" alt="" className="w-44 h-44 drop-shadow-2xl" />
              </div>
            </div>
          </section>
        )}

        {user && (
          <div className="grid lg:grid-cols-[1fr_320px] gap-6 mt-8">
            <section>
              <h2 className="text-sm font-semibold muted mb-3">我的项目</h2>
              {projects.length === 0 ? (
                <Empty title="还没有项目">新建一个项目，或请项目管理员把你加为成员。</Empty>
              ) : (
                <div className="stagger grid sm:grid-cols-2 gap-3">
                  {projects.map((p) => (
                    <Link key={p.slug} href={`/p/${p.slug}`} className="panel p-5 card-hover group">
                      <div className="flex items-start justify-between gap-2">
                        <div className="font-semibold group-hover:underline underline-offset-4">{p.name}</div>
                        <span className="chip">{ROLE_LABEL[p.role]}</span>
                      </div>
                      <p className="muted text-sm mt-1 line-clamp-2 min-h-[2.5em]">{p.description || "暂无简介"}</p>
                      <div className="flex gap-4 text-xs muted mt-4">
                        <span>{p.libs} 个知识库</span>
                        <span>{p.docs} 篇文档</span>
                        <span>{p.todos} 项待办</span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </section>
            <aside>
              <h2 className="text-sm font-semibold muted mb-3">分配给我的待办</h2>
              <div className="panel divide-y divide-[var(--line)]">
                {myTodos.length === 0 && <div className="p-4 text-sm muted">没有未完成的待办</div>}
                {myTodos.map((t) => (
                  <Link key={t.id} href={`/p/${t.slug}/todos?assignee=me`} className="block p-3 hover:bg-[var(--panel-2)]">
                    <div className="text-sm font-medium truncate">{t.title}</div>
                    <div className="text-xs muted mt-0.5">
                      {t.project} · {t.status === "doing" ? "进行中" : "待开始"}
                      {t.due_date && ` · 截止 ${t.due_date}`}
                    </div>
                  </Link>
                ))}
              </div>
            </aside>
          </div>
        )}

        <section id="public" className="mt-10">
          <h2 className="text-sm font-semibold muted mb-3">公开知识库</h2>
          {publicLibs.length === 0 ? (
            <Empty title="暂无公开知识库">项目管理员可以在知识库设置中逐库公开。</Empty>
          ) : (
            <div className="stagger grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {publicLibs.map((l) => (
                <Link key={l.id} href={`/p/${l.slug}/kb/${l.id}`} className="panel p-5 card-hover">
                  <div className="text-xs muted">{l.project}</div>
                  <div className="font-semibold mt-0.5">{l.name}</div>
                  <p className="muted text-sm mt-1 line-clamp-2">{l.description || "—"}</p>
                  <div className="text-xs muted mt-3">{l.docs} 篇文档{l.updated && ` · 更新于 ${timeAgo(l.updated)}`}</div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </main>
    </>
  );
}
