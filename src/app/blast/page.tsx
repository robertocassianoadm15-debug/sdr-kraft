'use client';
// ============================================================
// src/app/blast/page.tsx — v2
// Disparo em Lote + Modelos reutilizáveis.
// ============================================================
import { useEffect, useState, useCallback } from 'react';

interface Campaign {
  id: string; name: string; total_leads: number | null;
  leads_email?: number; leads_whatsapp?: number;
}
interface Template {
  id: string; name: string; channel: Channel;
  subject: string | null; body: string; image_urls: string[];
}
type Channel = 'email' | 'whatsapp';
type Step = 'montar' | 'preview' | 'resultado';
interface WaLink { to: string; link: string; }

export default function BlastPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templateId, setTemplateId] = useState('');

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
  const [info, setInfo] = useState('');
  const [result, setResult] = useState<{ sent: number; failed: number; wa_links?: WaLink[]; note: string } | null>(null);

  const loadCampaigns = useCallback(() => {
    fetch('/api/campaigns').then(r => r.json())
      .then(d => setCampaigns(d.campaigns ?? (Array.isArray(d) ? d : []))).catch(() => {});
  }, []);
  const loadTemplates = useCallback(() => {
    fetch('/api/blast/templates').then(r => r.json())
      .then(d => setTemplates(d.templates ?? [])).catch(() => {});
  }, []);

  useEffect(() => { loadCampaigns(); loadTemplates(); }, [loadCampaigns, loadTemplates]);

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
  function removeImage(url: string) { setImageUrls(prev => prev.filter(u => u !== url)); }

  function carregarModelo(id: string) {
    setTemplateId(id);
    const t = templates.find(x => x.id === id);
    if (!t) return;
    setChannel(t.channel);
    setSubject(t.subject ?? '');
    setBody(t.body);
    setImageUrls(Array.isArray(t.image_urls) ? t.image_urls : []);
    setInfo(`Modelo "${t.name}" carregado.`);
    setError('');
  }

  async function salvarModelo() {
    setError(''); setInfo('');
    if (!body.trim()) { setError('Escreva o texto antes de salvar o modelo'); return; }
    if (channel === 'email' && !subject.trim()) { setError('Escreva o assunto antes de salvar'); return; }
    const nome = window.prompt('Nome do modelo:', templates.find(t => t.id === templateId)?.name ?? '');
    if (!nome?.trim()) return;
    setLoading(true);
    try {
      const existing = templates.find(t => t.id === templateId && t.name === nome.trim());
      const method = existing ? 'PUT' : 'POST';
      const payload: any = { name: nome.trim(), channel, subject, body, image_urls: imageUrls };
      if (existing) payload.id = existing.id;
      const res = await fetch('/api/blast/templates', {
        method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Erro ao salvar modelo'); return; }
      setInfo(existing ? 'Modelo atualizado.' : 'Modelo salvo.');
      loadTemplates();
      if (data.template?.id) setTemplateId(data.template.id);
    } catch { setError('Erro de rede'); }
    finally { setLoading(false); }
  }

  async function excluirModelo() {
    if (!templateId) { setError('Escolha um modelo para excluir'); return; }
    const t = templates.find(x => x.id === templateId);
    if (!t) return;
    if (!window.confirm(`Excluir o modelo "${t.name}"? Esta ação não pode ser desfeita.`)) return;
    setLoading(true); setError(''); setInfo('');
    try {
      const res = await fetch('/api/blast/templates', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: templateId })
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Erro ao excluir'); return; }
      setInfo('Modelo excluído.');
      setTemplateId('');
      loadTemplates();
    } catch { setError('Erro de rede'); }
    finally { setLoading(false); }
  }

  async function montarPreview() {
    setError(''); setInfo('');
    if (!campaignId) { setError('Escolha uma campanha'); return; }
    if (!body.trim()) { setError('Escreva o texto da mensagem'); return; }
    if (channel === 'email' && !subject.trim()) { setError('Escreva o assunto do email'); return; }
    setLoading(true);
    try {
      const res = await fetch('/api/blast/create', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaign_id: campaignId, channel, subject, body, image_urls: imageUrls, limit: limit === '' ? undefined : limit })
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
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ batch_id: batchId })
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Erro ao disparar'); return; }
      setResult({ sent: data.sent, failed: data.failed, wa_links: data.wa_links, note: data.note });
      setStep('resultado');
    } catch { setError('Erro de rede'); }
    finally { setLoading(false); }
  }

  async function baixarImagem(url: string, idx: number) {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `imagem-${idx + 1}.${(blob.type.split('/')[1] || 'jpg')}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
    } catch {
      window.open(url, '_blank');
    }
  }

  async function copiarImagem(url: string) {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      // @ts-ignore — ClipboardItem existe nos navegadores modernos
      await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
      setInfo('Imagem copiada — cole no WhatsApp Web (Ctrl+V).');
    } catch {
      setError('Seu navegador não permite copiar imagem aqui. Use o botão Baixar.');
    }
  }

  function resetar() {
    setStep('montar'); setBatchId(''); setResult(null);
    setSampleRecipients([]); setInfo('');
  }

  const campSel = campaigns.find(c => c.id === campaignId);
  const disponiveis = campSel ? (channel === 'email' ? campSel.leads_email : campSel.leads_whatsapp) : undefined;

  return (
    <main style={{ maxWidth: 760, margin: '0 auto', padding: '24px 16px', fontFamily: 'Arial, sans-serif', color: '#222' }}>
      <header style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>Disparo em Lote</h1>
        <p style={{ color: '#666', marginTop: 4 }}>Mesma mensagem e imagens para vários leads de uma campanha.</p>
      </header>

      {error && <div role="alert" style={alertErr}>{error}</div>}
      {info && <div role="status" style={alertOk}>{info}</div>}

      {step === 'montar' && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          <fieldset style={{ border: '1px solid #ddd', borderRadius: 8, padding: 12 }}>
            <legend style={{ fontWeight: 700, padding: '0 6px' }}>Meus modelos</legend>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <select value={templateId} onChange={e => carregarModelo(e.target.value)} style={{ ...inputStyle, flex: 1, minWidth: 200 }}>
                <option value="">— novo (em branco) —</option>
                {templates.map(t => <option key={t.id} value={t.id}>{t.name} ({t.channel})</option>)}
              </select>
              <button type="button" onClick={salvarModelo} disabled={loading} style={smallBtn}>💾 Salvar modelo</button>
              <button type="button" onClick={excluirModelo} disabled={loading || !templateId} style={smallBtnDanger}>Excluir</button>
            </div>
            <p style={{ fontSize: 13, color: '#777', marginTop: 8 }}>
              Carregue um modelo para reusar, edite e salve por cima, ou comece em branco.
            </p>
          </fieldset>

          <label style={labelCol}>
            <span style={{ fontWeight: 700 }}>Campanha</span>
            <select value={campaignId} onChange={e => setCampaignId(e.target.value)} style={inputStyle}>
              <option value="">— escolha —</option>
              {campaigns.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name} — {c.leads_email ?? 0} c/ email · {c.leads_whatsapp ?? 0} c/ whatsapp
                </option>
              ))}
            </select>
            {campSel && disponiveis !== undefined && (
              <span style={{ fontSize: 13, color: disponiveis ? '#1a7a1a' : '#a12' }}>
                {disponiveis} leads com {channel === 'email' ? 'email' : 'whatsapp'} nesta campanha.
              </span>
            )}
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
            <label style={labelCol}>
              <span style={{ fontWeight: 700 }}>Assunto do email</span>
              <input value={subject} onChange={e => setSubject(e.target.value)} style={inputStyle} />
            </label>
          )}

          <label style={labelCol}>
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

          <label style={labelCol}>
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
              {imageUrls.length > 0 && (
                <div style={{ background: '#fff7e6', border: '1px solid #ffe0a3', borderRadius: 8, padding: 12, marginBottom: 16 }}>
                  <p style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 700 }}>
                    Imagens deste disparo — baixe ou copie para anexar no WhatsApp:
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {imageUrls.map((url, idx) => (
                      <div key={url} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <img src={url} alt={`Imagem ${idx + 1}`} style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 6, border: '1px solid #eee' }} />
                        <button type="button" onClick={() => baixarImagem(url, idx)} style={smallBtn}>⬇ Baixar</button>
                        <button type="button" onClick={() => copiarImagem(url)} style={smallBtnLight}>📋 Copiar</button>
                      </div>
                    ))}
                  </div>
                  <p style={{ margin: '10px 0 0', fontSize: 13, color: '#777' }}>
                    No celular: baixe a imagem (vai para a galeria) e anexe ao abrir cada conversa.<br />
                    No computador: copie e cole (Ctrl+V) no WhatsApp Web depois de abrir o chat.
                  </p>
                </div>
              )}

              <h3 style={{ fontSize: 15 }}>Links do WhatsApp — clique para abrir cada conversa</h3>
              <ul style={{ paddingLeft: 18 }}>
                {result.wa_links.map((w, i) => (
                  <li key={i} style={{ marginBottom: 6 }}>
                    <a href={w.link} target="_blank" rel="noopener noreferrer" style={{ color: '#0a7' }}>{w.to} — abrir WhatsApp</a>
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

const inputStyle: React.CSSProperties = { padding: '10px 12px', border: '1px solid #ccc', borderRadius: 8, fontSize: 15, fontFamily: 'inherit' };
const labelCol: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 6 };
const primaryBtn: React.CSSProperties = { background: '#1a1a1a', color: '#fff', border: 'none', borderRadius: 8, padding: '12px 20px', fontSize: 15, fontWeight: 700, cursor: 'pointer' };
const secondaryBtn: React.CSSProperties = { background: '#fff', color: '#333', border: '1px solid #ccc', borderRadius: 8, padding: '12px 20px', fontSize: 15, cursor: 'pointer' };
const smallBtn: React.CSSProperties = { background: '#1a1a1a', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 12px', fontSize: 13, fontWeight: 700, cursor: 'pointer' };
const smallBtnDanger: React.CSSProperties = { background: '#fff', color: '#a12', border: '1px solid #f0b0b0', borderRadius: 6, padding: '8px 12px', fontSize: 13, cursor: 'pointer' };
const smallBtnLight: React.CSSProperties = { background: '#fff', color: '#333', border: '1px solid #ccc', borderRadius: 6, padding: '8px 12px', fontSize: 13, cursor: 'pointer' };
const alertErr: React.CSSProperties = { background: '#fde8e8', border: '1px solid #f5b5b5', color: '#a12', padding: 12, borderRadius: 8, marginBottom: 16 };
const alertOk: React.CSSProperties = { background: '#eafbe8', border: '1px solid #b5e5b0', color: '#1a7a1a', padding: 12, borderRadius: 8, marginBottom: 16 };
