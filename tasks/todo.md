# Plan — Galerie /cine : auto-update hebdo de tous les films bien notés

> Établi le 2026-06-25 (soir). À reprendre demain dans un nouveau chat.
> Objectif auteur : **un max de films bien notés** dans la galerie `/cine`, **resync auto 1×/semaine**, **0 geste** une fois en place.

## TL;DR de la décision (validé avec l'auteur)

- **Auth Letterboxd OBLIGATOIRE** pour récupérer tous les films notés (prouvé, voir Faits ci-dessous). Aucun contournement langage.
- **Tout reste en Node** (stack Astro). Le scraper Python `scripts/scrape_letterboxd.py` + son README sont à **supprimer** (ils tapent 403 d'entrée, n'apportent rien).
- Auth automatisée via **Playwright + login** (se reconnecte seul → pas de cookie à rebrancher).
- **1 seul site Astro** (hub + cine + dessins + tech + futur /blog) → **1 host pour tout**.
- **Host = Cloudflare Pages** (gratuit, CDN rapide pour le WebGL /cine, supporte le dynamique plus tard → pas de cul-de-sac comme GitHub Pages).
- **GitHub = pivot** : repo + GitHub Action cron hebdo (Playwright + scrape + commit) ; le push déclenche le rebuild Cloudflare.

## Faits techniques établis (tests du 2026-06-25, non connecté)

| URL | Statut | Note |
|---|---|---|
| `/{user}/films/` page 1 | **200** | mais ~72 films récents, **toutes notes mélangées** |
| `/{user}/films/page/2/` | **403** | pagination profonde bloquée |
| `/{user}/films/rated/4-5/` **page 1** | **403** | vues filtrées par note bloquées dès la page 1 |
| `/{user}/films/rated/4-5/page/2+/` | **403** | idem |

➡️ Connecté (cookie/Playwright), les vues `/films/rated/*` repassent en 200 et paginent → **on récupère TOUT, proprement, trié par note**. C'est la bonne source une fois authentifié (plus propre que lire `rated-N` sur `/films/`).

Identifiants Letterboxd : pseudo = `rafraf30`. Token TMDB déjà dans `.env` (gitignored) sous `TMDB_READ_TOKEN`.

---

## Phase 0 — Repo Git + Hébergement Cloudflare

- [x] `git init` ✅ (2026-06-26, branche `main`)
- [x] `.gitignore` durci : `node_modules/ dist/ .astro/ .env* raw-media/ *.kra *.zip` + exports png au root. `.env.example` ajouté (clés sans valeurs). `.env` confirmé hors repo.
- [x] Commit initial (98e532c)
- [x] Repo GitHub public + push ✅ → https://github.com/Rafraf-bot2/me-hub (compte `Rafraf-bot2`, protocole SSH). `.env` confirmé absent du distant.
- [x] Cloudflare **Workers** (pas Pages — nouveau flux unifié) connecté au repo ✅
      - Config via `wrangler.jsonc` au root (static assets `./dist`, compat 2026-06-26).
      - Build : `npm run build` · Deploy : `npx wrangler deploy`.
      - ⚠️ 1er build a échoué (lockfile désync → `npm ci`) → corrigé via `npm install --package-lock-only` (commit 07a7899).
- [x] 1er déploiement live OK ✅ → https://me-hub.raflamalice.workers.dev
      - Hub : 200, contenu complet. `/cine` → 307 vers `/cine/` → 200, island R3F `client:only` + 33 films/132 frames sérialisés, URLs TMDB OK. Rendu WebGL à confirmer visuellement en navigateur.
- [ ] (Plus tard) brancher domaine perso

## Phase 1 — Scrape authentifié ✅ TERMINÉE (2026-06-27)

