// ============================================================
// src/app/api/blast/image-proxy/route.ts
// Proxy de imagem — resolve CORS ao copiar/baixar imagens do
// Supabase Storage. Busca a imagem pelo servidor e devolve
// com os headers corretos, sem bloqueio de origem cruzada.
// ============================================================
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url');
  if (!url) return NextResponse.json({ error: 'url obrigatória' }, { status: 400 });

  // Segurança: só aceita URLs do Supabase Storage do projeto
  let parsed: URL;
  try { parsed = new URL(url); } catch { return NextResponse.json({ error: 'url inválida' }, { status: 400 }); }
  if (!parsed.hostname.endsWith('.supabase.co')) {
    return NextResponse.json({ error: 'origem não permitida' }, { status: 403 });
  }

  try {
    const upstream = await fetch(url);
    if (!upstream.ok) return NextResponse.json({ error: 'imagem não encontrada' }, { status: upstream.status });

    const contentType = upstream.headers.get('content-type') ?? 'image/jpeg';
    const buffer = await upstream.arrayBuffer();

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600',
        'Access-Control-Allow-Origin': '*'
      }
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'erro ao buscar imagem' }, { status: 500 });
  }
}
