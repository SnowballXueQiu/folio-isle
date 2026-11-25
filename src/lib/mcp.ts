import "server-only";
// Read-only MCP server for one project: lets external agents use the project's published docs as a corpus.
// Transport: MCP Streamable HTTP, stateless, JSON responses (no SSE). Auth: per-project bearer token.
import { sql } from "./db";
import { sha256 } from "./crypto";
import { appUrl } from "./settings";

export const MCP_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];

export type TokenCtx = { tokenId: number; projectId: number; slug: string; projectName: string; description: string; includePrivate: boolean };

export async function authenticate(slug: string, header: string | null): Promise<TokenCtx | null> {
  const m = header?.match(/^Bearer\s+(\S+)$/i);
  if (!m) return null;
  const [row] = await sql<{ id: number; project_id: number; include_private: boolean; slug: string; name: string; description: string }[]>`
    SELECT t.id, t.project_id, t.include_private, p.slug, p.name, p.description
    FROM project_tokens t JOIN projects p ON p.id = t.project_id
    WHERE t.token_hash = ${sha256(m[1])} AND t.revoked_at IS NULL AND p.slug = ${slug}`;
  if (!row) return null;
  await sql`UPDATE project_tokens SET last_used_at = now(), use_count = use_count + 1 WHERE id = ${row.id}`;
  return { tokenId: row.id, projectId: row.project_id, slug: row.slug, projectName: row.name, description: row.description, includePrivate: row.include_private };
}

type Json = Record<string, unknown>;
type Tool = { name: string; title: string; description: string; inputSchema: Json; run: (c: TokenCtx, a: Json) => Promise<string> };

const visibleLibs = (c: TokenCtx) => sql`
  SELECT id FROM libraries WHERE project_id = ${c.projectId} AND deleted_at IS NULL ${c.includePrivate ? sql`` : sql`AND is_public`}`;

