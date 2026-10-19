// Writes what Google needs to find every city from here.events without running
// JavaScript (Steve, 2026-10-18: "I want google to index here.events and its
// cities / neighborhoods … the new top priority"):
//   site/index.html        — the City List pop-up's rows as static HTML, grouped by
//                            state (the pop-up is the only list; the HTML carries one
//                            real <a> per live city, closed or open)
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

// the pop-up's list, state by state, as the city sites' More Cities sheet groups it
// (lqa scripts/cities-list.mjs): a live city is a link, a coming-soon one plain text
// tagged "soon", a neighbourhood tagged with its city (Lower Queen Anne · Seattle)
const STATES = { AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming', DC: 'District of Columbia', PR: 'Puerto Rico', QR: 'Quintana Roo, Mexico' };
const stateName = (c) => STATES[c.state] || c.state;
const byState = {};
cities.forEach((c) => (byState[stateName(c)] = byState[stateName(c)] || []).push(c));
const groups = Object.keys(byState).sort().map((st) => `      <section><h3>${esc(st)}</h3><ul>\n` +
  byState[st].sort((a, b) => a.name.localeCompare(b.name)).map((c) => {
    const name = c.live ? `<a href="${esc(url(c))}">${esc(c.name)}</a>` : `<span title="Coming soon">${esc(c.name)}</span>`;
    const hood = c.city && !c.name.includes(c.city) ? `<small>${esc(c.city)}</small>` : '';
    return `        <li${c.live ? '' : ' class="is-soon"'}>${name}${hood}${c.live ? '' : '<small>soon</small>'}</li>`;
  }).join('\n') + '\n      </ul></section>');
const html = readFileSync(join(site, 'index.html'), 'utf8');
const re = /(<div id="cityGroups" class="city-groups">)[\s\S]*?(<\/div>)/;
if (!re.test(html)) throw new Error('index.html has no <div id="cityGroups">');
writeFileSync(join(site, 'index.html'), html.replace(re, `$1\n${groups.join('\n')}\n    $2`));

// the sitemap index: the map's own sitemap, then every live city's
const live = cities.filter((c) => c.live);
const today = new Date().toISOString().slice(0, 10);
const maps = ['https://here.events/sitemap.xml'].concat(live.map((c) => `${url(c)}sitemap.xml`));
writeFileSync(join(site, 'sitemap-index.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${maps.map((m) => `  <sitemap><loc>${m}</loc><lastmod>${today}</lastmod></sitemap>`).join('\n')}\n</sitemapindex>\n`);
writeFileSync(join(site, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>https://here.events/</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq></url>\n</urlset>\n`);
writeFileSync(join(site, 'robots.txt'), 'User-agent: *\nAllow: /\n\nSitemap: https://here.events/sitemap.xml\nSitemap: https://here.events/sitemap-index.xml\n');
console.log(`cities-static: ${cities.length} cities in the pop-up (${live.length} live), sitemap-index.xml ${maps.length} sitemaps, robots.txt`);
