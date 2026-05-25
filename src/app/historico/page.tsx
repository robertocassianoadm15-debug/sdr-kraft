'use client'
import { useEffect, useState } from 'react'

interface Message {
  id: string
  direction: 'inbound' | 'outbound'
  content: string
  ai_generated: boolean
  auto_replied: boolean
  awaiting_human: boolean
  read_by_human: boolean
  intent: string | null
  confidence: number | null
  created_at: string
}

interface Lead {
  id: string
  company_name: string
  email: string
  segment: string
  whatsapp: string | null
  phone: string | null
  human_takeover: boolean
}

interface LeadGroup {
  lead: Lead
  messages: Message[]
  last_activity: string
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  })
}

function getStatus(msg: Message) {
  if (msg.direction === 'inbound') return null
  if (msg.ai_generated && msg.auto_replied === false) return '✅ Aprovado por Polyana'
  if (msg.ai_generated) return '🤖 Resposta automática da IA'
  return '👤 Enviado manualmente'
}

function getIntentBadge(intent: string | null) {
  const map: Record<string, string> = {
    info_request: 'bg-blue-100 text-blue-700',
    pricing: 'bg-purple-100 text-purple-700',
    meeting: 'bg-green-100 text-green-700',
    objection: 'bg-yellow-100 text-yellow-700',
    not_interested: 'bg-red-100 text-red-700',
    unknown: 'bg-gray-100 text-gray-600',
  }
  if (!intent) return null
  const cls = map[intent] || 'bg-gray-100 text-gray-600'
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cls}`}>{intent}</span>
}

function LeadCard({ group }: { group: LeadGroup }) {
  const [takeover, setTakeover] = useState(group.lead.human_takeover || false)
  const [emailModal, setEmailModal] = useState<{ leadId: string; email: string; company: string } | null>(null)
  const [emailText, setEmailText] = useState('')
  const [emailSubject, setEmailSubject] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const { lead, messages } = group

  const raw = (lead.whatsapp || lead.phone || '').replace(/\D/g, '')
  const waNum = raw ? (raw.startsWith('55') ? raw : `55${raw}`) : null
  const waMsg = encodeURIComponent('Olá! Aqui é a Polyana da Gráfica Liderset. Vi que você entrou em contato conosco. Posso te ajudar com algo?')

  return (
    <>
    <div className="border border-gray-100 rounded-xl overflow-hidden shadow-sm">
      {/* Header do lead */}
      <div className="bg-gray-50 px-5 py-3 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <span className="font-semibold text-gray-800">{lead.company_name}</span>
          <span className="text-gray-400 text-sm ml-2">{lead.email}</span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Botão 1 — Assumir / Voltar Automático */}
          <button
            onClick={async () => {
              const novo = !takeover
              await fetch('/api/leads/takeover', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ lead_id: lead.id, takeover: novo })
              })
              setTakeover(novo)
            }}
            className={`text-xs px-3 py-1 rounded-full font-medium transition-colors ${
              takeover
                ? 'bg-orange-100 text-orange-700 hover:bg-orange-200'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {takeover ? '👤 Você assumiu' : '🤖 Automático'}
          </button>

          {/* Botão 2 — WhatsApp */}
          {waNum && (
            <a
              href={`https://wa.me/${waNum}?text=${waMsg}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs px-3 py-1 rounded-full font-medium bg-green-100 text-green-700 hover:bg-green-200 transition-colors"
            >
              💬 WhatsApp
            </a>
          )}

          {/* Botão 3 — Email */}
          {lead.email && (
            <button
              onClick={() => {
                setEmailModal({ leadId: lead.id, email: lead.email, company: lead.company_name })
                setEmailSubject(`Re: Sacos kraft personalizados — ${lead.company_name}`)
                setEmailText('')
                setSent(false)
              }}
              className="text-xs px-3 py-1 rounded-full font-medium bg-blue-100 text-blue-700 hover:bg-blue-200 transition-colors"
            >
              📧 Email
            </button>
          )}

          {/* Data + contagem */}
          <span className="text-xs text-gray-400">{formatDate(group.last_activity)}</span>
          <span className="text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full">
            {messages.length} msg{messages.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Mensagens */}
      <div className="divide-y divide-gray-50">
        {messages.map(msg => (
          <div key={msg.id} className={`px-5 py-3 ${msg.direction === 'inbound' ? 'bg-white' : 'bg-blue-50'}`}>
            <div className="flex items-start gap-3">
              <span className="text-lg mt-0.5">
                {msg.direction === 'inbound' ? '📥' : msg.ai_generated ? '🤖' : '👤'}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="text-xs font-medium text-gray-500">
                    {msg.direction === 'inbound' ? lead.company_name : getStatus(msg)}
                  </span>
                  {msg.intent && getIntentBadge(msg.intent)}
                  {msg.confidence && (
                    <span className="text-xs text-gray-400">{msg.confidence}% confiança</span>
                  )}
                </div>
                <p className="text-sm text-gray-700 leading-relaxed">{msg.content}</p>
              </div>
              <span className="text-xs text-gray-300 whitespace-nowrap mt-0.5">
                {formatDate(msg.created_at)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>

    {/* Modal email */}
    {emailModal && (
      <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold text-gray-800">Enviar email</h3>
              <p className="text-xs text-gray-400 mt-0.5">{emailModal.email}</p>
            </div>
            <button onClick={() => setEmailModal(null)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
          </div>
          <input
            type="text"
            value={emailSubject}
            onChange={e => setEmailSubject(e.target.value)}
            placeholder="Assunto"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-blue-200"
          />
          <textarea
            value={emailText}
            onChange={e => setEmailText(e.target.value)}
            placeholder={`Escreva sua mensagem para ${emailModal.company}...`}
            rows={6}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-200"
          />
          <div className="flex justify-end gap-3 mt-4">
            <button
              onClick={() => setEmailModal(null)}
              className="text-sm text-gray-500 hover:text-gray-700 px-4 py-2"
            >
              Cancelar
            </button>
            <button
              disabled={sending || !emailText.trim() || !emailSubject.trim()}
              onClick={async () => {
                setSending(true)
                try {
                  await fetch('/api/leads/send-email', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      lead_id: emailModal.leadId,
                      subject: emailSubject.trim(),
                      body: emailText.trim()
                    })
                  })
                  setSent(true)
                  setTimeout(() => setEmailModal(null), 1500)
                } finally {
                  setSending(false)
                }
              }}
              className={`text-sm px-5 py-2 rounded-lg font-medium transition-colors ${
                sent ? 'bg-green-500 text-white' :
                'bg-blue-900 text-white hover:bg-blue-800 disabled:opacity-50'
              }`}
            >
              {sending ? 'Enviando...' : sent ? '✅ Enviado!' : 'Enviar email'}
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  )
}

export default function HistoricoPage() {
  const [groups, setGroups] = useState<LeadGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    fetch('/api/historico')
      .then(r => r.json())
      .then(d => { setGroups(d.conversations || []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const filtered = groups.filter(g =>
    g.lead.company_name.toLowerCase().includes(search.toLowerCase()) ||
    g.lead.email.toLowerCase().includes(search.toLowerCase())
  )

  if (loading) return (
    <main className="p-8">
      <p className="text-gray-400">Carregando histórico...</p>
    </main>
  )

  return (
    <main className="max-w-4xl mx-auto p-8">
      <div className="mb-8">
        <p className="text-xs uppercase tracking-widest text-gray-400 mb-1">PAINEL 06</p>
        <h1 className="text-4xl font-bold text-gray-900">Histórico de Conversas</h1>
        <p className="text-gray-500 mt-2">
          Todas as interações — automáticas e manuais — em ordem cronológica.
        </p>
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-blue-50 rounded-lg p-4 text-center">
          <p className="text-2xl font-bold text-blue-700">
            {groups.reduce((acc, g) => acc + g.messages.filter(m => m.direction === 'inbound').length, 0)}
          </p>
          <p className="text-xs text-blue-600 mt-1">Respostas recebidas</p>
        </div>
        <div className="bg-green-50 rounded-lg p-4 text-center">
          <p className="text-2xl font-bold text-green-700">
            {groups.reduce((acc, g) => acc + g.messages.filter(m => m.ai_generated).length, 0)}
          </p>
          <p className="text-xs text-green-600 mt-1">Respondidas pela IA</p>
        </div>
        <div className="bg-purple-50 rounded-lg p-4 text-center">
          <p className="text-2xl font-bold text-purple-700">
            {groups.reduce((acc, g) => acc + g.messages.filter(m => !m.ai_generated && m.direction === 'outbound').length, 0)}
          </p>
          <p className="text-xs text-purple-600 mt-1">Aprovadas por Polyana</p>
        </div>
      </div>

      {/* Busca */}
      <input
        type="text"
        placeholder="Buscar por empresa ou email..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="w-full border border-gray-200 rounded-lg px-4 py-2 mb-6 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
      />

      {filtered.length === 0 && (
        <p className="text-gray-400 text-center py-12">Nenhuma conversa encontrada.</p>
      )}

      <div className="space-y-6">
        {filtered.map(group => (
          <LeadCard key={group.lead.id} group={group} />
        ))}
      </div>
    </main>
  )
}
