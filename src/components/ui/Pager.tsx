import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cx } from "@/lib/util";

/** Numbered pagination: ‹ 1 … 4 5 6 … 20 ›. `href(p)` builds the link for page p. */
export function Pager({ page, pages, total, href, unit = "条" }: { page: number; pages: number; total?: number; href: (p: number) => string; unit?: string }) {
  if (pages <= 1) return total !== undefined && total > 0 ? <div className="text-xs muted mt-3">共 {total} {unit}</div> : null;
  const nums: (number | "…")[] = [];
  for (let p = 1; p <= pages; p++) {
    if (p === 1 || p === pages || Math.abs(p - page) <= 1) nums.push(p);
    else if (nums[nums.length - 1] !== "…") nums.push("…");
  }
  const item = "min-w-8 h-8 px-2 inline-flex items-center justify-center rounded-md text-[13px]";
  return (
    <nav className="flex items-center justify-between gap-3 mt-4" aria-label="分页">
      <span className="text-xs muted">{total !== undefined ? `共 ${total} ${unit} · ` : ""}第 {page} / {pages} 页</span>
      <div className="flex items-center gap-1">
        {page > 1 ? <Link href={href(page - 1)} className={cx(item, "hover:bg-[var(--panel-2)]")} aria-label="上一页"><ChevronLeft size={15} /></Link> : <span className={cx(item, "opacity-30")}><ChevronLeft size={15} /></span>}
        {nums.map((n, i) =>
          n === "…" ? (
            <span key={`e${i}`} className={cx(item, "muted")}>…</span>
          ) : (
            <Link key={n} href={href(n)} aria-current={n === page ? "page" : undefined} className={cx(item, n === page ? "bg-[var(--text)] text-[var(--bg)] font-medium" : "hover:bg-[var(--panel-2)]")}>
              {n}
            </Link>
          )
        )}
        {page < pages ? <Link href={href(page + 1)} className={cx(item, "hover:bg-[var(--panel-2)]")} aria-label="下一页"><ChevronRight size={15} /></Link> : <span className={cx(item, "opacity-30")}><ChevronRight size={15} /></span>}
      </div>
    </nav>
  );
}
