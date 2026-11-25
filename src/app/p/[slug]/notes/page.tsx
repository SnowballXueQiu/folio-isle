import Link from "next/link";
import { currentUser, displayName } from "@/lib/auth";
import { sql } from "@/lib/db";
import { loadProject, requireProjectRole, atLeast } from "@/lib/perms";
import { projectDocOptions } from "@/lib/project-data";
import { createNote, updateNote, archiveNote } from "@/app/actions/notes";
import { DocPicker } from "@/components/DocPicker";
import { Avatar } from "@/components/Avatar";
import { Empty } from "@/components/Empty";
import { renderMarkdown } from "@/lib/md/render";
import { fmtDate, timeAgo } from "@/lib/util";

export const dynamic = "force-dynamic";
export const metadata = { title: "随笔" };

export default async function NotesPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ q?: string; tag?: string; archived?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const project = await loadProject(slug);
  const user = await currentUser();
  const role = await requireProjectRole(user, project);
  const canEdit = atLeast(role, "editor");
  const docs = canEdit ? await projectDocOptions(project.id) : [];
  const archived = sp.archived === "1";
  const q = (sp.q ?? "").trim().slice(0, 100);
  const notes = await sql<{ id: number; body: string; tags: string[]; created_at: Date; updated_at: Date; archived_at: Date | null; username: string; display_name: string | null; avatar_url: string | null; docs: { id: number; title: string }[] | null }[]>`
    SELECT n.id, n.body, n.tags, n.created_at, n.updated_at, n.archived_at, u.username, u.display_name, u.avatar_url,
      (SELECT json_agg(json_build_object('id', d.id, 'title', d.title)) FROM note_links nl JOIN nodes d ON d.id = nl.node_id WHERE nl.note_id = n.id AND d.deleted_at IS NULL) AS docs
    FROM notes n LEFT JOIN users u ON u.id = n.created_by
    WHERE n.project_id = ${project.id}
      AND ${archived ? sql`n.archived_at IS NOT NULL` : sql`n.archived_at IS NULL`}
      ${q ? sql`AND (n.body ILIKE ${"%" + q.replace(/[%_\\]/g, "\\$&") + "%"} OR ${q} = ANY(n.tags))` : sql``}
      ${sp.tag ? sql`AND ${sp.tag} = ANY(n.tags)` : sql``}
    ORDER BY n.created_at DESC LIMIT 200`;
  const tags = await sql<{ tag: string; n: number }[]>`
    SELECT tag, count(*)::int n FROM notes, unnest(tags) tag WHERE project_id = ${project.id} AND archived_at IS NULL GROUP BY tag ORDER BY n DESC, tag LIMIT 30`;

  return (
    <main className="mx-auto max-w-[1100px] px-4 py-8 grid lg:grid-cols-[1fr_260px] gap-8">
      <section>
        {canEdit && !archived && (
          <form action={createNote.bind(null, project.id)} className="panel p-4 space-y-3 mb-6">
            <textarea name="body" className="input" rows={3} required maxLength={20000} placeholder="记录一个想法…（支持 Markdown）" />
            <div className="flex flex-wrap items-center gap-3">
              <input name="tags" className="input h-8 text-sm max-w-xs" placeholder="标签，用空格或逗号分隔" />
              <DocPicker options={docs} />
              <span className="flex-1" />
              <button className="btn btn-primary btn-sm">发布随笔</button>
            </div>
          </form>
        )}
        {(q || sp.tag || archived) && (
          <div className="text-sm muted mb-3 flex gap-3">
            {archived && <span>已归档的随笔</span>}
            {q && <span>搜索「{q}」</span>}
            {sp.tag && <span>标签 #{sp.tag}</span>}
            <Link href={`/p/${slug}/notes`} className="underline">清除</Link>
          </div>
        )}
        {notes.length === 0 && <Empty title="还没有随笔">{canEdit ? "在上方写下第一条想法。" : "编辑者发布的随笔会显示在这里。"}</Empty>}
        <ol className="stagger relative border-l hairline ml-3 space-y-6">
          {notes.map((n) => (
            <li key={n.id} className="pl-6 relative">
              <span className="absolute -left-[5px] top-2 w-2.5 h-2.5 rounded-full bg-[var(--color-inf-cyan)] ring-4 ring-[var(--bg)]" />
              <div className="flex items-center gap-2 text-xs muted">
                <Avatar name={displayName(n)} url={n.avatar_url} size={20} />
                <span className="text-[var(--text)] font-medium">{displayName(n)}</span>
                <span title={fmtDate(n.created_at, true)}>{timeAgo(n.created_at)}</span>
                {n.updated_at.getTime() - n.created_at.getTime() > 1000 && <span>· 已编辑</span>}
              </div>
              <div className="panel p-4 mt-2">
                <div className="doc !text-[14.5px]" dangerouslySetInnerHTML={{ __html: renderMarkdown(n.body).html }} />
                {(n.tags.length > 0 || n.docs?.length) && (
                  <div className="flex flex-wrap gap-2 mt-3 text-xs">
                    {n.tags.map((t) => (
                      <Link key={t} href={`/p/${slug}/notes?tag=${encodeURIComponent(t)}`} className="chip hover:text-[var(--text)]">#{t}</Link>
                    ))}
                    {n.docs?.map((d) => (
                      <Link key={d.id} href={`/d/${d.id}`} className="chip hover:text-[var(--text)]">📄 {d.title}</Link>
                    ))}
                  </div>
                )}
                {canEdit && (
                  <details className="mt-3">
                    <summary className="text-xs muted cursor-pointer">编辑 / 归档</summary>
                    <form action={updateNote.bind(null, project.id, n.id)} className="space-y-2 mt-2">
                      <textarea name="body" className="input" rows={4} defaultValue={n.body} required maxLength={20000} />
                      <input name="tags" className="input h-8 text-sm" defaultValue={n.tags.join(" ")} />
                      <DocPicker options={docs} initial={n.docs?.map((d) => d.id) ?? []} />
                      <button className="btn btn-sm">保存</button>
                    </form>
                    <form action={archiveNote.bind(null, project.id, n.id, !n.archived_at)} className="mt-2">
                      <button className="btn btn-sm btn-ghost">{n.archived_at ? "取消归档" : "归档"}</button>
                    </form>
                  </details>
                )}
              </div>
            </li>
          ))}
        </ol>
      </section>
      <aside className="space-y-6">
        <form className="panel p-3">
          <input name="q" defaultValue={q} className="input h-8 text-sm" placeholder="搜索随笔" />
        </form>
        {tags.length > 0 && (
          <div>
            <div className="text-xs font-semibold muted mb-2">标签</div>
            <div className="flex flex-wrap gap-1.5">
              {tags.map((t) => (
                <Link key={t.tag} href={`/p/${slug}/notes?tag=${encodeURIComponent(t.tag)}`} className="chip hover:text-[var(--text)]">#{t.tag} <span className="opacity-60">{t.n}</span></Link>
              ))}
            </div>
          </div>
        )}
        <Link href={`/p/${slug}/notes${archived ? "" : "?archived=1"}`} className="text-sm muted hover:underline block">{archived ? "← 返回随笔" : "查看已归档"}</Link>
      </aside>
    </main>
  );
}
