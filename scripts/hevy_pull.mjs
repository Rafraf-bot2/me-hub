// Pull Hevy + transfo → data dashboard /sport (muscu, Palier 0).
// Local/exploration : lit HEVY_API_KEY depuis l'env. Lancer avec :
//   node --env-file=.env scripts/hevy_pull.mjs
// La transfo vit dans src/lib/sport-transform.mjs (partagée avec la Pages Function
// /api/sport et l'ingest D1). Ici on écrit src/data/sport.json pour la preview locale.

import { writeFileSync } from 'node:fs';
import { enrichWorkouts, buildDashboard } from '../src/lib/sport-transform.mjs';

const KEY = process.env.HEVY_API_KEY;
if (!KEY) { console.error('⚠️ HEVY_API_KEY absent (node --env-file=.env ...)'); process.exit(1); }

const API = 'https://api.hevyapp.com/v1';
const h = { 'api-key': KEY };

async function pageAll(path, listKey, pageSize = 10) {
  let page = 1, out = [], pageCount = 1;
  do {
    const r = await fetch(`${API}/${path}?page=${page}&pageSize=${pageSize}`, { headers: h });
    if (!r.ok) throw new Error(`${path} → HTTP ${r.status}`);
    const j = await r.json();
    out.push(...(j[listKey] || []));
    pageCount = j.page_count ?? 1;
    page++;
  } while (page <= pageCount);
  return out;
}

const [workouts, templates] = await Promise.all([
  pageAll('workouts', 'workouts'),
  pageAll('exercise_templates', 'exercise_templates', 100),
]);

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
