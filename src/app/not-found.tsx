import Link from "next/link";
import { FileQuestion } from "lucide-react";
import { TopBar } from "@/components/TopBar";

export default function NotFound() {
  return (
    <>
      <TopBar />
      <main className="shell py-20 sm:py-28 flex flex-col items-center text-center">
        <div className="w-14 h-14 rounded-2xl bg-[var(--panel-2)] flex items-center justify-center muted">
          <FileQuestion size={26} />
        </div>
        <h1 className="mt-5 text-xl font-semibold">找不到这个页面</h1>
        <p className="mt-2 text-sm muted max-w-sm">它可能已被删除、移到了回收站，或者你没有查看权限。</p>
        <div className="mt-6 flex gap-2">
          <Link href="/" className="btn btn-primary">回到首页</Link>
        </div>
      </main>
    </>
  );
}
