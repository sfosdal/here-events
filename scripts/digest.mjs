// Writes the "What's on, city by city" section of site/index.html: every live site's
// upcoming-event and venue counts and its next few events, read from each site's
// events.json. Run daily by the publish workflow and before committing:
//   node scripts/digest.mjs
// A site whose feed fails keeps its last numbers (scripts/digest-cache.json).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeSitemaps } from './sitemaps.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const site = join(root, 'site');
const cachePath = join(root, 'scripts', 'digest-cache.json');
const HIGHLIGHTS = 3;

const STATES = { AK: 'Alaska', CA: 'California', CO: 'Colorado', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', IL: 'Illinois', LA: 'Louisiana', MA: 'Massachusetts', MO: 'Missouri', NE: 'Nebraska', NV: 'Nevada', NY: 'New York', OR: 'Oregon', PR: 'Puerto Rico', QR: 'Quintana Roo, Mexico', TN: 'Tennessee', TX: 'Texas', WA: 'Washington', WI: 'Wisconsin' };
const ACTIVITIES = [
  { key: 'tango', name: 'Tango', url: 'https://tango.here.events/', tz: 'Pacific/Honolulu', note: 'Milongas, prácticas, festivals and Buenos Aires tours across the US and Canada' },
  { key: 'curling', name: 'Curling', url: 'https://curling.events/', tz: 'Pacific/Honolulu', note: 'Bonspiels, championships and the Grand Slam, from the clubs to the worlds' },
];

const decode = (s) => String(s).replace(/&amp;/g, '&').replace(/&#0?39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const esc = (s) => decode(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const num = (n) => n.toLocaleString('en-US');
const todayIn = (tz) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const dayLabel = (d) => new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' });
const clock = (t) => (t || '').slice(0, 5) || '99:99';

const { cities } = JSON.parse(readFileSync(join(site, 'cities.json'), 'utf8'));
const live = cities.filter((c) => c.live).map((c) => ({ ...c, url: c.url || `https://${c.key}.here.events/` }));
const cache = existsSync(cachePath) ? JSON.parse(readFileSync(cachePath, 'utf8')) : {};

async function read(s) {
  try {
    const r = await fetch(s.url + 'events.json', { signal: AbortSignal.timeout(45000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const { events } = await r.json();
    if (!Array.isArray(events) || !events.length) throw new Error('no events');
    const today = todayIn(s.tz || 'America/Los_Angeles');
    const up = events.filter((e) => e.date && e.date >= today && e.title && e.venue)
      .sort((a, b) => a.date.localeCompare(b.date) || clock(a.time).localeCompare(clock(b.time)));
    if (!up.length) throw new Error('no upcoming events');
    const seen = new Set(), next = [];
    for (const e of up) {
      if (seen.has(e.venue)) continue;
      seen.add(e.venue);
      next.push({ date: e.date, title: decode(e.title).replace(/\s+[—–-]\s+[^—–-]+,\s*[A-Z]{2}$/, ''), venue: decode(e.place || e.venue) });
      if (next.length === HIGHLIGHTS) break;
    }
    const keys = up.map((e) => `${e.date}|${clock(e.time)}|${decode(e.venue)}|${decode(e.title)}`);
    return { ok: true, upcoming: up.length, venues: new Set(up.map((e) => e.venue)).size, next, keys };
  } catch (err) {
    console.warn(`${s.key}: ${err.message} — keeping the last numbers`);
    return { ok: false, ...(cache[s.key] || { upcoming: 0, venues: 0, next: [] }), keys: [] };
  }
}

const all = [...live, ...ACTIVITIES];
const got = Object.fromEntries(await Promise.all(all.map(async (s) => [s.key, await read(s)])));
const fresh = Object.values(got).filter((g) => g.ok).length;
if (!fresh) throw new Error('no site answered; index.html left as it was');

const placeKeys = new Set(live.flatMap((c) => got[c.key].keys));
const placeVenues = new Set([...placeKeys].map((k) => k.split('|')[2]));
const failed = live.filter((c) => !got[c.key].ok);
const placeTotal = placeKeys.size + failed.reduce((n, c) => n + got[c.key].upcoming, 0);
const venueTotal = placeVenues.size + failed.reduce((n, c) => n + got[c.key].venues, 0);
const updated = new Date().toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles', month: 'long', day: 'numeric', year: 'numeric' });

const card = (s, sub) => {
  const g = got[s.key];
  const list = g.next.map((e) => `<li><time datetime="${e.date}">${dayLabel(e.date)}</time><p>${esc(e.title)} <span>${s.note ? 'in' : 'at'} ${esc(e.venue)}</span></p></li>`).join('');
  return `          <article class="digest-site"><h4><a href="${esc(s.url)}">${esc(s.name)}</a>${sub ? `<small>${esc(sub)}</small>` : ''}</h4>` +
    `<p class="digest-count">${num(g.upcoming)} upcoming event${g.upcoming === 1 ? '' : 's'}${s.note ? '' : ` at ${num(g.venues)} venue${g.venues === 1 ? '' : 's'}`}</p>` +
    (s.note ? `<p class="digest-note">${esc(s.note)}</p>` : '') +
    (list ? `<ul>${list}</ul>` : '') + `</article>`;
};

const byState = {};
live.forEach((c) => (byState[STATES[c.state] || c.state] ||= []).push(c));
const groups = Object.keys(byState).sort().map((st) => `        <section class="digest-group"><h3>${esc(st)}</h3>\n` +
  byState[st].sort((a, b) => a.name.localeCompare(b.name)).map((c) => card(c, c.city && !c.name.includes(c.city) ? c.city : '')).join('\n') +
  `\n        </section>`).join('\n');

const section = `<section id="digest" class="digest" aria-labelledby="digestTitle">
  <div class="digest-inner">
    <h2 id="digestTitle">What's on, city by city</h2>
    <p class="digest-lede">here.events lists what's on at the arenas, stadiums, theatres, clubs and music venues of ${live.length} cities and neighbourhoods, with the home teams' schedules beside them. Every site is rebuilt each day from the venues' own calendars, the ticket sellers and the leagues' schedules, and each has a list and a month view, a calendar feed for your phone and a widget to embed on your own site. There is nothing to sign up for.</p>
    <p class="digest-lede">Right now: <strong>${num(placeTotal)} upcoming events at ${num(venueTotal)} venues</strong>. Updated ${updated}.</p>
    <div class="digest-groups">
${groups}
        <section class="digest-group digest-activity"><h3>By Activity</h3>
${ACTIVITIES.map((a) => card(a, a.url.replace(/^https:\/\/|\/$/g, ''))).join('\n')}
        </section>
    </div>
    <p class="digest-links"><a href="https://seattle.here.events/about.html">About here.events</a> <a href="https://seattle.here.events/faq.html">FAQ</a> <a href="https://seattle.here.events/how.html">How It’s Made</a> <a href="changelog/">Changelog</a> <a href="privacy/">Privacy</a> <a href="mailto:hello@here.events">Contact</a></p>
  </div>
</section>`;

const htmlPath = join(site, 'index.html');
const html = readFileSync(htmlPath, 'utf8');
const re = /<section id="digest" class="digest"[\s\S]*?\n<\/section>/;
if (!re.test(html)) throw new Error('index.html has no <section id="digest">');
writeFileSync(htmlPath, html.replace(re, section));

writeSitemaps(site, cities);

const nextCache = Object.fromEntries(all.map((s) => { const { ok, keys, ...keep } = got[s.key]; return [s.key, keep]; }));
writeFileSync(cachePath, JSON.stringify(nextCache, null, 1) + '\n');
console.log(`digest: ${fresh}/${all.length} sites read, ${num(placeTotal)} upcoming events at ${num(venueTotal)} venues`);
