# Partie 4 — Mise en ligne /sport (Cloudflare) : ce que TOI tu dois faire

Le code est déjà scaffoldé (voir « Côté code, déjà fait » en bas). Cette doc liste **les
étapes compte Cloudflare**, qu'on ne peut pas automatiser. Archi retenue : **Cloudflare
Pages + Pages Functions + D1**, cron Hevy en **GitHub Action** (comme /cine). Pas de Worker séparé.

> Ordre : 1→2 déploient le site, 3→4 posent la data privée, 5 branche le cron, 6 le pont santé.

---

## 1. Compte + login
```bash
# créer un compte Cloudflare (gratuit) sur dash.cloudflare.com, puis :
npx wrangler login
npx wrangler whoami   # vérifie que c'est bien connecté
```

## 2. Déployer le site sur Cloudflare Pages
Deux options — **A (Git, recommandé)** :
- Dash Cloudflare → Workers & Pages → Create → Pages → **Connect to Git** → repo du hub.
- Build command : `npm run build` · Output dir : `dist` · le dossier `functions/` est pris
  automatiquement. Chaque push sur `main` redéploie.

**B (direct)** : `npm run build && npx wrangler pages deploy dist`

> ⚠️ **Avant le 1er build** : `src/data/sport.json` est gitignoré (data privée), donc absent
> sur le serveur de build → l'import planterait. Commiter un **stub zéro** une seule fois :
> ```bash
> echo '{"week":{"start":"","end":"","days":[],"rest":0},"muscu":{"sessions":0,"volume_t":0,"minutes":0,"prs":0,"split":{"push":0,"pull":0,"legs":0,"core":0},"muscles":{}},"recent":[],"verdict":{"line1":"—","line2":""},"flags":[],"generated_at":""}' > src/data/sport.json
> git add -f src/data/sport.json && git commit -m "chore(sport): stub build"
> ```
> En prod l'île remplace ce stub par la vraie data via `fetch('/api/sport')`. En local,
> ton `node scripts/hevy_pull.mjs` réécrit le fichier avec la vraie data (non commitée).

## 3. Créer la base D1 + appliquer le schéma
```bash
npx wrangler d1 create me-sport
# → copie le database_id affiché dans wrangler.toml (champ REMPLIR_APRES_d1_create)
npx wrangler d1 execute me-sport --remote --file=db/schema.sql
```
Dans le dash Pages : **Settings → Functions → D1 bindings** → variable `DB` = base `me-sport`
(le binding wrangler.toml suffit en CLI ; le dash le double pour le déploiement Git).

## 4. Cloudflare Access (mur privé sur /sport)
Dash → **Zero Trust → Access → Applications → Add → Self-hosted** :
- Domaine : `<ton-domaine>` · chemins : `/sport` **et** `/api/sport`.
- Policy : Allow · Emails = `soulstories360@gmail.com`.
- (le reste du hub — `/`, `/cine` — reste public, ne pas le couvrir.)

## 5. Secrets + cron Hevy (GitHub Action)
```bash
# token partagé ingest (génère une valeur aléatoire, garde-la) :
npx wrangler pages secret put INGEST_TOKEN
```
Côté GitHub repo → **Settings → Secrets and variables → Actions** : ajouter
`HEVY_API_KEY`, `INGEST_TOKEN`, `INGEST_URL` (= `https://<domaine>/ingest/hevy`).
Le workflow (à écrire, calqué sur celui de /cine) pull Hevy hebdo puis :
```bash
curl -X POST "$INGEST_URL" -H "x-ingest-token: $INGEST_TOKEN" \
     -H 'content-type: application/json' --data @hevy-raw.json
```
(`hevy-raw.json` = `{ "workouts": [...], "templates": [...] }`, sorties brutes de l'API Hevy.)

## 6. Pont Health Connect (plus tard, Palier nutrition/pas)
App webhook (ou Tasker) sur le tel → `POST https://<domaine>/ingest/health` avec le header
`x-ingest-token` et un body `{ date, steps, kcal_in, kcal_out, protein_g, carbs_g, fat_g, weight_kg }`.

---

## Côté code, déjà fait (ne touche pas, c'est prêt)
- `src/lib/sport-transform.mjs` — transfo partagée (enrich + buildDashboard + coach).
- `functions/api/sport.js` — `GET /api/sport` : lit D1, fenêtre 7j glissante, renvoie le dashboard.
- `functions/ingest/hevy.js` — `POST /ingest/hevy` (token) : enrich + upsert workouts.
- `functions/ingest/health.js` — `POST /ingest/health` (token) : upsert daily.
- `db/schema.sql` — tables `daily`, `workouts`, `coach_briefs`.
- `wrangler.toml` — binding D1 `DB` (database_id à remplir étape 3).
- `src/components/SportApp.jsx` — fetch `/api/sport` au montage, fallback JSON SSR (dev OK).

## Tester en local avant de pousser (optionnel)
```bash
npx wrangler d1 execute me-sport --local --file=db/schema.sql
echo 'INGEST_TOKEN="dev"' > .dev.vars
npm run build && npx wrangler pages dev dist   # sert /sport + /api/sport + /ingest/* en local
```
