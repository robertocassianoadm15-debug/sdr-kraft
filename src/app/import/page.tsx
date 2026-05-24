'use client';

import { useEffect, useState } from 'react';

interface Campaign {
  id: string;
  name: string;
  description: string | null;
  source_file: string | null;
  format: string | null;
  total_leads: number;
  status: string;
  created_at: string;
}

export default function ImportPage() {
  const [campaigns, setCampaigns]       = useState<Campaign[]>([]);
  const [selectedCampaign, setSelected] = useState<Campaign | null>(null);
  const [newName, setNewName]           = useState('');
  const [newDesc, setNewDesc]           = useState('');
  const [creating, setCreating]         = useState(false);
  const [showForm, setShowForm]         = useState(false);

  const [editingId, setEditingId]     = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  const [result, setResult]   = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  async function loadCampaigns() {
    const r = await fetch('/api/campaigns');
    const j = await r.json();
    setCampaigns(j.campaigns ?? []);
  }

  useEffect(() => { loadCampaigns(); }, []);

  async function createCampaign() {
    if (!newName.trim()) return;
    setCreating(true);
    const r = await fetch('/api/campaigns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName.trim(), description: newDesc.trim() || undefined })
    });
    const j = await r.json();
    if (j.campaign) {
      await loadCampaigns();
      setSelected(j.campaign);
      setNewName(''); setNewDesc(''); setShowForm(false);
    }
    setCreating(false);
  }

  async function upload(file: File) {
    if (!selectedCampaign) { alert('Selecione ou crie uma campanha primeiro.'); return; }
    setLoading(true); setResult(null);
    const fd = new FormData();
    fd.append('file', file);
    fd.append('campaign_id', selectedCampaign.id);
    const r = await fetch('/api/leads/import', { method: 'POST', body: fd });
    setResult(await r.json());
    setLoading(false);
    loadCampaigns();
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault(); setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) upload(file);
  }

  async function deleteCampaign(c: Campaign) {
    if (!confirm(`Excluir campanha "${c.name}"? Os ${c.total_leads} leads serão desvinculados.`)) return;
    await fetch('/api/campaigns', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: c.id })
    });
    if (selectedCampaign?.id === c.id) setSelected(null);
    loadCampaigns();
  }

  async function toggleStatus(c: Campaign) {
    const next = c.status === 'active' ? 'paused' : 'active';
    await fetch('/api/campaigns', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: c.id, status: next })
    });
    loadCampaigns();
  }

  const statusColor: Record<string, string> = {
    active: 'bg-green-100 text-green-800',
    paused: 'bg-yellow-100 text-yellow-800',
    done:   'bg-gray-200 text-gray-600'
  };

  return (
    <div className="space-y-10">
      <div>
        <div className="text-xs uppercase tracking-[0.3em] text-kraft-600 mb-2">Painel 01</div>
        <h1 className="text-4xl font-black text-kraft-900">Importação de Leads</h1>
        <p className="mt-2 text-kraft-700">Organize cada importação em uma campanha nomeada. Depois prospete por campanha ou todas juntas.</p>
      </div>

      <div className="grid md:grid-cols-2 gap-8">

        {/* ── COLUNA ESQUERDA: Campanhas ── */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-xl font-bold">Campanhas</h2>
            <button onClick={() => setShowForm(!showForm)} className="btn-ghost text-xs">
              {showForm ? '✕ cancelar' : '+ Nova campanha'}
            </button>
          </div>

          {/* Form nova campanha */}
          {showForm && (
            <div className="card p-4 space-y-3 border-kraft-400">
              <input
                className="input"
                placeholder="Nome da campanha (ex: Hamburguerias ES)"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && createCampaign()}
                autoFocus
              />
              <input
                className="input"
                placeholder="Descrição (opcional)"
                value={newDesc}
                onChange={e => setNewDesc(e.target.value)}
              />
              <button onClick={createCampaign} disabled={creating || !newName.trim()} className="btn-primary w-full disabled:opacity-50">
                {creating ? 'Criando...' : 'Criar campanha'}
              </button>
            </div>
          )}

          {/* Lista de campanhas */}
          {campaigns.length === 0 ? (
            <div className="card p-6 text-center text-kraft-600 border-dashed">
              <p className="text-sm">Nenhuma campanha ainda.</p>
              <p className="text-xs mt-1">Crie uma para começar a importar.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {campaigns.map(c => (
                <div
                  key={c.id}
                  onClick={() => setSelected(c)}
                  className={
                    'card p-4 cursor-pointer transition-all ' +
                    (selectedCampaign?.id === c.id
                      ? 'border-kraft-600 border-2 bg-kraft-100'
                      : 'hover:border-kraft-400 hover:bg-kraft-50')
                  }
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        {selectedCampaign?.id === c.id && <span className="text-kraft-700">✓</span>}
                        {editingId === c.id ? (
                          <input
                            autoFocus
                            value={editingName}
                            onChange={e => setEditingName(e.target.value)}
                            onClick={e => e.stopPropagation()}
                            onBlur={async () => {
                              if (editingName.trim() && editingName.trim() !== c.name) {
                                await fetch(`/api/campaigns/${c.id}`, {
                                  method: 'PATCH',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ name: editingName.trim() })
                                });
                                setCampaigns(prev => prev.map(x => x.id === c.id ? { ...x, name: editingName.trim() } : x));
                              }
                              setEditingId(null);
                            }}
                            onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                            className="font-semibold text-gray-800 bg-transparent border-b border-blue-400 focus:outline-none w-full"
                          />
                        ) : (
                          <span
                            className="font-semibold text-kraft-900 cursor-pointer hover:text-blue-600 truncate"
                            title="Clique para editar"
                            onClick={e => { e.stopPropagation(); setEditingId(c.id); setEditingName(c.name); }}
                          >
                            {c.name} ✏️
                          </span>
                        )}
                      </div>
                      {c.description && <div className="text-xs text-kraft-600 mt-0.5 truncate">{c.description}</div>}
                      <div className="flex items-center gap-3 mt-1.5 text-xs text-kraft-600">
                        <span className="font-mono font-medium text-kraft-800">{c.total_leads} leads</span>
                        {c.source_file && <span className="truncate">· {c.source_file}</span>}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      <span className={'badge text-[10px] ' + (statusColor[c.status] ?? 'bg-gray-100 text-gray-600')}>
                        {c.status}
                      </span>
                      <button
                        onClick={e => { e.stopPropagation(); toggleStatus(c); }}
                        className="text-[10px] text-kraft-500 hover:text-kraft-800 underline"
                      >
                        {c.status === 'active' ? 'pausar' : 'ativar'}
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); deleteCampaign(c); }}
                        className="text-[10px] text-red-400 hover:text-red-700 underline"
                      >
                        excluir
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── COLUNA DIREITA: Upload ── */}
        <div className="space-y-4">
          <h2 className="font-display text-xl font-bold">
            Upload
            {selectedCampaign && (
              <span className="ml-2 text-sm font-normal text-kraft-600">
                → <strong>{selectedCampaign.name}</strong>
              </span>
            )}
          </h2>

          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => selectedCampaign && document.getElementById('file-input')?.click()}
            className={
              'border-2 border-dashed rounded-xl p-10 text-center transition-all ' +
              (!selectedCampaign
                ? 'opacity-40 cursor-not-allowed border-kraft-200'
                : dragOver
                  ? 'border-kraft-600 bg-kraft-100 scale-[1.01] cursor-pointer'
                  : 'border-kraft-300 hover:border-kraft-500 hover:bg-kraft-50 cursor-pointer')
            }
          >
            <input
              id="file-input"
              type="file"
              accept=".csv,.xlsx,.xls,.docx,.doc,.pdf,.txt,.md,.json"
              className="hidden"
              onChange={e => { if (e.target.files?.[0]) upload(e.target.files[0]); }}
            />
            <div className="text-5xl mb-3">{loading ? '⏳' : '📂'}</div>
            <div className="font-display text-lg font-bold text-kraft-900">
              {!selectedCampaign
                ? 'Selecione uma campanha'
                : loading
                  ? 'Processando...'
                  : 'Arraste o arquivo ou clique'}
            </div>
            <p className="mt-1 text-xs text-kraft-500">CSV · XLSX · XLS · PDF · DOCX · TXT · JSON</p>
          </div>

          {/* Resultado */}
          {result && !result.error && (
            <div className="card p-4 bg-green-50 border-green-300">
              <div className="font-display text-2xl font-bold text-green-800">✅ {result.inserted} leads importados</div>
              <div className="text-sm text-green-700 mt-1">
                {result.format?.toUpperCase()} · {result.method} · {result.extracted} extraídos
                {result.invalid_count > 0 && ` · ${result.invalid_count} ignorados`}
              </div>
              <a href="/prospect" className="btn-primary inline-flex mt-4 text-sm">
                Ir para Prospecção →
              </a>
            </div>
          )}

          {result?.error && (
            <div className="card p-3 bg-red-50 border-red-300 text-red-700 text-sm">❌ {result.error}</div>
          )}

          {/* Formatos */}
          <div className="card p-4 text-xs">
            <div className="stat-label mb-2">Formatos aceitos</div>
            <div className="grid grid-cols-2 gap-1 text-kraft-700">
              {[
                ['📊 CSV / TSV', 'parse direto'],
                ['📗 XLSX / XLS', 'parse direto'],
                ['📄 PDF', 'IA extrai'],
                ['📝 DOCX / DOC', 'IA extrai'],
                ['📃 TXT / MD', 'IA extrai'],
                ['🔧 JSON', 'IA extrai'],
              ].map(([fmt, method]) => (
                <div key={fmt} className="flex justify-between py-0.5 border-b border-kraft-100 last:border-0">
                  <span>{fmt}</span>
                  <span className={method === 'parse direto' ? 'text-kraft-600' : 'text-blue-600'}>{method}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
