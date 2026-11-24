import Link from "next/link";
import { ACTION_LABELS } from "@/lib/audit";
import type { AuditFilter, AuditRow } from "@/lib/audit-query";
import { fmtDate } from "@/lib/util";

const OBJECT_TYPES = ["doc", "node", "library", "member", "comment", "todo", "note", "attachment", "ai", "project", "settings", "user"];

export function AuditView({ base, filter, rows, hasMore, page, showProject, hidden = {} }: { base: string; filter: AuditFilter; rows: AuditRow[]; hasMore: boolean; page: number; showProject?: boolean; hidden?: Record<string, string> }) {
  const qs = (p: number) => {
    const s = new URLSearchParams(Object.entries({ ...hidden, ...filter, page: String(p) }).filter(([k, v]) => v && k !== "projectId") as [string, string][]);
    return `${base}?${s}`;
  };
  const objectHref = (r: AuditRow) => (["doc", "node"].includes(r.object_type) && r.object_id ? `/d/${r.object_id}` : null);
  return (
    <>
      <form className="panel p-4 grid sm:grid-cols-3 lg:grid-cols-6 gap-3 items-end">
        {Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
        <div><label className="label">操作者</label><input name="actor" defaultValue={filter.actor} className="input h-9" placeholder="用户名" /></div>
        <div>
          <label className="label">对象类型</label>
          <select name="objectType" defaultValue={filter.objectType ?? ""} className="input h-9">
            <option value="">全部</option>
            {OBJECT_TYPES.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
        <div><label className="label">对象 ID</label><input name="objectId" defaultValue={filter.objectId} className="input h-9" /></div>
        <div>
          <label className="label">动作</label>
          <select name="action" defaultValue={filter.action ?? ""} className="input h-9">
            <option value="">全部</option>
            {Object.entries(ACTION_LABELS).map(([k, v]) => <option key={k} value={k}>{v}（{k}）</option>)}
          </select>
        </div>
        <div><label className="label">起始</label><input type="date" name="from" defaultValue={filter.from} className="input h-9" /></div>
        <div className="flex gap-2">
          <div className="flex-1"><label className="label">截止</label><input type="date" name="to" defaultValue={filter.to} className="input h-9" /></div>
          <button className="btn h-9">查询</button>
        </div>
      </form>
      <div className="panel mt-4 overflow-x-auto">
        <table className="table-clean">
          <thead>
            <tr><th>时间</th><th>操作者</th>{showProject && <th>项目</th>}<th>动作</th><th>对象</th><th>详情</th></tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={6} className="text-center muted py-8">没有记录</td></tr>}
            {rows.map((r) => {
              const href = objectHref(r);
              return (
                <tr key={r.id}>
                  <td className="whitespace-nowrap text-xs muted">{fmtDate(r.created_at, true)}</td>
                  <td className="whitespace-nowrap">{r.actor ? `@${r.actor}` : "系统"}</td>
                  {showProject && <td className="text-xs">{r.project ?? "—"}</td>}
                  <td className="whitespace-nowrap"><span className="chip">{ACTION_LABELS[r.action] ?? r.action}</span></td>
                  <td className="whitespace-nowrap text-xs">{r.object_type} {href ? <Link className="underline" href={href}>#{r.object_id}</Link> : r.object_id && `#${r.object_id}`}</td>
                  <td className="text-xs muted max-w-[420px]">
                    <details>
                      <summary className="cursor-pointer truncate">{JSON.stringify(r.detail).slice(0, 80)}</summary>
                      <pre className="whitespace-pre-wrap break-all mt-1 text-[11px]">{JSON.stringify(r.detail, null, 2)}{r.ip && `\nIP: ${r.ip}`}</pre>
                    </details>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex justify-between mt-3 text-sm">
        {page > 1 ? <Link className="btn btn-sm" href={qs(page - 1)}>上一页</Link> : <span />}
        {hasMore && <Link className="btn btn-sm" href={qs(page + 1)}>下一页</Link>}
      </div>
    </>
  );
}
