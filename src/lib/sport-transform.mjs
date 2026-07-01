// Transfo data /sport — lib PARTAGÉE (aucune dépendance Node : tourne en Node ET
// dans le runtime Cloudflare Workers). Consommée par :
//   - scripts/hevy_pull.mjs        (pull local → src/data/sport.json, dev)
//   - functions/ingest/hevy.js     (GitHub Action → upsert D1)
//   - functions/api/sport.js       (lecture D1 → dashboard, fenêtre 7j recalculée à la requête)
// Séparer enrich (coûteux, fait à l'ingest) de buildDashboard (léger, fait à la lecture)
// garde la fenêtre "7 derniers jours" toujours glissante.

// muscle group Hevy → catégorie push/pull/legs/core
export const CAT = {
  chest: 'push', shoulders: 'push', triceps: 'push',
  lats: 'pull', upper_back: 'pull', lower_back: 'pull', biceps: 'pull', forearms: 'pull', traps: 'pull',
  quadriceps: 'legs', hamstrings: 'legs', glutes: 'legs', calves: 'legs', abductors: 'legs', adductors: 'legs',
  abdominals: 'core',
};

const e1rm = (w, reps) => (w > 0 && reps > 0 ? w * (1 + reps / 30) : 0); // Epley
// date locale YYYY-MM-DD (cohérent header + données, pas de bug de fuseau)
const dayKey = (dt) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
const FR_LETTERS = ['D', 'L', 'M', 'M', 'J', 'V', 'S']; // index = getDay()

// raw Hevy workouts (+ map exercise_template_id → primary_muscle_group)
// → workouts enrichis, triés chrono, PR détectés (best e1RM vu AVANT la séance).
export function enrichWorkouts(workouts, muscleOf) {
  const sorted = [...workouts].sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
  const bestSeen = new Map(); // template_id → meilleur e1RM passé
  return sorted.map((w) => {
    const cat = { push: 0, pull: 0, legs: 0, core: 0, other: 0 };
    const muscles = {}; // séries de travail par muscle Hevy (carte musculaire)
    let volume = 0, workingSets = 0, prs = 0;
    for (const ex of w.exercises) {
      const mg = muscleOf.get(ex.exercise_template_id) || 'other';
      const cg = CAT[mg] || 'other';
      let exBest = 0;
      for (const s of ex.sets) {
        if (s.type === 'warmup') continue;
        workingSets++;
        cat[cg]++;
        muscles[mg] = (muscles[mg] || 0) + 1;
        if (s.weight_kg && s.reps) volume += s.weight_kg * s.reps;
        const r = e1rm(s.weight_kg, s.reps);
        if (r > exBest) exBest = r;
      }
      const prev = bestSeen.get(ex.exercise_template_id) || 0;
      if (exBest > prev + 0.01) { prs++; bestSeen.set(ex.exercise_template_id, exBest); }
    }
    const order = ['push', 'pull', 'legs', 'core'];
    const group = order.reduce((a, b) => (cat[b] > cat[a] ? b : a), 'push');
    const dur = Math.round((new Date(w.end_time) - new Date(w.start_time)) / 60000);
    return {
      id: w.id, date: dayKey(new Date(w.start_time)), title: w.title,
      duration_min: dur, sets: workingSets, volume_kg: Math.round(volume),
      group_tag: cat[group] ? group : 'other', cat, muscles, prs,
    };
  });
}

// coach "A" (règles déterministes) : verdict + flags dérivés de la semaine muscu.
export function coach(m) {
  const flags = [];
  if (m.split.legs === 0) flags.push({ tone: 'alert', icon: 'barbell', text: '0 jambes cette semaine' });
  if (m.prs > 0) flags.push({ tone: 'good', icon: 'trophy', text: `${m.prs} record${m.prs > 1 ? 's' : ''}` });
  if (m.sessions >= 4) flags.push({ tone: 'good', icon: 'flame', text: `${m.sessions} séances` });
  if (m.sessions === 1) flags.push({ tone: 'warn', icon: 'alert-triangle', text: '1 seule séance' });

  let verdict;
  if (m.sessions === 0) verdict = { line1: 'Zéro séance.', line2: 'On se réveille.' };
  else if (m.split.legs === 0 && m.sessions >= 2) verdict = { line1: 'Cap tenu.', line2: 'Les jambes suivent pas.' };
  else if (m.sessions >= 4) verdict = { line1: 'Grosse semaine.', line2: 'Tiens le rythme.' };
  else verdict = { line1: 'En route.', line2: `${m.sessions} séance${m.sessions > 1 ? 's' : ''} cette semaine.` };
  return { verdict, flags };
}

