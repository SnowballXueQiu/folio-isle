"use client";
// A Select whose options are links (for filter bars rendered by server components).
import { useRouter } from "next/navigation";
import { Select, type SelectOption } from "./Select";

export function NavSelect({ options, value, ...rest }: { options: (SelectOption & { href: string })[]; value: string; placeholder?: string; size?: "sm" | "md"; className?: string; triggerClassName?: string; "aria-label"?: string; minWidth?: number }) {
  const router = useRouter();
  return <Select {...rest} options={options} value={value} onChange={(v) => router.push(options.find((o) => o.value === v)!.href)} />;
}
