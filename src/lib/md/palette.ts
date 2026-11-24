// Fixed colour palette for `:text[...]{fg=.. bg=..}` inline directives.
export const PALETTE = [
  { id: "red", label: "红" },
  { id: "orange", label: "橙" },
  { id: "yellow", label: "黄" },
  { id: "green", label: "绿" },
  { id: "cyan", label: "青" },
  { id: "blue", label: "蓝" },
  { id: "purple", label: "紫" },
  { id: "gray", label: "灰" },
] as const;
export type PaletteId = (typeof PALETTE)[number]["id"];
export const PALETTE_IDS = new Set<string>(PALETTE.map((p) => p.id));
export const CALLOUT_TYPES = [
  { id: "info", label: "信息" },
  { id: "tip", label: "提示" },
  { id: "warn", label: "注意" },
  { id: "danger", label: "警告" },
  { id: "success", label: "完成" },
] as const;
export const CALLOUT_IDS = new Set<string>(CALLOUT_TYPES.map((c) => c.id));
