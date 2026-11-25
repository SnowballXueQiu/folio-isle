"use client";
// Styled select with optional search. Works inside forms (hidden input), controlled or not.
// The popover is position:fixed so it never gets clipped by scroll containers (editor toolbar, tables).
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Search } from "lucide-react";
import { cx } from "@/lib/util";

export type SelectOption = { value: string; label: string; hint?: string; icon?: React.ReactNode; danger?: boolean; keywords?: string };

type Props = {
  options: SelectOption[];
  name?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void | boolean | Promise<void | boolean>;
  placeholder?: string;
  /** show a search box; defaults to true when there are more than 7 options */
  searchable?: boolean;
  size?: "sm" | "md";
  variant?: "field" | "ghost";
  className?: string;
  /** extra classes for the trigger (e.g. colored status pill) */
  triggerClassName?: string;
  disabled?: boolean;
  required?: boolean;
  submitOnChange?: boolean;
  "aria-label"?: string;
  align?: "start" | "end";
  minWidth?: number;
};

export function Select({
  options,
  name,
  value,
  defaultValue,
  onChange,
  placeholder = "请选择",
  searchable,
  size = "md",
  variant = "field",
  className,
  triggerClassName,
  disabled,
  required,
  submitOnChange,
  align = "start",
  minWidth,
  ...aria
}: Props) {
  const [inner, setInner] = useState(defaultValue ?? "");
  const current = value ?? inner;
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number; width: number; maxH: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const hidden = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const id = useId();
  const showSearch = searchable ?? options.length > 7;
  const selected = options.find((o) => o.value === current);

  const filtered = useMemo(() => {
    const k = q.trim().toLowerCase();
    if (!k) return options;
    return options.filter((o) => `${o.label} ${o.hint ?? ""} ${o.keywords ?? ""} ${o.value}`.toLowerCase().includes(k));
  }, [options, q]);

  const place = () => {
    const r = btn.current?.getBoundingClientRect();
    if (!r) return;
    const width = Math.max(r.width, minWidth ?? 0, 160);
    const spaceBelow = window.innerHeight - r.bottom - 12;
    const spaceAbove = r.top - 12;
    const up = spaceBelow < 220 && spaceAbove > spaceBelow;
    const left = align === "end" ? Math.max(8, r.right - width) : Math.min(r.left, window.innerWidth - width - 8);
    setPos(up ? { left, bottom: window.innerHeight - r.top + 6, width, maxH: Math.min(320, spaceAbove) } : { left, top: r.bottom + 6, width, maxH: Math.min(320, spaceBelow) });
  };

  useLayoutEffect(() => {
    if (!open) return;
    place();
    setQ("");
    setActive(Math.max(0, options.findIndex((o) => o.value === current)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (showSearch) search.current?.focus();
    else list.current?.focus();
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!btn.current?.contains(t) && !list.current?.parentElement?.contains(t)) setOpen(false);
    };
    const onScroll = (e: Event) => {
      if (list.current?.contains(e.target as Node)) return;
      const r = btn.current?.getBoundingClientRect();
      if (!r || r.bottom < 64 || r.top > window.innerHeight) return setOpen(false); // trigger scrolled away
      place();
    };
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && (setOpen(false), btn.current?.focus());
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", place);
    window.addEventListener("keydown", onEsc);
    return () => {
      window.removeEventListener("keydown", onEsc);
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", place);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  async function choose(o: SelectOption) {
    setOpen(false);
    btn.current?.focus();
    if (o.value === current) return;
    const res = await onChange?.(o.value);
    if (res === false) return; // caller vetoed (e.g. cancelled a confirmation)
    if (value === undefined) setInner(o.value);
    if (submitOnChange) setTimeout(() => hidden.current?.form?.requestSubmit(), 0);
  }

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") (e.preventDefault(), setActive((a) => Math.min(filtered.length - 1, a + 1)));
    else if (e.key === "ArrowUp") (e.preventDefault(), setActive((a) => Math.max(0, a - 1)));
    else if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[active]) choose(filtered[active]);
    } else if (e.key === "Escape") (e.preventDefault(), setOpen(false), btn.current?.focus());
    else if (e.key === "Tab") setOpen(false);
  };

  return (
    <div className={cx("relative inline-flex", className)}>
      {name && <input ref={hidden} type="hidden" name={name} value={current} required={required} />}
      <button
        ref={btn}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-label={aria["aria-label"]}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) (e.preventDefault(), setOpen(true));
        }}
        className={cx(
          "select-trigger w-full inline-flex items-center gap-2 text-left",
          variant === "field" ? "input" : "rounded-md hover:bg-[var(--panel-2)]",
          size === "sm" ? "h-8 text-[13px] px-2.5" : variant === "field" ? "" : "h-9 px-2.5 text-sm",
          open && variant === "field" && "select-open",
          disabled && "opacity-60 cursor-not-allowed",
          triggerClassName
        )}
      >
        {selected?.icon}
        <span className={cx("flex-1 truncate", !selected && "muted")}>{selected?.label ?? placeholder}</span>
        <ChevronDown size={size === "sm" ? 14 : 15} className={cx("shrink-0 opacity-60 transition-transform duration-200", open && "rotate-180")} />
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            className="pop-in fixed z-[100] panel shadow-xl p-1 flex flex-col"
            style={{ left: pos.left, top: pos.top, bottom: pos.bottom, width: pos.width, maxHeight: pos.maxH, transformOrigin: pos.top !== undefined ? "top" : "bottom" }}
          >
            {showSearch && (
              <div className="relative p-1 pb-1.5">
                <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 muted pointer-events-none" />
                <input
                  ref={search}
                  value={q}
                  onChange={(e) => (setQ(e.target.value), setActive(0))}
                  onKeyDown={onKey}
                  placeholder="搜索…"
                  className="input h-8 pl-8 text-[13px]"
                  autoComplete="off"
                  data-1p-ignore
                  data-lpignore="true"
                />
              </div>
            )}
            <div ref={list} id={id} role="listbox" tabIndex={-1} onKeyDown={onKey} className="overflow-y-auto outline-none">
              {filtered.length === 0 && <div className="px-3 py-6 text-center text-[13px] muted">没有匹配项</div>}
              {filtered.map((o, i) => (
                <div
                  key={o.value}
                  data-i={i}
                  role="option"
                  aria-selected={o.value === current}
                  onPointerEnter={() => setActive(i)}
                  onClick={() => choose(o)}
                  className={cx(
                    "flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[13.5px] cursor-pointer select-none",
                    i === active && "bg-[var(--panel-2)]",
                    o.danger && "text-[#d12c43]"
                  )}
                >
                  {o.icon && <span className="shrink-0 flex">{o.icon}</span>}
                  <span className="flex-1 min-w-0">
                    <span className="block truncate">{o.label}</span>
                    {o.hint && <span className="block text-[11.5px] muted truncate">{o.hint}</span>}
                  </span>
                  {o.value === current && <Check size={14} className="shrink-0 text-[var(--focus)]" />}
                </div>
              ))}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
