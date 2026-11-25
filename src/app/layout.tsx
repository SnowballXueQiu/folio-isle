import type { Metadata } from "next";
import { Suspense } from "react";
import "./globals.css";
import { NavProgress } from "@/components/NavProgress";
import { THEME_SCRIPT } from "@/lib/theme-script";

export const metadata: Metadata = {
  title: { default: "言屿 Folio Isle", template: "%s · 言屿" },
  description: "Inf Network 项目式知识库：知识库、待办、随笔与 AI 分析",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        <meta name="theme-color" content="#f7f7f4" media="(prefers-color-scheme: light)" />
        <meta name="theme-color" content="#121019" media="(prefers-color-scheme: dark)" />
      </head>
      <body className="min-h-screen">
        <Suspense fallback={null}>
          <NavProgress />
        </Suspense>
        {children}
      </body>
    </html>
  );
}
