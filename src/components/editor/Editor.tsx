"use client";
import { Select } from "@/components/ui/Select";
import { confirmDialog, promptDialog, toast } from "@/components/ui/dialogs";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { EditorContent, useEditor, ReactNodeViewRenderer, NodeViewWrapper, NodeViewContent, type NodeViewProps, type Editor as TEditor } from "@tiptap/react";
import Placeholder from "@tiptap/extension-placeholder";
import {
  Bold, Italic, Strikethrough, Code, Link2, List, ListOrdered, ListChecks, Quote, SquareCode, Table2, ImagePlus,
  Minus, Undo2, Redo2, Palette, Highlighter, MessageSquareWarning, ChevronsUpDown, Eraser,
  ArrowLeft,
} from "lucide-react";
import { baseExtensions, Callout, Details } from "./extensions";
import { markdownToEditorHtml } from "@/lib/md/editor-html";
import { docToMarkdown, type PMNode } from "@/lib/md/serialize";
import { PALETTE, CALLOUT_TYPES } from "@/lib/md/palette";
import { cx } from "@/lib/util";

type Conflict = { versionId: number; title: string; content: string; by: string | null; at: string };
type Status = { kind: "saved" | "dirty" | "saving" | "offline" | "conflict" | "error"; at?: string; msg?: string };
type Pending = { title: string; content: string; baseVersionId: number | null; at: number };

const DEBOUNCE = 3000;
const MAX_WAIT = 20000;

function CalloutView({ node, updateAttributes }: NodeViewProps) {
  return (
    <NodeViewWrapper className={`callout callout-${node.attrs.type}`} data-callout="">
      <div contentEditable={false} className="absolute right-2 top-1.5">
        <Select
          variant="ghost"
          size="sm"
          align="end"
          value={node.attrs.type}
          aria-label="提示框类型"
          onChange={(v) => void updateAttributes({ type: v })}
          triggerClassName="!h-7 !text-xs"
          options={CALLOUT_TYPES.map((t) => ({ value: t.id, label: t.label }))}
        />
      </div>
      <NodeViewContent />
    </NodeViewWrapper>
  );
}

function DetailsView({ node, updateAttributes }: NodeViewProps) {
  return (
    <NodeViewWrapper className="fold block border hairline rounded-[10px] px-4 py-2" data-details="">
      <div contentEditable={false} className="flex items-center gap-2 mb-1">
        <ChevronsUpDown size={14} className="muted shrink-0" />
        <input
          value={node.attrs.summary}
          onChange={(e) => updateAttributes({ summary: e.target.value })}
          className="font-semibold bg-transparent outline-none flex-1"
          placeholder="折叠标题"
        />
      </div>
      <NodeViewContent className="fold-body" />
    </NodeViewWrapper>
  );
}

async function uploadImage(nodeId: number, file: File): Promise<string> {
  const fd = new FormData();
  fd.append("nodeId", String(nodeId));
  fd.append("file", file);
  const res = await fetch("/api/attachments", { method: "POST", body: fd });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "上传失败");
  return data.url;
}

