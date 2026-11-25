"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import cytoscape, { type Core } from "cytoscape";
import { ZoomIn, ZoomOut, Maximize2, X } from "lucide-react";
import { LIB_COLORS, LIB_COLORS_DARK } from "@/lib/ai/colors";
import { RELATION_LABEL, type Relation } from "@/lib/ai/prompts";
import { cx } from "@/lib/util";

export type MapDoc = { id: number; title: string; vid: number; libIndex: number; library: string };
export type MapEdge = { a: number; b: number; va: number; vb: number; relation: Exclude<Relation, "none">; direction: string | null; reason: string; evidence: { a: string[]; b: string[] } };

const EDGE_STYLE: Record<MapEdge["relation"], { color: string; style: "solid" | "dashed" | "dotted"; label: string }> = {
  supplement: { color: "#1baf7a", style: "solid", label: "补充" },
  prerequisite: { color: "#6250d6", style: "solid", label: "前置依赖（箭头指向后续）" },
  overlap: { color: "#eda100", style: "dashed", label: "内容重叠" },
  conflict: { color: "#e34948", style: "dotted", label: "冲突" },
};

export function StarMap({ docs, edges, libraries }: { docs: MapDoc[]; edges: MapEdge[]; libraries: { name: string; index: number }[] }) {
  const box = useRef<HTMLDivElement>(null);
  const cy = useRef<Core | null>(null);
  const [hiddenLibs, setHiddenLibs] = useState<Set<number>>(new Set());
  const [hiddenRel, setHiddenRel] = useState<Set<string>>(new Set());
  const [focus, setFocus] = useState<number | null>(null);
  const [selected, setSelected] = useState<MapEdge | null>(null);
  const [query, setQuery] = useState("");
  const [themeTick, setThemeTick] = useState(0);
  useEffect(() => {
    const on = () => setThemeTick((t) => t + 1);
    addEventListener("themechange", on);
    return () => removeEventListener("themechange", on);
  }, []);
  const byId = useMemo(() => new Map(docs.map((d) => [d.id, d])), [docs]);

  useEffect(() => {
    if (!box.current) return;
    const dark = document.documentElement.dataset.theme === "dark";
    const colors = dark ? LIB_COLORS_DARK : LIB_COLORS;
    const degree = new Map<number, number>();
    edges.forEach((e) => {
      degree.set(e.a, (degree.get(e.a) ?? 0) + 1);
      degree.set(e.b, (degree.get(e.b) ?? 0) + 1);
    });
    const instance = cytoscape({
      container: box.current,
      elements: [
        ...docs.map((d) => ({ data: { id: `n${d.id}`, label: d.title, color: colors[d.libIndex % colors.length], size: 18 + Math.min(4, degree.get(d.id) ?? 0) * 5, lib: d.libIndex, doc: d.id } })),
        ...edges.map((e, i) => {
          const s = EDGE_STYLE[e.relation];
          const [src, dst] = e.relation === "prerequisite" && e.direction === "b_before_a" ? [e.b, e.a] : [e.a, e.b];
          return { data: { id: `e${i}`, source: `n${src}`, target: `n${dst}`, color: s.color, style: s.style, rel: e.relation, arrow: e.relation === "prerequisite" ? "triangle" : "none", idx: i } };
        }),
      ],
      style: [
        {
          selector: "node",
          style: {
            "background-color": "data(color)",
            width: "data(size)",
            height: "data(size)",
            label: "data(label)",
            "font-size": 11,
            color: dark ? "#ebe9f3" : "#1b1630",
            "text-valign": "bottom",
            "text-margin-y": 5,
            "text-max-width": "120px",
            "text-wrap": "ellipsis",
            "border-width": 2,
            "border-color": dark ? "#1a1724" : "#ffffff",
            "text-background-color": dark ? "#1a1724" : "#ffffff",
            "text-background-opacity": 0.7,
            "text-background-padding": "1px",
          },
        },
        { selector: "edge", style: { width: 2, "line-color": "data(color)", "line-style": "data(style)" as never, "target-arrow-shape": "data(arrow)" as never, "target-arrow-color": "data(color)", "curve-style": "bezier", opacity: 0.75 } },
        { selector: "edge:selected, edge.hl", style: { width: 4, opacity: 1 } },
        { selector: "node.dim, edge.dim", style: { opacity: 0.12 } },
        { selector: "node:selected", style: { "border-color": "#4fd8de", "border-width": 4 } },
      ],
      layout: { name: "cose", animate: false, nodeRepulsion: () => 9000, idealEdgeLength: () => 90, padding: 40 } as never,
      minZoom: 0.2,
      maxZoom: 3,
      wheelSensitivity: 0.25,
    });
    // small graphs: keep labels at a readable size instead of zooming to fill the canvas
    if (instance.zoom() > 1) {
      instance.zoom(1);
      instance.center();
    }
    instance.on("tap", "edge", (ev) => setSelected(edges[ev.target.data("idx")]));
    instance.on("tap", "node", (ev) => setFocus(ev.target.data("doc")));
    instance.on("tap", (ev) => {
      if (ev.target === instance) {
        setFocus(null);
        setSelected(null);
      }
    });
    cy.current = instance;
    return () => instance.destroy();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docs, edges, themeTick]);

  // filters & focus
  useEffect(() => {
    const c = cy.current;
    if (!c) return;
    c.batch(() => {
      c.elements().removeClass("dim").style("display", "element");
      c.nodes().forEach((n) => {
        if (hiddenLibs.has(n.data("lib"))) n.style("display", "none");
      });
      c.edges().forEach((e) => {
        if (hiddenRel.has(e.data("rel"))) e.style("display", "none");
      });
      if (focus != null) {
        const n = c.getElementById(`n${focus}`);
        const keep = n.closedNeighborhood();
        c.elements().not(keep).addClass("dim");
      }
    });
  }, [hiddenLibs, hiddenRel, focus]);

  const toggle = (set: Set<number> | Set<string>, v: number | string, fn: (s: never) => void) => {
    const n = new Set(set as Set<unknown>);
    if (n.has(v)) n.delete(v);
    else n.add(v);
    fn(n as never);
  };

  const focused = focus != null ? byId.get(focus) : null;
  const focusEdges = focus != null ? edges.filter((e) => e.a === focus || e.b === focus) : [];
  const matches = query ? docs.filter((d) => d.title.toLowerCase().includes(query.toLowerCase())).slice(0, 8) : [];

  return (
    <div className="grid lg:grid-cols-[1fr_340px] gap-4">
      <div className="panel relative overflow-hidden">
        <div className="absolute z-10 left-3 top-3 right-3 flex flex-wrap items-start gap-2">
          <div className="relative">
            <input className="input h-8 text-sm w-56 shadow-sm" placeholder="聚焦文档…" value={query} onChange={(e) => setQuery(e.target.value)} />
            {matches.length > 0 && (
              <div className="pop-in absolute mt-1 w-72 panel p-1 shadow-xl">
                {matches.map((d) => (
                  <button
                    key={d.id}
                    className="block w-full text-left px-2 py-1.5 text-sm rounded hover:bg-[var(--panel-2)] truncate"
                    onClick={() => {
                      setFocus(d.id);
                      setQuery("");
                      cy.current?.animate({ center: { eles: cy.current.getElementById(`n${d.id}`) }, zoom: 1.4 } as never, { duration: 300 });
                    }}
                  >
                    {d.title} <span className="muted text-xs">· {d.library}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <span className="flex-1" />
          <div className="flex gap-1">
            <button className="btn btn-sm px-2" aria-label="放大" onClick={() => cy.current?.zoom({ level: cy.current.zoom() * 1.25, renderedPosition: { x: box.current!.clientWidth / 2, y: box.current!.clientHeight / 2 } })}><ZoomIn size={14} /></button>
            <button className="btn btn-sm px-2" aria-label="缩小" onClick={() => cy.current?.zoom({ level: cy.current.zoom() / 1.25, renderedPosition: { x: box.current!.clientWidth / 2, y: box.current!.clientHeight / 2 } })}><ZoomOut size={14} /></button>
            <button className="btn btn-sm px-2" aria-label="适应画布" onClick={() => { setFocus(null); cy.current?.fit(undefined, 40); }}><Maximize2 size={14} /></button>
          </div>
        </div>
        <div ref={box} className="h-[68vh] min-h-[460px]" />
        {docs.length === 0 && <div className="absolute inset-0 flex items-center justify-center muted text-sm">暂无已发布文档</div>}
        <div className="absolute left-3 bottom-3 flex flex-wrap gap-1.5 text-xs">
          {(Object.keys(EDGE_STYLE) as MapEdge["relation"][]).map((r) => (
            <button key={r} onClick={() => toggle(hiddenRel, r, setHiddenRel)} className={cx("chip bg-[var(--panel)] !text-[var(--text)]", hiddenRel.has(r) && "opacity-40 line-through")}>
              <svg width="18" height="6" aria-hidden><line x1="0" y1="3" x2="18" y2="3" stroke={EDGE_STYLE[r].color} strokeWidth="2" strokeDasharray={EDGE_STYLE[r].style === "dashed" ? "5 3" : EDGE_STYLE[r].style === "dotted" ? "1.5 2.5" : undefined} /></svg>
              {EDGE_STYLE[r].label}
            </button>
          ))}
        </div>
      </div>

      <aside className="space-y-4">
        <div className="panel p-4">
          <div className="text-xs font-semibold muted mb-2">知识库（点击筛选）</div>
          <div className="flex flex-wrap gap-1.5">
            {libraries.map((l) => (
              <button key={l.index} onClick={() => toggle(hiddenLibs, l.index, setHiddenLibs)} className={cx("chip !text-[var(--text)]", hiddenLibs.has(l.index) && "opacity-40 line-through")}>
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: LIB_COLORS[l.index % LIB_COLORS.length] }} />
                {l.name}
              </button>
            ))}
          </div>
          <div className="text-xs muted mt-3">{docs.length} 篇文档 · {edges.length} 条明确关系。点击节点聚焦，点击连线查看理由和原文。</div>
        </div>

        {selected && <EdgeCard edge={selected} byId={byId} onClose={() => setSelected(null)} />}

        {!selected && focused && (
          <div className="panel p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-xs muted">{focused.library}</div>
                <Link href={`/d/${focused.id}`} className="font-semibold hover:underline">{focused.title}</Link>
              </div>
              <button onClick={() => setFocus(null)} className="muted" aria-label="取消聚焦"><X size={16} /></button>
            </div>
            <div className="text-xs muted mt-3 mb-1">{focusEdges.length} 条明确关系</div>
            <ul className="space-y-1">
              {focusEdges.map((e, i) => {
                const other = byId.get(e.a === focus ? e.b : e.a);
                return (
                  <li key={i}>
                    <button className="w-full text-left text-sm px-2 py-1.5 rounded hover:bg-[var(--panel-2)] flex items-center gap-2" onClick={() => setSelected(e)}>
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: EDGE_STYLE[e.relation].color }} />
                      <span className="truncate flex-1">{other?.title}</span>
                      <span className="text-xs muted shrink-0">{RELATION_LABEL[e.relation]}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </aside>
    </div>
  );
}

export function EdgeCard({ edge, byId, onClose }: { edge: MapEdge; byId: Map<number, MapDoc>; onClose?: () => void }) {
  const a = byId.get(edge.a), b = byId.get(edge.b);
  const dir = edge.relation === "prerequisite" ? (edge.direction === "b_before_a" ? `先读「${b?.title}」` : edge.direction === "a_before_b" ? `先读「${a?.title}」` : "") : "";
  const quoteLink = (d: MapDoc | undefined, v: number, q: string) => `/d/${d?.id}?v=${v}&q=${encodeURIComponent(q)}`;
  return (
    <div className="panel p-4">
      <div className="flex items-center justify-between">
        <span className="chip !text-[var(--text)]">
          <span className="w-2 h-2 rounded-full" style={{ background: EDGE_STYLE[edge.relation].color }} />
          {RELATION_LABEL[edge.relation]}
        </span>
        {onClose && <button onClick={onClose} className="muted" aria-label="关闭"><X size={16} /></button>}
      </div>
      <p className="text-sm mt-3 leading-relaxed">{edge.reason}</p>
      {dir && <p className="text-xs muted mt-1">建议顺序：{dir}</p>}
      {[["A", a, edge.va, edge.evidence.a], ["B", b, edge.vb, edge.evidence.b]].map(([k, d, v, ev]) => (
        <div key={k as string} className="mt-4">
          <Link href={`/d/${(d as MapDoc)?.id}?v=${v}`} className="text-sm font-medium hover:underline">{(d as MapDoc)?.title}</Link>
          <ul className="mt-1.5 space-y-1.5">
            {(ev as string[]).map((q, i) => (
              <li key={i}>
                <Link href={quoteLink(d as MapDoc, v as number, q)} className="block text-xs border-l-2 border-[var(--color-inf-yellow)] pl-2 py-0.5 muted hover:text-[var(--text)]">
                  「{q}」
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
