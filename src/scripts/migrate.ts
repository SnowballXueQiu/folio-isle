import { readdirSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { makeSql } from "../lib/db";

export async function migrate() {
  const sql = makeSql(1);
  const dirs = [path.join(process.cwd(), "migrations"), path.join(__dirname, "..", "migrations")];
  const dir = dirs.find((d) => existsSync(d));
  if (!dir) throw new Error("migrations directory not found");
  try {
    await sql`SELECT pg_advisory_lock(7271001)`;
    await sql`CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`;
    const done = new Set((await sql<{ name: string }[]>`SELECT name FROM schema_migrations`).map((r) => r.name));
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
      if (done.has(f)) continue;
      const text = readFileSync(path.join(dir, f), "utf8");
      await sql.begin(async (t) => {
        await t.unsafe(text);
        await t`INSERT INTO schema_migrations (name) VALUES (${f})`;
      });
      console.log(JSON.stringify({ ts: new Date().toISOString(), level: "info", service: "migrate", event: "migration.applied", name: f }));
    }
    await sql`SELECT pg_advisory_unlock(7271001)`;
  } finally {
    await sql.end();
  }
}

if (require.main === module) {
  migrate().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
