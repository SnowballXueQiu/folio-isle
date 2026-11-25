import Link from "next/link";
import { currentUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { loadProject, projectRole, atLeast } from "@/lib/perms";
import { createLibrary } from "@/app/actions/project";
import { Empty } from "@/components/Empty";
import { timeAgo } from "@/lib/util";
import { Globe, Lock, BookMarked } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function ProjectHome({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const project = await loadProject(slug);
  const role = await projectRole(await currentUser(), project.id);
  const libs = await sql<{ id: number; name: string; description: string; is_public: boolean; is_glossary: boolean; docs: number; published: number; updated: Date | null }[]>`
    SELECT l.id, l.name, l.description, l.is_public, l.is_glossary,
      count(n.id) FILTER (WHERE n.kind = 'doc')::int AS docs,
      count(n.id) FILTER (WHERE n.published_version_id IS NOT NULL)::int AS published,
      max(n.updated_at) AS updated
    FROM libraries l LEFT JOIN nodes n ON n.library_id = l.id AND n.deleted_at IS NULL
    WHERE l.project_id = ${project.id} AND l.deleted_at IS NULL AND (l.is_public OR ${!!role})
    GROUP BY l.id ORDER BY l.position, l.id`;
  const canEdit = atLeast(role, "editor");
  return (
    <main className="shell py-8">
      {libs.length === 0 && !canEdit ? (
        <Empty title="没有可阅读的知识库">该项目暂无公开内容。</Empty>
      ) : (
        <div className="stagger grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {libs.map((l) => (
            <Link key={l.id} href={`/p/${slug}/kb/${l.id}`} className="panel p-5 card-hover">
              <div className="flex items-center justify-between">
                <div className="font-semibold">{l.name}</div>
                {l.is_glossary && <span className="chip ml-auto mr-1.5" title="其他知识库提到这里的词条时会自动交叉引用"><BookMarked size={12} /> 设定库</span>}
                <span className="chip">
                  {l.is_public ? <Globe size={12} /> : <Lock size={12} />}
                  {l.is_public ? "公开" : "私有"}
                </span>
              </div>
              <p className="muted text-sm mt-1 line-clamp-2 min-h-[2.5em]">{l.description || "暂无简介"}</p>
              <div className="text-xs muted mt-4 flex gap-3">
                <span>{role ? `${l.docs} 篇文档 · ${l.published} 篇已发布` : `${l.published} 篇文档`}</span>
                {l.updated && <span>更新于 {timeAgo(l.updated)}</span>}
              </div>
            </Link>
          ))}
          {canEdit && (
            <form action={createLibrary.bind(null, project.id)} className="panel border-dashed p-5 space-y-2">
              <div className="font-semibold text-sm">新建知识库</div>
              <input name="name" className="input" placeholder="知识库名称" required maxLength={60} />
              <input name="description" className="input" placeholder="一句话简介（可选）" maxLength={300} />
              <button className="btn btn-sm">创建（默认私有）</button>
            </form>
          )}
        </div>
      )}
    </main>
  );
}
