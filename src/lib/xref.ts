// Cross references: published docs in a project's glossary (设定) libraries are entries; any other
// doc that mentions an entry's name gets a link with a hover card. Matching happens at render time,
// so the stored Markdown never changes and links follow renames, unpublishing and deletion instantly.
import "server-only";
import { sql } from "./db";
import { getAiConfig } from "./settings";
import { RULES_VERSION } from "./ai/prompts";
import type { DocAnalysis } from "./ai/execute";
import { markdownToPlain } from "./md/plain";

export type Entry = { id: number; title: string; library: string; names: string[] };

/** Names an entry is matched by: its title, the title without a trailing （…）/(…) note, spacing variants, AI aliases. */
export function entryNames(title: string, aliases: string[] = []): string[] {
  const out = new Set<string>();
  const add = (s: string) => {
    const t = s.trim();
    if ([...t].length >= 2) out.add(t);
  };
  add(title);
  add(title.replace(/\s*[（(][^）)]*[）)]\s*$/, ""));
  if (/\s/.test(title)) add(title.replace(/\s+/g, ""));
  aliases.forEach(add);
  return [...out];
}

/**
 * Glossary entries the viewer may see. AI results (aliases, the entity check) are used only for
 * project members when the project has AI enabled; otherwise every published glossary doc is an
 * entry matched by its title.
 */
export async function glossaryEntries(projectId: number, isMember: boolean): Promise<Entry[]> {
  const [p] = await sql<{ ai_enabled: boolean }[]>`SELECT ai_enabled FROM projects WHERE id = ${projectId}`;
  const useAi = isMember && !!p?.ai_enabled;
  const model = useAi ? (await getAiConfig()).model : "";
  const rows = await sql<{ id: number; title: string; library: string; result: DocAnalysis | null }[]>`
    SELECT n.id, n.title, l.name AS library, a.result
    FROM nodes n
    JOIN libraries l ON l.id = n.library_id
    LEFT JOIN ai_doc_analyses a ON ${useAi} AND a.version_id = n.published_version_id AND a.model = ${model} AND a.rules_version = ${RULES_VERSION}
    WHERE l.project_id = ${projectId} AND l.is_glossary AND l.deleted_at IS NULL
      AND n.kind = 'doc' AND n.deleted_at IS NULL AND n.published_version_id IS NOT NULL
      AND (l.is_public OR ${isMember})
    ORDER BY l.position, n.position, n.id`;
  return rows
    .filter((r) => !r.result || r.result.entity !== false) // AI said "not a named thing" (e.g. 前期, 武器)
    .map((r) => ({ id: r.id, title: r.title, library: r.library, names: entryNames(r.title, r.result?.aliases ?? []) }));
}

export type XrefCard = {
  id: number;
  title: string;
  library: string;
  glossary: boolean;
  summary: string;
  points: string[];
  ai: boolean;
};

/** Hover-card content for a published doc. AI summary for members when available, else the opening text. */
export async function xrefCard(nodeId: number, opts: { isMember: boolean; projectId: number }): Promise<XrefCard | null> {
  const [n] = await sql<{ id: number; title: string; library: string; glossary: boolean; vid: number; content: string; ai_enabled: boolean }[]>`
    SELECT n.id, n.title, l.name AS library, l.is_glossary AS glossary, v.id AS vid, v.content, p.ai_enabled
    FROM nodes n JOIN libraries l ON l.id = n.library_id JOIN projects p ON p.id = l.project_id
    JOIN doc_versions v ON v.id = n.published_version_id
    WHERE n.id = ${nodeId} AND n.deleted_at IS NULL AND l.deleted_at IS NULL AND l.project_id = ${opts.projectId}`;
  if (!n) return null;
  if (opts.isMember && n.ai_enabled) {
    const model = (await getAiConfig()).model;
    const [a] = await sql<{ result: DocAnalysis }[]>`
      SELECT result FROM ai_doc_analyses WHERE version_id = ${n.vid} AND model = ${model} ORDER BY (rules_version = ${RULES_VERSION}) DESC, created_at DESC LIMIT 1`;
    if (a?.result?.summary) {
      return { id: n.id, title: n.title, library: n.library, glossary: n.glossary, summary: a.result.summary, points: a.result.key_points.map((k) => k.point).slice(0, 3), ai: true };
    }
  }
  const plain = markdownToPlain(n.content).replace(/\s+/g, " ").trim();
  return { id: n.id, title: n.title, library: n.library, glossary: n.glossary, summary: plain.length > 140 ? plain.slice(0, 140) + "…" : plain || "（空文档）", points: [], ai: false };
}

export type Mention = { id: number; title: string; library: string; snippet: string; count: number };

/** Published docs (visible to the viewer) that mention any of the entry's names, with a snippet. */
export async function mentionsOf(entry: { id: number; projectId: number; names: string[] }, isMember: boolean): Promise<Mention[]> {
  if (!entry.names.length) return [];
  const patterns = entry.names.map((n) => `%${n.replace(/[\\%_]/g, (c) => "\\" + c)}%`);
  const rows = await sql<{ id: number; title: string; library: string; content: string }[]>`
    SELECT n.id, n.title, l.name AS library, v.content
    FROM nodes n JOIN libraries l ON l.id = n.library_id JOIN doc_versions v ON v.id = n.published_version_id
    WHERE l.project_id = ${entry.projectId} AND l.deleted_at IS NULL AND n.deleted_at IS NULL AND n.kind = 'doc'
      AND n.id <> ${entry.id} AND (l.is_public OR ${isMember})
      AND v.content LIKE ANY(${patterns}::text[])
    ORDER BY l.position, n.position, n.id
    LIMIT 50`;
  const names = [...entry.names].sort((a, b) => b.length - a.length);
  return rows
    .map((r) => {
      const plain = markdownToPlain(r.content).replace(/\s+/g, " ");
      let first = -1, hit = "", count = 0;
      for (const name of names) {
        let i = plain.indexOf(name);
        if (i >= 0 && (first < 0 || i < first)) (first = i), (hit = name);
        while (i >= 0) (count++, (i = plain.indexOf(name, i + name.length)));
      }
      if (first < 0) return null;
      const start = Math.max(0, first - 28);
      const snippet = (start > 0 ? "…" : "") + plain.slice(start, first + hit.length + 40).trim() + (first + hit.length + 40 < plain.length ? "…" : "");
      return { id: r.id, title: r.title, library: r.library, snippet, count };
    })
    .filter((m): m is Mention => !!m);
}
