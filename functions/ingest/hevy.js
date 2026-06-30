// POST /ingest/hevy — alimenté par la GitHub Action cron (pull Hevy hebdo).
// Le body = { workouts, templates } (réponses brutes de l'API Hevy). On enrichit
// ici (PR calculés sur tout l'historique reçu) puis on upsert dans D1.
// Gardé par un token partagé (header x-ingest-token = secret INGEST_TOKEN).
import { enrichWorkouts } from '../../src/lib/sport-transform.mjs';

export async function onRequestPost({ request, env }) {
  if (request.headers.get('x-ingest-token') !== env.INGEST_TOKEN) {
    return new Response('forbidden', { status: 403 });
  }
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
