#!/usr/bin/env node
/**
 * PINAS 2026 — automated news ingestion.
 *
 * Pulls headlines from the credible-source allowlist in sources.mjs, places
 * each story using gazetteer.mjs, and writes data/auto-news.json.
 *
 * Design rules that protect the map's credibility:
 *   • Allowlist only. No source outside sources.mjs is ever read.
 *   • No invented text. Titles and summaries are the outlet's own words,
 *     stripped of markup and truncated — never paraphrased or generated.
 *   • No guessed locations. A story with no gazetteer match is dropped.
 *   • Every item keeps a direct link to the original article.
 *   • Auto items are labelled provenance:"auto" so the UI can distinguish
 *     them from hand-verified curated stories.
 *   • A run that reaches zero sources writes nothing, so a network outage
 *     can never blank the map.
 *
 * Usage:
 *   node scripts/fetch-news.mjs            # fetch, merge, write if changed
 *   node scripts/fetch-news.mjs --dry-run  # report only, never write
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
  retentionDays: 120,   // covers the "last 3 months" bucket with headroom
  maxItems: 400,        // keeps the JSON small enough to load instantly
  maxPerPlacePerDay: 3, // stops one busy city from burying the rest of the map
  maxSummaryChars: 320,
  perSourceLimit: 25,   // newest N items per feed per run
  fetchTimeoutMs: 20000,
  retries: 2,
  userAgent: "Mozilla/5.0 (compatible; Pinas2026Bot/1.0; +https://github.com/benedict-dejesus/PINAS2026)",
};

const argv = new Set(process.argv.slice(2));
const DRY_RUN = argv.has("--dry-run");
const VERBOSE = argv.has("--verbose");

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

    items.push({ title, link, dateRaw: clean(dateRaw), summary });
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

async function main() {
  const startedAt = new Date();
  log(`\nPINAS 2026 — news ingest  ${startedAt.toISOString()}`);
  log(`Sources: ${SOURCES.length} · gazetteer: ${GAZETTEER.length} places\n`);

  const todayMs = Date.now();
  const oldestAllowed = new Date(todayMs - CONFIG.retentionDays * 864e5)
    .toISOString().slice(0, 10);
  const newestAllowed = new Date(todayMs + 2 * 864e5).toISOString().slice(0, 10);

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
      harvested.push({
        id: `auto-${hashId(canonicalUrl(raw.link))}`,
        place: `gaz:${hit.place.id}`,
        placeRef: hit.place,
        category: classify(raw.title, raw.summary),
        date,
        title: truncate(raw.title, 160),
        summary: truncate(raw.summary || raw.title, CONFIG.maxSummaryChars),
        provenance: "auto",
        matchedOn: hit.alias,
        sources: [{ outlet: source.outlet, url: raw.link }],
        weight: source.weight,
      });
      kept++;
    }
    health.push({ outlet: source.outlet, url: source.url, ok: true, items: parsed.length, placed: kept });
    log(`  ✓ ${source.outlet.padEnd(16)} ${String(parsed.length).padStart(3)} items → ${kept} placed`);
  }

  const okSources = health.filter((h) => h.ok).length;
  if (okSources === 0) {
    log("\n⚠ Every source failed. Writing nothing so existing data is preserved.");
    return;
  }

  // ————— merge with what we already have —————
  const existing = await loadExisting();
  const byId = new Map();
  for (const item of existing.items) byId.set(item.id, item);

  let added = 0;
  for (const item of harvested) {
    const prior = byId.get(item.id);
    if (!prior) {
      byId.set(item.id, item);
      added++;
    } else if ((item.weight ?? 0) > (prior.weight ?? 0)) {
      byId.set(item.id, { ...prior, ...item }); // higher-weight outlet wins attribution
    }
  }

  // Drop near-duplicate headlines (same story syndicated across outlets).
  const seenTitles = new Map();
  const deduped = [];
  for (const item of [...byId.values()].sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0))) {
    const key = normalizeTitle(item.title).split(" ").slice(0, 9).join(" ");
    if (key.length > 12 && seenTitles.has(key)) continue;
    seenTitles.set(key, item.id);
    deduped.push(item);
  }

  const ranked = deduped
    .filter((i) => i.date >= oldestAllowed)
    .sort((a, b) =>
      b.date.localeCompare(a.date) ||
      (b.weight ?? 0) - (a.weight ?? 0) ||
      a.id.localeCompare(b.id)
    );

  const perPlaceDay = new Map();
  const capped = [];
  for (const item of ranked) {
    const key = `${item.place}|${item.date}`;
    const seen = perPlaceDay.get(key) ?? 0;
    if (seen >= CONFIG.maxPerPlacePerDay) continue;
    perPlaceDay.set(key, seen + 1);
    capped.push(item);
  }

  const items = capped
    .slice(0, CONFIG.maxItems)
    .map(({ placeRef, weight, ...rest }) => rest); // strip build-only fields

  // Emit only the places actually referenced.
  const places = {};
  for (const item of items) {
    if (places[item.place]) continue;
    const gid = item.place.replace(/^gaz:/, "");
    const p = GAZETTEER.find((g) => g.id === gid);
    if (p) places[item.place] = { name: p.name, area: p.area, lat: p.lat, lng: p.lng, wiki: p.wiki };
  }

  const payload = {
    generatedAt: startedAt.toISOString(),
    retentionDays: CONFIG.retentionDays,
    counts: { items: items.length, places: Object.keys(places).length, addedThisRun: added },
    sourceHealth: health,
    places,
    items,
  };

  // Only rewrite when the story set actually changed, so the scheduled job
  // does not create an empty commit every few hours.
  const fingerprint = JSON.stringify(items);
  const priorFingerprint = JSON.stringify(existing.items ?? []);
  const changed = fingerprint !== priorFingerprint;

  log(`\n  ${items.length} stories across ${Object.keys(places).length} places (${added} new this run)`);
  log(`  sources healthy: ${okSources}/${SOURCES.length}`);

  if (DRY_RUN) {
    log("\n--dry-run: no files written.");
    log(items.slice(0, 8).map((i) => `   • [${i.date}] ${places[i.place]?.name}: ${i.title.slice(0, 70)}`).join("\n"));
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
