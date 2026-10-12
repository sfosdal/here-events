# here.events

The landing page for the here.events city calendars: a clickable US outline
with one dot per covered city, linking to `https://<key>.here.events/`.

## Files

- `site/index.html`, `site/styles.css`, `site/map.js` — the page. No
  third-party runtime dependencies.
- `site/cities.json` — the cities: `key`, `name`, `city`, `state`, `lat`,
  `lon`, `tz`, `live`, optional `label {dx, dy, anchor}` for label placement.
- `site/us-outline.json` — the projected outline (generated, committed).
- `site/share.png` — the 1200×630 Open Graph card (screenshot of `index.html?share`).
- `scripts/build-map.mjs` — downloads Natural Earth 1:110m admin-0 countries
  into `.cache/` (gitignored), projects the United States with Albers USA
  (lower 48, Alaska and Hawaii insets) and writes `site/us-outline.json`.

## Build

```
node scripts/build-map.mjs      # only needed if the outline or projection changes
python3 -m http.server -d site 8107
```

## Data

Map outline from [Natural Earth](https://www.naturalearthdata.com/), 1:110m,
public domain.
