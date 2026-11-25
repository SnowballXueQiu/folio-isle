"use client";
// Bottom tab bar for project pages on phones (< md). Up to four primary tabs; the rest go into a "更多" sheet.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { BookOpen, ClipboardCheck, Ellipsis, NotebookPen, ScrollText, Settings, Sparkles } from "lucide-react";
import type { ProjectTab } from "@/lib/project-tabs";
import { cx } from "@/lib/util";

const ICONS = { kb: BookOpen, todos: ClipboardCheck, notes: NotebookPen, ai: Sparkles, settings: Settings, audit: ScrollText };

export function MobileTabBar({ slug, tabs }: { slug: string; tabs: ProjectTab[] }) {
  const path = usePathname();
  const [more, setMore] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  useEffect(() => (setMore(false), setPending(null)), [path]);
  if (tabs.length < 2) return null;

  const base = `/p/${slug}`;
  const isActive = (key: string) => (key === "" ? path === base || path.startsWith(`${base}/kb`) || path.startsWith("/d/") : path.startsWith(`${base}/${key}`));
  const current = pending ?? tabs.find((t) => isActive(t.key))?.key ?? null;
  const primary = tabs.length > 5 ? tabs.slice(0, 4) : tabs;
  const extra = tabs.length > 5 ? tabs.slice(4) : [];
  const extraActive = extra.some((t) => t.key === current);
  const href = (k: string) => (k ? `${base}/${k}` : base);

  return (
    <>
      <div className="md:hidden h-[calc(3.75rem+env(safe-area-inset-bottom))]" aria-hidden />
      {more && <div className="md:hidden fixed inset-0 z-40 bg-black/25 fade-in" onClick={() => setMore(false)} />}
      <nav
        aria-label="项目导航"
        className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t hairline bg-[color-mix(in_oklab,var(--panel)_88%,transparent)] backdrop-blur-lg pb-[env(safe-area-inset-bottom)]"
      >
        {more && (
          <div className="pop-in absolute bottom-full right-2 mb-2 w-44 panel shadow-xl p-1.5" style={{ transformOrigin: "bottom right" }}>
            {extra.map((t) => {
              const Icon = ICONS[t.icon];
              return (
                <Link key={t.key} href={href(t.key)} onClick={() => setPending(t.key)} className={cx("flex items-center gap-2.5 px-3 h-11 rounded-lg text-sm", current === t.key ? "bg-[var(--panel-2)] font-medium" : "hover:bg-[var(--panel-2)]")}>
                  <Icon size={17} className="muted" />
                  {t.label}
                </Link>
              );
            })}
          </div>
        )}
        <div className="flex h-[3.75rem]">
          {primary.map((t) => {
            const Icon = ICONS[t.icon];
            const on = current === t.key;
            return (
              <Link
                key={t.key}
                href={href(t.key)}
                onClick={() => setPending(t.key)}
                aria-current={on ? "page" : undefined}
                className={cx("flex-1 flex flex-col items-center justify-center gap-1 text-[11px] transition-colors active:scale-95", on ? "text-[var(--text)] font-semibold" : "muted")}
              >
                <span className={cx("flex items-center justify-center w-12 h-7 rounded-full transition-colors", on && "bg-[var(--panel-2)]")}>
                  <Icon size={19} strokeWidth={on ? 2.2 : 1.8} />
                </span>
                {t.label}
              </Link>
            );
          })}
          {extra.length > 0 && (
            <button
              type="button"
              onClick={() => setMore((m) => !m)}
              aria-expanded={more}
              className={cx("flex-1 flex flex-col items-center justify-center gap-1 text-[11px] active:scale-95", extraActive || more ? "text-[var(--text)] font-semibold" : "muted")}
            >
              <span className={cx("flex items-center justify-center w-12 h-7 rounded-full transition-colors", (extraActive || more) && "bg-[var(--panel-2)]")}>
                <Ellipsis size={19} />
              </span>
              {extraActive ? extra.find((t) => t.key === current)?.label : "更多"}
            </button>
          )}
        </div>
      </nav>
    </>
  );
}