export function DocEditor({
  docId,
  initial,
  published,
  backHref,
}: {
  docId: number;
  initial: { title: string; content: string; versionId: number | null };
  published: boolean;
  backHref: string;
}) {
  const router = useRouter();
  const pendingKey = `folio:pending:${docId}`;
  const [title, setTitle] = useState(initial.title);
  const [status, setStatus] = useState<Status>({ kind: "saved" });
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const [publishing, setPublishing] = useState(false);

  const base = useRef<number | null>(initial.versionId);
  const lastSaved = useRef({ title: initial.title, content: initial.content });
  const titleRef = useRef(initial.title);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastAttempt = useRef(Date.now());
  const saving = useRef<Promise<boolean> | null>(null);
  const blocked = useRef(false); // true while a conflict is unresolved
  const editorRef = useRef<TEditor | null>(null);

  const extensions = useMemo(
    () => [
      ...baseExtensions().filter((e) => e.name !== "callout" && e.name !== "details"),
      Callout.extend({ addNodeView: () => ReactNodeViewRenderer(CalloutView) }),
      Details.extend({ addNodeView: () => ReactNodeViewRenderer(DetailsView) }),
      Placeholder.configure({ placeholder: "开始写作… 支持粘贴图片、Markdown 快捷输入（# 标题、- 列表、``` 代码）" }),
    ],
    []
  );

  const currentMarkdown = useCallback(() => (editorRef.current ? docToMarkdown(editorRef.current.getJSON() as PMNode) : lastSaved.current.content), []);

  const persistPending = useCallback(() => {
    const p: Pending = { title: titleRef.current, content: currentMarkdown(), baseVersionId: base.current, at: Date.now() };
    try {
      localStorage.setItem(pendingKey, JSON.stringify(p));
    } catch {}
  }, [currentMarkdown, pendingKey]);

  const save = useCallback(
    async (force = false): Promise<boolean> => {
      if (blocked.current && !force) return false;
      if (saving.current) {
        await saving.current;
      }
      const content = currentMarkdown();
      const t = titleRef.current.trim() || "未命名文档";
      if (content === lastSaved.current.content && t === lastSaved.current.title) {
        setStatus((s) => (s.kind === "dirty" ? { kind: "saved", at: s.at } : s));
        localStorage.removeItem(pendingKey);
        return true;
      }
      lastAttempt.current = Date.now();
      setStatus({ kind: "saving" });
      const run = (async () => {
        try {
          const res = await fetch(`/api/docs/${docId}/draft`, {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ title: t, content, baseVersionId: base.current }),
          });
          const data = await res.json().catch(() => ({}));
          if (res.status === 409 && data.conflict) {
            blocked.current = true;
            setConflict(data.conflict);
            setStatus({ kind: "conflict" });
            return false;
          }
          if (!res.ok) {
            setStatus({ kind: "error", msg: data.error || `保存失败（${res.status}）` });
            return false;
          }
          base.current = data.versionId;
          lastSaved.current = { title: t, content };
          // only clear the local copy if nothing changed while we were saving
          if (currentMarkdown() === content && titleRef.current.trim() === t) {
            localStorage.removeItem(pendingKey);
            setStatus({ kind: "saved", at: new Date(data.savedAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) });
          } else {
            setStatus({ kind: "dirty" });
          }
          return true;
        } catch {
          setStatus({ kind: "offline" });
          return false;
        } finally {
          saving.current = null;
        }
      })();
      saving.current = run;
      return run;
    },
    [currentMarkdown, docId, pendingKey]
  );

  const onChange = useCallback(() => {
    persistPending();
    setStatus((s) => (s.kind === "conflict" ? s : { kind: navigator.onLine ? "dirty" : "offline" }));
    if (timer.current) clearTimeout(timer.current);
    if (Date.now() - lastAttempt.current >= MAX_WAIT) void save();
    else timer.current = setTimeout(() => void save(), DEBOUNCE);
  }, [persistPending, save]);

  const editor = useEditor({
    extensions,
    content: markdownToEditorHtml(initial.content),
    immediatelyRender: false,
    editorProps: {
      attributes: { class: "doc ProseMirror", spellcheck: "false" },
      handlePaste: (view, event) => {
        const files = [...(event.clipboardData?.files ?? [])].filter((f) => f.type.startsWith("image/"));
        if (!files.length) return false;
        files.forEach(async (f) => {
          try {
            const url = await uploadImage(docId, f);
            editorRef.current?.chain().focus().setImage({ src: url, alt: f.name }).run();
          } catch (e) {
            toast((e as Error).message, "error");
          }
        });
        return true;
      },
      handleDrop: (view, event) => {
        const files = [...(event.dataTransfer?.files ?? [])].filter((f) => f.type.startsWith("image/"));
        if (!files.length) return false;
        event.preventDefault();
        files.forEach(async (f) => {
          try {
            const url = await uploadImage(docId, f);
            editorRef.current?.chain().focus().setImage({ src: url, alt: f.name }).run();
          } catch (e) {
            toast((e as Error).message, "error");
          }
        });
        return true;
      },
    },
    onUpdate: () => onChange(),
  });

  useEffect(() => {
    editorRef.current = editor;
    if (!editor) return;
    // restore unsynced local edits (crash / offline / closed tab)
    try {
      const raw = localStorage.getItem(pendingKey);
      if (raw) {
        const p: Pending = JSON.parse(raw);
        if (p.content !== initial.content || p.title !== initial.title) {
          editor.commands.setContent(markdownToEditorHtml(p.content), { emitUpdate: false });
          setTitle(p.title);
          titleRef.current = p.title;
          if (p.baseVersionId === initial.versionId) {
            setStatus({ kind: "dirty", msg: "已恢复本地未同步的修改" });
            setTimeout(() => void save(), 500);
          } else {
            // the server moved on while these edits were offline: save against the old base so the conflict surfaces
            base.current = p.baseVersionId;
            void save();
          }
        } else localStorage.removeItem(pendingKey);
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  useEffect(() => {
    const tick = setInterval(() => {
      if (blocked.current) return;
      const dirty = currentMarkdown() !== lastSaved.current.content || titleRef.current.trim() !== lastSaved.current.title;
      if (dirty && Date.now() - lastAttempt.current >= MAX_WAIT) void save();
    }, 5000);
    const online = () => void save();
    const beforeUnload = (e: BeforeUnloadEvent) => {
      const dirty = currentMarkdown() !== lastSaved.current.content || titleRef.current.trim() !== lastSaved.current.title;
      if (dirty) {
        persistPending();
        e.preventDefault();
      }
    };
    const keys = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        void save();
      }
    };
    window.addEventListener("online", online);
    window.addEventListener("beforeunload", beforeUnload);
    window.addEventListener("keydown", keys);
    return () => {
      clearInterval(tick);
      window.removeEventListener("online", online);
      window.removeEventListener("beforeunload", beforeUnload);
      window.removeEventListener("keydown", keys);
    };
  }, [currentMarkdown, persistPending, save]);

  async function resolveKeepMine() {
    if (!conflict) return;
    base.current = conflict.versionId;
    blocked.current = false;
    setConflict(null);
    lastSaved.current = { title: conflict.title, content: conflict.content };
    await save(true);
  }

  async function resolveTakeServer() {
    if (!conflict || !editor) return;
    if (!(await confirmDialog({ title: "载入服务器上的最新版本？", body: "你的本地修改将被丢弃，不会保存。", confirmText: "放弃本地修改", danger: true }))) return;
    editor.commands.setContent(markdownToEditorHtml(conflict.content), { emitUpdate: false });
    setTitle(conflict.title);
    titleRef.current = conflict.title;
    base.current = conflict.versionId;
    lastSaved.current = { title: conflict.title, content: conflict.content };
    blocked.current = false;
    setConflict(null);
    localStorage.removeItem(pendingKey);
    setStatus({ kind: "saved" });
  }

  async function publishNow() {
    setPublishing(true);
    const ok = await save();
    if (!ok && (blocked.current || status.kind === "error")) {
      setPublishing(false);
      return;
    }
    const res = await fetch(`/api/docs/${docId}/publish`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    setPublishing(false);
    if (!res.ok) return toast((await res.json()).error || "发布失败", "error");
    router.push(`/d/${docId}`);
    router.refresh();
  }

  const statusText: Record<Status["kind"], string> = {
    saved: status.at ? `已保存 ${status.at}` : "已保存",
    dirty: status.msg ?? "有未保存的修改",
    saving: "保存中…",
    offline: "离线 · 修改已暂存在本机，联网后自动同步",
    conflict: "版本冲突",
    error: status.msg ?? "保存失败",
  };
  const dot: Record<Status["kind"], string> = { saved: "#5ac77a", dirty: "#f2d94e", saving: "#4fd8de", offline: "#f59e4b", conflict: "#ef4458", error: "#ef4458" };

  return (
    <div className="min-h-screen flex flex-col">
      <div className="sticky top-0 z-30 bg-[var(--panel)] border-b hairline">
        <div className="mx-auto max-w-5xl px-4 h-12 flex items-center gap-3">
          <Link href={backHref} className="btn btn-ghost btn-sm" onClick={() => void save()}>
            <ArrowLeft size={15} /> 返回
          </Link>
          <span className="flex items-center gap-1.5 text-xs muted truncate">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: dot[status.kind] }} />
            {statusText[status.kind]}
          </span>
          <span className="flex-1" />
          <Link href={`/d/${docId}/history`} className="btn btn-ghost btn-sm">历史版本</Link>
          <button className="btn btn-sm" onClick={() => void save()} disabled={status.kind === "saving"}>保存草稿</button>
          <button className="btn btn-primary btn-sm" onClick={publishNow} disabled={publishing || status.kind === "conflict"}>
            {publishing ? "发布中…" : published ? "发布更新" : "发布"}
          </button>
        </div>
        {editor && <Toolbar editor={editor} docId={docId} />}
      </div>

      {conflict && (
        <div className="mx-auto max-w-5xl w-full px-4 mt-4">
          <div className="rounded-xl border border-[#f7cdd3] bg-[#fdeef0] dark:bg-[#351820] dark:border-[#552531] p-4 text-sm">
            <div className="font-semibold">其他窗口已保存了新版本</div>
            <p className="mt-1 muted">
              {conflict.by ? `@${conflict.by}` : "某位编辑者"} 于 {new Date(conflict.at).toLocaleString("zh-CN")} 保存了版本 #{conflict.versionId}。你的修改仍保留在当前编辑器和本机暂存中，尚未覆盖任何内容。
            </p>
            <div className="flex flex-wrap gap-2 mt-3">
              <button className="btn btn-primary btn-sm" onClick={resolveKeepMine}>保留我的修改（另存为新版本）</button>
              <a className="btn btn-sm" href={`/d/${docId}?v=${conflict.versionId}`} target="_blank">在新窗口查看对方版本</a>
              <button className="btn btn-sm btn-danger" onClick={resolveTakeServer}>放弃我的修改</button>
            </div>
          </div>
        </div>
      )}

      <main className="mx-auto max-w-3xl w-full px-4 py-10 flex-1">
        <input
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            titleRef.current = e.target.value;
            onChange();
          }}
          className="w-full text-[2rem] font-bold tracking-tight bg-transparent outline-none placeholder:text-[var(--muted)]"
          placeholder="文档标题"
          maxLength={120}
        />
        <div className="mt-6">
          <EditorContent editor={editor} />
        </div>
      </main>
    </div>
  );
}

