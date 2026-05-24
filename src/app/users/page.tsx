'use client';

import { useEffect, useState } from 'react';

interface AppUser { id: string; name: string; email: string; created_at: string; }

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-gray-900">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function UsersPage() {
  const [users, setUsers]             = useState<AppUser[]>([]);
  const [loading, setLoading]         = useState(true);
  const [currentUserId, setCurrentUserId] = useState('');
  const [name, setName]               = useState('');
  const [email, setEmail]             = useState('');
  const [password, setPassword]       = useState('');
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState('');

  // Modal editar
  const [editUser, setEditUser]       = useState<AppUser | null>(null);
  const [editName, setEditName]       = useState('');
  const [editEmail, setEditEmail]     = useState('');
  const [editSaving, setEditSaving]   = useState(false);
  const [editError, setEditError]     = useState('');

  // Modal senha
  const [pwdUser, setPwdUser]         = useState<AppUser | null>(null);
  const [newPwd, setNewPwd]           = useState('');
  const [confirmPwd, setConfirmPwd]   = useState('');
  const [pwdSaving, setPwdSaving]     = useState(false);
  const [pwdError, setPwdError]       = useState('');

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

  function openEdit(u: AppUser) {
    setEditUser(u);
    setEditName(u.name);
    setEditEmail(u.email);
    setEditError('');
  }

  async function saveEdit() {
    if (!editUser) return;
    setEditSaving(true); setEditError('');
    const r = await fetch('/api/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: editUser.id, name: editName, email: editEmail })
    });
    const j = await r.json();
    if (j.ok) {
      setUsers(prev => prev.map(u => u.id === editUser.id ? { ...u, name: editName.trim(), email: editEmail.trim().toLowerCase() } : u));
      setEditUser(null);
    } else {
      setEditError(j.error ?? 'Erro ao salvar');
    }
    setEditSaving(false);
  }

  function openPwd(u: AppUser) {
    setPwdUser(u);
    setNewPwd('');
    setConfirmPwd('');
    setPwdError('');
  }

  async function savePassword() {
    if (!pwdUser) return;
    if (newPwd.length < 6) { setPwdError('Senha deve ter no mínimo 6 caracteres'); return; }
    if (newPwd !== confirmPwd) { setPwdError('As senhas não coincidem'); return; }
    setPwdSaving(true); setPwdError('');
    const r = await fetch('/api/users/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: pwdUser.id, new_password: newPwd })
    });
    const j = await r.json();
    if (j.ok) { setPwdUser(null); }
    else setPwdError(j.error ?? 'Erro ao redefinir senha');
    setPwdSaving(false);
  }

  const isSelf = (id: string) => id === currentUserId;

  return (
    <>
      {/* Modal Editar */}
      {editUser && (
        <Modal title={`Editar: ${editUser.name}`} onClose={() => setEditUser(null)}>
          <div className="space-y-4">
            <div>
              <label className="text-xs uppercase tracking-widest text-gray-500 mb-1 block">Nome</label>
              <input
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                value={editName}
                onChange={e => setEditName(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs uppercase tracking-widest text-gray-500 mb-1 block">Email</label>
              <input
                type="email"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                value={editEmail}
                onChange={e => setEditEmail(e.target.value)}
              />
            </div>
            {editError && <p className="text-sm text-red-600">{editError}</p>}
            <div className="flex gap-3 pt-2">
              <button
                onClick={saveEdit}
                disabled={editSaving}
                className="flex-1 bg-blue-900 text-white rounded-lg py-2 text-sm font-medium hover:bg-blue-800 disabled:opacity-50"
              >
                {editSaving ? 'Salvando...' : 'Salvar'}
              </button>
              <button
                onClick={() => setEditUser(null)}
                className="flex-1 bg-gray-100 text-gray-700 rounded-lg py-2 text-sm font-medium hover:bg-gray-200"
              >
                Cancelar
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal Senha */}
      {pwdUser && (
        <Modal title={`Redefinir senha: ${pwdUser.name}`} onClose={() => setPwdUser(null)}>
          <div className="space-y-4">
            <div>
              <label className="text-xs uppercase tracking-widest text-gray-500 mb-1 block">Nova senha</label>
              <input
                type="password"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                value={newPwd}
                onChange={e => setNewPwd(e.target.value)}
                placeholder="Mínimo 6 caracteres"
              />
            </div>
            <div>
              <label className="text-xs uppercase tracking-widest text-gray-500 mb-1 block">Confirmar senha</label>
              <input
                type="password"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                value={confirmPwd}
                onChange={e => setConfirmPwd(e.target.value)}
                placeholder="Repita a senha"
              />
            </div>
            {pwdError && <p className="text-sm text-red-600">{pwdError}</p>}
            <div className="flex gap-3 pt-2">
              <button
                onClick={savePassword}
                disabled={pwdSaving}
                className="flex-1 bg-blue-900 text-white rounded-lg py-2 text-sm font-medium hover:bg-blue-800 disabled:opacity-50"
              >
                {pwdSaving ? 'Redefinindo...' : 'Redefinir senha'}
              </button>
              <button
                onClick={() => setPwdUser(null)}
                className="flex-1 bg-gray-100 text-gray-700 rounded-lg py-2 text-sm font-medium hover:bg-gray-200"
              >
                Cancelar
              </button>
            </div>
          </div>
        </Modal>
      )}

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
                      {isSelf(u.id) ? (
                        <span className="text-xs text-slate-400">(você)</span>
                      ) : (
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => openEdit(u)}
                            className="text-xs text-blue-600 hover:text-blue-800"
                            title="Editar nome/email"
                          >
                            ✏️ Editar
                          </button>
                          <button
                            onClick={() => openPwd(u)}
                            className="text-xs text-amber-600 hover:text-amber-800"
                            title="Redefinir senha"
                          >
                            🔑 Senha
                          </button>
                          <button
                            onClick={() => deleteUser(u.id)}
                            className="text-xs text-red-500 hover:text-red-700"
                          >
                            Excluir
                          </button>
                        </div>
                      )}
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
    </>
  );
}
