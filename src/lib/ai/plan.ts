// Planning: which AI results the current published state of a project needs.
// Every key includes the exact document versions, model and rules version, so
// re-publishing one document only creates tasks for the pairs that involve it.
import { createHash } from "node:crypto";
import type { Db } from "../db";
import { RULES_VERSION } from "./prompts";

export type CurrentDoc = { id: number; title: string; vid: number; library_id: number; library: string };

export async function currentDocs(db: Db, projectId: number): Promise<CurrentDoc[]> {
  return db<CurrentDoc[]>`
    SELECT n.id, n.title, n.published_version_id AS vid, n.library_id, l.name AS library
    FROM nodes n JOIN libraries l ON l.id = n.library_id
    WHERE l.project_id = ${projectId} AND n.kind = 'doc' AND n.deleted_at IS NULL AND l.deleted_at IS NULL
      AND n.published_version_id IS NOT NULL
    ORDER BY l.position, l.id, n.id`;
}

export type PlannedTask = { kind: "doc" | "pair" | "library" | "project"; key: string; priority: number; payload: Record<string, unknown> };

export const inputHash = (inputs: [number, number][]) =>
  createHash("sha256").update(JSON.stringify([...inputs].sort((a, b) => a[0] - b[0]))).digest("hex").slice(0, 24);

export function planFor(projectId: number, docs: CurrentDoc[], model: string): PlannedTask[] {
  const tail = `${model}:${RULES_VERSION}`;
  const tasks: PlannedTask[] = [];
  for (const d of docs) tasks.push({ kind: "doc", key: `doc:${d.vid}:${tail}`, priority: 1, payload: { node: d.id, vid: d.vid, model } });
  const sorted = [...docs].sort((a, b) => a.id - b.id);
  for (let i = 0; i < sorted.length; i++)
    for (let j = i + 1; j < sorted.length; j++) {
      const a = sorted[i], b = sorted[j];
      tasks.push({ kind: "pair", key: `pair:${a.vid}:${b.vid}:${tail}`, priority: 3, payload: { na: a.id, va: a.vid, nb: b.id, vb: b.vid, model } });
    }
  const byLib = new Map<number, CurrentDoc[]>();
  docs.forEach((d) => byLib.set(d.library_id, [...(byLib.get(d.library_id) ?? []), d]));
  for (const [lib, list] of byLib) {
    const inputs = list.map((d) => [d.id, d.vid] as [number, number]);
    tasks.push({ kind: "library", key: `lib:${lib}:${inputHash(inputs)}:${tail}`, priority: 2, payload: { libraryId: lib, inputs, hash: inputHash(inputs), model } });
  }
  if (docs.length) {
    const inputs = docs.map((d) => [d.id, d.vid] as [number, number]);
    tasks.push({ kind: "project", key: `proj:${projectId}:${inputHash(inputs)}:${tail}`, priority: 2, payload: { inputs, hash: inputHash(inputs), model } });
  }
  return tasks;
}

/** Insert missing tasks, revive cancelled ones that are needed again, cancel ones no longer needed. */
export async function applyPlan(db: Db, projectId: number, tasks: PlannedTask[]) {
  const keys = tasks.map((t) => t.key);
  const CHUNK = 2000;
  for (let i = 0; i < tasks.length; i += CHUNK) {
    const part = tasks.slice(i, i + CHUNK);
    await db`
      INSERT INTO ai_tasks (project_id, kind, dedupe_key, payload, priority)
      SELECT ${projectId}, k, d, p::jsonb, pr
      FROM unnest(${part.map((t) => t.kind)}::text[], ${part.map((t) => t.key)}::text[], ${part.map((t) => JSON.stringify(t.payload))}::text[], ${part.map((t) => t.priority)}::int[]) AS x(k, d, p, pr)
      ON CONFLICT (dedupe_key) DO UPDATE SET status = 'queued', attempts = 0, throttles = 0, run_after = now(), last_error = NULL, updated_at = now()
        WHERE ai_tasks.status = 'cancelled'`;
  }
  const cancelled = await db`
    UPDATE ai_tasks SET status = 'cancelled', updated_at = now()
    WHERE project_id = ${projectId} AND status IN ('queued', 'failed') AND NOT (dedupe_key = ANY(${keys}::text[]))
    RETURNING id`;
  return { needed: keys.length, cancelled: cancelled.length };
}

export async function progress(db: Db, projectId: number, model: string) {
  const docs = await currentDocs(db, projectId);
  const tasks = planFor(projectId, docs, model);
  const keys = tasks.map((t) => t.key);
  const rows = await db<{ kind: string; status: string; n: number }[]>`
    SELECT kind, status, count(*)::int AS n FROM ai_tasks WHERE dedupe_key = ANY(${keys}::text[]) GROUP BY kind, status`;
  const sum = (f: (r: (typeof rows)[number]) => boolean) => rows.filter(f).reduce((a, r) => a + r.n, 0);
  const pairsTotal = tasks.filter((t) => t.kind === "pair").length;
  return {
    docs: docs.length,
    total: keys.length,
    done: sum((r) => r.status === "done"),
    failed: sum((r) => r.status === "failed"),
    running: sum((r) => r.status === "running"),
    queued: sum((r) => r.status === "queued"),
    missing: keys.length - sum(() => true),
    pairsTotal,
    pairsDone: sum((r) => r.kind === "pair" && r.status === "done"),
  };
}
