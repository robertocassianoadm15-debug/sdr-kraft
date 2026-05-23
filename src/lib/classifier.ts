import { llmJSON } from './llm';

export type EmailIntent =
  | 'info_request'
  | 'pricing'
  | 'meeting'
  | 'objection'
  | 'not_interested'
  | 'unknown';

export interface ClassificationResult {
  intent: EmailIntent;
  confidence: number;
  suggested_reply: string;
  should_auto_reply: boolean;
}

const SYSTEM_PROMPT = `Você é um classificador de respostas de cold email B2B para uma gráfica especializada em sacos kraft personalizados.
Analise a resposta do prospect e retorne JSON com:
- intent: 'info_request' | 'pricing' | 'meeting' | 'objection' | 'not_interested' | 'unknown'
- confidence: número de 0 a 100
- suggested_reply: resposta sugerida em português, tom profissional e direto, assinada como 'Polyana – Gráfica Liderset – (27) 99271-5371'

Regras de classificação:
- info_request: pede informações sobre produto, materiais, tamanhos, prazo
- pricing: pede preço, orçamento, valores, cotação
- meeting: quer agendar, ligar, conversar, visita
- objection: tem objeção (já tem fornecedor, não é o momento, budget)
- not_interested: recusa clara, cancela, remove da lista
- unknown: qualquer outra coisa

Retorne APENAS JSON válido, sem markdown, sem explicação.`;

export async function classifyInboundEmail(
  emailText: string,
  leadName: string,
  leadSegment: string
): Promise<ClassificationResult> {
  const raw = await llmJSON<{
    intent: string;
    confidence: number;
    suggested_reply: string;
  }>([
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content: `Lead: ${leadName} (${leadSegment || 'sem segmento'})\n\nResposta recebida:\n${emailText.slice(0, 2000)}`
    }
  ], { temperature: 0.3, max_tokens: 600 });

  const intent = raw.intent as EmailIntent;
  const confidence = Math.min(100, Math.max(0, raw.confidence ?? 0));

  // AUTO apenas para intenções de baixo risco com alta confiança
  const should_auto_reply =
    (intent === 'info_request'    && confidence >= 80) ||
    (intent === 'not_interested'  && confidence >= 80);

  return {
    intent,
    confidence,
    suggested_reply: raw.suggested_reply ?? '',
    should_auto_reply
  };
}
