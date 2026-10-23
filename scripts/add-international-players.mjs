// Upserts the curated MLB list (scripts/data/mlb-players.json). Dry run by default; pass --apply to write.
// No departure logic: players missing from the file are never touched.
import { readFileSync } from 'node:fs'
import { loadEnv, createServiceClient } from './lib/env.mjs'
import { fetchAllPages } from '../src/lib/fetchAllPages.js'
import { planMlbSync } from './lib/mlbList.mjs'

loadEnv()
const apply = process.argv.includes('--apply')
const supabase = createServiceClient()
const entries = JSON.parse(readFileSync(new URL('./data/mlb-players.json', import.meta.url), 'utf8'))

const dbRows = await fetchAllPages(() => supabase.from('players').select('*').order('id'))
const { inserts, updates, ambiguous, notes } = planMlbSync(dbRows, entries)

console.log(`${apply ? 'APPLY' : 'DRY RUN'}: ${entries.length} in file, ${dbRows.length} db rows`)
for (const r of inserts) console.log(`  + insert ${r.name} (${r.team}) #${r.number}${r.mlb_id ? ` mlb_id=${r.mlb_id}` : ''}`)
for (const u of updates) console.log(`  ~ update ${u.name} (id ${u.id}) ${JSON.stringify(u.patch)}`)
for (const a of ambiguous) console.log(`  ? ambiguous ${a.name} (${a.team}): ids ${a.candidates.join(', ')} - skipped`)
for (const n of notes) console.log(`  ! ${n}`)
console.log(`summary: ${inserts.length} inserts, ${updates.length} updates, ${ambiguous.length} ambiguous`)

if (!apply) {
  console.log('Dry run only. Re-run with --apply to write.')
  process.exit(0)
}

let failed = 0
for (const r of inserts) {
  const { error } = await supabase.from('players').insert(r)
  if (error) { failed++; console.error(`  insert ${r.name} failed: ${error.message}`) }
}
for (const u of updates) {
  const { error } = await supabase.from('players').update(u.patch).eq('id', u.id)
  if (error) { failed++; console.error(`  update ${u.name} failed: ${error.message}`) }
}
if (failed) process.exit(1)
console.log('Done.')
