'use client';

import { useEffect, useMemo, useState } from 'react';

interface Campaign { id: string; name: string; total_leads: number; status: string; }
interface Lead {
  id: string; company_name: string; contact_name: string | null;
  email: string | null; whatsapp: string | null; phone: string | null;
  segment: string | null; city: string | null; state: string | null;
  status: string; score: number; campaign_id: string | null;
  human_takeover?: boolean;
}
interface OutreachInfo {
  lead_id: string;
  email_sent_at?: string;
  email_touch?: number;
  whatsapp_sent_at?: string;
  whatsapp_touch?: number;
}

const statusLabels: Record<string, string> = {
  new: 'NOVO',
  contacted: 'CONTACTADO',
  replied: 'RESPONDEU',
  qualified: 'QUALIFICADO',
  disqualified: 'DESQUALIFICADO',
};

export default function ProspectPage() {
  const [campaigns, setCampaigns]       = useState<Campaign[]>([]);
  const [campaignFilter, setCampaignFilter] = useState<string>('all');
  const [leads, setLeads]               = useState<Lead[]>([]);
  const [statusFilter, setStatusFilter] = useState('new');
  const [loading, setLoading]           = useState(true);
  const [busyId, setBusyId]             = useState<string | null>(null);
  const [selected, setSelected]               = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading]         = useState(false);
  const [bulkResult, setBulkResult]           = useState<string | null>(null);
  const [cadenceLoading, setCadenceLoading]   = useState(false);
  const [cadenceResult, setCadenceResult]     = useState<string | null>(null);
  const [bdrLead, setBdrLead]           = useState<Lead | null>(null);
  const [bdrChannel, setBdrChannel]     = useState<'email' | 'whatsapp'>('email');
  const [bdrMsg, setBdrMsg]             = useState('');
  const [bdrResult, setBdrResult]       = useState<{ reply: string; next_status: string; intent_score: number } | null>(null);
  const [bdrLoading, setBdrLoading]     = useState(false);
  const [outreachMap, setOutreachMap]   = useState<Record<string, OutreachInfo>>({});
  const [takeovers, setTakeovers]       = useState<Record<string, boolean>>({});
  const [viewMsg, setViewMsg]           = useState<{ company: string; info: OutreachInfo } | null>(null);
  const [imgEmailModal, setImgEmailModal]     = useState<{id:string,email:string,company:string,contact:string}|null>(null);
  const [imgEmailSubject, setImgEmailSubject] = useState('');
  const [imgEmailBody, setImgEmailBody]       = useState('');
  const [imgEmailUrl, setImgEmailUrl]         = useState('');
  const [imgUploading, setImgUploading]       = useState(false);
  const [imgSending, setImgSending]           = useState(false);
  const [imgSent, setImgSent]                 = useState(false);

  const [search, setSearch]                   = useState('');
  const [filterSegment, setFilterSegment]     = useState('');
  const [filterCity, setFilterCity]           = useState('');
  const [selectCount, setSelectCount]         = useState('');

  useEffect(() => {
    fetch('/api/campaigns').then(r => r.json()).then(j => setCampaigns(j.campaigns ?? []));
  }, []);

  async function fetchLeads(status: string, campaign: string) {
    setLoading(true);
    const params = new URLSearchParams({ status, limit: '200' });
    if (campaign !== 'all') params.set('campaign_id', campaign);
    const r = await fetch(`/api/leads?${params}`);
    const json = await r.json();
    const fetchedLeads: Lead[] = json.leads ?? [];
    setLeads(fetchedLeads);
    const initial: Record<string, boolean> = {};
    fetchedLeads.forEach(l => { initial[l.id] = l.human_takeover || false; });
    setTakeovers(initial);
    setLoading(false);
  }

  useEffect(() => { fetchLeads(statusFilter, campaignFilter); setSelected(new Set()); }, [statusFilter, campaignFilter]);

  useEffect(() => {
    if (statusFilter === 'contacted' && leads.length > 0) {
      const ids = leads.map(l => l.id).join(',');
      fetch(`/api/leads/outreach?lead_ids=${ids}`)
        .then(r => r.json()).then(j => setOutreachMap(j));
    } else {
      setOutreachMap({});
    }
  }, [leads, statusFilter]);

  function toggleSelect(id: string) {
    setSelected(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  }
  function toggleAll() {
    const allFiltered = filteredLeads;
    if (allFiltered.length > 0 && allFiltered.every(l => selected.has(l.id))) {
      const toRemove = new Set(allFiltered.map(l => l.id));
      setSelected(new Set([...selected].filter(id => !toRemove.has(id))));
    } else {
      setSelected(new Set([...selected, ...allFiltered.map(l => l.id)]));
    }
  }

  async function sendSelected() {
    const toSend = leads.filter(l => selected.has(l.id) && l.email);
    if (!toSend.length) { setBulkResult('Nenhum selecionado com email.'); return; }
    setBulkLoading(true); setBulkResult(null);
    let ok = 0; let fail = 0;
    for (const lead of toSend) {
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
    setSelected(new Set());
    fetchLeads(statusFilter, campaignFilter);
  }

  const handleDeleteSelected = async () => {
    if (selected.size === 0) return;
    const confirmMsg = `Excluir ${selected.size} lead(s) selecionado(s)? Esta ação não pode ser desfeita.`;
    if (!window.confirm(confirmMsg)) return;
    try {
      const res = await fetch('/api/leads', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [...selected] })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao excluir');
      setSelected(new Set());
      await fetchLeads(statusFilter, campaignFilter);
      alert(`${data.deleted} lead(s) excluído(s) com sucesso.`);
    } catch (err: any) {
      alert('Erro: ' + err.message);
    }
  };

  async function openImageEmailModal(lead: Lead) {
    const contactName = lead.contact_name?.trim() || `equipe da ${lead.company_name}`
    try {
      const res = await fetch('/api/settings/d0-template')
      const { subject, body } = await res.json()
      setImgEmailSubject(
        subject.replace(/{{company_name}}/g, lead.company_name)
               .replace(/{{contact_name}}/g, contactName)
      )
      setImgEmailBody(
        body.replace(/{{company_name}}/g, lead.company_name)
            .replace(/{{contact_name}}/g, contactName)
      )
    } catch {
      // Fallback: abre modal vazio se template não carregar
      setImgEmailSubject(`Proposta personalizada — ${lead.company_name}`)
      setImgEmailBody('')
    }
    setImgEmailUrl('')
    setImgSent(false)
    setImgEmailModal({ id: lead.id, email: lead.email!, company: lead.company_name, contact: contactName })
  }

  async function sendOne(lead: Lead, channel: 'email') {
    setBusyId(lead.id + ':' + channel);
    try {
      await fetch('/api/outreach/send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead_id: lead.id, channel, dry_run: false })
      });
    } catch { /* ignore — botões liberam via finally */ } finally {
      setBusyId(null);
      fetchLeads(statusFilter, campaignFilter);
    }
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

  function fmtDate(d?: string) {
    if (!d) return '—';
    return new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  }

  const segments = useMemo(() =>
    [...new Set(leads.map(l => l.segment).filter(Boolean))].sort() as string[], [leads]);
  const cities = useMemo(() =>
    [...new Set(leads.map(l => l.city).filter(Boolean))].sort() as string[], [leads]);

  const filteredLeads = useMemo(() => {
    const q = search.toLowerCase().trim();
    return leads.filter(lead => {
      if (q) {
        const haystack = [lead.company_name, lead.segment, lead.city, lead.contact_name, lead.email, lead.phone]
          .join(' ').toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      if (filterSegment && lead.segment !== filterSegment) return false;
      if (filterCity && lead.city !== filterCity) return false;
      return true;
    });
  }, [leads, search, filterSegment, filterCity]);

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
          {selected.size > 0 && (
            <button onClick={sendSelected} disabled={bulkLoading} className="btn-primary disabled:opacity-50 bg-blue-700 hover:bg-blue-800">
              {bulkLoading ? 'Enviando...' : `☑ Enviar selecionados (${selected.size})`}
            </button>
          )}
          {selected.size > 0 && statusFilter === 'new' && (
            <button onClick={handleDeleteSelected} className="px-4 py-2 text-sm font-medium rounded-lg bg-red-600 hover:bg-red-700 text-white transition-colors">
              🗑 Excluir ({selected.size})
            </button>
          )}
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
          >{statusLabels[s] ?? s.toUpperCase()}</button>
        ))}
        <button onClick={() => fetchLeads(statusFilter, campaignFilter)}
          className="px-3 py-1.5 rounded-full text-xs bg-kraft-50 border border-kraft-300 text-kraft-700 hover:bg-kraft-100">
          ↻
        </button>
      </div>

      {/* Barra de busca e filtros */}
      <div className="flex flex-wrap gap-3 items-center">
        <input
          type="text"
          placeholder="🔍 Buscar em todas as colunas..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 min-w-[200px] border border-slate-200 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
        />
        <select
          value={filterSegment}
          onChange={e => setFilterSegment(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-600 focus:outline-none"
        >
          <option value="">Todos os segmentos</option>
          {segments.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select
          value={filterCity}
          onChange={e => setFilterCity(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-600 focus:outline-none"
        >
          <option value="">Todas as cidades</option>
          {cities.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min="1"
            max={filteredLeads.length}
            placeholder="Qtd"
            value={selectCount}
            onChange={e => setSelectCount(e.target.value)}
            className="w-20 border border-slate-200 rounded px-2 py-2 text-xs text-center focus:outline-none"
          />
          <button
            onClick={() => {
              const n = Math.min(parseInt(selectCount) || 0, filteredLeads.length);
              const toSelect = filteredLeads.slice(0, n).map(l => l.id);
              setSelected(new Set([...selected, ...toSelect]));
              setSelectCount('');
            }}
            className="text-xs bg-slate-100 hover:bg-slate-200 px-3 py-2 rounded text-slate-600"
          >
            Selecionar
          </button>
        </div>
        {(search || filterSegment || filterCity) && (
          <button
            onClick={() => { setSearch(''); setFilterSegment(''); setFilterCity(''); }}
            className="text-xs text-red-500 hover:text-red-700 underline"
          >
            Limpar filtros
          </button>
        )}
        <span className="text-xs text-slate-400 ml-auto">
          {filteredLeads.length} de {leads.length} leads
          {selected.size > 0 && ` · ${selected.size} selecionados`}
        </span>
      </div>

      {/* Tabela */}
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-kraft-100">
            <tr>
              <th className="px-4 py-3 w-8">
                <input type="checkbox" className="w-4 h-4 accent-kraft-800"
                  checked={filteredLeads.length > 0 && filteredLeads.every(l => selected.has(l.id))}
                  onChange={toggleAll} />
              </th>
              <th className="text-left px-4 py-3 stat-label">Empresa</th>
              <th className="text-left px-4 py-3 stat-label">Segmento</th>
              <th className="text-left px-4 py-3 stat-label">Cidade</th>
              <th className="text-left px-4 py-3 stat-label">Contato</th>
              <th className="text-left px-4 py-3 stat-label">Status</th>
              {statusFilter === 'contacted' && <th className="text-left px-4 py-3 stat-label">Último envio</th>}
              <th className="text-right px-4 py-3 stat-label">Ações</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={statusFilter === 'contacted' ? 8 : 7} className="text-center py-10 text-kraft-600">Carregando...</td></tr>
            ) : filteredLeads.length === 0 ? (
              <tr><td colSpan={statusFilter === 'contacted' ? 8 : 7} className="text-center py-10 text-kraft-600">
                {leads.length === 0
                  ? `Nenhum lead em "${statusFilter}"${campaignFilter !== 'all' ? ` nesta campanha` : ''}.`
                  : 'Nenhum lead corresponde aos filtros aplicados.'}
              </td></tr>
            ) : filteredLeads.map(lead => (
              <tr key={lead.id} className={'border-t border-kraft-200 hover:bg-kraft-50 ' + (selected.has(lead.id) ? 'bg-blue-50 ' : '') + (bdrLead?.id === lead.id ? 'bg-kraft-100' : '')}>
                <td className="px-4 py-3 w-8">
                  <input type="checkbox" className="w-4 h-4 accent-kraft-800"
                    checked={selected.has(lead.id)} onChange={() => toggleSelect(lead.id)} />
                </td>
                <td className="px-4 py-3">
                  <div className="font-medium text-kraft-900">
                    {lead.company_name}
                    {takeovers[lead.id] && <span className="text-xs text-orange-500 ml-1">● assumido</span>}
                  </div>
                  {lead.contact_name && <div className="text-xs text-kraft-500">{lead.contact_name}</div>}
                </td>
                <td className="px-4 py-3 text-kraft-700 text-xs">{lead.segment ?? '—'}</td>
                <td className="px-4 py-3 text-kraft-700 text-xs">{[lead.city,lead.state].filter(Boolean).join('/') || '—'}</td>
                <td className="px-4 py-3 text-xs text-kraft-600">
                  {lead.email && <div>✉ {lead.email}</div>}
                  {(lead.whatsapp||lead.phone) && <div>☎ {lead.whatsapp??lead.phone}</div>}
                </td>
                <td className="px-4 py-3">
                  <span className={'badge ' + (statusColors[lead.status] ?? 'bg-gray-100 text-gray-700')}>{statusLabels[lead.status] ?? lead.status}</span>
                  {lead.score > 0 && <span className="ml-1 font-mono text-xs text-kraft-600">·{lead.score}</span>}
                </td>
                {statusFilter === 'contacted' && (
                  <td className="px-4 py-3 text-xs text-kraft-600 space-y-0.5">
                    {outreachMap[lead.id] ? (
                      <>
                        {outreachMap[lead.id].email_sent_at && (
                          <div>✉ {fmtDate(outreachMap[lead.id].email_sent_at)} · toque {outreachMap[lead.id].email_touch}</div>
                        )}
                        {outreachMap[lead.id].whatsapp_sent_at && (
                          <div>📱 {fmtDate(outreachMap[lead.id].whatsapp_sent_at)} · toque {outreachMap[lead.id].whatsapp_touch}</div>
                        )}
                        {!outreachMap[lead.id].email_sent_at && !outreachMap[lead.id].whatsapp_sent_at && '—'}
                      </>
                    ) : '—'}
                  </td>
                )}
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-1 flex-wrap">
                    {lead.status === 'new' && (<>
                      {lead.email && (
                        <button onClick={() => openImageEmailModal(lead)} disabled={busyId !== null} className="btn-primary text-xs py-1 px-2 disabled:opacity-40">
                          ✉
                        </button>
                      )}
                      {(lead.whatsapp || lead.phone) ? (
                        <button onClick={() => sendWhatsAppManual(lead)} disabled={busyId !== null}
                          className="btn-primary text-xs py-1 px-2 bg-green-700 hover:bg-green-600 disabled:opacity-40">
                          {busyId === lead.id+':whatsapp' ? '...' : 'WA'}
                        </button>
                      ) : (
                        <span className="text-xs text-gray-400 py-1 px-2 border border-gray-200 rounded">Sem nº</span>
                      )}
                    </>)}
                    {lead.status === 'contacted' && (<>
                      <button onClick={() => sendOne(lead,'email')} disabled={!lead.email || busyId !== null} className="btn-primary text-xs py-1 px-2 disabled:opacity-40">
                        {busyId === lead.id+':email' ? '...' : 'Reenviar Email'}
                      </button>
                      {(lead.whatsapp || lead.phone) ? (
                        <button onClick={() => sendWhatsAppManual(lead)} disabled={busyId !== null}
                          className="btn-primary text-xs py-1 px-2 bg-green-700 hover:bg-green-600 disabled:opacity-40">
                          {busyId === lead.id+':whatsapp' ? '...' : 'Reenviar WA'}
                        </button>
                      ) : (
                        <span className="text-xs text-gray-400 py-1 px-2 border border-gray-200 rounded">Sem nº</span>
                      )}
                      {outreachMap[lead.id] && (
                        <button onClick={() => setViewMsg({ company: lead.company_name, info: outreachMap[lead.id] })}
                          className="btn-ghost text-xs py-1 px-2">
                          Ver msg
                        </button>
                      )}
                      <button
                        onClick={async () => {
                          const novo = !takeovers[lead.id];
                          await fetch('/api/leads/takeover', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ lead_id: lead.id, takeover: novo })
                          });
                          setTakeovers(prev => ({ ...prev, [lead.id]: novo }));
                        }}
                        className={`text-xs px-2 py-1 rounded-full font-medium transition-colors ${
                          takeovers[lead.id]
                            ? 'bg-orange-100 text-orange-700 hover:bg-orange-200'
                            : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                        }`}
                        title={takeovers[lead.id] ? 'Polyana assumiu — clique para voltar ao automático' : 'Assumir este lead'}
                      >
                        {takeovers[lead.id] ? '👤 Assumido' : '🤖 Auto'}
                      </button>
                    </>)}
                    {lead.status === 'replied' && (<>
                      {lead.email && (
                        <button onClick={() => openImageEmailModal(lead)} disabled={busyId !== null} className="btn-primary text-xs py-1 px-2 disabled:opacity-40">
                          ✉
                        </button>
                      )}
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
          {filteredLeads.length}{filteredLeads.length !== leads.length ? ` de ${leads.length}` : ''} leads exibidos
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

      {/* Modal ver mensagem enviada */}
      {viewMsg && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setViewMsg(null)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full p-6" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-slate-900">Último envio — {viewMsg.company}</h3>
              <button onClick={() => setViewMsg(null)} className="text-slate-400 hover:text-slate-900 text-xl leading-none">✕</button>
            </div>
            <div className="space-y-2 text-sm text-slate-700">
              {viewMsg.info.email_sent_at && (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                  <div className="text-xs text-slate-500 mb-1">✉ Email · toque {viewMsg.info.email_touch} · {fmtDate(viewMsg.info.email_sent_at)}</div>
                </div>
              )}
              {viewMsg.info.whatsapp_sent_at && (
                <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                  <div className="text-xs text-slate-500">📱 WhatsApp · toque {viewMsg.info.whatsapp_touch} · {fmtDate(viewMsg.info.whatsapp_sent_at)}</div>
                </div>
              )}
            </div>
            <button onClick={() => setViewMsg(null)} className="btn-ghost w-full mt-4">Fechar</button>
          </div>
        </div>
      )}

      {/* Modal email com imagem */}
      {imgEmailModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-semibold text-gray-800">✉ Editar e Enviar — {imgEmailModal.company}</h3>
                <p className="text-xs text-gray-400">{imgEmailModal.email}</p>
              </div>
              <button onClick={() => setImgEmailModal(null)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>
            <input
              type="text"
              value={imgEmailSubject}
              onChange={e => setImgEmailSubject(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-purple-200"
            />
            <textarea
              value={imgEmailBody}
              onChange={e => setImgEmailBody(e.target.value)}
              rows={6}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-purple-200"
            />
            {/* Upload */}
            <div className="mt-3 border border-dashed border-gray-200 rounded-lg p-3">
              <p className="text-xs text-gray-400 mb-2">📎 Imagem (JPG, PNG, GIF, WEBP — máx 5MB)</p>
              {!imgEmailUrl ? (
                <label className="cursor-pointer text-sm text-purple-600 hover:text-purple-800">
                  <input
                    type="file"
                    accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0]
                      if (!file) return
                      setImgUploading(true)
                      const form = new FormData()
                      form.append('file', file)
                      const res = await fetch('/api/upload/image', { method: 'POST', body: form })
                      const data = await res.json()
                      if (data.url) setImgEmailUrl(data.url)
                      setImgUploading(false)
                    }}
                  />
                  {imgUploading ? 'Enviando...' : '+ Selecionar imagem'}
                </label>
              ) : (
                <div className="relative inline-block">
                  <img src={imgEmailUrl} alt="Preview" className="max-h-28 rounded object-contain" />
                  <button onClick={() => setImgEmailUrl('')}
                    className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-5 h-5 text-xs flex items-center justify-center">×</button>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-3 mt-4">
              <button onClick={() => setImgEmailModal(null)} className="text-sm text-gray-500 px-4 py-2">Cancelar</button>
              <button
                disabled={imgSending || !imgEmailBody.trim() || !imgEmailSubject.trim()}
                onClick={async () => {
                  setImgSending(true)
                  await fetch('/api/outreach/send', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      lead_id: imgEmailModal.id,
                      channel: 'email',
                      dry_run: false,
                      prewritten_subject: imgEmailSubject.trim(),
                      prewritten_body: imgEmailBody.trim(),
                      image_url: imgEmailUrl || undefined
                    })
                  })
                  setImgSent(true)
                  setImgSending(false)
                  setTimeout(() => {
                    setImgEmailModal(null)
                    fetchLeads(statusFilter, campaignFilter)
                  }, 1500)
                }}
                className={`text-sm px-5 py-2 rounded-lg font-medium ${
                  imgSent ? 'bg-green-500 text-white' : 'bg-purple-700 text-white hover:bg-purple-800 disabled:opacity-50'
                }`}
              >
                {imgSending ? 'Enviando...' : imgSent ? '✅ Enviado!' : 'Enviar email'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
