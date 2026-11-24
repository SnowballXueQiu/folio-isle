"use client";
import { useTransition } from "react";
import { setTodoStatus } from "@/app/actions/todos";
import { cx } from "@/lib/util";

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
    <select
      value={status}
      disabled={pending}
      onChange={(e) => start(() => setTodoStatus(projectId, todoId, e.target.value))}
      className={cx("text-xs rounded-full px-2 py-1 font-medium border-0 cursor-pointer", cur.cls)}
      aria-label="状态"
    >
      {S.map((s) => (
        <option key={s.id} value={s.id}>{s.label}</option>
      ))}
    </select>
  );
}
