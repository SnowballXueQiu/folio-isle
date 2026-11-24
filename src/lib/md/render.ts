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

