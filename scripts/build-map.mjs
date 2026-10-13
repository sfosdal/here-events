// Builds site/us-outline.json: the United States outline (lower 48, with
// Alaska, Hawaii and Puerto Rico as insets packed into the bottom-left corner),
// the state boundaries, the big lakes, and the neighbouring land (Canada,
// Mexico, Cuba, the Bahamas, whatever falls inside the frame) at half tone,
// projected Albers-USA style from Natural Earth's 1:50m files (public domain;
// 1:50m since 2026-10-12 so the map survives zooming — Steve: "the base maps
// at here.events should support zooming and boundaries"; neighbours + Puerto
// Rico + the insets bottom-left, Steve 2026-10-13: "show canada and mexico,
// cube, etc, anything that would fit into the map but grey them out half
// compared to US; include puetro rico too", "this should be bottom left
// justified").
// Run: node scripts/build-map.mjs
// The projection maths is written out here and again in site/map.js, which
// places the city dots with the same function; the inset translations and the
// inset box are computed here and read by map.js from the JSON (`insets`), so
// only the conic constants are duplicated.
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
const lakes = await load('ne_50m_lakes');
const adminOf = (f) => f.properties.ADMIN || f.properties.NAME;
const us = countries.features.find((f) => adminOf(f) === 'United States of America');
if (!us) throw new Error('United States not found in the countries file');
const pr = countries.features.find((f) => adminOf(f) === 'Puerto Rico');
if (!pr) throw new Error('Puerto Rico not found in the countries file');
const usStates = states.features.filter((f) => f.properties.adm0_a3 === 'USA' || f.properties.iso_a2 === 'US');
if (usStates.length !== 51) throw new Error(`expected 51 states + DC, found ${usStates.length}`);
const polysOf = (f) => f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : [f.geometry.coordinates];

// ---- Albers USA (the same numbers as d3-geo's albersUsa, reimplemented) ----
const W = 960, H = 600, K = 1070, TX = W / 2, TY = H / 2 - 20; // the lower 48 sit 20px above centre; the insets pack into the bottom-left corner
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
// the western Aleutians (Attu, Kiska, …) lie east of 180° in this file; under the 154° rotation a positive longitude folds
// to the far side of the cone and the islands landed in the Pacific off California (Steve, 2026-10-13: "what are these") —
// every longitude is normalised to the western hemisphere's continuation first
const west = (lon) => lon > 0 ? lon - 360 : lon;
const lower48 = make(29.5, 45.5, 96, [-0.6, 38.7], K, TX, TY);
const alaska0 = make(55, 65, 154, [-2, 58.5], K * 0.35, 0, 0);
const hawaii0 = make(8, 18, 157, [-3, 19.9], K, 0, 0);
const pr0 = make(17, 19, 66.5, [0, 18.2], K, 0, 0);
const region = (lon, lat) => lat > 50 ? 'alaska' : lat < 23 && lon < -140 ? 'hawaii' : lat < 20 && lon > -70 && lon < -64 ? 'pr' : 'lower48';

// ---- the insets, bottom-left justified: each is projected at origin, measured, then translated so it sits on the frame's
// bottom edge, Alaska against the left edge, Hawaii and Puerto Rico in a row beside it; the inset box is the dashed L ----
const PAD = 10, GAP = 14, BOTTOM = H - PAD; // the box must stop short of Texas (its Rio Grande corner sits at x≈417)
function bbox(polys, proj) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const poly of polys) for (const ring of poly) for (const [lon, lat] of ring) { const [x, y] = proj(west(lon), lat); if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return { x0, y0, x1, y1 };
}
const usPolys = polysOf(us);
const ringsIn = (polys, reg) => polys.filter((poly) => region(poly[0][0][0], poly[0][0][1]) === reg);
const akBox = bbox(ringsIn(usPolys, 'alaska'), alaska0);
const akT = [PAD - akBox.x0, BOTTOM - akBox.y1];
const hiBox = bbox(ringsIn(usPolys, 'hawaii'), hawaii0);
const hiT = [akBox.x1 + akT[0] + GAP - hiBox.x0, BOTTOM - hiBox.y1];
const prBox = bbox(polysOf(pr), pr0);
const prT = [hiBox.x1 + hiT[0] + GAP + 4 - prBox.x0, BOTTOM - prBox.y1];
const r1 = (v) => +v.toFixed(1);
const insets = {
  alaska: akT.map(r1), hawaii: hiT.map(r1), pr: prT.map(r1),
  box: { x: 0, y: r1(akBox.y0 + akT[1] - 14), w: r1(prBox.x1 + prT[0] + 8), h: H }, // the dashed L runs along y and down x
};
const alaska = (lon, lat) => { const p = alaska0(west(lon), lat); return [p[0] + akT[0], p[1] + akT[1]]; };
const hawaii = (lon, lat) => { const p = hawaii0(lon, lat); return [p[0] + hiT[0], p[1] + hiT[1]]; };
const prico = (lon, lat) => { const p = pr0(lon, lat); return [p[0] + prT[0], p[1] + prT[1]]; };
const PROJ = { lower48, alaska, hawaii, pr: prico };
export function project(lon, lat) { return PROJ[region(lon, lat)](lon, lat); }

