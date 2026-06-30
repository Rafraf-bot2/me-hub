// Worker entry du hub (déploiement Cloudflare Workers "static assets").
// Sert le site statique (dist via le binding ASSETS) et expose les routes
// dynamiques privées du monde /sport, adossées à D1 :
//   GET  /api/sport     → dashboard (fenêtre 7 derniers jours recalculée à la requête)
//   POST /ingest/hevy   → upsert séances Hevy (token x-ingest-token)
//   POST /ingest/health → upsert ligne santé du jour (token x-ingest-token)
// La transfo vit dans src/lib/sport-transform.mjs (partagée avec le pull local).
// Privacy : /sport + /api/sport à garder par Cloudflare Access (cf tasks/sport-cloudflare-setup.md).
import { buildDashboard, enrichWorkouts } from '../src/lib/sport-transform.mjs';

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname === '/api/sport' && request.method === 'GET') return apiSport(env);
    if (pathname === '/ingest/hevy' && request.method === 'POST') return ingestHevy(request, env);
    if (pathname === '/ingest/health' && request.method === 'POST') return ingestHealth(request, env);
    return env.ASSETS.fetch(request); // tout le reste = site statique
  },
};

async function apiSport(env) {
  // Robuste : D1 pas branché OU schéma pas encore appliqué OU base vide
  // → dashboard vide propre, jamais une 500.
  let enriched = [];
  if (env.DB) {
    try {
      const { results } = await env.DB.prepare('SELECT raw FROM workouts ORDER BY date ASC').all();
      enriched = (results || []).map((r) => JSON.parse(r.raw));
    } catch {
      enriched = [];
    }
  }
  return Response.json(buildDashboard(enriched), { headers: { 'cache-control': 'no-store' } });
}

async function ingestHevy(request, env) {
  if (request.headers.get('x-ingest-token') !== env.INGEST_TOKEN) return new Response('forbidden', { status: 403 });
  if (!env.DB) return new Response('no DB binding', { status: 503 });
  const { workouts = [], templates = [] } = await request.json();
  const muscleOf = new Map(templates.map((t) => [t.id, t.primary_muscle_group]));
  const enriched = enrichWorkouts(workouts, muscleOf);
  const now = new Date().toISOString();
  const stmts = enriched.map((e) =>
    env.DB.prepare(
      `INSERT INTO workouts (id, date, title, duration_min, sets, volume_kg, group_tag, prs, raw, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         date=excluded.date, title=excluded.title, duration_min=excluded.duration_min,
         sets=excluded.sets, volume_kg=excluded.volume_kg, group_tag=excluded.group_tag,
         prs=excluded.prs, raw=excluded.raw, updated_at=excluded.updated_at`
    ).bind(e.id, e.date, e.title, e.duration_min, e.sets, e.volume_kg, e.group_tag, e.prs, JSON.stringify(e), now)
  );
  if (stmts.length) await env.DB.batch(stmts);
  return Response.json({ ok: true, upserted: enriched.length });
}

async function ingestHealth(request, env) {
  if (request.headers.get('x-ingest-token') !== env.INGEST_TOKEN) return new Response('forbidden', { status: 403 });
  if (!env.DB) return new Response('no DB binding', { status: 503 });
  const d = await request.json();
  if (!d?.date) return new Response('missing date', { status: 400 });
  await env.DB.prepare(
    `INSERT INTO daily (date, steps, kcal_in, kcal_out, protein_g, carbs_g, fat_g, weight_kg, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(date) DO UPDATE SET
       steps=excluded.steps, kcal_in=excluded.kcal_in, kcal_out=excluded.kcal_out,
       protein_g=excluded.protein_g, carbs_g=excluded.carbs_g, fat_g=excluded.fat_g,
       weight_kg=excluded.weight_kg, updated_at=excluded.updated_at`
  ).bind(
    d.date, d.steps ?? null, d.kcal_in ?? null, d.kcal_out ?? null,
    d.protein_g ?? null, d.carbs_g ?? null, d.fat_g ?? null, d.weight_kg ?? null,
    new Date().toISOString()
  ).run();
  return Response.json({ ok: true });
}
