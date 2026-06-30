// Pull Hevy + transfo → data dashboard /sport (muscu, dev local).
// Lit HEVY_API_KEY depuis l'env. Lancer avec :
//   node --env-file=.env scripts/hevy_pull.mjs
// La transfo vit dans src/lib/sport-transform.mjs (partagée avec le Worker /api/sport).
// Ici on écrit src/data/sport.json pour la preview locale (gitignoré, data perso).
// L'ingestion prod (D1) passe par scripts/sport_ingest.mjs → POST /ingest/hevy.

import { writeFileSync } from 'node:fs';
import { pullHevy } from './hevy-api.mjs';
import { enrichWorkouts, buildDashboard } from '../src/lib/sport-transform.mjs';

const KEY = process.env.HEVY_API_KEY;
if (!KEY) { console.error('⚠️ HEVY_API_KEY absent (node --env-file=.env ...)'); process.exit(1); }

const { workouts, templates } = await pullHevy(KEY);
const muscleOf = new Map(templates.map((t) => [t.id, t.primary_muscle_group]));
const enriched = enrichWorkouts(workouts, muscleOf);
const dashboard = buildDashboard(enriched);

writeFileSync(new URL('../src/data/sport.json', import.meta.url), JSON.stringify(dashboard, null, 2));
console.log('→ src/data/sport.json écrit');

console.log('=== TOTAL ===', enriched.length, 'séances');
console.log('=== CETTE SEMAINE (depuis', dashboard.week.start, ') ===');
console.log(JSON.stringify(dashboard.muscu, null, 2));
console.log('=== SÉANCES RÉCENTES ===');
for (const r of dashboard.recent)
  console.log(`  ${r.date}  ${r.title.padEnd(22)} ${String(r.group_tag).padEnd(5)} ${r.sets} séries · ${r.volume_t}t · ${r.duration_min}min${r.prs ? ` · ${r.prs} PR` : ''}`);
