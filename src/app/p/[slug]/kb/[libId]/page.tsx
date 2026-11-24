import Link from "next/link";
import { notFound } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { libraryAccess, atLeast } from "@/lib/perms";
import { sql } from "@/lib/db";
import { sidebarItems, projectLibraries } from "@/lib/reader";
import { ReaderLayout } from "@/components/ReaderLayout";
import { updateLibrary } from "@/app/actions/project";
import { timeAgo } from "@/lib/util";

export const dynamic = "force-dynamic";

export default async function LibraryPage({ params }: { params: Promise<{ slug: string; libId: string }> }) {
  const { slug, libId } = await params;
  const user = await currentUser();
  const acc = await libraryAccess(user, Number(libId));
  if (!acc || !acc.canRead || acc.project.slug !== slug) notFound();
  const { lib, project, role } = acc;
  const items = await sidebarItems(lib.id, acc.canEdit);
  const recent = await sql<{ id: number; title: string; published_at: Date | null; updated_at: Date; published: boolean }[]>`
    SELECT id, title, published_at, updated_at, published_version_id IS NOT NULL AS published FROM nodes
    WHERE library_id = ${lib.id} AND deleted_at IS NULL AND kind = 'doc' AND (published_version_id IS NOT NULL OR ${acc.canEdit})
    ORDER BY updated_at DESC LIMIT 12`;
  return (
    <ReaderLayout slug={slug} library={lib} libraries={await projectLibraries(project.id, !!role)} items={items} canEdit={acc.canEdit}>
      <div className="max-w-3xl">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold">{lib.name}</h1>
          <span className="chip">{lib.is_public ? "公开" : "私有"}</span>
        </div>
        {lib.description && <p className="muted mt-2">{lib.description}</p>}
        {acc.canEdit && (
          <details className="mt-4 text-sm">
            <summary className="muted cursor-pointer">编辑知识库信息</summary>
            <form action={updateLibrary.bind(null, project.id, lib.id)} className="panel p-4 mt-2 space-y-2">
              <input name="name" defaultValue={lib.name} className="input" required maxLength={60} />
              <input name="description" defaultValue={lib.description} className="input" maxLength={300} placeholder="简介" />
              <div className="flex items-center gap-3">
                <button className="btn btn-sm">保存</button>
                {atLeast(role, "admin") && <Link href={`/p/${slug}/settings#libraries`} className="text-xs muted hover:underline">可见性与删除 →</Link>}
              </div>
            </form>
          </details>
        )}
        <h2 className="text-sm font-semibold muted mt-8 mb-2">最近更新</h2>
        {recent.length === 0 ? (
          <div className="panel p-8 text-center muted text-sm">{acc.canEdit ? "在左侧新建第一篇文档。" : "暂无已发布文档。"}</div>
        ) : (
          <div className="panel divide-y divide-[var(--line)]">
            {recent.map((d) => (
              <Link key={d.id} href={`/d/${d.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-[var(--panel-2)]">
                <span className="truncate">{d.title}</span>
                <span className="text-xs muted shrink-0">
                  {!d.published && <span className="chip mr-2">草稿</span>}
                  {timeAgo(d.updated_at)}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </ReaderLayout>
  );
}
