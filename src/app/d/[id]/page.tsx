import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { History, PencilLine, Download, Quote } from "lucide-react";
import { TopBar } from "@/components/TopBar";
import { ReaderLayout } from "@/components/ReaderLayout";
import { Outline } from "@/components/Outline";
import { QuoteHighlighter } from "@/components/QuoteHighlighter";
import { XrefHover } from "@/components/XrefHover";
import { glossaryEntries, mentionsOf, entryNames } from "@/lib/xref";
import { Comments, LikeButton, type CommentView } from "@/components/Engagement";
import { PublishButtons } from "@/components/DocActions";
import { currentUser, displayName } from "@/lib/auth";
import { nodeAccess, atLeast } from "@/lib/perms";
import { sql } from "@/lib/db";
import { renderMarkdown } from "@/lib/md/render";
import { sidebarItems, projectLibraries } from "@/lib/reader";
import { fmtDate } from "@/lib/util";

export const dynamic = "force-dynamic";

type Search = { v?: string; draft?: string; q?: string };

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const acc = await nodeAccess(await currentUser(), Number((await params).id));
  return { title: acc?.canReadPublished ? acc.node.title : "文档" };
}

export default async function DocPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Search> }) {
  const id = Number((await params).id);
  const sp = await searchParams;
  const user = await currentUser();
  const acc = await nodeAccess(user, id);
  if (!acc || !acc.canReadPublished) notFound();
  const { node, library, project, role, canEdit } = acc;
  const items = await sidebarItems(library.id, canEdit);
  const libraries = await projectLibraries(project.id, !!role);

  if (node.kind === "group") {
    const kids = items.filter((i) => i.parent_id === node.id);
    return (
      <>
        <TopBar crumbs={[{ href: `/p/${project.slug}`, label: project.name }, { href: `/p/${project.slug}/kb/${library.id}`, label: library.name }]} />
        <ReaderLayout slug={project.slug} library={library} libraries={libraries} items={items} currentId={node.id} canEdit={canEdit}>
          <h1 className="text-2xl font-semibold">{node.title}</h1>
          <div className="panel divide-y divide-[var(--line)] mt-6 max-w-3xl">
            {kids.length === 0 && <div className="p-6 muted text-sm">该分组暂无内容。</div>}
            {kids.map((k) => (
              <Link key={k.id} href={`/d/${k.id}`} className="block px-4 py-3 hover:bg-[var(--panel-2)]">{k.title}</Link>
            ))}
          </div>
        </ReaderLayout>
      </>
    );
  }

  // which version to show: explicit ?v (editors, or the published one), draft (editors), else published
  let versionId = node.published_version_id;
  let mode: "published" | "draft" | "version" = "published";
  if (sp.v) {
    const v = Number(sp.v);
    if (canEdit || v === node.published_version_id) {
      versionId = v;
      mode = v === node.published_version_id ? "published" : "version";
    }
  } else if (canEdit && (sp.draft || !node.published_version_id)) {
    versionId = node.head_version_id;
    mode = "draft";
  }
  if (!versionId) notFound();
  const [version] = await sql<{ id: number; title: string; content: string; created_at: Date; author: string | null }[]>`
    SELECT v.id, v.title, v.content, v.created_at, coalesce(u.display_name, u.username) AS author
    FROM doc_versions v LEFT JOIN users u ON u.id = v.created_by WHERE v.id = ${versionId} AND v.node_id = ${id}`;
  if (!version) notFound();
  const entries = await glossaryEntries(project.id, !!role);
  const { html, headings } = renderMarkdown(version.content, { xref: entries, selfId: id });
  // an entry page lists the docs that mention it
  const [glossary] = await sql<{ is_glossary: boolean }[]>`SELECT is_glossary FROM libraries WHERE id = ${library.id}`;
  const self = entries.find((e) => e.id === id);
  const mentions =
    glossary?.is_glossary && node.published_version_id && mode === "published"
      ? await mentionsOf({ id, projectId: project.id, names: self?.names ?? entryNames(node.title) }, !!role)
      : [];
  const dirty = !!node.published_version_id && node.published_version_id !== node.head_version_id;

  const [{ likes, liked }] = await sql<{ likes: number; liked: boolean }[]>`
    SELECT count(*)::int AS likes, coalesce(bool_or(user_id = ${user?.id ?? -1}), false) AS liked FROM likes WHERE node_id = ${id}`;
  const canModerate = atLeast(role, "admin");
  const comments = (
    await sql<{ id: number; parent_id: number | null; body: string; username: string; display_name: string | null; avatar_url: string | null; created_at: Date; hidden_at: Date | null; user_id: number }[]>`
      SELECT c.id, c.parent_id, c.body, c.created_at, c.hidden_at, c.user_id, u.username, u.display_name, u.avatar_url
      FROM comments c JOIN users u ON u.id = c.user_id WHERE c.node_id = ${id} ORDER BY c.id`
  ).map<CommentView>((c) => ({
    id: c.id,
    parent_id: c.parent_id,
    body: c.hidden_at && !canModerate ? "" : c.body,
    author: displayName(c),
    avatar: c.avatar_url,
    at: fmtDate(c.created_at, true),
    hidden: !!c.hidden_at,
    mine: c.user_id === user?.id,
  }));

  return (
    <>
      <TopBar crumbs={[{ href: `/p/${project.slug}`, label: project.name }, { href: `/p/${project.slug}/kb/${library.id}`, label: library.name }]} />
      <ReaderLayout slug={project.slug} library={library} libraries={libraries} items={items} currentId={id} canEdit={canEdit} outline={<Outline headings={headings} />}>
        <article className="max-w-3xl">
          {mode !== "published" && (
            <div className="mb-5 rounded-lg border border-[#f2e4a6] bg-[#fdf8e4] dark:bg-[#2f2a12] dark:border-[#4a4218] px-4 py-2.5 text-sm flex flex-wrap items-center gap-2">
              {mode === "draft" ? (node.published_version_id ? "正在预览未发布的草稿。" : "该文档尚未发布，仅编辑者可见。") : `正在查看历史版本 #${version.id}（${fmtDate(version.created_at, true)}）。`}
              {node.published_version_id && <Link href={`/d/${id}`} className="underline">查看已发布版本</Link>}
            </div>
          )}
          {mode === "published" && canEdit && dirty && (
            <div className="mb-5 rounded-lg border hairline bg-[var(--panel)] px-4 py-2.5 text-sm">
              有未发布的修改。<Link href={`/d/${id}?draft=1`} className="underline">预览草稿</Link>
            </div>
          )}
          <h1 className="text-[2rem] leading-tight font-bold tracking-tight">{mode === "draft" ? node.title : version.title}</h1>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 mt-3 text-sm muted">
            <span>{version.author ?? "—"}</span>
            <span>{mode === "published" && node.published_at ? `发布于 ${fmtDate(node.published_at, true)}` : `保存于 ${fmtDate(version.created_at, true)}`}</span>
            {!library.is_public && <span className="chip">私有知识库</span>}
            <span className="flex-1" />
            {canEdit && (
              <>
                <PublishButtons docId={id} published={!!node.published_version_id} dirty={dirty || !node.published_version_id} />
                <Link href={`/d/${id}/edit`} className="btn btn-sm"><PencilLine size={14} /> 编辑</Link>
              </>
            )}
            {role && <Link href={`/d/${id}/history`} className="btn btn-sm"><History size={14} /> 历史</Link>}
            <details className="relative">
              <summary className="btn btn-sm list-none"><Download size={14} /> 导出</summary>
              <div className="pop-in absolute right-0 mt-1 w-48 panel p-1 shadow-lg z-10 text-sm text-[var(--text)]">
                <a className="block px-3 py-2 rounded hover:bg-[var(--panel-2)]" href={`/api/docs/${id}/export?v=${version.id}`}>Markdown (.md)</a>
                <a className="block px-3 py-2 rounded hover:bg-[var(--panel-2)]" href={`/api/docs/${id}/export?v=${version.id}&format=zip`}>含图片打包 (.zip)</a>
              </div>
            </details>
          </div>
          <div id="doc-body" className="doc mt-8" dangerouslySetInnerHTML={{ __html: html }} />
          <QuoteHighlighter containerId="doc-body" />
          <XrefHover containerId="doc-body" />
          {mentions.length > 0 && (
            <section className="mt-12">
              <h2 className="flex items-center gap-2 text-sm font-semibold muted">
                <Quote size={14} /> 提到「{node.title}」的文档 · {mentions.length}
              </h2>
              <div className="stagger mt-3 grid gap-2">
                {mentions.map((m) => (
                  <Link key={m.id} href={`/d/${m.id}`} className="panel card-hover block px-4 py-3">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-medium">{m.title}</span>
                      <span className="chip">{m.library}</span>
                    </div>
                    <p className="mt-1 text-[13px] muted line-clamp-2">{m.snippet}</p>
                  </Link>
                ))}
              </div>
            </section>
          )}
          {node.published_version_id && mode === "published" && (
            <>
              <div className="mt-12 flex items-center gap-3 border-t hairline pt-6">
                <LikeButton docId={id} liked={liked} count={likes} loggedIn={!!user} />
              </div>
              <Comments docId={id} comments={comments} loggedIn={!!user} canModerate={canModerate} />
            </>
          )}
        </article>
      </ReaderLayout>
    </>
  );
}
