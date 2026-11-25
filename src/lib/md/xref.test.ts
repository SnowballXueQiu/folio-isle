import { test } from "node:test";
import assert from "node:assert/strict";
import { renderMarkdown } from "./render";
import { isNameLikeAlias } from "../ai/alias";

const links = (html: string) => [...html.matchAll(/<a [^>]*data-xref="(\d+)"[^>]*>([^<]+)<\/a>/g)].map((m) => `${m[2]}→${m[1]}`);

test("generic descriptors are not aliases", () => {
  for (const a of ["美少女", "本作主角", "该群体", "这群人", "部门", "特务组织", "生物与化学研究部门"]) assert.equal(isNameLikeAlias(a, "X"), false, a);
  for (const a of ["诺伯", "零-六-六", "小艾"]) assert.equal(isNameLikeAlias(a, "X"), true, a);
});

test("title mention wins over an earlier alias in the same section", () => {
  const xref = [{ id: 7, title: "诺伯 · 昂萨利德", names: ["诺伯 · 昂萨利德", "诺伯"], aliases: ["诺伯"] }];
  assert.deepEqual(links(renderMarkdown("诺伯来了，他就是诺伯 · 昂萨利德。", { xref }).html), ["诺伯 · 昂萨利德→7"]);
});

test("alias still links when the title is absent from the section", () => {
  const xref = [{ id: 7, title: "诺伯 · 昂萨利德", names: ["诺伯 · 昂萨利德", "诺伯"], aliases: ["诺伯"] }];
  assert.deepEqual(links(renderMarkdown("# 甲\n\n诺伯 · 昂萨利德出场\n\n# 乙\n\n诺伯离开", { xref }).html), ["诺伯 · 昂萨利德→7", "诺伯→7"]);
});
