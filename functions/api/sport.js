// GET /api/sport — agrège les séances stockées en D1 et renvoie le dashboard.
// La fenêtre "7 derniers jours" est recalculée À CHAQUE requête (toujours glissante).
// Gardé par Cloudflare Access (mur réseau) → restreint à soulstories360@gmail.com.
// Le JSON renvoyé a EXACTEMENT la forme que consomme src/components/SportApp.jsx.
import { buildDashboard } from '../../src/lib/sport-transform.mjs';

export async function onRequestGet({ env }) {
  // workouts stockés enrichis : colonne `raw` = JSON de l'objet enrichi (cat, muscles, prs…)
  const { results } = await env.DB.prepare('SELECT raw FROM workouts ORDER BY date ASC').all();
  const enriched = (results || []).map((r) => JSON.parse(r.raw));
  const dashboard = buildDashboard(enriched);
  return Response.json(dashboard, {
    headers: { 'cache-control': 'no-store' },
  });
}