// Santé (table `daily`, via Health Connect) → bloc lecture sur la même fenêtre 7j.
// `null` si aucune ligne exploitable : le front retombe alors sur ses stubs.
const HEALTH_FIELDS = ['steps', 'kcal_in', 'kcal_out', 'protein_g', 'carbs_g', 'fat_g', 'weight_kg'];

function buildHealth(daily, now, startKey, todayKey) {
  const win = daily
    .filter((d) => d.date >= startKey && d.date <= todayKey)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  const withData = win.filter((d) => HEALTH_FIELDS.some((k) => d[k] != null));
  if (!withData.length) return null;

  const src = withData[withData.length - 1]; // jour le + récent avec ≥ 1 valeur
  const latest = { date: src.date };
  for (const k of HEALTH_FIELDS) latest[k] = src[k] ?? null;

  // 7 cases alignées sur la fenêtre (alimente la mini-histo Graille)
  const days = Array.from({ length: 7 }, (_, i) => {
    const dt = new Date(now); dt.setDate(now.getDate() - 6 + i);
    const key = dayKey(dt);
    const row = win.find((d) => d.date === key) || null;
    return {
      date: key, letter: FR_LETTERS[dt.getDay()], day: dt.getDate(),
      steps: row?.steps ?? null, kcal_in: row?.kcal_in ?? null, protein_g: row?.protein_g ?? null,
    };
  });

  // poids : dernier non nul + variation vs le premier non nul de la fenêtre
  const weighed = win.filter((d) => d.weight_kg != null);
  let weight = null;
  if (weighed.length) {
    const current = weighed[weighed.length - 1].weight_kg;
    weight = { current, delta_7d: weighed.length > 1 ? +(current - weighed[0].weight_kg).toFixed(1) : null };
  }

  return { latest, days, weight };
}

// workouts enrichis (calculés/stockés) + lignes santé `daily` → dashboard complet.
// Fenêtre glissante = les 7 derniers jours à `now` (today inclus). `daily` optionnel
// (le pull local n'a pas la santé → bloc `health: null`, aucune régression).
export function buildDashboard(enriched, daily = [], now = new Date()) {
  const winStart = new Date(now); winStart.setDate(now.getDate() - 6);
  const startKey = dayKey(winStart), todayKey = dayKey(now);
  const thisWeek = enriched.filter((e) => e.date >= startKey && e.date <= todayKey);
  const sum = (a, k) => a.reduce((t, e) => t + (e[k] || 0), 0);

  // répartition des séries de travail par groupe (séances mixtes ventilées)
  const split = thisWeek.reduce((a, e) => {
    for (const k of ['push', 'pull', 'legs', 'core']) a[k] += e.cat?.[k] || 0;
    return a;
  }, { push: 0, pull: 0, legs: 0, core: 0 });
  // séries par muscle (alimente la carte musculaire face/dos)
  const muscles = thisWeek.reduce((a, e) => {
    for (const [k, v] of Object.entries(e.muscles || {})) a[k] = (a[k] || 0) + v;
    return a;
  }, {});

  // 7 cases = les 7 derniers jours, séances posées dedans
  const days = Array.from({ length: 7 }, (_, i) => {
    const dt = new Date(now); dt.setDate(now.getDate() - 6 + i);
    const key = dayKey(dt);
    const sessions = thisWeek
      .filter((e) => e.date === key)
      .map((e) => ({ title: e.title, group_tag: e.group_tag, duration_min: e.duration_min, volume_t: +((e.volume_kg || 0) / 1000).toFixed(1) }));
    return { letter: FR_LETTERS[dt.getDay()], day: dt.getDate(), date: key, sessions };
  });
  const rest = days.filter((d) => d.sessions.length === 0).length;

  const muscu = {
    sessions: thisWeek.length,
    volume_t: +(sum(thisWeek, 'volume_kg') / 1000).toFixed(1),
    minutes: sum(thisWeek, 'duration_min'),
    prs: sum(thisWeek, 'prs'),
    split, muscles,
  };
  const recent = enriched.slice(-3).reverse().map((e) => ({
    title: e.title, date: e.date, sets: e.sets, volume_t: +((e.volume_kg || 0) / 1000).toFixed(1),
    duration_min: e.duration_min, group_tag: e.group_tag, prs: e.prs,
  }));

  const { verdict, flags } = coach(muscu);
  const health = buildHealth(daily, now, startKey, todayKey);
  return {
    week: { start: startKey, end: todayKey, days, rest },
    muscu, recent, verdict, flags, health,
    generated_at: new Date().toISOString(),
  };
}
