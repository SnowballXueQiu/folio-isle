"use client";
// Sticky section nav for the settings page with scroll-spy.
import { useEffect, useState } from "react";
import { Settings2, Users, Library, Trash2, History, Plug } from "lucide-react";
import { cx } from "@/lib/util";

const ITEMS = [
  { id: "general", label: "基本信息", icon: Settings2 },
  { id: "members", label: "成员与角色", icon: Users },
  { id: "libraries", label: "知识库", icon: Library },
  { id: "mcp", label: "MCP 接入", icon: Plug },
  { id: "trash", label: "回收站", icon: Trash2 },
  { id: "tree", label: "目录历史", icon: History },
];

export function SettingsNav({ counts }: { counts: Partial<Record<string, number>> }) {
  const [active, setActive] = useState("general");
  useEffect(() => {
    const els = ITEMS.map((i) => document.getElementById(i.id)).filter(Boolean) as HTMLElement[];
    const io = new IntersectionObserver(
      (entries) => {
        const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (vis[0]) setActive(vis[0].target.id);
      },
      { rootMargin: "-80px 0px -60% 0px" }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
  return (
    <nav className="flex lg:flex-col gap-0.5 overflow-x-auto" aria-label="设置分区">
      {ITEMS.map(({ id, label, icon: Icon }) => (
        <a
          key={id}
          href={`#${id}`}
          onClick={() => setActive(id)}
          className={cx(
            "flex items-center gap-2.5 px-3 h-9 rounded-lg text-sm whitespace-nowrap",
            active === id ? "bg-[var(--panel)] border hairline font-medium text-[var(--text)] shadow-[0_1px_2px_rgb(0_0_0/0.04)]" : "muted border border-transparent hover:text-[var(--text)] hover:bg-[var(--panel-2)]"
          )}
        >
          <Icon size={16} strokeWidth={1.8} />
          <span className="flex-1">{label}</span>
          {counts[id] ? <span className="text-[11px] muted tabular-nums">{counts[id]}</span> : null}
        </a>
      ))}
    </nav>
  );
}
