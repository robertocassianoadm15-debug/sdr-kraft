'use client';

import { useEffect, useState } from 'react';

interface AppUser { id: string; name: string; email: string; created_at: string; }

export default function UsersPage() {
  const [users, setUsers]             = useState<AppUser[]>([]);
  const [loading, setLoading]         = useState(true);
  const [currentUserId, setCurrentUserId] = useState('');
  const [name, setName]               = useState('');
  const [email, setEmail]             = useState('');
  const [password, setPassword]       = useState('');
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState('');

  async function load() {
    setLoading(true);
    const r = await fetch('/api/users');
    const j = await r.json();
    setUsers(j.users ?? []);
    setCurrentUserId(j.current_user_id ?? '');
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function addUser(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError('');
    const r = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password })
    });
    const j = await r.json();
    if (j.ok) { setName(''); setEmail(''); setPassword(''); load(); }
    else setError(j.error ?? 'Erro ao criar usuário');
    setSaving(false);
  }

  async function deleteUser(id: string) {
    if (!confirm('Remover este usuário?')) return;
    await fetch(`/api/users?id=${id}`, { method: 'DELETE' });
    load();
  }

  return (
    <div className="space-y-8 max-w-2xl">
      <div>
        <div className="text-xs uppercase tracking-[0.3em] text-kraft-600 mb-2">Painel 05</div>
        <h1 className="text-4xl font-black text-kraft-900">Usuários</h1>
      </div>

      <div className="card p-6">
        <h2 className="font-bold text-kraft-900 mb-4">Usuários ativos</h2>
        {loading ? (
          <p className="text-sm text-kraft-600">Carregando...</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b border-kraft-200">
                <th className="pb-2 stat-label">Nome</th>
                <th className="pb-2 stat-label">Email</th>
                <th className="pb-2 stat-label">Criado em</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} className="border-b border-kraft-100 last:border-0">
                  <td className="py-3 font-medium text-kraft-900">{u.name}</td>
                  <td className="py-3 text-kraft-600">{u.email}</td>
                  <td className="py-3 text-kraft-500 text-xs">{new Date(u.created_at).toLocaleDateString('pt-BR')}</td>
                  <td className="py-3 text-right">
                    {u.id === currentUserId
                      ? <span className="text-xs text-slate-400">(você)</span>
                      : <button onClick={() => deleteUser(u.id)} className="text-xs text-red-500 hover:text-red-700">Excluir</button>
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card p-6">
        <h2 className="font-bold text-kraft-900 mb-4">Adicionar usuário</h2>
        <form onSubmit={addUser} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="stat-label mb-1 block">Nome</label>
              <input required className="input" value={name} onChange={e => setName(e.target.value)} />
            </div>
            <div>
              <label className="stat-label mb-1 block">Email</label>
              <input type="email" required className="input" value={email} onChange={e => setEmail(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="stat-label mb-1 block">Senha</label>
            <input type="password" required className="input max-w-xs" value={password} onChange={e => setPassword(e.target.value)} />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button type="submit" disabled={saving} className="btn-primary disabled:opacity-50">
            {saving ? 'Salvando...' : '+ Adicionar usuário'}
          </button>
        </form>
      </div>
    </div>
  );
}
