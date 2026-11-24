/* eslint-disable @next/next/no-img-element */
const COLORS = ["#4fd8de", "#f2d94e", "#ef4458", "#8b7cf6", "#5ac77a", "#f59e4b"];

export function Avatar({ name, url, size = 28 }: { name: string; url?: string | null; size?: number }) {
  const style = { width: size, height: size, fontSize: Math.round(size * 0.42) };
  if (url) return <img src={url} alt={name} style={style} className="rounded-full object-cover shrink-0 border hairline" referrerPolicy="no-referrer" />;
  const c = COLORS[[...name].reduce((a, ch) => a + ch.charCodeAt(0), 0) % COLORS.length];
  return (
    <span style={{ ...style, background: c }} className="rounded-full shrink-0 inline-flex items-center justify-center font-semibold text-[#1b1630]">
      {[...name][0]?.toUpperCase() ?? "?"}
    </span>
  );
}
