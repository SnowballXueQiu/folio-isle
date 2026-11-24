import { z } from "zod";
import { handler, json } from "@/lib/api";
import { nodeCtx, idParam } from "@/lib/guard";
import { tx } from "@/lib/db";
import { moveNode } from "@/lib/docs";

export const POST = handler(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const id = await idParam(params);
  const { ctx } = await nodeCtx(id);
  const body = z.object({ libraryId: z.number().int(), parentId: z.number().int().nullable(), index: z.number().int().min(0) }).parse(await req.json());
  await tx((t) => moveNode(t, ctx, id, body));
  return json({ ok: true });
});
