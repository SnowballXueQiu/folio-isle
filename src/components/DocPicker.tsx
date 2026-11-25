"use client";
// Searchable multi-select for linking project documents; submits as repeated `docs` fields.
// The panel is a fixed-position portal with its own width, so it works in narrow inline slots.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, FileText, Link2, Search, X } from "lucide-react";
import { cx } from "@/lib/util";

export type DocOption = { id: number; title: string; library: string };

const WIDTH = 360;

export function DocPicker({ options, initial = [], name = "docs" }: { options: DocOption[]; initial?: number[]; name?: string }) {
  const [sel, setSel] = useState<number[]>(initial);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number; maxH: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const byId = useMemo(() => new Map(options.map((o) => [o.id, o])), [options]);
  const list = useMemo(() => {
    const k = q.trim().toLowerCase();
    return options.filter((o) => !k || `${o.title} ${o.library}`.toLowerCase().includes(k)).slice(0, 80);
  }, [options, q]);

  const place = () => {
    const r = btn.current?.getBoundingClientRect();
    if (!r) return;
    const left = Math.max(8, Math.min(r.left, window.innerWidth - WIDTH - 8));
    const below = window.innerHeight - r.bottom - 12, above = r.top - 12;
    setPos(below < 260 && above > below ? { left, bottom: window.innerHeight - r.top + 6, maxH: Math.min(380, above) } : { left, top: r.bottom + 6, maxH: Math.min(380, below) });
  };
  useLayoutEffect(() => {
    if (open) (place(), setQ(""), setActive(0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!panel.current?.contains(t) && !btn.current?.contains(t)) setOpen(false);
    };
    const scroll = (e: Event) => {
      if (panel.current?.contains(e.target as Node)) return;
      const r = btn.current?.getBoundingClientRect();
      if (!r || r.bottom < 0 || r.top > window.innerHeight) setOpen(false);
      else place();
    };
    window.addEventListener("pointerdown", down, true);
    window.addEventListener("scroll", scroll, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("pointerdown", down, true);
      window.removeEventListener("scroll", scroll, true);
      window.removeEventListener("resize", place);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const toggle = (id: number) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") (e.preventDefault(), setActive((a) => Math.min(list.length - 1, a + 1)));
    else if (e.key === "ArrowUp") (e.preventDefault(), setActive((a) => Math.max(0, a - 1)));
    else if (e.key === "Enter") (e.preventDefault(), list[active] && toggle(list[active].id));
    else if (e.key === "Escape") (e.preventDefault(), setOpen(false), btn.current?.focus());
  };

  return (
    <div className="flex flex-wrap gap-1.5 items-center min-w-0">
      {sel.map((id) => (
        <input key={id} type="hidden" name={name} value={id} />
      ))}
      {sel.map((id) => (
        <span key={id} className="chip !text-[var(--text)] !pr-1 max-w-[220px]">
          <FileText size={12} className="muted shrink-0" />
          <span className="truncate">{byId.get(id)?.title ?? `#${id}`}</span>
          <button type="button" className="muted hover:text-[#d12c43] rounded p-0.5 shrink-0" onClick={() => toggle(id)} aria-label="移除">
            <X size={12} />
          </button>
        </span>
      ))}
      <button
        ref={btn}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={cx("inline-flex items-center gap-1.5 h-7 px-2 rounded-md text-xs hover:bg-[var(--panel-2)] hover:text-[var(--text)]", open ? "bg-[var(--panel-2)] text-[var(--text)]" : "muted")}
      >
        <Link2 size={13} />
        {sel.length ? "编辑关联" : "关联文档"}
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            ref={panel}
            className="pop-in fixed z-[100] panel shadow-xl flex flex-col"
            style={{ left: pos.left, top: pos.top, bottom: pos.bottom, width: WIDTH, maxHeight: pos.maxH, transformOrigin: pos.top !== undefined ? "top left" : "bottom left" }}
          >
            <div className="relative p-2 pb-1.5 border-b hairline">
              <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 muted pointer-events-none" />
              <input
                autoFocus
                value={q}
                onChange={(e) => (setQ(e.target.value), setActive(0))}
                onKeyDown={onKey}
                placeholder="搜索文档标题或知识库"
                className="input h-8 pl-8 text-[13px]"
                autoComplete="off"
                data-1p-ignore
                data-lpignore="true"
              />
            </div>
            <div ref={listRef} role="listbox" aria-multiselectable className="overflow-y-auto p-1 min-h-0 flex-1">
              {list.length === 0 && <div className="px-3 py-8 text-center text-[13px] muted">{options.length ? "没有匹配的文档" : "项目里还没有已发布的文档"}</div>}
              {list.map((o, i) => {
                const on = sel.includes(o.id);
                return (
                  <div
                    key={o.id}
                    data-i={i}
                    role="option"
                    aria-selected={on}
                    onPointerEnter={() => setActive(i)}
                    onClick={() => toggle(o.id)}
                    className={cx("flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-[13.5px] cursor-pointer select-none", i === active && "bg-[var(--panel-2)]")}
                  >
                    <span className={cx("w-4 h-4 rounded-[5px] border flex items-center justify-center shrink-0 transition-colors", on ? "bg-[var(--text)] border-[var(--text)] text-[var(--bg)]" : "hairline bg-[var(--panel)]")}>
                      {on && <Check size={11} strokeWidth={3} />}
                    </span>
                    <span className="flex-1 min-w-0 truncate">{o.title}</span>
                    <span className="text-[11.5px] muted shrink-0 max-w-[110px] truncate">{o.library}</span>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center justify-between px-3 py-2 border-t hairline text-xs">
              <span className="muted">{sel.length ? `已选 ${sel.length} 篇` : "可多选"}</span>
              <div className="flex gap-1">
                {sel.length > 0 && (
                  <button type="button" className="btn btn-ghost btn-sm !h-7" onClick={() => setSel([])}>
                    清空
                  </button>
                )}
                <button type="button" className="btn btn-primary btn-sm !h-7" onClick={() => setOpen(false)}>
                  完成
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
