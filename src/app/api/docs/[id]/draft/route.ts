import { z } from "zod";
import { handler, json } from "@/lib/api";
import { nodeCtx, idParam } from "@/lib/guard";
import { tx } from "@/lib/db";
import { saveDraft } from "@/lib/docs";

const MAX = 2 * 1024 * 1024;

export const PUT = handler(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const id = await idParam(params);
  const { ctx } = await nodeCtx(id);
  const body = z
    .object({ title: z.string().trim().min(1).max(120), content: z.string().max(MAX), baseVersionId: z.number().int().nullable() })
    .parse(await req.json());
  const res = await tx((t) => saveDraft(t, ctx, id, body));
  return json(res, res.ok ? 200 : 409);
});
