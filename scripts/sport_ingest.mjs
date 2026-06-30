// Pull Hevy (brut) → POST /ingest/hevy (le Worker enrichit + upsert D1).
// Utilisé par la GitHub Action sync-sport. Env requis :
//   HEVY_API_KEY   clé API Hevy (Pro)
//   INGEST_URL     ex. https://me-hub.raflamalice.workers.dev/ingest/hevy
//   INGEST_TOKEN   doit matcher le secret INGEST_TOKEN du Worker
import { pullHevy } from './hevy-api.mjs';

const { HEVY_API_KEY, INGEST_URL, INGEST_TOKEN } = process.env;
for (const [k, v] of Object.entries({ HEVY_API_KEY, INGEST_URL, INGEST_TOKEN })) {
  if (!v) { console.error(`⚠️ ${k} absent`); process.exit(1); }
}

const { workouts, templates } = await pullHevy(HEVY_API_KEY);
console.log(`pull Hevy : ${workouts.length} séances, ${templates.length} templates`);

const r = await fetch(INGEST_URL, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-ingest-token': INGEST_TOKEN },
  body: JSON.stringify({ workouts, templates }),
});
const txt = await r.text();
if (!r.ok) { console.error(`ingest KO (HTTP ${r.status}): ${txt}`); process.exit(1); }
console.log('ingest OK :', txt);
