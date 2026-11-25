// Markdown superset → HTML for the reader (server side, with highlighting and heading anchors).
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkDirective from "remark-directive";
import remarkRehype from "remark-rehype";
import rehypeSanitize from "rehype-sanitize";
import rehypeSlug from "rehype-slug";
import rehypeHighlight from "rehype-highlight";
import rehypeStringify from "rehype-stringify";
import { remarkFolioDirectives, schema, rehypeCollectHeadings, rehypeExternalLinks, type Heading } from "./pipeline";

export type { Heading };
export { markdownToEditorHtml } from "./editor-html";

type HNode = { type: string; tagName?: string; value?: string; properties?: Record<string, unknown>; children?: HNode[] };
export type XrefTarget = { id: number; title: string; names: string[] };

const SECTION_HEADS = new Set(["h1", "h2", "h3"]);
const SKIP_TAGS = new Set(["a", "code", "pre", "h1", "h2", "h3", "h4", "h5", "h6", "summary"]);
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Wrap mentions of glossary entries in body text with cross-reference links (longest name wins). */
function rehypeXref(targets: XrefTarget[], selfId?: number) {
  const byName = new Map<string, XrefTarget>();
  for (const t of targets) if (t.id !== selfId) for (const n of t.names) if (!byName.has(n)) byName.set(n, t);
  const names = [...byName.keys()].sort((a, b) => b.length - a.length);
  return () => (tree: HNode) => {
    if (!names.length) return;
    const re = new RegExp(names.map(escapeRe).join("|"), "g");
    // like Wikipedia: only the first mention of an entry in each section (h1–h3) is linked
    let seen = new Set<number>();
    const walk = (node: HNode) => {
      if (!node.children) return;
      const out: HNode[] = [];
      for (const child of node.children) {
        if (child.type === "element" && SECTION_HEADS.has(child.tagName!)) seen = new Set();
        if (child.type === "text" && child.value) {
          let last = 0;
          for (const m of child.value.matchAll(re)) {
            const t = byName.get(m[0])!;
            if (seen.has(t.id)) continue;
            seen.add(t.id);
            if (m.index! > last) out.push({ type: "text", value: child.value.slice(last, m.index) });
            out.push({ type: "element", tagName: "a", properties: { href: `/d/${t.id}`, className: ["xref"], dataXref: String(t.id) }, children: [{ type: "text", value: m[0] }] });
            last = m.index! + m[0].length;
          }
          if (last === 0) out.push(child);
          else if (last < child.value.length) out.push({ type: "text", value: child.value.slice(last) });
        } else {
          if (child.type === "element" && !SKIP_TAGS.has(child.tagName!)) walk(child);
          out.push(child);
        }
      }
      node.children = out;
    };
    walk(tree);
  };
}

export function renderMarkdown(md: string, opts: { xref?: XrefTarget[]; selfId?: number } = {}): { html: string; headings: Heading[] } {
  const headings: Heading[] = [];
  const file = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkDirective)
    .use(remarkFolioDirectives)
    .use(remarkRehype)
    .use(rehypeSanitize, schema)
    .use(rehypeSlug)
    .use(rehypeCollectHeadings(headings))
    .use(rehypeHighlight, { detect: false, ignoreMissing: true } as never)
    .use(rehypeExternalLinks)
    .use(rehypeXref(opts.xref ?? [], opts.selfId))
    .use(rehypeStringify)
    .processSync(md);
  return { html: String(file), headings };
}

