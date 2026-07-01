/**
 * Barreira de proteção contra rate limit do Groq (TPM).
 *
 * Token bucket de janela deslizante (60s): nenhuma chamada é liberada se o
 * consumo estimado exceder o orçamento da janela. Previne o 429 na origem,
 * em vez de reagir a ele.
 *
 * Escopo: in-process. Cobre integralmente a rajada do cron de cadência (todas
 * as chamadas vivem no mesmo processo). Para coordenação entre invocações
 * serverless concorrentes, ver a evolução em Postgres (llm_try_consume).
 *
 * Configuração (env):
 *   GROQ_TPM               teto de tokens/min do tier  (default 12000)
 *   GROQ_TPM_SAFETY        fração do teto a usar        (default 0.9 = 90%)
 *   GROQ_GUARD_MAX_WAIT_MS espera máxima por liberação  (default 15000)
 */

const WINDOW_MS = 60_000;
const TPM_LIMIT = Number(process.env.GROQ_TPM ?? 12_000);
const SAFETY = Number(process.env.GROQ_TPM_SAFETY ?? 0.9);
const EFFECTIVE_LIMIT = Math.max(1, Math.floor(TPM_LIMIT * SAFETY));
const MAX_WAIT_MS = Number(process.env.GROQ_GUARD_MAX_WAIT_MS ?? 15_000);

interface Reservation {
  at: number;
  tokens: number;
}

let ledger: Reservation[] = [];

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function usedInWindow(now: number): number {
  ledger = ledger.filter((e) => now - e.at < WINDOW_MS);
  return ledger.reduce((s, e) => s + e.tokens, 0);
}

/** Estima o custo de uma request: ~4 chars por token de entrada + saída máxima. */
export function estimateTokens(
  messages: { content: string }[],
  maxTokens: number
): number {
  const inputChars = messages.reduce((s, m) => s + (m.content?.length ?? 0), 0);
  return Math.ceil(inputChars / 4) + maxTokens;
}

/** Erro transitório: sinaliza saturação ao chamador (re-agenda, não queima). */
export class RateGuardError extends Error {
  readonly transient = true;
  constructor(message: string) {
    super(message);
    this.name = 'RateGuardError';
  }
}

/**
 * Reserva orçamento antes da chamada. Aguarda (até MAX_WAIT_MS) se a janela
 * estiver cheia; lança RateGuardError se não couber a tempo.
 * Retorna a reserva, para reconciliar com o consumo real depois.
 */
export async function acquire(estimated: number): Promise<Reservation> {
  const need = Math.min(estimated, EFFECTIVE_LIMIT);
  const deadline = Date.now() + MAX_WAIT_MS;

  for (;;) {
    const now = Date.now();
    const used = usedInWindow(now);

    if (used + need <= EFFECTIVE_LIMIT) {
      const reservation: Reservation = { at: now, tokens: need };
      ledger.push(reservation);
      return reservation;
    }

    if (now >= deadline) {
      throw new RateGuardError(
        `TPM guard saturado: usado ${used}/${EFFECTIVE_LIMIT}, precisa ${need}`
      );
    }

    const oldest = ledger[0];
    const drainIn = oldest ? WINDOW_MS - (now - oldest.at) : 250;
    await sleep(Math.min(Math.max(drainIn, 50), 500, deadline - now));
  }
}

/** Ajusta a reserva com o total real informado pelo Groq (usage.total_tokens). */
export function reconcile(reservation: Reservation, actualTokens: number): void {
  if (actualTokens > 0) reservation.tokens = actualTokens;
}

/** Telemetria opcional (ex.: expor em /api/health). */
export function guardStatus(): { used: number; limit: number; pct: number } {
  const used = usedInWindow(Date.now());
  return { used, limit: EFFECTIVE_LIMIT, pct: Math.round((used / EFFECTIVE_LIMIT) * 100) };
}
