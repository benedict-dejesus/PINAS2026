#!/usr/bin/env node
/**
 * PINAS 2026 — automated news ingestion.
 *
 * Pulls headlines from the credible-source allowlist in sources.mjs, places
 * each story using gazetteer.mjs, and writes data/auto-news.json.
 *
 * Volume policy (the shape of the whole archive):
 *   • A harvest keeps only the TOP 3 headlines it finds, and harvests run at
 *     most once every 6 hours — 12 stories a day, 84 in a week.
 *   • Anything older than 7 days is deleted on every run, harvest or not.
 *   So the file converges on ~84 stories and stays there.
 *
 * Design rules that protect the map's credibility:
 *   • Allowlist only. No source outside sources.mjs is ever read.
 *   • No invented text. Titles and summaries are the outlet's own words,
 *     stripped of markup and truncated — never paraphrased or generated.
 *   • No guessed locations. A story with no gazetteer match is dropped.
 *   • Every item keeps a direct link to the original article.
 *   • Auto items are labelled provenance:"auto" so the UI can distinguish
 *     them from hand-verified curated stories.
 *   • A run that reaches zero sources adds nothing, so a network outage can
 *     never blank the map.
 *
 * Usage:
 *   node scripts/fetch-news.mjs            # prune, harvest if due, write if changed
 *   node scripts/fetch-news.mjs --dry-run  # report only, never write
 *   node scripts/fetch-news.mjs --force    # harvest even if the 6h gap hasn't elapsed
 *   node scripts/fetch-news.mjs --verbose  # per-item decisions
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SOURCES, PLACE_MATCH_STOPWORDS } from "./sources.mjs";
import { GAZETTEER } from "./gazetteer.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT_FILE = join(ROOT, "data", "auto-news.json");

const CONFIG = {
  // The map is a guide to the LATEST news: Today / Last 3 days / This week.
  // Anything past a week is deleted, which also keeps the payload flat
  // forever instead of growing without bound.
  // Must stay in sync with MAX_AGE_DAYS in js/app.js.
  retentionDays: 7,
  // Only the three most prominent new headlines survive a harvest.
  topPerRun: 3,
  // Harvest cadence, enforced here rather than trusted to the scheduler: the
  // workflow also runs on every push, and without this gate each push would
  // slip three extra stories into the archive. Slightly under 6h so a cron
  // run that fires a few minutes early is still treated as due.
  minHoursBetweenHarvests: 5.5,
  // 3 × 4 runs × 7 days = 84, plus headroom for clock/timezone edges.
  maxItems: 100,
  maxPerPlacePerDay: 3, // stops one busy city from burying the rest of the map
  maxSummaryChars: 320,
  // Only the top of each feed is read — feed order is the outlet's own
  // judgement of prominence, and that is what "top headline" means here.
  perSourceLimit: 10,
  fetchTimeoutMs: 20000,
  retries: 2,
  userAgent: "Mozilla/5.0 (compatible; Pinas2026Bot/1.0; +https://github.com/benedict-dejesus/PINAS2026)",
};

const argv = new Set(process.argv.slice(2));
const DRY_RUN = argv.has("--dry-run");
const VERBOSE = argv.has("--verbose");
const FORCE = argv.has("--force");

/* ————————————————————————————— utilities ————————————————————————————— */

const log = (...a) => console.log(...a);
const vlog = (...a) => VERBOSE && console.log("   ", ...a);

const NAMED_ENTITIES = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  ldquo: "“", rdquo: "”", lsquo: "‘", rsquo: "’",
  mdash: "—", ndash: "–", hellip: "…", eacute: "é", ntilde: "ñ",
  Ntilde: "Ñ", peso: "₱", deg: "°",
};

function decodeEntities(str) {
  return str
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => safeChar(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => safeChar(parseInt(d, 10)))
    .replace(/&([a-z][a-z0-9]*);/gi, (m, name) =>
      Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, name) ? NAMED_ENTITIES[name] : m
    );
}

function safeChar(code) {
  return Number.isFinite(code) && code > 0 && code <= 0x10ffff
    ? String.fromCodePoint(code)
    : "";
}

function clean(raw) {
  if (!raw) return "";
  return decodeEntities(
    String(raw)
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
      .replace(/<[^>]*>/g, " ")
  )
    .replace(/\s+/g, " ")
    .trim();
}

