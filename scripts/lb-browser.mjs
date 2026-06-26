// Shared Letterboxd fetcher backed by a real (stealth) browser.
//
// Why not plain fetch(): Letterboxd sits behind Cloudflare. A captured session
// cookie includes cf_clearance, which is bound to the originating browser's TLS
// fingerprint — Node's fetch has a different fingerprint, so Cloudflare re-issues
// challenges intermittently (random 403 "Just a moment…"). A stealth Chromium
// earns its OWN clearance and presents a consistent fingerprint, so it pages
// through reliably. We inject the captured session cookies for auth (this unlocks
// deep /films/ pagination); logging in is NOT needed, so Turnstile never fires.

import { chromium } from 'playwright-extra';
import stealth from 'puppeteer-extra-plugin-stealth';

chromium.use(stealth());

function parseCookieHeader(header) {
  return header.split('; ').filter(Boolean).map((pair) => {
    const i = pair.indexOf('=');
    return { name: pair.slice(0, i), value: pair.slice(i + 1), domain: '.letterboxd.com', path: '/', secure: true };
  });
}

// Open a session. `cookieHeader` (optional) is a logged-in LB cookie string;
// when present, `authed` is true and deep pagination is reachable.
export async function openLb(cookieHeader) {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ locale: 'en-US' });
  if (cookieHeader) await ctx.addCookies(parseCookieHeader(cookieHeader));
  const page = await ctx.newPage();

  return {
    authed: !!cookieHeader,
    async get(path) {
      const res = await page.goto(`https://letterboxd.com${path}`, { waitUntil: 'domcontentloaded' });
      const status = res ? res.status() : 0;
      if (status !== 200) throw new Error(`LB ${status} on ${path}`);
      return page.content();
    },
    async close() { await browser.close().catch(() => {}); },
  };
}
