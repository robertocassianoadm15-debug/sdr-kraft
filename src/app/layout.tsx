import './globals.css';
import type { Metadata } from 'next';
import Image from 'next/image';
import { Sidebar } from '@/components/Sidebar';

export const metadata: Metadata = {
  title: 'Liderset — SDR/BDR Autônomo',
  description: 'Prospecção automatizada de sacos kraft — Gráfica Liderset.'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="bg-[#F8FAFC] text-slate-900 font-sans">
        <div className="flex min-h-screen">
          <Sidebar />

          <div className="flex-1 flex flex-col min-w-0">
            <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-10 pt-16 md:pt-10">
              {children}
            </main>
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
          </div>
        </div>
      </body>
    </html>
  );
}
