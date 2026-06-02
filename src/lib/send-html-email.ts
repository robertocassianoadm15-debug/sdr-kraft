import { config } from './config'

// Helper para email com HTML pré-montado.
// Diferença de providers.ts: não escapa o conteúdo — usar apenas quando o
// htmlContent já é HTML seguro construído internamente (nunca com input do usuário direto).
export async function sendHtmlEmail(params: {
  to: string
  subject: string
  htmlContent: string
  replyTo?: string
}): Promise<{ id: string }> {
  if (!config.email.apiKey)   throw new Error('BREVO_API_KEY não configurado')
  if (!config.email.fromEmail) throw new Error('FROM_EMAIL não configurado')

  const fromEmail    = config.email.fromEmail.toLowerCase().trim()
  const replyToEmail = (params.replyTo ?? config.email.replyTo ?? fromEmail).toLowerCase().trim()
  const toEmail      = String(params.to).toLowerCase().trim()

  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key':      config.email.apiKey,
      'Content-Type': 'application/json',
      Accept:         'application/json'
    },
    body: JSON.stringify({
      sender:      { name: config.email.fromName, email: fromEmail },
      to:          [{ email: toEmail }],
      replyTo:     { email: replyToEmail },
      subject:     params.subject,
      htmlContent: params.htmlContent
    })
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Brevo error ${res.status}: ${text}`)
  }

  const json = await res.json()
  return { id: json.messageId ?? 'sent' }
}
