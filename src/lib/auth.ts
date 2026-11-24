import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { sql } from "./db";
import { randomToken, sha256 } from "./crypto";

export const SESSION_COOKIE = "folio_session";
const SESSION_DAYS = 30;

export type User = {
  id: number;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  is_site_admin: boolean;
};

export const secureCookies = () => (process.env.APP_URL || "").startsWith("https://");

export async function createSession(userId: number) {
  const token = randomToken();
  const expires = new Date(Date.now() + SESSION_DAYS * 86400_000);
  await sql`INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (${sha256(token)}, ${userId}, ${expires})`;
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: secureCookies(),
    sameSite: "lax",
    path: "/",
    expires,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await sql`DELETE FROM sessions WHERE token_hash = ${sha256(token)}`;
  jar.delete(SESSION_COOKIE);
}

export const currentUser = cache(async (): Promise<User | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const [u] = await sql<User[]>`
    SELECT u.id, u.username, u.display_name, u.avatar_url, u.is_site_admin
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ${sha256(token)} AND s.expires_at > now()`;
  return u ?? null;
});

export async function requireUser(returnTo = "/"): Promise<User> {
  const u = await currentUser();
  if (!u) redirect(`/api/auth/login?return_to=${encodeURIComponent(returnTo)}`);
  return u;
}

export async function requireSiteAdmin(): Promise<User> {
  const u = await requireUser("/admin");
  if (!u.is_site_admin) redirect("/");
  return u;
}

export async function clientIp(): Promise<string | null> {
  const h = await headers();
  return h.get("cf-connecting-ip") || h.get("x-forwarded-for")?.split(",")[0].trim() || null;
}

export const displayName = (u: { username: string; display_name: string | null }) => u.display_name || u.username;
