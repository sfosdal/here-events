// here.events — the covered-cities map. Draws the US outline and the state
// boundaries from us-outline.json, places one dot per city from cities.json
// with the same Albers-USA projection scripts/build-map.mjs used (the numbers
// must match), opens the city list as a pop-up, and lets the reader zoom and
// pan (wheel, pinch, drag, the + − buttons, double-click, the keyboard) —
// Steve, 2026-10-12: "the base maps … should support zooming and boundaries".
// Past 3× the 1:10m layer (us-outline-fine.json) is fetched once and swapped
// in ("as you zoom in detail should improve", 2026-10-14); a fourth button
// zooms to the reader's own location and lights the nearest city ("add a zoom
// to my location thingy", "highlight nearest city"). No libraries.
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };

  // ---- theme pill: light, dark, system (the city sites' applyTheme) ----
  function applyTheme(t, persist) {
    var stop = t === 'light' || t === 'dark' ? t : 'system';
    if (stop === 'system') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = stop;
    var pill = $('themeToggle'); pill.dataset.active = stop;
    pill.querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-checked', String(b.dataset.theme === stop)); });
    if (persist) { try { localStorage.setItem('here-theme', stop); } catch (e) { /* no storage */ } }
    document.querySelectorAll('meta[name="theme-color"]').forEach(function (m) {
      m.content = stop === 'dark' ? '#141a20' : stop === 'light' ? '#edf1f4' : (m.dataset.light || m.dataset.dark);
    });
  }
  applyTheme(document.documentElement.dataset.theme);

  // ---- the pop-ups: each masthead pill opens the sheet its href names — City List (static rows from
  // scripts/cities-static.mjs) and By Activity (tango + curling, 2026-10-30); Esc, the backdrop or Close shut it —
  // the city sites' More Cities sheet (Steve, 2026-10-19). Without script the pill's #target shows it through CSS. ----
  document.querySelectorAll('.list-pill[href^="#"]').forEach(function (pill) {
    var sh = $(pill.getAttribute('href').slice(1));
    if (!sh) return;
    var card = sh.querySelector('.sheet-card'), last = null;
    function esc(e) { if (e.key === 'Escape') off(); }
    function off() { sh.hidden = true; document.body.classList.remove('sheet-open'); document.removeEventListener('keydown', esc); if (last) last.focus(); }
    function on(e) { if (e) e.preventDefault(); last = document.activeElement; sh.hidden = false; document.body.classList.add('sheet-open'); document.addEventListener('keydown', esc); card.focus(); }
    pill.addEventListener('click', on);
    sh.querySelector('.sheet-back').addEventListener('click', off);
    sh.querySelector('.city-close').addEventListener('click', off);
  });

  // ?share renders the 1200x630 card for share.png (dark, map only; the build screenshots it headless).
  if (/[?&]share\b/.test(location.search)) { document.documentElement.dataset.theme = 'dark'; document.documentElement.dataset.share = '1'; }
  $('themeToggle').addEventListener('click', function (ev) {
    var b = ev.target.closest('button'); if (!b) return;
    applyTheme(b.dataset.theme, true);
  });

  // ---- Albers USA, as in scripts/build-map.mjs ----
  var rad = Math.PI / 180;
  function conic(p0, p1) {
    var sy0 = Math.sin(p0 * rad), n = (sy0 + Math.sin(p1 * rad)) / 2, c = 1 + sy0 * (2 * n - sy0), r0 = Math.sqrt(c) / n;
    return function (lam, phi) { var r = Math.sqrt(c - 2 * n * Math.sin(phi)) / n; return [r * Math.sin(lam * n), r0 - r * Math.cos(lam * n)]; };
  }
  function make(p0, p1, rotLon, center, scale, tx, ty) {
    var raw = conic(p0, p1), c = raw(center[0] * rad, center[1] * rad);
    return function (lon, lat) { var p = raw((lon + rotLon) * rad, lat * rad); return [tx + scale * (p[0] - c[0]), ty - scale * (p[1] - c[1])]; };
  }
  // which inset a point belongs to; null when it is on none of the drawn land (a reader in Canada or at sea)
  function regionOf(lon, lat) {
    if (lon > 0) lon -= 360;
    if (lat > 50) return lon < -129 && lon > -190 && lat < 72 ? 'alaska' : null;
    if (lat < 23 && lon < -140) return lat > 18 && lon > -161 ? 'hawaii' : null;
    if (lat < 20 && lon > -70 && lon < -64) return lat > 17 ? 'pr' : null;
    return lat > 24 && lat < 49.5 && lon > -125 && lon < -66 ? 'lower48' : null;
  }
  function projector(o) { // o: the outline file's width/height/scale/tx/ty and the insets' scales + translations (build-map.mjs centres each in its box)
    var K = o.scale, I = o.insets;
    var P = {
      lower48: make(29.5, 45.5, 96, [-0.6, 38.7], K, o.tx, o.ty),
      alaska: make(55, 65, 154, [-2, 58.5], K * I.scale.alaska, I.alaska[0], I.alaska[1]),
      hawaii: make(8, 18, 157, [-3, 19.9], K * I.scale.hawaii, I.hawaii[0], I.hawaii[1]),
      pr: make(17, 19, 66.5, [0, 18.2], K * I.scale.pr, I.pr[0], I.pr[1]),
    };
    return function (lon, lat) {
      if (lon > 0) lon -= 360; // the western Aleutians, past 180°
      return P[lat > 50 ? 'alaska' : lat < 23 && lon < -140 ? 'hawaii' : lat < 20 && lon > -70 && lon < -64 ? 'pr' : 'lower48'](lon, lat);
    };
  }

  var NS = 'http://www.w3.org/2000/svg';
  function el(name, attrs, parent) {
    var e = document.createElementNS(NS, name);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function site(c) { return c.url || 'https://' + c.key + '.here.events/'; }
  var rectD = function (b) { return 'M' + b.x0 + ' ' + b.y0 + 'H' + b.x1 + 'V' + b.y1 + 'H' + b.x0 + 'Z'; };
  // the frame's edges fade: four rects over the neighbouring land, each a gradient from the page colour to clear across
  // `fade` units, so the half-tone land dissolves instead of stopping at a hard line (Steve, 2026-10-14: "there should be no
  // hard edges to the map"); drawn after the neighbours and before the US land, clipped like the layer they soften. (A
  // luminance mask did the same and stalled headless Chrome's screenshots, so overlays it is.)
  function fadeEdges(defs, parent, id, b, fade) {
    [['l', b.x0, b.y0, fade, b.y1 - b.y0, '0%', '0%', '100%', '0%'], ['r', b.x1 - fade, b.y0, fade, b.y1 - b.y0, '100%', '0%', '0%', '0%'],
      ['t', b.x0, b.y0, b.x1 - b.x0, fade, '0%', '0%', '0%', '100%'], ['b', b.x0, b.y1 - fade, b.x1 - b.x0, fade, '0%', '100%', '0%', '0%']].forEach(function (q) {
      var g = el('linearGradient', { id: id + '-' + q[0], x1: q[5], y1: q[6], x2: q[7], y2: q[8] }, defs);
      el('stop', { offset: '0', 'stop-opacity': '1', 'class': 'fade-stop' }, g);
      el('stop', { offset: '1', 'stop-opacity': '0', 'class': 'fade-stop' }, g);
      el('rect', { x: q[1], y: q[2], width: q[3], height: q[4], fill: 'url(#' + id + '-' + q[0] + ')', 'class': 'fade' }, parent);
    });
  }

  // ---- zoom + pan: the viewBox is the camera. Scale 1 (the whole country) to MAXK; the view never leaves the
  // country's frame. Dots and names keep their screen size (styles.css divides by --k); borders and leaders use
  // non-scaling strokes. One finger on a phone scrolls the page until the map is zoomed in, then it pans the map. ----
  var MAXK = 8;
  function zoomable(svg, W, H, onZoom) {
    var view = { x: 0, y: 0, w: W, h: H }, kNow = 1;
    var zin = $('zoomIn'), zout = $('zoomOut'), zreset = $('zoomReset');
    function apply() {
      kNow = W / view.w;
      svg.setAttribute('viewBox', [view.x, view.y, view.w, view.h].map(function (v) { return v.toFixed(2); }).join(' '));
      svg.style.setProperty('--k', kNow.toFixed(4));
      var ctm = svg.getScreenCTM();
      if (ctm) { svg.style.setProperty('--ks', Math.max(1, ctm.a / (1280 / 960)).toFixed(4)); svg.style.setProperty('--ka', Math.max(0.05, ctm.a).toFixed(4)); }
      var zoomed = kNow > 1.02;
      svg.classList.toggle('is-zoomed', zoomed);
      svg.style.touchAction = zoomed ? 'none' : 'pan-y';
      zreset.disabled = !zoomed; zout.disabled = !zoomed; zin.disabled = kNow >= MAXK - 0.01; // disabled, never hidden: the column keeps all four buttons
      if (onZoom) onZoom(kNow);
    }
    function clamp() {
      if (view.w > W) { view.w = W; view.h = H; }
      view.x = Math.min(Math.max(view.x, 0), W - view.w);
      view.y = Math.min(Math.max(view.y, 0), H - view.h);
    }
    function toUser(cx, cy) { var pt = svg.createSVGPoint(); pt.x = cx; pt.y = cy; return pt.matrixTransform(svg.getScreenCTM().inverse()); }
    function zoomAt(factor, ux, uy) { // keep the map point (ux, uy) under the pointer
      var nw = Math.min(W, Math.max(W / MAXK, view.w / factor)); factor = view.w / nw;
      view.x = ux - (ux - view.x) / factor; view.y = uy - (uy - view.y) / factor;
      view.w = nw; view.h = view.h / factor; clamp(); apply();
    }
    function zoomCenter(factor) { zoomAt(factor, view.x + view.w / 2, view.y + view.h / 2); }
    function zoomTo(ux, uy, k) { // centre the view on a map point at scale k (clamped to the frame)
      k = Math.min(MAXK, Math.max(1, k));
      view.w = W / k; view.h = H / k; view.x = ux - view.w / 2; view.y = uy - view.h / 2; clamp(); apply();
    }
    function reset() { stopFly(); view = { x: 0, y: 0, w: W, h: H }; apply(); }
    // flyTo: glide from the current view to a map point at scale k over about a second — the scale eases geometrically,
    // the centre linearly, ease-in-out — instead of snapping there (Steve, 2026-10-14: "don't jump/snap to it. make the
    // map zoom into it"); a reduced-motion preference, or any touch of the map, snaps instead. done() runs on landing.
    var anim = null, reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    function stopFly() { if (anim) { cancelAnimationFrame(anim); anim = null; } }
    function flyTo(ux, uy, k, done) {
      stopFly();
      k = Math.min(MAXK, Math.max(1, k));
      var tw = W / k, th = H / k, tx = Math.min(Math.max(ux - tw / 2, 0), W - tw), ty = Math.min(Math.max(uy - th / 2, 0), H - th);
      var fx = view.x, fy = view.y, fw = view.w, fh = view.h;
      if (reduced || (Math.abs(fw - tw) < 0.5 && Math.abs(fx - tx) < 0.5 && Math.abs(fy - ty) < 0.5)) { view = { x: tx, y: ty, w: tw, h: th }; apply(); if (done) done(); return; }
      var t0 = performance.now(), ms = 1100;
      anim = requestAnimationFrame(function step(now) {
        var p = Math.min(1, (now - t0) / ms), e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
        var w = fw * Math.pow(tw / fw, e), h = w * H / W;
        var cx = (fx + fw / 2) + ((tx + tw / 2) - (fx + fw / 2)) * e, cy = (fy + fh / 2) + ((ty + th / 2) - (fy + fh / 2)) * e;
        view = { x: cx - w / 2, y: cy - h / 2, w: w, h: h }; clamp(); apply();
        if (p < 1) anim = requestAnimationFrame(step); else { anim = null; if (done) done(); }
      });
    }
    zin.addEventListener('click', function () { stopFly(); zoomCenter(1.6); });
    zout.addEventListener('click', function () { stopFly(); zoomCenter(1 / 1.6); });
    zreset.addEventListener('click', reset);
    svg.addEventListener('wheel', function (ev) {
      ev.preventDefault(); stopFly();
      var dy = ev.deltaMode === 1 ? ev.deltaY * 16 : ev.deltaMode === 2 ? ev.deltaY * 300 : ev.deltaY;
      var p = toUser(ev.clientX, ev.clientY); zoomAt(Math.exp(-dy * 0.002), p.x, p.y);
    }, { passive: false });
    svg.addEventListener('dblclick', function (ev) { ev.preventDefault(); stopFly(); var p = toUser(ev.clientX, ev.clientY); zoomAt(ev.shiftKey ? 0.5 : 2, p.x, p.y); });
    svg.addEventListener('keydown', function (ev) {
      stopFly();
      if (ev.key === '+' || ev.key === '=') { zoomCenter(1.6); ev.preventDefault(); }
      else if (ev.key === '-' || ev.key === '_') { zoomCenter(1 / 1.6); ev.preventDefault(); }
      else if (ev.key === '0' || ev.key === 'Escape') { reset(); }
      else if (/^Arrow/.test(ev.key) && kNow > 1.02) {
        var step = view.w / 10;
        view.x += ev.key === 'ArrowRight' ? step : ev.key === 'ArrowLeft' ? -step : 0;
        view.y += ev.key === 'ArrowDown' ? step : ev.key === 'ArrowUp' ? -step : 0;
        clamp(); apply(); ev.preventDefault();
      }
    });
    // pointers: one drags (when zoomed), two pinch; a drag must not open the city under the finger
    var ptrs = {}, moved = 0, pinch = null;
    function pointerList() { return Object.keys(ptrs).map(function (id) { return ptrs[id]; }); }
    svg.addEventListener('pointerdown', function (ev) {
      if (ev.button !== 0 && ev.pointerType === 'mouse') return;
      stopFly();
      ptrs[ev.pointerId] = { x: ev.clientX, y: ev.clientY }; moved = 0;
      // no pointer capture here: capturing on the svg retargets the pointerup, so the click lands on
      // the svg instead of the pin and no city opens (Steve, 2026-10-13: "cities are not clickable");
      // the capture waits until the pointer has really dragged (below)
      var l = pointerList(); if (l.length === 2) pinch = { d: Math.hypot(l[0].x - l[1].x, l[0].y - l[1].y), w: view.w };
    });
    svg.addEventListener('pointermove', function (ev) {
      var p = ptrs[ev.pointerId]; if (!p) return;
      var l = pointerList();
      if (l.length === 2 && pinch) {
        ptrs[ev.pointerId] = { x: ev.clientX, y: ev.clientY }; l = pointerList();
        var d = Math.hypot(l[0].x - l[1].x, l[0].y - l[1].y), m = toUser((l[0].x + l[1].x) / 2, (l[0].y + l[1].y) / 2);
        var target = Math.min(W, Math.max(W / MAXK, pinch.w * pinch.d / Math.max(d, 1)));
        zoomAt(view.w / target, m.x, m.y); moved += 10;
        return;
      }
      if (kNow <= 1.02) { ptrs[ev.pointerId] = { x: ev.clientX, y: ev.clientY }; return; } // the whole country: nothing to pan
      var a = svg.getScreenCTM().a || 1, dx = ev.clientX - p.x, dy = ev.clientY - p.y;
      moved += Math.abs(dx) + Math.abs(dy);
      if (moved > 6 && !svg.hasPointerCapture(ev.pointerId)) { try { svg.setPointerCapture(ev.pointerId); } catch (e) { /* not capturable */ } } // a real drag: keep it when the pointer leaves the map
      view.x -= dx / a; view.y -= dy / a; clamp(); apply();
      ptrs[ev.pointerId] = { x: ev.clientX, y: ev.clientY };
    });
    function up(ev) { delete ptrs[ev.pointerId]; if (pointerList().length < 2) pinch = null; }
    svg.addEventListener('pointerup', up); svg.addEventListener('pointercancel', up);
    svg.addEventListener('click', function (ev) { if (moved > 6) { ev.preventDefault(); ev.stopPropagation(); } }, true);
    svg.setAttribute('tabindex', '0');
    window.addEventListener('resize', apply);
    apply();
    return { zoomTo: zoomTo, flyTo: flyTo, reset: reset, k: function () { return kNow; } };
  } // a neighbourhood sits under its city (lqa.seattle.here.events, 2026-10-11)

  var haversineMi = function (a, b) {
    var dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 3958.8 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  };

  Promise.all([fetch('us-outline.json').then(function (r) { return r.json(); }), fetch('cities.json').then(function (r) { return r.json(); })]).then(function (res) {
    var o = res[0], cities = res[1].cities, project = projector(o), W = o.width, H = o.height, boxes = o.insets.boxes;
    var svg = $('usMap');
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    var bleed = o.bleed || 0, frame = { x0: -bleed, y0: -bleed, x1: W + bleed, y1: H + bleed }, defs = el('defs', {}, svg), layer = {};
    // the neighbours at half tone (Canada, Mexico, Cuba, …), under everything: clipped to the frame less the inset boxes
    // around the lower 48, and to the Alaska box around Alaska (Steve, 2026-10-13: "grey them out half compared to US"),
    // the land around the lower 48 runs `bleed` units past the frame, so a wide screen's letterbox bands show land; the
    // page fades the map's own edges (styles.css mask on #usMap), the Alaska box fades inside its line
    el('path', { d: rectD(frame) }, el('clipPath', { id: 'clipMain' }, defs));
    el('path', { d: rectD(boxes.alaska) }, el('clipPath', { id: 'clipAlaska' }, defs));
    var farMain = el('g', { 'class': 'far', 'clip-path': 'url(#clipMain)' }, svg);
    // the Alaska and Hawaii insets live in one group that slides left at runtime, so their boxes sit against the page's
    // left edge (the title's) on a wide screen, where the letterboxed frame would leave them a band in (Steve, 2026-10-14:
    // "both should be left justified with small margin"); a page-coloured backing under each box hides the neighbouring
    // land, which used to be cut out of the clip above (the hole would stay behind when the boxes move)
    var insetG = el('g', { 'class': 'inset-left' }, svg), LEFT = ['alaska', 'hawaii'];
    Object.keys(boxes).forEach(function (k) { var b = boxes[k]; el('rect', { x: b.x0, y: b.y0, width: b.x1 - b.x0, height: b.y1 - b.y0, rx: 2, 'class': 'inset-back' }, LEFT.indexOf(k) >= 0 ? insetG : svg); });
    var farAk = el('g', { 'class': 'far', 'clip-path': 'url(#clipAlaska)' }, insetG);
    [['far', farMain, 'fill'], ['farEdge', farMain, 'edge'], ['farAlaska', farAk, 'fill'], ['farAlaskaEdge', farAk, 'edge']].forEach(function (q) {
      if (o.paths[q[0]]) layer[q[0]] = el('path', { d: o.paths[q[0]], 'class': 'far-' + q[2] }, q[1]);
    });
    fadeEdges(defs, farAk, 'fadeAlaska', boxes.alaska, 14);
    var land = el('g', { 'class': 'land' }, svg), insetLand = el('g', { 'class': 'land' }, insetG);
    ['lower48', 'alaska', 'hawaii', 'pr'].forEach(function (k) { if (o.paths[k]) layer[k] = el('path', { d: o.paths[k], 'class': 'land-' + k }, LEFT.indexOf(k) >= 0 ? insetLand : land); });
    // the state boundaries: stroke only, over the land, under the dots; the line keeps its width at every zoom
    if (o.paths.states) layer.states = el('path', { d: o.paths.states, 'class': 'states', 'vector-effect': 'non-scaling-stroke' }, el('g', { 'class': 'borders' }, svg));
    if (o.paths.statesInset) layer.statesInset = el('path', { d: o.paths.statesInset, 'class': 'states', 'vector-effect': 'non-scaling-stroke' }, el('g', { 'class': 'borders' }, insetG)); // Alaska's and Hawaii's outlines ride with their insets
    // the big lakes as water over land and borders (the sources count them as land), shoreline stroked
    if (o.paths.lakes) layer.lakes = el('path', { d: o.paths.lakes, 'class': 'lakes', 'vector-effect': 'non-scaling-stroke' }, svg);
    // a faint dashed box around each inset, as atlases draw them
    Object.keys(boxes).forEach(function (k) { var b = boxes[k]; el('rect', { x: b.x0, y: b.y0, width: b.x1 - b.x0, height: b.y1 - b.y0, rx: 2, 'class': 'inset-line', 'vector-effect': 'non-scaling-stroke' }, LEFT.indexOf(k) >= 0 ? insetG : svg); });
    var pins = el('g', { 'class': 'pins' }, svg), insetPins = el('g', { 'class': 'pins' }, insetG), placed = [], pinOf = {};
    var inBox = function (x, y, b) { return x > b.x0 && x < b.x1 && y > b.y0 && y < b.y1; };
    cities.forEach(function (c) {
      var p = project(c.lon, c.lat), x = +p[0].toFixed(1), y = +p[1].toFixed(1);
      var onLeft = LEFT.some(function (k) { return inBox(x, y, boxes[k]); }); // Honolulu rides with the Hawaii inset
      var a = el('a', { href: site(c), 'class': 'pin' + (c.live ? ' is-live' : ' is-soon'), 'data-key': c.key }, onLeft ? insetPins : pins);
      a.setAttribute('aria-label', c.name + ', ' + c.state + (c.live ? '' : ' (coming soon)'));
      el('title', {}, a).textContent = c.name + ', ' + c.state + (c.live ? ' — open the calendar' : ' — coming soon');
      var lb = c.label || { dx: 10, dy: 4, anchor: 'start' };
      var far = Math.abs(lb.dx) > 12 || Math.abs(lb.dy) > 16; // a leader when the name sits away from its dot
      var leader = far ? el('line', { x1: x, y1: y, x2: x + lb.dx * 0.8, y2: y + (lb.dy - 4) * 0.8, 'class': 'leader' }, a) : null;
      el('circle', { cx: x, cy: y, r: 7, 'class': 'halo' }, a);
      el('circle', { cx: x, cy: y, r: 4.2, 'class': 'dot' }, a);
      var t = el('text', { x: x + lb.dx, y: y + lb.dy, 'text-anchor': lb.anchor, 'class': 'label' }, a);
      t.textContent = c.name;
      placed.push({ x: x, y: y, dx: lb.dx, dy: lb.dy, home: lb, text: t, leader: leader }); // the line itself — the pin's first child is its <title>, which took the rescaled ends until 2026-10-14 while the line grew with the zoom
      pinOf[c.key] = a;
    });
    var live = cities.filter(function (c) { return c.live; }).length;
    $('count').textContent = live + ' live, ' + (cities.length - live) + ' on the way';

    // ---- the fine layer: the 1:10m paths, fetched once the reader zooms past FINE_K and swapped in for the 1:50m ones
    // (same keys, same frame); back below, the coarse paths return, so a wide view never pays for the detail ----
    var FINE_K = 3, fine = null, fineLoading = false, showingFine = false;
    function swap(toFine) {
      var src = toFine ? fine : o;
      Object.keys(layer).forEach(function (k) { if (src.paths[k]) layer[k].setAttribute('d', src.paths[k]); });
      showingFine = toFine; svg.classList.toggle('is-fine', toFine);
    }
    function wantFine(k) {
      if (k >= FINE_K) {
        if (fine) { if (!showingFine) swap(true); }
        else if (!fineLoading) {
          fineLoading = true;
          fetch('us-outline-fine.json').then(function (r) { return r.json(); }).then(function (f) { fine = f; if (zoom.k() >= FINE_K) swap(true); }).catch(function () { fineLoading = false; });
        }
      } else if (showingFine) swap(false);
    }
    // ---- names keep their screen offset from the dot, and never cross an inset box (Steve, 2026-10-14: "no text overlap
    // with the boxes"): a name is as wide in map units as the screen is narrow, so a hand-set place that clears the
    // Alaska box on a wide screen can lie across it on a narrower one. After every zoom or resize each name whose box
    // (getBBox) touches an inset box tries the other side, under, over, under-right and under-left, and takes the first
    // place that clears the boxes and the other names — else the one that overlaps the boxes least. ----
    var insetDX = 0; // the left insets' slide, map units (set per zoom/resize below); the name-nudging sees the boxes where they are
    var boxList = []; function listBoxes() { boxList = Object.keys(boxes).map(function (k) { var b = boxes[k], d = LEFT.indexOf(k) >= 0 ? insetDX : 0; return { x0: b.x0 + d, y0: b.y0, x1: b.x1 + d, y1: b.y1 }; }); }
    function setPos(q, o, kk) {
      q.text.setAttribute('x', (q.x + o.dx / kk).toFixed(1)); q.text.setAttribute('y', (q.y + o.dy / kk).toFixed(1)); q.text.setAttribute('text-anchor', o.anchor);
      if (q.leader) { q.leader.setAttribute('x2', (q.x + o.dx * 0.8 / kk).toFixed(1)); q.leader.setAttribute('y2', (q.y + (o.dy - 4) * 0.8 / kk).toFixed(1)); }
    }
    function overlap(b, x0, y0, x1, y1) { return Math.max(0, Math.min(b.x + b.width, x1) - Math.max(b.x, x0)) * Math.max(0, Math.min(b.y + b.height, y1) - Math.max(b.y, y0)); }
    function bbox(t) { try { return t.getBBox(); } catch (e) { return null; } }
    function keepOffBoxes(kk) {
      var rects = placed.map(function (q) { return bbox(q.text); });
      placed.forEach(function (q, i) {
        var b = rects[i]; if (!b) return;
        var onBox = function (r) { return boxList.reduce(function (a, x) { return a + overlap(r, x.x0 - 2, x.y0 - 2, x.x1 + 2, x.y1 + 2); }, 0); };
        if (!onBox(b)) return;
        var h = q.home, flip = { start: 'end', end: 'start', middle: 'middle' }[h.anchor] || 'start';
        var opts = [{ dx: -h.dx, dy: h.dy, anchor: flip }, { dx: 0, dy: 18, anchor: 'middle' }, { dx: 0, dy: -12, anchor: 'middle' }, { dx: 12, dy: 18, anchor: 'start' }, { dx: -12, dy: 18, anchor: 'end' }];
        var best = h, bestScore = onBox(b) * 10 + 1e9; // home only if nothing clears the boxes
        for (var j = 0; j < opts.length; j++) {
          setPos(q, opts[j], kk); var r = bbox(q.text); if (!r) continue;
          var onText = rects.reduce(function (a, c, m) { return m === i || !c ? a : a + overlap(r, c.x, c.y, c.x + c.width, c.y + c.height); }, 0);
          var score = onBox(r) * 10 + onText;
          if (score < bestScore) { best = opts[j]; bestScore = score; }
          if (!score) break;
        }
        setPos(q, best, kk); rects[i] = bbox(q.text);
      });
    }
    var zoom = zoomable(svg, W, H, function (k) {
      var ks = parseFloat(svg.style.getPropertyValue('--ks')) || 1, kk = Math.max(k, ks);
      // slide the left insets by the letterbox band (the frame is centred in the svg's box; preserveAspectRatio meet), so
      // the Alaska and Hawaii boxes start at the svg's left edge, 1.5rem in from the window like the title; never rightwards
      var ka = parseFloat(svg.style.getPropertyValue('--ka')) || 1, rect = svg.getBoundingClientRect();
      var band = Math.max(0, (rect.width - (W / k) * ka) / 2);
      insetDX = Math.min(0, -band / ka - boxes.alaska.x0);
      insetG.setAttribute('transform', 'translate(' + insetDX.toFixed(2) + ' 0)');
      listBoxes();
      placed.forEach(function (q) { setPos(q, q.home, kk); });
      keepOffBoxes(kk);
      wantFine(k);
    });

    // ---- "zoom to my location": the browser's position, projected like a city; the view centres there at 4×, a pulsing
    // marker shows the spot and the nearest live city lights up, named in the caption with the distance ----
    var locate = $('zoomLocate'), near = $('near'), you = null;
    function say(msg) { near.textContent = msg; near.hidden = !msg; }
    function showYou(lon, lat) {
      var reg = regionOf(lon, lat);
      if (!reg) { say('You are outside the map'); return; }
      var p = project(lon, lat), x = +p[0].toFixed(1), y = +p[1].toFixed(1);
      var best = null, bestD = Infinity;
      cities.forEach(function (c) { if (!c.live) return; var d = haversineMi({ lat: lat, lon: lon }, c); if (d < bestD) { bestD = d; best = c; } });
      // glide there first; the marker, the nearest city's light and its name arrive as the move lands
      zoom.flyTo(x, y, reg === 'lower48' ? 4 : 3, function () {
        if (!you) you = el('g', { 'class': 'you' }, svg);
        you.textContent = '';
        el('circle', { cx: x, cy: y, r: 6, 'class': 'you-pulse' }, you);
        el('circle', { cx: x, cy: y, r: 5, 'class': 'you-dot' }, you);
        Object.keys(pinOf).forEach(function (k) { pinOf[k].classList.toggle('is-nearest', best && k === best.key); });
        if (best) {
          var a = pinOf[best.key]; a.parentNode.appendChild(a); // on top of its neighbours
          say('Nearest: ' + best.name + ', ' + Math.round(bestD).toLocaleString() + ' mi');
        } else say('');
      });
    }
    if (!('geolocation' in navigator)) { locate.disabled = true; locate.title = 'Location is not available in this browser'; } // kept in the column, just off
    locate.addEventListener('click', function () {
      locate.disabled = true; say('Finding you…');
      navigator.geolocation.getCurrentPosition(function (pos) {
        locate.disabled = false; showYou(pos.coords.longitude, pos.coords.latitude);
      }, function (err) {
        locate.disabled = false;
        say(err.code === 1 ? 'Location not shared' : 'Location unavailable');
      }, { timeout: 12000, maximumAge: 300000 });
    });
  }).catch(function (e) { $('count').textContent = 'The map could not load (' + e.message + ').'; });
})();
