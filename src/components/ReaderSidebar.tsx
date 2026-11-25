"use client";
// Library sidebar: a sticky column on md+, a slide-in drawer opened from a compact bar on phones.
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { PanelLeftOpen, X } from "lucide-react";
import { cx } from "@/lib/util";

export function ReaderSidebar({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.documentElement.style.overflow = "hidden";
    addEventListener("keydown", key);
    return () => {
      document.documentElement.style.overflow = "";
      removeEventListener("keydown", key);
    };
  }, [open]);

  return (
    <>
      {/* phone: compact bar that opens the drawer */}
      <div className="md:hidden sticky top-[59px] z-20 -mx-4 px-4 py-2 bg-[color-mix(in_oklab,var(--bg)_90%,transparent)] backdrop-blur border-b hairline">
        <button type="button" onClick={() => setOpen(true)} className="flex items-center gap-2 h-9 px-3 -ml-1 rounded-lg text-sm hover:bg-[var(--panel-2)] max-w-full">
          <PanelLeftOpen size={16} className="muted shrink-0" />
          <span className="muted shrink-0">目录</span>
          <span className="truncate font-medium">{title}</span>
        </button>
      </div>
      <div className={cx("md:hidden fixed inset-0 z-50 bg-black/30 transition-opacity", open ? "opacity-100" : "opacity-0 pointer-events-none")} onClick={() => setOpen(false)} aria-hidden />
      <aside
        className={cx(
          // drawer on phones
          "fixed inset-y-0 left-0 z-50 w-[86vw] max-w-[340px] bg-[var(--panel)] shadow-2xl overflow-y-auto px-4 pt-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] transition-transform duration-300 ease-[cubic-bezier(.2,.8,.2,1)]",
          open ? "translate-x-0" : "-translate-x-full",
          // column on md+
          "md:z-auto md:bottom-auto md:w-auto md:max-w-none md:translate-x-0 md:bg-transparent md:shadow-none md:transition-none md:sticky md:top-[60px] md:h-[calc(100vh-60px)] md:py-6 md:px-0 md:pr-4 md:border-r hairline"
        )}
      >
        <div className="md:hidden flex justify-end -mt-1 mb-1">
          <button type="button" className="icon-btn" aria-label="关闭目录" onClick={() => setOpen(false)}>
            <X size={17} />
          </button>
        </div>
        {children}
      </aside>
    </>
  );
}
