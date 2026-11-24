import { z } from "zod";
import { handler, json } from "@/lib/api";
import { nodeCtx, idParam } from "@/lib/guard";
import { tx } from "@/lib/db";
import { rollback } from "@/lib/docs";

/** Project admins only. Creates a new draft version; history is kept. */
export const POST = handler(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const id = await idParam(params);
  const { ctx } = await nodeCtx(id, "admin");
  const { versionId } = z.object({ versionId: z.number().int() }).parse(await req.json());
  const newId = await tx((t) => rollback(t, ctx, id, versionId));
  return json({ ok: true, versionId: newId });
});
