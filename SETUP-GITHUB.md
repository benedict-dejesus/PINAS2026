# Setting up auto-updating news on GitHub

*Pinas 2026 — your 24/7 distributor of credible local news.*
*By Benedict de Jesus, Author & Developer.*

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

## Step 2 — (nothing to do)

Earlier versions of this project committed the news file back to the repository,
which needed write permissions. **They no longer do.** The news is generated
during the deploy and shipped straight into the published site, so the workflow
runs with read-only access to your code.

If you previously set **Settings → Actions → General → Workflow permissions** to
*Read and write*, you can safely put it back to *Read repository contents*.

Why it changed: a bot committing to `main` meant your branch could diverge from
GitHub the moment you edited anything locally, and both sides would fight over
the same generated file. Not committing it removes that whole class of problem.

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

> **Only see `pages-build-deployment` in the sidebar?** Then the workflow file
> hasn't reached GitHub yet — committing alone isn't enough, it has to be pushed.
> GitHub only lists a workflow (and only shows its **Run workflow** button) once
> the file exists on the default branch. Check with:
>
> ```bash
> git status -sb
> ```
>
> If it says `ahead 1` (or more), run `git push origin main` and refresh the
> Actions tab. The push itself also starts the workflow, so you may not need to
> click anything.

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

> **The URL is case-sensitive.** `PINAS2026` must be in capitals — visiting
> `/pinas2026/` returns a GitHub 404 even though the site is working perfectly.
> This catches people out on phones, where autocorrect and typed URLs tend to be
> lowercase. Bookmark it or send yourself the link rather than retyping it.

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
| `retentionDays` | 7 | How long stories stay on the map before rolling off |
| `maxItems` | 600 | Hard cap on stored stories (~50/day × 7 days, with headroom) |
| `maxPerPlacePerDay` | 3 | Stops one busy city burying everywhere else |
| `perSourceLimit` | 25 | Newest N items read per feed per run |

**Keep `retentionDays` and the UI in sync.** The app enforces its own cutoff via
`MAX_AGE_DAYS` in `js/app.js` (also 7). If you widen one, widen the other —
otherwise the ingest stores stories the interface will never display, or the
interface promises a window the data doesn't cover.

### Where the news file actually lives

`data/auto-news.json` is **generated, never committed** — it's in `.gitignore`.
Each run of the workflow:

1. restores the previous archive from the **Actions cache**,
2. merges in whatever the feeds are carrying now,
3. drops anything older than 7 days,
4. ships the result inside the Pages artifact, and
5. saves the updated archive back to the cache for next time.

The cache is what lets the map hold a full week of stories when RSS feeds only expose
the last few days. If it's ever evicted (GitHub clears caches unused for 7 days,
which won't happen while the schedule runs every 6 hours), the next run simply
rebuilds from the feeds and starts accumulating again — nothing breaks.

Because nothing is committed, **the bot never touches your repository**, so your
branch can't diverge and that file can never cause a merge conflict.

To work on the map locally, generate a copy yourself:

```bash
node scripts/fetch-news.mjs
```

Without it the map still runs — it just shows your hand-verified stories only.

### Why the map size stays flat

Because stories roll off after a week, the data file reaches a steady state
instead of growing forever: roughly 250–350 stories, about 300 KB raw and
~80 KB gzipped over the wire. It will look much the same in December as it does
today, with no maintenance from you.

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
| **404 on your phone** but the site works elsewhere | The URL path is case-sensitive. Use `/PINAS2026/`, not `/pinas2026/`. |
| "Update news & deploy" isn't in the Actions sidebar | The workflow file isn't on GitHub. Run `git status -sb`; if it says `ahead`, `git push origin main`. Committing locally is not enough. |
| Actions tab only shows `pages-build-deployment` | Same cause as above. That entry is GitHub's own Pages job, not this project's workflow. |
| Site shows far fewer stories than usual after a run | The Actions cache was evicted, so the archive restarted from whatever the feeds currently carry (about 5 days). It refills on its own over the following days. |
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
│  └─ auto-news.json               generated + gitignored — never committed
├─ scripts/
│  ├─ sources.mjs                  the credible-source allowlist
│  ├─ gazetteer.mjs                places the map can resolve
│  └─ fetch-news.mjs               the ingestion pipeline
├─ vendor/leaflet/                 map library, vendored so no CDN can break it
└─ .github/workflows/
   └─ update-news.yml              the scheduled job
```
