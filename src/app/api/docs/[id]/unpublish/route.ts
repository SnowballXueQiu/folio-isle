import { handler, json } from "@/lib/api";
import { nodeCtx, idParam } from "@/lib/guard";
import { tx } from "@/lib/db";
import { unpublish } from "@/lib/docs";

export const POST = handler(async (_req, { params }: { params: Promise<{ id: string }> }) => {
  const id = await idParam(params);
  const { ctx } = await nodeCtx(id);
  await tx((t) => unpublish(t, ctx, id));
  return json({ ok: true });
});
