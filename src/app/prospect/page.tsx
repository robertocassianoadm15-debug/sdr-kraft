'use client';

import { useEffect, useState } from 'react';

interface Campaign { id: string; name: string; total_leads: number; status: string; }
interface Lead {
  id: string; company_name: string; contact_name: string | null;
  email: string | null; whatsapp: string | null; phone: string | null;
  segment: string | null; city: string | null; state: string | null;
  status: string; score: number; campaign_id: string | null;
}
interface Preview { subject?: string; body: string; }

export default function ProspectPage() {
  const [campaigns, setCampaigns]       = useState<Campaign[]>([]);
  const [campaignFilter, setCampaignFilter] = useState<string>('all');
  const [leads, setLeads]               = useState<Lead[]>([]);
  const [statusFilter, setStatusFilter] = useState('new');
  const [loading, setLoading]           = useState(true);
  const [busyId, setBusyId]             = useState<string | null>(null);
  const [bulkLoading, setBulkLoading]         = useState(false);
  const [bulkResult, setBulkResult]           = useState<string | null>(null);
  const [cadenceLoading, setCadenceLoading]   = useState(false);
  const [cadenceResult, setCadenceResult]     = useState<string | null>(null);
  const [preview, setPreview]           = useState<{ lead: Lead; data: Preview } | null>(null);
  const [bdrLead, setBdrLead]           = useState<Lead | null>(null);
  const [bdrChannel, setBdrChannel]     = useState<'email' | 'whatsapp'>('email');
  const [bdrMsg, setBdrMsg]             = useState('');
  const [bdrResult, setBdrResult]       = useState<{ reply: string; next_status: string; intent_score: number } | null>(null);
  const [bdrLoading, setBdrLoading]     = useState(false);

  useEffect(() => {
    fetch('/api/campaigns').then(r => r.json()).then(j => setCampaigns(j.campaigns ?? []));
  }, []);

  async function fetchLeads(status: string, campaign: string) {
    setLoading(true);
    const params = new URLSearchParams({ status, limit: '200' });
    if (campaign !== 'all') params.set('campaign_id', campaign);
    const r = await fetch(`/api/leads?${params}`);
    const json = await r.json();
    setLeads(json.leads ?? []);
    setLoading(false);
  }

  useEffect(() => { fetchLeads(statusFilter, campaignFilter); }, [statusFilter, campaignFilter]);

  async function previewEmail(lead: Lead) {
    setBusyId(lead.id + ':preview');
    const r = await fetch('/api/outreach/send', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lead_id: lead.id, channel: 'email', dry_run: true })
    });
    const json = await r.json();
    if (json.preview) setPreview({ lead, data: json.preview });
    setBusyId(null);
  }

  async function sendOne(lead: Lead, channel: 'email') {
    setBusyId(lead.id + ':' + channel);
    await fetch('/api/outreach/send', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lead_id: lead.id, channel, dry_run: false })
    });
    setBusyId(null);
    fetchLeads(statusFilter, campaignFilter);
  }

  async function sendWhatsAppManual(lead: Lead) {
    setBusyId(lead.id + ':whatsapp');
    try {
      const r = await fetch('/api/outreach/send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead_id: lead.id, channel: 'whatsapp', skip_send: true })
      });
      const j = await r.json();
      const mensagem = j.preview?.body;
      if (mensagem) {
        const phone = lead.whatsapp ?? lead.phone ?? '';
        const numero = phone.replace(/\D/g, '');
        window.open(`https://wa.me/${numero}?text=${encodeURIComponent(mensagem)}`, '_blank');
      }
    } catch {}
    setBusyId(null);
    fetchLeads(statusFilter, campaignFilter);
  }

  async function runCadence() {
    setCadenceLoading(true); setCadenceResult(null);
    const r = await fetch('/api/cron/process-cadence');
    const j = await r.json();
    if (j.error) {
      setCadenceResult(`❌ ${j.error}`);
    } else {
      setCadenceResult(`▶ ${j.processed} na fila · ✅ ${j.sent} enviados · ⏭ ${j.cancelled} cancelados · ❌ ${j.failed} falhas`);
    }
    setCadenceLoading(false);
    fetchLeads(statusFilter, campaignFilter);
  }

  async function sendBulk() {
    const novos = leads.filter(l => l.status === 'new' && l.email);
    if (!novos.length) { setBulkResult('Nenhum lead novo com email.'); return; }
    setBulkLoading(true); setBulkResult(null);
    let ok = 0; let fail = 0;
    for (const lead of novos) {
      try {
        const r = await fetch('/api/outreach/send', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lead_id: lead.id, channel: 'email', dry_run: false })
        });
        const j = await r.json(); j.ok ? ok++ : fail++;
      } catch { fail++; }
    }
    setBulkResult(`✅ ${ok} enviados · ❌ ${fail} falhas`);
    setBulkLoading(false);
    fetchLeads(statusFilter, campaignFilter);
  }

  async function runBdr() {
    if (!bdrLead || !bdrMsg.trim()) return;
    setBdrLoading(true); setBdrResult(null);
    const r = await fetch('/api/conversations/webhook', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lead_id: bdrLead.id, channel: bdrChannel, inbound_message: bdrMsg })
    });
    const json = await r.json();
    if (json.bdr) setBdrResult({ reply: json.bdr.reply, next_status: json.bdr.next_status, intent_score: json.bdr.qualification_update?.intent_score ?? 0 });
    setBdrLoading(false);
    fetchLeads(statusFilter, campaignFilter);
  }

  const statusColors: Record<string, string> = {
    new: 'bg-blue-100 text-blue-800', queued: 'bg-yellow-100 text-yellow-800',
    contacted: 'bg-orange-100 text-orange-800', replied: 'bg-green-100 text-green-800',
    qualified: 'bg-kraft-800 text-kraft-50', disqualified: 'bg-gray-200 text-gray-600', lost: 'bg-red-100 text-red-800'
  };

  const activeCampaign = campaigns.find(c => c.id === campaignFilter);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.3em] text-kraft-600 mb-2">Painel 02</div>
          <h1 className="text-4xl font-black text-kraft-900">Prospecção</h1>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {cadenceResult && <span className="text-sm text-slate-600">{cadenceResult}</span>}
          {bulkResult    && <span className="text-sm text-slate-600">{bulkResult}</span>}
          <button onClick={runCadence} disabled={cadenceLoading} className="btn-primary disabled:opacity-50 bg-navy-800 hover:bg-navy-900">
            {cadenceLoading ? 'Processando...' : '▶ Processar cadência'}
          </button>
          <button onClick={sendBulk} disabled={bulkLoading || statusFilter !== 'new'} className="btn-primary disabled:opacity-50">
            {bulkLoading ? 'Enviando...' : '⚡ Enviar todos novos'}
          </button>
        </div>
      </div>

      {/* ── FILTRO DE CAMPANHA ── */}
      <div className="card p-4">
        <div className="stat-label mb-3">Campanha</div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setCampaignFilter('all')}
            className={
              'px-4 py-2 rounded-lg text-sm font-medium border transition-colors ' +
              (campaignFilter === 'all'
                ? 'bg-kraft-800 text-kraft-50 border-kraft-800'
                : 'bg-kraft-50 text-kraft-700 border-kraft-300 hover:bg-kraft-100')
            }
          >
            Todas as campanhas
            <span className="ml-2 font-mono opacity-70 text-xs">
              {campaigns.reduce((s, c) => s + c.total_leads, 0)}
            </span>
          </button>

          {campaigns.map(c => (
            <button
              key={c.id}
              onClick={() => setCampaignFilter(c.id)}
              className={
                'px-4 py-2 rounded-lg text-sm font-medium border transition-colors ' +
                (campaignFilter === c.id
                  ? 'bg-kraft-800 text-kraft-50 border-kraft-800'
                  : c.status === 'paused'
                    ? 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'
                    : 'bg-kraft-50 text-kraft-700 border-kraft-300 hover:bg-kraft-100')
              }
            >
              {c.name}
              <span className="ml-2 font-mono opacity-70 text-xs">{c.total_leads}</span>
              {c.status === 'paused' && <span className="ml-1 text-[10px] opacity-60">(pausada)</span>}
            </button>
          ))}

          <a href="/import" className="px-4 py-2 rounded-lg text-sm border border-dashed border-kraft-300 text-kraft-600 hover:bg-kraft-50 flex items-center gap-1">
            + nova campanha
          </a>
        </div>

        {activeCampaign && (
          <div className="mt-2 text-xs text-kraft-600">
            Exibindo: <strong>{activeCampaign.name}</strong> · {activeCampaign.total_leads} leads totais
          </div>
        )}
      </div>

      {/* Filtros de status */}
      <div className="flex gap-2 flex-wrap">
        {['new','contacted','replied','qualified','disqualified'].map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={'px-3 py-1.5 rounded-full text-xs font-medium uppercase tracking-wider transition-colors ' +
              (statusFilter === s ? 'bg-kraft-800 text-kraft-50' : 'bg-kraft-100 text-kraft-700 hover:bg-kraft-200')}
          >{s}</button>
        ))}
        <button onClick={() => fetchLeads(statusFilter, campaignFilter)}
          className="px-3 py-1.5 rounded-full text-xs bg-kraft-50 border border-kraft-300 text-kraft-700 hover:bg-kraft-100">
          ↻
        </button>
      </div>

      {/* Tabela */}
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-kraft-100">
            <tr>
              <th className="text-left px-4 py-3 stat-label">Empresa</th>
              <th className="text-left px-4 py-3 stat-label">Segmento</th>
              <th className="text-left px-4 py-3 stat-label">Cidade</th>
              <th className="text-left px-4 py-3 stat-label">Contato</th>
              <th className="text-left px-4 py-3 stat-label">Status</th>
              <th className="text-right px-4 py-3 stat-label">Ações</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="text-center py-10 text-kraft-600">Carregando...</td></tr>
            ) : leads.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-10 text-kraft-600">
                Nenhum lead em "{statusFilter}"{campaignFilter !== 'all' ? ` nesta campanha` : ''}.
              </td></tr>
            ) : leads.map(lead => (
              <tr key={lead.id} className={'border-t border-kraft-200 hover:bg-kraft-50 ' + (bdrLead?.id === lead.id ? 'bg-kraft-100' : '')}>
                <td className="px-4 py-3">
                  <div className="font-medium text-kraft-900">{lead.company_name}</div>
                  {lead.contact_name && <div className="text-xs text-kraft-500">{lead.contact_name}</div>}
                </td>
                <td className="px-4 py-3 text-kraft-700 text-xs">{lead.segment ?? '—'}</td>
                <td className="px-4 py-3 text-kraft-700 text-xs">{[lead.city,lead.state].filter(Boolean).join('/') || '—'}</td>
                <td className="px-4 py-3 text-xs text-kraft-600">
                  {lead.email && <div>✉ {lead.email}</div>}
                  {(lead.whatsapp||lead.phone) && <div>☎ {lead.whatsapp??lead.phone}</div>}
                </td>
                <td className="px-4 py-3">
                  <span className={'badge ' + (statusColors[lead.status] ?? 'bg-gray-100 text-gray-700')}>{lead.status}</span>
                  {lead.score > 0 && <span className="ml-1 font-mono text-xs text-kraft-600">·{lead.score}</span>}
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-1 flex-wrap">
                    {lead.status === 'new' && (<>
                      <button onClick={() => previewEmail(lead)} disabled={!lead.email || busyId !== null} className="btn-ghost text-xs py-1 px-2 disabled:opacity-40">
                        {busyId === lead.id+':preview' ? '...' : 'Preview'}
                      </button>
                      <button onClick={() => sendOne(lead,'email')} disabled={!lead.email || busyId !== null} className="btn-primary text-xs py-1 px-2 disabled:opacity-40">
                        {busyId === lead.id+':email' ? '...' : '✉'}
                      </button>
                      <button
                        onClick={() => sendWhatsAppManual(lead)}
                        disabled={busyId !== null || (!lead.whatsapp && !lead.phone)}
                        title={(!lead.whatsapp && !lead.phone) ? 'sem telefone' : undefined}
                        className="btn-primary text-xs py-1 px-2 bg-green-700 hover:bg-green-600 disabled:opacity-40"
                      >
                        {busyId === lead.id+':whatsapp' ? '...' : '📱'}
                      </button>
                    </>)}
                    {(lead.status==='replied'||lead.status==='contacted') && (
                      <button onClick={() => { setBdrLead(lead); setBdrMsg(''); setBdrResult(null); setBdrChannel(lead.email?'email':'whatsapp'); setTimeout(()=>document.getElementById('bdr-box')?.scrollIntoView({behavior:'smooth'}),100); }} className="btn-primary text-xs py-1 px-3 bg-kraft-600">
                        🤖 BDR →
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="px-4 py-2 border-t border-kraft-200 text-xs text-kraft-500 text-right">
          {leads.length} leads exibidos
        </div>
      </div>

      {/* BDR Box */}
      <div id="bdr-box" className={'card p-6 transition-all ' + (bdrLead ? 'border-kraft-500 border-2' : 'opacity-60')}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="badge bg-kraft-800 text-kraft-50">BDR Autônomo</span>
            <h2 className="font-display text-xl font-bold">
              {bdrLead ? `Respondendo: ${bdrLead.company_name}` : 'Selecione um lead para responder'}
            </h2>
          </div>
          {bdrLead && <button onClick={() => { setBdrLead(null); setBdrResult(null); }} className="text-kraft-500 text-xs hover:text-kraft-800">✕</button>}
        </div>
        {bdrLead ? (
          <div className="space-y-4">
            <div className="flex gap-3">
              <select className="input max-w-[150px]" value={bdrChannel} onChange={e => setBdrChannel(e.target.value as any)}>
                <option value="email">Email</option>
                <option value="whatsapp">WhatsApp</option>
              </select>
              <div className="text-xs text-kraft-600 self-center">{bdrChannel==='email' ? bdrLead.email : (bdrLead.whatsapp??bdrLead.phone??'—')}</div>
            </div>
            <div>
              <label className="stat-label mb-1 block">O que o lead respondeu:</label>
              <textarea className="input min-h-[90px]" placeholder="Cole aqui a resposta do lead..." value={bdrMsg} onChange={e => setBdrMsg(e.target.value)} />
            </div>
            <button onClick={runBdr} disabled={bdrLoading || !bdrMsg.trim()} className="btn-primary disabled:opacity-50">
              {bdrLoading ? 'IA processando...' : '🤖 Processar e responder'}
            </button>
            {bdrResult && (
              <div className="space-y-3 mt-2">
                <div className="p-4 bg-kraft-100 rounded-lg border border-kraft-300">
                  <div className="stat-label mb-1">Resposta gerada pela IA:</div>
                  <p className="text-kraft-900 leading-relaxed">{bdrResult.reply}</p>
                </div>
                <div className="flex gap-4 text-xs text-kraft-700">
                  <span>Status → <strong>{bdrResult.next_status}</strong></span>
                  <span>Intent → <strong className="font-mono">{bdrResult.intent_score}/100</strong></span>
                </div>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-kraft-600">Clique em <strong>🤖 BDR →</strong> em qualquer lead com status <em>replied</em> ou <em>contacted</em>.</p>
        )}
      </div>

      {/* Modal preview */}
      {preview && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setPreview(null)}>
          <div className="bg-kraft-50 rounded-xl shadow-2xl max-w-lg w-full p-6" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-display text-xl font-bold">Preview — {preview.lead.company_name}</h3>
              <button onClick={() => setPreview(null)} className="text-kraft-500 hover:text-kraft-900">✕</button>
            </div>
            {preview.data.subject && <div className="mb-3"><div className="stat-label mb-1">Assunto</div><div className="font-medium text-kraft-900">{preview.data.subject}</div></div>}
            <div><div className="stat-label mb-1">Mensagem</div><div className="text-kraft-800 leading-relaxed whitespace-pre-wrap">{preview.data.body}</div></div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => { sendOne(preview.lead,'email'); setPreview(null); }} className="btn-primary flex-1">✉ Enviar agora</button>
              <button onClick={() => setPreview(null)} className="btn-ghost flex-1">Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
