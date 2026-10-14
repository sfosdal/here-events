// Builds site/us-outline.json (Natural Earth 1:50m) and site/us-outline-fine.json
// (1:10m, fetched by map.js once the reader zooms past 3× — Steve, 2026-10-14:
// "as you zoom in detail should improve"): the United States outline (lower 48,
// with Alaska, Hawaii and Puerto Rico as insets), the state boundaries, the big
// lakes, and the neighbouring land (Canada, Mexico, Cuba, the Bahamas, whatever
// falls inside the frame) at half tone, projected Albers-USA style.
// The frame is 1280×640 since 2026-10-14: the lower 48 sit right of centre and
// the Alaska and Hawaii boxes stack in the empty column at the left, under the
// masthead text, beside the Pacific Northwest (Steve: "both boxes should be in
// this area"); Puerto Rico, at 1.5×, floats in the open Atlantic east of the
// Carolinas ("put it here"). Before that (2026-10-13) the three insets packed
// into the bottom-left corner of a 960×640 frame.
// History: 1:50m since 2026-10-12 so the map survives zooming ("the base maps
// at here.events should support zooming and boundaries"); neighbours + Puerto
// Rico, Steve 2026-10-13: "show canada and mexico, cube, etc, anything that
// would fit into the map but grey them out half compared to US; include puetro
// rico too".
// Run: node scripts/build-map.mjs
// The projection maths is written out here and again in site/map.js, which
// places the city dots with the same function; the inset scales, translations
// and boxes are computed here and read by map.js from the JSON (`insets`), so
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
const adminOf = (f) => f.properties.ADMIN || f.properties.NAME;
const polysOf = (f) => f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : [f.geometry.coordinates];

// ---- Albers USA (the same numbers as d3-geo's albersUsa, reimplemented) ----
const W = 1280, H = 640, K = 1070, TX = 680, TY = 280; // TY as in the 960-wide frames; TX = the old 480 + 200, so the lower 48 moved right by the width of the left column
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
// of K; d3's albersUsa uses 0.35 / 1 / —. These are starting scales: each inset is measured at them and then scaled to fill
// its box less PAD on every side (Steve, 2026-10-14: "these boxes should be bigger"), the fitted scales go to the JSON
const SCALE0 = { alaska: 0.35, hawaii: 1.6, pr: 1.5 };
const PAD = 8;
const SCALE = { ...SCALE0 };
const lower48 = make(29.5, 45.5, 96, [-0.6, 38.7], K, TX, TY);
const insetProj = (s) => ({ alaska: make(55, 65, 154, [-2, 58.5], K * s.alaska, 0, 0), hawaii: make(8, 18, 157, [-3, 19.9], K * s.hawaii, 0, 0), pr: make(17, 19, 66.5, [0, 18.2], K * s.pr, 0, 0) });
let { alaska: alaska0, hawaii: hawaii0, pr: pr0 } = insetProj(SCALE0);
const region = (lon, lat) => lat > 50 ? 'alaska' : lat < 23 && lon < -140 ? 'hawaii' : lat < 20 && lon > -70 && lon < -64 ? 'pr' : 'lower48';

// ---- the inset boxes (map units): Alaska over Hawaii in the left column, Puerto Rico in the Atlantic. Each inset is
// projected at the origin, measured, then translated to the centre of its box; the boxes are drawn dashed by map.js. ----
const BOX = { // the top of the Alaska box clears the page's edge fade (7% of the frame = 45 units on a phone)
  alaska: { x0: 10, y0: 48, x1: 292, y1: 222 },
  hawaii: { x0: 10, y0: 238, x1: 292, y1: 392 },
  pr: { x0: 1036, y0: 296, x1: 1180, y1: 372 },
};
function bbox(polys, proj) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const poly of polys) for (const ring of poly) for (const [lon, lat] of ring) { const [x, y] = proj(west(lon), lat); if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return { x0, y0, x1, y1 };
}
const r1 = (v) => +v.toFixed(1);
const centreIn = (bb, box) => [r1((box.x0 + box.x1) / 2 - (bb.x0 + bb.x1) / 2), r1((box.y0 + box.y1) / 2 - (bb.y0 + bb.y1) / 2)];
const inside = (p, b) => p[0] > b.x0 && p[0] < b.x1 && p[1] > b.y0 && p[1] < b.y1;

