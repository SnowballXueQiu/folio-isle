// Structured JSON logs to stdout, optionally shipped to ClickHouse.
// Never pass document bodies, API keys, tokens or secrets in fields.

type Level = "debug" | "info" | "warn" | "error";
type Fields = Record<string, unknown>;

const service = () => process.env.FOLIO_SERVICE || "web";
const CH_URL = process.env.CLICKHOUSE_URL; // e.g. http://clickhouse:8123
const CH_DB = process.env.CLICKHOUSE_DB || "folio";
const REDACT = /(key|secret|token|password|authorization|content|body)$/i;

let buffer: string[] = [];
let timer: NodeJS.Timeout | null = null;
let ready: Promise<void> | null = null;

function clean(fields: Fields): Fields {
  const out: Fields = {};
  for (const [k, v] of Object.entries(fields)) {
    if (REDACT.test(k)) continue;
    out[k] = v instanceof Error ? v.message : v;
  }
  return out;
}

async function chQuery(q: string, body?: string) {
  const url = `${CH_URL}/?query=${encodeURIComponent(q)}`;
  const headers: Record<string, string> = {};
  if (process.env.CLICKHOUSE_USER) headers["X-ClickHouse-User"] = process.env.CLICKHOUSE_USER;
  if (process.env.CLICKHOUSE_PASSWORD) headers["X-ClickHouse-Key"] = process.env.CLICKHOUSE_PASSWORD;
  const res = await fetch(url, { method: "POST", body: body ?? "", headers, signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`clickhouse ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res;
}

export async function ensureClickhouse() {
  if (!CH_URL) return;
  const days = Number(process.env.CLICKHOUSE_TTL_DAYS || 30);
  await chQuery(`CREATE DATABASE IF NOT EXISTS ${CH_DB}`);
  await chQuery(
    `CREATE TABLE IF NOT EXISTS ${CH_DB}.logs (ts DateTime64(3), level LowCardinality(String), service LowCardinality(String), event String, fields String) ENGINE = MergeTree ORDER BY (ts, service) TTL toDateTime(ts) + INTERVAL ${days} DAY`
  );
}

async function flush() {
  timer = null;
  if (!buffer.length || !CH_URL) return;
  const rows = buffer;
  buffer = [];
  try {
    ready ??= ensureClickhouse();
    await ready;
    await chQuery(`INSERT INTO ${CH_DB}.logs FORMAT JSONEachRow`, rows.join("\n"));
  } catch (e) {
    ready = null;
    // ClickHouse is optional: never let it break the app.
    process.stdout.write(JSON.stringify({ ts: new Date().toISOString(), level: "warn", service: service(), event: "clickhouse.unavailable", error: String(e) }) + "\n");
  }
}

function emit(level: Level, event: string, fields: Fields = {}) {
  const f = clean(fields);
  const ts = new Date();
  process.stdout.write(JSON.stringify({ ts: ts.toISOString(), level, service: service(), event, ...f }) + "\n");
  if (CH_URL) {
    buffer.push(JSON.stringify({ ts: ts.toISOString().replace("T", " ").replace("Z", ""), level, service: service(), event, fields: JSON.stringify(f) }));
    if (buffer.length > 2000) buffer = buffer.slice(-2000);
    timer ??= setTimeout(flush, 2000);
  }
}

export const log = {
  debug: (e: string, f?: Fields) => process.env.LOG_DEBUG && emit("debug", e, f),
  info: (e: string, f?: Fields) => emit("info", e, f),
  warn: (e: string, f?: Fields) => emit("warn", e, f),
  error: (e: string, f?: Fields) => emit("error", e, f),
};

export const LOG_PAGE = 50;

export async function queryLogs(opts: { level?: string; service?: string; q?: string; hours?: number; page?: number }) {
  if (!CH_URL) return null;
  ready ??= ensureClickhouse();
  await ready.catch((e) => ((ready = null), Promise.reject(e)));
  const where: string[] = [`ts > now() - INTERVAL ${Math.min(Math.max(opts.hours ?? 24, 1), 24 * 30)} HOUR`];
  const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  if (opts.service) where.push(`service = '${esc(opts.service)}'`);
  if (opts.q) where.push(`(positionCaseInsensitive(event, '${esc(opts.q)}') > 0 OR positionCaseInsensitive(fields, '${esc(opts.q)}') > 0)`);
  const base = where.join(" AND ");
  const filtered = opts.level ? `${base} AND level = '${esc(opts.level)}'` : base;
  const page = Math.max(1, opts.page ?? 1);
  const [rowsRes, countRes] = await Promise.all([
    chQuery(`SELECT toString(ts) AS ts_text, level, service, event, fields FROM ${CH_DB}.logs WHERE ${filtered} ORDER BY ts DESC LIMIT ${LOG_PAGE} OFFSET ${(page - 1) * LOG_PAGE} FORMAT JSON`),
    chQuery(`SELECT level, count() AS n FROM ${CH_DB}.logs WHERE ${base} GROUP BY level FORMAT JSON`),
  ]);
  const rows = ((await rowsRes.json()) as { data: { ts_text: string; level: string; service: string; event: string; fields: string }[] }).data.map(({ ts_text, ...r }) => ({ ts: ts_text, ...r }));
  const counts = Object.fromEntries(((await countRes.json()) as { data: { level: string; n: string }[] }).data.map((r) => [r.level, Number(r.n)]));
  const total = opts.level ? counts[opts.level] ?? 0 : Object.values(counts).reduce((a, b) => a + b, 0);
  return { rows, counts, total, page, pages: Math.max(1, Math.ceil(total / LOG_PAGE)) };
}
