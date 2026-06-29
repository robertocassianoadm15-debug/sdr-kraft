'use client';
// ============================================================
// src/components/Sidebar.tsx
// Navegação lateral esquerda recolhível.
// - Desktop: recolhe para faixa de ícones (toggle).
// - Mobile: esconde como drawer (botão ☰ abre/fecha).
// - Começa aberta. Estado em memória (sem localStorage).
// ============================================================
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

interface NavItem { href: string; label: string; icon: string; }

const ITEMS: NavItem[] = [
  { href: '/import',    label: 'Importação',     icon: '📥' },
  { href: '/prospect',  label: 'Prospecção',     icon: '🎯' },
  { href: '/blast',     label: 'Disparo em Lote', icon: '📤' },
  { href: '/dashboard', label: 'Dashboard',      icon: '📊' },
  { href: '/settings',  label: 'Config',         icon: '⚙️' },
  { href: '/users',     label: 'Usuários',       icon: '👥' },
  { href: '/inbox',     label: 'Inbox',          icon: '✉️' },
  { href: '/historico', label: 'Histórico',      icon: '🕑' },
  { href: '/config-ia', label: 'Config IA',      icon: '🤖' },
  { href: '/config-cadencia', label: 'Config Cadência', icon: '🔁' },
];

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [inboxCount, setInboxCount] = useState(0);

  useEffect(() => {
    let active = true;
    const fetchCount = async () => {
      try {
        const r = await fetch('/api/inbox/count');
        const j = await r.json();
        if (active) setInboxCount(j.count ?? 0);
      } catch { /* ignore */ }
    };
    fetchCount();
    const id = setInterval(fetchCount, 30000);
    return () => { active = false; clearInterval(id); };
  }, []);

  useEffect(() => { setMobileOpen(false); }, [pathname]);

  return (
    <>
      <button
        onClick={() => setMobileOpen(true)}
        aria-label="Abrir menu"
        className="md:hidden fixed top-3 left-3 z-50 p-2 rounded-lg bg-white border border-slate-200 shadow-sm"
      >
        <HamburgerIcon />
      </button>

      {mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          className="md:hidden fixed inset-0 bg-black/40 z-40"
          aria-hidden="true"
        />
      )}

      <aside
        className={[
          'bg-white border-r border-slate-200 flex flex-col z-50 transition-all duration-200',
          'md:sticky md:top-0 md:h-screen md:translate-x-0',
          'fixed top-0 left-0 h-screen',
          mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
        ].join(' ')}
        style={{ width: collapsed ? 64 : 232 }}
        aria-label="Navegação principal"
      >
        <div className="flex items-center justify-between px-3 py-4 border-b border-slate-100">
          {!collapsed && (
            <Link href="/" className="flex items-center">
              <Image src="/logo.svg" alt="Gráfica Liderset" width={140} height={43}
                className="h-8 w-auto object-contain" priority />
            </Link>
          )}
          <button
            onClick={() => setCollapsed(c => !c)}
            aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}
            className="hidden md:flex p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"
          >
            {collapsed ? <ChevronRight /> : <ChevronLeft />}
          </button>
          <button
            onClick={() => setMobileOpen(false)}
            aria-label="Fechar menu"
            className="md:hidden p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"
          >
            <CloseIcon />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-3 px-2 flex flex-col gap-1">
          {ITEMS.map(item => {
            const active = pathname === item.href;
            const isInbox = item.href === '/inbox';
            return (
              <Link
                key={item.href}
                href={item.href}
                title={collapsed ? item.label : undefined}
                className={[
                  'relative flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                  active ? 'bg-navy-50 text-navy-700' : 'text-slate-600 hover:bg-slate-100',
                  collapsed ? 'justify-center' : '',
                ].join(' ')}
              >
                <span className="text-lg leading-none" aria-hidden="true">{item.icon}</span>
                {!collapsed && <span>{item.label}</span>}
                {isInbox && inboxCount > 0 && (
                  <span className={[
                    'inline-flex items-center justify-center min-w-[16px] h-4 px-1 text-[10px] font-bold bg-red-500 text-white rounded-full leading-none',
                    collapsed ? 'absolute top-1 right-1' : 'ml-auto',
                  ].join(' ')}>
                    {inboxCount > 9 ? '9+' : inboxCount}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-slate-100 p-2">
          <a
            href="/api/auth/logout"
            title={collapsed ? 'Sair' : undefined}
            className={[
              'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-slate-500 hover:bg-red-50 hover:text-red-600 transition-colors',
              collapsed ? 'justify-center' : '',
            ].join(' ')}
          >
            <span className="text-lg leading-none" aria-hidden="true">🚪</span>
            {!collapsed && <span>Sair</span>}
          </a>
        </div>
      </aside>
    </>
  );
}

function HamburgerIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}
function ChevronLeft() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>;
}
function ChevronRight() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>;
}
function CloseIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>;
}
