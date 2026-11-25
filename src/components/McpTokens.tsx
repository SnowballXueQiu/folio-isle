"use client";
// Project settings → MCP 接入: create/revoke read-only tokens and copy ready-made client configs.
import { useActionState, useEffect, useState } from "react";
import { Check, Copy, KeyRound, Loader2, Lock, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { createProjectToken, revokeProjectToken, type TokenState } from "@/app/actions/project";
import { ActionButton } from "@/components/ui/controls";
import { cx, timeAgo } from "@/lib/util";

export type TokenRow = { id: number; name: string; hint: string; include_private: boolean; created_at: string; last_used_at: string | null; use_count: number; creator: string | null };

function CopyBox({ text, label }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="relative group">
      {label && <div className="text-xs muted mb-1.5">{label}</div>}
      <pre className="rounded-lg bg-[#16131f] text-[#e9e6f2] text-[12px] leading-relaxed p-3 pr-11 overflow-x-auto whitespace-pre">{text}</pre>
      <button
        type="button"
        aria-label="复制"
        onClick={() => navigator.clipboard.writeText(text).then(() => (setDone(true), setTimeout(() => setDone(false), 1500)))}
        className={cx("absolute right-2 p-1.5 rounded-md text-[#c9c4d8] hover:bg-white/10 hover:text-white transition-colors", label ? "top-8" : "top-2")}
      >
        {done ? <Check size={14} className="text-[#6fd68a]" /> : <Copy size={14} />}
      </button>
    </div>
  );
}

export function McpTokens({ projectId, slug, endpoint, tokens }: { projectId: number; slug: string; endpoint: string; tokens: TokenRow[] }) {
  const [state, action, pending] = useActionState<TokenState, FormData>(createProjectToken.bind(null, projectId), null);
  const [creating, setCreating] = useState(false);
  useEffect(() => {
    if (state?.token) setCreating(false);
  }, [state]);
  const [client, setClient] = useState<"claude" | "json">("claude");
  const token = state?.token ?? "<令牌>";
  const server = `folio-${slug}`;
  const configs = {
    claude: `claude mcp add --transport http ${server} ${endpoint} \\\n  --header "Authorization: Bearer ${token}"`,
    json: JSON.stringify({ mcpServers: { [server]: { type: "http", url: endpoint, headers: { Authorization: `Bearer ${token}` } } } }, null, 2),
  };

  return (
    <div className="space-y-5">
      <div className="grid sm:grid-cols-[1fr_auto] gap-3 items-center rounded-xl bg-[var(--panel-2)] px-4 py-3">
        <div className="min-w-0">
          <div className="text-xs muted mb-0.5">接口地址（Streamable HTTP）</div>
          <code className="text-[13px] break-all">{endpoint}</code>
        </div>
        <div className="flex flex-wrap gap-1.5 text-[11.5px]">
          {["只读", "仅已发布文档", "待办与随笔"].map((t) => (
            <span key={t} className="chip"><ShieldCheck size={11} />{t}</span>
          ))}
        </div>
      </div>

      {state?.token && (
        <div className="pop-in rounded-xl border border-[#cbe9d0] dark:border-[#214a2c] bg-[#edf8ef] dark:bg-[#15301d] p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium text-[#1f7a3a] dark:text-[#6fd68a]">
            <Check size={16} /> 已创建「{state.name}」。令牌只显示这一次，请现在复制保存。
          </div>
          <CopyBox text={state.token} />
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm font-medium">令牌</div>
          {!creating && (
            <button type="button" className="btn btn-sm" onClick={() => setCreating(true)}>
              <Plus size={14} /> 新建令牌
            </button>
          )}
        </div>
        {creating && (
          <form action={action} className="pop-in rounded-xl border hairline p-4 mb-3 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
            <div>
              <label className="label" htmlFor="tok-name">名称</label>
              <input id="tok-name" name="name" className="input" placeholder="例如：Claude Code - 工作电脑" maxLength={60} autoFocus autoComplete="off" data-1p-ignore />
            </div>
            <div className="flex gap-2">
              <button type="button" className="btn" onClick={() => setCreating(false)}>取消</button>
              <button className="btn btn-primary" disabled={pending}>
                {pending ? <Loader2 size={14} className="animate-spin" /> : <KeyRound size={14} />} 生成
              </button>
            </div>
            <label className="sm:col-span-2 flex items-start gap-2 text-[13px] cursor-pointer">
              <input type="checkbox" name="include_private" className="mt-0.5 accent-[var(--text)]" />
              <span>
                包含私有知识库
                <span className="block text-xs muted">不勾选时只能读取公开知识库中的已发布文档。</span>
              </span>
            </label>
          </form>
        )}
        {state?.error && <p className="field-error mb-2">{state.error}</p>}
        {tokens.length === 0 ? (
          <div className="rounded-xl border border-dashed hairline py-8 text-center text-sm muted">还没有令牌。新建一个后即可在 Claude、Cursor 等客户端中接入本项目。</div>
        ) : (
          <ul className="rounded-xl border hairline divide-y divide-[var(--line)]">
            {tokens.map((t) => (
              <li key={t.id} className="flex items-center gap-3 px-4 py-2.5">
                <KeyRound size={15} className="muted shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate flex items-center gap-1.5">
                    {t.name}
                    {t.include_private && <span className="chip !py-0 !text-[10.5px]"><Lock size={10} />含私有</span>}
                  </div>
                  <div className="text-xs muted truncate">
                    fio_…{t.hint} · {t.creator ?? "—"} 创建于 {timeAgo(t.created_at)} · {t.last_used_at ? `最近使用 ${timeAgo(t.last_used_at)}（${t.use_count} 次）` : "从未使用"}
                  </div>
                </div>
                <ActionButton
                  className="icon-btn hover:!text-[#d12c43]"
                  title="吊销"
                  action={() => revokeProjectToken(projectId, t.id)}
                  confirm={{ title: `吊销令牌「${t.name}」？`, body: "使用该令牌的客户端会立刻无法访问，此操作不能撤销。", confirmText: "吊销", danger: true }}
                  success="已吊销"
                >
                  <Trash2 size={15} />
                </ActionButton>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <div className="flex items-center gap-1 mb-2">
          <div className="text-sm font-medium mr-auto">接入配置</div>
          {(["claude", "json"] as const).map((k) => (
            <button key={k} type="button" onClick={() => setClient(k)} className={cx("px-2.5 h-7 rounded-md text-xs", client === k ? "bg-[var(--panel-2)] font-medium" : "muted hover:text-[var(--text)]")}>
              {k === "claude" ? "Claude Code" : "JSON（Cursor 等）"}
            </button>
          ))}
        </div>
        <CopyBox text={configs[client]} />
        <p className="text-xs muted mt-2 leading-relaxed">
          提供的工具：项目概览、文档目录、全文搜索、读取文档（Markdown 原文）、待办列表、随笔列表。所有请求只读，不会修改任何内容。
        </p>
      </div>
    </div>
  );
}
