import { config } from './config';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMOptions {
  temperature?: number;
  max_tokens?: number;
  response_format?: 'text' | 'json';
}

export async function llm(
  messages: LLMMessage[],
  opts: LLMOptions = {}
): Promise<string> {
  if (!config.groq.apiKey) throw new Error('GROQ_API_KEY ausente');

  const body: Record<string, unknown> = {
    model:       config.groq.model,
    messages,
    temperature: opts.temperature ?? 0.7,
    max_tokens:  opts.max_tokens ?? 800
  };
  if (opts.response_format === 'json') {
    body.response_format = { type: 'json_object' };
  }

  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.groq.apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`LLM error ${res.status}: ${text}`);
  }

  const json = await res.json();
  return json.choices?.[0]?.message?.content ?? '';
}

export async function llmJSON<T>(
  messages: LLMMessage[],
  opts: LLMOptions = {}
): Promise<T> {
  const raw = await llm(messages, { ...opts, response_format: 'json' });
  try {
    return JSON.parse(raw) as T;
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('LLM não retornou JSON válido: ' + raw);
    return JSON.parse(match[0]) as T;
  }
}
