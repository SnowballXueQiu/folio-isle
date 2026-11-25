import Link from "next/link";
import { BookMarked, FileText, Folder, Globe, Library, RotateCcw, Trash2, Undo2 } from "lucide-react";
import { currentUser, displayName } from "@/lib/auth";
import { sql } from "@/lib/db";
import { loadProject, requireProjectRole } from "@/lib/perms";
import { projectMembers } from "@/lib/project-data";
import { addMember, setMemberRole, updateProject, setLibraryVisibility, setLibraryGlossary, removeLibrary, bringBackLibrary, bringBackNode, revertEvent } from "@/app/actions/project";
import { AddMemberForm, RoleSelect } from "@/components/SettingsBits";
import { SettingsNav } from "@/components/SettingsNav";
import { ActionButton, ActionSwitch } from "@/components/ui/controls";
import { Select } from "@/components/ui/Select";
import { Pager } from "@/components/ui/Pager";
import { Avatar } from "@/components/Avatar";
import { McpTokens, type TokenRow } from "@/components/McpTokens";
import { appUrl } from "@/lib/settings";
import { fmtDate, cx } from "@/lib/util";

export const dynamic = "force-dynamic";
export const metadata = { title: "项目设置" };

const TREE_LABEL: Record<string, string> = {
  create: "新建", move: "移动", reorder: "排序", rename: "重命名", delete: "删除", restore: "恢复",
  "library.create": "新建知识库", "library.delete": "删除知识库", "library.restore": "恢复知识库",
};
const TREE_TONE: Record<string, string> = {
  delete: "text-[#d12c43] bg-[color-mix(in_oklab,#d12c43_10%,transparent)]",
  "library.delete": "text-[#d12c43] bg-[color-mix(in_oklab,#d12c43_10%,transparent)]",
  create: "text-[#1f7a3a] bg-[color-mix(in_oklab,#2e8b45_12%,transparent)] dark:text-[#6fd68a]",
  "library.create": "text-[#1f7a3a] bg-[color-mix(in_oklab,#2e8b45_12%,transparent)] dark:text-[#6fd68a]",
  restore: "text-[#0d6f77] bg-[var(--accent-soft)] dark:text-[#5fe0e7]",
  "library.restore": "text-[#0d6f77] bg-[var(--accent-soft)] dark:text-[#5fe0e7]",
};
const TREE_PAGE = 20;
const TRASH_PAGE = 10;

function Section({ id, title, desc, action, children }: { id: string; title: string; desc?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section id={id} className="panel scroll-mt-28">
      <header className="flex items-start gap-4 px-4 sm:px-6 pt-5 pb-4 border-b hairline">
        <div className="flex-1 min-w-0">
          <h2 className="font-semibold">{title}</h2>
          {desc && <p className="text-[13px] muted mt-1 leading-relaxed">{desc}</p>}
        </div>
        {action}
      </header>
      <div className="px-4 sm:px-6 py-5">{children}</div>
    </section>
  );
}

type SP = { tp?: string; tl?: string; ta?: string; rp?: string };

