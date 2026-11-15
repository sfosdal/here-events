// The map site's sitemaps, written by both cities-static.mjs (after a change to cities.json) and digest.mjs
// (daily, in the publish workflow). lastmod is the truth: today for the home page and the city sitemaps, which
// are rebuilt every day; each other page's own <time datetime> (privacy/, changelog/).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const PAGES = ['privacy/', 'changelog/'];
const pageDate = (html) => (html.match(/<time datetime="(\d{4}-\d\d-\d\d)"/) || [])[1] || '';

export function writeSitemaps(site, cities, today = new Date().toISOString().slice(0, 10)) {
  const live = cities.filter((c) => c.live);
  const maps = ['https://here.events/sitemap.xml'].concat(live.map((c) => `${c.url || `https://${c.key}.here.events/`}sitemap.xml`));
  writeFileSync(join(site, 'sitemap-index.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${maps.map((m) => `  <sitemap><loc>${m}</loc><lastmod>${today}</lastmod></sitemap>`).join('\n')}\n</sitemapindex>\n`);
  const urls = [`  <url><loc>https://here.events/</loc><lastmod>${today}</lastmod><changefreq>daily</changefreq></url>`];
  for (const p of PAGES) {
    const f = join(site, p, 'index.html');
    if (!existsSync(f)) continue;
    const d = pageDate(readFileSync(f, 'utf8'));
    urls.push(`  <url><loc>https://here.events/${p}</loc>${d ? `<lastmod>${d}</lastmod>` : ''}<changefreq>monthly</changefreq></url>`);
  }
  writeFileSync(join(site, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`);
  return { maps: maps.length, pages: urls.length };
}
