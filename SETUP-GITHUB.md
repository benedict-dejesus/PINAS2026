# Setting up auto-updating news on GitHub

This guide takes **Pinas 2026** from a folder on your laptop to a live site that
refreshes itself with Philippine news every six hours — for free, with no server.

Everything runs on GitHub Actions. Roughly: a scheduled job fetches headlines from
an allowlist of established newsrooms, matches each one to a place on the map,
commits the result, and redeploys the site.

**Time needed:** about 10 minutes, most of it waiting for the first run.

---

## Before you start

You need:

- The repository pushed to GitHub (yours is `benedict-dejesus/PINAS2026`).
- A GitHub account with Actions enabled (on by default for public repos).
- Nothing installed locally. No Node modules, no API keys, no paid services.

There are **no secrets to configure**. The pipeline only reads public RSS feeds.

---

## Step 1 — Push the project

From inside the `PINAS2026` folder:

```bash
git add -A && git commit -m "feat: auto-updating news pipeline, time-based filters, UI overhaul"
```

```bash
git push origin main
```

> **Note on the CRLF warning.** You'll likely see *"This file uses 'LF' line endings,
> but Git is configured to convert them to 'CRLF'"*. That's expected on Windows and
> harmless — Git stores LF in the repo and gives you CRLF locally.

---

## Step 2 — Let Actions write to the repository

The scheduled job commits the refreshed news file back to your repo, so it needs
write access. This is the single most common reason the setup fails, so do it now.

1. Go to your repo on GitHub → **Settings**
2. In the left sidebar: **Actions** → **General**
3. Scroll to **Workflow permissions**
4. Select **Read and write permissions**
5. Click **Save**

---

## Step 3 — Turn on GitHub Pages

1. **Settings** → **Pages** (left sidebar)
2. Under **Build and deployment** → **Source**, choose **GitHub Actions**

Do **not** pick "Deploy from a branch" — this project ships its own Pages
deployment step, and mixing the two causes conflicting deploys.

---

## Step 4 — Run it once by hand

Don't wait for the schedule. Trigger it now so you can watch it work.

1. Go to the **Actions** tab
2. Select **Update news & deploy** in the left sidebar
3. Click **Run workflow** → leave `dry_run` unchecked → **Run workflow**

The run takes about a minute. Open it and you'll see two jobs:

- **Fetch verified news** — pulls the feeds and commits any new stories
- **Deploy to GitHub Pages** — publishes the site

Click into the first job's summary and you'll get a report like:

```
  ✓ Inquirer.net      25 items → 25 placed
  ✓ GMA News          15 items →  9 placed
  ✓ Philstar.com      10 items →  6 placed
  ✓ MindaNews         25 items → 22 placed
  ...
  90 stories across 42 places (14 new this run)
  sources healthy: 11/11
```

"placed" means the story named a Philippine location the map could resolve.
Stories that don't are skipped on purpose — see [Why some stories are skipped](#why-some-stories-are-skipped).

---

## Step 5 — Visit your site

When the deploy job finishes, your map is live at:

```
https://benedict-dejesus.github.io/PINAS2026/
```

The URL also appears on the deploy job in the Actions run, and under
**Settings → Pages**.

That's it — you're done. From here it maintains itself.

---

## How the schedule works

The workflow runs **every 6 hours**, defined in
`.github/workflows/update-news.yml`:

```yaml
- cron: "17 23,5,11,17 * * *"
```

GitHub cron is **always UTC**. The Philippines is UTC+8, so those four runs land
at roughly **07:17, 13:17, 19:17, and 01:17 PHT**.

To change the frequency, edit that line. Some examples:

| You want | Use |
| --- | --- |
| Every 3 hours | `0 */3 * * *` |
| Twice a day | `0 22,10 * * *` |
| Once daily, 8am PHT | `0 0 * * *` |

Two things worth knowing about GitHub's scheduler:

- **It's best-effort.** Runs can be delayed by several minutes during busy
  periods, and occasionally skipped. This is normal and not worth chasing.
- **It goes to sleep.** GitHub disables scheduled workflows after **60 days
  without any commit** to the repository. You'll get an email first. Any push —
  or clicking "Run workflow" — wakes it back up.

---

## What gets published, and what doesn't

The pipeline is deliberately conservative, because the whole point of the map is
that you can trust what's on it.

**Only allowlisted sources.** `scripts/sources.mjs` is the trust boundary. If an
outlet isn't in that file, nothing from it can ever appear. The current list is
Inquirer, GMA News, Philstar, Rappler, BusinessWorld, Interaksyon, MindaNews, and
Panay News — all established newsrooms with editorial accountability.

**No invented text.** Headlines and summaries are the outlet's own words, taken
from its feed and stripped of markup. Nothing is paraphrased, summarised, or
generated. Every story keeps a link to the original article.

