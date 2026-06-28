'use client';
// ============================================================
// src/app/blast/page.tsx
// Tela de Disparo em Lote Manual.
// Fluxo: campanha → canal → texto → imagens → quantidade →
//        PREVIEW → confirmar → disparar.
// Light mode, semântico, acessível.
// ============================================================
import { useEffect, useState } from 'react';

interface Campaign { id: string; name: string; total_leads: number | null; }
type Channel = 'email' | 'whatsapp';
type Step = 'montar' | 'preview' | 'resultado';

interface WaLink { to: string; link: string; }

export default function BlastPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [campaignId, setCampaignId] = useState('');
  const [channel, setChannel] = useState<Channel>('email');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [limit, setLimit] = useState<number | ''>(10);

  const [step, setStep] = useState<Step>('montar');
  const [batchId, setBatchId] = useState('');
  const [targetCount, setTargetCount] = useState(0);
  const [sampleRecipients, setSampleRecipients] = useState<{ company: string; to: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ sent: number; failed: number; wa_links?: WaLink[]; note: string } | null>(null);

  useEffect(() => {
    fetch('/api/campaigns')
      .then(r => r.json())
      .then(d => setCampaigns(Array.isArray(d) ? d : (d.campaigns ?? [])))
      .catch(() => {});
  }, []);

  async function handleUpload(file: File) {
    if (imageUrls.length >= 3) { setError('Máximo 3 imagens'); return; }
    setUploading(true); setError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/upload/image', { method: 'POST', body: fd });
      const data = await res.json();
      if (data.url) setImageUrls(prev => [...prev, data.url]);
      else setError(data.error ?? 'Falha no upload');
    } catch { setError('Erro ao enviar imagem'); }
    finally { setUploading(false); }
  }

  function removeImage(url: string) {
    setImageUrls(prev => prev.filter(u => u !== url));
  }

  async function montarPreview() {
    setError('');
    if (!campaignId) { setError('Escolha uma campanha'); return; }
    if (!body.trim()) { setError('Escreva o texto da mensagem'); return; }
    if (channel === 'email' && !subject.trim()) { setError('Escreva o assunto do email'); return; }
    setLoading(true);
    try {
      const res = await fetch('/api/blast/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaign_id: campaignId, channel, subject, body,
          image_urls: imageUrls, limit: limit === '' ? undefined : limit
        })
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Erro ao montar'); return; }
      setBatchId(data.batch_id);
      setTargetCount(data.target_count);
      setSampleRecipients(data.preview.sample_recipients ?? []);
      setStep('preview');
    } catch { setError('Erro de rede'); }
    finally { setLoading(false); }
  }

  async function dispararAgora() {
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/blast/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batch_id: batchId })
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Erro ao disparar'); return; }
      setResult({ sent: data.sent, failed: data.failed, wa_links: data.wa_links, note: data.note });
      setStep('resultado');
    } catch { setError('Erro de rede'); }
    finally { setLoading(false); }
  }

  function resetar() {
    setStep('montar'); setBatchId(''); setResult(null); setBody('');
    setSubject(''); setImageUrls([]); setSampleRecipients([]);
  }

  return (
    <main style={{ maxWidth: 760, margin: '0 auto', padding: '24px 16px', fontFamily: 'Arial, sans-serif', color: '#222' }}>
      <header style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>Disparo em Lote</h1>
        <p style={{ color: '#666', marginTop: 4 }}>Mesma mensagem e imagens para vários leads de uma campanha.</p>
      </header>

      {error && (
        <div role="alert" style={{ background: '#fde8e8', border: '1px solid #f5b5b5', color: '#a12', padding: 12, borderRadius: 8, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {step === 'montar' && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontWeight: 700 }}>Campanha</span>
            <select value={campaignId} onChange={e => setCampaignId(e.target.value)} style={inputStyle}>
              <option value="">— escolha —</option>
              {campaigns.map(c => (
                <option key={c.id} value={c.id}>{c.name} {c.total_leads ? `(${c.total_leads})` : ''}</option>
              ))}
            </select>
          </label>

          <fieldset style={{ border: '1px solid #ddd', borderRadius: 8, padding: 12 }}>
            <legend style={{ fontWeight: 700, padding: '0 6px' }}>Canal</legend>
            <label style={{ marginRight: 20 }}>
              <input type="radio" name="ch" checked={channel === 'email'} onChange={() => setChannel('email')} /> Email
            </label>
            <label>
              <input type="radio" name="ch" checked={channel === 'whatsapp'} onChange={() => setChannel('whatsapp')} /> WhatsApp (links wa.me)
            </label>
            {channel === 'whatsapp' && (
              <p style={{ fontSize: 13, color: '#777', marginTop: 8 }}>
                O WhatsApp gera links prontos — você clica em cada um e envia. As imagens você anexa na hora pelo zap.
              </p>
            )}
          </fieldset>

          {channel === 'email' && (
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontWeight: 700 }}>Assunto do email</span>
              <input value={subject} onChange={e => setSubject(e.target.value)} style={inputStyle} />
            </label>
          )}

          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontWeight: 700 }}>Mensagem (igual para todos)</span>
            <textarea value={body} onChange={e => setBody(e.target.value)} rows={6} style={{ ...inputStyle, resize: 'vertical' }} />
          </label>

          <div>
            <span style={{ fontWeight: 700 }}>Imagens (até 3)</span>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
              {imageUrls.map(url => (
                <div key={url} style={{ position: 'relative' }}>
                  <img src={url} alt="" style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 6 }} />
                  <button onClick={() => removeImage(url)} aria-label="Remover imagem"
                    style={{ position: 'absolute', top: -6, right: -6, background: '#a12', color: '#fff', border: 'none', borderRadius: '50%', width: 20, height: 20, cursor: 'pointer' }}>×</button>
                </div>
              ))}
              {imageUrls.length < 3 && (
                <label style={{ width: 80, height: 80, border: '2px dashed #bbb', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#888' }}>
                  {uploading ? '...' : '+'}
                  <input type="file" accept="image/*" style={{ display: 'none' }}
                    onChange={e => e.target.files?.[0] && handleUpload(e.target.files[0])} />
                </label>
              )}
            </div>
          </div>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontWeight: 700 }}>Quantidade de leads</span>
            <input type="number" min={1} value={limit}
              onChange={e => setLimit(e.target.value === '' ? '' : Number(e.target.value))}
              style={{ ...inputStyle, maxWidth: 140 }} />
            <span style={{ fontSize: 13, color: '#777' }}>Deixe vazio para todos da campanha que tenham {channel === 'email' ? 'email' : 'WhatsApp'}.</span>
          </label>

          <button onClick={montarPreview} disabled={loading} style={primaryBtn}>
            {loading ? 'Montando…' : 'Montar e ver preview →'}
          </button>
        </section>
      )}

      {step === 'preview' && (
        <section>
          <h2 style={{ fontSize: 18 }}>Preview — confira antes de disparar</h2>
          <div style={{ background: '#f7f7f7', borderRadius: 8, padding: 16, margin: '12px 0' }}>
            <p style={{ margin: '0 0 8px', color: '#666', fontSize: 13 }}>
              Canal: <strong>{channel === 'email' ? 'Email' : 'WhatsApp'}</strong> · Vai para <strong>{targetCount}</strong> leads
            </p>
            {channel === 'email' && <p style={{ fontWeight: 700, margin: '8px 0' }}>Assunto: {subject}</p>}
            <div style={{ background: '#fff', border: '1px solid #e3e3e3', borderRadius: 8, padding: 16 }}>
              {body.split('\n').map((line, i) => <p key={i} style={{ margin: '0 0 10px', fontSize: 15, lineHeight: 1.5 }}>{line}</p>)}
              {imageUrls.map(url => <img key={url} src={url} alt="" style={{ maxWidth: '100%', borderRadius: 8, margin: '8px 0', display: 'block' }} />)}
            </div>
            {sampleRecipients.length > 0 && (
              <div style={{ marginTop: 12, fontSize: 13, color: '#555' }}>
                <strong>Primeiros destinatários:</strong>
                <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                  {sampleRecipients.map((r, i) => <li key={i}>{r.company} — {r.to}</li>)}
                </ul>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 12 }}>
            <button onClick={() => setStep('montar')} style={secondaryBtn}>← Voltar e editar</button>
            <button onClick={dispararAgora} disabled={loading} style={primaryBtn}>
              {loading ? 'Disparando…' : `Confirmar e disparar para ${targetCount} →`}
            </button>
          </div>
        </section>
      )}

      {step === 'resultado' && result && (
        <section>
          <h2 style={{ fontSize: 18 }}>Resultado</h2>
          <div style={{ background: '#eafbe8', border: '1px solid #b5e5b0', borderRadius: 8, padding: 16, margin: '12px 0' }}>
            <p style={{ margin: 0, fontWeight: 700, color: '#1a7a1a' }}>✓ {result.sent} processados{result.failed ? ` · ${result.failed} falharam` : ''}</p>
            <p style={{ margin: '8px 0 0', fontSize: 14, color: '#555' }}>{result.note}</p>
          </div>

          {result.wa_links && result.wa_links.length > 0 && (
            <div>
              <h3 style={{ fontSize: 15 }}>Links do WhatsApp — clique para enviar</h3>
              <ul style={{ paddingLeft: 18 }}>
                {result.wa_links.map((w, i) => (
                  <li key={i} style={{ marginBottom: 6 }}>
                    <a href={w.link} target="_blank" rel="noopener noreferrer" style={{ color: '#0a7' }}>
                      {w.to} — abrir WhatsApp
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <button onClick={resetar} style={primaryBtn}>Novo disparo</button>
        </section>
      )}
    </main>
  );
}

const inputStyle: React.CSSProperties = {
  padding: '10px 12px', border: '1px solid #ccc', borderRadius: 8, fontSize: 15, fontFamily: 'inherit'
};
const primaryBtn: React.CSSProperties = {
  background: '#1a1a1a', color: '#fff', border: 'none', borderRadius: 8, padding: '12px 20px', fontSize: 15, fontWeight: 700, cursor: 'pointer'
};
const secondaryBtn: React.CSSProperties = {
  background: '#fff', color: '#333', border: '1px solid #ccc', borderRadius: 8, padding: '12px 20px', fontSize: 15, cursor: 'pointer'
};
