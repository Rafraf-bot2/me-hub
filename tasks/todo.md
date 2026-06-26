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
- [ ] Cloudflare Pages → connecter le repo `Rafraf-bot2/me-hub`
      - Build command : `npm run build` · Output dir : `dist` · Framework preset : Astro
      - ⚠️ Étape manuelle dashboard Cloudflare (en cours)
- [ ] Vérifier 1er déploiement live OK (hub + /cine s'affichent)
- [ ] (Plus tard) brancher domaine perso

## Phase 1 — Scrape authentifié (récupérer tous les films bien notés)

- [ ] Ajouter Playwright : `npm i -D playwright` (+ `npx playwright install chromium`)
- [ ] Nouveau module login : Playwright ouvre Letterboxd, se connecte (`LB_USER`/`LB_PASS`), récupère les cookies de session → réutilisés pour les requêtes scrape.
      ⚠️ RISQUE À VÉRIFIER demain : captcha / 2FA au login. Si LB bloque le login headless → plan B = cookie de session manuel dans un secret (`LB_COOKIE`, déjà supporté par `sync-cine.mjs` ligne 174) à rafraîchir périodiquement.
- [ ] Réécrire `getRatings()` dans `scripts/sync-cine.mjs` pour, **une fois authentifié**, scraper les buckets `/films/rated/...` page par page (toutes pages) → liste complète des films notés + leur note exacte. Garder le scrape des listes existant. Garder l'enrichissement TMDB + `pickFrames`.
- [ ] Confirmer le seuil "bien notés" : `MIN_STARS` actuel = 4. **À valider avec l'auteur** : 4★ ou 4.5★ ? (impacte le nb de films dans la galerie)
- [ ] Run local avec identifiants → régénérer `src/data/cine.json`. Vérifier que le nb de films grimpe nettement (actuellement 33 → all-time).
- [ ] Vérifier perfs /cine avec plus de plans (espace = 1 frame/film ; bumpable mais surveiller la fluidité WebGL).

## Phase 2 — Automatisation hebdo (GitHub Action)

- [ ] Secrets GitHub repo : `LB_USER`, `LB_PASS` (ou `LB_COOKIE` selon plan B), `TMDB_READ_TOKEN`
- [ ] `.github/workflows/sync-cine.yml` :
      - cron hebdo (ex. dimanche 04:00 UTC) + `workflow_dispatch` (run manuel)
      - checkout → `npm ci` → `npx playwright install --with-deps chromium` → run `node scripts/sync-cine.mjs`
      - commit `src/data/cine.json` SI changé → push
- [ ] Le push sur main déclenche auto le rebuild Cloudflare Pages → site à jour
- [ ] Tester l'Action en manuel (`workflow_dispatch`) → vérifier commit + redeploy

## Phase 3 — Nettoyage

- [ ] Supprimer `scripts/scrape_letterboxd.py` et `scripts/README_scrape_letterboxd.txt` (obsolètes, tapent 403)

---

## Décisions à confirmer demain avec l'auteur
1. Seuil "bien notés" : 4★ ou 4.5★ ?
2. OK pour stocker identifiants Letterboxd dans GitHub Secrets (chiffrés) ? Sinon plan B cookie.
3. Compte Cloudflare : l'auteur le crée, ou on commence par push GitHub et on branche CF ensemble.

## Review (à remplir au fil de l'avancement)
_(vide pour l'instant)_