function truncate(text, max) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[,;:.\s]+$/, "") + "…";
}

/** Stable short id from a URL, so reruns don't churn ids. */
function hashId(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function normalizeTitle(title) {
  return title.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Fingerprint for "this is the same story" across outlets. Returns null for
 * headlines too short to fingerprint safely, so two unrelated three-word
 * titles are never collapsed into one.
 */
function titleKey(title) {
  const key = normalizeTitle(title).split(" ").slice(0, 9).join(" ");
  return key.length > 12 ? key : null;
}

function canonicalUrl(url) {
  try {
    const u = new URL(url);
    u.hash = "";
    u.search = "";
    return u.toString().replace(/\/$/, "");
  } catch {
    return url;
  }
}

/* ————————————————————————————— fetching ————————————————————————————— */

async function fetchFeed(source) {
  for (let attempt = 0; attempt <= CONFIG.retries; attempt++) {
    try {
      const res = await fetch(source.url, {
        signal: AbortSignal.timeout(CONFIG.fetchTimeoutMs),
        redirect: "follow",
        headers: { "user-agent": CONFIG.userAgent, accept: "application/rss+xml, application/xml, text/xml, */*" },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (err) {
      if (attempt === CONFIG.retries) throw err;
      await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
    }
  }
}

/** Minimal RSS 2.0 + Atom parser. Deliberately dependency-free. */
function parseFeed(xml) {
  const items = [];
  const blocks = xml.match(/<(item|entry)\b[\s\S]*?<\/\1>/gi) || [];
  for (const block of blocks) {
    const pick = (tag) => {
      const m = block.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
      return m ? m[1] : "";
    };
    const title = clean(pick("title"));
    if (!title) continue;

    // RSS puts the URL in <link>text</link>; Atom uses <link href="..."/>.
    let link = clean(pick("link"));
    if (!link || !/^https?:/i.test(link)) {
      const alt =
        block.match(/<link\b[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["']/i) ||
        block.match(/<link\b[^>]*href=["']([^"']+)["']/i);
      link = alt ? decodeEntities(alt[1]) : "";
    }
    if (!/^https?:\/\//i.test(link)) continue;

    const dateRaw =
      pick("pubDate") || pick("published") || pick("updated") || pick("dc:date");
    const summary =
      clean(pick("description")) || clean(pick("summary")) || clean(pick("content:encoded"));

    // feedIndex preserves the outlet's own ordering — the lead story first.
    items.push({ title, link, dateRaw: clean(dateRaw), summary, feedIndex: items.length });
  }
  return items;
}

function toIsoDate(raw) {
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

/* ———————————————————————— placing & classifying ———————————————————————— */

// Longest aliases first so "Cebu City" wins over "Cebu".
const MATCHERS = GAZETTEER.flatMap((place) =>
  place.aliases.map((alias) => ({
    place,
    alias,
    // Unicode-aware word boundaries so "Malacañang" and "Parañaque" match.
    re: new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegex(alias)}(?![\\p{L}\\p{N}])`, "iu"),
  }))
).sort((a, b) => b.alias.length - a.alias.length);

const STOP_RE = PLACE_MATCH_STOPWORDS.map(
  (p) => new RegExp(escapeRegex(p), "gi")
);

function matchPlace(title, summary) {
  const scrub = (t) => STOP_RE.reduce((acc, re) => acc.replace(re, " "), t || "");
  const cleanTitle = scrub(title);
  const cleanBody = scrub(summary);
  const haystack = `${cleanTitle} ${cleanBody}`;

  let best = null;
  for (const m of MATCHERS) {
    if (!m.re.test(haystack)) continue;
    const inTitle = m.re.test(cleanTitle);
    // A real geographic mention always beats an agency mention, because
    // agencies are named in stories that happen elsewhere. Within a kind,
    // specific places beat broad ones and the headline beats the body.
    const score =
      (m.place.kind === "institution" ? 400 : 1000) +
      m.place.rank * 50 +
      (inTitle ? 200 : 0) +
      Math.min(m.alias.length, 30);
    if (!best || score > best.score) best = { place: m.place, score, alias: m.alias, inTitle };
  }
  return best;
}

const CLASSIFIERS = [
  ["wps", /ayungin|scarborough|panatag|bajo de masinloc|west philippine sea|south china sea|china coast guard|spratly|recto bank|pag-asa island|sierra madre|maritime zones/i],
  ["disaster", /typhoon|bagyo|earthquake|quake|volcano|erupt|phivolcs|pagasa|habagat|flood|landslide|tsunami|storm surge|ashfall|evacuat|magnitude|low pressure area|drought|el ni[nñ]o/i],
  ["justice", /impeach|ombudsman|sandiganbayan|graft|plunder|corrupt|court|trial|convict|acquit|arrest|warrant|prosecut|indict|icc |department of justice|human rights|ancestral domain|illegal dump/i],
  ["infra", /economy|inflation|gdp|bangko sentral|peso|interest rate|investment|infrastructure|railway|subway|airport|semiconductor|budget|trade|export|import|business|jobs|employment|energy|power plant|toll|expressway|construction/i],
  ["culture", /gilas|palaro|sea games|olympic|basketball|volleyball|boxing|festival|tourism|tourist|film|movie|concert|miss universe|binibining|heritage|cuisine|award/i],
  ["politics", /senate|congress|house of representatives|marcos|malaca[nñ]ang|palace|election|comelec|barmm|governor|mayor|dilg|cabinet|sona|asean|diplomat|ambassador|summit|bill|law|charter/i],
];

function classify(title, summary) {
  const text = `${title} ${summary}`;
  for (const [cat, re] of CLASSIFIERS) if (re.test(text)) return cat;
  return "politics";
}

/* ——————————————————————— ranking the headlines ——————————————————————— */

/**
 * How much of a "top headline" a candidate is. There is no popularity signal
 * in an RSS feed, so this leans on the three things a feed does tell us:
 * which newsroom ran it, how high the newsroom placed it, and how fresh it is.
 */
function prominence(candidate, source, today) {
  const ageDays = Math.round((Date.parse(today) - Date.parse(candidate.date)) / 864e5);
  const freshness = ageDays <= 0 ? 30 : ageDays === 1 ? 12 : 0;
  return (
    (source.weight ?? 5) * 8 +                          // outlet standing
    Math.max(0, 40 - candidate.feedIndex * 4) +         // position in the feed
    freshness +
    (candidate.inTitle ? 6 : 0)                         // place named in the headline
  );
}

/**
 * Choose the run's three headlines. Anything already archived — by id or by
 * headline fingerprint — is out, so the same story can't be counted twice on
 * consecutive runs. The first pass insists on three different outlets and
 * three different places; a second pass fills any remaining slot without
 * those constraints, so a quiet run still returns three stories.
 */
function pickTopHeadlines(candidates, archive) {
  const archivedIds = new Set(archive.map((i) => i.id));
  const archivedKeys = new Set(archive.map((i) => titleKey(i.title)).filter(Boolean));
  const placeDay = new Map();
  for (const i of archive) {
    const k = `${i.place}|${i.date}`;
    placeDay.set(k, (placeDay.get(k) ?? 0) + 1);
  }

  const pool = candidates
    .filter((c) => !archivedIds.has(c.id))
    .filter((c) => {
      const k = titleKey(c.title);
      return !(k && archivedKeys.has(k));
    })
    .sort((a, b) => b.prominence - a.prominence || a.id.localeCompare(b.id));

  const picked = [];
  const takenIds = new Set();
  const usedKeys = new Set();
  const usedOutlets = new Set();
  const usedPlaces = new Set();

  for (const strict of [true, false]) {
    for (const c of pool) {
      if (picked.length >= CONFIG.topPerRun) break;
      if (takenIds.has(c.id)) continue;

      const key = titleKey(c.title);
      if (key && usedKeys.has(key)) continue;

      const pdKey = `${c.place}|${c.date}`;
      if ((placeDay.get(pdKey) ?? 0) >= CONFIG.maxPerPlacePerDay) {
        vlog(`skip (place/day cap) ${c.title.slice(0, 50)}`);
        continue;
      }

      const outlet = c.sources[0]?.outlet;
      if (strict && (usedOutlets.has(outlet) || usedPlaces.has(c.place))) continue;

      picked.push(c);
      takenIds.add(c.id);
      if (key) usedKeys.add(key);
      usedOutlets.add(outlet);
      usedPlaces.add(c.place);
      placeDay.set(pdKey, (placeDay.get(pdKey) ?? 0) + 1);
    }
    if (picked.length >= CONFIG.topPerRun) break;
  }
  return picked;
}

/* ————————————————————————————— pipeline ————————————————————————————— */

async function loadExisting() {
  try {
    const raw = await readFile(OUT_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed.items) ? parsed : { items: [] };
  } catch {
    return { items: [] };
  }
}

/** Assemble the file from a finished item list. */
function buildPayload({ items, startedAt, lastHarvestAt, health, added }) {
  // Emit only the places actually referenced.
  const places = {};
  for (const item of items) {
    if (places[item.place]) continue;
    const gid = item.place.replace(/^gaz:/, "");
    const p = GAZETTEER.find((g) => g.id === gid);
    if (p) places[item.place] = { name: p.name, area: p.area, lat: p.lat, lng: p.lng, wiki: p.wiki };
  }
  return {
    generatedAt: startedAt.toISOString(),
    // Distinct from generatedAt: a prune-only run rewrites the file without
    // harvesting, and must not push the next harvest 6 hours further out.
    lastHarvestAt,
    retentionDays: CONFIG.retentionDays,
    topPerRun: CONFIG.topPerRun,
    counts: { items: items.length, places: Object.keys(places).length, addedThisRun: added },
    sourceHealth: health,
    places,
    items,
  };
}

/** Newest first, deterministic tiebreak so identical sets produce identical files. */
const byRecency = (a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id);

async function main() {
  const startedAt = new Date();
  log(`\nPINAS 2026 — news ingest  ${startedAt.toISOString()}`);
  log(`Sources: ${SOURCES.length} · gazetteer: ${GAZETTEER.length} places`);
  log(`Policy: top ${CONFIG.topPerRun} headlines per harvest, every ` +
      `${CONFIG.minHoursBetweenHarvests}h+, kept ${CONFIG.retentionDays} days\n`);

  const todayMs = Date.now();
  const today = new Date(todayMs).toISOString().slice(0, 10);
  const oldestAllowed = new Date(todayMs - CONFIG.retentionDays * 864e5)
    .toISOString().slice(0, 10);
  const newestAllowed = new Date(todayMs + 2 * 864e5).toISOString().slice(0, 10);

  const existing = await loadExisting();
  const priorFingerprint = JSON.stringify(existing.items ?? []);

  // ————— retention: this runs every time, harvest or not —————
  const archive = (existing.items ?? []).filter((i) => i.date >= oldestAllowed);
  const expired = (existing.items ?? []).length - archive.length;
  if (expired) log(`  ⌫ deleted ${expired} stor${expired === 1 ? "y" : "ies"} older than ${CONFIG.retentionDays} days`);

  // ————— is a harvest due? —————
  const lastHarvestAt = existing.lastHarvestAt ?? existing.generatedAt ?? null;
  const hoursSince = lastHarvestAt
    ? (todayMs - Date.parse(lastHarvestAt)) / 36e5
    : Infinity;
  const due = FORCE || !(hoursSince >= 0) || hoursSince >= CONFIG.minHoursBetweenHarvests;

  if (!due) {
    log(`\nLast harvest was ${hoursSince.toFixed(1)}h ago — next one is due in ` +
        `${(CONFIG.minHoursBetweenHarvests - hoursSince).toFixed(1)}h. Pruning only.`);
    await finish({
      items: archive.sort(byRecency),
      startedAt,
      lastHarvestAt,
      health: existing.sourceHealth ?? [],
      added: 0,
      priorFingerprint,
    });
    return;
  }

  const health = [];
  const harvested = [];

  const results = await Promise.allSettled(
    SOURCES.map(async (source) => ({ source, xml: await fetchFeed(source) }))
  );

  for (let i = 0; i < results.length; i++) {
    const source = SOURCES[i];
    const result = results[i];
    if (result.status === "rejected") {
      health.push({ outlet: source.outlet, url: source.url, ok: false, error: String(result.reason?.message || result.reason).slice(0, 120), items: 0 });
      log(`  ✗ ${source.outlet.padEnd(16)} ${String(result.reason?.message || result.reason).slice(0, 60)}`);
      continue;
    }
    let parsed = [];
    try {
      parsed = parseFeed(result.value.xml).slice(0, CONFIG.perSourceLimit);
    } catch (err) {
      health.push({ outlet: source.outlet, url: source.url, ok: false, error: `parse: ${err.message}`, items: 0 });
      continue;
    }
    let kept = 0;
    for (const raw of parsed) {
      const date = toIsoDate(raw.dateRaw);
      if (!date || date < oldestAllowed || date > newestAllowed) {
        vlog(`skip (date ${date}) ${raw.title.slice(0, 50)}`);
        continue;
      }
      const hit = matchPlace(raw.title, raw.summary);
      if (!hit) {
        vlog(`skip (no place) ${raw.title.slice(0, 50)}`);
        continue;
      }
      const candidate = {
        id: `auto-${hashId(canonicalUrl(raw.link))}`,
        place: `gaz:${hit.place.id}`,
        category: classify(raw.title, raw.summary),
        date,
        title: truncate(raw.title, 160),
        summary: truncate(raw.summary || raw.title, CONFIG.maxSummaryChars),
        provenance: "auto",
        matchedOn: hit.alias,
        sources: [{ outlet: source.outlet, url: raw.link }],
        feedIndex: raw.feedIndex,
        inTitle: hit.inTitle,
      };
      candidate.prominence = prominence(candidate, source, today);
      harvested.push(candidate);
      kept++;
    }
    health.push({ outlet: source.outlet, url: source.url, ok: true, items: parsed.length, placed: kept });
    log(`  ✓ ${source.outlet.padEnd(16)} ${String(parsed.length).padStart(3)} items → ${kept} placed`);
  }

  const okSources = health.filter((h) => h.ok).length;
  if (okSources === 0) {
    log("\n⚠ Every source failed. Adding nothing, and leaving the harvest clock alone so the next run retries.");
    await finish({
      items: archive.sort(byRecency),
      startedAt,
      lastHarvestAt,
      health,
      added: 0,
      priorFingerprint,
    });
    return;
  }

  // ————— keep only the run's top 3 —————
  const picked = pickTopHeadlines(harvested, archive);

  const items = [...archive, ...picked]
    .map(({ feedIndex, inTitle, prominence: _p, ...rest }) => rest) // strip build-only fields
    .sort(byRecency)
    .slice(0, CONFIG.maxItems);

  log(`\n  ${harvested.length} placed candidates → keeping the top ${picked.length}:`);
  for (const p of picked) {
    log(`   • [${p.date}] ${p.sources[0].outlet} · ${p.matchedOn}: ${p.title.slice(0, 70)}`);
  }
  log(`\n  archive now ${items.length} stories (cap ${CONFIG.maxItems}, ${CONFIG.retentionDays}-day window)`);
  log(`  sources healthy: ${okSources}/${SOURCES.length}`);

  await finish({
    items,
    startedAt,
    lastHarvestAt: startedAt.toISOString(),
    health,
    added: picked.length,
    priorFingerprint,
  });
}

/** Build the payload and write it, unless nothing changed or this is a dry run. */
async function finish({ items, startedAt, lastHarvestAt, health, added, priorFingerprint }) {
  const payload = buildPayload({ items, startedAt, lastHarvestAt, health, added });

  // Only rewrite when the story set actually changed, so the scheduled job
  // does not churn the deploy artifact every few hours for nothing.
  const changed = JSON.stringify(items) !== priorFingerprint;

  if (DRY_RUN) {
    log("\n--dry-run: no files written.");
    log(items.slice(0, 8)
      .map((i) => `   • [${i.date}] ${payload.places[i.place]?.name}: ${i.title.slice(0, 70)}`)
      .join("\n"));
    return;
  }
  if (!changed) {
    log("\nNo change in story set — leaving data/auto-news.json untouched.");
    return;
  }

  await mkdir(dirname(OUT_FILE), { recursive: true });
  await writeFile(OUT_FILE, JSON.stringify(payload, null, 2) + "\n", "utf8");
  log(`\nWrote ${OUT_FILE}`);
}

main().catch((err) => {
  console.error("\nIngest failed:", err);
  process.exit(1);
});