export default async function SettingsPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<SP> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const project = await loadProject(slug);
  const user = await currentUser();
  await requireProjectRole(user, project, "admin");
  const members = await projectMembers(project.id);
  const tokens = await sql<TokenRow[]>`
    SELECT t.id, t.name, t.token_hint AS hint, t.include_private, t.created_at::text, t.last_used_at::text, t.use_count, coalesce(u.display_name, u.username) AS creator
    FROM project_tokens t LEFT JOIN users u ON u.id = t.created_by
    WHERE t.project_id = ${project.id} AND t.revoked_at IS NULL ORDER BY t.id DESC`;
  const libs = await sql<{ id: number; name: string; is_public: boolean; is_glossary: boolean; deleted_at: Date | null; docs: number }[]>`
    SELECT l.id, l.name, l.is_public, l.is_glossary, l.deleted_at,
      (SELECT count(*)::int FROM nodes n WHERE n.library_id = l.id AND n.deleted_at IS NULL AND n.kind = 'doc') AS docs
    FROM libraries l WHERE l.project_id = ${project.id} ORDER BY l.deleted_at NULLS FIRST, l.position, l.id`;
  const live = libs.filter((l) => !l.deleted_at);
  const deadLibs = libs.filter((l) => l.deleted_at);

  // trash (top-level deleted nodes of each delete batch), paged
  const trashPage = Math.max(1, Number(sp.rp) || 1);
  const trashWhere = sql`l.project_id = ${project.id} AND n.deleted_at IS NOT NULL
      AND (n.parent_id IS NULL OR NOT EXISTS (SELECT 1 FROM nodes p WHERE p.id = n.parent_id AND p.delete_batch = n.delete_batch))`;
  const [{ trashTotal }] = await sql<{ trashTotal: number }[]>`SELECT count(*)::int AS "trashTotal" FROM nodes n JOIN libraries l ON l.id = n.library_id WHERE ${trashWhere}`;
  const trash = await sql<{ id: number; title: string; kind: string; library: string; deleted_at: Date; by: string | null; count: number }[]>`
    SELECT n.id, n.title, n.kind, l.name AS library, n.deleted_at, coalesce(u.display_name, u.username) AS by,
      (SELECT count(*)::int FROM nodes x WHERE x.delete_batch = n.delete_batch) AS count
    FROM nodes n JOIN libraries l ON l.id = n.library_id LEFT JOIN users u ON u.id = n.deleted_by
    WHERE ${trashWhere}
    ORDER BY n.deleted_at DESC, n.id DESC LIMIT ${TRASH_PAGE} OFFSET ${(trashPage - 1) * TRASH_PAGE}`;

  // tree history, filtered + paged
  const treePage = Math.max(1, Number(sp.tp) || 1);
  const libFilter = Number(sp.tl) || null;
  const actFilter = sp.ta && TREE_LABEL[sp.ta] ? sp.ta : null;
  const treeWhere = sql`e.project_id = ${project.id}
      ${libFilter ? sql`AND (e.library_id = ${libFilter} OR (e.before->>'library_id')::bigint = ${libFilter})` : sql``}
      ${actFilter ? sql`AND e.action = ${actFilter}` : sql``}`;
  const [{ treeTotal }] = await sql<{ treeTotal: number }[]>`SELECT count(*)::int AS "treeTotal" FROM tree_events e WHERE ${treeWhere}`;
  const events = await sql<{ id: number; node_id: number | null; action: string; before: Record<string, unknown> | null; after: Record<string, unknown> | null; created_at: Date; by: string | null; avatar: string | null; title: string | null; library: string | null }[]>`
    SELECT e.id, e.node_id, e.action, e.before, e.after, e.created_at, coalesce(u.display_name, u.username) AS by, u.avatar_url AS avatar, n.title, l.name AS library
    FROM tree_events e LEFT JOIN users u ON u.id = e.actor_id LEFT JOIN nodes n ON n.id = e.node_id LEFT JOIN libraries l ON l.id = e.library_id
    WHERE ${treeWhere} ORDER BY e.id DESC LIMIT ${TREE_PAGE} OFFSET ${(treePage - 1) * TREE_PAGE}`;

  const libName = new Map(libs.map((l) => [l.id, l.name]));
  const describe = (e: (typeof events)[number]) => {
    const b = e.before ?? {}, a = e.after ?? {};
    if (e.action === "rename") return `「${b.title}」→「${a.title}」`;
    if (e.action === "move") {
      const from = libName.get(Number(b.library_id)) ?? "", to = libName.get(Number(a.library_id)) ?? "";
      return from === to ? `${to}：第 ${Number(b.index) + 1} 位 → ${a.parent_id ? "子节点" : "根目录"}第 ${Number(a.index) + 1} 位` : `${from} → ${to}`;
    }
    if (e.action === "reorder") return `第 ${Number(b.index) + 1} 位 → 第 ${Number(a.index) + 1} 位`;
    if (e.action === "delete") return Number(a.count) > 1 ? `含 ${Number(a.count) - 1} 个子节点` : "";
    return e.library && !e.action.startsWith("library.") ? e.library : "";
  };
  const qs = (patch: Partial<SP>, hash: string) => {
    const s = new URLSearchParams(Object.entries({ ...sp, ...patch }).filter(([, v]) => v) as [string, string][]);
    return `/p/${slug}/settings${s.size ? `?${s}` : ""}#${hash}`;
  };
  const trashCount = trashTotal + deadLibs.length;

  return (
    <main className="shell py-5 md:py-8 grid grid-cols-[minmax(0,1fr)] lg:grid-cols-[200px_minmax(0,1fr)] gap-4 md:gap-6 lg:gap-10">
      <aside className="sticky top-[59px] lg:top-24 z-20 self-start min-w-0 -mx-4 px-4 py-2 lg:m-0 lg:p-0 bg-[color-mix(in_oklab,var(--bg)_90%,transparent)] backdrop-blur lg:bg-transparent lg:backdrop-blur-none">
        <SettingsNav counts={{ members: members.length, libraries: live.length, trash: trashCount }} />
      </aside>

      <div className="space-y-6 min-w-0">
        <Section id="general" title="基本信息" desc="项目名称和简介会显示在项目首页与顶部导航。">
          <form action={updateProject.bind(null, project.id)} className="grid gap-4 max-w-xl">
            <div>
              <label className="label" htmlFor="p-name">项目名称</label>
              <input id="p-name" name="name" className="input" defaultValue={project.name} required maxLength={60} autoComplete="off" data-1p-ignore />
            </div>
            <div>
              <label className="label" htmlFor="p-desc">简介</label>
              <textarea id="p-desc" name="description" className="input" rows={3} defaultValue={project.description} maxLength={300} placeholder="一句话介绍这个项目（可选）" />
            </div>
            <div><button className="btn btn-primary btn-sm">保存</button></div>
          </form>
        </Section>

        <Section id="members" title="成员与角色" desc="管理员：成员、可见性、恢复与 AI；编辑者：写作、发布、维护待办和随笔；成员：阅读并更新自己负责的待办。">
          <AddMemberForm projectId={project.id} action={addMember.bind(null, project.id)} />
          <ul className="mt-5 divide-y divide-[var(--line)] border-t hairline">
            {members.map((m) => (
              <li key={m.id} className="flex items-center gap-3 py-3">
                <Avatar name={displayName(m)} url={m.avatar_url} size={34} />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">
                    {displayName(m)}
                    {m.id === user?.id && <span className="ml-2 text-[11px] muted font-normal">你</span>}
                  </div>
                  <div className="text-xs muted truncate">@{m.username}</div>
                </div>
                <RoleSelect action={setMemberRole.bind(null, project.id, m.id)} role={m.role} name={displayName(m)} />
              </li>
            ))}
          </ul>
        </Section>

        <Section
          id="libraries"
          title="知识库"
          desc={
            <>
              公开后游客可阅读该库已发布的文档和评论。<span className="text-[var(--text)]">设定库</span>里的文档是词条：其他知识库的正文提到词条名时，会自动出现交叉引用和悬浮说明。
            </>
          }
        >
          <ul className="divide-y divide-[var(--line)] -my-2">
            {live.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
                <Library size={17} strokeWidth={1.8} className="muted shrink-0" />
                <div className="flex-1 min-w-[160px]">
                  <Link href={`/p/${slug}/kb/${l.id}`} className="font-medium text-sm hover:underline underline-offset-4">{l.name}</Link>
                  <div className="text-xs muted mt-0.5">{l.docs} 篇文档</div>
                </div>
                <div className="flex items-center gap-1">
                  <ActionSwitch
                    label="公开"
                    icon={<Globe size={14} />}
                    checked={l.is_public}
                    action={setLibraryVisibility.bind(null, project.id, l.id)}
                    confirmOn={{ title: `公开「${l.name}」？`, body: "任何人（包括未登录的游客）都能阅读该库已发布的文档和评论。", confirmText: "公开" }}
                    confirmOff={{ title: `把「${l.name}」改为私有？`, body: "游客将无法再访问，已分享的链接会失效。", confirmText: "改为私有" }}
                  />
                  <ActionSwitch
                    label="设定库"
                    icon={<BookMarked size={14} />}
                    checked={l.is_glossary}
                    action={setLibraryGlossary.bind(null, project.id, l.id)}
                    confirmOn={{ title: `把「${l.name}」设为设定库？`, body: "库里已发布的文档会成为词条，其他文档提到它们时会自动出现交叉引用。", confirmText: "设为设定库" }}
                  />
                  <ActionButton
                    className="icon-btn danger ml-1"
                    title="删除知识库"
                    action={removeLibrary.bind(null, project.id, l.id)}
                    confirm={{ title: `删除知识库「${l.name}」？`, body: "库内文档将一并隐藏，可在回收站恢复（恢复后为私有）。", danger: true }}
                    success="已删除，可在回收站恢复"
                  >
                    <Trash2 size={15} />
                  </ActionButton>
                </div>
              </li>
            ))}
          </ul>
        </Section>

        <Section id="mcp" title="MCP 接入" desc="让 Claude、Cursor 等 AI 客户端通过 MCP 直接把本项目的已发布文档当作语料库检索和阅读。令牌只读，可随时吊销。">
          <McpTokens projectId={project.id} slug={project.slug} endpoint={`${appUrl()}/api/mcp/${project.slug}`} tokens={tokens} />
        </Section>

        <Section id="trash" title="回收站" desc="恢复误删的知识库、文档或分组（含子节点）。恢复的文档默认未发布，恢复的知识库默认私有。">
          {trashCount === 0 ? (
            <div className="text-sm muted py-4 text-center">回收站是空的</div>
          ) : (
            <>
              <ul className="divide-y divide-[var(--line)] -my-2">
                {trashPage === 1 &&
                  deadLibs.map((l) => (
                    <li key={`l${l.id}`} className="flex items-center gap-3 py-2.5">
                      <Library size={16} strokeWidth={1.8} className="muted shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{l.name}</div>
                        <div className="text-xs muted">知识库 · {l.docs} 篇文档 · 删除于 {fmtDate(l.deleted_at!, true)}</div>
                      </div>
                      <ActionButton className="btn btn-sm" action={bringBackLibrary.bind(null, project.id, l.id)} success="已恢复（私有）">
                        <RotateCcw size={14} /> 恢复
                      </ActionButton>
                    </li>
                  ))}
                {trash.map((n) => (
                  <li key={n.id} className="flex items-center gap-3 py-2.5">
                    {n.kind === "doc" ? <FileText size={16} strokeWidth={1.8} className="muted shrink-0" /> : <Folder size={16} strokeWidth={1.8} className="muted shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{n.title}</div>
                      <div className="text-xs muted truncate">
                        {n.library}
                        {n.count > 1 && ` · 含 ${n.count - 1} 个子节点`} · {n.by ?? "—"} 删除于 {fmtDate(n.deleted_at, true)}
                      </div>
                    </div>
                    <ActionButton className="btn btn-sm" action={bringBackNode.bind(null, project.id, n.id)} success="已恢复（未发布）">
                      <RotateCcw size={14} /> 恢复
                    </ActionButton>
                  </li>
                ))}
              </ul>
              <Pager page={trashPage} pages={Math.ceil(trashTotal / TRASH_PAGE)} total={trashCount} href={(p) => qs({ rp: String(p) }, "trash")} unit="项" />
            </>
          )}
        </Section>

        <Section
          id="tree"
          title="目录历史"
          desc="可撤销单次移动、排序、重命名或删除；撤销本身也会被记录。"
          action={
            <form className="flex gap-2 shrink-0" action={`/p/${slug}/settings#tree`}>
              {sp.rp && <input type="hidden" name="rp" value={sp.rp} />}
              <Select
                name="tl"
                size="sm"
                className="w-36"
                defaultValue={sp.tl ?? ""}
                submitOnChange
                aria-label="按知识库筛选"
                options={[{ value: "", label: "全部知识库" }, ...libs.map((l) => ({ value: String(l.id), label: l.name, hint: l.deleted_at ? "已删除" : undefined }))]}
              />
              <Select
                name="ta"
                size="sm"
                className="w-28"
                defaultValue={actFilter ?? ""}
                submitOnChange
                aria-label="按动作筛选"
                options={[{ value: "", label: "全部动作" }, ...Object.entries(TREE_LABEL).map(([value, label]) => ({ value, label }))]}
              />
            </form>
          }
        >
          {events.length === 0 ? (
            <div className="text-sm muted py-4 text-center">没有记录</div>
          ) : (
            <ul className="-mx-2">
              {events.map((e) => {
                const desc = describe(e);
                const revertible = ["move", "reorder", "rename", "delete"].includes(e.action);
                return (
                  <li key={e.id} className="group flex items-center gap-3 px-2 h-11 rounded-lg hover:bg-[var(--panel-2)]">
                    <time className="w-[92px] shrink-0 text-xs muted tabular-nums" title={fmtDate(e.created_at, true)}>{fmtDate(e.created_at, true).slice(5)}</time>
                    <span className={cx("w-[68px] shrink-0 text-center text-[11.5px] font-medium rounded-md py-0.5", TREE_TONE[e.action] ?? "muted bg-[var(--panel-2)] group-hover:bg-[var(--line)]")}>{TREE_LABEL[e.action] ?? e.action}</span>
                    <span className="min-w-0 flex-1 truncate text-sm">
                      <span className="font-medium">{e.title ?? (e.before?.name as string) ?? (e.after?.name as string) ?? e.library}</span>
                      {desc && <span className="muted text-[13px]"> · {desc}</span>}
                      {e.after?.reverting ? <span className="muted text-[13px]"> · 撤销自 #{String(e.after.reverting)}</span> : null}
                    </span>
                    <span className="hidden sm:flex items-center gap-1.5 shrink-0 text-xs muted max-w-[140px]">
                      <Avatar name={e.by ?? "?"} url={e.avatar} size={18} />
                      <span className="truncate">{e.by ?? "—"}</span>
                    </span>
                    <span className="w-8 shrink-0">
                      {revertible && (
                        <ActionButton
                          className="icon-btn opacity-0 group-hover:opacity-100 focus:opacity-100"
                          title="撤销这次变更"
                          action={revertEvent.bind(null, project.id, e.id)}
                          confirm={{ title: "撤销这次目录变更？", body: `${TREE_LABEL[e.action]}「${e.title ?? ""}」${desc ? `（${desc}）` : ""}` , confirmText: "撤销" }}
                          success="已撤销"
                        >
                          <Undo2 size={15} />
                        </ActionButton>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          <Pager page={treePage} pages={Math.ceil(treeTotal / TREE_PAGE)} total={treeTotal} href={(p) => qs({ tp: String(p) }, "tree")} />
        </Section>
      </div>
    </main>
  );
}
