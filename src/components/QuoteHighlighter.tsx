"use client";
import { useEffect } from "react";

/** Highlights ?q=<quote> evidence inside the document body and scrolls to it. */
export function QuoteHighlighter({ containerId }: { containerId: string }) {
  useEffect(() => {
    const q = new URLSearchParams(location.search).get("q");
    const root = document.getElementById(containerId);
    if (!q || !root) return;
    const norm = (s: string) => s.replace(/\s+/g, "");
    const target = norm(q);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes: Text[] = [];
    let full = "";
    const map: { node: Text; start: number }[] = [];
    while (walker.nextNode()) {
      const t = walker.currentNode as Text;
      nodes.push(t);
      map.push({ node: t, start: full.length });
      full += t.data;
    }
    // index without whitespace -> original index
    const idx: number[] = [];
    let flat = "";
    for (let i = 0; i < full.length; i++) if (!/\s/.test(full[i])) { idx.push(i); flat += full[i]; }
    const at = flat.toLowerCase().indexOf(target.toLowerCase());
    if (at < 0) return;
    const from = idx[at];
    const to = idx[at + target.length - 1] + 1;
    let first: HTMLElement | null = null;
    for (const { node, start } of map) {
      const end = start + node.data.length;
      if (end <= from || start >= to) continue;
      const a = Math.max(from, start) - start;
      const b = Math.min(to, end) - start;
      const range = document.createRange();
      range.setStart(node, a);
      range.setEnd(node, b);
      const mark = document.createElement("mark");
      mark.className = "quote-hit";
      range.surroundContents(mark);
      first ??= mark;
    }
    first?.scrollIntoView({ block: "center" });
  }, [containerId]);
  return null;
}
