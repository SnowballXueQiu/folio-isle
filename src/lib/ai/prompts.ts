import type { ChatMessage } from "./provider";

/** Bump when prompts or validation rules change: results are deduplicated per rules version. */
export const RULES_VERSION = "r1";

export const RELATIONS = ["none", "supplement", "prerequisite", "overlap", "conflict"] as const;
export type Relation = (typeof RELATIONS)[number];
export const RELATION_LABEL: Record<Relation, string> = {
  none: "未发现明确关联",
  supplement: "补充",
  prerequisite: "前置依赖",
  overlap: "内容重叠",
  conflict: "冲突",
};
export const RELATION_COLOR: Record<Relation, string> = {
  none: "#9d99ad",
  supplement: "#27b5bd",
  prerequisite: "#7b47c9",
  overlap: "#d4a300",
  conflict: "#ef4458",
};

const SYS = "你是严谨的中文知识库分析助手。只依据给定原文作答，不臆测。所有引用必须逐字摘自原文（可省略首尾空白），长度 8-80 字。只输出 JSON。";

export function docPrompt(title: string, text: string): ChatMessage[] {
  return [
    { role: "system", content: SYS },
    {
      role: "user",
      content: `请分析下面这篇文档，输出 JSON：
{"summary": "120 字以内的摘要", "key_points": [{"point": "要点（30 字以内）", "quote": "支撑该要点的原文逐字引用"}], "topics": ["3-6 个主题词"]}
key_points 给出 3-6 条。

《${title}》
<<<
${text}
>>>`,
    },
  ];
}

export function pairPrompt(a: { title: string; text: string; summary: string }, b: { title: string; text: string; summary: string }): ChatMessage[] {
  return [
    { role: "system", content: SYS },
    {
      role: "user",
      content: `判断文档 A 与文档 B 之间是否存在明确关系。关系类型只能是：
- supplement：一篇对另一篇的内容做了补充或延伸
- prerequisite：理解/执行一篇需要先读另一篇（用 direction 指明：a_before_b 表示 A 是 B 的前置，b_before_a 反之）
- overlap：两篇讲述了相同或高度重复的内容
- conflict：两篇在同一事实、步骤或结论上说法矛盾
- none：没有明确依据的关系（主题相近但无具体对应内容时也选 none）

只有能从两篇原文各找到至少一处逐字引用作为依据时，才能给出 none 以外的关系。
输出 JSON：{"relation": "...", "direction": "a_before_b|b_before_a|null", "reason": "80 字以内的中文理由", "evidence_a": ["A 中的逐字引用"], "evidence_b": ["B 中的逐字引用"]}

文档 A《${a.title}》摘要：${a.summary}
<<<A
${a.text}
A>>>

文档 B《${b.title}》摘要：${b.summary}
<<<B
${b.text}
B>>>`,
    },
  ];
}

export function libraryPrompt(name: string, docs: { id: number; title: string; summary: string }[]): ChatMessage[] {
  return [
    { role: "system", content: SYS },
    {
      role: "user",
      content: `下面是知识库「${name}」中全部已发布文档的摘要。请输出 JSON：
{"summary": "200 字以内的知识库总结", "highlights": [{"doc_id": 文档编号, "point": "该文档在库中的作用（30 字以内）"}], "gaps": ["库中明显缺失或值得补充的内容，0-3 条"]}

${docs.map((d) => `[${d.id}] 《${d.title}》：${d.summary}`).join("\n")}`,
    },
  ];
}

export function projectPrompt(name: string, libs: { name: string; docs: { id: number; title: string; summary: string }[] }[]): ChatMessage[] {
  return [
    { role: "system", content: SYS },
    {
      role: "user",
      content: `下面是项目「${name}」各知识库全部已发布文档的摘要。请输出 JSON：
{"overview": "300 字以内的项目总览", "themes": [{"title": "主题", "doc_ids": [相关文档编号]}], "suggestions": ["跨知识库整理建议，0-3 条"]}

${libs.map((l) => `## ${l.name}\n${l.docs.map((d) => `[${d.id}] 《${d.title}》：${d.summary}`).join("\n")}`).join("\n\n")}`,
    },
  ];
}
