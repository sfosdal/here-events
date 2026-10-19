// Writes what Google needs to find every city from here.events without running
// JavaScript (Steve, 2026-10-18: "I want google to index here.events and its
// cities / neighborhoods … the new top priority"):
//   site/index.html        — the <ul id="cityList"> rows as static HTML (map.js
//                            rebuilds the same list at runtime, so nothing changes
//                            on screen; the HTML now carries one real <a> per city)
//   site/sitemap-index.xml — a sitemap index naming the map's sitemap and every
//                            live city's, one submission in Search Console for all
//                            (the Domain property sc-domain:here.events owns every host)
//   site/sitemap.xml       — the map's own sitemap, lastmod = today (Google reads lastmod to decide recrawls)
//   site/robots.txt        — names both sitemaps
// All from site/cities.json, the one place a city is added. Run after any change
// to it, before committing: node scripts/cities-static.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const site = join(dirname(fileURLToPath(import.meta.url)), '..', 'site');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const url = (c) => c.url || `https://${c.key}.here.events/`;
const { cities } = JSON.parse(readFileSync(join(site, 'cities.json'), 'utf8'));

// the list under the map, state by state, as map.js builds it
const byState = {};
cities.forEach((c) => (byState[c.state] = byState[c.state] || []).push(c));
const rows = Object.keys(byState).sort().flatMap((st) => byState[st].sort((a, b) => a.name.localeCompare(b.name)).map((c) =>
  `      <li class="${c.live ? 'is-live' : 'is-soon'}"><span class="st">${esc(c.state)}</span><a href="${esc(url(c))}">${esc(c.name)}</a><span class="note">${c.live ? esc(url(c).replace(/^https:\/\/|\/$/g, '')) : 'coming soon'}</span></li>`));
const html = readFileSync(join(site, 'index.html'), 'utf8');
const re = /(<ul id="cityList" class="city-list">)[\s\S]*?(<\/ul>)/;
if (!re.test(html)) throw new Error('index.html has no <ul id="cityList">');
writeFileSync(join(site, 'index.html'), html.replace(re, `$1\n${rows.join('\n')}\n    $2`));

// the sitemap index: the map's own sitemap, then every live city's
const live = cities.filter((c) => c.live);
const today = new Date().toISOString().slice(0, 10);
const maps = ['https://here.events/sitemap.xml'].concat(live.map((c) => `${url(c)}sitemap.xml`));
writeFileSync(join(site, 'sitemap-index.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${maps.map((m) => `  <sitemap><loc>${m}</loc><lastmod>${today}</lastmod></sitemap>`).join('\n')}\n</sitemapindex>\n`);
writeFileSync(join(site, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>https://here.events/</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq></url>\n</urlset>\n`);
writeFileSync(join(site, 'robots.txt'), 'User-agent: *\nAllow: /\n\nSitemap: https://here.events/sitemap.xml\nSitemap: https://here.events/sitemap-index.xml\n');
console.log(`cities-static: ${cities.length} cities in the list (${live.length} live), sitemap-index.xml ${maps.length} sitemaps, robots.txt`);
