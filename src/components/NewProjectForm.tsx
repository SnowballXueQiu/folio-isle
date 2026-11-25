"use client";
import { useActionState, useEffect, useState } from "react";
import { AlertCircle, Check, Loader2 } from "lucide-react";
import { createProject, type CreateProjectState } from "@/app/actions/project";
import { cx } from "@/lib/util";

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;
type Check = "idle" | "checking" | "ok" | "taken" | "invalid";

export function NewProjectForm() {
  const [state, action, pending] = useActionState<CreateProjectState, FormData>(createProject, null);
  const [slug, setSlug] = useState("");
  const [check, setCheck] = useState<Check>("idle");

  useEffect(() => {
    if (state?.values?.slug !== undefined) setSlug(state.values.slug);
  }, [state]);

  useEffect(() => {
    const s = slug.trim().toLowerCase();
    if (!s) return setCheck("idle");
    if (!SLUG_RE.test(s)) return setCheck("invalid");
    setCheck("checking");
    const ctl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/projects/slug?s=${encodeURIComponent(s)}`, { signal: ctl.signal })
        .then((r) => r.json())
        .then((j: { available: boolean }) => setCheck(j.available ? "ok" : "taken"))
        .catch(() => {});
    }, 300);
    return () => (clearTimeout(t), ctl.abort());
  }, [slug]);

  const err = (f: string) => (state?.field === f ? state.error : undefined);
  const slugMsg =
    check === "taken" ? "已被其他项目使用" : check === "invalid" ? "3-40 位小写字母、数字或连字符，不能以连字符开头或结尾" : err("slug");
  const slugBad = check === "taken" || check === "invalid" || (!!err("slug") && check !== "ok");

  return (
    <form action={action} className="panel p-5 sm:p-6 mt-6 space-y-5" noValidate>
      {state?.error && !state.field && (
        <div className="flex gap-2 items-start rounded-lg border border-[#f7cdd3] bg-[#fdeef0] dark:bg-[#351820] dark:border-[#552531] px-3 py-2.5 text-sm text-[#d12c43]">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          {state.error}
        </div>
      )}
      <div>
        <label className="label" htmlFor="name">项目名称</label>
        <input id="name" name="name" className={cx("input", err("name") && "input-error")} required maxLength={60} placeholder="例如：Inf 服务器文档" defaultValue={state?.values?.name} key={`n${state?.values?.name}`} autoComplete="off" data-1p-ignore />
        {err("name") && <p className="field-error">{err("name")}</p>}
      </div>
      <div>
        <label className="label" htmlFor="slug">链接标识</label>
        <div className={cx("input flex items-center gap-0 !p-0 overflow-hidden", slugBad ? "input-error" : "focus-within:border-[var(--focus)] focus-within:shadow-[0_0_0_3px_color-mix(in_oklab,var(--focus)_20%,transparent)]")}>
          <span className="pl-3 pr-0.5 text-sm muted select-none whitespace-nowrap"><span className="hidden sm:inline">doc.infnetwork.net</span>/p/</span>
          <input
            id="slug"
            name="slug"
            value={slug}
            onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
            className="flex-1 min-w-0 h-full bg-transparent !outline-none text-[.9rem] pr-2"
            required
            maxLength={40}
            placeholder="inf-docs"
            autoComplete="off"
            data-1p-ignore
            aria-invalid={slugBad}
          />
          <span className="pr-3 w-7 flex justify-end">
            {check === "checking" && <Loader2 size={15} className="animate-spin muted" />}
            {check === "ok" && <Check size={15} className="text-[#2e8b45]" />}
            {(check === "taken" || check === "invalid") && <AlertCircle size={15} className="text-[#d12c43]" />}
          </span>
        </div>
        {slugMsg ? <p className="field-error">{slugMsg}</p> : <p className="text-xs muted mt-1.5">{check === "ok" ? "可以使用" : "创建后不能修改，用于项目链接"}</p>}
      </div>
      <div>
        <label className="label" htmlFor="description">简介 <span className="font-normal">（可选）</span></label>
        <textarea id="description" name="description" className={cx("input", err("description") && "input-error")} rows={3} maxLength={300} defaultValue={state?.values?.description} key={`d${state?.values?.description}`} />
        {err("description") && <p className="field-error">{err("description")}</p>}
      </div>
      <button className="btn btn-primary w-full justify-center h-10" disabled={pending || check === "taken" || check === "invalid"} aria-busy={pending}>
        {pending && <Loader2 size={15} className="animate-spin" />}
        {pending ? "正在创建…" : "创建项目"}
      </button>
    </form>
  );
}
