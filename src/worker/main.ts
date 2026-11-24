// AI worker: PostgreSQL-backed queue (FOR UPDATE SKIP LOCKED), lease recovery,
// rate-limit backoff, pause/resume per project. Runs as its own container.
import { hostname } from "node:os";
import { writeFileSync } from "node:fs";
import { makeSql } from "../lib/db";
import { getAiConfig } from "../lib/settings";
import { log } from "../lib/log";
import { applyPlan, currentDocs, planFor } from "../lib/ai/plan";
import { executeTask, DeferError, type TaskRow } from "../lib/ai/execute";
import { RateLimitError, RetryableError, FatalError } from "../lib/ai/provider";
import { migrate } from "../scripts/migrate";

process.env.FOLIO_SERVICE ||= "worker";
const WORKER_ID = `${hostname()}-${process.pid}`;
const CONCURRENCY = Math.max(1, Number(process.env.AI_CONCURRENCY || 4));
const MAX_ATTEMPTS = 5;
const LEASE_MINUTES = 5;
const HEARTBEAT_FILE = process.env.WORKER_HEARTBEAT_FILE || "/tmp/worker-heartbeat";

const sql = makeSql(CONCURRENCY + 3);
let active = 0;
let stopping = false;
let pausedUntil = 0; // global backoff after a 429
let wake: () => void = () => {};

async function heartbeat() {
  await sql`INSERT INTO worker_heartbeats (worker_id, seen_at, info) VALUES (${WORKER_ID}, now(), ${sql.json({ active, concurrency: CONCURRENCY })})
            ON CONFLICT (worker_id) DO UPDATE SET seen_at = now(), info = EXCLUDED.info`;
  await sql`DELETE FROM worker_heartbeats WHERE seen_at < now() - interval '1 day'`;
  writeFileSync(HEARTBEAT_FILE, String(Date.now()));
}

async function recoverLeases() {
  const r = await sql`UPDATE ai_tasks SET status = 'queued', locked_by = NULL, locked_at = NULL, updated_at = now()
                      WHERE status = 'running' AND locked_at < now() - make_interval(mins => ${LEASE_MINUTES}) RETURNING id`;
  if (r.length) log.warn("ai.lease.recovered", { count: r.length });
}

async function planPending() {
  const projects = await sql<{ id: number; requested: Date }[]>`
    SELECT id, ai_plan_requested_at AS requested FROM projects WHERE ai_enabled AND ai_plan_requested_at IS NOT NULL`;
  if (!projects.length) return;
  const cfg = await getAiConfig(sql);
  for (const p of projects) {
    await sql.begin(async (t) => {
      await t`SELECT pg_advisory_xact_lock(7271002, ${p.id}::int)`;
      const docs = await currentDocs(t, p.id);
      const res = await applyPlan(t, p.id, planFor(p.id, docs, cfg.model));
      await t`UPDATE projects SET ai_plan_requested_at = NULL WHERE id = ${p.id} AND ai_plan_requested_at = ${p.requested}`;
      log.info("ai.plan", { projectId: p.id, docs: docs.length, ...res });
    });
  }
}

async function claim(): Promise<TaskRow | null> {
  const [t] = await sql<TaskRow[]>`
    UPDATE ai_tasks SET status = 'running', locked_by = ${WORKER_ID}, locked_at = now(), updated_at = now()
    WHERE id = (
      SELECT t.id FROM ai_tasks t JOIN projects p ON p.id = t.project_id
      WHERE t.status = 'queued' AND t.run_after <= now() AND p.ai_enabled AND NOT p.ai_paused
      ORDER BY t.priority, t.id
      FOR UPDATE OF t SKIP LOCKED LIMIT 1
    ) RETURNING id, project_id, kind, payload, attempts, throttles`;
  return t ?? null;
}

