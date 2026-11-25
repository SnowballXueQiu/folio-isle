import { TopBar } from "@/components/TopBar";
import { ProjectTabs } from "@/components/ProjectTabs";
import { MobileTabBar } from "@/components/MobileTabBar";
import { projectTabs } from "@/lib/project-tabs";
import { currentUser } from "@/lib/auth";
import { loadProject, projectRole, ROLE_LABEL } from "@/lib/perms";

export default async function ProjectLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const project = await loadProject(slug);
  const role = await projectRole(await currentUser(), project.id);
  const tabs = projectTabs(role);
  return (
    <>
      <TopBar crumbs={[{ href: `/p/${slug}`, label: project.name }]} />
      <div className="border-b hairline bg-[var(--panel)]">
        <div className="shell pt-4 pb-4 md:pt-5 md:pb-0">
          <div className="flex items-center gap-3">
            <h1 className="text-lg md:text-xl font-semibold truncate">{project.name}</h1>
            {role && <span className="chip">{ROLE_LABEL[role]}</span>}
          </div>
          {project.description && <p className="muted text-sm mt-1 line-clamp-2">{project.description}</p>}
          <div className="mt-3 hidden md:block">
            <ProjectTabs slug={slug} tabs={tabs} />
          </div>
        </div>
      </div>
      {children}
      <MobileTabBar slug={slug} tabs={tabs} />
    </>
  );
}
