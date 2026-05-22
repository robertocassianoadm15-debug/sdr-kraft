'use client';

import { useEffect, useState } from 'react';

interface Field {
  key: string;
  label: string;
  placeholder: string;
  type?: string;
}

const FIELDS: Field[] = [
  { key: 'brevo_api_key',   label: 'API Key Brevo',       placeholder: 'xkeysib-...', type: 'password' },
  { key: 'from_email',      label: 'Email de envio',       placeholder: 'contato@liderset.com.br' },
  { key: 'from_name',       label: 'Nome do remetente',    placeholder: 'Gráfica Liderset' },
  { key: 'reply_to_email',  label: 'Email de resposta',    placeholder: 'contato@liderset.com.br' },
];

export default function SettingsPage() {
  const [values, setValues]     = useState<Record<string, string>>({});
  const [saving, setSaving]     = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Record<string, { ok: boolean; msg: string }>>({});
  const [testEmail, setTestEmail]   = useState('');
  const [testLoading, setTestLoading] = useState(false);
  const [testResult, setTestResult]   = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    fetch('/api/settings')
      .then(r => r.json())
      .then(data => setValues(data));
  }, []);

  async function save(key: string) {
    setSaving(key);
    const r = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, value: values[key] ?? '' })
    });
    const j = await r.json();
    setFeedback(prev => ({ ...prev, [key]: j.ok ? { ok: true, msg: 'Salvo!' } : { ok: false, msg: j.error } }));
    setTimeout(() => setFeedback(prev => { const n = { ...prev }; delete n[key]; return n; }), 3000);
    setSaving(null);
  }

  async function sendTest() {
    if (!testEmail.trim()) return;
    setTestLoading(true); setTestResult(null);
    const r = await fetch('/api/outreach/test-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to_email: testEmail.trim() })
    });
    const j = await r.json();
    setTestResult(j.ok ? { ok: true, msg: `Enviado! ID: ${j.id}` } : { ok: false, msg: j.error });
    setTestLoading(false);
  }

  return (
    <div className="max-w-2xl space-y-10">
      <div>
        <div className="text-xs uppercase tracking-[0.3em] text-slate-400 mb-2">Configurações</div>
        <h1 className="font-display text-4xl font-bold text-slate-900">Config</h1>
        <p className="mt-2 text-slate-500">Credenciais de envio e configurações do sistema.</p>
      </div>

      {/* Campos */}
      <div className="card p-6 space-y-6">
        <h2 className="font-display text-xl font-bold text-slate-900">Email — Brevo</h2>
        {FIELDS.map(f => (
          <div key={f.key}>
            <label className="stat-label mb-1.5 block">{f.label}</label>
            <div className="flex gap-2">
              <input
                type={f.type ?? 'text'}
                className="input flex-1"
                placeholder={f.placeholder}
                value={values[f.key] ?? ''}
                onChange={e => setValues(prev => ({ ...prev, [f.key]: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && save(f.key)}
              />
              <button
                onClick={() => save(f.key)}
                disabled={saving === f.key}
                className="btn-primary px-4 disabled:opacity-50 shrink-0"
              >
                {saving === f.key ? '...' : 'Salvar'}
              </button>
            </div>
            {feedback[f.key] && (
              <p className={`mt-1 text-xs ${feedback[f.key].ok ? 'text-green-600' : 'text-red-500'}`}>
                {feedback[f.key].msg}
              </p>
            )}
          </div>
        ))}
      </div>

      {/* Teste de email */}
      <div className="card p-6 space-y-4">
        <h2 className="font-display text-xl font-bold text-slate-900">Testar envio</h2>
        <p className="text-sm text-slate-500">Envia um email de teste para confirmar que o Brevo está funcionando.</p>
        <div className="flex gap-2">
          <input
            type="email"
            className="input flex-1"
            placeholder="seu@email.com"
            value={testEmail}
            onChange={e => setTestEmail(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && sendTest()}
          />
          <button
            onClick={sendTest}
            disabled={testLoading || !testEmail.trim()}
            className="btn-primary px-5 disabled:opacity-50 shrink-0"
          >
            {testLoading ? 'Enviando...' : 'Enviar teste'}
          </button>
        </div>
        {testResult && (
          <div className={`text-sm px-4 py-3 rounded-lg ${testResult.ok ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
            {testResult.ok ? '✓ ' : '✗ '}{testResult.msg}
          </div>
        )}
      </div>
    </div>
  );
}
