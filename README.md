# Pinas 2026 🇵🇭

### Your credible, 24/7 guide to the latest local news

**A live map of the Philippines where the landmarks are the news.**

Instead of labelling towns and provinces, this map plots news stories where they
happened. Some places are empty. Others — Malacañang, the Senate, Ayungin Shoal —
stack up several stories at once. Markers are coloured by how fresh the story is,
so you can see at a glance where the country is loudest right now.

Built as a static site: no backend, no build step, no dependencies to install.

---

## What it does

- **Always current.** The map holds a rolling **31-day window**. Filter by Today,
  This week, or This month; older stories roll off automatically, so the map stays
  fast and never becomes a stale archive.
- **Freshness at a glance.** Marker colour and pulse speed follow the same scale —
  today's news glows hot pink and beats fastest.
- **News hotspots.** Nearby places cluster automatically; tap a cluster to zoom in
  until it splits apart.
- **Two kinds of story, always labelled.** `✔ Verified` stories are hand-researched
  and cross-checked. `◈ Auto` stories are pulled every six hours from an allowlist
  of established Philippine newsrooms, in the outlet's own words, always linking
  back to the original.
- **Mobile-first.** A draggable bottom sheet on phones becomes a floating side
  panel on desktop.
- **Self-updating.** A GitHub Action refreshes the news and redeploys the site on a
  schedule, with no server to run or pay for.

---

## Quick start

Open `index.html` in a browser, or serve it locally:

```bash
npx http-server . -p 5174 -c-1
```

The live news file (`data/auto-news.json`) is generated, not committed. To pull a
copy for local development:

```bash
node scripts/fetch-news.mjs
```

Without it the map still works — it just shows the hand-verified stories only.

To set up automatic updates and publish it to the web, follow
**[SETUP-GITHUB.md](SETUP-GITHUB.md)** — about 10 minutes, no API keys required.

---

## Verifiability

This is the project's first priority, ahead of looks and features.

Automated stories can only come from `scripts/sources.mjs`, a hand-picked list of
newsrooms with real editorial accountability. Their text is never rewritten or
generated — it's the outlet's own headline and summary, with a link to the full
article. A story is only placed on the map when it clearly names a Philippine
location; if it can't be located, it's dropped rather than guessed. Hand-verified
stories always take precedence over an automated copy of the same article.

---

## Adding your own story

Edit `js/news-data.js`. The automated pipeline never touches this file.

```js
{
  id: "unique-slug",
  place: "malacanang",              // key from PLACES in the same file
  category: "politics",             // sets the marker icon
  date: "2026-07-27",
  title: "Headline",
  summary: "A paragraph in your own words.",
  wiki: "Wikipedia Article Title",  // optional, used for the photo
  sources: [
    { outlet: "Inquirer.net", url: "https://…" },
  ],
}
```

Add a place by extending `PLACES` in the same file with `{ name, area, lat, lng }`.

---

> **Note:** stories older than the 31-day window stay in the file but aren't
> shown. Widen `MAX_AGE_DAYS` in `js/app.js` to bring them back.

---

## Author

**Benedict de Jesus** — Author & Developer

---

## Credits

Map rendering by [Leaflet](https://leafletjs.com/) (vendored locally). Basemap
tiles © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors and
© [CARTO](https://carto.com/), with an automatic fallback to OSM tiles. Photos are
representative images loaded from Wikipedia/Wikimedia. All journalism belongs to
the outlets linked inside each story.
