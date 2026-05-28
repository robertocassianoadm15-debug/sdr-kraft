'use client';

import { useEffect, useState } from 'react';

export default function DashboardPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const r = await fetch('/api/dashboard/metrics', { cache: 'no-store' });
    setData(await r.json());
    setLoading(false);
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, []);

  if (loading && !data) return <p className="text-kraft-600">Carregando...</p>;
  if (data?.error) return <p className="text-red-700">Erro: {data.error}</p>;

  const m = data?.metrics ?? {};

  return (
    <div className="space-y-10">
      <div className="flex items-end justify-between">
        <div>
          <div className="text-xs uppercase tracking-[0.3em] text-kraft-600 mb-2">Painel 03</div>
          <h1 className="text-4xl font-black text-kraft-900">Dashboard</h1>
        </div>
        <button onClick={load} className="btn-ghost text-xs">↻ atualizar</button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat label="Leads total"     value={m.total_leads ?? 0} />
        <Stat label="Novos"           value={m.leads_new ?? 0} />
        <Stat label="Contatados"      value={m.leads_contacted ?? 0} />
        <Stat label="Responderam"     value={m.leads_replied ?? 0} />
        <Stat label="Qualificados"    value={m.leads_qualified ?? 0} accent />
        <Stat label="Desqualificados" value={m.leads_disqualified ?? 0} />
        <Stat label="Msgs enviadas"   value={m.msgs_sent ?? 0} />
        <Stat label="Reply rate"      value={`${m.reply_rate_pct ?? 0}%`} accent />
        <Stat label="Enviados hoje" value={data?.sent_today ?? 0} accent />
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="card p-6">
          <h2 className="font-display text-xl font-bold mb-4">Leads quentes</h2>
          {data?.hot_leads?.length ? (
            <ul className="space-y-2">
              {data.hot_leads.map((l: any) => (
                <li key={l.id} className="flex items-center justify-between py-2 border-b border-kraft-200 last:border-0">
                  <div>
                    <div className="font-medium text-kraft-900">{l.company_name}</div>
                    <div className="text-xs text-kraft-600">
                      {l.segment ?? '—'} · {l.city ?? '?'} · <span className="font-mono">{l.status}</span>
                    </div>
                  </div>
                  <div className="font-mono text-2xl font-bold text-kraft-800">{l.score}</div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-kraft-600 text-sm">Nenhum lead ainda.</p>
          )}
        </div>

        <div className="card p-6">
          <h2 className="font-display text-xl font-bold mb-4">Timeline de eventos</h2>
          {data?.recent_events?.length ? (
            <ul className="space-y-3 max-h-[480px] overflow-y-auto">
              {data.recent_events.map((e: any) => (
                <li key={e.id} className="text-xs border-l-2 border-kraft-400 pl-3">
                  <div className="font-mono text-kraft-600">
                    {new Date(e.created_at).toLocaleString('pt-BR')}
                  </div>
                  <div className="text-kraft-900">
                    <span className="font-semibold">{e.entity_type}</span> · {e.action}
                    {e.actor && e.actor !== 'system' && <span className="text-kraft-600"> · {e.actor}</span>}
                  </div>
                  {e.metadata && Object.keys(e.metadata).length > 0 && (
                    <div className="font-mono text-[10px] text-kraft-700 mt-0.5 truncate">
                      {JSON.stringify(e.metadata)}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-kraft-600 text-sm">Nenhum evento ainda.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: any; accent?: boolean }) {
  return (
    <div className={'card p-5 ' + (accent ? 'bg-kraft-200/60' : '')}>
      <div className="stat-label">{label}</div>
      <div className="stat-num mt-2">{value}</div>
    </div>
  );
}
