"use client";
import { confirmDialog, toast } from "@/components/ui/dialogs";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function RollbackButton({ docId, versionId }: { docId: number; versionId: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      className="btn btn-sm"
      disabled={busy}
      onClick={async () => {
        if (!(await confirmDialog({ title: `回滚到版本 #${versionId}？`, body: "会以该版本正文创建一个新草稿，原有历史全部保留；需要再次发布才会对读者生效。", confirmText: "创建草稿" }))) return;
        setBusy(true);
        const res = await fetch(`/api/docs/${docId}/rollback`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ versionId }) });
        setBusy(false);
        if (!res.ok) return toast((await res.json()).error || "回滚失败", "error");
        router.push(`/d/${docId}?draft=1`);
        router.refresh();
      }}
    >
      回滚到此版本
    </button>
  );
}
