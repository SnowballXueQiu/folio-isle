"use client";
import { useMemo, useState } from "react";

export type DocOption = { id: number; title: string; library: string };

/** Searchable multi-select for linking project documents; submits as repeated `docs` fields. */
export function DocPicker({ options, initial = [], name = "docs" }: { options: DocOption[]; initial?: number[]; name?: string }) {
  const [sel, setSel] = useState<number[]>(initial);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const list = useMemo(() => options.filter((o) => !q || o.title.toLowerCase().includes(q.toLowerCase())).slice(0, 50), [options, q]);
  const byId = new Map(options.map((o) => [o.id, o]));
  return (
    <div className="relative">
      {sel.map((id) => (
        <input key={id} type="hidden" name={name} value={id} />
      ))}
      <div className="flex flex-wrap gap-1.5 items-center">
        {sel.map((id) => (
          <span key={id} className="chip !text-[var(--text)]">
            {byId.get(id)?.title ?? `#${id}`}
            <button type="button" className="muted hover:text-[#d12c43]" onClick={() => setSel(sel.filter((x) => x !== id))} aria-label="移除">×</button>
          </span>
        ))}
        <button type="button" className="text-xs muted hover:underline" onClick={() => setOpen(!open)}>
          {open ? "完成" : "+ 关联文档"}
        </button>
      </div>
      {open && (
        <div className="absolute z-20 mt-1 w-full max-w-md panel p-2 shadow-xl">
          <input className="input h-8 text-sm" placeholder="搜索文档标题" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
          <div className="max-h-56 overflow-y-auto mt-1">
            {list.length === 0 && <div className="text-xs muted p-2">没有匹配的文档</div>}
            {list.map((o) => (
              <label key={o.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-[var(--panel-2)] text-sm cursor-pointer">
                <input type="checkbox" checked={sel.includes(o.id)} onChange={(e) => setSel(e.target.checked ? [...sel, o.id] : sel.filter((x) => x !== o.id))} />
                <span className="truncate flex-1">{o.title}</span>
                <span className="text-xs muted shrink-0">{o.library}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
