// here.events — the covered-cities map. Draws the US outline from
// us-outline.json, places one dot per city from cities.json with the same
// Albers-USA projection scripts/build-map.mjs used (the numbers must match),
// and lists the cities below the map. No libraries.
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
  function projector(o) { // o: the outline file's width/height/scale/tx/ty
    var K = o.scale, TX = o.tx, TY = o.ty;
    var lower48 = make(29.5, 45.5, 96, [-0.6, 38.7], K, TX, TY);
    var alaska = make(55, 65, 154, [-2, 58.5], K * 0.35, TX - 0.307 * K, TY + 0.201 * K);
    var hawaii = make(8, 18, 157, [-3, 19.9], K, TX - 0.205 * K, TY + 0.212 * K);
    return function (lon, lat) { return (lat > 50 ? alaska : lat < 23 && lon < -140 ? hawaii : lower48)(lon, lat); };
  }

  var NS = 'http://www.w3.org/2000/svg';
  function el(name, attrs, parent) {
    var e = document.createElementNS(NS, name);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function site(c) { return c.url || 'https://' + c.key + '.here.events/'; } // a neighbourhood sits under its city (lqa.seattle.here.events, 2026-10-11)

  Promise.all([fetch('us-outline.json').then(function (r) { return r.json(); }), fetch('cities.json').then(function (r) { return r.json(); })]).then(function (res) {
    var o = res[0], cities = res[1].cities, project = projector(o);
    var svg = $('usMap');
    svg.setAttribute('viewBox', '0 0 ' + o.width + ' ' + o.height);
    var land = el('g', { 'class': 'land' }, svg);
    ['lower48', 'alaska', 'hawaii'].forEach(function (k) { el('path', { d: o.paths[k], 'class': 'land-' + k }, land); });
    // a faint frame line between the insets and the mainland, as atlases draw it
    el('path', { d: 'M' + (o.tx - 0.42 * o.scale).toFixed(0) + ' ' + (o.ty + 0.165 * o.scale).toFixed(0) + 'h' + (0.30 * o.scale).toFixed(0) + 'v' + (0.12 * o.scale).toFixed(0), 'class': 'inset-line' }, svg);
    var pins = el('g', { 'class': 'pins' }, svg);
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
  }).catch(function (e) { $('count').textContent = 'The map could not load (' + e.message + ').'; });
})();
