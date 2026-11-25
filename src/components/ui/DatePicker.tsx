"use client";
// Calendar date picker (YYYY-MM-DD) replacing <input type="date">, whose look and behaviour differ per browser.
// Submits through a hidden input; the panel is a fixed-position portal so it is never clipped.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react";
import { cx } from "@/lib/util";

const WEEK = ["一", "二", "三", "四", "五", "六", "日"];
const WEEKDAY = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
const PANEL_W = 288;

const pad = (n: number) => String(n).padStart(2, "0");
const toIso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = (s?: string | null) => {
  const m = s && /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
};
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

export function DatePicker({
  name,
  defaultValue,
  placeholder = "选择日期",
  className,
  onChange,
  quick = "future",
}: {
  name: string;
  defaultValue?: string | null;
  placeholder?: string;
  className?: string;
  onChange?: (v: string) => void;
  /** which shortcut row to show: upcoming days (deadlines) or past ranges (filters) */
  quick?: "future" | "past";
}) {
  const [value, setValue] = useState(defaultValue ?? "");
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(() => parse(defaultValue) ?? new Date());
  const [cursor, setCursor] = useState<Date>(() => parse(defaultValue) ?? new Date());
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const selected = parse(value);
  const today = toIso(new Date());

  const set = (v: string) => {
    setValue(v);
    onChange?.(v);
  };
  const pick = (d: Date) => (set(toIso(d)), setOpen(false), btn.current?.focus());

  const place = () => {
    const r = btn.current?.getBoundingClientRect();
    if (!r) return;
    const left = Math.max(8, Math.min(r.left, window.innerWidth - PANEL_W - 8));
    const below = window.innerHeight - r.bottom;
    setPos(below < 380 && r.top > below ? { left, bottom: window.innerHeight - r.top + 6 } : { left, top: r.bottom + 6 });
  };
  useLayoutEffect(() => {
    if (!open) return;
    const start = parse(value) ?? new Date();
    setView(start);
    setCursor(start);
    place();
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
  }, [open]);

  useEffect(() => {
    if (open && pos) panel.current?.focus({ preventScroll: true });
  }, [open, pos]);

  // follow native inputs when the surrounding form is reset (React resets forms after a server action)
  useEffect(() => {
    const form = btn.current?.form;
    if (!form) return;
    const reset = () => setValue(defaultValue ?? "");
    form.addEventListener("reset", reset);
    return () => form.removeEventListener("reset", reset);
  }, [defaultValue]);

  const days = useMemo(() => {
    const first = new Date(view.getFullYear(), view.getMonth(), 1);
    const offset = (first.getDay() + 6) % 7; // Monday first
    return Array.from({ length: 42 }, (_, i) => addDays(first, i - offset));
  }, [view]);

  const move = (n: number) => {
    const c = addDays(cursor, n);
    setCursor(c);
    if (c.getMonth() !== view.getMonth() || c.getFullYear() !== view.getFullYear()) setView(c);
  };
  const onKey = (e: React.KeyboardEvent) => {
    const k: Record<string, () => void> = {
      ArrowLeft: () => move(-1),
      ArrowRight: () => move(1),
      ArrowUp: () => move(-7),
      ArrowDown: () => move(7),
      PageUp: () => setView(new Date(view.getFullYear(), view.getMonth() - 1, 1)),
      PageDown: () => setView(new Date(view.getFullYear(), view.getMonth() + 1, 1)),
      Enter: () => pick(cursor),
      Escape: () => (setOpen(false), btn.current?.focus()),
    };
    if (k[e.key]) (e.preventDefault(), k[e.key]());
  };

  const now = new Date();
  const shortcuts =
    quick === "future"
      ? [
          { label: "今天", d: now },
          { label: "明天", d: addDays(now, 1) },
          { label: "下周一", d: addDays(now, ((8 - now.getDay()) % 7) || 7) },
          { label: "一周后", d: addDays(now, 7) },
        ]
      : [
          { label: "今天", d: now },
          { label: "昨天", d: addDays(now, -1) },
          { label: "7 天前", d: addDays(now, -7) },
          { label: "30 天前", d: addDays(now, -30) },
        ];

  const label = selected ? `${selected.getFullYear()}年${selected.getMonth() + 1}月${selected.getDate()}日 · ${WEEKDAY[selected.getDay()]}` : "";
  return (
    <div className={cx("relative", className)}>
      <input type="hidden" name={name} value={value} />
      <button
        ref={btn}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={cx("input flex items-center gap-2 text-left", open && "!border-[var(--focus)]")}
      >
        <CalendarDays size={15} className="muted shrink-0" />
        <span className={cx("flex-1 truncate text-[13.5px]", !selected && "muted")}>{label || placeholder}</span>
      </button>
      {value && (
        <button type="button" aria-label="清除日期" onClick={() => set("")} className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 rounded-md muted hover:text-[var(--text)] hover:bg-[var(--panel-2)]">
          <X size={13} />
        </button>
      )}
      {open &&
        pos &&
        createPortal(
          <div
            ref={panel}
            role="dialog"
            aria-label="选择日期"
            tabIndex={-1}
            onKeyDown={onKey}
            className="pop-in fixed z-[100] panel shadow-xl p-3 outline-none select-none"
            style={{ left: pos.left, top: pos.top, bottom: pos.bottom, width: PANEL_W, transformOrigin: pos.top !== undefined ? "top left" : "bottom left" }}
          >
            <div className="flex items-center justify-between mb-2">
              <button type="button" className="icon-btn" aria-label="上个月" onClick={() => setView(new Date(view.getFullYear(), view.getMonth() - 1, 1))}>
                <ChevronLeft size={16} />
              </button>
              <div className="text-sm font-semibold tabular-nums">
                {view.getFullYear()} 年 {view.getMonth() + 1} 月
              </div>
              <button type="button" className="icon-btn" aria-label="下个月" onClick={() => setView(new Date(view.getFullYear(), view.getMonth() + 1, 1))}>
                <ChevronRight size={16} />
              </button>
            </div>
            <div className="grid grid-cols-7 text-center text-[11px] muted mb-1">
              {WEEK.map((w) => (
                <div key={w} className="h-7 leading-7">{w}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-0.5">
              {days.map((d) => {
                const iso = toIso(d);
                const inMonth = d.getMonth() === view.getMonth();
                const isSel = iso === value;
                const isCur = iso === toIso(cursor);
                return (
                  <button
                    key={iso}
                    type="button"
                    tabIndex={-1}
                    onClick={() => pick(d)}
                    onPointerEnter={() => setCursor(d)}
                    className={cx(
                      "h-9 rounded-lg text-[13px] tabular-nums relative transition-colors",
                      isSel ? "bg-[var(--text)] text-[var(--bg)] font-semibold" : isCur ? "bg-[var(--panel-2)]" : "hover:bg-[var(--panel-2)]",
                      !inMonth && !isSel && "opacity-35"
                    )}
                  >
                    {d.getDate()}
                    {iso === today && !isSel && <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-[var(--color-inf-red)]" />}
                  </button>
                );
              })}
            </div>
            <div className="flex flex-wrap gap-1 mt-3 pt-3 border-t hairline">
              {shortcuts.map((s) => (
                <button key={s.label} type="button" className="chip hover:!text-[var(--text)] hover:border-[var(--muted)] !py-0.5 cursor-pointer" onClick={() => pick(s.d)}>
                  {s.label}
                </button>
              ))}
              {value && (
                <button type="button" className="chip !py-0.5 ml-auto cursor-pointer hover:!text-[#d12c43]" onClick={() => (set(""), setOpen(false))}>
                  清除
                </button>
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
