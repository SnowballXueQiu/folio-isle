import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { sql } from "@/lib/db";
import { randomToken, sha256 } from "@/lib/crypto";
import { appUrl, getSsoConfig } from "@/lib/settings";
import { log } from "@/lib/log";
import { safeReturnTo } from "@/lib/util";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const cfg = await getSsoConfig();
  if (!cfg.authorizeUrl || !cfg.clientId) {
    return new NextResponse("SSO 尚未配置：请在环境变量或站点设置中配置 OAuth2 提供方。", { status: 503 });
  }
  const returnTo = safeReturnTo(new URL(req.url).searchParams.get("return_to"));
  const state = randomToken(24);
  const verifier = randomToken(48);
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  await sql`DELETE FROM oauth_states WHERE created_at < now() - interval '15 minutes'`;
  await sql`INSERT INTO oauth_states (state_hash, code_verifier, return_to) VALUES (${sha256(state)}, ${verifier}, ${returnTo})`;
  const u = new URL(cfg.authorizeUrl);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", cfg.clientId);
  u.searchParams.set("redirect_uri", `${appUrl()}/api/auth/callback`);
  if (cfg.scope) u.searchParams.set("scope", cfg.scope);
  u.searchParams.set("state", state);
  u.searchParams.set("code_challenge", challenge);
  u.searchParams.set("code_challenge_method", "S256");
  log.info("auth.login.redirect", { provider: cfg.providerId });
  return NextResponse.redirect(u.toString(), 302);
}
