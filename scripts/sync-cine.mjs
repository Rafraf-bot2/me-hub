// Sync /cine data: scrape rafraf30's Letterboxd lists -> resolve TMDB ids ->
// pull real film frames (backdrops) -> write src/data/cine.json (build-time).
// Run: node --env-file=.env scripts/sync-cine.mjs

import { writeFile } from 'node:fs/promises';

const USER = 'rafraf30';
const TOKEN = process.env.TMDB_READ_TOKEN;
const FRAMES_PER_FILM = 4;
const MIN_STARS = 4; // include films rated >= this (in addition to the lists)
const IMG = (size, path) => `https://image.tmdb.org/t/p/${size}${path}`;
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0 Safari/537.36';

if (!TOKEN) {
  console.error('Missing TMDB_READ_TOKEN (run with: node --env-file=.env ...)');
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function lbGet(path, cookie) {
  await sleep(280); // be gentle with Letterboxd
  const headers = { 'User-Agent': UA, Accept: 'text/html', 'Accept-Language': 'en-US,en;q=0.9' };
  if (cookie) headers.Cookie = cookie;
  const res = await fetch(`https://letterboxd.com${path}`, { headers });
  if (!res.ok) throw new Error(`LB ${res.status} on ${path}`);
  return res.text();
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

// Ratings live in the public /films/ HTML as rated-N (/10 scale). NOTE: Letterboxd
// hard-blocks deep pagination (/films/page/N/ → 403) and ?page= is ignored, so only
// the first page (~72 most recent films) is reachable without an authenticated cookie.
// Pass cookieHeader (a logged-in LB session) to unlock all pages.
async function getRatings(cookie) {
  const ratings = new Map(); // slug -> stars (0.5..5)
  const linkRe = new RegExp(`/${USER}/film/([a-z0-9-]+)/`);
  for (let page = 1; page <= 30; page++) {
    let html;
    try {
      html = await lbGet(`/${USER}/films/${page > 1 ? `page/${page}/` : ''}`, cookie);
    } catch {
      break; // 403 on deep pages when unauthenticated — stop gracefully
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
    if (found === 0) break; // past the last page
    if (!cookie) break; // only page 1 is reachable without a session cookie
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

function pickFrames(backdrops) {
  const pool = backdrops.filter((b) => b.iso_639_1 === null && b.width >= 1280);
  const src = pool.length >= FRAMES_PER_FILM ? pool : backdrops.filter((b) => b.iso_639_1 === null);
  const score = (b) =>
    (isStdSize(b) ? 0 : 2) // atypical resolution → likely a real screencap
    - Math.min(b.vote_count, 20) * 0.15 // many votes → curated promo/key art
    + Math.min(b.vote_average, 6) * 0.3 // light quality preference, capped
    + Math.random() * 0.4; // tie-break variety
  return src
    .map((b) => ({ b, s: score(b) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, FRAMES_PER_FILM)
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
  console.log(`Scraping lists for @${USER} ...`);
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
  const cookie = process.env.LB_COOKIE; // optional logged-in session → unlocks all pages
  console.log(`\nScraping ratings from /films/ ${cookie ? '(authenticated, all pages)' : '(page 1 only — no cookie)'} ...`);
  const ratings = await getRatings(cookie);
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

main().catch((e) => { console.error(e); process.exit(1); });
