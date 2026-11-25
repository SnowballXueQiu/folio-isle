import { handler, json } from "@/lib/api";
import { currentUser } from "@/lib/auth";
import { nodeAccess, HttpError } from "@/lib/perms";
import { xrefCard } from "@/lib/xref";

// Hover-card data for a cross-reference. Same visibility as reading the doc itself.
export const GET = handler(async (_req, { params }: { params: Promise<{ id: string }> }) => {
  const id = Number((await params).id);
  const acc = await nodeAccess(await currentUser(), id);
  if (!acc?.canReadPublished || acc.node.kind !== "doc" || !acc.node.published_version_id) throw new HttpError(404, "不存在");
  const card = await xrefCard(id, { isMember: !!acc.role, projectId: acc.project.id });
  if (!card) throw new HttpError(404, "不存在");
  return json(card);
});
