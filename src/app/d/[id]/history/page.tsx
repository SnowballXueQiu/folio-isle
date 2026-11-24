import Link from "next/link";
import { notFound } from "next/navigation";
import { TopBar } from "@/components/TopBar";
import { RollbackButton } from "@/components/HistoryActions";
import { currentUser } from "@/lib/auth";
import { nodeAccess, atLeast } from "@/lib/perms";
import { sql } from "@/lib/db";
import { renderMarkdown } from "@/lib/md/render";
import { fmtDate, cx } from "@/lib/util";

export const dynamic = "force-dynamic";
export const metadata = { title: "历史版本" };

export default async function HistoryPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ v?: string }> }) {
  const id = Number((await params).id);
  const sp = await searchParams;
  const user = await currentUser();
  const acc = await nodeAccess(user, id);
  if (!acc?.canReadPublished || !acc.role || acc.node.kind !== "doc") notFound();
  const { node, project, library, role } = acc;
  const isEditor = atLeast(role, "editor");
  const versions = await sql<{ id: number; title: string; created_at: Date; source: string; rollback_of: number | null; author: string | null; size: number }[]>`
    SELECT v.id, v.title, v.created_at, v.source, v.rollback_of, coalesce(u.display_name, u.username) AS author, octet_length(v.content) AS size
    FROM doc_versions v LEFT JOIN users u ON u.id = v.created_by
    WHERE v.node_id = ${id} ${isEditor ? sql`` : sql`AND v.id = ${node.published_version_id ?? -1}`}
    ORDER BY v.id DESC`;
  const selected = Number(sp.v) || versions[0]?.id;
  const [cur] = selected ? await sql<{ id: number; title: string; content: string }[]>`SELECT id, title, content FROM doc_versions WHERE id = ${selected} AND node_id = ${id}` : [];
  if (cur && !versions.some((v) => v.id === cur.id)) notFound();
  const html = cur ? renderMarkdown(cur.content).html : "";
  return (
    <>
      <TopBar crumbs={[{ href: `/p/${project.slug}`, label: project.name }, { href: `/p/${project.slug}/kb/${library.id}`, label: library.name }, { href: `/d/${id}`, label: node.title }, { label: "历史版本" }]} />
      <div className="mx-auto max-w-[1400px] px-4 py-8 grid md:grid-cols-[320px_1fr] gap-8">
        <aside>
          <h1 className="font-semibold">历史版本 <span className="muted font-normal text-sm">{versions.length}</span></h1>
          <p className="text-xs muted mt-1">每次内容有变化的保存都会长期保留。</p>
          <ol className="mt-4 panel divide-y divide-[var(--line)] max-h-[75vh] overflow-y-auto">
            {versions.map((v) => (
              <li key={v.id}>
                <Link href={`/d/${id}/history?v=${v.id}`} className={cx("block px-4 py-3 text-sm hover:bg-[var(--panel-2)]", v.id === selected && "bg-[var(--accent-soft)]")}>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">#{v.id}</span>
                    {v.id === node.published_version_id && <span className="chip !text-[#278a43]">已发布</span>}
                    {v.id === node.head_version_id && <span className="chip">最新草稿</span>}
                    {v.source === "rollback" && <span className="chip">回滚自 #{v.rollback_of}</span>}
                  </div>
                  <div className="text-xs muted mt-1">
                    {fmtDate(v.created_at, true)} · {v.author ?? "—"} · {(v.size / 1024).toFixed(1)} KB
                  </div>
                </Link>
              </li>
            ))}
          </ol>
        </aside>
        <section className="min-w-0">
          {cur && (
            <>
              <div className="flex flex-wrap items-center gap-2 pb-4 border-b hairline">
                <div className="font-semibold mr-auto">版本 #{cur.id} · {cur.title}</div>
                <a className="btn btn-sm" href={`/api/docs/${id}/export?v=${cur.id}`}>导出 .md</a>
                <a className="btn btn-sm" href={`/api/docs/${id}/export?v=${cur.id}&format=zip`}>导出 .zip</a>
                {atLeast(role, "admin") && cur.id !== node.head_version_id && <RollbackButton docId={id} versionId={cur.id} />}
              </div>
              <div className="doc mt-6 max-w-3xl" dangerouslySetInnerHTML={{ __html: html }} />
            </>
          )}
        </section>
      </div>
    </>
  );
}
