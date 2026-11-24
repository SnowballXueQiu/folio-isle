// Markdown → plain text, used for AI input and for validating quoted evidence.
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkDirective from "remark-directive";
import { toString } from "mdast-util-to-string";
import type { Root, RootContent } from "mdast";

export function markdownToPlain(md: string): string {
  const tree = unified().use(remarkParse).use(remarkGfm).use(remarkDirective).parse(md) as Root;
  const lines: string[] = [];
  const walk = (nodes: RootContent[]) => {
    for (const n of nodes) {
      const anyN = n as RootContent & { name?: string; attributes?: Record<string, string> };
      if (n.type === "list" || n.type === "blockquote" || (n.type as string) === "containerDirective") {
        if ((n.type as string) === "containerDirective" && anyN.name === "details" && anyN.attributes?.summary) lines.push(anyN.attributes.summary);
        walk((n as { children: RootContent[] }).children);
      } else if (n.type === "listItem") {
        walk(n.children as RootContent[]);
      } else if (n.type === "table") {
        for (const row of n.children) lines.push(row.children.map((c) => toString(c)).join(" | "));
      } else if (n.type === "code") {
        lines.push(n.value);
      } else {
        const t = toString(n);
        if (t.trim()) lines.push(t);
      }
    }
  };
  walk(tree.children);
  return lines.join("\n");
}

export const normalizeForMatch = (s: string) =>
  s.replace(/[\s 　]+/g, "").replace(/[“”"]/g, '"').replace(/[‘’']/g, "'").toLowerCase();

/** True when `quote` appears in `plain` (ignoring whitespace and quote style). */
export function quoteInText(quote: string, plainNormalized: string): boolean {
  const q = normalizeForMatch(quote);
  return q.length >= 4 && plainNormalized.includes(q);
}
