// OpenAI Chat Completions compatible client (DeepSeek, OpenAI, etc.)
import type { AiConfig } from "../settings";

export class RateLimitError extends Error {
  constructor(public retryAfterMs: number) {
    super("provider rate limited");
  }
}
export class RetryableError extends Error {}
export class FatalError extends Error {}

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export async function chatJson<T>(cfg: AiConfig, model: string, messages: ChatMessage[], opts: { timeoutMs?: number; maxTokens?: number } = {}): Promise<{ data: T; usage?: { prompt_tokens?: number; completion_tokens?: number } }> {
  if (!cfg.apiKey) throw new RetryableError("AI 提供方未配置 API 密钥");
  let res: Response;
  try {
    res = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify({ model, messages, temperature: 0.1, response_format: { type: "json_object" }, max_tokens: opts.maxTokens ?? 2000 }),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 120_000),
    });
  } catch (e) {
    throw new RetryableError(`网络错误：${e instanceof Error ? e.message : String(e)}`);
  }
  if (res.status === 429) {
    const ra = Number(res.headers.get("retry-after"));
    throw new RateLimitError(Number.isFinite(ra) && ra > 0 ? ra * 1000 : 0);
  }
  if (res.status >= 500 || res.status === 408) throw new RetryableError(`提供方错误 ${res.status}`);
  if (!res.ok) {
    const text = (await res.text()).slice(0, 300).replace(/sk-[\w-]+/g, "sk-***");
    if (res.status === 401 || res.status === 403) throw new FatalError(`鉴权失败 ${res.status}`);
    if (res.status === 402) throw new RetryableError(`账户余额不足 ${res.status}`);
    throw new FatalError(`请求被拒绝 ${res.status}: ${text}`);
  }
  const body = (await res.json()) as { choices?: { message?: { content?: string } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } };
  const content = body.choices?.[0]?.message?.content ?? "";
  try {
    const cleaned = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "");
    return { data: JSON.parse(cleaned) as T, usage: body.usage };
  } catch {
    throw new RetryableError("模型返回的不是合法 JSON");
  }
}