// the 1:50m files fix the inset translations (so the fine layer and the coarse one share them exactly), measured from the US
// and Puerto Rico outlines
const coarse = { countries: await load('ne_50m_admin_0_countries'), states: await load('ne_50m_admin_1_states_provinces'), lakes: await load('ne_50m_lakes') };
const fine = { countries: await load('ne_10m_admin_0_countries'), states: await load('ne_10m_admin_1_states_provinces'), lakes: await load('ne_10m_lakes') };
function usOf(countries) {
  const us = countries.features.find((f) => adminOf(f) === 'United States of America');
  if (!us) throw new Error('United States not found in the countries file');
  const pr = countries.features.find((f) => adminOf(f) === 'Puerto Rico');
  if (!pr) throw new Error('Puerto Rico not found in the countries file');
  return { us, pr };
}
const ringsIn = (polys, reg) => polys.filter((poly) => region(poly[0][0][0], poly[0][0][1]) === reg);
{
  var { us: us50, pr: pr50 } = usOf(coarse.countries);
}
const usPolys50 = polysOf(us50);
// fit: measure each inset at its starting scale, scale it to fill its box less PAD, then project again at that scale
{
  const akB = bbox(ringsIn(usPolys50, 'alaska'), alaska0), hiB = bbox(ringsIn(usPolys50, 'hawaii'), hawaii0), prB = bbox(polysOf(pr50), pr0);
  const fit = (bb, box) => Math.min((box.x1 - box.x0 - 2 * PAD) / (bb.x1 - bb.x0), (box.y1 - box.y0 - 2 * PAD) / (bb.y1 - bb.y0));
  SCALE.alaska = +(SCALE0.alaska * fit(akB, BOX.alaska)).toFixed(4);
  SCALE.hawaii = +(SCALE0.hawaii * fit(hiB, BOX.hawaii)).toFixed(4);
  SCALE.pr = +(SCALE0.pr * fit(prB, BOX.pr)).toFixed(4);
  ({ alaska: alaska0, hawaii: hawaii0, pr: pr0 } = insetProj(SCALE));
}
const akBox = bbox(ringsIn(usPolys50, 'alaska'), alaska0), hiBox = bbox(ringsIn(usPolys50, 'hawaii'), hawaii0), prBox = bbox(polysOf(pr50), pr0);
const akT = centreIn(akBox, BOX.alaska), hiT = centreIn(hiBox, BOX.hawaii), prT = centreIn(prBox, BOX.pr);
for (const [name, bb, t, box] of [['alaska', akBox, akT, BOX.alaska], ['hawaii', hiBox, hiT, BOX.hawaii], ['pr', prBox, prT, BOX.pr]]) {
  const m = Math.min(bb.x0 + t[0] - box.x0, box.x1 - bb.x1 - t[0], bb.y0 + t[1] - box.y0, box.y1 - bb.y1 - t[1]);
  if (m < PAD - 0.5) throw new Error(`${name} inset does not fit its box with a margin (${m.toFixed(1)} units) — the fit went wrong`);
}
const insets = { scale: SCALE, alaska: akT, hawaii: hiT, pr: prT, boxes: BOX };
const alaska = (lon, lat) => { const p = alaska0(west(lon), lat); return [p[0] + akT[0], p[1] + akT[1]]; };
const hawaii = (lon, lat) => { const p = hawaii0(lon, lat); return [p[0] + hiT[0], p[1] + hiT[1]]; };
const prico = (lon, lat) => { const p = pr0(lon, lat); return [p[0] + prT[0], p[1] + prT[1]]; };
const PROJ = { lower48, alaska, hawaii, pr: prico };
export function project(lon, lat) { return PROJ[region(lon, lat)](lon, lat); }
// the mainland must stay clear of every box (checked on the 1:50m outline, every point)
for (const poly of ringsIn(usPolys50, 'lower48')) for (const ring of poly) for (const [lon, lat] of ring) {
  const p = lower48(lon, lat);
  for (const [name, box] of Object.entries(BOX)) if (inside(p, box)) throw new Error(`the lower 48 run into the ${name} box at ${p.map((v) => v.toFixed(0))} — move the box`);
}

