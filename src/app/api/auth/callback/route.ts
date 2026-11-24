import { NextResponse } from "next/server";
import { sql, tx } from "@/lib/db";
import { sha256 } from "@/lib/crypto";
import { appUrl, getSsoConfig } from "@/lib/settings";
import { createSession, clientIp } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { log } from "@/lib/log";

export const dynamic = "force-dynamic";

function pick(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined), obj);
}

function fail(msg: string, status = 400) {
  return new NextResponse(
    `<!doctype html><meta charset="utf-8"><title>登录失败</title><body style="font-family:system-ui;padding:3rem;max-width:36rem;margin:auto"><h2>登录失败</h2><p>${msg.replace(/[<>&]/g, "")}</p><p><a href="/api/auth/login">重新登录</a> · <a href="/">返回首页</a></p>`,
    { status, headers: { "content-type": "text/html; charset=utf-8" } }
  );
}

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const state = params.get("state");
  const code = params.get("code");
  if (params.get("error")) return fail(`提供方返回错误：${params.get("error")}`);
  if (!state || !code) return fail("缺少 code 或 state。");

  // one-time state: consumed atomically, valid for 10 minutes
  const [st] = await sql<{ code_verifier: string; return_to: string }[]>`
    DELETE FROM oauth_states WHERE state_hash = ${sha256(state)} AND created_at > now() - interval '10 minutes'
    RETURNING code_verifier, return_to`;
  if (!st) return fail("state 无效或已使用，请重新登录。");

  const cfg = await getSsoConfig();
  let tokenJson: { access_token?: string; token_type?: string };
  try {
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: `${appUrl()}/api/auth/callback`,
      code_verifier: st.code_verifier,
      client_id: cfg.clientId,
    });
    const res = await fetch(cfg.tokenUrl, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        accept: "application/json",
        authorization: "Basic " + Buffer.from(`${encodeURIComponent(cfg.clientId)}:${encodeURIComponent(cfg.clientSecret)}`).toString("base64"),
      },
      body,
      signal: AbortSignal.timeout(15000),
    });
    tokenJson = await res.json();
    if (!res.ok || !tokenJson.access_token) {
      log.warn("auth.token.failed", { status: res.status });
      return fail("换取令牌失败。", 502);
    }
  } catch (e) {
    log.error("auth.token.error", { error: String(e) });
    return fail("无法连接 SSO 提供方。", 502);
  }

  let profile: unknown;
  try {
    const res = await fetch(cfg.userinfoUrl, {
      headers: { authorization: `Bearer ${tokenJson.access_token}`, accept: "application/json" },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return fail("读取用户资料失败。", 502);
    profile = await res.json();
  } catch {
    return fail("读取用户资料失败。", 502);
  }

  const uid = pick(profile, cfg.fieldUid);
  const username = pick(profile, cfg.fieldUsername);
  if ((typeof uid !== "string" && typeof uid !== "number") || !String(uid)) return fail(`资料中缺少稳定 UID 字段「${cfg.fieldUid}」。`, 502);
  const uname = typeof username === "string" && username ? username : `user-${String(uid).slice(0, 8)}`;
  const name = pick(profile, cfg.fieldName);
  const avatar = pick(profile, cfg.fieldAvatar);
  const avatarUrl = typeof avatar === "string" && /^https?:\/\//.test(avatar) ? avatar : null;
  const ip = await clientIp();

  const userId = await tx(async (t) => {
    // the very first user of the site becomes site admin
    await t`LOCK TABLE users IN SHARE ROW EXCLUSIVE MODE`;
    const [{ n }] = await t<{ n: number }[]>`SELECT count(*)::int AS n FROM users`;
    const bootstrapAdmins = (process.env.SITE_ADMIN_USERNAMES || "").split(",").map((s) => s.trim()).filter(Boolean);
    const makeAdmin = n === 0 || bootstrapAdmins.includes(uname);
    const [u] = await t<{ id: number }[]>`
      INSERT INTO users (provider, provider_uid, username, display_name, avatar_url, is_site_admin, last_login_at)
      VALUES (${cfg.providerId}, ${String(uid)}, ${uname}, ${typeof name === "string" ? name : null}, ${avatarUrl}, ${makeAdmin}, now())
      ON CONFLICT (provider, provider_uid) DO UPDATE SET
        username = EXCLUDED.username, display_name = EXCLUDED.display_name, avatar_url = EXCLUDED.avatar_url,
        is_site_admin = users.is_site_admin OR EXCLUDED.is_site_admin, last_login_at = now()
      RETURNING id`;
    await audit(t, { actorId: u.id, objectType: "user", objectId: u.id, action: "user.login", detail: { provider: cfg.providerId }, ip });
    return u.id;
  });

  await createSession(userId);
  log.info("auth.login.ok", { userId, provider: cfg.providerId });
  return NextResponse.redirect(new URL(st.return_to, appUrl()), 302);
}
