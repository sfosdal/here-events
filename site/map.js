// here.events — the covered-cities map. Draws the US outline and the state
// boundaries from us-outline.json, places one dot per city from cities.json
// with the same Albers-USA projection scripts/build-map.mjs used (the numbers
// must match), lists the cities below the map, and lets the reader zoom and
// pan (wheel, pinch, drag, the + − buttons, double-click, the keyboard) —
// Steve, 2026-10-12: "the base maps … should support zooming and boundaries".
// No libraries.
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
  function projector(o) { // o: the outline file's width/height/scale/tx/ty and the insets' translations (build-map.mjs packs them bottom-left)
    var K = o.scale, I = o.insets;
    var lower48 = make(29.5, 45.5, 96, [-0.6, 38.7], K, o.tx, o.ty);
    var alaska = make(55, 65, 154, [-2, 58.5], K * 0.35, I.alaska[0], I.alaska[1]);
    var hawaii = make(8, 18, 157, [-3, 19.9], K, I.hawaii[0], I.hawaii[1]);
    var pr = make(17, 19, 66.5, [0, 18.2], K, I.pr[0], I.pr[1]);
    return function (lon, lat) {
      if (lon > 0) lon -= 360; // the western Aleutians, past 180°
      return (lat > 50 ? alaska : lat < 23 && lon < -140 ? hawaii : lat < 20 && lon > -70 && lon < -64 ? pr : lower48)(lon, lat);
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
      var ctm = svg.getScreenCTM(); if (ctm) svg.style.setProperty('--ks', Math.max(1, ctm.a / (1280 / 960)).toFixed(4));
      var zoomed = kNow > 1.02;
      svg.classList.toggle('is-zoomed', zoomed);
      svg.style.touchAction = zoomed ? 'none' : 'pan-y';
      zreset.hidden = !zoomed; zout.disabled = !zoomed; zin.disabled = kNow >= MAXK - 0.01;
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
    function reset() { view = { x: 0, y: 0, w: W, h: H }; apply(); }
    zin.addEventListener('click', function () { zoomCenter(1.6); });
    zout.addEventListener('click', function () { zoomCenter(1 / 1.6); });
    zreset.addEventListener('click', reset);
    svg.addEventListener('wheel', function (ev) {
      ev.preventDefault();
      var dy = ev.deltaMode === 1 ? ev.deltaY * 16 : ev.deltaMode === 2 ? ev.deltaY * 300 : ev.deltaY;
      var p = toUser(ev.clientX, ev.clientY); zoomAt(Math.exp(-dy * 0.002), p.x, p.y);
    }, { passive: false });
    svg.addEventListener('dblclick', function (ev) { ev.preventDefault(); var p = toUser(ev.clientX, ev.clientY); zoomAt(ev.shiftKey ? 0.5 : 2, p.x, p.y); });
    svg.addEventListener('keydown', function (ev) {
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
  } // a neighbourhood sits under its city (lqa.seattle.here.events, 2026-10-11)

  Promise.all([fetch('us-outline.json').then(function (r) { return r.json(); }), fetch('cities.json').then(function (r) { return r.json(); })]).then(function (res) {
    var o = res[0], cities = res[1].cities, project = projector(o);
    var svg = $('usMap');
    svg.setAttribute('viewBox', '0 0 ' + o.width + ' ' + o.height);
    // the neighbours at half tone (Canada, Mexico, Cuba, …), under everything: clipped to the frame less the inset box
    // around the lower 48, and to the inset box around Alaska (Steve, 2026-10-13: "grey them out half compared to US")
    var box = o.insets.box, defs = el('defs', {}, svg);
    el('path', { d: 'M0 0H' + o.width + 'V' + o.height + 'H0Z' + 'M' + box.x + ' ' + box.y + 'H' + box.w + 'V' + box.h + 'H' + box.x + 'Z', 'clip-rule': 'evenodd' }, el('clipPath', { id: 'clipMain' }, defs));
    el('rect', { x: box.x, y: box.y, width: box.w - box.x, height: box.h - box.y }, el('clipPath', { id: 'clipInset' }, defs));
    var far = el('g', { 'class': 'far' }, svg);
    [['far', 'clipMain', 'fill'], ['farEdge', 'clipMain', 'edge'], ['farAlaska', 'clipInset', 'fill'], ['farAlaskaEdge', 'clipInset', 'edge']].forEach(function (q) {
      if (o.paths[q[0]]) el('path', { d: o.paths[q[0]], 'clip-path': 'url(#' + q[1] + ')', 'class': 'far-' + q[2] }, far);
    });
    var land = el('g', { 'class': 'land' }, svg);
    ['lower48', 'alaska', 'hawaii', 'pr'].forEach(function (k) { if (o.paths[k]) el('path', { d: o.paths[k], 'class': 'land-' + k }, land); });
    // the state boundaries: stroke only, over the land, under the dots; the line keeps its width at every zoom
    if (o.paths.states) el('path', { d: o.paths.states, 'class': 'states', 'vector-effect': 'non-scaling-stroke' }, el('g', { 'class': 'borders' }, svg));
    // the big lakes as water over land and borders (the sources count them as land), shoreline stroked
    if (o.paths.lakes) el('path', { d: o.paths.lakes, 'class': 'lakes', 'vector-effect': 'non-scaling-stroke' }, svg);
    // a faint frame line between the insets and the mainland, as atlases draw it
    el('path', { d: 'M' + box.x + ' ' + box.y + 'H' + box.w + 'V' + box.h, 'class': 'inset-line' }, svg);
    var pins = el('g', { 'class': 'pins' }, svg), placed = [];
    cities.forEach(function (c) {
      var p = project(c.lon, c.lat), x = +p[0].toFixed(1), y = +p[1].toFixed(1);
      var a = el('a', { href: site(c), 'class': 'pin' + (c.live ? ' is-live' : ' is-soon'), 'data-key': c.key }, pins);
      a.setAttribute('aria-label', c.name + ', ' + c.state + (c.live ? '' : ' (coming soon)'));
      el('title', {}, a).textContent = c.name + ', ' + c.state + (c.live ? ' — open the calendar' : ' — coming soon');
      var lb = c.label || { dx: 10, dy: 4, anchor: 'start' };
      var far = Math.abs(lb.dx) > 12 || Math.abs(lb.dy) > 16; // a leader when the name sits away from its dot
      if (far) el('line', { x1: x, y1: y, x2: x + lb.dx * 0.8, y2: y + (lb.dy - 4) * 0.8, 'class': 'leader' }, a);
      el('circle', { cx: x, cy: y, r: 7, 'class': 'halo' }, a);
      el('circle', { cx: x, cy: y, r: 4.2, 'class': 'dot' }, a);
      var t = el('text', { x: x + lb.dx, y: y + lb.dy, 'text-anchor': lb.anchor, 'class': 'label' }, a);
      t.textContent = c.name;
      placed.push({ x: x, y: y, dx: lb.dx, dy: lb.dy, text: t, leader: far ? a.firstChild : null });
    });
    // the list under the map: state, city, link
    var ul = $('cityList'); ul.textContent = '';
    var byState = {};
    cities.forEach(function (c) { (byState[c.state] = byState[c.state] || []).push(c); });
    Object.keys(byState).sort().forEach(function (st) {
      byState[st].sort(function (a, b) { return a.name.localeCompare(b.name); }).forEach(function (c) {
        var li = document.createElement('li'); li.className = c.live ? 'is-live' : 'is-soon';
        var s = document.createElement('span'); s.className = 'st'; s.textContent = c.state; li.appendChild(s);
        var a = document.createElement('a'); a.href = site(c); a.textContent = c.name; li.appendChild(a);
        var n = document.createElement('span'); n.className = 'note'; n.textContent = c.live ? site(c).replace(/^https:\/\/|\/$/g, '') : 'coming soon'; li.appendChild(n);
        ul.appendChild(li);
      });
    });
    var live = cities.filter(function (c) { return c.live; }).length;
    $('count').textContent = live + ' live, ' + (cities.length - live) + ' on the way';
    zoomable(svg, o.width, o.height, function (k) { // names and leaders keep their screen offset from the dot
      var ks = parseFloat(svg.style.getPropertyValue('--ks')) || 1; k = Math.max(k, ks);
      placed.forEach(function (q) {
        q.text.setAttribute('x', (q.x + q.dx / k).toFixed(1)); q.text.setAttribute('y', (q.y + q.dy / k).toFixed(1));
        if (q.leader) { q.leader.setAttribute('x2', (q.x + q.dx * 0.8 / k).toFixed(1)); q.leader.setAttribute('y2', (q.y + (q.dy - 4) * 0.8 / k).toFixed(1)); }
      });
    });
  }).catch(function (e) { $('count').textContent = 'The map could not load (' + e.message + ').'; });
})();