// ---- degree windows for the neighbours, and the frames the projected land is clipped to ----
const FAR48 = { x0: -190, x1: -20, y0: -12, y1: 80 }, FARAK = { x0: -215, x1: -60, y0: 30, y1: 84 };
// the neighbours are drawn BLEED units past the frame on every side: a wide screen letterboxes the 2:1 frame and the
// bands beside it show land instead of a hard edge, and the page fades the map's edges (styles.css mask on #usMap)
// rather than the frame's (Steve, 2026-10-14: "let the fade go all the way to the top and bottom of the screen")
const BLEED = 200;
const FRAME = { x0: -BLEED, x1: W + BLEED, y0: -BLEED, y1: H + BLEED };
const BOXR = { x0: BOX.alaska.x0 - 4, x1: BOX.alaska.x1 + 4, y0: BOX.alaska.y0 - 4, y1: BOX.alaska.y1 + 4 };
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
// Sutherland–Hodgman joins the pieces of a clipped ring with zero-width seams along the window's edges — right as a FILL
// (no area, nothing drawn) but wrong as a STROKE (a seam across Hudson Bay drew as a stripe over the Alaska inset), so the
// coastline is a second, open path: every run of consecutive points inside the window, never closed, never bridged.
function runs(ring, b, proj, frame, eps) {
  const out = []; let run = [];
  const flush = () => { const t = thin(run, eps); if (t.length > 1) out.push(t.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('')); run = []; };
  for (const [lon, lat] of ring) {
    const q = lon >= b.x0 && lon <= b.x1 && lat >= b.y0 && lat <= b.y1 ? proj(lon, lat) : null;
    if (q && q[0] >= frame.x0 && q[0] <= frame.x1 && q[1] >= frame.y0 && q[1] <= frame.y1) run.push(q); else flush();
  }
  flush();
  return out;
}
// thinning: a point closer than eps map units to the last kept one is dropped (the 1:10m files carry detail no zoom shows;
// at 8×, the deepest zoom, 0.15 units is about a screen pixel); eps 0 keeps every point
function thin(pts, eps) {
  if (!eps || pts.length < 3) return pts;
  const out = [pts[0]]; let last = pts[0];
  for (let i = 1; i < pts.length; i++) { const p = pts[i]; if (Math.hypot(p[0] - last[0], p[1] - last[1]) >= eps) { out.push(p); last = p; } }
  return out;
}
const toPath = (pts) => pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('') + 'Z';
const lakeName = (n) => (n || '').replace(/\bSt\.\s*/g, 'Saint ');
// Natural Earth's countries and states carry the Great Lakes as land (the border runs mid-lake), so the map drew Lake
// Michigan as Michigan (Steve, 2026-10-13: "the great lakes are missing boundaries, they look bad") — the lakes are drawn
// as water over the land and the borders, shoreline stroked, the ones an atlas shows at this size
const BIG_LAKES = new Set(['Lake Superior', 'Lake Michigan', 'Lake Huron', 'Lake Erie', 'Lake Ontario', 'Lake Saint Clair', 'Great Salt Lake', 'Lake Okeechobee']);

// ---- one layer: the US rings per region, the state rings, the lakes, the neighbours; opts.eps thins, opts.speck drops rings
// whose projected extent is under that many units in both directions (the 1:10m file's rocks and sandbars) ----
function buildLayer({ countries, states, lakes }, opts, label) {
  const { us, pr } = usOf(countries);
  const usStates = states.features.filter((f) => f.properties.adm0_a3 === 'USA' || f.properties.iso_a2 === 'US');
  if (usStates.length !== 51) throw new Error(`${label}: expected 51 states + DC, found ${usStates.length}`);
  let dropped = 0;
  function ringPath(ring, reg) { // null when the ring is a speck or thins to nothing
    reg = reg || region(ring[0][0], ring[0][1]);
    const pts = thin(ring.map(([lon, lat]) => PROJ[reg](lon, lat)), opts.eps);
    if (pts.length < 3) { dropped++; return null; }
    if (opts.speck) {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const [x, y] of pts) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      if (x1 - x0 < opts.speck && y1 - y0 < opts.speck) { dropped++; return null; }
    }
    return { reg, d: toPath(pts) };
  }
  const paths = { lower48: [], alaska: [], hawaii: [], pr: [] };
  for (const poly of polysOf(us)) for (const ring of poly) { const r = ringPath(ring); if (r) paths[r.reg].push(r.d); }
  for (const poly of polysOf(pr)) for (const ring of poly) { const r = ringPath(ring, 'pr'); if (r) paths.pr.push(r.d); }
  // the state boundaries: one stroke-only path, every state's rings; shared borders are drawn twice, which a thin line hides
  const stateRings = [];
  for (const f of usStates) for (const poly of polysOf(f)) for (const ring of poly) { const r = ringPath(ring); if (r) stateRings.push(r.d); }
  const lakeRings = []; const found = new Set();
  for (const f of lakes.features) {
    const name = lakeName(f.properties.name);
    if (!BIG_LAKES.has(name)) continue;
    found.add(name);
    for (const poly of polysOf(f)) for (const ring of poly) { const r = ringPath(ring); if (r) lakeRings.push(r.d); }
  }
  if (found.size < BIG_LAKES.size) {
    const missing = [...BIG_LAKES].filter((n) => !found.has(n));
    if (opts.strictLakes) throw new Error(`${label}: lakes missing: ${missing.join(', ')}`);
    console.warn(`${label}: lakes not in this file: ${missing.join(', ')}`);
  }
  // the neighbours: every other country's rings, clipped first in degrees to the window each projection draws sanely (a
  // conic projection throws far-away land anywhere, so the clip comes before the projection), then by the frame in map
  // units, so the file carries no land that is never drawn. Two layers: around the lower 48 (everything from Canada to Panama
  // and the Caribbean), and inside the Alaska box (Yukon, British Columbia, Chukotka) so the inset reads as a place.
  const far = [], farAlaska = [], farEdge = [], farAlaskaEdge = [];
  for (const f of countries.features) {
    const name = adminOf(f);
    if (name === 'United States of America' || name === 'Puerto Rico') continue;
    for (const poly of polysOf(f)) for (const ring of poly) {
      const w = ring.map(([lon, lat]) => [west(lon), lat]);
      const a = clipRing(ring, FAR48), pa = a && clipRing(a.map(([lon, lat]) => lower48(lon, lat)), FRAME);
      if (pa) { const t = thin(pa, opts.eps); if (t.length > 2) far.push(toPath(t)); }
      const b = clipRing(w, FARAK), pb = b && clipRing(b.map(([lon, lat]) => alaska(lon, lat)), BOXR);
      if (pb) { const t = thin(pb, opts.eps); if (t.length > 2) farAlaska.push(toPath(t)); }
      farEdge.push(...runs(ring, FAR48, lower48, FRAME, opts.eps));
      farAlaskaEdge.push(...runs(w, FARAK, alaska, BOXR, opts.eps));
    }
  }
  const out = {
    paths: { lower48: paths.lower48.join(''), alaska: paths.alaska.join(''), hawaii: paths.hawaii.join(''), pr: paths.pr.join(''), states: stateRings.join(''), lakes: lakeRings.join(''), far: far.join(''), farAlaska: farAlaska.join(''), farEdge: farEdge.join(''), farAlaskaEdge: farAlaskaEdge.join('') },
  };
  console.log(`${label}: lower48 ${paths.lower48.length} rings, alaska ${paths.alaska.length}, hawaii ${paths.hawaii.length}, pr ${paths.pr.length}, ${stateRings.length} state rings, ${lakeRings.length} lake rings, ${far.length} + ${farAlaska.length} neighbour rings, ${dropped} rings dropped as specks; ${JSON.stringify(out).length} bytes`);
  return out;
}

