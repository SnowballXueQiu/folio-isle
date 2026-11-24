import { z } from "zod";
import { handler, json } from "@/lib/api";
import { libraryCtx, idParam } from "@/lib/guard";
import { tx } from "@/lib/db";
import { createNode } from "@/lib/docs";

export const POST = handler(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const libraryId = await idParam(params);
  const { ctx } = await libraryCtx(libraryId);
  const body = z.object({ parentId: z.number().int().nullable(), kind: z.enum(["doc", "group"]), title: z.string().trim().min(1).max(120) }).parse(await req.json());
  const id = await tx((t) => createNode(t, ctx, { libraryId, ...body }));
  return json({ id });
});
