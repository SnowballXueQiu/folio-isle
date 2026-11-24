import { TopBar } from "@/components/TopBar";
import { requireUser } from "@/lib/auth";
import { createProject } from "@/app/actions/project";

export const metadata = { title: "新建项目" };

export default async function NewProject({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await requireUser("/p/new");
  const { error } = await searchParams;
  return (
    <>
      <TopBar crumbs={[{ label: "新建项目" }]} />
      <main className="mx-auto max-w-lg px-4 py-12">
        <h1 className="text-2xl font-semibold">新建项目</h1>
        <p className="muted text-sm mt-1">项目包含知识库、待办、随笔和 AI 分析。你将成为项目管理员。</p>
        <form action={createProject} className="panel p-6 mt-6 space-y-4">
          {error && <div className="text-sm text-[#d12c43]">{error}</div>}
          <div>
            <label className="label" htmlFor="name">项目名称</label>
            <input id="name" name="name" className="input" required maxLength={60} placeholder="例如：Inf 服务器文档" />
          </div>
          <div>
            <label className="label" htmlFor="slug">链接标识</label>
            <div className="flex items-center gap-2">
              <span className="muted text-sm">/p/</span>
              <input id="slug" name="slug" className="input" required pattern="[a-z0-9][a-z0-9\-]{1,38}[a-z0-9]" placeholder="inf-docs" />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="description">简介</label>
            <textarea id="description" name="description" className="input" rows={3} maxLength={300} />
          </div>
          <button className="btn btn-primary w-full justify-center">创建项目</button>
        </form>
      </main>
    </>
  );
}
