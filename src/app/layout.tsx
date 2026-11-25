import type { Metadata } from "next";
import { Suspense } from "react";
import "./globals.css";
import { NavProgress } from "@/components/NavProgress";

export const metadata: Metadata = {
  title: { default: "言屿 Folio Isle", template: "%s · 言屿" },
  description: "Inf Network 项目式知识库：知识库、待办、随笔与 AI 分析",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen">
        <Suspense fallback={null}>
          <NavProgress />
        </Suspense>
        {children}
      </body>
    </html>
  );
}
