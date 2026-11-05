import { config } from './config';

/**
 * Minimal client for an OpenAI-compatible chat completions API. The default provider is Groq's free tier
 * (https://console.groq.com); any compatible endpoint works through AI_BASE_URL. Only public tool definitions,
 * and Ask Zoro questions with the records they read, are ever sent.
 */

export type ChatMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: ToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string };

export interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface ToolSpec {
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  /** Strict structured output; cannot be combined with tools on Groq. */
  schema?: { name: string; schema: Record<string, unknown> };
  tools?: ToolSpec[];
  maxTokens?: number;
  reasoningEffort?: 'low' | 'medium' | 'high';
  timeoutMs?: number;
}

export interface ChatResult {
  content: string | null;
  toolCalls: ToolCall[];
  finishReason: string | null;
  refusal: string | null;
  model: string;
}

export class LlmError extends Error {
  constructor(
    message: string,
    readonly kind: 'auth' | 'rate_limited' | 'api' | 'network' | 'not_configured',
    readonly status?: number,
  ) {
    super(message);
  }
}

export const llmConfigured = () => config.ai.apiKey !== '';

export async function chat(req: ChatRequest): Promise<ChatResult> {
  if (!llmConfigured()) throw new LlmError('no AI provider key is set (GROQ_API_KEY)', 'not_configured');
  const body: Record<string, unknown> = {
    model: req.model,
    messages: req.messages,
    max_completion_tokens: req.maxTokens ?? 4096,
    temperature: 0,
  };
  if (/gpt-oss/.test(req.model)) Object.assign(body, { reasoning_effort: req.reasoningEffort ?? 'medium', include_reasoning: false });
  if (req.schema) body.response_format = { type: 'json_schema', json_schema: { name: req.schema.name, strict: true, schema: req.schema.schema } };
  if (req.tools?.length) Object.assign(body, { tools: req.tools, tool_choice: 'auto' });

  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await fetch(`${config.ai.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${config.ai.apiKey}` },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(req.timeoutMs ?? 120_000),
      });
    } catch (e) {
      throw new LlmError(`AI provider unreachable: ${(e as Error).message}`.slice(0, 200), 'network');
    }
    if (res.status === 429) {
      // Free tiers rate-limit per minute; wait once if the provider says the wait is short, then give up.
      const wait = Number(res.headers.get('retry-after') ?? '0');
      if (attempt === 0 && wait > 0 && wait <= 20) {
        await new Promise((r) => setTimeout(r, wait * 1000));
        continue;
      }
      throw new LlmError('AI provider rate limit reached', 'rate_limited', 429);
    }
    if (res.status === 401 || res.status === 403) throw new LlmError('AI provider rejected the key (check GROQ_API_KEY)', 'auth', res.status);
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new LlmError(`AI provider error ${res.status}: ${detail.slice(0, 160)}`, 'api', res.status);
    }
    const j = (await res.json()) as { model?: string; choices?: { finish_reason?: string; message?: { content?: string | null; tool_calls?: ToolCall[]; refusal?: string | null } }[] };
    const choice = j.choices?.[0];
    return {
      content: choice?.message?.content ?? null,
      toolCalls: choice?.message?.tool_calls ?? [],
      finishReason: choice?.finish_reason ?? null,
      refusal: choice?.message?.refusal ?? null,
      model: j.model ?? req.model,
    };
  }
}

/** The provider recorded in verdict packages and shown in the Console, derived from the endpoint. */
export function providerName() {
  try {
    const host = new URL(config.ai.baseUrl).hostname;
    return host.includes('groq') ? 'groq' : host;
  } catch {
    return 'openai-compatible';
  }
}
