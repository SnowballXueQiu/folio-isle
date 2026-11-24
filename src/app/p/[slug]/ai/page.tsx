import { currentUser } from "@/lib/auth";
import { loadProject, requireProjectRole } from "@/lib/perms";
import { aiSnapshot } from "@/lib/ai/view";
import { StarMap, type MapEdge } from "@/components/ai/StarMap";

export const dynamic = "force-dynamic";
export const metadata = { title: "AI 星图" };

export default async function StarMapPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const project = await loadProject(slug);
  await requireProjectRole(await currentUser(), project);
  if (!project.ai_enabled) return null;
  const { docs, pairs } = await aiSnapshot(project.id);
  const libIds = [...new Set(docs.map((d) => d.library_id))];
  const libraries = libIds.map((id, index) => ({ index, name: docs.find((d) => d.library_id === id)!.library }));
  const mapDocs = docs.map((d) => ({ id: d.id, title: d.title, vid: d.vid, libIndex: libIds.indexOf(d.library_id), library: d.library }));
  const edges = pairs.filter((p) => p.relation !== "none").map((p) => ({ ...p, relation: p.relation as MapEdge["relation"] }));
  return <StarMap docs={mapDocs} edges={edges} libraries={libraries} />;
}