// ---- the outline: one path per region, rings joined ----
const toPath = (pts) => pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('') + 'Z';
function ringPath(ring, reg) {
  reg = reg || region(ring[0][0], ring[0][1]);
  return { reg, d: toPath(ring.map(([lon, lat]) => PROJ[reg](lon, lat))) };
}
const paths = { lower48: [], alaska: [], hawaii: [], pr: [] };
for (const poly of usPolys) for (const ring of poly) { const r = ringPath(ring); paths[r.reg].push(r.d); }
for (const poly of polysOf(pr)) for (const ring of poly) paths.pr.push(ringPath(ring, 'pr').d);
// ---- the state boundaries: one stroke-only path, every state's rings; shared borders are drawn twice, which a thin line hides ----
const stateRings = [];
for (const f of usStates) for (const poly of polysOf(f)) for (const ring of poly) stateRings.push(ringPath(ring).d);
// ---- the big lakes: Natural Earth's countries and states carry the Great Lakes as land (the border runs mid-lake), so the
// map drew Lake Michigan as Michigan (Steve, 2026-10-13: "the great lakes are missing boundaries, they look bad") — the lakes
// are drawn as water over the land and the borders, shoreline stroked, from the 1:50m lakes file, the ones an atlas shows at this size
const BIG_LAKES = new Set(['Lake Superior', 'Lake Michigan', 'Lake Huron', 'Lake Erie', 'Lake Ontario', 'Lake Saint Clair', 'Great Salt Lake', 'Lake Okeechobee']);
const lakeRings = [];
for (const f of lakes.features) {
  if (!BIG_LAKES.has(f.properties.name)) continue;
  for (const poly of polysOf(f)) for (const ring of poly) lakeRings.push(ringPath(ring).d);
}
if (lakeRings.length < BIG_LAKES.size) throw new Error(`expected ${BIG_LAKES.size} lakes, found ${lakeRings.length} rings`);

