import { currentUser, displayName } from "@/lib/auth";
import { sql } from "@/lib/db";
import { loadProject, requireProjectRole } from "@/lib/perms";
import { projectMembers } from "@/lib/project-data";
import { addMember, setMemberRole, updateProject, setLibraryVisibility, setLibraryGlossary, removeLibrary, bringBackLibrary, bringBackNode, revertEvent } from "@/app/actions/project";
import { AddMemberForm, RoleSelect, ConfirmButton } from "@/components/SettingsBits";
import { Avatar } from "@/components/Avatar";
import { fmtDate } from "@/lib/util";

export const dynamic = "force-dynamic";
export const metadata = { title: "项目设置" };

const TREE_LABEL: Record<string, string> = {
  create: "新建", move: "移动", reorder: "排序", rename: "重命名", delete: "删除", restore: "恢复",
  "library.create": "新建知识库", "library.delete": "删除知识库", "library.restore": "恢复知识库",
};

function Section({ id, title, desc, children }: { id: string; title: string; desc?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="panel p-5 scroll-mt-20">
      <h2 className="font-semibold">{title}</h2>
      {desc && <p className="text-sm muted mt-0.5">{desc}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

export default async function SettingsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const project = await loadProject(slug);
  const user = await currentUser();
  await requireProjectRole(user, project, "admin");
  const members = await projectMembers(project.id);
  const libs = await sql<{ id: number; name: string; is_public: boolean; is_glossary: boolean; deleted_at: Date | null }[]>`
    SELECT id, name, is_public, is_glossary, deleted_at FROM libraries WHERE project_id = ${project.id} ORDER BY deleted_at NULLS FIRST, position, id`;
  const trash = await sql<{ id: number; title: string; kind: string; library: string; deleted_at: Date; by: string | null; count: number }[]>`
    SELECT n.id, n.title, n.kind, l.name AS library, n.deleted_at, u.username AS by,
      (SELECT count(*)::int FROM nodes x WHERE x.delete_batch = n.delete_batch) AS count
    FROM nodes n JOIN libraries l ON l.id = n.library_id LEFT JOIN users u ON u.id = n.deleted_by
    WHERE l.project_id = ${project.id} AND n.deleted_at IS NOT NULL
      AND (n.parent_id IS NULL OR NOT EXISTS (SELECT 1 FROM nodes p WHERE p.id = n.parent_id AND p.delete_batch = n.delete_batch))
    ORDER BY n.deleted_at DESC LIMIT 100`;
  const events = await sql<{ id: number; node_id: number | null; action: string; before: Record<string, unknown> | null; after: Record<string, unknown> | null; created_at: Date; by: string | null; title: string | null; library: string | null }[]>`
    SELECT e.id, e.node_id, e.action, e.before, e.after, e.created_at, u.username AS by, n.title, l.name AS library
    FROM tree_events e LEFT JOIN users u ON u.id = e.actor_id LEFT JOIN nodes n ON n.id = e.node_id LEFT JOIN libraries l ON l.id = e.library_id
    WHERE e.project_id = ${project.id} ORDER BY e.id DESC LIMIT 100`;
  const libName = new Map(libs.map((l) => [l.id, l.name]));
  const describe = (e: (typeof events)[number]) => {
    const b = e.before ?? {}, a = e.after ?? {};
    if (e.action === "rename") return `「${b.title}」→「${a.title}」`;
    if (e.action === "move") return `${libName.get(Number(b.library_id)) ?? ""} 第 ${Number(b.index) + 1} 位 → ${libName.get(Number(a.library_id)) ?? ""}${a.parent_id ? ` 子节点` : " 根目录"} 第 ${Number(a.index) + 1} 位`;
    if (e.action === "reorder") return `第 ${Number(b.index) + 1} 位 → 第 ${Number(a.index) + 1} 位`;
    if (e.action === "delete") return `共 ${a.count} 个节点`;
    return "";
  };

  return (
    <main className="mx-auto max-w-[1000px] px-4 py-8 space-y-6">
      <nav className="flex gap-4 text-sm muted">
        <a href="#general" className="hover:underline">基本信息</a>
        <a href="#members" className="hover:underline">成员</a>
        <a href="#libraries" className="hover:underline">知识库</a>
        <a href="#trash" className="hover:underline">回收站</a>
        <a href="#tree" className="hover:underline">目录历史</a>
      </nav>

      <Section id="general" title="基本信息">
        <form action={updateProject.bind(null, project.id)} className="space-y-3 max-w-lg">
          <input name="name" className="input" defaultValue={project.name} required maxLength={60} />
          <textarea name="description" className="input" rows={2} defaultValue={project.description} maxLength={300} />
          <button className="btn btn-sm">保存</button>
        </form>
      </Section>

      <Section id="members" title="成员与角色" desc="管理员：管理成员、可见性、恢复与 AI；编辑者：写作、发布、维护待办和随笔；成员：阅读并更新自己负责的待办。">
        <AddMemberForm action={addMember.bind(null, project.id)} />
        <table className="table-clean mt-4">
          <tbody>
            {members.map((m) => (
              <tr key={m.id}>
                <td className="w-10"><Avatar name={displayName(m)} url={m.avatar_url} /></td>
                <td>
                  <div className="font-medium">{displayName(m)}</div>
                  <div className="text-xs muted">@{m.username}</div>
                </td>
                <td className="text-right"><RoleSelect action={setMemberRole.bind(null, project.id, m.id)} role={m.role} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section id="libraries" title="知识库" desc="知识库默认私有，公开后游客可阅读其已发布文档和评论；恢复的知识库默认私有。设定库里的文档是词条：其他知识库的正文提到词条名时，会自动出现交叉引用和悬浮说明。">
        <table className="table-clean">
          <tbody>
            {libs.map((l) => (
              <tr key={l.id}>
                <td className="font-medium">{l.name}{l.deleted_at && <span className="chip ml-2">已删除 {fmtDate(l.deleted_at, true)}</span>}</td>
                <td className="text-right space-x-2 whitespace-nowrap">
                  {l.deleted_at ? (
                    <ConfirmButton action={bringBackLibrary.bind(null, project.id, l.id)}>恢复（私有）</ConfirmButton>
                  ) : (
                    <>
                      <ConfirmButton
                        action={setLibraryVisibility.bind(null, project.id, l.id, !l.is_public)}
                        confirmText={l.is_public ? "改为私有？游客将无法再访问。" : "公开后任何人都能阅读该库已发布的文档和评论，确定公开？"}
                      >
                        {l.is_public ? "🌐 公开 · 改为私有" : "🔒 私有 · 设为公开"}
                      </ConfirmButton>
                      <ConfirmButton
                        action={setLibraryGlossary.bind(null, project.id, l.id, !l.is_glossary)}
                        confirmText={l.is_glossary ? `取消「${l.name}」的设定库身份？其他文档将不再自动链接到这里的词条。` : `把「${l.name}」设为设定库？库里已发布的文档会成为词条，其他文档提到它们时会自动出现交叉引用。`}
                      >
                        {l.is_glossary ? "📚 设定库 · 取消" : "设为设定库"}
                      </ConfirmButton>
                      <ConfirmButton className="btn btn-sm btn-danger" action={removeLibrary.bind(null, project.id, l.id)} confirmText={`删除知识库「${l.name}」？可在此处恢复。`}>
                        删除
                      </ConfirmButton>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section id="trash" title="回收站" desc="恢复误删的文档或分组（含其子节点）。恢复的文档默认未发布。">
        {trash.length === 0 ? (
          <div className="text-sm muted">回收站是空的。</div>
        ) : (
          <table className="table-clean">
            <tbody>
              {trash.map((n) => (
                <tr key={n.id}>
                  <td>
                    <div className="font-medium">{n.title}</div>
                    <div className="text-xs muted">{n.library} · {n.kind === "doc" ? "文档" : "分组"}{n.count > 1 && ` · 含 ${n.count - 1} 个子节点`}</div>
                  </td>
                  <td className="text-xs muted">{fmtDate(n.deleted_at, true)} · @{n.by}</td>
                  <td className="text-right"><ConfirmButton action={bringBackNode.bind(null, project.id, n.id)}>恢复</ConfirmButton></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <Section id="tree" title="目录变更历史" desc="可撤销单次移动、排序、重命名或删除；撤销本身也会被记录。">
        <table className="table-clean">
          <tbody>
            {events.map((e) => (
              <tr key={e.id}>
                <td className="whitespace-nowrap text-xs muted">{fmtDate(e.created_at, true)}</td>
                <td className="whitespace-nowrap">@{e.by ?? "—"}</td>
                <td>
                  <span className="chip mr-2">{TREE_LABEL[e.action] ?? e.action}</span>
                  <span className="font-medium">{e.title ?? (e.before?.name as string) ?? (e.after?.name as string) ?? e.library}</span>
                  <div className="text-xs muted mt-0.5">{describe(e)}{e.after?.reverting ? ` · 撤销自 #${e.after.reverting}` : ""}</div>
                </td>
                <td className="text-right">
                  {["move", "reorder", "rename", "delete"].includes(e.action) && (
                    <ConfirmButton action={revertEvent.bind(null, project.id, e.id)} confirmText="撤销这次目录变更？">撤销</ConfirmButton>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
    </main>
  );
}
