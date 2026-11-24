import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkDirective from "remark-directive";
import remarkRehype from "remark-rehype";
import rehypeSanitize from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";
import { remarkFolioDirectives, rehypeEditorTasks, schema } from "./pipeline";

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
