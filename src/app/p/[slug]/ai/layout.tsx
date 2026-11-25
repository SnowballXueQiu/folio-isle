import { currentUser } from "@/lib/auth";
import { loadProject, requireProjectRole } from "@/lib/perms";
import { publicAiConfig } from "@/lib/settings";
import { currentDocs, progress } from "@/lib/ai/plan";
import { sql } from "@/lib/db";
import { enableAi } from "@/app/actions/ai";
import { AiTabs } from "@/components/ai/AiTabs";
import { ActionButton } from "@/components/ui/controls";

export const dynamic = "force-dynamic";

export default async function AiLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const project = await loadProject(slug);
  const role = await requireProjectRole(await currentUser(), project);
  const cfg = await publicAiConfig();

  if (!project.ai_enabled) {
    const docs = await currentDocs(sql, project.id);
    const libs = new Set(docs.map((d) => d.library));
    return (
      <main className="mx-auto max-w-2xl px-4 py-12">
        <div className="panel p-8">
          <div className="text-lg font-semibold">AI 分析尚未启用</div>
          <p className="muted text-sm mt-2 leading-relaxed">
            启用后，系统会为每篇已发布文档生成带原文引用的分析摘要，再把任意两篇文档组成一对逐一分析，并生成单库总结与项目总览。结果可通过星图或文字版查看。
          </p>
          {role === "admin" ? (
            <>
              <div className="mt-6 rounded-xl border hairline bg-[var(--panel-2)] p-4 text-sm space-y-2">
                <div><span className="muted">提供方：</span>{cfg.providerName}（{cfg.baseUrl}，模型 {cfg.model}）{!cfg.hasKey && <span className="text-[#d12c43]"> · 尚未配置密钥，请联系站点管理员</span>}</div>
                <div>
                  <span className="muted">发送范围：</span>本项目<strong>公开及私有</strong>知识库中全部<strong>已发布</strong>文档的标题和正文
                  （当前 {docs.length} 篇，来自 {libs.size} 个知识库：{[...libs].join("、") || "—"}）。以后新发布的文档也会自动发送分析。
                </div>
                <div><span className="muted">计算量：</span>{docs.length} 篇单篇分析 + {(docs.length * (docs.length - 1)) / 2} 个文档对 + 总结。</div>
              </div>
              <div className="mt-6">
                <ActionButton
                  className="btn btn-primary"
                  action={enableAi.bind(null, project.id)}
                  confirm={{ title: "启用 AI 分析？", body: `本项目已发布的文档（包括私有知识库）会发送至 ${cfg.providerName} 进行分析。之后可随时在此关闭。`, confirmText: "启用" }}
                  success="已启用，正在后台分析"
                >
                  我已了解发送范围，启用 AI 分析
                </ActionButton>
              </div>
            </>
          ) : (
            <p className="mt-6 text-sm">请联系项目管理员启用。</p>
          )}
        </div>
      </main>
    );
  }

  const pr = await progress(sql, project.id, cfg.model);
  const pct = pr.total ? Math.round((pr.done / pr.total) * 100) : 100;
  return (
    <main className="shell py-6">
      <div className="flex flex-wrap items-center gap-4">
        <AiTabs slug={slug} />
        <div className="flex items-center gap-3 text-sm muted">
          <div className="w-40 h-1.5 rounded-full bg-[var(--panel-2)] overflow-hidden border hairline">
            <div className="h-full bg-[var(--color-inf-cyan)]" style={{ width: `${pct}%` }} />
          </div>
          <span>
            {pr.done}/{pr.total} 已完成{pr.failed > 0 && <span className="text-[#d12c43]"> · {pr.failed} 失败</span>}
            {project.ai_paused && <span className="text-[#b08a00]"> · 已暂停</span>}
          </span>
        </div>
        <span className="text-xs muted ml-auto">{cfg.providerName} · {cfg.model}</span>
      </div>
      <div className="mt-5">{children}</div>
    </main>
  );
}
