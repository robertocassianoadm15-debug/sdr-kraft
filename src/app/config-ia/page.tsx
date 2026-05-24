'use client'
import { useEffect, useState } from 'react'

const PROMPT_DEFAULT = `Você é a Polyana, da Gráfica Liderset (Vitória/ES).
Responda de forma direta, profissional e calorosa.
Sempre assine: "Polyana – Gráfica Liderset – (27) 99271-5371"

PRODUTOS:
- Sacos kraft personalizados para delivery, padaria, hamburgueria, farmácia
- Prazo padrão: 7-10 dias úteis após aprovação da arte
- Material: kraft 100% reciclável e biodegradável
- Para preços e orçamentos: "Vou preparar um orçamento personalizado para você"

REGRAS DE RESPOSTA:
- Frases curtas e diretas
- Use "você", não "senhor/senhora"
- Sempre ofereça próximo passo (orçamento, amostra, call)
- Nunca dê valores por email — encaminhe para orçamento formal`

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function ConfigIAPage() {
  const [prompt, setPrompt] = useState('')
  const [note, setNote] = useState('')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [history, setHistory] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [selectedHistory, setSelectedHistory] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/config-ia')
      .then(r => r.json())
      .then(d => {
        setPrompt(d.current_prompt || PROMPT_DEFAULT)
        setHistory(d.history || [])
        setLoading(false)
      })
  }, [])

  async function handleSave() {
    setSaving(true)
    await fetch('/api/config-ia', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt_text: prompt, edited_by: 'Polyana', note })
    })
    const d = await fetch('/api/config-ia').then(r => r.json())
    setHistory(d.history || [])
    setNote('')
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function handleRestoreFromHistory(item: any) {
    setPrompt(item.prompt_text)
    setSelectedHistory(item.id)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  if (loading) return <main className="p-8"><p className="text-gray-400">Carregando...</p></main>

  return (
    <main className="max-w-4xl mx-auto p-8">
      <div className="mb-8">
        <p className="text-xs uppercase tracking-widest text-gray-400 mb-1">PAINEL 07</p>
        <h1 className="text-4xl font-bold text-gray-900">Configuração da IA</h1>
        <p className="text-gray-500 mt-2">
          Edite o tom, as regras e o conhecimento da IA. Toda alteração fica salva no histórico.
        </p>
      </div>

      {/* Editor principal */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-800">Instruções para a IA</h2>
          {selectedHistory && (
            <span className="text-xs bg-orange-100 text-orange-700 px-3 py-1 rounded-full">
              Restaurando versão anterior — salve para confirmar
            </span>
          )}
        </div>

        <textarea
          value={prompt}
          onChange={e => { setPrompt(e.target.value); setSelectedHistory(null) }}
          rows={18}
          className="w-full border border-gray-200 rounded-lg p-4 text-sm font-mono text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-200 resize-y"
          placeholder="Escreva aqui as instruções para a IA..."
        />

        <div className="mt-4 flex items-center gap-3">
          <input
            type="text"
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="Nota sobre esta versão (ex: 'ajustei tom para farmácias')"
            className="flex-1 border border-gray-200 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
          />
          <button
            onClick={handleSave}
            disabled={saving}
            className={`px-6 py-2 rounded-lg text-sm font-medium transition-colors ${
              saved
                ? 'bg-green-500 text-white'
                : 'bg-blue-900 text-white hover:bg-blue-800'
            }`}
          >
            {saving ? 'Salvando...' : saved ? '✅ Salvo!' : 'Salvar versão'}
          </button>
        </div>

        <p className="text-xs text-gray-400 mt-2">
          A IA usa essas instruções imediatamente após salvar. Sem necessidade de deploy.
        </p>
      </div>

      {/* Histórico */}
      <div className="bg-white border border-gray-100 rounded-xl shadow-sm">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-800">
            Histórico de versões
            <span className="ml-2 text-xs text-gray-400 font-normal">({history.length} versões salvas)</span>
          </h2>
        </div>

        {history.length === 0 && (
          <p className="text-gray-400 text-sm text-center py-8">Nenhuma versão salva ainda.</p>
        )}

        <div className="divide-y divide-gray-50">
          {history.map((item, i) => (
            <div key={item.id} className="px-6 py-4 hover:bg-gray-50 transition-colors">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    {i === 0 && (
                      <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                        Versão atual
                      </span>
                    )}
                    <span className="text-xs text-gray-400">
                      {new Date(item.created_at).toLocaleString('pt-BR')} — por {item.edited_by}
                    </span>
                  </div>
                  {item.note && (
                    <p className="text-xs text-gray-500 italic mb-1">&quot;{item.note}&quot;</p>
                  )}
                  <p className="text-xs text-gray-400 font-mono truncate">
                    {item.prompt_text.slice(0, 120)}...
                  </p>
                </div>
                {i !== 0 && (
                  <button
                    onClick={() => handleRestoreFromHistory(item)}
                    className="text-xs px-3 py-1 rounded-full bg-gray-100 text-gray-600 hover:bg-blue-100 hover:text-blue-700 transition-colors whitespace-nowrap"
                  >
                    Restaurar
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}
