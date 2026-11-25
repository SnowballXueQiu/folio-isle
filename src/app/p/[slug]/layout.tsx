import { TopBar } from "@/components/TopBar";
import { ProjectTabs } from "@/components/ProjectTabs";
import { currentUser } from "@/lib/auth";
import { loadProject, projectRole, ROLE_LABEL } from "@/lib/perms";

export default async function ProjectLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const project = await loadProject(slug);
  const role = await projectRole(await currentUser(), project.id);
  const tabs = [{ key: "", label: "知识库" }];
  if (role) tabs.push({ key: "todos", label: "待办" }, { key: "notes", label: "随笔" }, { key: "ai", label: "AI 分析" });
  if (role === "admin") tabs.push({ key: "settings", label: "设置" }, { key: "audit", label: "审计" });
  return (
    <>
      <TopBar crumbs={[{ href: `/p/${slug}`, label: project.name }]} />
      <div className="border-b hairline bg-[var(--panel)]">
        <div className="shell pt-5">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold">{project.name}</h1>
            {role && <span className="chip">{ROLE_LABEL[role]}</span>}
          </div>
          {project.description && <p className="muted text-sm mt-1">{project.description}</p>}
          <div className="mt-3">
            <ProjectTabs slug={slug} tabs={tabs} />
          </div>
        </div>
      </div>
      {children}
    </>
  );
}