**No guessed locations.** A story is placed only when it names a location in
`scripts/gazetteer.mjs` (about 200 landmarks, cities, provinces, and regions). No
match means the story is dropped rather than placed somewhere plausible.

**Clear labelling.** Automated stories show a `◈ Auto` badge; your hand-researched
ones show `✔ Verified`. Readers always know which is which, and the About panel
explains the difference.

**Fail-safe.** If every source is unreachable, the script writes nothing at all,
so a network blip can never blank your map. If the story set hasn't changed, it
skips the commit rather than filling your history with empty updates.

### Why some stories are skipped

Seeing "10 items → 0 placed" is normal, not a bug. It usually means that batch was
arts reviews, opinion columns, or international news with no Philippine place named
in the headline or summary. The pipeline refuses to guess.

---

## Customising it

### Add a news source

Edit `scripts/sources.mjs` and add an entry:

```js
{
  outlet: "Newsroom Name",
  url: "https://example.com/feed/",
  weight: 7,
  note: "What this desk covers",
},
```

`weight` decides which outlet gets the credit when the same story arrives from
several feeds — higher wins. Before adding, confirm the outlet is an established
newsroom (masthead, named editors, corrections policy) and that the feed URL
returns XML with `<item>` or `<entry>` tags.

Then test it locally before pushing:

```bash
node scripts/fetch-news.mjs --dry-run
```

### Add a place

Edit `scripts/gazetteer.mjs`. Each entry is:

```js
P("id", "Display Name", "Area", lat, lng, rank, "alias|other alias", "Wikipedia Title"),
```

`rank` is 3 for landmarks, 2 for cities, 1 for provinces, 0 for island groups —
more specific places win when several match. The Wikipedia title is only used to
fetch a representative photo.

### Tune the behaviour

The knobs live at the top of `scripts/fetch-news.mjs`:

| Setting | Default | What it does |
| --- | --- | --- |
| `retentionDays` | 120 | How long auto stories stay on the map |
| `maxItems` | 400 | Hard cap on stored stories |
| `maxPerPlacePerDay` | 3 | Stops one busy city burying everywhere else |
| `perSourceLimit` | 25 | Newest N items read per feed per run |

### Add your own verified story

Automated ingestion never touches `js/news-data.js` — that file is yours. Add a
hand-researched story there and it appears with the `✔ Verified` badge and always
wins over any automated copy of the same article.

---

## Running the pipeline locally

Useful for testing changes before you push. Requires Node 20 or newer; there are
no dependencies to install.

```bash
node scripts/fetch-news.mjs --dry-run
```

Add `--verbose` to see why individual stories were skipped:

```bash
node scripts/fetch-news.mjs --dry-run --verbose
```

Drop `--dry-run` to actually write `data/auto-news.json`.

To preview the site locally:

```bash
npx http-server . -p 5174 -c-1
```

---

## Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| Workflow fails at "Commit refreshed data" with a 403 | Step 2 was missed. Settings → Actions → General → Workflow permissions → **Read and write**. |
| Deploy job fails with "Pages not enabled" | Step 3 was missed, or Source isn't set to **GitHub Actions**. |
| Site loads but shows only your hand-written stories | `data/auto-news.json` hasn't been committed yet. Run the workflow manually and check the ingest log. |
| One source shows ✗ in the log | Usually a temporary timeout or the outlet blocking cloud IPs. Harmless if others succeeded — the run continues. If it fails every time for a week, remove it from `sources.mjs`. |
| Scheduled runs stopped | 60 days of repo inactivity disables them. Push any commit, or click **Run workflow**. |
| Story placed in the wrong city | The headline named that place more prominently. Add a more specific alias in `gazetteer.mjs`, or add the phrase to `PLACE_MATCH_STOPWORDS` in `sources.mjs`. |
| Map is blank, browser console shows a Leaflet error | Hard-refresh (Ctrl+Shift+R). If it persists, check that `vendor/leaflet/` was committed. |

To see what the scheduler is doing at any time, open the **Actions** tab — every
run keeps its log and summary.

---

## What lives where

```
PINAS2026/
├─ index.html                      the app shell
├─ css/styles.css                  all styling and animation
├─ js/
│  ├─ news-data.js                 YOUR hand-verified stories (never auto-edited)
│  └─ app.js                       map, filters, sheet, merge logic
├─ data/
│  └─ auto-news.json               generated — do not edit by hand
├─ scripts/
│  ├─ sources.mjs                  the credible-source allowlist
│  ├─ gazetteer.mjs                places the map can resolve
│  └─ fetch-news.mjs               the ingestion pipeline
├─ vendor/leaflet/                 map library, vendored so no CDN can break it
└─ .github/workflows/
   └─ update-news.yml              the scheduled job
```
