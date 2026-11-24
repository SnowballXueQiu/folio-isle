import { currentUser } from "@/lib/auth";
import { loadProject, requireProjectRole } from "@/lib/perms";
import { sql } from "@/lib/db";
import { publicAiConfig } from "@/lib/settings";
import { progress } from "@/lib/ai/plan";
import { setAiPaused, retryFailed, replan, disableAi } from "@/app/actions/ai";
import { ConfirmButton } from "@/components/SettingsBits";
import { fmtDate } from "@/lib/util";

export const dynamic = "force-dynamic";
export const metadata = { title: "AI 任务" };

const KIND: Record<string, string> = { doc: "单篇分析", pair: "文档对", library: "单库总结", project: "项目总览" };

export default async function AiTasks({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const project = await loadProject(slug);
  const role = await requireProjectRole(await currentUser(), project);
  if (!project.ai_enabled) return null;
  const cfg = await publicAiConfig();
  const pr = await progress(sql, project.id, cfg.model);
  const failed = await sql<{ id: number; kind: string; last_error: string | null; attempts: number; updated_at: Date }[]>`
    SELECT id, kind, last_error, attempts, updated_at FROM ai_tasks WHERE project_id = ${project.id} AND status = 'failed' ORDER BY id DESC LIMIT 50`;
  const waiting = await sql<{ id: number; kind: string; last_error: string | null; run_after: Date; throttles: number }[]>`
    SELECT id, kind, last_error, run_after, throttles FROM ai_tasks WHERE project_id = ${project.id} AND status = 'queued' AND last_error IS NOT NULL ORDER BY run_after LIMIT 10`;
  const [hb] = await sql<{ age: number | null }[]>`SELECT extract(epoch FROM now() - max(seen_at))::int AS age FROM worker_heartbeats`;
  const isAdmin = role === "admin";
  const stat = (label: string, v: number, color?: string) => (
    <div className="panel p-4">
      <div className="text-xs muted">{label}</div>
      <div className="text-2xl font-semibold mt-1 tabular-nums" style={{ color }}>{v}</div>
    </div>
  );
  return (
    <div className="space-y-6 max-w-5xl">
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {stat("总数", pr.total)}
        {stat("已完成", pr.done)}
        {stat("进行中", pr.running)}
        {stat("排队", pr.queued + pr.missing)}
        {stat("失败", pr.failed, pr.failed ? "#d12c43" : undefined)}
      </div>
      <div className="panel p-4 text-sm flex flex-wrap items-center gap-3">
        <span>
          {pr.docs} 篇已发布文档 · 文档对 {pr.pairsDone}/{pr.pairsTotal} ·
          后台 worker：{hb?.age == null ? <span className="text-[#d12c43]">未运行</span> : hb.age < 60 ? <span className="text-[#278a43]">在线</span> : <span className="text-[#d12c43]">{hb.age} 秒前离线</span>}
          {project.ai_paused && <span className="text-[#b08a00]"> · 已暂停</span>}
        </span>
        <span className="flex-1" />
        {isAdmin && (
          <>
            <ConfirmButton action={setAiPaused.bind(null, project.id, !project.ai_paused)}>{project.ai_paused ? "继续" : "暂停"}</ConfirmButton>
            <ConfirmButton action={retryFailed.bind(null, project.id)} confirmText={pr.failed ? `重试 ${pr.failed} 个失败任务？` : undefined}>重试失败</ConfirmButton>
            <ConfirmButton action={replan.bind(null, project.id)}>重新检查</ConfirmButton>
            <ConfirmButton className="btn btn-sm btn-danger" action={disableAi.bind(null, project.id)} confirmText="停用后不再发送文档，排队中的任务会取消，已生成的结果保留。确定停用？">停用 AI</ConfirmButton>
          </>
        )}
      </div>
      <div className="text-xs muted">
        每篇文档先生成带原文引用的摘要，再与其他每篇文档组成无序对逐一分析；结果按两篇正文版本、模型（{cfg.model}）和分析规则版本去重。重新发布某篇文档时只会重算涉及它的文档对。
      </div>
      {waiting.length > 0 && (
        <section className="panel">
          <div className="p-4 font-semibold text-sm border-b hairline">等待重试</div>
          <table className="table-clean">
            <tbody>
              {waiting.map((t) => (
                <tr key={t.id}><td>#{t.id}</td><td>{KIND[t.kind]}</td><td className="muted">{t.last_error}</td><td className="text-xs muted whitespace-nowrap">{fmtDate(t.run_after, true)} 后</td></tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      <section className="panel">
        <div className="p-4 font-semibold text-sm border-b hairline">失败任务</div>
        {failed.length === 0 ? (
          <div className="p-4 text-sm muted">没有失败任务。</div>
        ) : (
          <table className="table-clean">
            <tbody>
              {failed.map((t) => (
                <tr key={t.id}><td>#{t.id}</td><td>{KIND[t.kind]}</td><td className="text-[#d12c43]">{t.last_error}</td><td className="text-xs muted">尝试 {t.attempts} 次</td><td className="text-xs muted whitespace-nowrap">{fmtDate(t.updated_at, true)}</td></tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
