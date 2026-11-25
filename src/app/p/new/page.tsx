import { TopBar } from "@/components/TopBar";
import { requireUser } from "@/lib/auth";
import { NewProjectForm } from "@/components/NewProjectForm";

export const metadata = { title: "新建项目" };

export default async function NewProject() {
  await requireUser("/p/new");
  return (
    <>
      <TopBar crumbs={[{ label: "新建项目" }]} />
      <main className="mx-auto max-w-lg px-4 py-8 sm:py-12">
        <h1 className="text-2xl font-semibold">新建项目</h1>
        <p className="muted text-sm mt-1">项目包含知识库、待办、随笔和 AI 分析。你将成为项目管理员。</p>
        <NewProjectForm />
      </main>
    </>
  );
}
