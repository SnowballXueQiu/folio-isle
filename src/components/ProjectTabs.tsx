"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLayoutEffect, useRef, useState } from "react";

export function ProjectTabs({ slug, tabs }: { slug: string; tabs: { key: string; label: string }[] }) {
  const path = usePathname();
  const base = `/p/${slug}`;
  const active = (key: string) => (key === "" ? path === base || path.startsWith(`${base}/kb`) : path.startsWith(`${base}/${key}`));
  const nav = useRef<HTMLElement>(null);
  const [bar, setBar] = useState<{ x: number; w: number } | null>(null);
  // optimistic: highlight the clicked tab immediately, before the server responds
  const [pending, setPending] = useState<string | null>(null);
  const current = pending ?? tabs.find((t) => active(t.key))?.key ?? null;

  useLayoutEffect(() => setPending(null), [path]);
  useLayoutEffect(() => {
    const measure = () => {
      const el = nav.current?.querySelector<HTMLElement>(`[data-tab="${current}"]`);
      setBar(el ? { x: el.offsetLeft, w: el.offsetWidth } : null);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [current, tabs.length]);

  return (
    <nav ref={nav} className="tabs-animated relative flex gap-6 overflow-x-auto">
      {tabs.map((t) => (
        <Link
          key={t.key}
          data-tab={t.key}
          href={t.key ? `${base}/${t.key}` : base}
          className="tab"
          aria-current={current === t.key ? "page" : undefined}
          onClick={() => setPending(t.key)}
        >
          {t.label}
        </Link>
      ))}
      <span className="tab-indicator" style={{ width: bar?.w ?? 0, transform: `translateX(${bar?.x ?? 0}px)`, opacity: bar ? 1 : 0 }} />
    </nav>
  );
}
