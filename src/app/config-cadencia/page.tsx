'use client';
// ============================================================
// src/app/config-cadencia/page.tsx — v2 (enxuta)
// Só a ESTRUTURA da cadência: liga/desliga + toques + intervalo.
// O texto de cada toque é gerado na Prospecção (não aqui).
// ============================================================
import { useEffect, useState, useCallback } from 'react';

interface Step {
  id: string;
  step_number: number;
  dias_apos: number;
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
      setSteps((s.steps ?? []).map((x: any) => ({
        id: x.id, step_number: x.step_number, dias_apos: x.dias_apos, ativo: x.ativo
      })));
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
        body: JSON.stringify({ dias_apos: 10, ativo: true })
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
        body: JSON.stringify({ id: step.id, dias_apos: step.dias_apos, ativo: step.ativo })
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
    return <main className="max-w-2xl mx-auto px-4 py-10"><p className="text-slate-500">Carregando…</p></main>;
  }

  return (
    <main className="max-w-2xl mx-auto px-4 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-extrabold text-slate-900">Cadência de Follow-up</h1>
        <p className="text-slate-600 mt-1">Defina quantos toques o sistema faz e o intervalo entre eles. O texto de cada toque é gerado na Prospecção.</p>
      </header>

      {error && <div role="alert" className="mb-4 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-red-700">{error}</div>}
      {info &&  <div role="status" className="mb-4 rounded-lg border border-green-300 bg-green-50 px-4 py-3 text-green-700">{info}</div>}

      {config && (
        <section className="mb-6 rounded-xl border border-slate-200 bg-white p-5">
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={config.ativo}
              onChange={e => salvarConfig({ ativo: e.target.checked })}
              className="h-5 w-5 rounded border-slate-300" />
            <span className="font-semibold text-slate-900">
              Cadência {config.ativo ? 'ativa — enviando automaticamente' : 'pausada'}
            </span>
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

        <div className="flex flex-col gap-3">
          {steps.map(step => (
            <article key={step.id}
              className={`flex items-center gap-4 rounded-lg border px-4 py-3 ${step.ativo ? 'border-slate-200 bg-white' : 'border-slate-200 bg-slate-50'}`}>
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-900 text-white text-sm font-bold">
                {step.step_number}
              </div>

              <div className="flex-1">
                {step.step_number === 1 ? (
                  <span className="text-slate-900 font-medium">Toque inicial — disparo imediato</span>
                ) : (
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-slate-900">Enviar</span>
                    <input type="number" min={1} max={365} value={step.dias_apos}
                      onChange={e => patchStep(step.id, { dias_apos: Number(e.target.value) })}
                      className="w-20 rounded-lg border border-slate-300 px-3 py-2 text-slate-900 font-medium text-center" />
                    <span className="text-slate-900">dias após o toque anterior</span>
                  </div>
                )}
              </div>

              <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer shrink-0">
                <input type="checkbox" checked={step.ativo}
                  onChange={e => patchStep(step.id, { ativo: e.target.checked })}
                  className="h-4 w-4 rounded border-slate-300" />
                ativo
              </label>

              <button onClick={() => salvarToque(step)} disabled={savingId === step.id}
                className="rounded-lg bg-slate-900 text-white text-sm font-bold px-3 py-2 hover:bg-slate-700 disabled:opacity-50 shrink-0">
                {savingId === step.id ? '...' : 'Salvar'}
              </button>
              {steps.length > 1 && (
                <button onClick={() => removerToque(step)} aria-label={`Remover toque ${step.step_number}`}
                  className="rounded-lg border border-red-200 text-red-600 text-sm px-3 py-2 hover:bg-red-50 shrink-0">
                  Remover
                </button>
              )}
            </article>
          ))}
        </div>
      </section>

      <p className="text-sm text-slate-500 mt-6">
        As mudanças valem para os próximos disparos. Toques já agendados mantêm o intervalo que tinham quando foram criados.
      </p>
    </main>
  );
}
