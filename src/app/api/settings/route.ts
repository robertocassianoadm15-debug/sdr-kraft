import { NextResponse } from 'next/server';
import { config } from '@/lib/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    brevo_configured:   !!config.brevo.apiKey,
    from_email:         config.brevo.fromEmail,
    from_name:          config.brevo.fromName,
    reply_to_email:     config.brevo.replyTo,
    groq_configured:    !!config.groq.apiKey,
    groq_model:         config.groq.model,
    supabase_configured: !!config.supabase.url && !!config.supabase.serviceKey,
    manage_url: 'https://vercel.com/escard-s-projects/sdr-kraft/settings/environment-variables'
  });
}

export async function POST() {
  return NextResponse.json(
    { error: 'Configurações são gerenciadas via variáveis de ambiente no Vercel. Acesse: https://vercel.com/escard-s-projects/sdr-kraft/settings/environment-variables' },
    { status: 400 }
  );
}
