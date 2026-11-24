"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function ProjectTabs({ slug, tabs }: { slug: string; tabs: { key: string; label: string }[] }) {
  const path = usePathname();
  const base = `/p/${slug}`;
  const active = (key: string) => (key === "" ? path === base || path.startsWith(`${base}/kb`) : path.startsWith(`${base}/${key}`));
  return (
    <nav className="flex gap-6 overflow-x-auto">
      {tabs.map((t) => (
        <Link key={t.key} href={t.key ? `${base}/${t.key}` : base} className="tab" aria-current={active(t.key) ? "page" : undefined}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
