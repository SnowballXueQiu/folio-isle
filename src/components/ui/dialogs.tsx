"use client";
// Imperative, styled replacements for window.confirm / prompt / alert.
//   if (!(await confirmDialog({ title: "删除？", danger: true }))) return;
//   const name = await promptDialog({ title: "重命名", defaultValue: old });
//   toast("已保存") / toast(err.message, "error")
import { useEffect, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import { cx } from "@/lib/util";

type DialogReq =
  | { kind: "confirm"; title: string; body?: string; confirmText?: string; danger?: boolean; resolve: (v: boolean) => void }
  | { kind: "prompt"; title: string; body?: string; defaultValue?: string; placeholder?: string; confirmText?: string; resolve: (v: string | null) => void };
type Toast = { id: number; text: string; tone: "info" | "success" | "error" };

let root: Root | null = null;
let pushDialog: ((d: DialogReq) => void) | null = null;
let pushToast: ((t: Toast) => void) | null = null;
const queued: Array<() => void> = [];

function ensureHost() {
  if (root || typeof document === "undefined") return;
  const el = document.createElement("div");
  el.id = "ui-dialog-host";
  document.body.appendChild(el);
  root = createRoot(el);
  root.render(<Host />);
}
// Always deferred to a macrotask so the update never joins a caller's pending transition
// (an async transition would hold it back until the action finishes).
function whenReady(fn: () => void) {
  setTimeout(() => {
    ensureHost();
    if (pushDialog) fn();
    else queued.push(fn);
  }, 0);
}

export function confirmDialog(o: { title: string; body?: string; confirmText?: string; danger?: boolean }): Promise<boolean> {
  return new Promise((resolve) => whenReady(() => pushDialog!({ kind: "confirm", ...o, resolve })));
}
export function promptDialog(o: { title: string; body?: string; defaultValue?: string; placeholder?: string; confirmText?: string }): Promise<string | null> {
  return new Promise((resolve) => whenReady(() => pushDialog!({ kind: "prompt", ...o, resolve })));
}
let toastId = 0;
export function toast(text: string, tone: Toast["tone"] = "info") {
  whenReady(() => pushToast!({ id: ++toastId, text, tone }));
}

function Host() {
  const [dialog, setDialog] = useState<DialogReq | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  useEffect(() => {
    pushDialog = setDialog;
    pushToast = (t) => {
      setToasts((l) => [...l.slice(-3), t]);
      setTimeout(() => setToasts((l) => l.filter((x) => x.id !== t.id)), t.tone === "error" ? 6000 : 3200);
    };
    queued.splice(0).forEach((f) => f());
  }, []);
  return (
    <>
      {dialog && <Dialog key={Math.random()} req={dialog} close={() => setDialog(null)} />}
      <div className="fixed bottom-5 right-5 z-[120] flex flex-col gap-2 items-end pointer-events-none">
        {toasts.map((t) => (
          <div key={t.id} className="pop-in pointer-events-auto panel shadow-lg pl-3 pr-2 py-2 text-sm flex items-center gap-2 max-w-sm" role="status">
            {t.tone === "error" ? <AlertTriangle size={16} className="text-[#d12c43] shrink-0" /> : t.tone === "success" ? <CheckCircle2 size={16} className="text-[#278a43] shrink-0" /> : <Info size={16} className="muted shrink-0" />}
            <span className="flex-1">{t.text}</span>
            <button className="muted hover:text-[var(--text)] p-0.5 rounded" onClick={() => setToasts((l) => l.filter((x) => x.id !== t.id))} aria-label="关闭">
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </>
  );
}

function Dialog({ req, close }: { req: DialogReq; close: () => void }) {
  const [value, setValue] = useState(req.kind === "prompt" ? req.defaultValue ?? "" : "");
  const input = useRef<HTMLInputElement>(null);
  const ok = useRef<HTMLButtonElement>(null);
  const done = (v: boolean) => {
    if (req.kind === "confirm") req.resolve(v);
    else req.resolve(v ? value : null);
    close();
  };
  useEffect(() => {
    if (req.kind === "prompt") input.current?.select();
    else ok.current?.focus();
    const key = (e: KeyboardEvent) => e.key === "Escape" && done(false);
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const danger = req.kind === "confirm" && req.danger;
  return (
    <div className="fixed inset-0 z-[110] flex items-start justify-center pt-[18vh] px-4">
      <div className="absolute inset-0 bg-[rgb(18_16_25/0.32)] backdrop-blur-[2px] fade-in" onClick={() => done(false)} />
      <form
        role="dialog"
        aria-modal
        className="pop-in relative panel shadow-2xl w-full max-w-[420px] p-5"
        style={{ transformOrigin: "top center" }}
        onSubmit={(e) => {
          e.preventDefault();
          done(true);
        }}
      >
        <div className="flex gap-3">
          {danger && (
            <span className="w-9 h-9 rounded-full bg-[#fdeef0] dark:bg-[#351820] text-[#d12c43] flex items-center justify-center shrink-0">
              <AlertTriangle size={18} />
            </span>
          )}
          <div className="flex-1 min-w-0">
            <h2 className="font-semibold">{req.title}</h2>
            {req.body && <p className="text-sm muted mt-1 leading-relaxed">{req.body}</p>}
            {req.kind === "prompt" && (
              <input ref={input} className="input mt-3" value={value} placeholder={req.placeholder} onChange={(e) => setValue(e.target.value)} autoComplete="off" data-1p-ignore data-lpignore="true" />
            )}
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button type="button" className="btn btn-sm" onClick={() => done(false)}>取消</button>
          <button ref={ok} className={cx("btn btn-sm", danger ? "btn-danger-solid" : "btn-primary")} disabled={req.kind === "prompt" && !value.trim()}>
            {req.confirmText ?? (danger ? "删除" : "确定")}
          </button>
        </div>
      </form>
    </div>
  );
}
