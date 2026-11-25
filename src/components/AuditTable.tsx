import Link from "next/link";
import { Search } from "lucide-react";
import { ACTION_LABELS } from "@/lib/audit";
import type { AuditFilter, AuditRow } from "@/lib/audit-query";
import { fmtDate } from "@/lib/util";
import { Select } from "@/components/ui/Select";
import { Pager } from "@/components/ui/Pager";
import { Avatar } from "@/components/Avatar";

const OBJECT_LABEL: Record<string, string> = { doc: "文档", node: "目录节点", library: "知识库", member: "成员", comment: "评论", todo: "待办", note: "随笔", attachment: "附件", ai: "AI", project: "项目", settings: "站点设置", user: "用户" };
const OBJECT_TYPES = Object.keys(OBJECT_LABEL);
const KEY_LABEL: Record<string, string> = { title: "标题", name: "名称", version_id: "版本", from: "原", to: "新", role: "角色", username: "用户", is_public: "公开", is_glossary: "设定库", bytes: "字节", library_id: "知识库", size: "大小", mime: "类型", node_id: "节点", count: "数量", split_from: "拆分自" };

/** One-line, human-readable digest of an audit detail object. */
function digest(d: Record<string, unknown>) {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(d)) {
    if (v === null || v === undefined || typeof v === "object" || k === "batch" || k === "reverting_batch") continue;
    parts.push(`${KEY_LABEL[k] ?? k}: ${typeof v === "boolean" ? (v ? "是" : "否") : String(v)}`);
    if (parts.length >= 4) break;
  }
  return parts.join(" · ");
}

export function AuditView({ base, filter, rows, total, pages, page, showProject, hidden = {} }: { base: string; filter: AuditFilter; rows: AuditRow[]; total: number; pages: number; page: number; showProject?: boolean; hidden?: Record<string, string> }) {
  const qs = (p: number) => {
    const s = new URLSearchParams(Object.entries({ ...hidden, ...filter, page: String(p) }).filter(([k, v]) => v && k !== "projectId") as [string, string][]);
    return `${base}?${s}`;
  };
  const objectHref = (r: AuditRow) => (["doc", "node"].includes(r.object_type) && r.object_id ? `/d/${r.object_id}` : null);
  return (
    <>
      <form className="panel p-4 grid grid-cols-2 md:grid-cols-3 xl:grid-cols-[1.2fr_1fr_0.8fr_1.4fr_1fr_1fr_auto] gap-3 items-end">
        {Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
        <div><label className="label">操作者</label><input name="actor" defaultValue={filter.actor} className="input" placeholder="用户名" autoComplete="off" data-1p-ignore /></div>
        <div>
          <label className="label">对象类型</label>
          <Select name="objectType" className="w-full" defaultValue={filter.objectType ?? ""} options={[{ value: "", label: "全部" }, ...OBJECT_TYPES.map((o) => ({ value: o, label: OBJECT_LABEL[o], hint: o }))]} />
        </div>
        <div><label className="label">对象 ID</label><input name="objectId" defaultValue={filter.objectId} className="input" autoComplete="off" /></div>
        <div>
          <label className="label">动作</label>
          <Select name="action" className="w-full" searchable minWidth={260} defaultValue={filter.action ?? ""} options={[{ value: "", label: "全部" }, ...Object.entries(ACTION_LABELS).map(([k, v]) => ({ value: k, label: v, hint: k }))]} />
        </div>
        <div><label className="label">起始</label><input type="date" name="from" defaultValue={filter.from} className="input" /></div>
        <div><label className="label">截止</label><input type="date" name="to" defaultValue={filter.to} className="input" /></div>
        <button className="btn btn-primary"><Search size={15} /> 查询</button>
      </form>

      <div className="panel mt-4">
        {rows.length === 0 ? (
          <div className="py-12 text-center text-sm muted">没有符合条件的记录</div>
        ) : (
          <ul className="divide-y divide-[var(--line)]">
            {rows.map((r) => {
              const href = objectHref(r);
              const d = digest(r.detail);
              return (
                <li key={r.id}>
                  <details className="group/row">
                    <summary className="list-none cursor-pointer flex items-center gap-3 px-4 h-11 text-sm hover:bg-[var(--panel-2)]">
                      <time className="w-[118px] shrink-0 text-xs muted tabular-nums" title={fmtDate(r.created_at, true)}>{fmtDate(r.created_at, true)}</time>
                      <span className="w-[128px] shrink-0 flex items-center gap-1.5 min-w-0">
                        {r.actor ? <Avatar name={r.actor_name || r.actor} url={r.avatar} size={18} /> : null}
                        <span className="truncate text-[13px]">{r.actor ? r.actor_name || r.actor : "系统"}</span>
                      </span>
                      {showProject && <span className="w-[100px] shrink-0 truncate text-xs muted">{r.project ?? "—"}</span>}
                      <span className="w-[112px] shrink-0 truncate font-medium text-[13px]">{ACTION_LABELS[r.action] ?? r.action}</span>
                      <span className="w-[120px] shrink-0 truncate text-xs muted">
                        {OBJECT_LABEL[r.object_type] ?? r.object_type}
                        {r.object_id && (href ? <Link className="ml-1 underline underline-offset-2 hover:text-[var(--text)]" href={href}>#{r.object_id}</Link> : <span className="ml-1">#{r.object_id.slice(0, 8)}</span>)}
                      </span>
                      <span className="flex-1 min-w-0 truncate text-xs muted">{d}</span>
                    </summary>
                    <pre className="mx-4 mb-3 mt-1 rounded-lg bg-[var(--panel-2)] p-3 whitespace-pre-wrap break-all text-[11.5px] leading-relaxed">{JSON.stringify(r.detail, null, 2)}{r.ip && `\nIP: ${r.ip}`}</pre>
                  </details>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <Pager page={page} pages={pages} total={total} href={qs} />
    </>
  );
}
