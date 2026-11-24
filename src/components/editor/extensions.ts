// Tiptap schema shared by the editor (browser) and round-trip tests (node).
import { Mark, Node, mergeAttributes, type Extensions } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { Table, TableRow, TableHeader, TableCell } from "@tiptap/extension-table";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import { common, createLowlight } from "lowlight";
import { CALLOUT_IDS, PALETTE_IDS } from "@/lib/md/palette";

export const lowlight = createLowlight(common);

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    colorText: {
      setColorText: (attrs: { fg?: string | null; bg?: string | null }) => ReturnType;
      unsetColorText: () => ReturnType;
    };
    callout: { insertCallout: (type?: string) => ReturnType };
    details: { insertDetails: (summary?: string) => ReturnType };
  }
}

export const ColorText = Mark.create({
  name: "colorText",
  addAttributes() {
    return {
      fg: { default: null, parseHTML: (el) => (PALETTE_IDS.has(el.getAttribute("data-fg") ?? "") ? el.getAttribute("data-fg") : null) },
      bg: { default: null, parseHTML: (el) => (PALETTE_IDS.has(el.getAttribute("data-bg") ?? "") ? el.getAttribute("data-bg") : null) },
    };
  },
  parseHTML() {
    return [{ tag: "span[data-fg]" }, { tag: "span[data-bg]" }];
  },
  renderHTML({ mark }) {
    const { fg, bg } = mark.attrs as { fg: string | null; bg: string | null };
    return ["span", { class: ["ct", fg && `fg-${fg}`, bg && `bg-${bg}`].filter(Boolean).join(" "), "data-fg": fg ?? undefined, "data-bg": bg ?? undefined }, 0];
  },
  addCommands() {
    return {
      setColorText:
        (attrs) =>
        ({ chain, editor }) => {
          const cur = editor.getAttributes("colorText") as { fg?: string | null; bg?: string | null };
          const next = { fg: cur.fg ?? null, bg: cur.bg ?? null, ...attrs };
          if (!next.fg && !next.bg) return chain().unsetMark("colorText").run();
          return chain().setMark("colorText", next).run();
        },
      unsetColorText:
        () =>
        ({ chain }) =>
          chain().unsetMark("colorText").run(),
    };
  },
});

export const Callout = Node.create({
  name: "callout",
  group: "block",
  content: "block+",
  defining: true,
  addAttributes() {
    return {
      type: { default: "info", parseHTML: (el) => (CALLOUT_IDS.has(el.getAttribute("data-type") ?? "") ? el.getAttribute("data-type") : "info") },
    };
  },
  parseHTML() {
    return [{ tag: "div[data-callout]" }];
  },
  renderHTML({ node, HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-callout": "", "data-type": node.attrs.type, class: `callout callout-${node.attrs.type}` }), 0];
  },
  addCommands() {
    return {
      insertCallout:
        (type = "info") =>
        ({ commands }) =>
          commands.insertContent({ type: "callout", attrs: { type }, content: [{ type: "paragraph" }] }),
    };
  },
});

export const Details = Node.create({
  name: "details",
  group: "block",
  content: "block+",
  defining: true,
  addAttributes() {
    return {
      summary: {
        default: "详情",
        parseHTML: (el) => el.getAttribute("data-summary") || el.querySelector("summary")?.textContent || "详情",
      },
    };
  },
  parseHTML() {
    return [{ tag: "details", contentElement: "div[data-details-content]" }];
  },
  renderHTML({ node }) {
    return ["details", { "data-details": "", "data-summary": node.attrs.summary, open: "open", class: "fold" }, ["summary", {}, node.attrs.summary], ["div", { "data-details-content": "", class: "fold-body" }, 0]];
  },
  addCommands() {
    return {
      insertDetails:
        (summary = "点击展开") =>
        ({ commands }) =>
          commands.insertContent({ type: "details", attrs: { summary }, content: [{ type: "paragraph" }] }),
    };
  },
});

export function baseExtensions(): Extensions {
  return [
    StarterKit.configure({
      codeBlock: false,
      underline: false,
      link: { openOnClick: false, autolink: true, HTMLAttributes: { rel: "noopener noreferrer", target: null } },
      heading: { levels: [1, 2, 3, 4] },
    }),
    CodeBlockLowlight.configure({ lowlight, defaultLanguage: null }),
    Image.configure({ inline: false, allowBase64: false }),
    Table.configure({ resizable: false }),
    TableRow,
    TableHeader,
    TableCell,
    TaskList,
    TaskItem.configure({ nested: true }),
    ColorText,
    Callout,
    Details,
  ];
}
