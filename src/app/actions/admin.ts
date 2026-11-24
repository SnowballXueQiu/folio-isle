"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { tx } from "@/lib/db";
import { requireSiteAdmin, clientIp } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { saveAiConfig, saveSsoConfig } from "@/lib/settings";

const url = z.string().trim().url().max(500);

export async function saveSso(form: FormData) {
  const user = await requireSiteAdmin();
  const d = z
    .object({
      providerId: z.string().trim().regex(/^[\w.-]{1,40}$/),
      providerName: z.string().trim().min(1).max(60),
      authorizeUrl: url,
      tokenUrl: url,
      userinfoUrl: url,
      clientId: z.string().trim().min(1).max(200),
      clientSecret: z.string().max(500).optional(),
      scope: z.string().trim().max(200),
      fieldUid: z.string().trim().min(1).max(60),
      fieldUsername: z.string().trim().min(1).max(60),
      fieldName: z.string().trim().max(60),
      fieldAvatar: z.string().trim().max(60),
    })
    .parse(Object.fromEntries(form));
  await tx(async (t) => {
    await saveSsoConfig(t, user.id, { ...d, clientSecret: d.clientSecret || undefined });
    const { clientSecret, ...safe } = d;
    await audit(t, { actorId: user.id, objectType: "settings", objectId: "sso", action: "settings.sso", detail: { ...safe, secret_changed: !!clientSecret }, ip: await clientIp() });
  });
  revalidatePath("/admin");
}

export async function saveAi(form: FormData) {
  const user = await requireSiteAdmin();
  const d = z
    .object({ providerName: z.string().trim().min(1).max(60), baseUrl: url, model: z.string().trim().min(1).max(100), apiKey: z.string().max(500).optional() })
    .parse(Object.fromEntries(form));
  await tx(async (t) => {
    await saveAiConfig(t, user.id, { ...d, apiKey: d.apiKey || undefined });
    await audit(t, { actorId: user.id, objectType: "settings", objectId: "ai", action: "settings.ai", detail: { providerName: d.providerName, baseUrl: d.baseUrl, model: d.model, key_changed: !!d.apiKey }, ip: await clientIp() });
  });
  revalidatePath("/admin");
}

export async function setSiteAdmin(userId: number, admin: boolean) {
  const user = await requireSiteAdmin();
  if (userId === user.id && !admin) throw new Error("不能取消自己的站点管理员身份");
  await tx(async (t) => {
    await t`UPDATE users SET is_site_admin = ${admin} WHERE id = ${userId}`;
    await audit(t, { actorId: user.id, objectType: "user", objectId: userId, action: "user.admin", detail: { is_site_admin: admin }, ip: await clientIp() });
  });
  revalidatePath("/admin");
}
