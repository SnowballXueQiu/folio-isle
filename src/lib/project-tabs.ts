import type { Role } from "./perms";

export type ProjectTab = { key: string; label: string; icon: "kb" | "todos" | "notes" | "ai" | "settings" | "audit" };

/** Tabs a user sees in a project, by role (shared by the desktop tab strip and the mobile tab bar). */
export function projectTabs(role: Role | null): ProjectTab[] {
  const tabs: ProjectTab[] = [{ key: "", label: "知识库", icon: "kb" }];
  if (role) tabs.push({ key: "todos", label: "待办", icon: "todos" }, { key: "notes", label: "随笔", icon: "notes" }, { key: "ai", label: "AI 分析", icon: "ai" });
  if (role === "admin") tabs.push({ key: "settings", label: "设置", icon: "settings" }, { key: "audit", label: "审计", icon: "audit" });
  return tabs;
}
