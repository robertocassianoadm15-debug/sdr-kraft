'use client';

import { useEffect, useState } from 'react';

interface ConvItem {
  id: string;
  lead_id: string;
  content: string;
  intent: string | null;
  confidence: number | null;
  suggested_reply: string | null;
  created_at: string;
  metadata: Record<string, string>;
  leads: { company_name: string | null; contact_name: string | null; email: string | null } | null;
}

const INTENT_STYLE: Record<string, string> = {
  pricing:       'bg-blue-100 text-blue-700',
  meeting:       'bg-green-100 text-green-700',
  objection:     'bg-yellow-100 text-yellow-700',
  info_request:  'bg-navy-100 text-navy-700',
  not_interested:'bg-red-100 text-red-700',
  unknown:       'bg-slate-100 text-slate-500',
};

const INTENT_LABEL: Record<string, string> = {
  pricing:       'Orçamento',
  meeting:       'Reunião',
  objection:     'Objeção',
  info_request:  'Info',
  not_interested:'Sem interesse',
  unknown:       'Indefinido',
};

export default function InboxPage() {
  const [items, setItems]     = useState<ConvItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [replies, setReplies] = useState<Record<string, string>>({});
  const [sending, setSending] = useState<Record<string, boolean>>({});
  const [done, setDone]       = useState<Record<string, boolean>>({});

  async function load() {
    setLoading(true);
    const r = await fetch('/api/inbox');
    const j = await r.json();
    const convs: ConvItem[] = j.items ?? [];
    setItems(convs);
    const init: Record<string, string> = {};
    for (const c of convs) init[c.id] = c.suggested_reply ?? '';
    setReplies(prev => ({ ...init, ...prev }));
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function sendReply(id: string) {
    if (!replies[id]?.trim()) return;
    setSending(s => ({ ...s, [id]: true }));
    try {
      await fetch('/api/inbox/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversation_id: id, reply_text: replies[id] })
      });
      setDone(d => ({ ...d, [id]: true }));
      setTimeout(() => load(), 800);
    } finally {
      setSending(s => ({ ...s, [id]: false }));
    }
  }

  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <div className="text-xs uppercase tracking-[0.3em] text-navy-400 mb-2">Inbox</div>
        <h1 className="text-4xl font-black text-navy-900">Respostas pendentes</h1>
      </div>

      {loading ? (
        <p className="text-sm text-navy-400">Carregando...</p>
      ) : items.length === 0 ? (
        <div className="card p-12 text-center text-navy-400 text-sm">
          Nenhuma resposta aguardando revisão.
        </div>
      ) : (
        <div className="space-y-6">
          {items.map(item => {
            const leadName = item.leads?.company_name ?? item.leads?.contact_name ?? 'Lead';
            const badge = INTENT_STYLE[item.intent ?? 'unknown'] ?? INTENT_STYLE.unknown;
            const label = INTENT_LABEL[item.intent ?? 'unknown'] ?? 'Indefinido';
            const isResolved = done[item.id];

            return (
              <div key={item.id} className={`card p-6 space-y-4 transition-opacity ${isResolved ? 'opacity-40' : ''}`}>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="font-bold text-navy-900">{leadName}</div>
                    <div className="text-xs text-navy-400 mt-0.5">
                      {item.metadata?.subject ?? 'sem assunto'} ·{' '}
                      {new Date(item.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`badge ${badge} text-xs px-2 py-0.5 rounded-full font-medium`}>{label}</span>
                    {item.confidence != null && (
                      <span className="text-xs text-navy-400">{item.confidence}%</span>
                    )}
                  </div>
                </div>

                <div className="bg-slate-50 rounded-lg p-3 text-sm text-navy-700 whitespace-pre-wrap border border-slate-200 max-h-40 overflow-y-auto">
                  {item.content.slice(0, 800)}{item.content.length > 800 ? '…' : ''}
                </div>

                <div>
                  <label className="stat-label block mb-1">Resposta sugerida pela IA (editável)</label>
                  <textarea
                    rows={5}
                    className="input text-sm resize-y"
                    value={replies[item.id] ?? ''}
                    onChange={e => setReplies(r => ({ ...r, [item.id]: e.target.value }))}
                    disabled={isResolved}
                  />
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={() => sendReply(item.id)}
                    disabled={sending[item.id] || isResolved || !replies[item.id]?.trim()}
                    className="btn-primary text-sm disabled:opacity-40"
                  >
                    {isResolved ? '✓ Enviado' : sending[item.id] ? 'Enviando...' : 'Enviar resposta'}
                  </button>
                  <span className="text-xs text-navy-400">
                    para <span className="font-mono">{item.leads?.email ?? '—'}</span>
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
