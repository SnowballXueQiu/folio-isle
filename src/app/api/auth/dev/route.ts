import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { createSession } from "@/lib/auth";
import { appUrl } from "@/lib/settings";
import { safeReturnTo } from "@/lib/util";

/** Local development only: log in as a fake SSO user. Disabled unless DEV_LOGIN=1 and not in production. */
export async function GET(req: Request) {
  if (process.env.NODE_ENV === "production" || process.env.DEV_LOGIN !== "1") return new NextResponse("not found", { status: 404 });
  const p = new URL(req.url).searchParams;
  const username = (p.get("u") || "dev").replace(/[^\w-]/g, "");
  const [{ n }] = await sql<{ n: number }[]>`SELECT count(*)::int n FROM users`;
  const [u] = await sql<{ id: number }[]>`
    INSERT INTO users (provider, provider_uid, username, is_site_admin, last_login_at) VALUES ('dev', ${username}, ${username}, ${n === 0}, now())
    ON CONFLICT (provider, provider_uid) DO UPDATE SET last_login_at = now() RETURNING id`;
  await createSession(u.id);
  return NextResponse.redirect(new URL(safeReturnTo(p.get("return_to")), appUrl()));
}
