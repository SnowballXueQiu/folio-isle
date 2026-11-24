"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/lib/util";

export function AiTabs({ slug }: { slug: string }) {
  const p = usePathname();
  const base = `/p/${slug}/ai`;
  const tabs = [
    [base, "星图"],
    [`${base}/text`, "文字版"],
    [`${base}/tasks`, "任务"],
  ];
  return (
    <div className="inline-flex p-1 rounded-xl bg-[var(--panel-2)] border hairline">
      {tabs.map(([href, label]) => (
        <Link key={href} href={href} className={cx("px-4 py-1.5 text-sm rounded-lg", p === href ? "bg-[var(--panel)] shadow-sm font-medium" : "muted hover:text-[var(--text)]")}>
          {label}
        </Link>
      ))}
    </div>
  );
}
