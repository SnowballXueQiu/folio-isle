import { z } from "zod";
import { handler, json } from "@/lib/api";
import { nodeCtx, idParam } from "@/lib/guard";
import { tx } from "@/lib/db";
import { deleteNode, renameNode } from "@/lib/docs";

export const PATCH = handler(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const id = await idParam(params);
  const { ctx } = await nodeCtx(id);
  const { title } = z.object({ title: z.string().trim().min(1).max(120) }).parse(await req.json());
  await tx((t) => renameNode(t, ctx, id, title));
  return json({ ok: true });
});

export const DELETE = handler(async (_req, { params }: { params: Promise<{ id: string }> }) => {
  const id = await idParam(params);
  const { ctx } = await nodeCtx(id);
  await tx((t) => deleteNode(t, ctx, id));
  return json({ ok: true });
});
