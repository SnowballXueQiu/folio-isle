// Tiptap/ProseMirror JSON → Markdown superset (inverse of render.ts).

export type PMMark = { type: string; attrs?: Record<string, unknown> };
export type PMNode = { type: string; attrs?: Record<string, unknown>; content?: PMNode[]; text?: string; marks?: PMMark[] };

const MARK_ORDER = ["link", "colorText", "bold", "italic", "strike", "code"];
const rank = (m: PMMark) => {
  const i = MARK_ORDER.indexOf(m.type);
  return i < 0 ? 99 : i;
};
const sameMark = (a: PMMark, b: PMMark) => a.type === b.type && JSON.stringify(a.attrs ?? {}) === JSON.stringify(b.attrs ?? {});

export function escapeText(s: string, ctx: { table?: boolean } = {}): string {
  let out = s
    .replace(/\\/g, "\\\\")
    .replace(/([*_`[\]<~])/g, "\\$1")
    .replace(/:(?=[A-Za-z])/g, "\\:")
    .replace(/&(?=#?\w+;)/g, "&amp;");
  if (ctx.table) out = out.replace(/\|/g, "\\|");
  return out;
}

function escapeLineStart(s: string): string {
  return s
    .split("\n")
    .map((line) =>
      line
        .replace(/^(\s*)(#{1,6}(?=\s|$))/, "$1\\$2")
        .replace(/^(\s*)([-+*])(?=\s)/, "$1\\$2")
        .replace(/^(\s*)(\d+)([.)])(?=\s|$)/, "$1$2\\$3")
        .replace(/^(\s*)>/, "$1\\>")
        .replace(/^(\s*)(=+|-{3,})\s*$/, "$1\\$2")
    )
    .join("\n");
}

function openMark(m: PMMark): string {
  switch (m.type) {
    case "link":
      return "[";
    case "colorText":
      return ":text[";
    case "bold":
      return "**";
    case "italic":
      return "*";
    case "strike":
      return "~~";
    default:
      return "";
  }
}

function closeMark(m: PMMark): string {
  switch (m.type) {
    case "link": {
      const href = String(m.attrs?.href ?? "").replace(/[()\s]/g, (c) => encodeURIComponent(c));
      return `](${href})`;
    }
    case "colorText": {
      const parts = [m.attrs?.fg && `fg=${m.attrs.fg}`, m.attrs?.bg && `bg=${m.attrs.bg}`].filter(Boolean);
      return `]{${parts.join(" ")}}`;
    }
    case "bold":
      return "**";
    case "italic":
      return "*";
    case "strike":
      return "~~";
    default:
      return "";
  }
}

function codeSpan(text: string): string {
  const runs = text.match(/`+/g) ?? [];
  const longest = runs.reduce((m, r) => Math.max(m, r.length), 0);
  const fence = "`".repeat(longest + 1);
  const pad = text.startsWith("`") || text.endsWith("`") ? " " : "";
  return fence + pad + text + pad + fence;
}

export function serializeInline(nodes: PMNode[] = [], ctx: { table?: boolean } = {}): string {
  let out = "";
  const stack: PMMark[] = [];
  const closeTo = (keep: number) => {
    while (stack.length > keep) {
      const m = stack.pop()!;
      const trail = /[ \t]+$/.exec(out)?.[0] ?? "";
      if (trail && m.type !== "link" && m.type !== "colorText") out = out.slice(0, -trail.length);
      out += closeMark(m) + (m.type !== "link" && m.type !== "colorText" ? trail : "");
    }
  };
  for (const n of nodes) {
    if (n.type === "hardBreak") {
      closeTo(0);
      out += ctx.table ? " " : "\\\n";
      continue;
    }
    if (n.type === "image") {
      closeTo(0);
      out += imageMd(n);
      continue;
    }
    if (n.type !== "text" || !n.text) continue;
    const marks = (n.marks ?? []).filter((m) => MARK_ORDER.includes(m.type)).sort((a, b) => rank(a) - rank(b));
    const code = marks.find((m) => m.type === "code");
    const other = marks.filter((m) => m.type !== "code");
    let keep = 0;
    while (keep < stack.length && keep < other.length && sameMark(stack[keep], other[keep])) keep++;
    closeTo(keep);
    let text = n.text;
    const toOpen = other.slice(keep);
    if (toOpen.some((m) => m.type !== "link" && m.type !== "colorText")) {
      const lead = /^[ \t]+/.exec(text)?.[0] ?? "";
      out += lead;
      text = text.slice(lead.length);
    }
    for (const m of toOpen) {
      out += openMark(m);
      stack.push(m);
    }
    out += code ? codeSpan(text) : escapeText(text, ctx);
  }
  closeTo(0);
  return out;
}

