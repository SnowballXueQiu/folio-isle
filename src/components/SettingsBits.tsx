"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { Search, UserPlus, Check } from "lucide-react";
import { Select } from "@/components/ui/Select";
import { confirmDialog, toast } from "@/components/ui/dialogs";
import { Avatar } from "@/components/Avatar";
import { ActionButton } from "@/components/ui/controls";
import { cx } from "@/lib/util";

const ROLES = [
  { value: "admin", label: "管理员", hint: "成员、可见性、恢复与 AI" },
  { value: "editor", label: "编辑者", hint: "写作、发布、待办和随笔" },
  { value: "member", label: "成员", hint: "阅读，更新自己负责的待办" },
];

export function RoleSelect({ action, role, name }: { action: (role: string) => Promise<void>; role: string; name: string }) {
  const [pending, start] = useTransition();
  return (
    <Select
      size="sm"
      align="end"
      minWidth={220}
      className="w-28"
      disabled={pending}
      value={role}
      aria-label="角色"
      options={[...ROLES, { value: "remove", label: "移出项目", danger: true }]}
      onChange={async (v) => {
        if (v === "remove" && !(await confirmDialog({ title: `将 ${name} 移出项目？`, body: "对方将无法再访问私有知识库、待办、随笔和 AI 分析。", confirmText: "移出", danger: true }))) return false;
        start(async () => {
          try {
            await action(v);
            toast(v === "remove" ? `已移出 ${name}` : "角色已更新", "success");
          } catch (err) {
            toast((err as Error).message || "操作失败", "error");
          }
        });
      }}
    />
  );
}

type Found = { id: number; username: string; display_name: string | null; avatar_url: string | null; role: string | null };

export function AddMemberForm({ projectId, action }: { projectId: number; action: (f: FormData) => Promise<{ error?: string; ok?: boolean }> }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [found, setFound] = useState<Found[]>([]);
  const [picked, setPicked] = useState<Found | null>(null);
  const [active, setActive] = useState(0);
  const [role, setRole] = useState("member");
  const [pending, start] = useTransition();
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const ctl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/users/search?project=${projectId}&q=${encodeURIComponent(q)}`, { signal: ctl.signal })
        .then((r) => (r.ok ? r.json() : []))
        .then((rows: Found[]) => (setFound(rows), setActive(0)))
        .catch(() => {});
    }, 150);
    return () => (clearTimeout(t), ctl.abort());
  }, [q, open, projectId]);

  useEffect(() => {
    const close = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, []);

  const pick = (u: Found) => {
    if (u.role) return;
    setPicked(u);
    setQ(u.display_name || u.username);
    setOpen(false);
  };
  const submit = () => {
    if (!picked) return;
    const f = new FormData();
    f.set("username", picked.username);
    f.set("role", role);
    start(async () => {
      const res = await action(f);
      if (res?.error) return toast(res.error, "error");
      toast(`已添加 ${picked.display_name || picked.username}`, "success");
      setPicked(null);
      setQ("");
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div ref={box} className="relative w-full sm:w-72">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 muted pointer-events-none" />
        <input
          className="input pl-9"
          placeholder="搜索用户名或昵称"
          value={q}
          onFocus={() => setOpen(true)}
          onChange={(e) => (setQ(e.target.value), setPicked(null), setOpen(true))}
          onKeyDown={(e) => {
            const choices = found.filter((u) => !u.role);
            if (e.key === "ArrowDown") (e.preventDefault(), setActive((a) => Math.min(found.length - 1, a + 1)));
            else if (e.key === "ArrowUp") (e.preventDefault(), setActive((a) => Math.max(0, a - 1)));
            else if (e.key === "Enter") {
              e.preventDefault();
              if (open && found[active]) pick(found[active]);
              else if (picked) submit();
              else if (choices[0]) pick(choices[0]);
            } else if (e.key === "Escape") setOpen(false);
          }}
          autoComplete="off"
          spellCheck={false}
          data-1p-ignore
          data-lpignore="true"
          data-form-type="other"
          role="combobox"
          aria-expanded={open}
          aria-label="搜索用户"
        />
        {open && (
          <div className="pop-in absolute z-30 left-0 right-0 mt-1.5 panel shadow-xl p-1" style={{ transformOrigin: "top" }}>
            {found.length === 0 ? (
              <div className="px-3 py-5 text-center text-[13px] muted">{q ? "没有找到用户（对方需先登录一次言屿）" : "输入用户名或昵称搜索"}</div>
            ) : (
              found.map((u, i) => (
                <button
                  key={u.id}
                  type="button"
                  disabled={!!u.role}
                  onPointerEnter={() => setActive(i)}
                  onClick={() => pick(u)}
                  className={cx("w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-left", i === active && !u.role && "bg-[var(--panel-2)]", u.role && "opacity-55 cursor-default")}
                >
                  <Avatar name={u.display_name || u.username} url={u.avatar_url} size={26} />
                  <span className="flex-1 min-w-0">
                    <span className="block text-[13.5px] truncate">{u.display_name || u.username}</span>
                    <span className="block text-[11.5px] muted truncate">@{u.username}</span>
                  </span>
                  {u.role && (
                    <span className="text-[11.5px] muted inline-flex items-center gap-1">
                      <Check size={12} /> 已在项目中
                    </span>
                  )}
                </button>
              ))
            )}
          </div>
        )}
      </div>
      <Select className="w-32" value={role} onChange={(v) => void setRole(v)} options={ROLES} minWidth={230} aria-label="角色" />
      <button type="button" className="btn btn-primary" disabled={!picked || pending} onClick={submit}>
        <UserPlus size={15} /> 添加
      </button>
    </div>
  );
}

/** Back-compat wrapper: a server-action button with an optional styled confirmation. */
export function ConfirmButton({ action, children, confirmText, className = "btn btn-sm" }: { action: () => Promise<unknown>; children: React.ReactNode; confirmText?: string; className?: string }) {
  return (
    <ActionButton className={className} action={action} confirm={confirmText ? { title: confirmText, danger: className.includes("danger") } : undefined}>
      {children}
    </ActionButton>
  );
}
