// Garantit que src/data/sport.json existe AVANT le build.
// En local le fichier contient la vraie data (écrite par hevy_pull.mjs, gitignoré).
// En CI / Cloudflare Workers Builds il est absent (jamais commité) → on écrit un stub
// vide pour que `import sport.json` ne casse pas le build. En prod, l'île remplace
// ce stub par la vraie data via fetch('/api/sport') (D1). Idempotent : ne touche jamais
// un fichier déjà présent.
import { existsSync, writeFileSync } from 'node:fs';

const path = new URL('../src/data/sport.json', import.meta.url);
if (existsSync(path)) process.exit(0);

const stub = {
  week: { start: '', end: '', days: [], rest: 0 },
  muscu: { sessions: 0, volume_t: 0, minutes: 0, prs: 0, split: { push: 0, pull: 0, legs: 0, core: 0 }, muscles: {} },
  recent: [],
  verdict: { line1: '—', line2: '' },
  flags: [],
  generated_at: '',
};
writeFileSync(path, JSON.stringify(stub, null, 2));
console.log('sport.json absent → stub vide écrit (build CI)');
