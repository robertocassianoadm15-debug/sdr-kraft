import './globals.css';
import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';

export const metadata: Metadata = {
  title: 'Liderset — SDR/BDR Autônomo',
  description: 'Prospecção automatizada de sacos kraft — Gráfica Liderset.'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="bg-[#F8FAFC] text-slate-900 font-sans">
        <header className="sticky top-0 z-50 bg-white/90 backdrop-blur border-b border-slate-200 shadow-sm">
          <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-3">
              <Image
                src="/logo.svg"
                alt="Gráfica Liderset"
                width={200}
                height={62}
                className="h-10 w-auto object-contain"
                priority
              />
              <div className="hidden sm:block border-l border-slate-200 pl-3">
                <div className="text-[10px] uppercase tracking-[0.25em] text-slate-400">
                  SDR · BDR Autônomo
                </div>
              </div>
            </Link>
            <nav className="flex items-center gap-1">
              <NavLink href="/import" label="Importação" />
              <NavLink href="/prospect" label="Prospecção" />
              <NavLink href="/dashboard" label="Dashboard" />
              <NavLink href="/settings" label="⚙ Config" />
              <NavLink href="/users" label="Usuários" />
              <a
                href="/api/auth/logout"
                className="px-4 py-2 rounded-lg text-sm font-medium text-slate-500 hover:bg-red-50 hover:text-red-600 transition-colors"
              >
                Sair
              </a>
            </nav>
          </div>
        </header>
        <main className="max-w-7xl mx-auto px-6 py-10">{children}</main>
        <footer className="border-t border-slate-200 mt-20">
          <div className="max-w-7xl mx-auto px-6 py-8 flex flex-col items-center gap-3">
            <Image
              src="/logo.svg"
              alt="Gráfica Liderset"
              width={100}
              height={31}
              className="h-6 w-auto object-contain opacity-30"
            />
            <div className="flex items-center gap-4 text-xs text-slate-400">
              <span>SDR Kraft · MVP</span>
              <span className="text-slate-300">·</span>
              <span className="font-mono">v0.1.0</span>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}

function NavLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-navy-50 hover:text-navy-700 transition-colors"
    >
      {label}
    </Link>
  );
}
