import { z } from "zod";
import { handler, json } from "@/lib/api";
import { nodeCtx, idParam } from "@/lib/guard";
import { tx } from "@/lib/db";
import { publish } from "@/lib/docs";

export const POST = handler(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const id = await idParam(params);
  const { ctx } = await nodeCtx(id);
  const body = z.object({ versionId: z.number().int().optional() }).parse(await req.json().catch(() => ({})));
  await tx((t) => publish(t, ctx, id, body.versionId));
  return json({ ok: true });
});