const docUrl = (id: number) => `${appUrl()}/d/${id}`;
const int = (v: unknown, def: number, min: number, max: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.trunc(n))) : def;
};
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** A short window of text around the first match, with markdown syntax softened. */
function snippet(content: string, terms: string[], width = 160) {
  const flat = content.replace(/```[\s\S]*?```/g, " ").replace(/[#>*_`|\[\]]+/g, " ").replace(/\s+/g, " ");
  const low = flat.toLowerCase();
  const at = Math.max(0, ...terms.map((t) => low.indexOf(t.toLowerCase())).filter((i) => i >= 0).slice(0, 1));
  const start = Math.max(0, at - width / 3);
  return (start > 0 ? "…" : "") + flat.slice(start, start + width).trim() + (start + width < flat.length ? "…" : "");
}

const TOOLS: Tool[] = [
  {
    name: "get_project_overview",
    title: "项目概览",
    description: "Project name, description and its knowledge libraries (id, name, description, number of published docs). Call this first to see what the corpus contains.",
    inputSchema: { type: "object", properties: {} },
    async run(c) {
      const libs = await sql<{ id: number; name: string; description: string; is_public: boolean; is_glossary: boolean; docs: number }[]>`
        SELECT l.id, l.name, l.description, l.is_public, l.is_glossary,
               (SELECT count(*)::int FROM nodes n WHERE n.library_id = l.id AND n.kind = 'doc' AND n.deleted_at IS NULL AND n.published_version_id IS NOT NULL) AS docs
        FROM libraries l WHERE l.id IN (${visibleLibs(c)}) ORDER BY l.position, l.id`;
      const lines = [`# ${c.projectName}`, c.description || "", "", "## Libraries"];
      for (const l of libs)
        lines.push(`- [${l.id}] ${l.name}${l.is_glossary ? " (glossary: entries other docs reference)" : ""}${l.is_public ? "" : " (private)"} — ${l.docs} docs${l.description ? ` — ${l.description}` : ""}`);
      if (!libs.length) lines.push("(no libraries visible to this token)");
      return lines.join("\n");
    },
  },
  {
    name: "list_documents",
    title: "文档目录",
    description: "Table of contents of published documents, as an indented tree with document ids. Optionally limited to one library.",
    inputSchema: { type: "object", properties: { library_id: { type: "integer", description: "Only this library (from get_project_overview)." } } },
    async run(c, a) {
      const lib = a.library_id !== undefined ? int(a.library_id, 0, 0, Number.MAX_SAFE_INTEGER) : null;
      const rows = await sql<{ id: number; parent_id: number | null; kind: string; title: string; library_id: number; lib: string; published: boolean }[]>`
        SELECT n.id, n.parent_id, n.kind, n.title, n.library_id, l.name AS lib, n.published_version_id IS NOT NULL AS published
        FROM nodes n JOIN libraries l ON l.id = n.library_id
        WHERE n.library_id IN (${visibleLibs(c)}) AND n.deleted_at IS NULL ${lib ? sql`AND n.library_id = ${lib}` : sql``}
        ORDER BY l.position, l.id, n.position, n.id`;
      const kids = new Map<number | null, (typeof rows)[number][]>();
      for (const r of rows) kids.set(r.parent_id, [...(kids.get(r.parent_id) ?? []), r]);
      // a group is shown only if it contains something published
      const has = (id: number): boolean => (kids.get(id) ?? []).some((k) => (k.kind === "doc" ? k.published : has(k.id)));
      const out: string[] = [];
      let lastLib = -1;
      const walk = (parent: number | null, depth: number) => {
        for (const r of kids.get(parent) ?? []) {
          if (r.kind === "doc" ? !r.published : !has(r.id)) continue;
          if (depth === 0 && r.library_id !== lastLib) (out.push(`\n## ${r.lib} [library ${r.library_id}]`), (lastLib = r.library_id));
          out.push(`${"  ".repeat(depth)}- ${r.kind === "group" ? `${r.title}/` : `[${r.id}] ${r.title}`}`);
          if (r.kind === "group") walk(r.id, depth + 1);
        }
      };
      walk(null, 0);
      return out.length ? out.join("\n").trim() : "No published documents.";
    },
  },
  {
    name: "search_documents",
    title: "搜索文档",
    description: "Full-text search over published documents (title and body, case-insensitive; all words must match). Returns ids, titles, library and a snippet. Use read_document for the full text.",
    inputSchema: {
      type: "object",
      properties: { query: { type: "string", description: "Keywords separated by spaces." }, limit: { type: "integer", minimum: 1, maximum: 30, default: 10 } },
      required: ["query"],
    },
    async run(c, a) {
      const terms = str(a.query).split(/\s+/).filter(Boolean).slice(0, 8);
      if (!terms.length) return "Empty query.";
      const limit = int(a.limit, 10, 1, 30);
      const like = (t: string) => `%${t.replace(/[\\%_]/g, (m) => "\\" + m)}%`;
      const cond = terms.map((t) => sql`(v.title ILIKE ${like(t)} OR v.content ILIKE ${like(t)})`).reduce((x, y) => sql`${x} AND ${y}`);
      const rows = await sql<{ id: number; title: string; lib: string; content: string; title_hit: boolean; published_at: Date }[]>`
        SELECT n.id, v.title, l.name AS lib, v.content, (v.title ILIKE ${like(terms[0])}) AS title_hit, n.published_at
        FROM nodes n JOIN doc_versions v ON v.id = n.published_version_id JOIN libraries l ON l.id = n.library_id
        WHERE n.library_id IN (${visibleLibs(c)}) AND n.deleted_at IS NULL AND ${cond}
        ORDER BY title_hit DESC, n.published_at DESC NULLS LAST LIMIT ${limit}`;
      if (!rows.length) return `No documents match "${terms.join(" ")}".`;
      return rows.map((r) => `[${r.id}] ${r.title} — ${r.lib}\n${snippet(r.content, terms)}\n${docUrl(r.id)}`).join("\n\n");
    },
  },
  {
    name: "read_document",
    title: "读取文档",
    description: "Full published Markdown of one document by id, with its library, publish time and URL. Glossary terms in the text may be cross-references to other docs.",
    inputSchema: { type: "object", properties: { id: { type: "integer", description: "Document id from list_documents or search_documents." } }, required: ["id"] },
    async run(c, a) {
      const id = int(a.id, 0, 0, Number.MAX_SAFE_INTEGER);
      const [d] = await sql<{ id: number; title: string; content: string; lib: string; published_at: Date | null; author: string | null }[]>`
        SELECT n.id, v.title, v.content, l.name AS lib, n.published_at, coalesce(u.display_name, u.username) AS author
        FROM nodes n JOIN doc_versions v ON v.id = n.published_version_id JOIN libraries l ON l.id = n.library_id
        LEFT JOIN users u ON u.id = v.created_by
        WHERE n.id = ${id} AND n.kind = 'doc' AND n.deleted_at IS NULL AND n.library_id IN (${visibleLibs(c)})`;
      if (!d) throw new ToolError(`Document ${id} not found or not visible to this token.`);
      return `# ${d.title}\n\n> Library: ${d.lib} · Published: ${d.published_at?.toISOString().slice(0, 10) ?? "-"}${d.author ? ` · Last editor: ${d.author}` : ""} · ${docUrl(d.id)}\n\n${d.content}`;
    },
  },
  {
    name: "list_todos",
    title: "待办",
    description: "Project todos (not archived): title, status, assignee, due date, linked doc ids.",
    inputSchema: { type: "object", properties: { status: { type: "string", enum: ["todo", "doing", "done", "open", "all"], default: "open" }, limit: { type: "integer", minimum: 1, maximum: 100, default: 50 } } },
    async run(c, a) {
      const st = str(a.status) || "open";
      const rows = await sql<{ id: number; title: string; description: string; status: string; due: string | null; who: string | null; docs: number[] }[]>`
        SELECT t.id, t.title, t.description, t.status, to_char(t.due_date, 'YYYY-MM-DD') AS due, coalesce(u.display_name, u.username) AS who,
               coalesce((SELECT array_agg(td.node_id) FROM todo_links td WHERE td.todo_id = t.id), '{}') AS docs
        FROM todos t LEFT JOIN users u ON u.id = t.assignee_id
        WHERE t.project_id = ${c.projectId} AND t.archived_at IS NULL
          ${st === "open" ? sql`AND t.status <> 'done'` : st === "all" ? sql`` : sql`AND t.status = ${st}`}
        ORDER BY t.due_date NULLS LAST, t.id DESC LIMIT ${int(a.limit, 50, 1, 100)}`;
      const label: Record<string, string> = { todo: "待开始", doing: "进行中", done: "已完成" };
      if (!rows.length) return "No todos.";
      return rows
        .map((t) => `- [${t.id}] ${t.title} (${label[t.status] ?? t.status}${t.who ? `, ${t.who}` : ""}${t.due ? `, due ${t.due}` : ""}${t.docs.length ? `, docs ${t.docs.join(",")}` : ""})${t.description ? `\n  ${t.description.replace(/\n/g, "\n  ")}` : ""}`)
        .join("\n");
    },
  },
  {
    name: "list_notes",
    title: "随笔",
    description: "Recent project notes (short free-form posts), newest first, optionally filtered by keyword or tag.",
    inputSchema: { type: "object", properties: { query: { type: "string" }, tag: { type: "string" }, limit: { type: "integer", minimum: 1, maximum: 100, default: 30 } } },
    async run(c, a) {
      const q = str(a.query), tag = str(a.tag);
      const rows = await sql<{ id: number; body: string; tags: string[]; who: string | null; created_at: Date }[]>`
        SELECT n.id, n.body, n.tags, coalesce(u.display_name, u.username) AS who, n.created_at
        FROM notes n LEFT JOIN users u ON u.id = n.created_by
        WHERE n.project_id = ${c.projectId} AND n.archived_at IS NULL
          ${q ? sql`AND n.body ILIKE ${"%" + q.replace(/[\\%_]/g, (m) => "\\" + m) + "%"}` : sql``}
          ${tag ? sql`AND ${tag} = ANY(n.tags)` : sql``}
        ORDER BY n.created_at DESC LIMIT ${int(a.limit, 30, 1, 100)}`;
      if (!rows.length) return "No notes.";
      return rows.map((n) => `## [${n.id}] ${n.created_at.toISOString().slice(0, 10)}${n.who ? ` · ${n.who}` : ""}${n.tags.length ? ` · #${n.tags.join(" #")}` : ""}\n${n.body}`).join("\n\n");
    },
  },
];

export class ToolError extends Error {}

type RpcReq = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Json };
const ok = (id: RpcReq["id"], result: unknown) => ({ jsonrpc: "2.0", id, result });
const err = (id: RpcReq["id"], code: number, message: string) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });

