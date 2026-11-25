/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { currentUser, displayName } from "@/lib/auth";
import { UserMenu } from "./UserMenu";
import { ThemeToggle } from "./ThemeSwitch";

export async function TopBar({ crumbs = [] }: { crumbs?: { href?: string; label: string }[] }) {
  const user = await currentUser();
  return (
    <header className="sticky top-0 z-30 backdrop-blur bg-[color-mix(in_oklab,var(--bg)_85%,transparent)] border-b hairline">
      <div className="shell h-14 flex items-center gap-3">
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <img src="/logo.png" alt="Inf Network" className="w-7 h-7" />
          <span className="font-semibold tracking-tight">言屿</span>
          <span className="hidden sm:inline text-xs muted">Folio Isle</span>
        </Link>
        {crumbs.length > 0 && (
          <nav className="flex items-center gap-1.5 text-sm min-w-0 overflow-hidden">
            {crumbs.map((c, i) => (
              <span key={i} className="flex items-center gap-1.5 min-w-0">
                <span className="muted">/</span>
                {c.href ? (
                  <Link href={c.href} className="truncate hover:underline">{c.label}</Link>
                ) : (
                  <span className="truncate muted">{c.label}</span>
                )}
              </span>
            ))}
          </nav>
        )}
        <div className="ml-auto flex items-center gap-2">
          {user ? (
            <>
              {user.is_site_admin && <Link href="/admin" className="btn btn-ghost btn-sm hidden md:inline-flex">站点设置</Link>}
              <UserMenu name={displayName(user)} username={user.username} avatar={user.avatar_url} admin={user.is_site_admin} />
            </>
          ) : (
            <>
              <ThemeToggle />
              <a href="/api/auth/login" className="btn btn-primary btn-sm">登录</a>
            </>
          )}
        </div>
      </div>
      <div className="inf-stripe opacity-80" />
    </header>
  );
}
