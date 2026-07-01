import { config } from './config';
import { acquire, reconcile, estimateTokens, RateGuardError } from './rateGuard';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMOptions {
  temperature?: number;
  max_tokens?: number;
  response_format?: 'text' | 'json';
  maxRetries?: number;   // re-tentativas em erro transitório (default 3)
  retryCapMs?: number;   // teto de espera por tentativa (default 3000ms)
}

/** Erro tipado: permite ao chamador distinguir transitório (429/5xx/rede) de permanente. */
export class LLMError extends Error {
  status: number;
  transient: boolean;
  constructor(message: string, status: number, transient: boolean) {
    super(message);
    this.name = 'LLMError';
    this.status = status;
    this.transient = transient;
  }
}

const TRANSIENT_STATUS = new Set([429, 500, 502, 503, 504]);
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Lê o tempo de espera sugerido pelo Groq (header retry-after OU corpo "try again in Xms/Xs"). */
function parseRetryDelayMs(res: Response, bodyText: string, cap: number): number {
  const header = res.headers.get('retry-after');
  if (header) {
    const secs = Number(header);
    if (!Number.isNaN(secs)) return Math.min(secs * 1000, cap);
  }
  const m = bodyText.match(/try again in ([\d.]+)\s*(ms|s)/i);
  if (m) {
    const val = parseFloat(m[1]);
    const ms = m[2].toLowerCase() === 's' ? val * 1000 : val;
    return Math.min(Math.ceil(ms) + 100, cap); // +100ms de folga
  }
  return Math.min(800, cap);
}

export async function llm(messages: LLMMessage[], opts: LLMOptions = {}): Promise<string> {
  if (!config.groq.apiKey) throw new Error('GROQ_API_KEY ausente');

  const maxRetries = opts.maxRetries ?? 3;
  const retryCapMs = opts.retryCapMs ?? 3000;
  const maxTokens = opts.max_tokens ?? 800;

  const body: Record<string, unknown> = {
    model: config.groq.model,
    messages,
    temperature: opts.temperature ?? 0.7,
    max_tokens: maxTokens,
  };
  if (opts.response_format === 'json') {
    body.response_format = { type: 'json_object' };
  }

  let lastErr: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    // ★ BARREIRA: reserva orçamento de TPM antes de tocar no Groq.
    //   Se saturar além de MAX_WAIT_MS, lança RateGuardError (transitório).
    const reservation = await acquire(estimateTokens(messages, maxTokens));

    let res: Response;
    try {
      res = await fetch(GROQ_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.groq.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
    } catch (netErr: unknown) {
      const msg = netErr instanceof Error ? netErr.message : String(netErr);
      lastErr = new LLMError(`LLM network error: ${msg}`, 0, true);
      if (attempt < maxRetries) {
        await sleep(Math.min(500 * 2 ** attempt, retryCapMs));
        continue;
      }
      throw lastErr;
    }

    if (res.ok) {
      const json = await res.json();
      reconcile(reservation, json.usage?.total_tokens ?? 0); // ★ ajusta com consumo real
      return json.choices?.[0]?.message?.content ?? '';
    }

    const text = await res.text();
    const transient = TRANSIENT_STATUS.has(res.status);
    lastErr = new LLMError(`LLM error ${res.status}: ${text}`, res.status, transient);

    if (transient && attempt < maxRetries) {
      await sleep(parseRetryDelayMs(res, text, retryCapMs));
      continue;
    }
    throw lastErr;
  }

  throw lastErr ?? new LLMError('LLM erro desconhecido', 0, true);
}

export async function llmJSON<T>(messages: LLMMessage[], opts: LLMOptions = {}): Promise<T> {
  const raw = await llm(messages, { ...opts, response_format: 'json' });
  try {
    return JSON.parse(raw) as T;
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('LLM não retornou JSON válido: ' + raw);
    return JSON.parse(match[0]) as T;
  }
}