/** Handles one JSON-RPC message; returns null for notifications. */
export async function handleRpc(c: TokenCtx, m: RpcReq): Promise<object | null> {
  if (!m || typeof m !== "object" || m.jsonrpc !== "2.0" || typeof m.method !== "string") return err(m?.id, -32600, "Invalid Request");
  const isNote = m.id === undefined;
  switch (m.method) {
    case "initialize": {
      const asked = String(m.params?.protocolVersion ?? "");
      return ok(m.id, {
        protocolVersion: MCP_VERSIONS.includes(asked) ? asked : MCP_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: `folio-isle/${c.slug}`, title: `言屿 · ${c.projectName}`, version: "1.0.0" },
        instructions: `Read-only corpus of the project "${c.projectName}". Start with get_project_overview, then search_documents or list_documents, and read_document for full text. Cite documents by their URL.`,
      });
    }
    case "ping":
      return isNote ? null : ok(m.id, {});
    case "tools/list":
      return ok(m.id, { tools: TOOLS.map(({ run: _run, ...t }) => ({ ...t, annotations: { readOnlyHint: true, openWorldHint: false } })) });
    case "tools/call": {
      const tool = TOOLS.find((t) => t.name === m.params?.name);
      if (!tool) return err(m.id, -32602, `Unknown tool: ${String(m.params?.name)}`);
      try {
        const text = await tool.run(c, (m.params?.arguments as Json) ?? {});
        return ok(m.id, { content: [{ type: "text", text }], isError: false });
      } catch (e) {
        if (e instanceof ToolError) return ok(m.id, { content: [{ type: "text", text: e.message }], isError: true });
        throw e;
      }
    }
    default:
      if (isNote) return null; // notifications/initialized, notifications/cancelled, …
      return err(m.id, -32601, `Method not found: ${m.method}`);
  }
}
