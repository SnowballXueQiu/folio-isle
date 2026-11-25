"use client";
import { useOptimistic, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { confirmDialog, toast } from "./dialogs";
import { cx } from "@/lib/util";

type Confirm = { title: string; body?: string; confirmText?: string; danger?: boolean };

async function run(action: () => Promise<unknown>, confirm?: Confirm, success?: string) {
  if (confirm && !(await confirmDialog(confirm))) return false;
  try {
    await action();
    if (success) toast(success, "success");
    return true;
  } catch (err) {
    toast((err as Error).message || "操作失败", "error");
    return false;
  }
}

/** Button that runs a server action, optionally after a styled confirmation. */
export function ActionButton({
  action,
  confirm,
  success,
  children,
  className = "btn btn-sm",
  title,
}: {
  action: () => Promise<unknown>;
  confirm?: Confirm;
  success?: string;
  children: React.ReactNode;
  className?: string;
  title?: string;
}) {
  const [pending, start] = useTransition();
  const iconOnly = className.includes("icon-btn");
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-busy={pending}
      className={cx(className, pending && "is-busy")}
      disabled={pending}
      onClick={async () => {
        // Ask BEFORE entering the transition: React holds back other transition renders while an
        // async action is pending, which would keep the dialog from ever appearing.
        if (confirm && !(await confirmDialog(confirm))) return;
        start(async () => void (await run(action, undefined, success)));
      }}
    >
      {pending && <Loader2 size={iconOnly ? 15 : 14} className="animate-spin shrink-0" />}
      {!(pending && iconOnly) && children}
    </button>
  );
}

/** iOS-style switch bound to a server action; flips optimistically. */
export function ActionSwitch({
  checked,
  action,
  label,
  confirmOn,
  confirmOff,
  icon,
}: {
  checked: boolean;
  action: (next: boolean) => Promise<unknown>;
  label: string;
  confirmOn?: Confirm;
  confirmOff?: Confirm;
  icon?: React.ReactNode;
}) {
  const [pending, start] = useTransition();
  const [on, setOn] = useOptimistic(checked);
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={pending}
      onClick={async () => {
        const next = !on;
        const ask = next ? confirmOn : confirmOff;
        if (ask && !(await confirmDialog(ask))) return;
        start(async () => {
          setOn(next);
          await run(() => action(next));
        });
      }}
      className={cx("group inline-flex items-center gap-2 text-[13px] select-none", pending && "is-busy", " rounded-md px-1.5 py-1 hover:bg-[var(--panel-2)]", on ? "text-[var(--text)]" : "muted")}
    >
      {icon}
      <span>{label}</span>
      <span className={cx("switch-track", on && "is-on")}>
        <span className="switch-thumb" />
      </span>
    </button>
  );
}
