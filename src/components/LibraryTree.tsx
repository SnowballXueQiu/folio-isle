"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ChevronRight, FileText, Folder, FolderOpen, MoreHorizontal, Plus, FilePlus, FolderPlus } from "lucide-react";
import { cx } from "@/lib/util";

export type TreeItem = { id: number; parent_id: number | null; kind: "doc" | "group"; title: string; published: boolean; linkable: boolean; dirty?: boolean };
type N = TreeItem & { children: N[] };
type Drop = { id: number; where: "before" | "after" | "inside" } | null;

async function api(url: string, method: string, body?: unknown) {
  const res = await fetch(url, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "操作失败");
  return data;
}

export function LibraryTree({
  libraryId,
  libraries,
  items,
  currentId,
  canEdit,
}: {
  libraryId: number;
  libraries: { id: number; name: string }[];
  items: TreeItem[];
  currentId?: number;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState<Set<number>>(new Set());
  const [drag, setDrag] = useState<number | null>(null);
  const [drop, setDrop] = useState<Drop>(null);
  const [menu, setMenu] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const { roots, byId } = useMemo(() => {
    const byId = new Map<number, N>();
    items.forEach((i) => byId.set(i.id, { ...i, children: [] }));
    const roots: N[] = [];
    for (const n of byId.values()) (n.parent_id && byId.get(n.parent_id) ? byId.get(n.parent_id)!.children : roots).push(n);
    return { roots, byId };
  }, [items]);

  // expand ancestors of the current document; remember manual toggles
  useEffect(() => {
    const key = `folio:tree:${libraryId}`;
    const saved = new Set<number>(JSON.parse(localStorage.getItem(key) || "[]"));
    let cur = currentId ? byId.get(currentId) : undefined;
    while (cur?.parent_id) {
      saved.add(cur.parent_id);
      cur = byId.get(cur.parent_id);
    }
    if (currentId && byId.get(currentId)?.children.length) saved.add(currentId);
    setOpen(saved);
  }, [libraryId, currentId, byId]);

  const toggle = (id: number) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      localStorage.setItem(`folio:tree:${libraryId}`, JSON.stringify([...n]));
      return n;
    });

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    try {
      await fn();
      router.refresh();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(false);
      setMenu(null);
    }
  }

  async function create(kind: "doc" | "group", parentId: number | null) {
    const title = prompt(kind === "doc" ? "文档标题" : "分组名称", kind === "doc" ? "未命名文档" : "新分组");
    if (!title?.trim()) return;
    await run(async () => {
      const { id } = await api(`/api/libraries/${libraryId}/nodes`, "POST", { parentId, kind, title: title.trim() });
      if (parentId) setOpen((s) => new Set(s).add(parentId));
      if (kind === "doc") router.push(`/d/${id}/edit`);
    });
  }

  function siblingsOf(parentId: number | null) {
    return parentId ? byId.get(parentId)?.children ?? [] : roots;
  }

  async function onDrop(target: Drop) {
    if (!target || drag == null || drag === target.id) return;
    const t = byId.get(target.id)!;
    let parentId: number | null;
    let index: number;
    if (target.where === "inside") {
      parentId = t.id;
      index = t.children.filter((c) => c.id !== drag).length;
    } else {
      parentId = t.parent_id;
      const sibs = siblingsOf(parentId).filter((c) => c.id !== drag);
      index = sibs.findIndex((c) => c.id === t.id) + (target.where === "after" ? 1 : 0);
    }
    await run(() => api(`/api/nodes/${drag}/move`, "POST", { libraryId, parentId, index }));
    if (target.where === "inside") setOpen((s) => new Set(s).add(t.id));
  }

  function renderRow(n: N, depth: number): React.ReactNode {
    const isOpen = open.has(n.id);
    const active = n.id === currentId;
    const hasKids = n.children.length > 0;
    const d = drop?.id === n.id ? drop.where : null;
    const label = (
      <span className={cx("truncate", !n.published && n.kind === "doc" && "italic opacity-70")}>
        {n.title}
      </span>
    );
    return (
      <li key={n.id}>
        <div
          draggable={canEdit && !busy}
          onDragStart={(e) => {
            setDrag(n.id);
            e.dataTransfer.effectAllowed = "move";
          }}
          onDragEnd={() => {
            setDrag(null);
            setDrop(null);
          }}
          onDragOver={(e) => {
            if (drag == null || drag === n.id) return;
            e.preventDefault();
            const r = e.currentTarget.getBoundingClientRect();
            const y = (e.clientY - r.top) / r.height;
            setDrop({ id: n.id, where: y < 0.28 ? "before" : y > 0.72 ? "after" : "inside" });
          }}
          onDragLeave={() => setDrop((p) => (p?.id === n.id ? null : p))}
          onDrop={(e) => {
            e.preventDefault();
            onDrop(drop);
            setDrop(null);
          }}
          className={cx(
            "group relative flex items-center gap-1 rounded-md pr-1 text-[13.5px] leading-7",
            active ? "bg-[var(--accent-soft)] font-medium" : "hover:bg-[var(--panel-2)]",
            d === "inside" && "ring-2 ring-[var(--focus)]",
            drag === n.id && "opacity-40"
          )}
          style={{ paddingLeft: 4 + depth * 14 }}
        >
          {d === "before" && <span className="absolute left-2 right-2 -top-px h-0.5 bg-[var(--focus)] rounded" />}
          {d === "after" && <span className="absolute left-2 right-2 -bottom-px h-0.5 bg-[var(--focus)] rounded" />}
          <button
            className={cx("w-5 h-5 flex items-center justify-center rounded shrink-0 muted", !hasKids && "invisible")}
            onClick={() => toggle(n.id)}
            aria-label={isOpen ? "折叠" : "展开"}
          >
            <ChevronRight size={14} className={cx("transition-transform duration-200 ease-[var(--ease-out)]", isOpen && "rotate-90")} />
          </button>
          {n.kind === "group" ? (
            isOpen ? <FolderOpen size={15} className="shrink-0 muted" /> : <Folder size={15} className="shrink-0 muted" />
          ) : (
            <FileText size={15} className="shrink-0 muted" />
          )}
          {n.kind === "doc" && n.linkable ? (
            <Link href={`/d/${n.id}`} className="flex-1 min-w-0 flex items-center gap-1.5">
              {label}
              {canEdit && n.dirty && n.published && <span title="有未发布的修改" className="w-1.5 h-1.5 rounded-full bg-[var(--color-inf-yellow)] shrink-0" />}
            </Link>
          ) : (
            <button className="flex-1 min-w-0 text-left flex" onClick={() => toggle(n.id)}>
              {label}
            </button>
          )}
          {canEdit && (
            <div className="relative">
              <button
                className="opacity-0 group-hover:opacity-100 focus:opacity-100 w-6 h-6 flex items-center justify-center rounded hover:bg-[var(--line)]"
                onClick={() => setMenu(menu === n.id ? null : n.id)}
                aria-label="更多操作"
              >
                <MoreHorizontal size={14} />
              </button>
              {menu === n.id && (
                <div className="pop-in absolute right-0 top-7 z-20 w-44 panel p-1 shadow-xl text-[13px] font-normal" onMouseLeave={() => setMenu(null)}>
                  <MenuItem onClick={() => create("doc", n.id)}>新建子文档</MenuItem>
                  <MenuItem onClick={() => create("group", n.id)}>新建子分组</MenuItem>
                  <MenuItem
                    onClick={() => {
                      const title = prompt("重命名", n.title);
                      if (title?.trim() && title.trim() !== n.title) run(() => api(`/api/nodes/${n.id}`, "PATCH", { title: title.trim() }));
                    }}
                  >
                    重命名
                  </MenuItem>
                  {n.kind === "doc" && <MenuItem onClick={() => router.push(`/d/${n.id}/edit`)}>编辑</MenuItem>}
                  {libraries.length > 1 && (
                    <div className="border-t hairline mt-1 pt-1">
                      <div className="px-2 py-1 text-[11px] muted">移动到知识库</div>
                      {libraries
                        .filter((l) => l.id !== libraryId)
                        .map((l) => (
                          <MenuItem key={l.id} onClick={() => run(() => api(`/api/nodes/${n.id}/move`, "POST", { libraryId: l.id, parentId: null, index: 9999 }))}>
                            {l.name}
                          </MenuItem>
                        ))}
                    </div>
                  )}
                  <div className="border-t hairline mt-1 pt-1">
                    <MenuItem
                      danger
                      onClick={() => {
                        if (confirm(`删除「${n.title}」${hasKids ? "及其所有子节点" : ""}？管理员可在设置 → 回收站中恢复。`)) run(() => api(`/api/nodes/${n.id}`, "DELETE"));
                      }}
                    >
                      删除
                    </MenuItem>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        {hasKids && (
          <div className="reveal" data-open={isOpen}>
            <ul inert={!isOpen}>{n.children.map((c) => renderRow(c, depth + 1))}</ul>
          </div>
        )}
      </li>
    );
  }

  return (
    <div className="text-sm">
      {canEdit && (
        <div className="flex gap-1 mb-2">
          <button className="btn btn-sm flex-1 justify-center" disabled={busy} onClick={() => create("doc", null)}>
            <FilePlus size={14} /> 文档
          </button>
          <button className="btn btn-sm flex-1 justify-center" disabled={busy} onClick={() => create("group", null)}>
            <FolderPlus size={14} /> 分组
          </button>
        </div>
      )}
      {roots.length === 0 ? (
        <div className="muted text-xs px-2 py-6 text-center">
          {canEdit ? (
            <span className="inline-flex items-center gap-1">
              <Plus size={12} /> 新建第一篇文档
            </span>
          ) : (
            "暂无已发布文档"
          )}
        </div>
      ) : (
        <ul
          onDragOver={(e) => drag != null && e.preventDefault()}
          onDrop={(e) => {
            // dropped on empty space: move to end of root
            if (drag != null && e.target === e.currentTarget) run(() => api(`/api/nodes/${drag}/move`, "POST", { libraryId, parentId: null, index: 9999 }));
          }}
          className="pb-6"
        >
          {roots.map((n) => renderRow(n, 0))}
        </ul>
      )}
    </div>
  );
}

function MenuItem({ children, onClick, danger }: { children: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button className={cx("w-full text-left px-2 py-1.5 rounded-md hover:bg-[var(--panel-2)] truncate", danger && "text-[#d12c43]")} onClick={onClick}>
      {children}
    </button>
  );
}
