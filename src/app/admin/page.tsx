import Link from "next/link";
import { TopBar } from "@/components/TopBar";
import { Avatar } from "@/components/Avatar";
import { AuditView } from "@/components/AuditTable";
import { ConfirmButton } from "@/components/SettingsBits";
import { Pager } from "@/components/ui/Pager";
import { Select } from "@/components/ui/Select";
import { requireSiteAdmin, displayName } from "@/lib/auth";
import { sql } from "@/lib/db";
import { getSsoConfig, publicAiConfig, appUrl } from "@/lib/settings";
import { saveSso, saveAi, setSiteAdmin } from "@/app/actions/admin";
import { queryAudit, type AuditFilter } from "@/lib/audit-query";
import { queryLogs } from "@/lib/log";
import { fmtDate, cx } from "@/lib/util";

export const dynamic = "force-dynamic";
export const metadata = { title: "站点设置" };

const TABS = [
  ["sso", "登录 (SSO)"],
  ["ai", "AI 提供方"],
  ["users", "用户"],
  ["audit", "全站审计"],
  ["logs", "运行日志"],
] as const;

function Field({ label, name, defaultValue, type = "text", placeholder, hint }: { label: string; name: string; defaultValue?: string; type?: string; placeholder?: string; hint?: string }) {
  return (
    <div>
      <label className="label" htmlFor={name}>{label}</label>
      <input id={name} name={name} type={type} defaultValue={defaultValue} placeholder={placeholder} className="input" autoComplete="off" />
      {hint && <div className="text-xs muted mt-1">{hint}</div>}
    </div>
  );
}

export default async function AdminPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const me = await requireSiteAdmin();
  const sp = await searchParams;
  const tab = TABS.some(([k]) => k === sp.tab) ? sp.tab : "sso";
  return (
    <>
      <TopBar crumbs={[{ label: "站点设置" }]} />
      <div className="border-b hairline bg-[var(--panel)]">
        <div className="shell pt-5">
          <h1 className="text-xl font-semibold">站点设置</h1>
          <nav className="flex gap-6 mt-3 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden -mx-4 px-4 sm:mx-0 sm:px-0">
            {TABS.map(([k, l]) => (
              <Link key={k} href={`/admin?tab=${k}`} className="tab" aria-current={tab === k ? "page" : undefined}>{l}</Link>
            ))}
          </nav>
        </div>
      </div>
      <main className="shell py-8">
        {tab === "sso" && <SsoTab />}
        {tab === "ai" && <AiTab />}
        {tab === "users" && <UsersTab meId={me.id} />}
        {tab === "audit" && <AuditTab sp={sp} />}
        {tab === "logs" && <LogsTab sp={sp} />}
      </main>
    </>
  );
}

async function SsoTab() {
  const c = await getSsoConfig();
  return (
    <form action={saveSso} className="panel p-6 space-y-5 max-w-3xl">
      <p className="text-sm muted">
        第三方 OAuth2 SSO 是唯一登录入口（授权码 + PKCE S256 + 一次性 state）。回调地址：<code className="text-[var(--text)] break-all">{appUrl()}/api/auth/callback</code>。站内按「提供方标识 + UID」识别用户，修改提供方标识会让已有用户重新建档。
      </p>
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="提供方标识" name="providerId" defaultValue={c.providerId} />
        <Field label="显示名称" name="providerName" defaultValue={c.providerName} />
        <Field label="授权地址" name="authorizeUrl" defaultValue={c.authorizeUrl} placeholder="https://sso.example.com/oauth/authorize" />
        <Field label="Token 地址" name="tokenUrl" defaultValue={c.tokenUrl} />
        <Field label="资料 API" name="userinfoUrl" defaultValue={c.userinfoUrl} />
        <Field label="Scope" name="scope" defaultValue={c.scope} />
        <Field label="Client ID" name="clientId" defaultValue={c.clientId} />
        <Field label="Client Secret" name="clientSecret" type="password" placeholder={c.clientSecret ? "已设置，留空保持不变" : "未设置"} />
      </div>
      <div>
        <div className="font-medium text-sm">字段映射</div>
        <p className="text-xs muted">资料 API 返回 JSON 中的字段路径，支持 a.b 形式。</p>
        <div className="grid sm:grid-cols-4 gap-4 mt-2">
          <Field label="稳定 UID" name="fieldUid" defaultValue={c.fieldUid} />
          <Field label="用户名" name="fieldUsername" defaultValue={c.fieldUsername} />
          <Field label="显示名" name="fieldName" defaultValue={c.fieldName} />
          <Field label="头像" name="fieldAvatar" defaultValue={c.fieldAvatar} />
        </div>
      </div>
      <button className="btn btn-primary">保存 SSO 配置</button>
    </form>
  );
}

