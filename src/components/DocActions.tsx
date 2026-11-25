"use client";
import { confirmDialog, toast } from "@/components/ui/dialogs";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function PublishButtons({ docId, published, dirty }: { docId: number; published: boolean; dirty: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const call = async (path: string, confirm?: { title: string; body: string }) => {
    if (confirm && !(await confirmDialog({ ...confirm, confirmText: "下架", danger: true }))) return;
    setBusy(true);
    const res = await fetch(`/api/docs/${docId}/${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    setBusy(false);
    if (!res.ok) return toast((await res.json()).error || "操作失败", "error");
    toast(path === "publish" ? "已发布" : "已下架", "success");
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
        <button className="btn btn-sm" disabled={busy} onClick={() => call("unpublish", { title: "下架这篇文档？", body: "下架后读者将无法访问，AI 分析中的相关结论也会停止展示。" })}>
          下架
        </button>
      )}
    </>
  );
}
