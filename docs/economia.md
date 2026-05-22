# Economia do Projeto — MVP

Análise de custo com a stack escolhida, considerando 1.000 leads/mês contatados.

## Custo mensal estimado

| Item | Uso | Tier grátis | Custo |
|---|---|---|---|
| Vercel (hosting) | App + APIs | Hobby plan | **R$ 0** |
| Supabase (DB) | < 500 MB | Free tier | **R$ 0** |
| Groq (LLM) | ~3k chamadas | Generoso (RPM limit, sem cobrança) | **R$ 0** |
| Resend (email) | < 3k/mês | Free tier | **R$ 0** |
| Google Places | < 5k buscas | $200/mês crédito | **R$ 0** |
| GitHub | repo privado | Free | **R$ 0** |
| **TOTAL MVP** | | | **R$ 0** |

## Quando começar a pagar

| Métrica | Threshold | Próximo tier |
|---|---|---|
| Leads totais | > 10k linhas | Supabase Pro: $25/mês |
| Emails/mês | > 3k | Resend Pro: $20/mês |
| Buscas Places | > 5k | ~$17/1000 acima |
| LLM | Trocar pra Claude/GPT | $3–15 por 1M tokens |

## Por que NÃO usamos no MVP

| Não usado | Motivo |
|---|---|
| OpenAI / Claude API | Custa por token desde a 1ª chamada — Groq é grátis. Troca futura: 1 arquivo. |
| Twilio | Caro. Evolution API (self-host) ou Z-API quando for pra produção. |
| Apollo / Hunter | Caros. Google Places + scraping próprio cobre o MVP. |
| Redis / Queue | Complexidade desnecessária no MVP. Postgres faz fila. |
| Auth / Multi-tenant | RLS preparado no SQL, ativa quando precisar. |

## Decisão de arquitetura: economia de prompts

1. **Prompts centralizados** em `src/lib/prompts.ts` — versionáveis, A/B-testáveis sem mexer no resto.
2. **`max_tokens` baixo** por chamada (500–800) — força mensagens curtas, economiza.
3. **`response_format: json`** elimina parsing frágil e retries.
4. **SDR (1 prompt) e BDR (1 prompt loop)** = 2 chamadas LLM por jornada média de lead.
5. **Sem chain-of-thought desnecessário** — Llama 3.1 responde direto ao formato pedido.

## Estimativa de tokens por lead

| Etapa | Tokens in/out | Custo se fosse Claude Sonnet ($3/$15 por 1M) |
|---|---|---|
| SDR primeiro toque | ~600 / 200 | $0,0048 |
| BDR média (3 turnos) | ~2400 / 600 | $0,0162 |
| **Total por lead** | | **~$0,02** |
| **1000 leads/mês** | | **~$20/mês** |

**Conclusão**: mesmo migrando do Groq grátis para Claude pago, custo é trivial. Foco do MVP é validar conversão, não otimizar centavos.