async function AiTab() {
  const c = await publicAiConfig();
  return (
    <form action={saveAi} className="panel p-6 space-y-5 max-w-3xl">
      <p className="text-sm muted">首版接入兼容 OpenAI Chat Completions 的提供方。各项目默认关闭 AI，由项目管理员确认发送范围后启用。密钥加密保存，不会写入日志。</p>
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="提供方名称" name="providerName" defaultValue={c.providerName} />
        <Field label="模型" name="model" defaultValue={c.model} hint="例如 deepseek-chat" />
        <Field label="API 地址" name="baseUrl" defaultValue={c.baseUrl} hint="将调用 {API 地址}/chat/completions" />
        <Field label="API 密钥" name="apiKey" type="password" placeholder={c.hasKey ? `已设置 ${c.keyMasked}，留空保持不变` : "未设置"} />
      </div>
      <button className="btn btn-primary">保存 AI 配置</button>
    </form>
  );
}

async function UsersTab({ meId }: { meId: number }) {
  const users = await sql<{ id: number; username: string; display_name: string | null; avatar_url: string | null; is_site_admin: boolean; provider: string; provider_uid: string; created_at: Date; last_login_at: Date | null; projects: number }[]>`
    SELECT u.*, (SELECT count(*)::int FROM project_members m WHERE m.user_id = u.id) AS projects FROM users u ORDER BY u.id`;
  return (
    <div className="panel overflow-x-auto">
      <table className="table-clean">
        <thead><tr><th></th><th>用户</th><th>身份</th><th>项目</th><th>首次登录</th><th>最近登录</th><th></th></tr></thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <td className="w-10"><Avatar name={displayName(u)} url={u.avatar_url} /></td>
              <td><div className="font-medium">{displayName(u)}</div><div className="text-xs muted">@{u.username}</div></td>
              <td className="text-xs muted">{u.provider}:{u.provider_uid.slice(0, 12)}</td>
              <td>{u.projects}</td>
              <td className="text-xs muted">{fmtDate(u.created_at)}</td>
              <td className="text-xs muted">{u.last_login_at ? fmtDate(u.last_login_at, true) : "—"}</td>
              <td className="text-right">
                {u.is_site_admin ? (
                  u.id === meId ? <span className="chip">站点管理员</span> : <ConfirmButton action={setSiteAdmin.bind(null, u.id, false)} confirmText="取消其站点管理员身份？">取消站点管理员</ConfirmButton>
                ) : (
                  <ConfirmButton action={setSiteAdmin.bind(null, u.id, true)} confirmText="设为站点管理员？站点管理员可访问所有项目。">设为站点管理员</ConfirmButton>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

async function AuditTab({ sp }: { sp: Record<string, string> }) {
  const filter: AuditFilter = { actor: sp.actor, objectType: sp.objectType, objectId: sp.objectId, action: sp.action, from: sp.from, to: sp.to };
  const { rows, total, page, pages } = await queryAudit({ ...filter, page: Number(sp.page) || 1 });
  return <AuditView base="/admin" filter={filter} hidden={{ tab: "audit" }} rows={rows} total={total} pages={pages} page={page} showProject />;
}

const LOG_RANGES = [
  { value: "1", label: "最近 1 小时" },
  { value: "6", label: "最近 6 小时" },
  { value: "24", label: "最近 24 小时" },
  { value: "72", label: "最近 3 天" },
  { value: "168", label: "最近 7 天" },
  { value: "720", label: "最近 30 天" },
];
const LEVEL_TONE: Record<string, string> = {
  error: "text-[#d12c43] bg-[color-mix(in_oklab,#d12c43_12%,transparent)]",
  warn: "text-[#9a7500] dark:text-[#f2d94e] bg-[color-mix(in_oklab,#f2d94e_22%,transparent)]",
  info: "text-[#0d6f77] dark:text-[#5fe0e7] bg-[var(--accent-soft)]",
  debug: "muted bg-[var(--panel-2)]",
};

function prettyFields(raw: string) {
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    return Object.keys(o).length ? o : null;
  } catch {
    return raw ? { raw } : null;
  }
}

async function LogsTab({ sp }: { sp: Record<string, string> }) {
  if (!process.env.CLICKHOUSE_URL) {
    return (
      <div className="panel p-6 text-sm max-w-2xl">
        <div className="font-medium">未启用 ClickHouse</div>
        <p className="muted mt-1">运行日志始终以 JSON 输出到容器标准输出。叠加 <code>compose.clickhouse.yaml</code> 启动后，日志会写入 ClickHouse（默认保留 30 天）并可在此查询。长期版本与业务审计保存在 PostgreSQL。</p>
      </div>
    );
  }
  const hours = LOG_RANGES.some((r) => r.value === sp.hours) ? sp.hours : "24";
  let data: Awaited<ReturnType<typeof queryLogs>> = null;
  let error = "";
  try {
    data = await queryLogs({ level: sp.level, service: sp.service, q: sp.q, hours: Number(hours), page: Number(sp.page) || 1 });
  } catch (e) {
    error = String(e);
  }
  const link = (patch: Record<string, string | undefined>) => {
    const q = new URLSearchParams(Object.entries({ tab: "logs", level: sp.level, service: sp.service, q: sp.q, hours, ...patch }).filter(([, v]) => v) as [string, string][]);
    return `/admin?${q}`;
  };
  const counts = data?.counts ?? {};
  const all = Object.values(counts).reduce((a, b) => a + b, 0);
  return (
    <>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {[{ k: "", label: "全部", n: all }, ...["error", "warn", "info"].map((k) => ({ k, label: k, n: counts[k] ?? 0 }))].map((l) => (
          <Link key={l.k} href={link({ level: l.k || undefined, page: undefined })} className={cx("chip !py-1 !px-3 !text-[13px]", (sp.level ?? "") === l.k && "!bg-[var(--text)] !text-[var(--bg)] !border-[var(--text)]")}>
            {l.k && <span className={cx("w-1.5 h-1.5 rounded-full", l.k === "error" ? "bg-[#d12c43]" : l.k === "warn" ? "bg-[#e0b400]" : "bg-[#27b5bd]")} />}
            {l.label}
            <span className="tabular-nums opacity-70">{l.n}</span>
          </Link>
        ))}
      </div>
      <form className="panel p-3 sm:p-4 grid grid-cols-2 md:grid-cols-[10rem_8rem_minmax(0,1fr)_auto] gap-3 items-end">
        <input type="hidden" name="tab" value="logs" />
        {sp.level && <input type="hidden" name="level" value={sp.level} />}
        <div><label className="label">时间范围</label><Select name="hours" className="w-full" defaultValue={hours} options={LOG_RANGES} submitOnChange /></div>
        <div><label className="label">服务</label><Select name="service" className="w-full" defaultValue={sp.service ?? ""} submitOnChange options={[{ value: "", label: "全部" }, { value: "web", label: "web" }, { value: "worker", label: "worker" }, { value: "migrate", label: "migrate" }]} /></div>
        <div className="col-span-2 md:col-span-1"><label className="label">关键字</label><input name="q" defaultValue={sp.q} className="input" placeholder="事件名或字段内容，如 auth.login" autoComplete="off" data-1p-ignore /></div>
        <button className="btn btn-primary col-span-2 md:col-span-1 justify-center">查询</button>
      </form>
      {error && <div className="panel mt-4 p-4 text-sm text-[#d12c43]">ClickHouse 暂不可用：{error.slice(0, 300)}</div>}
      {data && (
        <div className="panel mt-4">
          {data.rows.length === 0 ? (
            <div className="py-12 text-center text-sm muted">这段时间内没有符合条件的日志</div>
          ) : (
            <ul className="divide-y divide-[var(--line)]">
              {data.rows.map((r, i) => {
                const f = prettyFields(r.fields);
                const brief = f ? Object.entries(f).filter(([, v]) => typeof v !== "object").slice(0, 4).map(([k, v]) => `${k}=${String(v)}`).join("  ") : "";
                return (
                  <li key={i}>
                    <details>
                      <summary className="list-none cursor-pointer grid grid-cols-[auto_minmax(0,1fr)_auto] md:grid-cols-[150px_52px_56px_minmax(0,220px)_minmax(0,1fr)] gap-x-3 gap-y-0.5 items-center px-4 py-2 text-xs hover:bg-[var(--panel-2)]">
                        <time className="hidden md:block font-mono muted tabular-nums">{r.ts.slice(5, 19)}</time>
                        <span className={cx("justify-self-start px-1.5 rounded font-medium font-mono text-[11px] leading-5", LEVEL_TONE[r.level] ?? LEVEL_TONE.debug)}>{r.level}</span>
                        <span className="hidden md:block muted">{r.service}</span>
                        <span className="font-mono font-medium truncate">{r.event}</span>
                        <time className="md:hidden font-mono muted tabular-nums text-[11px]">{r.ts.slice(5, 16)}</time>
                        <span className="col-span-3 md:col-span-1 font-mono muted truncate">{brief}</span>
                      </summary>
                      <pre className="mx-4 mb-3 mt-1 rounded-lg bg-[var(--panel-2)] p-3 whitespace-pre-wrap break-all text-[11.5px] leading-relaxed">{`${r.ts} · ${r.service}\n`}{f ? JSON.stringify(f, null, 2) : "（无字段）"}</pre>
                    </details>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
      {data && <Pager page={data.page} pages={data.pages} total={data.total} href={(n) => link({ page: String(n) })} />}
    </>
  );
}
