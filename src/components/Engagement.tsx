"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Heart, MessageSquare } from "lucide-react";
import { Avatar } from "./Avatar";
import { cx } from "@/lib/util";

export type CommentView = { id: number; parent_id: number | null; body: string; author: string; avatar: string | null; at: string; hidden: boolean; mine: boolean };

export function LikeButton({ docId, liked, count, loggedIn }: { docId: number; liked: boolean; count: number; loggedIn: boolean }) {
  const [state, setState] = useState({ liked, count });
  const [busy, setBusy] = useState(false);
  return (
    <button
      className={cx("btn", state.liked && "text-[#ef4458] border-[#f7c7cf]")}
      disabled={busy}
      onClick={async () => {
        if (!loggedIn) return (location.href = `/api/auth/login?return_to=${encodeURIComponent(location.pathname)}`);
        setBusy(true);
        const res = await fetch(`/api/docs/${docId}/like`, { method: "POST" });
        if (res.ok) setState(await res.json());
        setBusy(false);
      }}
    >
      <Heart size={15} fill={state.liked ? "currentColor" : "none"} /> {state.count > 0 ? state.count : "点赞"}
    </button>
  );
}

export function Comments({ docId, comments, loggedIn, canModerate }: { docId: number; comments: CommentView[]; loggedIn: boolean; canModerate: boolean }) {
  const router = useRouter();
  const [reply, setReply] = useState<number | null>(null);
  const roots = comments.filter((c) => !c.parent_id);
  const kids = (id: number) => comments.filter((c) => c.parent_id === id);

  async function send(body: string, parentId: number | null) {
    const res = await fetch(`/api/docs/${docId}/comments`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ body, parentId }) });
    if (!res.ok) return alert((await res.json()).error || "发送失败");
    setReply(null);
    router.refresh();
  }
  async function hide(id: number, hidden: boolean) {
    const res = await fetch(`/api/comments/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ hidden }) });
    if (!res.ok) return alert((await res.json()).error || "操作失败");
    router.refresh();
  }

  const item = (c: CommentView, nested = false) => (
    <div key={c.id} className={cx("flex gap-3", nested && "mt-3")}>
      <Avatar name={c.author} url={c.avatar} size={nested ? 24 : 30} />
      <div className="flex-1 min-w-0">
        <div className="text-sm">
          <span className="font-medium">{c.author}</span>
          <span className="muted text-xs ml-2">{c.at}</span>
        </div>
        {c.hidden ? (
          <div className="text-sm muted italic mt-0.5">该评论已被隐藏{canModerate && <span className="not-italic">：{c.body}</span>}</div>
        ) : (
          <div className="text-sm mt-0.5 whitespace-pre-wrap break-words">{c.body}</div>
        )}
        <div className="flex gap-3 text-xs muted mt-1">
          {loggedIn && !nested && !c.hidden && (
            <button className="hover:underline" onClick={() => setReply(reply === c.id ? null : c.id)}>回复</button>
          )}
          {(canModerate || (c.mine && !c.hidden)) && (
            <button className="hover:underline" onClick={() => hide(c.id, !c.hidden)}>{c.hidden ? "恢复显示" : "隐藏"}</button>
          )}
        </div>
        {!nested && kids(c.id).map((k) => item(k, true))}
        {reply === c.id && <Composer onSend={(b) => send(b, c.id)} placeholder={`回复 ${c.author}`} autoFocus />}
      </div>
    </div>
  );

  return (
    <section className="mt-12">
      <h2 className="font-semibold flex items-center gap-2">
        <MessageSquare size={16} /> 评论 <span className="muted text-sm font-normal">{comments.filter((c) => !c.hidden).length}</span>
      </h2>
      <div className="mt-4">
        {loggedIn ? (
          <Composer onSend={(b) => send(b, null)} placeholder="写下你的看法…" />
        ) : (
          <a href="/api/auth/login" className="block panel p-4 text-sm muted hover:bg-[var(--panel-2)]">登录后参与评论</a>
        )}
      </div>
      <div className="mt-6 space-y-5">{roots.map((c) => item(c))}</div>
    </section>
  );
}

function Composer({ onSend, placeholder, autoFocus }: { onSend: (b: string) => Promise<void>; placeholder: string; autoFocus?: boolean }) {
  const [v, setV] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="mt-2"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!v.trim()) return;
        setBusy(true);
        await onSend(v.trim());
        setV("");
        setBusy(false);
      }}
    >
      <textarea className="input" rows={2} value={v} onChange={(e) => setV(e.target.value)} placeholder={placeholder} autoFocus={autoFocus} maxLength={4000} />
      <div className="flex justify-end mt-2">
        <button className="btn btn-primary btn-sm" disabled={busy || !v.trim()}>发送</button>
      </div>
    </form>
  );
}
