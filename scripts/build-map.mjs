// Builds site/us-outline.json: the United States outline (lower 48, Alaska
// and Hawaii as insets) and the state boundaries, projected Albers-USA style,
// from Natural Earth's 1:50m admin-0 countries and admin-1 states (public
// domain; 1:50m since 2026-10-12 so the map survives zooming — Steve: "the
// base maps at here.events should support zooming and boundaries").
// Run: node scripts/build-map.mjs
// The projection maths is written out here and again in site/map.js, which
// places the city dots with the same function, so the two must stay equal.
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const cache = join(here, '..', '.cache');
const BASE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/';
async function load(name) {
  const src = join(cache, name + '.geojson');
  if (!existsSync(src)) {
    mkdirSync(cache, { recursive: true });
    const r = await fetch(BASE + name + '.geojson');
    if (!r.ok) throw new Error(`Natural Earth download failed for ${name}: HTTP ${r.status}`);
    writeFileSync(src, await r.text());
  }
  return JSON.parse(readFileSync(src, 'utf8'));
}
const countries = await load('ne_50m_admin_0_countries');
const states = await load('ne_50m_admin_1_states_provinces');
const us = countries.features.find((f) => f.properties.ADMIN === 'United States of America' || f.properties.NAME === 'United States of America');
if (!us) throw new Error('United States not found in the countries file');
const usStates = states.features.filter((f) => f.properties.adm0_a3 === 'USA' || f.properties.iso_a2 === 'US');
if (usStates.length !== 51) throw new Error(`expected 51 states + DC, found ${usStates.length}`);

// ---- Albers USA (the same numbers as d3-geo's albersUsa, reimplemented) ----
const W = 960, H = 600, K = 1070, TX = W / 2, TY = H / 2 - 20; // the lower 48 sit 20px above centre; the insets hang below-left
const rad = Math.PI / 180;
function conic(p0, p1) { // conic equal-area raw projection for standard parallels p0, p1 (degrees)
  const sy0 = Math.sin(p0 * rad), n = (sy0 + Math.sin(p1 * rad)) / 2, c = 1 + sy0 * (2 * n - sy0), r0 = Math.sqrt(c) / n;
  return (lam, phi) => { const r = Math.sqrt(c - 2 * n * Math.sin(phi)) / n; return [r * Math.sin(lam * n), r0 - r * Math.cos(lam * n)]; };
}
function make(p0, p1, rotLon, center, scale, tx, ty) {
  const raw = conic(p0, p1);
  const c = raw(center[0] * rad, center[1] * rad); // the centre is given in the rotated frame, as d3 takes it
  return (lon, lat) => { const p = raw((lon + rotLon) * rad, lat * rad); return [tx + scale * (p[0] - c[0]), ty - scale * (p[1] - c[1])]; };
}
const lower48 = make(29.5, 45.5, 96, [-0.6, 38.7], K, TX, TY);
const alaska = make(55, 65, 154, [-2, 58.5], K * 0.35, TX - 0.307 * K, TY + 0.201 * K);
const hawaii = make(8, 18, 157, [-3, 19.9], K, TX - 0.205 * K, TY + 0.212 * K);
const region = (lon, lat) => lat > 50 ? 'alaska' : lat < 23 && lon < -140 ? 'hawaii' : 'lower48';
const PROJ = { lower48, alaska, hawaii };
export function project(lon, lat) { return PROJ[region(lon, lat)](lon, lat); }

// ---- the outline: one path per region, rings joined ----
function ringPath(ring) {
  const [clon, clat] = ring[0];
  const reg = region(clon, clat);
  // Alaska's Aleutians cross the antimeridian in this file as far as 180°; points past -168 fold badly in the inset — keep them, they project fine under the 154° rotation
  const pts = ring.map(([lon, lat]) => PROJ[reg](lon, lat));
  return { reg, d: pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('') + 'Z' };
}
const paths = { lower48: [], alaska: [], hawaii: [] };
for (const poly of us.geometry.coordinates) for (const ring of poly) { const r = ringPath(ring); paths[r.reg].push(r.d); }
// ---- the state boundaries: one stroke-only path, every state's rings; shared borders are drawn twice, which a thin line hides ----
const stateRings = [];
for (const f of usStates) {
  const polys = f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : [f.geometry.coordinates];
  for (const poly of polys) for (const ring of poly) stateRings.push(ringPath(ring).d);
}
const out = {
  _: 'United States outline from Natural Earth 1:50m admin-0 countries and state boundaries from 1:50m admin-1 states (public domain), projected Albers USA (conic equal-area 29.5°/45.5° for the lower 48; Alaska 55°/65° at 0.35 scale and Hawaii 8°/18° as insets, like d3-geo albersUsa). Built by scripts/build-map.mjs; map.js re-implements the projection to place cities.',
  width: W, height: H, scale: K, tx: TX, ty: TY,
  paths: { lower48: paths.lower48.join(''), alaska: paths.alaska.join(''), hawaii: paths.hawaii.join(''), states: stateRings.join('') },
};
writeFileSync(join(here, '..', 'site', 'us-outline.json'), JSON.stringify(out));
console.log(`us-outline.json: lower48 ${paths.lower48.length} rings, alaska ${paths.alaska.length}, hawaii ${paths.hawaii.length}, ${stateRings.length} state rings; ${JSON.stringify(out).length} bytes`);
console.log('Seattle →', project(-122.335, 47.608).map((x) => x.toFixed(1)).join(','), ' Honolulu →', project(-157.858, 21.307).map((x) => x.toFixed(1)).join(','), ' Anchorage →', project(-149.9, 61.2).map((x) => x.toFixed(1)).join(','));
