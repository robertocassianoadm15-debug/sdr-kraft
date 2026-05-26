import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  const formData = await req.formData()
  const file = formData.get('file') as File

  if (!file) return NextResponse.json({ error: 'Nenhum arquivo' }, { status: 400 })

  // Valida tipo
  const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp']
  if (!allowed.includes(file.type)) {
    return NextResponse.json({ error: 'Tipo não permitido. Use JPG, PNG, GIF ou WEBP' }, { status: 400 })
  }

  // Valida tamanho (5MB)
  if (file.size > 5 * 1024 * 1024) {
    return NextResponse.json({ error: 'Arquivo muito grande. Máximo 5MB' }, { status: 400 })
  }

  const ext = file.name.split('.').pop()
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

  const { error } = await supabase.storage
    .from('email-images')
    .upload(filename, await file.arrayBuffer(), {
      contentType: file.type,
      upsert: false
    })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: { publicUrl } } = supabase.storage
    .from('email-images')
    .getPublicUrl(filename)

  return NextResponse.json({ url: publicUrl })
}
