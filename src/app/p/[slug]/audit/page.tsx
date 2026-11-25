import { currentUser } from "@/lib/auth";
import { loadProject, requireProjectRole } from "@/lib/perms";
import { queryAudit, type AuditFilter } from "@/lib/audit-query";
import { AuditView } from "@/components/AuditTable";

export const dynamic = "force-dynamic";
export const metadata = { title: "审计" };

export default async function AuditPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string>> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const project = await loadProject(slug);
  await requireProjectRole(await currentUser(), project, "admin");
  const filter: AuditFilter = { actor: sp.actor, objectType: sp.objectType, objectId: sp.objectId, action: sp.action, from: sp.from, to: sp.to };
  const { rows, total, page, pages } = await queryAudit({ ...filter, projectId: project.id, page: Number(sp.page) || 1 });
  return (
    <main className="shell py-8">
      <AuditView base={`/p/${slug}/audit`} filter={filter} rows={rows} total={total} pages={pages} page={page} />
    </main>
  );
}
