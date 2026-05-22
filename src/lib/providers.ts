import { config } from './config';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export async function sendEmail(params: {
  to: string;
  subject: string;
  body: string;
}): Promise<{ id: string }> {
  if (!config.brevo.apiKey)  throw new Error('BREVO_API_KEY não configurado');
  if (!config.brevo.fromEmail) throw new Error('FROM_EMAIL não configurado');

  const html = params.body
    .split('\n')
    .map(line => `<p style="margin:0 0 12px 0;font-family:Arial,sans-serif;font-size:15px;line-height:1.55;color:#222">${escapeHtml(line)}</p>`)
    .join('');

  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': config.brevo.apiKey,
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify({
      sender:      { name: config.brevo.fromName, email: config.brevo.fromEmail },
      to:          [{ email: params.to }],
      replyTo:     { email: config.brevo.replyTo || config.brevo.fromEmail },
      subject:     params.subject,
      htmlContent: html
    })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Brevo error ${res.status}: ${text}`);
  }

  const json = await res.json();
  return { id: json.messageId ?? 'sent' };
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
