"use client";
// Hover cards for cross references (auto-linked glossary entries) and manual links to other docs.
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { BookMarked, Sparkles, ArrowRight } from "lucide-react";

type Card = { id: number; title: string; library: string; glossary: boolean; summary: string; points: string[]; ai: boolean };
type State = { id: number; rect: DOMRect; card: Card | null; error?: boolean };

const cache = new Map<number, Promise<Card | null>>();
function load(id: number) {
  if (!cache.has(id)) cache.set(id, fetch(`/api/xref/${id}`).then((r) => (r.ok ? r.json() : null)).catch(() => null));
  return cache.get(id)!;
}

const docIdOf = (a: HTMLAnchorElement) => {
  if (a.dataset.xref) return Number(a.dataset.xref);
  const m = a.getAttribute("href")?.match(/^\/d\/(\d+)(?:[?#].*)?$/);
  return m ? Number(m[1]) : null;
};

export function XrefHover({ containerId }: { containerId: string }) {
  const [state, setState] = useState<State | null>(null);
  const showT = useRef<ReturnType<typeof setTimeout>>(undefined);
  const hideT = useRef<ReturnType<typeof setTimeout>>(undefined);
  const current = useRef<number | null>(null);

  useEffect(() => {
    const root = document.getElementById(containerId);
    if (!root) return;
    const over = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      const a = (e.target as Element).closest?.("a") as HTMLAnchorElement | null;
      if (!a || !root.contains(a)) return;
      const id = docIdOf(a);
      if (!id) return;
      clearTimeout(hideT.current);
      if (current.current === id) return;
      clearTimeout(showT.current);
      load(id); // start fetching while the delay runs
      showT.current = setTimeout(async () => {
        current.current = id;
        const rect = a.getBoundingClientRect();
        setState({ id, rect, card: null });
        const card = await load(id);
        if (current.current === id) setState({ id, rect, card, error: !card });
      }, 220);
    };
    const out = (e: PointerEvent) => {
      const a = (e.target as Element).closest?.("a");
      if (!a) return;
      clearTimeout(showT.current);
      hideT.current = setTimeout(() => {
        current.current = null;
        setState(null);
      }, 180);
    };
    const close = () => {
      current.current = null;
      setState(null);
    };
    root.addEventListener("pointerover", over);
    root.addEventListener("pointerout", out);
    window.addEventListener("scroll", close, { passive: true });
    return () => {
      root.removeEventListener("pointerover", over);
      root.removeEventListener("pointerout", out);
      window.removeEventListener("scroll", close);
    };
  }, [containerId]);

  if (!state || state.error) return null;
  const W = 340;
  const left = Math.max(12, Math.min(state.rect.left + state.rect.width / 2 - W / 2, window.innerWidth - W - 12));
  const below = state.rect.bottom + 230 < window.innerHeight;
  const style: React.CSSProperties = below ? { left, top: state.rect.bottom + 8, width: W } : { left, bottom: window.innerHeight - state.rect.top + 8, width: W };
  const c = state.card;
  return (
    <div
      role="tooltip"
      className="xref-card pop-in fixed z-50 panel shadow-xl p-4 text-sm"
      style={{ ...style, transformOrigin: below ? "top center" : "bottom center" }}
      onPointerEnter={() => clearTimeout(hideT.current)}
      onPointerLeave={() => {
        current.current = null;
        setState(null);
      }}
    >
      {!c ? (
        <div className="space-y-2">
          <div className="skeleton h-4 w-24" />
          <div className="skeleton h-3 w-full" />
          <div className="skeleton h-3 w-4/5" />
        </div>
      ) : (
        <>
          <div className="flex items-center gap-1.5 text-xs muted">
            <BookMarked size={13} />
            <span className="truncate">{c.library}</span>
            {c.glossary && <span className="chip !py-0">设定</span>}
            <span className="flex-1" />
            {c.ai && (
              <span className="inline-flex items-center gap-1 text-[11px]" title="由 AI 根据已发布版本生成">
                <Sparkles size={12} /> AI 摘要
              </span>
            )}
          </div>
          <div className="mt-1.5 text-base font-semibold">{c.title}</div>
          <p className="mt-1.5 leading-relaxed text-[13.5px]">{c.summary}</p>
          {c.points.length > 0 && (
            <ul className="mt-2 space-y-1 text-[13px] muted">
              {c.points.map((p, i) => (
                <li key={i} className="flex gap-1.5">
                  <span className="mt-[7px] w-1 h-1 rounded-full bg-[var(--color-inf-cyan)] shrink-0" />
                  {p}
                </li>
              ))}
            </ul>
          )}
          <Link href={`/d/${c.id}`} className="mt-3 inline-flex items-center gap-1 text-[13px] font-medium hover:underline">
            打开 <ArrowRight size={13} />
          </Link>
        </>
      )}
    </div>
  );
}
