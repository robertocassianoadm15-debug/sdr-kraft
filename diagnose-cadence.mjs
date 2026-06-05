import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'

const envVars = fs.readFileSync('.env.local', 'utf8')
  .split('\n').filter(l => l.includes('=') && !l.startsWith('#'))
  .reduce((acc, l) => { const [k, ...v] = l.split('='); acc[k.trim()] = v.join('=').trim().replace(/^["']|["']$/g, ''); return acc }, {})

const sb = createClient(envVars['NEXT_PUBLIC_SUPABASE_URL'], envVars['SUPABASE_SERVICE_ROLE_KEY'])
const ok = m => console.log(`  ✅  ${m}`)
const warn = m => console.log(`  ⚠️   ${m}`)
const fail = m => console.log(`  ❌  ${m}`)
const info = m => console.log(`  ℹ️   ${m}`)
const sep = () => console.log('─'.repeat(60))

console.log('\n🔬  SDR-KRAFT — Diagnóstico Cadência D10/D20')
console.log('═'.repeat(60))

// 1. outreach por touch+status
console.log('\n[1/5] Outreach scheduled no banco'); sep()
const { data: outreach } = await sb.from('outreach').select('touch_number, status')
const counts = outreach.reduce((acc, r) => { const k = `t${r.touch_number}_${r.status}`; acc[k] = (acc[k]||0)+1; return acc }, {})
info(`touch2 — sent: ${counts.t2_sent||0} | scheduled: ${counts.t2_scheduled||0}`)
info(`touch3 — sent: ${counts.t3_sent||0} | scheduled: ${counts.t3_scheduled||0}`)
if (!counts.t2_sent && counts.t2_scheduled) warn(`D10 nunca disparou — ${counts.t2_scheduled} scheduled parados`)
if (!counts.t3_sent && counts.t3_scheduled) warn(`D20 nunca disparou — ${counts.t3_scheduled} scheduled parados`)

// 2. leads vencidos
console.log('\n[2/5] Leads com D0 vencido sem follow-up'); sep()
const c10 = new Date(Date.now() - 10*864e5).toISOString()
const c20 = new Date(Date.now() - 20*864e5).toISOString()
const { data: d0_10 } = await sb.from('outreach').select('lead_id').eq('touch_number',1).eq('status','sent').lt('sent_at', c10)
const { data: d0_20 } = await sb.from('outreach').select('lead_id').eq('touch_number',1).eq('status','sent').lt('sent_at', c20)
info(`D0 com 10+ dias: ${d0_10?.length||0} leads`)
info(`D0 com 20+ dias: ${d0_20?.length||0} leads`)
if (d0_10?.length > 0) {
  const ids = d0_10.map(r=>r.lead_id)
  const { data: t2 } = await sb.from('outreach').select('lead_id').eq('touch_number',2).eq('status','sent').in('lead_id', ids.slice(0,400))
  const sem = ids.length - (t2?.length||0)
  sem > 0 ? warn(`${sem} leads com D0 10+ dias SEM D10 enviado`) : ok('Todos com D0 10+ dias já receberam D10')
}

// 3. settings de cadência
console.log('\n[3/5] Settings de cadência'); sep()
const { data: settings } = await sb.from('settings').select('key, value')
const cad = settings.filter(r => /cadence|d10|d20|d3|d7|interval|touch|follow/i.test(r.key))
cad.length === 0 ? warn('Nenhuma setting de cadência — intervalos hardcoded no código') : cad.forEach(r => ok(`${r.key} = ${r.value}`))

// 4. código process-cadence
console.log('\n[4/5] Código process-cadence/route.ts'); sep()
const paths = ['src/app/api/cron/process-cadence/route.ts','src/app/api/cron/process-cadence/route.tsx','src/pages/api/cron/process-cadence.ts']
let code = null, codePath = null
for (const p of paths) { if (fs.existsSync(p)) { codePath = p; code = fs.readFileSync(p,'utf8'); break } }
if (!code) { fail('process-cadence não encontrado') } else {
  ok(`Arquivo: ${codePath}`)
  if (/['"\`]3\s?days['"\`]|INTERVAL '3/i.test(code)) fail("Ainda tem '3 days' — D10 NÃO configurado")
  if (/['"\`]7\s?days['"\`]|INTERVAL '7/i.test(code)) fail("Ainda tem '7 days' — D20 NÃO configurado")
  if (/['"\`]10\s?days['"\`]|INTERVAL '10/i.test(code)) ok("'10 days' encontrado — D10 configurado")
  if (/['"\`]20\s?days['"\`]|INTERVAL '20/i.test(code)) ok("'20 days' encontrado — D20 configurado")
  if (!/touch_number.*[23]|[23].*touch_number/.test(code)) warn('touch_number 2 ou 3 não referenciado — follow-up nunca dispararia')
  const lines = code.split('\n').map((l,i)=>({n:i+1,l})).filter(({l})=>/touch_number|cadence|interval|days/i.test(l))
  if (lines.length) { info('Linhas relevantes:'); lines.forEach(({n,l})=>console.log(`    L${n}: ${l.trim()}`)) }
}

// 5. varredura geral
console.log('\n[5/5] Varredura src/ por intervalos antigos (3/7 days)'); sep()
const results = []
function walk(dir) {
  for (const e of fs.readdirSync(dir,{withFileTypes:true})) {
    const full = path.join(dir,e.name)
    if (e.isDirectory() && !['node_modules','.next','.git'].includes(e.name)) walk(full)
    else if (e.isFile() && /\.(ts|tsx|js|jsx)$/.test(e.name)) {
      fs.readFileSync(full,'utf8').split('\n').forEach((l,i)=>{
        if (/['"\` ]3\s?days|['"\` ]7\s?days/i.test(l)) results.push({file:full,line:i+1,content:l.trim()})
      })
    }
  }
}
walk(fs.existsSync('src')?'src':'.')
results.length === 0 ? ok('Nenhuma referência a 3/7 days no código') : results.forEach(r=>fail(`${r.file}:${r.line} → ${r.content}`))

console.log('\n' + '═'.repeat(60))
console.log('✔   Diagnóstico concluído\n')
