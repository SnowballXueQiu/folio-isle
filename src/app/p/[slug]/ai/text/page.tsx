import { Select } from "@/components/ui/Select";
import Link from "next/link";
import { currentUser } from "@/lib/auth";
import { loadProject, requireProjectRole } from "@/lib/perms";
import { aiSnapshot } from "@/lib/ai/view";
import { RELATION_LABEL, RELATION_COLOR, type Relation } from "@/lib/ai/prompts";
import { EdgeCard, type MapDoc, type MapEdge } from "@/components/ai/StarMap";
import { libColor } from "@/lib/ai/colors";
import { cx } from "@/lib/util";

export const dynamic = "force-dynamic";
export const metadata = { title: "AI 分析 · 文字版" };

const PAGE = 50;

export default async function AiText({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ q?: string; rel?: string; a?: string; b?: string; page?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const project = await loadProject(slug);
  await requireProjectRole(await currentUser(), project);
  if (!project.ai_enabled) return null;
  const { docs, pairs, analyses, summaries } = await aiSnapshot(project.id);
  const byId = new Map(docs.map((d) => [d.id, d]));
  const libIds = [...new Set(docs.map((d) => d.library_id))];
  const mapDoc = (id: number): MapDoc => {
    const d = byId.get(id)!;
    return { id: d.id, title: d.title, vid: d.vid, libIndex: libIds.indexOf(d.library_id), library: d.library };
  };
  const mapById = new Map(docs.map((d) => [d.id, mapDoc(d.id)]));

  // lookup any two documents
  const qa = Number(sp.a), qb = Number(sp.b);
  const lookup = qa && qb && qa !== qb ? { a: Math.min(qa, qb), b: Math.max(qa, qb) } : null;
  const lookupResult = lookup ? pairs.find((p) => p.a === lookup.a && p.b === lookup.b) : null;

  const q = (sp.q ?? "").trim().toLowerCase();
  const rel = sp.rel ?? "explicit";
  const filtered = pairs
    .filter((p) => (rel === "all" ? true : rel === "explicit" ? p.relation !== "none" : p.relation === rel))
    .filter((p) => !q || [byId.get(p.a)?.title, byId.get(p.b)?.title, p.reason].some((s) => s?.toLowerCase().includes(q)))
    .sort((x, y) => (x.relation === "none" ? 1 : 0) - (y.relation === "none" ? 1 : 0) || x.a - y.a || x.b - y.b);
  const page = Math.max(1, Number(sp.page) || 1);
  const shown = filtered.slice((page - 1) * PAGE, page * PAGE);
  const totalPairs = (docs.length * (docs.length - 1)) / 2;
  const counts = pairs.reduce<Record<string, number>>((m, p) => ((m[p.relation] = (m[p.relation] ?? 0) + 1), m), {});
  const href = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams(Object.entries({ q: sp.q ?? null, rel: sp.rel ?? null, ...patch }).filter(([, v]) => v) as [string, string][]);
    return `/p/${slug}/ai/text?${p}`;
  };
  const proj = summaries.project?.content as { overview?: string; themes?: { title: string; doc_ids: number[] }[]; suggestions?: string[] } | undefined;

  return (
    <div className="grid xl:grid-cols-[1fr_380px] gap-6">
      <div className="space-y-6 min-w-0">
        <section className="panel p-6">
          <h2 className="font-semibold">项目总览</h2>
          {proj ? (
            <>
              <p className="mt-3 leading-relaxed text-[15px]">{proj.overview}</p>
              {!!proj.themes?.length && (
                <div className="mt-4 grid sm:grid-cols-2 gap-3">
                  {proj.themes.map((t) => (
                    <div key={t.title} className="rounded-lg border hairline p-3">
                      <div className="font-medium text-sm">{t.title}</div>
                      <div className="flex flex-wrap gap-1 mt-2">
                        {t.doc_ids.filter((id) => byId.has(id)).map((id) => (
                          <Link key={id} href={`/d/${id}`} className="chip hover:text-[var(--text)]">{byId.get(id)!.title}</Link>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {!!proj.suggestions?.length && (
                <ul className="mt-4 text-sm muted list-disc pl-5 space-y-1">{proj.suggestions.map((s) => <li key={s}>{s}</li>)}</ul>
              )}
            </>
          ) : (
            <p className="mt-2 text-sm muted">{docs.length ? "正在根据当前已发布文档生成总览…" : "暂无已发布文档。"}</p>
          )}
        </section>

        <section>
          <h2 className="font-semibold mb-3">单库总结</h2>
          <div className="grid md:grid-cols-2 gap-4">
            {libIds.map((lib, i) => {
              const s = summaries.libraries.get(lib)?.content as { summary?: string; highlights?: { doc_id: number; point: string }[]; gaps?: string[] } | undefined;
              const name = docs.find((d) => d.library_id === lib)!.library;
              return (
                <div key={lib} className="panel p-5">
                  <div className="flex items-center gap-2 font-medium">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: libColor(i) }} />
                    {name}
                    <span className="text-xs muted font-normal">{docs.filter((d) => d.library_id === lib).length} 篇</span>
                  </div>
                  {s ? (
                    <>
                      <p className="text-sm mt-2 leading-relaxed">{s.summary}</p>
                      {!!s.highlights?.length && (
                        <ul className="mt-3 space-y-1 text-sm">
                          {s.highlights.filter((h) => byId.has(h.doc_id)).map((h) => (
                            <li key={h.doc_id}><Link href={`/d/${h.doc_id}`} className="underline underline-offset-2">{byId.get(h.doc_id)!.title}</Link><span className="muted">：{h.point}</span></li>
                          ))}
                        </ul>
                      )}
                      {!!s.gaps?.length && <div className="text-xs muted mt-3">可补充：{s.gaps.join("；")}</div>}
                    </>
                  ) : (
                    <p className="text-sm muted mt-2">正在生成…</p>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        <section className="panel">
          <div className="p-4 border-b hairline flex flex-wrap items-center gap-2">
            <h2 className="font-semibold mr-2">文档对</h2>
            <span className="text-xs muted">已分析 {pairs.length}/{totalPairs}</span>
            <span className="flex-1" />
            <form className="flex gap-2">
              <input type="hidden" name="rel" value={rel} />
              <input name="q" defaultValue={sp.q} className="input h-8 text-sm w-48" placeholder="搜索标题或理由" />
            </form>
          </div>
          <div className="px-4 py-2 flex flex-wrap gap-1.5 text-xs border-b hairline">
            {[["explicit", "明确关系", pairs.filter((p) => p.relation !== "none").length], ["all", "全部", pairs.length], ...(["supplement", "prerequisite", "overlap", "conflict", "none"] as Relation[]).map((r) => [r, RELATION_LABEL[r], counts[r] ?? 0])].map(([k, l, n]) => (
              <Link key={k as string} href={href({ rel: k as string, page: null })} className={cx("px-2.5 py-1 rounded-full border hairline", rel === k ? "bg-[var(--text)] text-[var(--bg)] border-transparent" : "hover:bg-[var(--panel-2)]")}>
                {l} {n}
              </Link>
            ))}
          </div>
          <ul className="divide-y divide-[var(--line)]">
            {shown.length === 0 && <li className="p-6 text-sm muted text-center">没有符合条件的文档对</li>}
            {shown.map((p) => (
              <li key={`${p.va}-${p.vb}`} className="p-4">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <Link href={`/d/${p.a}`} className="font-medium hover:underline">{byId.get(p.a)?.title}</Link>
                  <span className="text-xs px-2 py-0.5 rounded-full border" style={{ color: RELATION_COLOR[p.relation], borderColor: RELATION_COLOR[p.relation] }}>
                    {RELATION_LABEL[p.relation]}
                  </span>
                  <Link href={`/d/${p.b}`} className="font-medium hover:underline">{byId.get(p.b)?.title}</Link>
                  <Link href={href({ a: String(p.a), b: String(p.b) })} className="ml-auto text-xs muted hover:underline">详情与原文 →</Link>
                </div>
                <p className="text-sm muted mt-1.5">{p.reason}</p>
              </li>
            ))}
          </ul>
          {filtered.length > PAGE && (
            <div className="p-3 flex justify-between text-sm border-t hairline">
              {page > 1 ? <Link className="btn btn-sm" href={href({ page: String(page - 1) })}>上一页</Link> : <span />}
              <span className="muted text-xs self-center">第 {page}/{Math.ceil(filtered.length / PAGE)} 页</span>
              {page * PAGE < filtered.length ? <Link className="btn btn-sm" href={href({ page: String(page + 1) })}>下一页</Link> : <span />}
            </div>
          )}
        </section>
      </div>

      <aside className="space-y-4">
        <form className="panel p-4 space-y-2 xl:sticky xl:top-20">
          <div className="font-semibold text-sm">查询任意两篇文档</div>
          <Select name="a" className="w-full" size="sm" required searchable defaultValue={sp.a ?? ""} placeholder="选择文档 A" options={docs.map((d) => ({ value: String(d.id), label: d.title, hint: d.library }))} />
          <Select name="b" className="w-full" size="sm" required searchable defaultValue={sp.b ?? ""} placeholder="选择文档 B" options={docs.map((d) => ({ value: String(d.id), label: d.title, hint: d.library }))} />
          <button className="btn btn-sm w-full justify-center">查看结论</button>
          {lookup && (
            <div className="pt-2">
              {lookupResult ? (
                lookupResult.relation === "none" ? (
                  <div className="rounded-lg border hairline p-3 text-sm">
                    <div className="font-medium">{RELATION_LABEL.none}</div>
                    <p className="muted mt-1">{lookupResult.reason}</p>
                  </div>
                ) : (
                  <EdgeCard edge={{ ...lookupResult, relation: lookupResult.relation as MapEdge["relation"] }} byId={mapById} />
                )
              ) : (
                <div className="text-sm muted">{byId.has(lookup.a) && byId.has(lookup.b) ? "该文档对尚在分析队列中。" : "所选文档未发布或已下架。"}</div>
              )}
            </div>
          )}
        </form>
        <div className="panel p-4 text-sm">
          <div className="font-semibold">单篇摘要</div>
          <ul className="mt-2 space-y-3 max-h-[50vh] overflow-y-auto">
            {docs.map((d) => (
              <li key={d.id}>
                <Link href={`/d/${d.id}`} className="font-medium hover:underline">{d.title}</Link>
                <p className="muted text-xs mt-0.5">{analyses.get(d.id)?.summary ?? "分析中…"}</p>
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  );
}
