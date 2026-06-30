// Helper API Hevy partagé (pull local + ingest CI). Header `api-key`, nécessite Hevy Pro.
const API = 'https://api.hevyapp.com/v1';

export async function pageAll(key, path, listKey, pageSize = 10) {
  const headers = { 'api-key': key };
  let page = 1, out = [], pageCount = 1;
  do {
    const r = await fetch(`${API}/${path}?page=${page}&pageSize=${pageSize}`, { headers });
    if (!r.ok) throw new Error(`${path} → HTTP ${r.status}`);
    const j = await r.json();
    out.push(...(j[listKey] || []));
    pageCount = j.page_count ?? 1;
    page++;
  } while (page <= pageCount);
  return out;
}

// pull brut : { workouts, templates } (à enrichir ensuite via src/lib/sport-transform.mjs)
export async function pullHevy(key) {
  const [workouts, templates] = await Promise.all([
    pageAll(key, 'workouts', 'workouts'),
    pageAll(key, 'exercise_templates', 'exercise_templates', 100),
  ]);
  return { workouts, templates };
}
