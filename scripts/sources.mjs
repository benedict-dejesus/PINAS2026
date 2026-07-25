/**
 * PINAS 2026 — credible-source allowlist.
 *
 * ONLY feeds listed here are ever ingested. This is the trust boundary of the
 * whole pipeline: if an outlet is not in this file, its stories cannot reach
 * the map. Every entry was probed and confirmed to serve a parseable feed.
 *
 * To add an outlet:
 *   1. Confirm it is an established newsroom with editorial accountability
 *      (masthead, corrections policy, named editors) — not an aggregator,
 *      content farm, or social feed.
 *   2. Verify the feed returns HTTP 200 and contains <item> or <entry> nodes.
 *   3. Add it below, then run `node scripts/fetch-news.mjs --dry-run`.
 *
 * `weight` breaks ties when the same story arrives from several outlets:
 * the highest-weight outlet becomes the primary attribution.
 */

export const SOURCES = [
  {
    outlet: "Inquirer.net",
    url: "https://newsinfo.inquirer.net/feed",
    weight: 9,
    note: "Philippine Daily Inquirer — national news desk",
  },
  {
    outlet: "Inquirer.net",
    url: "https://www.inquirer.net/feed",
    weight: 8,
    note: "Philippine Daily Inquirer — main feed",
  },
  {
    outlet: "GMA News",
    url: "https://data.gmanetwork.com/gno/rss/news/feed.xml",
    weight: 9,
    note: "GMA Network news division",
  },
  {
    outlet: "GMA News",
    url: "https://data.gmanetwork.com/gno/rss/news/nation/feed.xml",
    weight: 9,
    note: "GMA Network — nation desk",
  },
  {
    outlet: "Philstar.com",
    url: "https://www.philstar.com/rss/headlines",
    weight: 8,
    note: "The Philippine Star — headlines",
  },
  {
    outlet: "Philstar.com",
    url: "https://www.philstar.com/rss/nation",
    weight: 8,
    note: "The Philippine Star — nation desk",
  },
  {
    outlet: "Rappler",
    url: "https://www.rappler.com/feed/",
    weight: 8,
    note: "Rappler — investigative and national news",
  },
  {
    outlet: "BusinessWorld",
    url: "https://www.bworldonline.com/feed/",
    weight: 7,
    note: "BusinessWorld — business and economy",
  },
  {
    outlet: "Interaksyon",
    url: "https://interaksyon.philstar.com/feed/",
    weight: 6,
    note: "Interaksyon (PhilSTAR group)",
  },
  {
    outlet: "MindaNews",
    url: "https://mindanews.com/feed/",
    weight: 7,
    note: "Mindanao regional newsroom",
  },
  {
    outlet: "Panay News",
    url: "https://www.panaynews.net/feed/",
    weight: 6,
    note: "Western Visayas regional newsroom",
  },
];

/**
 * Outlet names and boilerplate that must never be treated as place mentions
 * (e.g. the "Manila" inside "Manila Bulletin").
 */
export const PLACE_MATCH_STOPWORDS = [
  "Manila Times",
  "Manila Bulletin",
  "Manila Standard",
  "Manila Newsette",
  "Business Manila",
  "Manila Water",
  "Manila Electric",
  "Meralco",
  "Bank of the Philippine Islands",
  "Philippine Daily Inquirer",
  "Cebu Pacific",
  "Cebuana",
  "Davao Light",
];
