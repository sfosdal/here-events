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
- `site/us-outline.json` — the projected outline, state boundaries, lakes and
  neighbouring land (generated, committed; ~400 KB at 1:50m), in a 1280×640
  frame: the lower 48 right of centre, the Alaska and Hawaii boxes stacked in
  the left column, Puerto Rico in the Atlantic off the Carolinas, each inset
  scaled to fill its box; neighbouring land is drawn 200 units past the frame
  on every side so a zoomed or letterboxed view never shows an edge.
- `site/us-outline-fine.json` — the same at 1:10m (~1.4 MB, thinned), fetched
  by map.js the first time the reader zooms past 3× and swapped in.
- `site/share.png` — the 1200×630 Open Graph card (screenshot of `index.html?share`).
- `scripts/build-map.mjs` — downloads Natural Earth 1:50m and 1:10m admin-0
  countries, admin-1 states and lakes into `.cache/` (gitignored), projects the
  United States with Albers USA (lower 48; Alaska, Hawaii and Puerto Rico as
  insets fitted to boxes it checks the mainland stays clear of) and writes
  both outline files (`paths.lower48/alaska/hawaii/pr` filled, `paths.states`
  and `paths.lakes` stroke-only, `paths.far*` the half-tone neighbours, bled
  past the frame; the page fades the map's edges into the background with a
  gradient overlay in `styles.css`).
- The crosshair button under the zoom buttons asks the browser for the
  reader's location, zooms there, drops a pulsing marker and lights the nearest
  live city (named with its distance in the caption).

## Build

```
node scripts/build-map.mjs      # only needed if the outline or projection changes
python3 -m http.server -d site 8107
```

## Data

Map outline, state boundaries and lakes from
[Natural Earth](https://www.naturalearthdata.com/), 1:50m and 1:10m, public domain.