const NOTE = 'United States outline from Natural Earth admin-0 countries, state boundaries from admin-1 states and the big lakes from the lakes file (public domain), projected Albers USA (conic equal-area 29.5°/45.5° for the lower 48; Alaska 55°/65°, Hawaii 8°/18° and Puerto Rico 17°/19° as insets — `insets` holds their scales (of `scale`), translations and the boxes they sit in: Alaska over Hawaii in the left column, Puerto Rico in the Atlantic). `far` is the neighbouring land around the lower 48 and `farAlaska` the land around Alaska (fills; `farEdge` / `farAlaskaEdge` their coastlines as open strokes), both drawn at half tone, `far` clipped to the frame plus `bleed` units on every side (a wide screen letterboxes the frame and the bands show land) — the page fades the map\'s edges, not the frame\'s. Built by scripts/build-map.mjs; map.js re-implements the projection to place cities.';
const base = { width: W, height: H, scale: K, tx: TX, ty: TY, bleed: BLEED, insets };
const c = buildLayer(coarse, { eps: 0, strictLakes: true }, 'us-outline.json (1:50m)');
writeFileSync(join(here, '..', 'site', 'us-outline.json'), JSON.stringify({ _: NOTE + ' This is the 1:50m layer, drawn first.', ...base, ...c }));
const f = buildLayer(fine, { eps: 0.15, speck: 0.6 }, 'us-outline-fine.json (1:10m)');
writeFileSync(join(here, '..', 'site', 'us-outline-fine.json'), JSON.stringify({ _: NOTE + ' This is the 1:10m layer: the same keys and frame, swapped in by map.js past 3× zoom.', ...base, ...f }));
console.log('insets', JSON.stringify(insets));
for (const [n, bb, t] of [['alaska', akBox, akT], ['hawaii', hiBox, hiT], ['pr', prBox, prT]]) console.log(n, 'drawn at', [r1(bb.x0 + t[0]), r1(bb.y0 + t[1]), r1(bb.x1 + t[0]), r1(bb.y1 + t[1])].join(','));
console.log('Seattle →', project(-122.335, 47.608).map((x) => x.toFixed(1)).join(','), ' Honolulu →', project(-157.858, 21.307).map((x) => x.toFixed(1)).join(','), ' Anchorage →', project(-149.9, 61.2).map((x) => x.toFixed(1)).join(','), ' San Juan →', project(-66.1, 18.47).map((x) => x.toFixed(1)).join(','), ' Attu →', project(173.2, 52.9).map((x) => x.toFixed(1)).join(','), ' Hatteras →', project(-75.5, 35.2).map((x) => x.toFixed(1)).join(','), ' Flattery →', project(-124.7, 48.4).map((x) => x.toFixed(1)).join(','));
