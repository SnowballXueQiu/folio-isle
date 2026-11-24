import { notFound, redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { nodeAccess } from "@/lib/perms";
import { sql } from "@/lib/db";
import { DocEditor } from "@/components/editor/Editor";

export const dynamic = "force-dynamic";
export const metadata = { title: "编辑" };

export default async function EditPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const user = await currentUser();
  if (!user) redirect(`/api/auth/login?return_to=/d/${id}/edit`);
  const acc = await nodeAccess(user, id);
  if (!acc?.canEdit || acc.node.kind !== "doc") notFound();
  const [v] = acc.node.head_version_id
    ? await sql<{ id: number; content: string }[]>`SELECT id, content FROM doc_versions WHERE id = ${acc.node.head_version_id}`
    : [];
  return (
    <DocEditor
      docId={id}
      initial={{ title: acc.node.title, content: v?.content ?? "", versionId: v?.id ?? null }}
      published={!!acc.node.published_version_id}
      backHref={`/d/${id}`}
    />
  );
}