function imageMd(n: PMNode): string {
  const alt = String(n.attrs?.alt ?? "").replace(/[[\]\\]/g, "");
  const src = String(n.attrs?.src ?? "").replace(/[()\s]/g, (c) => encodeURIComponent(c));
  const title = n.attrs?.title ? ` "${String(n.attrs.title).replace(/"/g, "'")}"` : "";
  return `![${alt}](${src}${title})`;
}

const indent = (s: string, pad: string) =>
  s
    .split("\n")
    .map((l, i) => (i === 0 || l === "" ? l : pad + l))
    .join("\n");

function containerDepth(nodes: PMNode[] = []): number {
  let d = 0;
  for (const n of nodes) {
    const own = n.type === "callout" || n.type === "details" ? 1 : 0;
    d = Math.max(d, own + containerDepth(n.content));
  }
  return d;
}

function attrValue(s: string) {
  return `"${s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/\n/g, " ")}"`;
}

function serializeBlock(n: PMNode): string | null {
  switch (n.type) {
    case "paragraph": {
      const s = escapeLineStart(serializeInline(n.content));
      return s.trim() ? s : null;
    }
    case "heading": {
      const level = Math.min(Math.max(Number(n.attrs?.level ?? 1), 1), 6);
      const s = serializeInline(n.content).replace(/\\\n/g, " ");
      return s.trim() ? `${"#".repeat(level)} ${s}` : null;
    }
    case "blockquote": {
      const inner = serializeBlocks(n.content);
      return inner
        .split("\n")
        .map((l) => (l ? `> ${l}` : ">"))
        .join("\n");
    }
    case "codeBlock": {
      const text = (n.content ?? []).map((c) => c.text ?? "").join("").replace(/\n$/, "");
      const runs = text.match(/`{3,}/g) ?? [];
      const fence = "`".repeat(Math.max(3, ...runs.map((r) => r.length + 1)));
      const lang = String(n.attrs?.language ?? "").replace(/[^\w+#-]/g, "");
      return `${fence}${lang}\n${text}\n${fence}`;
    }
    case "horizontalRule":
      return "---";
    case "image":
      return imageMd(n);
    case "bulletList":
    case "orderedList":
    case "taskList": {
      const start = Number(n.attrs?.start ?? 1);
      const items = (n.content ?? []).map((item, i) => {
        let marker = "- ";
        if (n.type === "orderedList") marker = `${start + i}. `;
        if (n.type === "taskList") marker = item.attrs?.checked ? "- [x] " : "- [ ] ";
        const body = serializeItemBody(item.content);
        const pad = " ".repeat(n.type === "orderedList" ? marker.length : 2);
        return marker + indent(body, pad);
      });
      const loose = (n.content ?? []).some((item) => (item.content ?? []).filter((c) => c.type === "paragraph").length > 1);
      return items.join(loose ? "\n\n" : "\n");
    }
    case "table": {
      const rows = (n.content ?? []).map((row) =>
        (row.content ?? []).map((cell) =>
          (cell.content ?? [])
            .map((p) => (p.type === "paragraph" || p.type === "heading" ? serializeInline(p.content, { table: true }) : ""))
            .filter(Boolean)
            .join(" ")
            .trim()
        )
      );
      if (!rows.length) return null;
      const cols = Math.max(...rows.map((r) => r.length));
      const norm = rows.map((r) => [...r, ...Array(cols - r.length).fill("")]);
      const line = (r: string[]) => `| ${r.map((c) => c || " ").join(" | ")} |`;
      return [line(norm[0]), `| ${Array(cols).fill("---").join(" | ")} |`, ...norm.slice(1).map(line)].join("\n");
    }
    case "callout": {
      const fence = ":".repeat(3 + containerDepth(n.content));
      const type = String(n.attrs?.type ?? "info");
      return `${fence}callout{type=${type}}\n${serializeBlocks(n.content)}\n${fence}`;
    }
    case "details": {
      const fence = ":".repeat(3 + containerDepth(n.content));
      const summary = String(n.attrs?.summary ?? "详情");
      return `${fence}details{summary=${attrValue(summary)}}\n${serializeBlocks(n.content)}\n${fence}`;
    }
    default:
      return n.content ? serializeBlocks(n.content) : null;
  }
}

const LIST_TYPES = new Set(["bulletList", "orderedList", "taskList"]);

function serializeItemBody(nodes: PMNode[] = []): string {
  let out = "";
  nodes.forEach((n, i) => {
    const s = serializeBlock(n);
    if (s === null || s === "") return;
    if (out) out += LIST_TYPES.has(n.type) && i > 0 && nodes[i - 1].type === "paragraph" ? "\n" : "\n\n";
    out += s;
  });
  return out;
}

export function serializeBlocks(nodes: PMNode[] = []): string {
  return nodes
    .map(serializeBlock)
    .filter((s): s is string => s !== null && s !== "")
    .join("\n\n");
}

export function docToMarkdown(doc: PMNode): string {
  const md = serializeBlocks(doc.content);
  return md ? md + "\n" : "";
}
