"use client";
import { Select } from "@/components/ui/Select";
import { useTransition } from "react";
import { setTodoStatus } from "@/app/actions/todos";
import { cx } from "@/lib/util";

const DOT: Record<string, string> = { todo: "bg-[var(--muted)]", doing: "bg-[var(--color-inf-cyan)]", done: "bg-[#2e8b45]" };

const S = [
  { id: "todo", label: "待开始", cls: "bg-[var(--panel-2)]" },
  { id: "doing", label: "进行中", cls: "bg-[#d5f4f6] text-[#0d6f77] dark:bg-[#123c40] dark:text-[#5fe0e7]" },
  { id: "done", label: "已完成", cls: "bg-[#dcf3e1] text-[#1f7a3a] dark:bg-[#173c22] dark:text-[#6fd68a]" },
];

export function StatusSelect({ projectId, todoId, status, canChange }: { projectId: number; todoId: number; status: string; canChange: boolean }) {
  const [pending, start] = useTransition();
  const cur = S.find((s) => s.id === status)!;
  if (!canChange) return <span className={cx("text-xs rounded-full px-2.5 py-1 font-medium", cur.cls)}>{cur.label}</span>;
  return (
    <Select
      variant="ghost"
      size="sm"
      align="end"
      value={status}
      disabled={pending}
      aria-label="状态"
      onChange={(v) => start(() => setTodoStatus(projectId, todoId, v))}
      triggerClassName={cx("!h-7 !rounded-full !px-2.5 !text-xs font-medium gap-1", cur.cls)}
      options={S.map((s) => ({ value: s.id, label: s.label, icon: <span className={cx("w-2 h-2 rounded-full", DOT[s.id])} /> }))}
    />
  );
}
