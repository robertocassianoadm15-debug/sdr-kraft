export const config = {
  groq: {
    apiKey: process.env.GROQ_API_KEY ?? '',
    model: process.env.GROQ_MODEL ?? 'llama-3.3-70b-versatile'
  },
  email: {
    apiKey: process.env.BREVO_API_KEY ?? '',
    fromEmail: process.env.FROM_EMAIL ?? '',
    fromName: process.env.FROM_NAME ?? 'Gráfica Liderset',
    replyTo: process.env.REPLY_TO_EMAIL ?? ''
  },
  supabase: {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  },
  app: {
    webhookSecret: process.env.WEBHOOK_SECRET ?? ''
  }
};
