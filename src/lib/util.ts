export function safeReturnTo(v: string | null | undefined) {
  if (!v || !v.startsWith("/") || v.startsWith("//") || v.startsWith("/\\")) return "/";
  return v;
}

export function timeAgo(d: Date | string) {
  const t = typeof d === "string" ? new Date(d) : d;
  const s = Math.round((Date.now() - t.getTime()) / 1000);
  if (s < 60) return "刚刚";
  if (s < 3600) return `${Math.floor(s / 60)} 分钟前`;
  if (s < 86400) return `${Math.floor(s / 3600)} 小时前`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)} 天前`;
  return fmtDate(t);
}

export function fmtDate(d: Date | string, withTime = false) {
  const t = typeof d === "string" ? new Date(d) : d;
  const p = (n: number) => String(n).padStart(2, "0");
  const date = `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}`;
  return withTime ? `${date} ${p(t.getHours())}:${p(t.getMinutes())}` : date;
}

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");
