# Plan — Monde /sport : assistant coach sportif

> Maj 2026-06-29. Doc de reprise (handoff pour nouveau chat). Mémoire liée : `sport-world-plan.md`.
> Objectif : un **hub perso** de ta data sport (muscu, graille, activité) + un **coach assistant**, dans le site, **privé**, le plus auto possible.

---

## TL;DR des décisions (toutes validées avec l'auteur)

- **Hébergement** : monde `/sport` dans le hub Astro existant, **gardé par Cloudflare Access** (privé, restreint à soulstories360@gmail.com). Reste du hub (/cine, index) public.
- **`/sport` = un HUB SPA avec onglets** (pas une page unique). Le **dock du bas = la tab bar**.
  - Onglets : **Aperçu** · **Muscu** · **Graille** · **Coach**.
  - **SPA** : les vues se swappent côté client (pas de reload), **état d'onglet synchronisé à l'URL en hash** (`/sport#muscu`) → refresh/back/lien partageable OK.
  - Une seule data chargée, les onglets réaffichent des tranches.
- **Data = 2 sources** : **Hevy** (API officielle, muscu) + **Health Connect** (pas + nutrition + poids, via pont téléphone). Tout converge déjà dans Health Connect (validé).
- **Store** : Cloudflare D1 (privé). Backend = **Worker dédié** (le site reste statique).
- **Coach = A + B** (zéro API au token) : A = règles déterministes ; B = **routine Claude Code hebdo** (sous l'abo) qui lit D1 et écrit un brief. C (chat API) seulement plus tard.
- **DA = "délire Variant"** : color-blocking fluo/crème/ink, typo **Clash Display** (self-hostée), hero = **le verdict du coach** (pas une grille de KPI). Sparse, façon poster.

---

## Architecture cible

```
[Hevy API] ──(Worker Cron)──┐
[Pont téléphone HC] ──POST /ingest (token)──► [Worker] ──► [D1]
                                                  │
[Routine Claude Code hebdo] ──/api──► brief ──► [Worker] ──► D1
                                                  │
                              GET /api/sport (Access-gated) ──► /sport (île React SPA)
```

- **`/sport` = île React** (comme `/cine`) qui fetch `GET /api/sport` **une fois** et gère les onglets en client-side.
- **Cloudflare Access** garde `/sport` + `/api/sport`. **Service tokens** pour pont + routine coach.
- Fenêtre "7 derniers jours" = **glissante**, recalculée à chaque requête côté Worker (en prod). En dev c'est le script qui la calcule.

---

## Découpage des onglets (l'IA validée)

- **Aperçu** (le "qu'est-ce que je fais maintenant") : verdict coach · vitals du jour (kcal/pas/protéines) · muscu en un coup d'œil (calendrier 7 jours) · [mini-aperçu nutrition plus tard].
- **Muscu** : calendrier 7j en grand · **historique détaillé des séances** (← l'ancien bloc "Séances récentes" vient ici) · volume/PR/tendances · **carte musculaire** (face/dos, muscles allumés) + barres par groupe (les mocks déjà dessinés, écartés de l'aperçu).
- **Graille** : calories, macros, repas, courbes (Health Connect / Yazio).
- **Coach** : le brief hebdo + (plus tard) le chat.

---

## ÉTAT ACTUEL (ce qui est fait et vérifié)

**Data pipeline (Hevy, Palier 0) — OK :**
- Clé Hevy dans `.env` (`HEVY_API_KEY`, gitignoré). Compte Pro requis (déjà là).
- `scripts/hevy_pull.mjs` : pull workouts + exercise_templates → transfo :
  - durée, volume, working sets ; **group_tag** push/pull/legs via `primary_muscle_group` ; **PR** par e1RM (Epley) vs historique ; **split séries/groupe** (gardé en data, pas affiché).
  - **fenêtre glissante 7 derniers jours** (dates en heure locale — corrige un bug fuseau qui affichait S27 sur la semaine 22–28).
  - **coach "A" (règles)** : `verdict` (line1/line2) + `flags` dérivés (ex. legs=0 → "Les jambes suivent pas").
  - écrit `src/data/sport.json` (**gitignoré**, data perso).
  - Lancer : `node --env-file=.env scripts/hevy_pull.mjs`.

**Page `/sport` — OK (server-rendue depuis le JSON, à refactorer en SPA) :**
- `src/pages/sport.astro`. DA Variant. Blocs actuels :
  - header (SPORT + date locale) ; **hero verdict** (fluo) ; **3 tuiles vitals** crème en "à connecter" (kcal/pas/protéines) ; **bloc muscu sombre "7 derniers jours"** (vue jour par jour : cases fluo icône+type, repos en pointillés, légende "N séances · M repos · jambes zappées") ; **bloc "Séances récentes"** sombre (← À RETIRER de l'aperçu) ; **dock pilule** (hub/muscu/graille/coach, déco pour l'instant).
- Vérifié preview desktop + mobile, 0 erreur console.

**DA / tokens en place :**
- Typeface **Clash Display** self-hostée : `public/fonts/clash-display.woff2` (variable 200-700, licence Fontshare libre). En display (verdict/chiffres/titres) ; Space Grotesk en corps ; Space Mono en labels.
- Couleurs : page `#0c0d09` · fluo `#ccff00` · crème `#f1eee2` · ink `#1a1c14` · alerte `#ff7a4d` · texte ink `#0e1100`.

**Fichiers touchés :** `src/pages/sport.astro`, `scripts/hevy_pull.mjs`, `src/data/sport.json` (gitignoré), `public/fonts/clash-display.woff2`, `.env` + `.env.example` (HEVY_API_KEY), `.gitignore` (sport.json), `.claude/launch.json` (config "hub" déjà là).

**Preview :** `preview_start` config **"hub"** (`npm run dev`).

---

## PROCHAINES ÉTAPES (ordre conseillé)

### 1. Nettoyer l'aperçu
- [x] Retirer le bloc **"Séances récentes"** de `sport.astro` (il est passé dans l'onglet Muscu). Le calendrier 7 jours reste comme présence muscu sur l'aperçu.

### 2. Refacto SPA : le shell à onglets — ✅ FAIT (2026-06-30)
- [x] Transformer `/sport` en **île React** (`src/components/SportApp.jsx`, monté `client:load` depuis `sport.astro`), data passée en props (ou fetch `/api/sport` plus tard).
- [x] **Dock = tab bar** : 4 onglets Aperçu/Muscu/Graille/Coach, état `activeTab` client-side.
- [x] **Sync hash** : hash = source de vérité unique (clic écrit `location.hash` ; listener `hashchange` relit). Refresh + back/forward + lien partageable OK (vérifié).
- [x] Onglet **Aperçu** = vivant (verdict + vitals + calendrier 7j). **Muscu** = calendrier + séances récentes + stub carte/tendances. **Graille** = stub. **Coach** = verdict + flags + stub brief.
- [x] Garder la DA Variant (styles portés tels quels dans l'île ; dock en `<button>`, bloc `.sp-soon`, fade d'onglet).

### 3. Remplir l'onglet Muscu — ✅ FAIT (2026-06-30)
- [x] Calendrier 7j + **historique des séances** (data `recent`). NB : reste à étendre `recent` au-delà de 3 séances (le script en sort 3).
- [x] **Carte musculaire face/dos** en SVG (`MuscleMap` dans SportApp.jsx) : chaque zone s'allume selon `muscu.muscles` (séries/muscle, opacité fluo proportionnelle). Silhouettes stylisées (pas de mock préexistant — construit à neuf).
- [x] **Barres par groupe** push/pull/legs/core (depuis `muscu.split`) ; legs=0 → barre alerte.
- [x] **Strip de stats** volume / temps / records (tuiles crème remplies).
- [ ] **Tendances** (volume/poids dans le temps) → reporté (besoin d'historique multi-semaines, viendra avec D1).
- [x] **Pipeline** : `hevy_pull.mjs` émet maintenant `muscu.muscles` (séries par muscle Hevy sur la fenêtre 7j).

### 4. Infra Cloudflare (Palier B) — CODE ✅ (2026-06-30) · COMPTE ⏳
> ⚠️ Archi CORRIGÉE : le hub est déjà déployé en **Cloudflare Workers static assets** (pas Pages),
> connecté au Git (push main = rebuild auto). Donc **Worker entry** (`worker/index.js`), PAS de
> dossier `functions/` (convention Pages, inutile ici). Détail compte : `tasks/sport-cloudflare-setup.md`.
- [x] Lib partagée `src/lib/sport-transform.mjs` (enrich + buildDashboard + coach), `hevy_pull.mjs` refactoré dessus (sortie identique vérifiée).
- [x] `worker/index.js` (`main`) : route `GET /api/sport` (D1, fenêtre 7j) + `POST /ingest/{hevy,health}` (token), sinon `ASSETS.fetch` (statique). Tolère l'absence de D1 (dashboard vide, pas de 500).
- [x] `wrangler.jsonc` : `main` + binding `ASSETS` (D1 commenté, à activer après `d1 create`). Ancien `wrangler.toml` (doublon Pages) supprimé.
- [x] `db/schema.sql` (`daily`, `workouts`, `coach_briefs`).
- [x] Île en **fetch `/api/sport`** + **fallback JSON SSR**. Stub build **automatique** (`prebuild` → `scripts/ensure-sport-stub.mjs`), plus rien à committer à la main.
- [x] D1 créée (`me-sport`, id `8cae5daf-…`), binding `DB` dans wrangler.jsonc, **schéma appliqué** (3 tables OK).
- [x] **GitHub Action** `sync-sport.yml` (quotidien 05:00 UTC + dispatch) → `scripts/sport_ingest.mjs` (pull Hevy brut → POST /ingest/hevy → D1). Helper `scripts/hevy-api.mjs` partagé. Pas de commit (data en D1).
- [x] **COMPTE — FAIT (2026-06-30)** : domaine `rafraf.space` (Namecheap → Cloudflare, NS délégués, zone Active), branché en Custom Domain sur le Worker, route `workers.dev` **coupée** (404). **Cloudflare Access** sur `/sport` + `/api/sport` (login PIN email, vérifié 302 ; `/` + `/cine` publics ; `/ingest` libre = 403 sans token). Secret Worker `INGEST_TOKEN` posé. Secrets GitHub `HEVY_API_KEY`/`INGEST_TOKEN`/`INGEST_URL` posés. Workflow lancé → **50 séances en D1** (déc. 2025 → 28/06). `/api/sport` calcule la fenêtre 7j en live.

### ✅ PARTIE 4 TERMINÉE — /sport est live, privé, auto-synchronisé quotidiennement.

### 5. Health Connect (Palier steps + nutrition)
- [ ] Activer Samsung Health → Health Connect (sync). Vérifier que Yazio écrit aussi (déjà connecté ✅).
- [ ] **Pont téléphone** : app webhook dédiée (fallback Tasker) → POST `/ingest/health` (token). Whitelister l'app du Doze batterie.
- [ ] Vitals tiles (kcal/pas/protéines) passent de "à connecter" → vraies valeurs. Remplir l'onglet **Graille**.
- [ ] Vérifier si HC porte les macros détaillées ou juste les totaux ; sinon rebrancher un export Yazio pour le détail.

### 6. Coach (A + B)
- [ ] A — étoffer les règles (seuils protéines, groupe négligé, déficit, volume en baisse…).
- [ ] B — **routine Claude Code hebdo** : lit `/api/sport` (service token), génère verdict + brief, POST `/api/coach`. Programmer (dimanche soir).
- [ ] Onglet **Coach** : afficher le brief.

### 7. Hub
- [ ] Brancher le monde **SPORT** dans `src/pages/index.astro` (array `worlds` + `accentByWorld` + set `LIVE`). NB : ça touche la home "figée" → confirmer avec l'auteur avant.

---

## Schéma D1 (esquisse)

```sql
CREATE TABLE daily (         -- Health Connect, 1 ligne/jour
  date TEXT PRIMARY KEY, steps INTEGER, kcal_in INTEGER, kcal_out INTEGER,
  protein_g REAL, carbs_g REAL, fat_g REAL, weight_kg REAL, updated_at TEXT);
CREATE TABLE workouts (      -- Hevy
  id TEXT PRIMARY KEY, date TEXT, title TEXT, duration_min INTEGER,
  sets INTEGER, volume_kg REAL, group_tag TEXT, prs INTEGER, raw JSON, updated_at TEXT);
CREATE TABLE coach_briefs (  -- brief hebdo
  week TEXT PRIMARY KEY, verdict TEXT, flags JSON, generated_at TEXT);
```

---

## Prérequis / points ouverts
- [x] Hevy Pro + clé API (faite).
- [ ] Tester si Health Connect porte les macros (protéines/glucides/lipides) ou juste les kcal.
- [ ] Décision affichage restante : couleur fluo finale (`#ccff00` ok pour l'instant) ; "Séances récentes" en crème vs sombre (devient caduc, ça part dans l'onglet Muscu).

## DA — rappels
- Color-blocking (blocs pleins, pas de cartes bordées sur noir). Hero = verdict, jamais une grille de KPI.
- Clash Display en display, chiffres géants, labels minus, sparse façon poster. Dock pilule = signature.
- Alerte orange `#ff7a4d` (legs 0, etc.).

---

## Review (historique des passes)

**2026-06-30 (quater) — /sport EN LIGNE :**
- Découverte : le hub est en **Cloudflare Workers static assets** (pas Pages), Git-connecté (push = rebuild auto). Mon scaffold Pages cassait le build → réécrit en **Worker entry** (`worker/index.js`, `main` de wrangler.jsonc), `wrangler.toml`+`functions/` supprimés, stub `sport.json` auto au `prebuild`.
- Bug SSR rattrapé : `generated_at` vide (stub) → `new Date("")` Invalid → `Intl` jette. Fix Date.parse+isNaN, vérifié en condition CI.
- **LIVE** : `me-hub.raflamalice.workers.dev/sport` → 200 ; `/api/sport` → 200, Worker calcule `buildDashboard([])` (dashboard vide, D1 pas branché = OK voulu).
- ⚠️ /sport est **PUBLIC** pour l'instant (mais vide). Poser **Cloudflare Access AVANT** de brancher la vraie data D1.

**2026-06-30 (ter) — Partie 4 scaffoldée + toolbar Astro retirée :**
- Décision archi : **Pages Functions + D1** au lieu d'un Worker séparé (même projet/domaine, binding D1 direct, zéro CORS), cron Hevy gardé en GitHub Action. Plus simple.
- Logique de transfo extraite dans `src/lib/sport-transform.mjs` (partagée script local / ingest / api). `hevy_pull.mjs` refactoré dessus → **sortie JSON identique vérifiée** (diff hors `generated_at`).
- Endpoints : `functions/api/sport.js`, `functions/ingest/hevy.js`, `functions/ingest/health.js`. Schéma `db/schema.sql`, config `wrangler.toml`.
- Île : `fetch('/api/sport')` au montage + **fallback sur le JSON SSR** → preview dev intacte (vérifié, 0 erreur). `dateLabel` désormais calculé dans l'île.
- `devToolbar: { enabled: false }` dans astro.config → barre de dev Astro virée.
- Reste = **étapes compte Cloudflare** (doc dédiée `tasks/sport-cloudflare-setup.md`) : login, deploy Pages, D1 create+schéma, Access, secret ingest, GitHub Action cron, stub JSON build.

**2026-06-30 (bis) — onglet Muscu rempli :**
- `hevy_pull.mjs` étendu : émet `muscu.muscles` (séries de travail par muscle Hevy, fenêtre 7j) en plus du split par groupe. Re-run OK.
- Onglet **Muscu** complet : calendrier 7j · strip stats (volume/temps/records) · **carte musculaire SVG face/dos** (`MuscleMap`) avec muscles qui s'allument selon le volume (opacité fluo ∝ séries) · barres par groupe (legs 0 = alerte) · séances récentes.
- Pas de mock préexistant retrouvé (jamais commité / pas dans les transcripts) → silhouettes construites à neuf, look "diagramme poster" cohérent avec la DA Variant. Vérifié desktop + mobile (390px), 0 erreur.
- Dock passé en **sticky bottom** (tab bar toujours atteignable) + padding bas du wrap pour dégager le contenu.
- Reste : étendre `recent` à plus d'historique ; tendances multi-semaines (attend D1).

**2026-06-30 :**
- Refacto SPA livrée. `/sport` est maintenant une **île React** (`src/components/SportApp.jsx`, `client:load`), data en props depuis le JSON. `sport.astro` se réduit au mount + styles globaux.
- **Dock = tab bar** (4 onglets, `<button>`). État = **hash de l'URL en source unique** : clic → `location.hash` ; listener `hashchange` → relit (gère clic, back/forward, refresh, lien partageable). Tous vérifiés en preview.
- Onglets : **Aperçu** (verdict + vitals + calendrier 7j, "récentes" retirées) · **Muscu** (calendrier + séances récentes déménagées + stub carte/tendances) · **Graille** (stub) · **Coach** (verdict + flags + stub brief hebdo).
- DA Variant conservée à l'identique ; ajout fade d'onglet + bloc `.sp-soon` "bientôt". Vérifié desktop + mobile (390px), 0 erreur console.
- Prochain : étape 3 (remplir Muscu : carte musculaire + volume/PR/tendances) ou étape 4 (infra Cloudflare, bloquée sur le compte).

**2026-06-28/29 :**
- Palier 0 data Hevy prouvé sur vraie data (2 séances · push/pull/legs · 1 PR · verdict réel "Les jambes suivent pas").
- Page `/sport` DA Variant montée + vérifiée (desktop/mobile).
- Affinage DA : Clash Display self-hostée ; pills d'alerte retirées (redondantes) ; muscu en vue **jour par jour** sur **fenêtre glissante 7j** (corrige bug fuseau semaine ISO) ; 3 tuiles → **vitals "à connecter"** + teaser bas supprimé ; tuiles homogènes crème + calendrier sombre.
- Décision archi : **`/sport` = hub SPA à onglets** (dock = tab bar, hash-synced) → "Séances récentes" à déplacer dans l'onglet Muscu.