// ---- the neighbours: every other country's rings, clipped first in degrees to the window each projection draws sanely
// (a conic projection throws far-away land anywhere, so the clip comes before the projection), then by the frame in
// map.js. Two layers: around the lower 48 (everything from Canada to Panama and the Caribbean), and inside the Alaska
// inset (Yukon, British Columbia, Chukotka) so the inset reads as a place, not a cut-out. ----
function clipRing(ring, b) { // Sutherland–Hodgman against [x0,x1]×[y0,y1] in degrees
  const edges = [[0, b.x0, 1], [0, b.x1, -1], [1, b.y0, 1], [1, b.y1, -1]];
  let out = ring;
  for (const [k, v, s] of edges) {
    const inp = out; out = [];
    if (!inp.length) break;
    const inside = (p) => (p[k] - v) * s >= 0;
    const cross = (a, c) => { const t = (v - a[k]) / (c[k] - a[k]); return k ? [a[0] + t * (c[0] - a[0]), v] : [v, a[1] + t * (c[1] - a[1])]; };
    for (let i = 0; i < inp.length; i++) {
      const cur = inp[i], prev = inp[(i + inp.length - 1) % inp.length], ci = inside(cur), pi = inside(prev);
      if (ci) { if (!pi) out.push(cross(prev, cur)); out.push(cur); } else if (pi) out.push(cross(prev, cur));
    }
  }
  if (out.length < 3) return null;
  // a ring that leaves the window and comes back is sewn along the window's edge; that seam is a straight chord in degrees
  // but an arc once projected, and a chord drawn straight cut across the Alaska inset as a stripe — the seams are densified
  // so they follow the window's edge, where the second clip (in map units) removes them
  const dense = [];
  for (let i = 0; i < out.length; i++) {
    const a = out[i], c = out[(i + 1) % out.length];
    dense.push(a);
    for (const k of [0, 1]) if (a[k] === c[k] && (a[k] === b[k ? 'y0' : 'x0'] || a[k] === b[k ? 'y1' : 'x1'])) {
      const n = Math.ceil(Math.abs(c[1 - k] - a[1 - k]) / 0.5);
      for (let j = 1; j < n; j++) { const q = [0, 0]; q[k] = a[k]; q[1 - k] = a[1 - k] + (c[1 - k] - a[1 - k]) * j / n; dense.push(q); }
    }
  }
  return dense;
}
const FAR48 = { x0: -170, x1: -50, y0: 5, y1: 75 }, FARAK = { x0: -215, x1: -60, y0: 30, y1: 84 };
const FRAME = { x0: -4, x1: W + 4, y0: -4, y1: H + 4 }, BOXR = { x0: -4, x1: insets.box.w + 4, y0: insets.box.y - 4, y1: H + 4 };
// the degree window's four edges must project OUTSIDE the box they feed: a seam that crossed inside drew as a band over the
// Alaska inset (a parallel sags at the sides of a conic; lat 78° dipped to y≈506 at Hudson Bay). Checked, not assumed.
function assertOutside(win, proj, box, label) {
  const edges = [];
  for (let t = 0; t <= 1; t += 0.002) {
    edges.push([win.x0, win.y0 + (win.y1 - win.y0) * t], [win.x1, win.y0 + (win.y1 - win.y0) * t], [win.x0 + (win.x1 - win.x0) * t, win.y0], [win.x0 + (win.x1 - win.x0) * t, win.y1]);
  }
  for (const [lon, lat] of edges) {
    const [x, y] = proj(lon, lat);
    if (x > box.x0 && x < box.x1 && y > box.y0 && y < box.y1) throw new Error(`${label}: the window edge at ${lon.toFixed(1)},${lat.toFixed(1)} projects inside the box (${x.toFixed(0)},${y.toFixed(0)}) — widen the window`);
  }
}
assertOutside(FAR48, lower48, FRAME, 'FAR48');
assertOutside(FARAK, alaska, BOXR, 'FARAK');
// Sutherland–Hodgman joins the pieces of a clipped ring with zero-width seams along the window's edges — right as a FILL
// (no area, nothing drawn) but wrong as a STROKE (a seam across Hudson Bay drew as a stripe over the Alaska inset), so the
// coastline is a second, open path: every run of consecutive points inside the window, never closed, never bridged.
function runs(ring, b, proj, frame) {
  const out = []; let run = [];
  const flush = () => { if (run.length > 1) out.push(run.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('')); run = []; };
  for (const [lon, lat] of ring) {
    const q = lon >= b.x0 && lon <= b.x1 && lat >= b.y0 && lat <= b.y1 ? proj(lon, lat) : null;
    if (q && q[0] >= frame.x0 && q[0] <= frame.x1 && q[1] >= frame.y0 && q[1] <= frame.y1) run.push(q); else flush();
  }
  flush();
  return out;
}
const far = [], farAlaska = [], farEdge = [], farAlaskaEdge = [];
for (const f of countries.features) {
  const name = adminOf(f);
  if (name === 'United States of America' || name === 'Puerto Rico') continue;
  for (const poly of polysOf(f)) for (const ring of poly) {
    const w = ring.map(([lon, lat]) => [west(lon), lat]);
    // then clipped again in map units to the frame (and the inset box), so the file carries no land that is never drawn
    const a = clipRing(ring, FAR48), pa = a && clipRing(a.map(([lon, lat]) => lower48(lon, lat)), FRAME); if (pa) far.push(toPath(pa));
    const b = clipRing(w, FARAK), pb = b && clipRing(b.map(([lon, lat]) => alaska(lon, lat)), BOXR); if (pb) farAlaska.push(toPath(pb));
    farEdge.push(...runs(ring, FAR48, lower48, FRAME));
    farAlaskaEdge.push(...runs(w, FARAK, alaska, BOXR));
  }
}
const out = {
  _: 'United States outline from Natural Earth 1:50m admin-0 countries, state boundaries from 1:50m admin-1 states and the big lakes from 1:50m lakes (public domain), projected Albers USA (conic equal-area 29.5°/45.5° for the lower 48; Alaska 55°/65° at 0.35 scale, Hawaii 8°/18° and Puerto Rico 17°/19° as insets packed into the bottom-left corner, `insets` holds their translations and the inset box). `far` is the neighbouring land around the lower 48 and `farAlaska` the land around Alaska (fills; `farEdge` / `farAlaskaEdge` their coastlines as open strokes), both drawn at half tone and clipped to the frame. Built by scripts/build-map.mjs; map.js re-implements the projection to place cities.',
  width: W, height: H, scale: K, tx: TX, ty: TY, insets,
  paths: { lower48: paths.lower48.join(''), alaska: paths.alaska.join(''), hawaii: paths.hawaii.join(''), pr: paths.pr.join(''), states: stateRings.join(''), lakes: lakeRings.join(''), far: far.join(''), farAlaska: farAlaska.join(''), farEdge: farEdge.join(''), farAlaskaEdge: farAlaskaEdge.join('') },
};
writeFileSync(join(here, '..', 'site', 'us-outline.json'), JSON.stringify(out));
console.log(`us-outline.json: lower48 ${paths.lower48.length} rings, alaska ${paths.alaska.length}, hawaii ${paths.hawaii.length}, pr ${paths.pr.length}, ${stateRings.length} state rings, ${lakeRings.length} lake rings, ${far.length} + ${farAlaska.length} neighbour rings; ${JSON.stringify(out).length} bytes`);
console.log('insets', JSON.stringify(insets), '\nalaska box', JSON.stringify(Object.fromEntries(Object.entries(akBox).map(([k, v]) => [k, r1(v + (k[0] === 'x' ? akT[0] : akT[1]))]))));
console.log('Seattle →', project(-122.335, 47.608).map((x) => x.toFixed(1)).join(','), ' Honolulu →', project(-157.858, 21.307).map((x) => x.toFixed(1)).join(','), ' Anchorage →', project(-149.9, 61.2).map((x) => x.toFixed(1)).join(','), ' San Juan →', project(-66.1, 18.47).map((x) => x.toFixed(1)).join(','), ' Attu →', project(173.2, 52.9).map((x) => x.toFixed(1)).join(','));
