'use client';
// ============================================================
// src/app/config-cadencia/page.tsx
// Configuração da cadência automática.
// ============================================================
import { useEffect, useState, useCallback } from 'react';

interface Step {
  id: string;
  step_number: number;
  dias_apos: number;
  modo_texto: 'ia' | 'template';
  subject: string | null;
  body: string | null;
  ativo: boolean;
}
interface Config { ativo: boolean; limite_por_execucao: number; }

export default function ConfigCadenciaPage() {
  const [config, setConfig] = useState<Config | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<string>('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [c, s] = await Promise.all([
        fetch('/api/cadence/config').then(r => r.json()),
        fetch('/api/cadence/steps').then(r => r.json())
      ]);
      setConfig(c.config ?? null);
      setSteps(s.steps ?? []);
    } catch { setError('Erro ao carregar configuração'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  function flash(msg: string) { setInfo(msg); setError(''); setTimeout(() => setInfo(''), 3000); }

  async function salvarConfig(patch: Partial<Config>) {
    setError('');
    try {
      const res = await fetch('/api/cadence/config', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch)
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Erro ao salvar'); return; }
      setConfig(data.config);
      flash('Configuração salva.');
    } catch { setError('Erro de rede'); }
  }

  async function addToque() {
    setError('');
    try {
      const res = await fetch('/api/cadence/steps', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modo_texto: 'ia', dias_apos: 10, ativo: true })
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Erro ao adicionar toque'); return; }
      await load();
      flash('Toque adicionado.');
    } catch { setError('Erro de rede'); }
  }

  async function salvarToque(step: Step) {
    setSavingId(step.id); setError('');
    try {
      const res = await fetch('/api/cadence/steps', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: step.id, dias_apos: step.dias_apos, modo_texto: step.modo_texto,
          subject: step.subject, body: step.body, ativo: step.ativo
        })
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Erro ao salvar toque'); return; }
      flash(`Toque ${step.step_number} salvo.`);
    } catch { setError('Erro de rede'); }
    finally { setSavingId(''); }
  }

  async function removerToque(step: Step) {
    if (!window.confirm(`Remover o toque ${step.step_number}? Os seguintes serão renumerados.`)) return;
    setError('');
    try {
      const res = await fetch('/api/cadence/steps', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: step.id })
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Erro ao remover'); return; }
      await load();
      flash('Toque removido.');
    } catch { setError('Erro de rede'); }
  }

  function patchStep(id: string, patch: Partial<Step>) {
    setSteps(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s));
  }

  if (loading && !config) {
    return <main className="max-w-3xl mx-auto px-4 py-10"><p className="text-slate-500">Carregando…</p></main>;
  }

  return (
    <main className="max-w-3xl mx-auto px-4 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-extrabold text-slate-900">Configuração da Cadência</h1>
        <p className="text-slate-500 mt-1">Defina os toques automáticos: quantos, com qual intervalo, e se o texto é gerado por IA ou fixo.</p>
      </header>

      {error && <div role="alert" className="mb-4 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-red-700">{error}</div>}
      {info &&  <div role="status" className="mb-4 rounded-lg border border-green-300 bg-green-50 px-4 py-3 text-green-700">{info}</div>}

      {config && (
        <section className="mb-8 rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-lg font-bold text-slate-900 mb-4">Geral</h2>

          <label className="flex items-center gap-3 mb-4 cursor-pointer">
            <input type="checkbox" checked={config.ativo}
              onChange={e => salvarConfig({ ativo: e.target.checked })}
              className="h-5 w-5 rounded border-slate-300" />
            <span className="font-medium text-slate-800">
              Cadência ativa {config.ativo ? '— enviando automaticamente' : '— pausada'}
            </span>
          </label>

          <label className="flex flex-col gap-1 max-w-xs">
            <span className="font-medium text-slate-800">Limite por execução (por dia)</span>
            <input type="number" min={1} max={500} value={config.limite_por_execucao}
              onChange={e => setConfig({ ...config, limite_por_execucao: Number(e.target.value) })}
              onBlur={e => salvarConfig({ limite_por_execucao: Number(e.target.value) })}
              className="rounded-lg border border-slate-300 px-3 py-2 w-32" />
            <span className="text-sm text-slate-500">Protege contra rate-limit da IA. O cron processa no máximo este número por vez.</span>
          </label>
        </section>
      )}

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-slate-900">Toques ({steps.length})</h2>
          <button onClick={addToque}
            className="rounded-lg bg-slate-900 text-white text-sm font-bold px-4 py-2 hover:bg-slate-700">
            + Adicionar toque
          </button>
        </div>

        <div className="flex flex-col gap-4">
          {steps.map(step => (
            <article key={step.id}
              className={`rounded-lg border p-4 ${step.ativo ? 'border-slate-200' : 'border-slate-200 bg-slate-50 opacity-75'}`}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-slate-900">
                  Toque {step.step_number}
                  {step.step_number === 1 && <span className="ml-2 text-xs font-normal text-slate-500">(inicial)</span>}
                </h3>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={step.ativo}
                    onChange={e => patchStep(step.id, { ativo: e.target.checked })}
                    className="h-4 w-4 rounded border-slate-300" />
                  ativo
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                <label className="flex flex-col gap-1">
                  <span className="text-sm font-medium text-slate-700">
                    {step.step_number === 1 ? 'Disparo' : 'Dias após o toque anterior'}
                  </span>
                  {step.step_number === 1 ? (
                    <span className="text-slate-500 py-2">imediato</span>
                  ) : (
                    <input type="number" min={0} max={365} value={step.dias_apos}
                      onChange={e => patchStep(step.id, { dias_apos: Number(e.target.value) })}
                      className="rounded-lg border border-slate-300 px-3 py-2 w-28" />
                  )}
                </label>

                <label className="flex flex-col gap-1">
                  <span className="text-sm font-medium text-slate-700">Texto</span>
                  <select value={step.modo_texto}
                    onChange={e => patchStep(step.id, { modo_texto: e.target.value as 'ia' | 'template' })}
                    className="rounded-lg border border-slate-300 px-3 py-2">
                    <option value="ia">Gerado por IA</option>
                    <option value="template">Texto fixo</option>
                  </select>
                </label>
              </div>

              {step.modo_texto === 'template' && (
                <div className="flex flex-col gap-3 mb-3">
                  <label className="flex flex-col gap-1">
                    <span className="text-sm font-medium text-slate-700">Assunto</span>
                    <input value={step.subject ?? ''}
                      onChange={e => patchStep(step.id, { subject: e.target.value })}
                      placeholder="Ex: Dúvida sobre {{company_name}}"
                      className="rounded-lg border border-slate-300 px-3 py-2" />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-sm font-medium text-slate-700">Mensagem</span>
                    <textarea value={step.body ?? ''} rows={5}
                      onChange={e => patchStep(step.id, { body: e.target.value })}
                      placeholder="Use {{contact_name}} e {{company_name}} para personalizar."
                      className="rounded-lg border border-slate-300 px-3 py-2 resize-y" />
                  </label>
                </div>
              )}

              {step.modo_texto === 'ia' && (
                <p className="text-sm text-slate-500 mb-3">A IA gera um texto personalizado para cada lead neste toque.</p>
              )}

              <div className="flex gap-2">
                <button onClick={() => salvarToque(step)} disabled={savingId === step.id}
                  className="rounded-lg bg-slate-900 text-white text-sm font-bold px-4 py-2 hover:bg-slate-700 disabled:opacity-50">
                  {savingId === step.id ? 'Salvando…' : 'Salvar toque'}
                </button>
                {steps.length > 1 && (
                  <button onClick={() => removerToque(step)}
                    className="rounded-lg border border-red-200 text-red-600 text-sm px-4 py-2 hover:bg-red-50">
                    Remover
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      </section>

      <p className="text-sm text-slate-400 mt-6">
        As mudanças valem para os próximos disparos. Toques já agendados seguem o intervalo que tinham quando foram criados.
      </p>
    </main>
  );
}
