'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';

export default function LoginPage() {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const router = useRouter();

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      const r = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const j = await r.json();
      if (j.ok) {
        router.push('/');
        router.refresh();
      } else {
        setError(j.error ?? 'Credenciais inválidas');
      }
    } catch {
      setError('Erro de conexão. Tente novamente.');
    }
    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg border border-slate-200 w-full max-w-sm p-8">
        <div className="flex flex-col items-center mb-8">
          <Image
            src="/logo.svg"
            alt="Gráfica Liderset"
            width={200}
            height={62}
            className="h-12 w-auto object-contain mb-3"
            priority
          />
          <div className="text-xs uppercase tracking-[0.25em] text-slate-400">SDR · BDR Autônomo</div>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Email</label>
            <input
              type="email"
              required
              autoComplete="email"
              className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-kraft-500"
              value={email}
              onChange={e => setEmail(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Senha</label>
            <input
              type="password"
              required
              autoComplete="current-password"
              className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-kraft-500"
              value={password}
              onChange={e => setPassword(e.target.value)}
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-kraft-800 hover:bg-kraft-900 text-kraft-50 font-semibold py-2.5 rounded-lg text-sm transition-colors disabled:opacity-50"
          >
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>

        <div className="mt-5 text-center">
          <button
            onClick={() => setShowForgot(v => !v)}
            className="text-xs text-slate-400 hover:text-slate-600 underline underline-offset-2"
          >
            Esqueci minha senha
          </button>
          {showForgot && (
            <p className="mt-3 text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg p-3 text-left">
              Entre em contato com o administrador para redefinir sua senha.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
