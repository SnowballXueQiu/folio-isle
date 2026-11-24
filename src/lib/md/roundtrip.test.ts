import { test } from "node:test";
import assert from "node:assert/strict";
import { generateJSON } from "@tiptap/html/server";
import { markdownToEditorHtml, renderMarkdown } from "./render";
import { docToMarkdown, type PMNode } from "./serialize";
import { baseExtensions } from "../../components/editor/extensions";
import { markdownToPlain, quoteInText, normalizeForMatch } from "./plain";

const rt = (md: string) => docToMarkdown(generateJSON(markdownToEditorHtml(md), baseExtensions()) as PMNode);

const SAMPLE = `# 标题一

普通段落，含 **加粗**、*斜体*、~~删除~~、\`code\` 和 [链接](https://example.com)。

这里 :text[需要复核]{fg=red bg=yellow} 以及 :text[**加粗彩色**]{fg=blue} 文本。

时间 10:30，备注\\:abc 不应被吞掉。

- 列表一
- 列表二
  - 嵌套

1. 第一
2. 第二

- [ ] 待办
- [x] 已完成

> 引用文字

\`\`\`ts
const a = 1;
\`\`\`

| 名称 | 值 |
| --- | --- |
| a | 1 |
| b \\| c | 2 |

![图](/api/files/abc "说明")

:::callout{type=warn}
注意事项 **重要**
:::

::::details{summary="展开看看"}
内部内容

:::callout{type=tip}
嵌套提示
:::
::::

---

结尾
`;

test("round trip is stable", () => {
  const once = rt(SAMPLE);
  const twice = rt(once);
  assert.equal(twice, once);
  for (const s of [":text[需要复核]{fg=red bg=yellow}", ":::callout{type=warn}", '::::details{summary="展开看看"}', "- [x] 已完成", "| b \\| c | 2 |", "```ts", "![图](/api/files/abc"]) {
    assert.ok(once.includes(s), `missing ${s}\n---\n${once}`);
  }
});

test("render produces palette classes and sanitizes", () => {
  const { html, headings } = renderMarkdown(SAMPLE + "\n<script>alert(1)</script>\n:text[x]{fg=evil onclick=alert(1)}\n[x](javascript:alert(1))\n");
  assert.ok(html.includes('class="ct fg-red bg-yellow"'));
  assert.ok(!html.includes("<script"));
  assert.ok(!html.includes("onclick"));
  assert.ok(!html.includes("javascript:"));
  assert.ok(html.includes("备注:abc"));
  assert.ok(html.includes("<details"));
  assert.equal(headings[0].text, "标题一");
});

test("plain text and quote matching", () => {
  const plain = markdownToPlain(SAMPLE);
  assert.ok(plain.includes("需要复核"));
  assert.ok(quoteInText("注意事项 重要", normalizeForMatch(plain)));
  assert.ok(!quoteInText("不存在的句子", normalizeForMatch(plain)));
});

test("tricky inline", () => {
  const md = rt("a **b ** c and *x*y and `a``b`\n");
  assert.equal(rt(md), md);
});
