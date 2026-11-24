import Link from "next/link";
import { TopBar } from "@/components/TopBar";
import { Avatar } from "@/components/Avatar";
import { AuditView } from "@/components/AuditTable";
import { ConfirmButton } from "@/components/SettingsBits";
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
        <div className="mx-auto max-w-[1200px] px-4 pt-5">
          <h1 className="text-xl font-semibold">站点设置</h1>
          <nav className="flex gap-6 mt-3">
            {TABS.map(([k, l]) => (
              <Link key={k} href={`/admin?tab=${k}`} className="tab" aria-current={tab === k ? "page" : undefined}>{l}</Link>
            ))}
          </nav>
        </div>
      </div>
      <main className="mx-auto max-w-[1200px] px-4 py-8">
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
        第三方 OAuth2 SSO 是唯一登录入口（授权码 + PKCE S256 + 一次性 state）。回调地址：<code className="text-[var(--text)]">{appUrl()}/api/auth/callback</code>。站内按「提供方标识 + UID」识别用户，修改提供方标识会让已有用户重新建档。
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
  const { rows, hasMore, page } = await queryAudit({ ...filter, page: Number(sp.page) || 1 });
  return <AuditView base="/admin" filter={filter} hidden={{ tab: "audit" }} rows={rows} hasMore={hasMore} page={page} showProject />;
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
  let rows: Awaited<ReturnType<typeof queryLogs>> = [];
  let error = "";
  try {
    rows = await queryLogs({ level: sp.level, service: sp.service, q: sp.q, hours: Number(sp.hours) || 24 });
  } catch (e) {
    error = String(e);
  }
  return (
    <>
      <form className="panel p-4 flex flex-wrap gap-3 items-end">
        <input type="hidden" name="tab" value="logs" />
        <div><label className="label">级别</label><select name="level" defaultValue={sp.level ?? ""} className="input h-9 w-28"><option value="">全部</option><option>info</option><option>warn</option><option>error</option></select></div>
        <div><label className="label">服务</label><select name="service" defaultValue={sp.service ?? ""} className="input h-9 w-28"><option value="">全部</option><option>web</option><option>worker</option></select></div>
        <div><label className="label">时间范围（小时）</label><input name="hours" type="number" min={1} max={720} defaultValue={sp.hours ?? "24"} className="input h-9 w-28" /></div>
        <div className="flex-1 min-w-48"><label className="label">关键字</label><input name="q" defaultValue={sp.q} className="input h-9" /></div>
        <button className="btn h-9">查询</button>
      </form>
      {error && <div className="mt-4 text-sm text-[#d12c43]">ClickHouse 不可用：{error}</div>}
      <div className="panel mt-4 overflow-x-auto">
        <table className="table-clean font-mono text-xs">
          <tbody>
            {(rows ?? []).map((r, i) => (
              <tr key={i}>
                <td className="whitespace-nowrap muted">{r.ts}</td>
                <td className={cx(r.level === "error" && "text-[#d12c43]", r.level === "warn" && "text-[#b08a00]")}>{r.level}</td>
                <td>{r.service}</td>
                <td className="whitespace-nowrap">{r.event}</td>
                <td className="break-all muted">{r.fields}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
