// Sync /cine data: scrape rafraf30's Letterboxd lists -> resolve TMDB ids ->
// pull real film frames (backdrops) -> write src/data/cine.json (build-time).
// Run: node --env-file=.env scripts/sync-cine.mjs

import { writeFile } from 'node:fs/promises';
import { openLb } from './lb-browser.mjs';

const USER = 'rafraf30';
const TOKEN = process.env.TMDB_READ_TOKEN;
const MIN_STARS = 4; // include films rated >= this (in addition to the lists)
const IMG = (size, path) => `https://image.tmdb.org/t/p/${size}${path}`;

if (!TOKEN) {
  console.error('Missing TMDB_READ_TOKEN (run with: node --env-file=.env ...)');
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// All Letterboxd requests go through a shared stealth browser (see lb-browser.mjs)
// — plain fetch gets randomly Cloudflare-challenged. Set in main().
let lb = null;
async function lbGet(path) {
  await sleep(280); // be gentle with Letterboxd
  return lb.get(path);
}

async function tmdb(path) {
  const res = await fetch(`https://api.themoviedb.org/3${path}`, {
    headers: { Authorization: `Bearer ${TOKEN}`, accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`TMDB ${res.status} on ${path}`);
  return res.json();
}

// --- Letterboxd ---------------------------------------------------------------

async function getLists() {
  const html = await lbGet(`/${USER}/lists/`);
  const slugs = [...new Set([...html.matchAll(new RegExp(`/${USER}/list/([a-z0-9-]+)/`, 'g'))].map((m) => m[1]))];
  return slugs;
}

function parseFilmSlugs(html) {
  return [...html.matchAll(/data-target-link="\/film\/([a-z0-9-]+)\/"/g)].map((m) => m[1]);
}

async function getList(slug) {
  const films = [];
  let name = slug;
  for (let page = 1; page <= 10; page++) {
    const html = await lbGet(`/${USER}/list/${slug}/${page > 1 ? `page/${page}/` : ''}`);
    if (page === 1) {
      const t = html.match(/<meta property="og:title" content="([^"]+)"/);
      if (t) name = t[1].replace(/&#039;/g, "'").replace(/&amp;/g, '&').trim();
    }
    const slugs = parseFilmSlugs(html);
    if (!slugs.length) break;
    for (const s of slugs) if (!films.includes(s)) films.push(s);
    if (slugs.length < 12) break; // last page (lists paginate ~100/page)
  }
  return { slug, name, films };
}

async function getTmdb(filmSlug) {
  const html = await lbGet(`/film/${filmSlug}/`);
  const id = html.match(/data-tmdb-id="(\d+)"/)?.[1];
  const type = html.match(/data-tmdb-type="([a-z]+)"/)?.[1] || 'movie';
  return id ? { id, type } : null;
}

// Ratings live in the /films/ HTML as rated-N (/10 scale). Cloudflare hard-blocks
// the plain /films/page/N/ path (403 "Just a moment…"), but the rating-sorted view
// /films/by/entry-rating/page/N/ pages cleanly when authenticated — so we walk that
// (films ordered high→low rating, with rated-N inline). Unauthenticated, only the
// first page of /films/ (~72 recent films) is reachable.
async function getRatings(authed) {
  const ratings = new Map(); // slug -> stars (0.5..5)
  const linkRe = new RegExp(`/${USER}/film/([a-z0-9-]+)/`);
  const base = authed ? `/${USER}/films/by/entry-rating/` : `/${USER}/films/`;
  for (let page = 1; page <= 40; page++) {
    let html;
    try {
      html = await lbGet(`${base}${page > 1 ? `page/${page}/` : ''}`);
    } catch {
      break; // blocked/last page — stop gracefully
    }
    const segs = html.split('poster-viewingdata').slice(1);
    let found = 0;
    for (const s of segs) {
      const slug = s.match(linkRe)?.[1];
      if (!slug) continue;
      found++;
      const r = s.match(/rated-(\d+)/)?.[1];
      if (r) ratings.set(slug, +r / 2);
    }
    if (found < 20) break; // short page = last page (full pages hold ~72)
    if (!authed) break; // only page 1 is reachable without a session cookie
  }
  return ratings;
}

// --- TMDB ---------------------------------------------------------------------

// TMDB doesn't tag "real film still" vs "promotional key art" — both live under
// backdrops. Heuristic: key art is heavily up-voted and rendered at standard 16:9
// sizes; real screencaps have few votes and atypical native resolutions. Score to
// prefer the latter while keeping a light quality floor.
const STD_SIZES = [[3840, 2160], [1920, 1080], [2560, 1440], [1280, 720]];
const isStdSize = (b) => STD_SIZES.some(([w, h]) => b.width === w && b.height === h);

// Store ALL quality frames (not just the top 4): the gallery rotates which one it
// shows by date (every 2 days, client-side — see CineSpace.jsx), so more frames =
// longer before a film repeats. Cap to keep cine.json lean; films with fewer good
// backdrops simply store fewer (that's all TMDB has for them).
const MAX_FRAMES = 16;

function pickFrames(backdrops) {
  const pool = backdrops.filter((b) => b.iso_639_1 === null && b.width >= 1280);
  const src = pool.length ? pool : backdrops.filter((b) => b.iso_639_1 === null);
  const score = (b) =>
    (isStdSize(b) ? 0 : 2) // atypical resolution → likely a real screencap
    - Math.min(b.vote_count, 20) * 0.15 // many votes → curated promo/key art
    + Math.min(b.vote_average, 6) * 0.3 // light quality preference, capped
    + Math.random() * 0.4; // tie-break variety
  return src
    .map((b) => ({ b, s: score(b) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, MAX_FRAMES)
    .map(({ b }) => ({
      url: IMG('w1280', b.file_path),
      full: IMG('original', b.file_path),
      w: b.width,
      h: b.height,
      aspect: +b.aspect_ratio.toFixed(3),
    }));
}

async function enrich(tmdbId, type) {
  const detail = await tmdb(`/${type}/${tmdbId}?language=en-US`);
  const imgs = await tmdb(`/${type}/${tmdbId}/images`);
  const title = detail.title || detail.name;
  const date = detail.release_date || detail.first_air_date || '';
  return {
    tmdbId: String(tmdbId),
    title,
    year: date ? +date.slice(0, 4) : null,
    poster: detail.poster_path ? IMG('w500', detail.poster_path) : null,
    runtime: detail.runtime || null,
    director: null, // filled below via credits if movie
    frames: pickFrames(imgs.backdrops || []),
  };
}

// --- main ---------------------------------------------------------------------

async function main() {
  // Open the shared stealth browser. With LB_COOKIE (a session captured from a real
  // browser via scripts/lb-capture-cookie.mjs, or pasted manually) we're authenticated
  // and can page through all rated films. Auto-login is impossible: Letterboxd sign-in
  // is behind Cloudflare Turnstile, which blocks every automated browser (proven:
  // headless, headed, and stealth all fail at submit). Browsing with an injected
  // cookie never triggers Turnstile, so the cron scrapes unattended.
  const cookie = process.env.LB_COOKIE;

  // The cron sets REQUIRE_AUTH=1: there we must NEVER run unauthenticated, because
  // no-cookie mode only sees page 1 (~33 films) and would auto-commit a shrunken
  // gallery. A missing cookie in CI = misconfigured/forgotten secret → fail loud
  // (the guard below only catches an EXPIRED cookie, not an absent one). Locally,
  // REQUIRE_AUTH is unset, so page-1 dev runs without a cookie still work.
  if (process.env.REQUIRE_AUTH && !cookie) {
    throw new Error(
      'REQUIRE_AUTH is set but LB_COOKIE is empty. Set the LB_COOKIE repo secret ' +
      '(Settings → Secrets and variables → Actions) before the sync can run. ' +
      'Aborting WITHOUT touching src/data/cine.json.'
    );
  }

  lb = await openLb(cookie);
  console.log(`Browser ready ${cookie ? '(authenticated via LB_COOKIE)' : '(no cookie — page 1 of ratings only)'}.`);

  // Guard: a cookie that's present but expired loads pages logged-out (200, but
  // ~72 recent films only) → the gallery would silently shrink. When a cookie is
  // supplied we REQUIRE a live session; otherwise fail hard and leave cine.json
  // untouched. In the weekly cron, this non-zero exit is the cookie-expired signal
  // (GitHub emails the failure → time to refresh LB_COOKIE).
  if (cookie) {
    const live = await lb.isSessionLive();
    if (!live) {
      throw new Error(
        'LB_COOKIE is set but the Letterboxd session is no longer logged in (expired). ' +
        'Refresh it: in Safari logged into Letterboxd → DevTools → Network → reload → ' +
        'first letterboxd.com request → copy the Cookie header → update the LB_COOKIE ' +
        'secret. Aborting WITHOUT touching src/data/cine.json.'
      );
    }
    console.log('Session verified live (logged in).');
  }

  console.log(`\nScraping lists for @${USER} ...`);
  const listSlugs = await getLists();
  const lists = [];
  for (const slug of listSlugs) {
    const l = await getList(slug);
    if (l.slug === 'la-lynchance') l.films = l.films.slice(0, 5); // keep top 5 only
    console.log(`  · ${l.name} (${slug}) — ${l.films.length} films`);
    lists.push(l);
  }

  // unique films + which lists they belong to (with rank)
  const filmMap = new Map();
  for (const l of lists) {
    l.films.forEach((slug, i) => {
      if (!filmMap.has(slug)) filmMap.set(slug, { slug, lists: [] });
      filmMap.get(slug).lists.push({ list: l.slug, name: l.name, rank: i + 1 });
    });
  }

  // add highly-rated films (and tag every film with its rating if known)
  console.log(`\nScraping ratings ${lb.authed ? '(authenticated, all pages by rating)' : '(page 1 only — no cookie)'} ...`);
  const ratings = await getRatings(lb.authed);
  let added = 0;
  for (const [slug, stars] of ratings) {
    if (stars >= MIN_STARS && !filmMap.has(slug)) { filmMap.set(slug, { slug, lists: [] }); added++; }
  }
  for (const [slug, f] of filmMap) if (ratings.has(slug)) f.rating = ratings.get(slug);
  console.log(`  ${ratings.size} rated films found, ${added} added at >= ${MIN_STARS}★`);

  console.log(`\n${filmMap.size} unique films -> resolving TMDB + frames ...`);

  const films = [];
  for (const f of filmMap.values()) {
    try {
      const ref = await getTmdb(f.slug);
      if (!ref) { console.warn(`  ! no tmdb id: ${f.slug}`); continue; }
      const data = await enrich(ref.id, ref.type);
      if (!data.frames.length) console.warn(`  ! no frames: ${f.slug}`);
      films.push({ slug: f.slug, rating: f.rating ?? null, lists: f.lists, letterboxd: `https://letterboxd.com/film/${f.slug}/`, ...data });
      console.log(`  ✓ ${data.title} (${data.year})${f.rating ? ` ${f.rating}★` : ''} — ${data.frames.length} frames`);
    } catch (e) {
      console.warn(`  ! ${f.slug}: ${e.message}`);
    }
  }

  const out = {
    user: USER,
    generatedAt: new Date().toISOString(),
    lists: lists.map(({ slug, name, films }) => ({ slug, name, count: films.length })),
    films,
  };
  await writeFile('src/data/cine.json', JSON.stringify(out, null, 2));
  console.log(`\nWrote src/data/cine.json — ${films.length} films, ${films.reduce((n, f) => n + f.frames.length, 0)} frames.`);
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => lb?.close());
