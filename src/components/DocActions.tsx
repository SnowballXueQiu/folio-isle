"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function PublishButtons({ docId, published, dirty }: { docId: number; published: boolean; dirty: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const call = async (path: string, confirmText?: string) => {
    if (confirmText && !confirm(confirmText)) return;
    setBusy(true);
    const res = await fetch(`/api/docs/${docId}/${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    setBusy(false);
    if (!res.ok) return alert((await res.json()).error || "操作失败");
    router.refresh();
  };
  return (
    <>
      {(!published || dirty) && (
        <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => call("publish")}>
          {published ? "发布最新草稿" : "发布"}
        </button>
      )}
      {published && (
        <button className="btn btn-sm" disabled={busy} onClick={() => call("unpublish", "下架后读者将无法访问，AI 分析中的相关结论也会停止展示。确定下架？")}>
          下架
        </button>
      )}
    </>
  );
}
