"use client";
// Light / dark / system segmented switch. The choice lives in localStorage; THEME_SCRIPT applies it before paint.
import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { cx } from "@/lib/util";

type Pref = "light" | "dark" | "system";
const OPTS: { id: Pref; label: string; Icon: typeof Sun }[] = [
  { id: "light", label: "浅色", Icon: Sun },
  { id: "dark", label: "深色", Icon: Moon },
  { id: "system", label: "系统", Icon: Monitor },
];

export function applyTheme(pref: Pref) {
  const d = document.documentElement;
  localStorage.setItem("theme", pref);
  const dark = pref === "dark" || (pref === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  d.classList.add("theme-anim");
  d.dataset.theme = dark ? "dark" : "light";
  d.dataset.themePref = pref;
  window.dispatchEvent(new Event("themechange"));
  setTimeout(() => d.classList.remove("theme-anim"), 320);
}

export function ThemeSwitch() {
  const [pref, setPref] = useState<Pref>("system");
  useEffect(() => {
    const sync = () => setPref((document.documentElement.dataset.themePref as Pref) || "system");
    sync();
    addEventListener("themechange", sync);
    return () => removeEventListener("themechange", sync);
  }, []);
  return (
    <div role="radiogroup" aria-label="外观" className="grid grid-cols-3 gap-0.5 p-0.5 rounded-lg bg-[var(--panel-2)]">
      {OPTS.map(({ id, label, Icon }) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={pref === id}
          onClick={() => (setPref(id), applyTheme(id))}
          className={cx("flex items-center justify-center gap-1 h-7 rounded-md text-xs transition-colors", pref === id ? "bg-[var(--panel)] shadow-sm text-[var(--text)] font-medium" : "muted hover:text-[var(--text)]")}
        >
          <Icon size={13} />
          {label}
        </button>
      ))}
    </div>
  );
}

/** Compact icon button for the top bar when signed out: cycles light → dark → system. */
export function ThemeToggle() {
  const [pref, setPref] = useState<Pref>("system");
  useEffect(() => setPref((document.documentElement.dataset.themePref as Pref) || "system"), []);
  const next: Record<Pref, Pref> = { light: "dark", dark: "system", system: "light" };
  const Cur = OPTS.find((o) => o.id === pref)!;
  return (
    <button type="button" className="btn btn-ghost btn-sm !px-2" title={`外观：${Cur.label}`} aria-label="切换外观" onClick={() => { const n = next[pref]; setPref(n); applyTheme(n); }}>
      <Cur.Icon size={15} />
    </button>
  );
}
