"use client";
// Account menu in the top bar: a fixed-position panel that opens below the header stripe.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { FolderKanban, LogOut, Settings } from "lucide-react";
import { Avatar } from "./Avatar";
import { ThemeSwitch } from "./ThemeSwitch";

export function UserMenu({ name, username, avatar, admin }: { name: string; username: string; avatar: string | null; admin: boolean }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const path = usePathname();

  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open) return;
    const place = () => {
      const header = btn.current?.closest("header")?.getBoundingClientRect();
      const r = btn.current?.getBoundingClientRect();
      if (r && header) setPos({ top: header.bottom + 6, right: Math.max(8, window.innerWidth - r.right) });
    };
    place();
    const down = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!panel.current?.contains(t) && !btn.current?.contains(t)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("pointerdown", down, true);
    window.addEventListener("keydown", key);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("pointerdown", down, true);
      window.removeEventListener("keydown", key);
      window.removeEventListener("resize", place);
    };
  }, [open]);

  const item = "flex items-center gap-2.5 w-full px-3 h-9 rounded-lg hover:bg-[var(--panel-2)] text-left";
  return (
    <>
      <button
        ref={btn}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-full pl-1 pr-1 sm:pr-2.5 py-1 hover:bg-[var(--panel-2)] aria-expanded:bg-[var(--panel-2)] transition-colors"
      >
        <Avatar name={name} url={avatar} />
        <span className="text-sm hidden sm:inline max-w-[10rem] truncate">{name}</span>
      </button>
      {open &&
        pos &&
        createPortal(
          <div ref={panel} role="menu" className="pop-in fixed z-[90] w-60 panel p-1.5 shadow-xl text-sm" style={{ top: pos.top, right: pos.right, transformOrigin: "top right" }}>
            <div className="flex items-center gap-2.5 px-2.5 py-2">
              <Avatar name={name} url={avatar} size={34} />
              <div className="min-w-0">
                <div className="font-medium truncate">{name}</div>
                <div className="text-xs muted truncate">@{username}</div>
              </div>
            </div>
            <div className="h-px bg-[var(--line)] my-1" />
            <Link href="/" className={item} role="menuitem"><FolderKanban size={15} className="muted" />我的项目</Link>
            {admin && <Link href="/admin" className={item} role="menuitem"><Settings size={15} className="muted" />站点设置</Link>}
            <div className="h-px bg-[var(--line)] my-1" />
            <div className="px-3 pt-1.5 pb-1 text-xs muted">外观</div>
            <div className="px-2 pb-1.5"><ThemeSwitch /></div>
            <div className="h-px bg-[var(--line)] my-1" />
            <form action="/api/auth/logout" method="post">
              <button className={`${item} text-[#d12c43]`} role="menuitem"><LogOut size={15} />退出登录</button>
            </form>
          </div>,
          document.body
        )}
    </>
  );
}