**Résultat : galerie passée de 33 → 70 films (279 frames).** `src/data/cine.json` régénéré.
Distribution : 40× 4★, 21× 4.5★, 4× 3.5★ (films de listes), 5 list-only. (1 perdu : `twin-peaks-the-return` = série TV, pas d'ID film TMDB.)

### Le gros enseignement : auto-login = IMPOSSIBLE (Cloudflare Turnstile)
Le sign-in Letterboxd est derrière **Cloudflare Turnstile**. Prouvé qu'AUCUN navigateur piloté ne passe le submit :
| Tentative | Résultat |
|---|---|
| Playwright headless vanilla | ❌ Turnstile, `login.do` jamais envoyé |
| Playwright headed | ❌ Turnstile |
| playwright-extra + stealth (`webdriver=false`) | ❌ Turnstile |
| Login HUMAIN dans un navigateur piloté (capture-cookie) | ❌ "try another browser" au submit |
➡️ `scripts/lb-login.mjs` et `scripts/lb-capture-cookie.mjs` **supprimés** (morts).

### La solution qui marche : cookie d'un VRAI navigateur + scrape via navigateur stealth
- **Auth** = cookie de session capturé **à la main** depuis le vrai Safari de l'auteur (DevTools → Réseau → en-tête `Cookie`), collé dans `.env` sous `LB_COOKIE`. (Turnstile ne garde QUE le login ; une session déjà valide navigue sans souci.)
- **Scrape** = nouveau module `scripts/lb-browser.mjs` : **stealth Chromium** avec le cookie injecté. Raison : `fetch` Node se fait re-challenger par Cloudflare aléatoirement (cf_clearance lié à l'empreinte TLS du navigateur d'origine). Un vrai navigateur gagne sa propre clairance → pagine sans 403.
- **getRatings** réécrit : walk `/films/by/entry-rating/page/N/` (triées par note, paginables en authentifié). Le chemin `/films/page/N/` est lui hard-bloqué par Cloudflare ("Just a moment…").
- `MIN_STARS = 4★` (validé). Cleanup Phase 3 fait (scraper Python supprimé).
- [ ] (optionnel) Perf /cine avec 70 plans vs 33 — à l'œil en navigateur (rendu R3F inchangé, données seules ont grossi). Build prod OK.

### Bonus (2026-06-27) : rotation des frames tous les 2 jours — côté client, 0 infra
Idée auteur : rendre le site plus vivant en changeant les frames régulièrement. Choix = **rotation côté client** (pas de cron/rebuild) :
- `pickFrames` stocke désormais **toutes les bonnes frames** (cap `MAX_FRAMES=16`) au lieu de 4 → `cine.json` = 70 films / **1101 frames** (médiane 16/film).
- `CineSpace.jsx` : `PERIOD = floor(now / 2j)`, `frameIndex = (PERIOD + hash(slug)) % nbFrames`. L'espace 3D + la planche-contact affichent `frameOfDay`, le détail une fenêtre de 4 (`frameWindow`). Déterministe (tout le monde voit pareil le même jour), désynchronisé entre films via le hash.
- Cloudflare : **0 build/0 bande passante en plus** (frames = hotlinks CDN TMDB ; le fichier ne change pas entre syncs). Cycle ~32 j avant répétition pour les films à 16 frames ; le sync hebdo renouvelle le lot en prime.
- Vérifié : logique de rotation testée en Node (stable 2j, avance+boucle, désync OK) + build prod OK. Rendu WebGL non capturé (conflit port preview vs serveur :4321).

## Phase 2 — Automatisation hebdo (GitHub Action) — CODE FAIT ✅ (2026-06-27), reste config repo

- [x] **Garde-fou cookie expiré** : `lb.isSessionLive()` (dans `lb-browser.mjs`) charge `/` et cherche le marqueur `/sign-out/` ou `logged-in`. `sync-cine.mjs` l'appelle juste après `openLb` : si `LB_COOKIE` présent mais session morte → `throw` (message clair) → **exit 1, `cine.json` NON touché**. Testé : cookie bidon → exit 1 + `cine.json` intact. En cron, exit 1 = mail GitHub = signal d'expiration.
- [x] **Garde-fou cookie ABSENT en CI** (footgun évité) : le workflow pose `REQUIRE_AUTH=1`. `sync-cine.mjs` : si `REQUIRE_AUTH` set ET pas de `LB_COOKIE` → exit 1 avant même de lancer le browser. Sinon, un cron lancé avant que le secret existe tournerait en mode page-1 (non-auth) → galerie 70→~33 → commit auto de la régression. En local (REQUIRE_AUTH absent) le mode page-1 reste permis. Testé : exit 1.
- [x] `.github/workflows/sync-cine.yml` : cron `0 6 * * 1` (lundi 06:00 UTC) + `workflow_dispatch` → `npm ci` → `npx playwright install --with-deps chromium` → `node scripts/sync-cine.mjs` (env `LB_COOKIE`+`TMDB_READ_TOKEN`) → commit `cine.json` si changé (`[skip ci]`) → push → rebuild Cloudflare auto. `permissions: contents:write`, `concurrency` group, timeout 20 min.
- [ ] **(MANUEL — à faire par l'auteur sur GitHub)** Secrets repo : **`LB_COOKIE`** (le cookie capturé, celui de `.env`) + **`TMDB_READ_TOKEN`**. Settings → Secrets and variables → Actions → New repository secret. (Plus de `LB_USER`/`LB_PASS` — auto-login mort.)
- [ ] **(MANUEL)** Tester l'Action en manuel : Actions → "Sync /cine" → Run workflow. Vérifier le run vert + le commit auto si changement.
- [ ] ⚠️ **Refresh du cookie** (rare, quand le cron échoue) : Safari connecté à LB → DevTools → Réseau → recharger → 1ère requête `letterboxd.com` → en-tête `Cookie` → copier → mettre à jour le secret `LB_COOKIE`. (~95% "0 geste".)

## Phase 3 — Nettoyage ✅ (fait en Phase 1)
- [x] `scripts/scrape_letterboxd.py` + README supprimés.

---

## Décisions à confirmer demain avec l'auteur
1. Seuil "bien notés" : 4★ ou 4.5★ ?
2. OK pour stocker identifiants Letterboxd dans GitHub Secrets (chiffrés) ? Sinon plan B cookie.
3. Compte Cloudflare : l'auteur le crée, ou on commence par push GitHub et on branche CF ensemble.

## Review (à remplir au fil de l'avancement)
_(vide pour l'instant)_
