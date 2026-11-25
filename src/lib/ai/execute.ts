// Executes one AI task. Results are written with ON CONFLICT DO NOTHING, so a task
// that is retried after a crash never produces duplicate rows.
import type { Db } from "../db";
import type { AiConfig } from "../settings";
import { chatJson } from "./provider";
import { docPrompt, pairPrompt, libraryPrompt, projectPrompt, RULES_VERSION, RELATIONS, type Relation } from "./prompts";
import { markdownToPlain, normalizeForMatch, quoteInText } from "../md/plain";

export class DeferError extends Error {}

export type TaskRow = { id: number; project_id: number; kind: "doc" | "pair" | "library" | "project"; payload: Record<string, unknown>; attempts: number; throttles: number };

const DOC_CHARS = 12000;
const PAIR_CHARS = 7000;

export type DocAnalysis = { summary: string; key_points: { point: string; quote: string | null; verified: boolean }[]; topics: string[]; entity?: boolean; aliases?: string[] };

async function versionText(db: Db, vid: number) {
  const [v] = await db<{ title: string; content: string; node_id: number }[]>`SELECT title, content, node_id FROM doc_versions WHERE id = ${vid}`;
  if (!v) throw new Error(`version ${vid} missing`);
  const plain = markdownToPlain(v.content);
  return { title: v.title, plain, norm: normalizeForMatch(plain) };
}

async function analysis(db: Db, vid: number, model: string): Promise<DocAnalysis | null> {
  const [r] = await db<{ result: DocAnalysis }[]>`SELECT result FROM ai_doc_analyses WHERE version_id = ${vid} AND model = ${model} AND rules_version = ${RULES_VERSION}`;
  return r?.result ?? null;
}