function TB({ on, active, title, children, disabled }: { on: () => void; active?: boolean; title: string; children: React.ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={on}
      className={cx("w-8 h-8 inline-flex items-center justify-center rounded-md shrink-0 disabled:opacity-30", active ? "bg-[var(--accent-soft)] text-[var(--text)]" : "hover:bg-[var(--panel-2)] muted")}
    >
      {children}
    </button>
  );
}

function Sep() {
  return <span className="w-px h-5 bg-[var(--line)] mx-1 shrink-0" />;
}

function Swatches({ editor, kind, onDone }: { editor: TEditor; kind: "fg" | "bg"; onDone: () => void }) {
  return (
    <div className="pop-in absolute top-9 left-0 z-40 panel p-2 shadow-xl w-[204px]" onMouseDown={(e) => e.preventDefault()}>
      <div className="grid grid-cols-8 gap-1">
        {PALETTE.map((p) => (
          <button
            key={p.id}
            title={p.label}
            onClick={() => {
              editor.chain().focus().setColorText({ [kind]: p.id }).run();
              onDone();
            }}
            className={cx("w-5 h-5 rounded border hairline flex items-center justify-center text-[11px] font-bold", kind === "fg" ? `fg-${p.id}` : `bg-${p.id}`)}
          >
            {kind === "fg" ? "A" : ""}
          </button>
        ))}
      </div>
      <button
        className="mt-2 text-xs muted hover:underline flex items-center gap-1"
        onClick={() => {
          editor.chain().focus().setColorText({ [kind]: null }).run();
          onDone();
        }}
      >
        <Eraser size={12} /> 清除{kind === "fg" ? "文字颜色" : "背景高亮"}
      </button>
    </div>
  );
}

