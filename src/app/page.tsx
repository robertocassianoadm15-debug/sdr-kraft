import Link from 'next/link';
import Image from 'next/image';

export default function HomePage() {
  return (
    <div className="space-y-12">

      {/* Hero */}
      <section className="relative rounded-2xl overflow-hidden bg-gradient-to-br from-navy-900 via-navy-700 to-navy-600 px-8 py-16 md:py-24">
        <div
          className="absolute inset-0 opacity-20"
          style={{ backgroundImage: 'radial-gradient(circle at 75% 40%, #818cf8 0%, transparent 55%)' }}
        />
        <div className="relative z-10 max-w-2xl">
          <div className="mb-8">
            <Image
              src="/logo.png"
              alt="Gráfica Liderset"
              width={160}
              height={56}
              className="h-12 w-auto object-contain brightness-0 invert"
              priority
            />
          </div>
          <h1 className="font-display text-4xl md:text-6xl font-bold text-white leading-[1.1]">
            Prospecção que<br />
            <span className="italic text-navy-200">não dorme.</span>
          </h1>
          <p className="mt-6 text-base md:text-lg text-slate-300 max-w-xl leading-relaxed">
            Importe, prospecte e qualifique clientes que precisam de sacos kraft
            personalizados — com IA fazendo o primeiro contato e respondendo até qualificar.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/import"
              className="px-6 py-3 text-sm rounded-xl bg-white text-navy-700 font-semibold hover:bg-slate-100 transition-colors"
            >
              Começar agora →
            </Link>
            <Link
              href="/dashboard"
              className="px-6 py-3 text-sm rounded-xl border border-white/30 text-white font-medium hover:bg-white/10 transition-colors"
            >
              Ver dashboard
            </Link>
          </div>
        </div>
      </section>

      {/* Painéis */}
      <section className="grid md:grid-cols-3 gap-6">
        <PanelCard
          n="01"
          title="Importação"
          desc="CSV ou scraping Google Maps. Deduplica por place_id automaticamente."
          href="/import"
          gradient="from-blue-500 to-blue-600"
          pill="bg-blue-50 text-blue-700"
        />
        <PanelCard
          n="02"
          title="Prospecção"
          desc="Fila de leads. IA gera mensagem personalizada e envia por email ou WhatsApp."
          href="/prospect"
          gradient="from-indigo-500 to-indigo-600"
          pill="bg-indigo-50 text-indigo-700"
        />
        <PanelCard
          n="03"
          title="Dashboard"
          desc="Métricas e timeline de eventos em tempo real."
          href="/dashboard"
          gradient="from-violet-500 to-violet-600"
          pill="bg-violet-50 text-violet-700"
        />
      </section>

    </div>
  );
}

function PanelCard({
  n, title, desc, href, gradient, pill
}: {
  n: string; title: string; desc: string; href: string; gradient: string; pill: string;
}) {
  return (
    <Link
      href={href}
      className="group card p-9 hover:shadow-md hover:-translate-y-1 transition-all duration-200 flex flex-col"
    >
      <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${gradient} flex items-center justify-center mb-5`}>
        <span className="text-xs font-bold text-white font-mono">{n}</span>
      </div>
      <div className="font-display text-3xl font-bold text-slate-900 mb-3">{title}</div>
      <p className="text-base text-slate-500 leading-relaxed flex-1">{desc}</p>
      <div className={`mt-6 inline-flex items-center text-sm font-semibold ${pill} px-3 py-1.5 rounded-lg w-fit`}>
        Abrir →
      </div>
    </Link>
  );
}
