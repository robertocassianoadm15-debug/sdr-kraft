import { config } from './config';
import { supabase } from './supabase';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function isRetryable(status: number): boolean {
  return status === 429 || status >= 500;
}

// Delays antes da tentativa 2 e 3 (ms)
const RETRY_DELAY_MS = [1000, 3000];

async function logEmailAttempt(payload: {
  attempt: number;
  success: boolean;
  status_code: number | null;
  error: string | null;
  duration_ms: number;
  to: string;
  subject: string;
}) {
  try {
    await supabase.from('event_log').insert({
      entity_type: 'outreach',
      action: 'email_send_attempt',
      actor: 'system',
      metadata: payload
    });
  } catch { /* silently ignore — log nunca bloqueia o envio */ }
}

export async function sendEmail(params: {
  to: string;
  subject: string;
  body: string;
  replyTo?: string;
}): Promise<{ id: string }> {
  // Provider: Resend. API key e remetente lidos das envs (config.email.*).
  const apiKey = process.env.RESEND_API_KEY || config.email.apiKey;
  if (!apiKey)                 throw new Error('RESEND_API_KEY não configurado');
  if (!config.email.fromEmail) throw new Error('FROM_EMAIL não configurado');

  const html = params.body
    .split('\n')
    .map(line => `<p style="margin:0 0 12px 0;font-family:Arial,sans-serif;font-size:15px;line-height:1.55;color:#222">${escapeHtml(line)}</p>`)
    .join('');

  const fromEmail    = config.email.fromEmail.toLowerCase().trim();
  const fromName     = config.email.fromName;
  const replyToEmail = (params.replyTo ?? (config.email.replyTo || fromEmail)).toLowerCase().trim();
  const toEmail      = String(params.to).toLowerCase().trim();

  const bodyJson = JSON.stringify({
    from:     `${fromName} <${fromEmail}>`,
    to:       [toEmail],
    reply_to: replyToEmail,
    subject:  params.subject,
    html
  });

  const MAX_ATTEMPTS = 3;
  let lastError: Error = new Error('Resend: todas as tentativas falharam');

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (attempt > 1) {
      await new Promise(r => setTimeout(r, RETRY_DELAY_MS[attempt - 2]));
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    const t0 = Date.now();
    let res: Response;

    // Isola apenas o fetch — erros de rede/timeout ficam aqui
    try {
      res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        body: bodyJson,
        signal: controller.signal
      });
    } catch (err: any) {
      clearTimeout(timeoutId);
      const duration_ms = Date.now() - t0;
      if (err.name === 'AbortError') {
        await logEmailAttempt({ attempt, success: false, status_code: null, error: 'timeout (10s)', duration_ms, to: params.to, subject: params.subject });
        lastError = new Error(`Resend timeout na tentativa ${attempt}`);
        continue;
      }
      throw err; // erro de rede permanente — não retentar
    }

    clearTimeout(timeoutId);
    const duration_ms = Date.now() - t0;

    if (res.ok) {
      const json = await res.json();
      await logEmailAttempt({ attempt, success: true, status_code: res.status, error: null, duration_ms, to: params.to, subject: params.subject });
      return { id: json.id ?? 'sent' };
    }

    const text = await res.text();
    await logEmailAttempt({ attempt, success: false, status_code: res.status, error: text.slice(0, 200), duration_ms, to: params.to, subject: params.subject });

    if (!isRetryable(res.status)) {
      // 4xx (exceto 429): erro do chamador, não adianta retentar
      throw new Error(`Resend error ${res.status}: ${text}`);
    }

    lastError = new Error(`Resend error ${res.status}: ${text}`);
    // 5xx ou 429: continua para próxima tentativa
  }

  throw lastError;
}

export async function sendWhatsApp(params: {
  to: string;
  body: string;
}): Promise<{ id: string }> {
  const url      = process.env.EVOLUTION_API_URL;
  const key      = process.env.EVOLUTION_API_KEY;
  const instance = process.env.EVOLUTION_INSTANCE;

  if (!url || !key || !instance) {
    const cleanPhone = params.to.replace(/\D/g, '');
    return { id: `wa.me-fallback:${cleanPhone}` };
  }

  const res = await fetch(`${url}/message/sendText/${instance}`, {
    method: 'POST',
    headers: { apikey: key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      number: params.to.replace(/\D/g, ''),
      text: params.body
    })
  });

  if (!res.ok) throw new Error(`Evolution err ${res.status}: ${await res.text()}`);
  const json = await res.json();
  return { id: json.key?.id ?? 'unknown' };
}

/**
 * Modo B do WhatsApp: gera link wa.me com texto pré-preenchido.
 * Não envia — devolve o link para o operador clicar e enviar manualmente.
 * (Imagens não viajam pelo wa.me; o operador anexa na hora pelo zap.)
 */
export function buildWaMeLink(params: { to: string; body: string }): string {
  const phone = params.to.replace(/\D/g, '');
  const text  = encodeURIComponent(params.body);
  return `https://wa.me/${phone}?text=${text}`;
}

/**
 * Monta o HTML do email com imagens inline (no corpo) + texto.
 * Reaproveita o padrão visual do sendEmail (parágrafos Arial).
 */
export function buildEmailHtmlWithImages(body: string, imageUrls: string[]): string {
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const textHtml = body
    .split('\n')
    .map(line => `<p style="margin:0 0 12px 0;font-family:Arial,sans-serif;font-size:15px;line-height:1.55;color:#222">${esc(line)}</p>`)
    .join('');

  const imagesHtml = (imageUrls || [])
    .slice(0, 3)
    .map(url => `<img src="${url}" alt="" style="max-width:100%;height:auto;border-radius:8px;margin:8px 0;display:block" />`)
    .join('');

  return `<div style="max-width:600px;margin:0 auto">${textHtml}${imagesHtml}</div>`;
}