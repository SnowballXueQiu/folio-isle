import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Live availability check for the new-project form. */
export async function GET(req: Request) {
  if (!(await currentUser())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const s = (new URL(req.url).searchParams.get("s") ?? "").trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(s)) return NextResponse.json({ valid: false, available: false });
  return NextResponse.json({ valid: true, available: (await sql`SELECT 1 FROM projects WHERE slug = ${s}`).length === 0 });
}
