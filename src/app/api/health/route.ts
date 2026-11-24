import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await sql`SELECT 1`;
    const [w] = await sql<{ age: number | null }[]>`SELECT extract(epoch FROM now() - max(seen_at))::int AS age FROM worker_heartbeats`;
    return Response.json({ status: "ok", db: "ok", worker_heartbeat_age_s: w?.age ?? null, clickhouse: process.env.CLICKHOUSE_URL ? "configured" : "disabled" });
  } catch {
    return Response.json({ status: "error", db: "down" }, { status: 503 });
  }
}