function Toolbar({ editor, docId }: { editor: TEditor; docId: number }) {
  const [, force] = useState(0);
  const [pop, setPop] = useState<"fg" | "bg" | "callout" | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const f = () => force((x) => x + 1);
    editor.on("selectionUpdate", f);
    editor.on("transaction", f);
    return () => {
      editor.off("selectionUpdate", f);
      editor.off("transaction", f);
    };
  }, [editor]);
  const c = () => editor.chain().focus();
  const inTable = editor.isActive("table");
  const block = editor.isActive("heading", { level: 1 }) ? "h1" : editor.isActive("heading", { level: 2 }) ? "h2" : editor.isActive("heading", { level: 3 }) ? "h3" : editor.isActive("heading", { level: 4 }) ? "h4" : "p";

  return (
    <div className="mx-auto max-w-5xl px-3 pb-1.5 flex items-center gap-0.5 overflow-x-auto relative">
      <TB title="撤销" on={() => c().undo().run()} disabled={!editor.can().undo()}><Undo2 size={16} /></TB>
      <TB title="重做" on={() => c().redo().run()} disabled={!editor.can().redo()}><Redo2 size={16} /></TB>
      <Sep />
      <Select
        variant="ghost"
        size="sm"
        className="shrink-0 w-[92px]"
        value={block}
        aria-label="段落样式"
        onChange={(v) => {
          if (v === "p") c().setParagraph().run();
          else c().setHeading({ level: Number(v[1]) as 1 | 2 | 3 | 4 }).run();
        }}
        options={[
          { value: "p", label: "正文" },
          { value: "h1", label: "标题 1" },
          { value: "h2", label: "标题 2" },
          { value: "h3", label: "标题 3" },
          { value: "h4", label: "标题 4" },
        ]}
      />
      <Sep />
      <TB title="加粗 ⌘B" active={editor.isActive("bold")} on={() => c().toggleBold().run()}><Bold size={16} /></TB>
      <TB title="斜体 ⌘I" active={editor.isActive("italic")} on={() => c().toggleItalic().run()}><Italic size={16} /></TB>
      <TB title="删除线" active={editor.isActive("strike")} on={() => c().toggleStrike().run()}><Strikethrough size={16} /></TB>
      <TB title="行内代码" active={editor.isActive("code")} on={() => c().toggleCode().run()}><Code size={16} /></TB>
      <div className="relative">
        <TB title="文字颜色" active={!!editor.getAttributes("colorText").fg} on={() => setPop(pop === "fg" ? null : "fg")}><Palette size={16} /></TB>
        {pop === "fg" && <Swatches editor={editor} kind="fg" onDone={() => setPop(null)} />}
      </div>
      <div className="relative">
        <TB title="背景高亮" active={!!editor.getAttributes("colorText").bg} on={() => setPop(pop === "bg" ? null : "bg")}><Highlighter size={16} /></TB>
        {pop === "bg" && <Swatches editor={editor} kind="bg" onDone={() => setPop(null)} />}
      </div>
      <TB
        title="链接"
        active={editor.isActive("link")}
        on={async () => {
          const prev = editor.getAttributes("link").href as string | undefined;
          const url = await promptDialog({ title: prev ? "编辑链接" : "插入链接", body: "外部网址，或站内文档地址（如 /d/12）。留空则移除链接。", defaultValue: prev ?? "https://" });
          if (url === null) return;
          if (!url.trim()) c().unsetLink().run();
          else c().extendMarkRange("link").setLink({ href: url.trim() }).run();
        }}
      >
        <Link2 size={16} />
      </TB>
      <Sep />
      <TB title="无序列表" active={editor.isActive("bulletList")} on={() => c().toggleBulletList().run()}><List size={16} /></TB>
      <TB title="有序列表" active={editor.isActive("orderedList")} on={() => c().toggleOrderedList().run()}><ListOrdered size={16} /></TB>
      <TB title="任务列表" active={editor.isActive("taskList")} on={() => c().toggleTaskList().run()}><ListChecks size={16} /></TB>
      <TB title="引用" active={editor.isActive("blockquote")} on={() => c().toggleBlockquote().run()}><Quote size={16} /></TB>
      <TB title="代码块" active={editor.isActive("codeBlock")} on={() => c().toggleCodeBlock().run()}><SquareCode size={16} /></TB>
      {editor.isActive("codeBlock") && (
        <input
          className="h-7 w-24 text-xs input shrink-0"
          placeholder="语言 如 ts"
          value={(editor.getAttributes("codeBlock").language as string) ?? ""}
          onChange={(e) => editor.chain().updateAttributes("codeBlock", { language: e.target.value.replace(/[^\w+#-]/g, "") || null }).run()}
        />
      )}
      <div className="relative">
        <TB title="提示块" active={editor.isActive("callout")} on={() => setPop(pop === "callout" ? null : "callout")}><MessageSquareWarning size={16} /></TB>
        {pop === "callout" && (
          <div className="pop-in absolute top-9 left-0 z-40 panel p-1 shadow-xl w-28 text-sm" onMouseDown={(e) => e.preventDefault()}>
            {CALLOUT_TYPES.map((t) => (
              <button
                key={t.id}
                className="w-full text-left px-2 py-1 rounded hover:bg-[var(--panel-2)]"
                onClick={() => {
                  c().insertCallout(t.id).run();
                  setPop(null);
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}
      </div>
      <TB title="折叠块" on={() => c().insertDetails().run()}><ChevronsUpDown size={16} /></TB>
      <TB title="插入表格" on={() => c().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}><Table2 size={16} /></TB>
      <TB title="插入图片" on={() => fileRef.current?.click()}><ImagePlus size={16} /></TB>
      <TB title="分割线" on={() => c().setHorizontalRule().run()}><Minus size={16} /></TB>
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          try {
            const url = await uploadImage(docId, f);
            c().setImage({ src: url, alt: f.name }).run();
          } catch (err) {
            toast((err as Error).message, "error");
          }
        }}
      />
      {inTable && (
        <>
          <Sep />
          <button className="btn btn-ghost btn-sm" onClick={() => c().addRowAfter().run()}>+行</button>
          <button className="btn btn-ghost btn-sm" onClick={() => c().addColumnAfter().run()}>+列</button>
          <button className="btn btn-ghost btn-sm" onClick={() => c().deleteRow().run()}>−行</button>
          <button className="btn btn-ghost btn-sm" onClick={() => c().deleteColumn().run()}>−列</button>
          <button className="btn btn-ghost btn-sm btn-danger" onClick={() => c().deleteTable().run()}>删表</button>
        </>
      )}
    </div>
  );
}
