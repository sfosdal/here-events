# here.events

The landing page for the here.events city calendars: a clickable US map
(state boundaries, zoom and pan) with one dot per covered city, linking to
`https://<key>.here.events/`.

## Files

- `site/index.html`, `site/styles.css`, `site/map.js` — the page. No
  third-party runtime dependencies. `map.js` draws the outline and the state
  lines, places the dots, and zooms and pans by moving the SVG `viewBox`:
  the wheel, a pinch, a drag, the + − buttons, double-click (shift for out),
  and the keyboard (+ − 0, arrows) once the map is focused; scale 1–8. Dots
  and names keep their screen size (`--k` in the CSS), lines use
  non-scaling strokes. On a phone one finger scrolls the page until the
  map is zoomed in, then it pans the map; the names appear when zoomed.
- `site/cities.json` — the cities: `key`, `name`, `city`, `state`, `lat`,
  `lon`, `tz`, `live`, optional `label {dx, dy, anchor}` for label placement.
- `site/us-outline.json` — the projected outline and the state boundaries
  (generated, committed; ~200 KB at 1:50m).
- `site/share.png` — the 1200×630 Open Graph card (screenshot of `index.html?share`).
- `scripts/build-map.mjs` — downloads Natural Earth 1:50m admin-0 countries
  and admin-1 states into `.cache/` (gitignored), projects the United States
  with Albers USA (lower 48, Alaska and Hawaii insets) and writes
  `site/us-outline.json` (`paths.lower48/alaska/hawaii` filled, `paths.states`
  stroke-only).

## Build

```
node scripts/build-map.mjs      # only needed if the outline or projection changes
python3 -m http.server -d site 8107
```

## Data

Map outline and state boundaries from
[Natural Earth](https://www.naturalearthdata.com/), 1:50m, public domain.
