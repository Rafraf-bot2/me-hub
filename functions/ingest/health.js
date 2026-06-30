// POST /ingest/health — alimenté par le pont téléphone (Health Connect → webhook).
// Le body = une ligne journalière { date, steps, kcal_in, kcal_out, protein_g,
// carbs_g, fat_g, weight_kg }. Upsert par date dans la table `daily`.
// Gardé par le même token partagé (header x-ingest-token = secret INGEST_TOKEN).

export async function onRequestPost({ request, env }) {
  if (request.headers.get('x-ingest-token') !== env.INGEST_TOKEN) {
    return new Response('forbidden', { status: 403 });
  }
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