async function finish(task: TaskRow, patch: { status: "done" | "queued" | "failed"; delayMs?: number; error?: string | null; attempt?: boolean; throttle?: boolean }) {
  await sql`
    UPDATE ai_tasks SET status = ${patch.status},
      attempts = attempts + ${patch.attempt ? 1 : 0}, throttles = throttles + ${patch.throttle ? 1 : 0},
      run_after = now() + make_interval(secs => ${(patch.delayMs ?? 0) / 1000}),
      last_error = ${patch.error ?? null}, locked_by = NULL, locked_at = NULL, updated_at = now(),
      finished_at = ${patch.status === "done" ? new Date() : null}
    WHERE id = ${task.id} AND locked_by = ${WORKER_ID}`;
}

async function run(task: TaskRow) {
  const started = Date.now();
  try {
    const cfg = await getAiConfig(sql);
    const res = await executeTask(sql, cfg, task);
    await finish(task, { status: "done" });
    log.info("ai.task.done", { taskId: task.id, kind: task.kind, projectId: task.project_id, ms: Date.now() - started, ...("usage" in res && res.usage ? res.usage : {}) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (e instanceof DeferError) {
      await finish(task, { status: "queued", delayMs: 10_000, error: msg });
    } else if (e instanceof RateLimitError) {
      const backoff = e.retryAfterMs || Math.min(300_000, 5_000 * 2 ** Math.min(task.throttles, 6));
      pausedUntil = Date.now() + backoff;
      await finish(task, { status: "queued", delayMs: backoff, error: "提供方限流，稍后自动重试", throttle: true });
      log.warn("ai.rate_limited", { taskId: task.id, backoffMs: backoff });
    } else if (e instanceof FatalError) {
      await finish(task, { status: "failed", error: msg, attempt: true });
      log.error("ai.task.fatal", { taskId: task.id, kind: task.kind, error: msg });
    } else {
      const attempts = task.attempts + 1;
      const failed = attempts >= MAX_ATTEMPTS;
      const delay = Math.min(600_000, 10_000 * 2 ** task.attempts);
      // missing API key or no balance: wait without burning attempts
      const soft = e instanceof RetryableError && /未配置|余额/.test(msg);
      await finish(task, { status: failed && !soft ? "failed" : "queued", delayMs: soft ? 60_000 : delay, error: msg, attempt: !soft });
      log.warn("ai.task.retry", { taskId: task.id, kind: task.kind, attempts, failed, error: msg });
    }
  } finally {
    active--;
    wake();
  }
}

async function tick() {
  await heartbeat();
  await recoverLeases();
  await planPending();
  while (!stopping && active < CONCURRENCY && Date.now() >= pausedUntil) {
    const task = await claim();
    if (!task) break;
    active++;
    void run(task);
  }
}

async function main() {
  if (process.env.WORKER_MIGRATE !== "0") await migrate().catch((e) => log.warn("worker.migrate.skipped", { error: String(e) }));
  log.info("worker.start", { workerId: WORKER_ID, concurrency: CONCURRENCY });
  await sql.listen("folio_ai", () => wake()).catch((e) => log.warn("worker.listen.failed", { error: String(e) }));
  const shutdown = async () => {
    stopping = true;
    log.info("worker.stopping", { active });
    const deadline = Date.now() + 20_000;
    while (active > 0 && Date.now() < deadline) await new Promise((r) => setTimeout(r, 200));
    // anything still running is returned to the queue immediately
    await sql`UPDATE ai_tasks SET status = 'queued', locked_by = NULL, locked_at = NULL WHERE status = 'running' AND locked_by = ${WORKER_ID}`.catch(() => {});
    await sql.end({ timeout: 5 });
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
  while (!stopping) {
    try {
      await tick();
    } catch (e) {
      log.error("worker.tick.error", { error: e instanceof Error ? e.message : String(e) });
    }
    await new Promise<void>((resolve) => {
      const t = setTimeout(resolve, 3000);
      wake = () => {
        clearTimeout(t);
        resolve();
      };
    });
  }
}

main().catch((e) => {
  log.error("worker.crash", { error: String(e) });
  process.exit(1);
});
