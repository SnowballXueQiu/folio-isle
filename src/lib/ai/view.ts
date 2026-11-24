import "server-only";
import { sql } from "../db";
import { currentDocs, inputHash, type CurrentDoc } from "./plan";
import type { Relation } from "./prompts";

export type PairView = {
  a: number; b: number; va: number; vb: number; relation: Relation; direction: string | null; reason: string;
  evidence: { a: string[]; b: string[] }; raw_relation: string | null; created_at: Date;
};

/** Only results computed for the currently published versions are shown: unpublished/deleted docs vanish immediately. */
export async function currentPairs(projectId: number, docs: CurrentDoc[]): Promise<PairView[]> {
  if (docs.length < 2) return [];
  const vids = docs.map((d) => d.vid);
  return sql<PairView[]>`
    SELECT DISTINCT ON (r.version_a, r.version_b) r.node_a AS a, r.node_b AS b, r.version_a AS va, r.version_b AS vb,
      r.relation, r.direction, r.reason, r.evidence, r.raw_relation, r.created_at
    FROM ai_pair_results r
    WHERE r.project_id = ${projectId} AND r.version_a = ANY(${vids}::bigint[]) AND r.version_b = ANY(${vids}::bigint[])
    ORDER BY r.version_a, r.version_b, r.created_at DESC`;
}

export async function currentDocAnalyses(docs: CurrentDoc[]) {
  if (!docs.length) return new Map<number, { summary: string; key_points: { point: string; quote: string | null }[]; topics: string[] }>();
  const rows = await sql<{ node_id: number; result: { summary: string; key_points: { point: string; quote: string | null }[]; topics: string[] } }[]>`
    SELECT DISTINCT ON (version_id) node_id, result FROM ai_doc_analyses WHERE version_id = ANY(${docs.map((d) => d.vid)}::bigint[]) ORDER BY version_id, created_at DESC`;
  return new Map(rows.map((r) => [r.node_id, r.result]));
}

/** Summaries are shown only when their inputs equal the current published set. */
export async function currentSummaries(projectId: number, docs: CurrentDoc[]) {
  const byLib = new Map<number, [number, number][]>();
  docs.forEach((d) => byLib.set(d.library_id, [...(byLib.get(d.library_id) ?? []), [d.id, d.vid]]));
  const wanted = [...byLib].map(([lib, inputs]) => ({ lib, hash: inputHash(inputs) }));
  const projectHash = docs.length ? inputHash(docs.map((d) => [d.id, d.vid])) : "-";
  const rows = await sql<{ scope: string; library_id: number | null; input_hash: string; content: Record<string, unknown>; created_at: Date }[]>`
    SELECT DISTINCT ON (scope, library_id) scope, library_id, input_hash, content, created_at FROM ai_summaries
    WHERE project_id = ${projectId} AND input_hash = ANY(${[projectHash, ...wanted.map((w) => w.hash)]}::text[])
    ORDER BY scope, library_id, created_at DESC`;
  const project = rows.find((r) => r.scope === "project" && r.input_hash === projectHash) ?? null;
  const libraries = new Map<number, (typeof rows)[number]>();
  for (const w of wanted) {
    const r = rows.find((x) => x.scope === "library" && x.library_id === w.lib && x.input_hash === w.hash);
    if (r) libraries.set(w.lib, r);
  }
  return { project, libraries };
}

export async function aiSnapshot(projectId: number) {
  const docs = await currentDocs(sql, projectId);
  const [pairs, analyses, summaries] = await Promise.all([currentPairs(projectId, docs), currentDocAnalyses(docs), currentSummaries(projectId, docs)]);
  return { docs, pairs, analyses, summaries };
}
