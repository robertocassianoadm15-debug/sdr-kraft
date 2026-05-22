import { NextRequest, NextResponse } from 'next/server';
import { sendEmail } from '@/lib/providers';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const { to_email } = await req.json();
    if (!to_email) return NextResponse.json({ error: 'to_email obrigatório' }, { status: 400 });

    const result = await sendEmail({
      to: to_email,
      subject: 'SDR Kraft — Email de teste',
      body: 'SDR Kraft funcionando.\n\nEste é um email de teste enviado via Brevo.\n\n— Gráfica Liderset'
    });

    return NextResponse.json({ ok: true, id: result.id });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
