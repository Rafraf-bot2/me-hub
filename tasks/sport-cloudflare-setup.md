# Partie 4 — Mise en ligne /sport (Cloudflare Workers) : ce qui reste

Le hub est **déjà déployé en Cloudflare Workers** (static assets) connecté au repo Git :
chaque push sur `main` rebuild automatiquement (cf le commentaire du workflow /cine).
URL : https://me-hub.raflamalice.workers.dev

Archi /sport : le **Worker** (`worker/index.js`, champ `main` de `wrangler.jsonc`) sert le
site statique via le binding `ASSETS` et route `/api/sport` + `/ingest/*` vers D1.
Le stub `sport.json` du build est **automatique** (`prebuild`), rien à committer à la main.

> Ce qui est déjà fait côté code : `worker/index.js`, `src/lib/sport-transform.mjs`,
> `db/schema.sql`, `wrangler.jsonc` (main + assets ; D1 commenté), `scripts/ensure-sport-stub.mjs`,
> l'île qui fetch `/api/sport` avec fallback. Reste = les étapes COMPTE ci-dessous.

---

## 1. Login wrangler (si pas déjà fait)
```bash
npx wrangler whoami   # déjà connecté ? sinon :
npx wrangler login
```

## 2. Créer la base D1 + appliquer le schéma
```bash
npx wrangler d1 create me-sport
#   → copie le "database_id" affiché
```
Puis dans `wrangler.jsonc` : ajouter une **virgule** après le bloc `"assets": { … }` et
**décommenter** le bloc `d1_databases` en collant l'id. Enfin :
```bash
npx wrangler d1 execute me-sport --remote --file=db/schema.sql
```
> Le prochain push (ou `npx wrangler deploy`) re-déploie le Worker avec le binding `DB`.
> Tant que D1 n'est pas branché, `/api/sport` renvoie un dashboard **vide** (pas d'erreur).

## 3. Secret du token d'ingestion
```bash
npx wrangler secret put INGEST_TOKEN   # tape une valeur aléatoire, garde-la
```
(ou Dash → Workers & Pages → me-hub → Settings → Variables and Secrets.)

## 4. Domaine custom + Cloudflare Access (mur privé sur /sport)
> ⚠️ CONFIRMÉ : Access **ne marche pas sur `*.workers.dev`** (pas une zone qu'on possède →
> absent du menu "Select Domain"). Il FAUT un domaine custom. Domaine pris sur **Namecheap**.

**4a. Relier le domaine à Cloudflare**
1. Namecheap : acheter le domaine.
2. Cloudflare → Add a site → le domaine → plan Free → note les **2 nameservers**.
3. Namecheap → Nameservers → **Custom DNS** → coller les 2 NS Cloudflare. Attendre zone **Active**.

**4b. Brancher le domaine sur le Worker**
4. Workers & Pages → me-hub → Settings → **Domains & Routes → Add → Custom Domain** → le domaine (apex + `www`).
5. ⚠️ **Désactiver la route `workers.dev`** (même section) — sinon `…workers.dev/sport` reste une
   porte publique non gatée. Le site doit être **uniquement** sur le domaine custom.

**4c. Access**
6. Zero Trust → Access → Applications → Add → Self-hosted :
   - Destination 1 : domaine + path `/sport` · Destination 2 (Add a destination) : path `/api/sport`.
   - **Ne PAS couvrir `/ingest/*`** (le cron utilise un token, pas de SSO Access). `/`, `/cine` publics.
   - Policy : Allow · Emails = `soulstories360@gmail.com`.

> ⚠️ Après bascule sur le domaine custom : mettre `INGEST_URL` (secret GitHub) à
> `https://<domaine>/ingest/hevy`, et le hub principal sert désormais sur `<domaine>`.

## 5. Cron Hevy (GitHub Action, calqué sur sync-cine)
Secrets repo (Settings → Secrets and variables → Actions) : `HEVY_API_KEY`, `INGEST_TOKEN`,
`INGEST_URL` (= `https://me-hub.raflamalice.workers.dev/ingest/hevy`).
Workflow hebdo → pull Hevy puis :
```bash
curl -X POST "$INGEST_URL" -H "x-ingest-token: $INGEST_TOKEN" \
     -H 'content-type: application/json' --data @hevy-raw.json
```
(`hevy-raw.json` = `{ "workouts": [...], "templates": [...] }`, sorties brutes de l'API Hevy.)
→ **je l'écris quand le D1 + le secret sont en place.**

## 6. Pont Health Connect (plus tard, Palier nutrition/pas)
App webhook (ou Tasker) sur le tel → `POST .../ingest/health` (header `x-ingest-token`),
body `{ date, steps, kcal_in, kcal_out, protein_g, carbs_g, fat_g, weight_kg }`.

---

## Tester le Worker en local (optionnel)
```bash
npx wrangler d1 execute me-sport --local --file=db/schema.sql
echo 'INGEST_TOKEN="dev"' > .dev.vars
npm run build && npx wrangler dev    # sert /sport + /api/sport + /ingest/* en local
```
