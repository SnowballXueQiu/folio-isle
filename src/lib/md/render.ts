// Markdown superset → HTML. Shared by the reader (server) and the editor (client).
//
// Superset on top of GFM:
//   :text[label]{fg=red bg=yellow}          coloured / highlighted inline text (fixed palette)
//   :::callout{type=info} ... :::            callout block (info | tip | warn | danger | success)
//   :::details{summary="标题"} ... :::       collapsible block
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkDirective from "remark-directive";
import remarkRehype from "remark-rehype";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import rehypeSlug from "rehype-slug";
import rehypeHighlight from "rehype-highlight";
import rehypeStringify from "rehype-stringify";
import { visit, SKIP } from "unist-util-visit";
import { toString as hastToString } from "hast-util-to-string";
import type { Root as MdRoot } from "mdast";
import type { Root as HastRoot, Element } from "hast";
import { CALLOUT_IDS, PALETTE, PALETTE_IDS } from "./palette";

export type Heading = { id: string; text: string; depth: number };

type AnyNode = { type: string; name?: string; attributes?: Record<string, string | null | undefined> | null; children?: AnyNode[]; value?: string; data?: Record<string, unknown> };

/** Turns our directives into hast-ready nodes and restores unknown ones as literal text. */
function remarkFolioDirectives() {
  return (tree: MdRoot) => {
    visit(tree as unknown as AnyNode, (node: AnyNode, index, parent: AnyNode | undefined) => {
      if (node.type === "textDirective") {
        const attrs = node.attributes ?? {};
        if (node.name === "text") {
          const fg = attrs.fg && PALETTE_IDS.has(attrs.fg) ? attrs.fg : null;
          const bg = attrs.bg && PALETTE_IDS.has(attrs.bg) ? attrs.bg : null;
          const cls = [fg && `fg-${fg}`, bg && `bg-${bg}`].filter(Boolean) as string[];
          node.data = { hName: "span", hProperties: { className: ["ct", ...cls], dataFg: fg ?? undefined, dataBg: bg ?? undefined } };
          return;
        }
        // e.g. "备注:abc" — not one of ours, put the text back
        if (parent && typeof index === "number") {
          const kids = node.children ?? [];
          const restored: AnyNode[] = [{ type: "text", value: `:${node.name}` }];
          if (kids.length) restored.push({ type: "text", value: "[" }, ...kids, { type: "text", value: "]" });
          parent.children!.splice(index, 1, ...restored);
          return [SKIP, index + restored.length];
        }
      }
      if (node.type === "leafDirective" && parent && typeof index === "number") {
        const kids = node.children ?? [];
        parent.children!.splice(index, 1, {
          type: "paragraph",
          children: [{ type: "text", value: `::${node.name}` }, ...(kids.length ? [{ type: "text", value: "[" }, ...kids, { type: "text", value: "]" }] : [])],
        });
        return SKIP;
      }
      if (node.type === "containerDirective") {
        const attrs = node.attributes ?? {};
        if (node.name === "callout") {
          const type = attrs.type && CALLOUT_IDS.has(attrs.type) ? attrs.type : "info";
          node.data = { hName: "div", hProperties: { className: ["callout", `callout-${type}`], dataCallout: "", dataType: type } };
        } else if (node.name === "details") {
          const summary = (attrs.summary ?? "").trim() || "详情";
          node.data = { hName: "details", hProperties: { className: ["fold"], dataDetails: "", dataSummary: summary } };
          node.children = [
            { type: "foldSummary", data: { hName: "summary" }, children: [{ type: "text", value: summary }] },
            { type: "foldBody", data: { hName: "div", hProperties: { className: ["fold-body"], dataDetailsContent: "" } }, children: node.children ?? [] },
          ];
        } else {
          node.data = { hName: "div" };
        }
      }
    });
  };
}

const paletteClasses = PALETTE.flatMap((p) => [`fg-${p.id}`, `bg-${p.id}`]);
const calloutClasses = [...CALLOUT_IDS].map((c) => `callout-${c}`);

const schema = {
  ...defaultSchema,
  clobberPrefix: "",
  tagNames: [...(defaultSchema.tagNames ?? []), "details", "summary", "span", "div"],
  attributes: {
    ...defaultSchema.attributes,
    span: [["className", "ct", ...paletteClasses], ["dataFg", ...PALETTE_IDS], ["dataBg", ...PALETTE_IDS]],
    div: [["className", "callout", "fold-body", ...calloutClasses], ["dataCallout", ""], ["dataType", ...CALLOUT_IDS], ["dataDetailsContent", ""]],
    details: [["className", "fold"], ["dataDetails", ""], "dataSummary"],
    code: [["className", /^language-[\w+#-]+$/]],
    img: ["src", "alt", "title"],
    ul: [["className", "contains-task-list"]],
    li: [["className", "task-list-item"]],
    input: [["type", "checkbox"], ["disabled", true], "checked"],
    a: ["href", "title"],
    td: [["align", "left", "right", "center"]],
    th: [["align", "left", "right", "center"]],
  },
  protocols: { ...defaultSchema.protocols, src: ["http", "https"], href: ["http", "https", "mailto"] },
} as typeof defaultSchema;

function rehypeCollectHeadings(out: Heading[]) {
  return () => (tree: HastRoot) => {
    visit(tree, "element", (el: Element) => {
      const m = /^h([1-4])$/.exec(el.tagName);
      if (m && typeof el.properties?.id === "string") out.push({ id: el.properties.id, text: hastToString(el), depth: Number(m[1]) });
    });
  };
}

function rehypeExternalLinks() {
  return (tree: HastRoot) => {
    visit(tree, "element", (el: Element) => {
      if (el.tagName === "a" && typeof el.properties?.href === "string" && /^https?:/.test(el.properties.href)) {
        el.properties.target = "_blank";
        el.properties.rel = ["noopener", "noreferrer"];
      }
      if (el.tagName === "img") el.properties.loading = "lazy";
    });
  };
}

/** Tiptap's task list expects data-type attributes instead of GFM's classes/inputs. */
function rehypeEditorTasks() {
  return (tree: HastRoot) => {
    visit(tree, "element", (el: Element) => {
      const cls = el.properties?.className;
      const has = (c: string) => Array.isArray(cls) && cls.includes(c);
      if (el.tagName === "ul" && has("contains-task-list")) el.properties = { dataType: "taskList" };
      if (el.tagName === "li" && has("task-list-item")) {
        let checked = false;
        const strip = (parent: Element) => {
          parent.children = parent.children.filter((c) => {
            if (c.type === "element" && c.tagName === "input") {
              checked = !!c.properties?.checked;
              return false;
            }
            if (c.type === "element" && c.tagName === "p") strip(c);
            return true;
          });
        };
        strip(el);
        el.properties = { dataType: "taskItem", dataChecked: checked ? "true" : "false" };
      }
    });
  };
}

export function renderMarkdown(md: string): { html: string; headings: Heading[] } {
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
    .use(rehypeStringify)
    .processSync(md);
  return { html: String(file), headings };
}

/** HTML suitable for loading into the Tiptap editor (no highlighting/slugs). */
export function markdownToEditorHtml(md: string): string {
  const file = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkDirective)
    .use(remarkFolioDirectives)
    .use(remarkRehype)
    .use(rehypeSanitize, schema)
    .use(rehypeEditorTasks)
    .use(rehypeStringify)
    .processSync(md);
  return String(file);
}
