"use server";
import { revalidatePath } from "next/cache";
import { tx } from "@/lib/db";
import { requireUser, clientIp } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { projectRole, atLeast, HttpError } from "@/lib/perms";
import { publicAiConfig } from "@/lib/settings";
import { currentDocs } from "@/lib/ai/plan";

async function admin(projectId: number) {
  const user = await requireUser();
  if (!atLeast(await projectRole(user, projectId), "admin")) throw new HttpError(403, "权限不足");
  return { actorId: user.id, projectId, ip: await clientIp() };
}

export async function enableAi(projectId: number) {
  const ctx = await admin(projectId);
  const cfg = await publicAiConfig();
  await tx(async (t) => {
    const docs = await currentDocs(t, projectId);
    await t`UPDATE projects SET ai_enabled = true, ai_paused = false, ai_enabled_at = now(), ai_plan_requested_at = now() WHERE id = ${projectId}`;
    await audit(t, { ...ctx, objectType: "ai", objectId: projectId, action: "ai.enable", detail: { provider: cfg.providerName, base_url: cfg.baseUrl, model: cfg.model, scope: "项目内公开及私有知识库的已发布文档标题和正文", docs: docs.length } });
    await t`SELECT pg_notify('folio_ai', ${String(projectId)})`;
  });
  revalidatePath("/p/[slug]/ai", "layout");
}

export async function disableAi(projectId: number) {
  const ctx = await admin(projectId);
  await tx(async (t) => {
    await t`UPDATE projects SET ai_enabled = false, ai_plan_requested_at = NULL WHERE id = ${projectId}`;
    await t`UPDATE ai_tasks SET status = 'cancelled', updated_at = now() WHERE project_id = ${projectId} AND status IN ('queued', 'failed')`;
    await audit(t, { ...ctx, objectType: "ai", objectId: projectId, action: "ai.disable" });
  });
  revalidatePath("/p/[slug]/ai", "layout");
}

export async function setAiPaused(projectId: number, paused: boolean) {
  const ctx = await admin(projectId);
  await tx(async (t) => {
    await t`UPDATE projects SET ai_paused = ${paused} WHERE id = ${projectId}`;
    await audit(t, { ...ctx, objectType: "ai", objectId: projectId, action: paused ? "ai.pause" : "ai.resume" });
    if (!paused) await t`SELECT pg_notify('folio_ai', ${String(projectId)})`;
  });
  revalidatePath("/p/[slug]/ai", "layout");
}

export async function retryFailed(projectId: number) {
  const ctx = await admin(projectId);
  await tx(async (t) => {
    const r = await t`UPDATE ai_tasks SET status = 'queued', attempts = 0, throttles = 0, run_after = now(), last_error = NULL, updated_at = now()
                      WHERE project_id = ${projectId} AND status = 'failed' RETURNING id`;
    await audit(t, { ...ctx, objectType: "ai", objectId: projectId, action: "ai.retry", detail: { count: r.length } });
    await t`SELECT pg_notify('folio_ai', ${String(projectId)})`;
  });
  revalidatePath("/p/[slug]/ai", "layout");
}

export async function replan(projectId: number) {
  const ctx = await admin(projectId);
  await tx(async (t) => {
    await t`UPDATE projects SET ai_plan_requested_at = now() WHERE id = ${projectId} AND ai_enabled`;
    await audit(t, { ...ctx, objectType: "ai", objectId: projectId, action: "ai.rebuild" });
    await t`SELECT pg_notify('folio_ai', ${String(projectId)})`;
  });
  revalidatePath("/p/[slug]/ai", "layout");
}