async function depsOrDefer(db: Db, vids: number[], model: string) {
  const out: DocAnalysis[] = [];
  for (const vid of vids) {
    const a = await analysis(db, vid, model);
    if (!a) {
      const [t] = await db<{ status: string }[]>`SELECT status FROM ai_tasks WHERE dedupe_key = ${`doc:${vid}:${model}:${RULES_VERSION}`}`;
      if (t?.status === "failed") throw new Error("依赖的单篇分析失败，请重试失败任务");
      throw new DeferError("等待单篇分析完成");
    }
    out.push(a);
  }
  return out;
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const arr = (v: unknown) => (Array.isArray(v) ? v : []);

export async function executeTask(db: Db, cfg: AiConfig, task: TaskRow) {
  const p = task.payload;
  const model = String(p.model);

  if (task.kind === "doc") {
    const vid = Number(p.vid);
    if (await analysis(db, vid, model)) return { note: "exists" };
    const v = await versionText(db, vid);
    const { data, usage } = await chatJson<{ summary?: unknown; key_points?: unknown; topics?: unknown; entity?: unknown; aliases?: unknown }>(cfg, model, docPrompt(v.title, v.plain.slice(0, DOC_CHARS) || "（空文档）"));
    const result: DocAnalysis = {
      summary: str(data.summary, 400) || "（无摘要）",
      key_points: arr(data.key_points)
        .slice(0, 8)
        .map((k) => {
          const point = str((k as { point?: unknown }).point, 80);
          const quote = str((k as { quote?: unknown }).quote, 200);
          const verified = !!quote && quoteInText(quote, v.norm);
          return { point, quote: verified ? quote : null, verified };
        })
        .filter((k) => k.point),
      topics: arr(data.topics).map((t) => str(t, 20)).filter(Boolean).slice(0, 8),
      entity: data.entity === true,
      // aliases must literally appear in the document, so a hallucinated name never becomes a link
      aliases:
        data.entity === true
          ? [...new Set(arr(data.aliases).map((a) => str(a, 12)))].filter((a) => [...a].length >= 2 && a !== v.title && v.norm.includes(normalizeForMatch(a))).slice(0, 5)
          : [],
    };
    await db`INSERT INTO ai_doc_analyses (project_id, node_id, version_id, model, rules_version, result)
             VALUES (${task.project_id}, ${Number(p.node)}, ${vid}, ${model}, ${RULES_VERSION}, ${db.json(result as never)})
             ON CONFLICT (version_id, model, rules_version) DO NOTHING`;
    return { usage };
  }

  if (task.kind === "pair") {
    const [na, va, nb, vb] = [p.na, p.va, p.nb, p.vb].map(Number);
    const [exists] = await db`SELECT 1 FROM ai_pair_results WHERE version_a = ${va} AND version_b = ${vb} AND model = ${model} AND rules_version = ${RULES_VERSION}`;
    if (exists) return { note: "exists" };
    const [sa, sb] = await depsOrDefer(db, [va, vb], model);
    const [a, b] = [await versionText(db, va), await versionText(db, vb)];
    const { data, usage } = await chatJson<{ relation?: unknown; direction?: unknown; reason?: unknown; evidence_a?: unknown; evidence_b?: unknown }>(
      cfg,
      model,
      pairPrompt({ title: a.title, text: a.plain.slice(0, PAIR_CHARS), summary: sa.summary }, { title: b.title, text: b.plain.slice(0, PAIR_CHARS), summary: sb.summary }),
      { maxTokens: 800 }
    );
    const raw = RELATIONS.includes(data.relation as Relation) ? (data.relation as Relation) : "none";
    const evA = arr(data.evidence_a).map((q) => str(q, 200)).filter((q) => q && quoteInText(q, a.norm)).slice(0, 3);
    const evB = arr(data.evidence_b).map((q) => str(q, 200)).filter((q) => q && quoteInText(q, b.norm)).slice(0, 3);
    let relation: Relation = raw;
    let reason = str(data.reason, 300) || "—";
    // a relation is only kept when both sides have verifiable quotes from the exact versions
    if (raw !== "none" && (!evA.length || !evB.length)) {
      relation = "none";
      reason = `模型判断为「${raw}」，但未能在两篇原文中都找到可验证的引用，按未发现明确关联处理。${reason}`;
    }
    const direction = relation === "prerequisite" && (data.direction === "a_before_b" || data.direction === "b_before_a") ? data.direction : null;
    await db`INSERT INTO ai_pair_results (project_id, node_a, version_a, node_b, version_b, model, rules_version, relation, direction, reason, evidence, raw_relation)
             VALUES (${task.project_id}, ${na}, ${va}, ${nb}, ${vb}, ${model}, ${RULES_VERSION}, ${relation}, ${direction}, ${reason},
                     ${db.json({ a: relation === "none" ? [] : evA, b: relation === "none" ? [] : evB })}, ${raw})
             ON CONFLICT (version_a, version_b, model, rules_version) DO NOTHING`;
    return { usage, relation };
  }

  if (task.kind === "library") {
    const libraryId = Number(p.libraryId);
    const inputs = p.inputs as [number, number][];
    const hash = String(p.hash);
    const [exists] = await db`SELECT 1 FROM ai_summaries WHERE project_id = ${task.project_id} AND scope = 'library' AND library_id = ${libraryId} AND input_hash = ${hash} AND model = ${model} AND rules_version = ${RULES_VERSION}`;
    if (exists) return { note: "exists" };
    const analyses = await depsOrDefer(db, inputs.map((i) => i[1]), model);
    const [lib] = await db<{ name: string }[]>`SELECT name FROM libraries WHERE id = ${libraryId}`;
    const docs = await Promise.all(inputs.map(async ([id, vid], i) => ({ id, title: (await versionText(db, vid)).title, summary: analyses[i].summary })));
    const { data, usage } = await chatJson<{ summary?: unknown; highlights?: unknown; gaps?: unknown }>(cfg, model, libraryPrompt(lib?.name ?? "", docs));
    const ids = new Set(inputs.map((i) => i[0]));
    const content = {
      summary: str(data.summary, 800),
      highlights: arr(data.highlights)
        .map((h) => ({ doc_id: Number((h as { doc_id?: unknown }).doc_id), point: str((h as { point?: unknown }).point, 80) }))
        .filter((h) => ids.has(h.doc_id) && h.point),
      gaps: arr(data.gaps).map((g) => str(g, 120)).filter(Boolean).slice(0, 3),
    };
    await db`INSERT INTO ai_summaries (project_id, scope, library_id, input_hash, inputs, model, rules_version, content)
             VALUES (${task.project_id}, 'library', ${libraryId}, ${hash}, ${db.json(inputs)}, ${model}, ${RULES_VERSION}, ${db.json(content)})
             ON CONFLICT DO NOTHING`;
    return { usage };
  }

  if (task.kind === "project") {
    const inputs = p.inputs as [number, number][];
    const hash = String(p.hash);
    const [exists] = await db`SELECT 1 FROM ai_summaries WHERE project_id = ${task.project_id} AND scope = 'project' AND input_hash = ${hash} AND model = ${model} AND rules_version = ${RULES_VERSION}`;
    if (exists) return { note: "exists" };
    const analyses = await depsOrDefer(db, inputs.map((i) => i[1]), model);
    const [proj] = await db<{ name: string }[]>`SELECT name FROM projects WHERE id = ${task.project_id}`;
    const meta = await db<{ id: number; title: string; library: string }[]>`
      SELECT n.id, v.title, l.name AS library FROM nodes n JOIN libraries l ON l.id = n.library_id
      JOIN doc_versions v ON v.id = ANY(${inputs.map((i) => i[1])}::bigint[]) AND v.node_id = n.id`;
    const byId = new Map(meta.map((m) => [m.id, m]));
    const libs = new Map<string, { id: number; title: string; summary: string }[]>();
    inputs.forEach(([id], i) => {
      const m = byId.get(id);
      const l = m?.library ?? "未分类";
      libs.set(l, [...(libs.get(l) ?? []), { id, title: m?.title ?? `#${id}`, summary: analyses[i].summary }]);
    });
    const { data, usage } = await chatJson<{ overview?: unknown; themes?: unknown; suggestions?: unknown }>(
      cfg,
      model,
      projectPrompt(proj?.name ?? "", [...libs].map(([name, docs]) => ({ name, docs }))),
      { maxTokens: 2500 }
    );
    const ids = new Set(inputs.map((i) => i[0]));
    const content = {
      overview: str(data.overview, 1200),
      themes: arr(data.themes)
        .map((t) => ({ title: str((t as { title?: unknown }).title, 40), doc_ids: arr((t as { doc_ids?: unknown }).doc_ids).map(Number).filter((x) => ids.has(x)) }))
        .filter((t) => t.title)
        .slice(0, 8),
      suggestions: arr(data.suggestions).map((s) => str(s, 160)).filter(Boolean).slice(0, 3),
    };
    await db`INSERT INTO ai_summaries (project_id, scope, library_id, input_hash, inputs, model, rules_version, content)
             VALUES (${task.project_id}, 'project', NULL, ${hash}, ${db.json(inputs)}, ${model}, ${RULES_VERSION}, ${db.json(content)})
             ON CONFLICT DO NOTHING`;
    return { usage };
  }
  throw new Error(`unknown task kind ${task.kind}`);
}
