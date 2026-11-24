"use client";
import { useEffect, useState } from "react";
import { cx } from "@/lib/util";

export function Outline({ headings }: { headings: { id: string; text: string; depth: number }[] }) {
  const [active, setActive] = useState<string | null>(null);
  useEffect(() => {
    const els = headings.map((h) => document.getElementById(h.id)).filter(Boolean) as HTMLElement[];
    const obs = new IntersectionObserver(
      (entries) => {
        const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (vis[0]) setActive(vis[0].target.id);
      },
      { rootMargin: "-70px 0px -70% 0px" }
    );
    els.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [headings]);
  if (!headings.length) return null;
  const min = Math.min(...headings.map((h) => h.depth));
  return (
    <nav className="text-[13px]">
      <div className="text-xs font-semibold muted mb-2">本页大纲</div>
      <ul className="border-l hairline">
        {headings.map((h) => (
          <li key={h.id}>
            <a
              href={`#${h.id}`}
              className={cx("block py-1 -ml-px border-l-2 truncate hover:text-[var(--text)]", active === h.id ? "border-[var(--text)] text-[var(--text)] font-medium" : "border-transparent muted")}
              style={{ paddingLeft: 10 + (h.depth - min) * 12 }}
            >
              {h.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
