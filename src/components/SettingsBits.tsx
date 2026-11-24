"use client";
import { useActionState, useTransition } from "react";

export function RoleSelect({ action, role }: { action: (role: string) => Promise<void>; role: string }) {
  const [pending, start] = useTransition();
  return (
    <select
      className="input h-8 text-sm w-28"
      defaultValue={role}
      disabled={pending}
      onChange={(e) => {
        const v = e.target.value;
        if (v === "remove" && !confirm("确定将该成员移出项目？")) return (e.target.value = role);
        start(async () => {
          try {
            await action(v);
          } catch (err) {
            alert((err as Error).message || "操作失败");
          }
        });
      }}
    >
      <option value="admin">管理员</option>
      <option value="editor">编辑者</option>
      <option value="member">成员</option>
      <option value="remove">移出项目</option>
    </select>
  );
}

export function AddMemberForm({ action }: { action: (f: FormData) => Promise<{ error?: string; ok?: boolean }> }) {
  const [state, formAction, pending] = useActionState(async (_: unknown, f: FormData) => action(f), null as { error?: string; ok?: boolean } | null);
  return (
    <form action={formAction} className="flex flex-wrap gap-2 items-center">
      <input name="username" className="input h-9 max-w-[220px]" placeholder="用户名（需已登录过）" required />
      <select name="role" className="input h-9 w-28" defaultValue="member">
        <option value="member">成员</option>
        <option value="editor">编辑者</option>
        <option value="admin">管理员</option>
      </select>
      <button className="btn" disabled={pending}>添加</button>
      {state?.error && <span className="text-sm text-[#d12c43]">{state.error}</span>}
      {state?.ok && <span className="text-sm text-[#278a43]">已添加</span>}
    </form>
  );
}

export function ConfirmButton({ action, children, confirmText, className = "btn btn-sm" }: { action: () => Promise<void>; children: React.ReactNode; confirmText?: string; className?: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      className={className}
      disabled={pending}
      onClick={() => {
        if (confirmText && !confirm(confirmText)) return;
        start(async () => {
          try {
            await action();
          } catch (err) {
            alert((err as Error).message || "操作失败");
          }
        });
      }}
    >
      {children}
    </button>
  );
}
