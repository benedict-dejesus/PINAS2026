/**
 * PILIPINAS 2026 — verified news dataset.
 *
 * Every story was verified against the linked sources (retrieved 2026-07-22).
 * `wiki` is an English Wikipedia article title used only to fetch a
 * representative photo of the place/subject; the journalism lives in `sources`.
 */

const CATEGORIES = {
  politics: { label: "Politics & Governance", color: "#fbbf24", icon: "🏛️" },
  justice:  { label: "Justice & Accountability", color: "#a78bfa", icon: "⚖️" },
  wps:      { label: "West Philippine Sea", color: "#38bdf8", icon: "🌊" },
  disaster: { label: "Disasters & Climate", color: "#fb7185", icon: "🌋" },
  infra:    { label: "Economy & Infrastructure", color: "#34d399", icon: "🏗️" },
  culture:  { label: "Sports & Culture", color: "#f472b6", icon: "🎉" },
};

const PLACES = {
  malacanang:  { name: "Malacañang Palace", area: "San Miguel, Manila", lat: 14.5946, lng: 120.9944 },
  senate:      { name: "Senate Impeachment Court", area: "GSIS Complex, Pasay City", lat: 14.5533, lng: 120.9822 },
  batasan:     { name: "Batasang Pambansa", area: "Quezon City", lat: 14.6918, lng: 121.0945 },
  dpwh:        { name: "DPWH Central Office", area: "Port Area, Manila", lat: 14.5872, lng: 120.9700 },
  bulacan:     { name: "Calumpit", area: "Bulacan", lat: 14.9165, lng: 120.7654 },
  mrt3:        { name: "MRT-3 / EDSA", area: "Ortigas, Metro Manila", lat: 14.5876, lng: 121.0567 },
  ayungin:     { name: "Ayungin Shoal", area: "West Philippine Sea", lat: 9.7266, lng: 115.8620 },
  kanlaon:     { name: "Kanlaon Volcano", area: "Negros Island", lat: 10.4120, lng: 123.1320 },
  tacloban:    { name: "Tacloban City", area: "Leyte", lat: 11.2447, lng: 125.0036 },
  cebu_city:   { name: "Cebu City", area: "Cebu", lat: 10.3157, lng: 123.8854 },
  north_cebu:  { name: "Bogo City", area: "Northern Cebu", lat: 11.0517, lng: 124.0055 },
  sarangani:   { name: "Sarangani", area: "Soccsksargen", lat: 5.8600, lng: 124.9500 },
  cotabato:    { name: "Cotabato City", area: "Bangsamoro (BARMM)", lat: 7.2236, lng: 124.2464 },
  prosperidad: { name: "Prosperidad", area: "Agusan del Sur", lat: 8.6100, lng: 125.9153 },
  davao:       { name: "Davao City", area: "Davao Region", lat: 7.1907, lng: 125.4553 },
  mayon:       { name: "Mayon Volcano", area: "Albay, Bicol", lat: 13.2572, lng: 123.6856 },
  bsp:         { name: "Bangko Sentral ng Pilipinas", area: "Malate, Manila", lat: 14.5695, lng: 120.9822 },
  jolo:        { name: "Jolo", area: "Sulu", lat: 6.0521, lng: 121.0023 },
  boracay:     { name: "Boracay", area: "Malay, Aklan", lat: 11.9674, lng: 121.9248 },
  iloilo:      { name: "Iloilo City", area: "Western Visayas", lat: 10.7202, lng: 122.5621 },
  philsa:      { name: "PhilSA / UP Diliman", area: "Quezon City", lat: 14.6537, lng: 121.0687 },
  picc:        { name: "PICC", area: "CCP Complex, Pasay City", lat: 14.5520, lng: 120.9800 },
};

/**
 * Optional per-story image override (used instead of the wiki lead image).
 * Official PCO photo, public domain, hosted on Wikimedia Commons:
 * President Marcos chairs a Special Cabinet Meeting at the Palace, 2026-03-03.
 */
const MALACANANG_IMG = {
  src: "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3b/2026-03-03_BBM_Meeting.jpg/960px-2026-03-03_BBM_Meeting.jpg",
  page: "https://commons.wikimedia.org/wiki/File:2026-03-03_BBM_Meeting.jpg",
  credit: "Photo: PCO via Wikimedia Commons",
};

const NEWS_DATA = [
  // ————— Malacañang cluster —————
  {
    id: "us-envoy",
    place: "malacanang",
    category: "politics",
    date: "2026-07-20",
    title: "Marcos welcomes new US envoy, reaffirms 'century-old' alliance",
    summary:
      "President Ferdinand Marcos Jr. received newly appointed US Ambassador to the Philippines Lee Lipton — joined by US Ambassador to India Sergio Gor — at Malacañang, reaffirming the two nations' century-old alliance. US Secretary of State Marco Rubio was also expected in Manila for the 59th ASEAN Foreign Ministers' Meeting.",
    wiki: "Malacañang Palace",
    image: MALACANANG_IMG,
    sources: [
      { outlet: "The Manila Times", url: "https://www.manilatimes.net/2026/07/20/news/president-marcos-meets-us-envoys-to-india-and-ph-reaffirms-century-old-alliance/2387598" },
    ],
  },
  {
    id: "blair-visit",
    place: "malacanang",
    category: "politics",
    date: "2026-07-08",
    title: "Marcos meets ex-UK PM Tony Blair for the fifth time",
    summary:
      "Amid a politically charged July in Manila, President Marcos welcomed former British Prime Minister Tony Blair to Malacañang Palace — the fifth meeting between the two, drawing fresh attention to the Blair Institute's advisory work with the administration.",
    wiki: "Malacañang Palace",
    image: MALACANANG_IMG,
    sources: [
      { outlet: "Rappler", url: "https://www.rappler.com/newsbreak/inside-track/marcos-jr-meeting-tony-blair-july-2026/" },
    ],
  },
  {
    id: "sg-visit",
    place: "malacanang",
    category: "politics",
    date: "2026-07-14",
    title: "Marcos flies to Singapore for a two-day working visit",
    summary:
      "President Marcos departed for a July 14–16 working visit to Singapore, calling on Prime Minister Lawrence Wong to expand cooperation in trade and investment, environment and health, and to compare notes on regional and global developments.",
    wiki: "Malacañang Palace",
    image: MALACANANG_IMG,
    sources: [
      { outlet: "GMA News", url: "https://www.gmanetwork.com/news//topstories/nation/994707/marcos-to-visit-singapore-from-july-14-16-2026/story/" },
      { outlet: "The Manila Times", url: "https://www.manilatimes.net/2026/07/13/news/marcos-to-leave-for-2-day-working-visit-in-singapore/2383135" },
    ],
  },
  {
    id: "palace-surveys",
    place: "malacanang",
    category: "politics",
    date: "2026-07-16",
    title: "Palace: Marcos 'focused on work' as satisfaction rating improves",
    summary:
      "Malacañang said President Marcos remains focused on his mandate regardless of survey results, after a new poll showed an improvement in his satisfaction rating following months of political turbulence.",
    wiki: "Malacañang Palace",
    image: MALACANANG_IMG,
    sources: [
      { outlet: "Philstar.com", url: "https://www.philstar.com/nation/2026/07/16/2542496/palace-marcos-jr-focused-work" },
    ],
  },

  // ————— Rest of Metro Manila —————
  {
    id: "sara-trial",
    place: "senate",
    category: "justice",
    date: "2026-07-15",
    title: "Sara Duterte impeachment trial: senators weigh subpoena of bank records",
    summary:
      "The historic impeachment trial of Vice President Sara Duterte opened on July 6 at the Senate impeachment court. By Day 6, arguments centered on subpoenaing her bank records, tax returns, and AMLC documents over alleged unexplained wealth — with AMLC having flagged ₱6.7 billion in covered and suspicious transactions against ₱80 million in declared wealth.",
    wiki: "Sara Duterte",
    sources: [
      { outlet: "Al Jazeera", url: "https://www.aljazeera.com/news/2026/7/6/impeachment-trial-of-philippine-vice-president-sara-duterte-begins" },
      { outlet: "GMA News", url: "https://www.gmanetwork.com/news/topstories/specialreports/993688/sara-duterte-impeachment-trial-latest-news-timeline-what-you-need-to-know/story/" },
      { outlet: "Inquirer.net", url: "https://newsinfo.inquirer.net/2264615/highlights-day-6-of-sara-duterte-impeachment-trial-july-15-2026" },
    ],
  },
  {
    id: "sona-2026",
    place: "batasan",
    category: "politics",
    date: "2026-07-27",
    title: "SONA 2026: Marcos' fifth address set for July 27",
    summary:
      "President Marcos delivers his penultimate State of the Nation Address at the Batasang Pambansa on July 27 — billed by the Palace as 'simple and dignified.' More than 20,000 police are being deployed, and at least four groups have applied for rally permits in Quezon City.",
    wiki: "Batasang Pambansa Complex",
    sources: [
      { outlet: "Philippine News Agency", url: "https://www.pna.gov.ph/articles/1279803" },
      { outlet: "Philstar.com", url: "https://www.philstar.com/nation/2026/07/20/2543242/pnp-finalizes-security-president-marcos-sona" },
      { outlet: "GMA News", url: "https://www.gmanetwork.com/news/topstories/nation/995288/sona-rally-permits-president-marcos/story/" },
    ],
  },
  {
    id: "ici-ends",
    place: "dpwh",
    category: "justice",
    date: "2026-03-31",
    title: "Flood-control probe ends: cases urged vs 8 lawmakers over ₱92B in contracts",
    summary:
      "The Independent Commission for Infrastructure wrapped up on March 31, 2026 after six months investigating anomalous flood-control projects. It recommended cases against eight lawmakers allegedly linked to firms that cornered ₱92 billion in DPWH contracts from 2016–2024, turning over its evidence to the Ombudsman and DOJ.",
    wiki: "Department of Public Works and Highways",
    sources: [
      { outlet: "Rappler", url: "https://www.rappler.com/philippines/ici-operation-end-march-31-2026/" },
      { outlet: "Daily Tribune", url: "https://tribune.net.ph/2026/02/11/timeline-flood-control-scandal" },
      { outlet: "Wikipedia", url: "https://en.wikipedia.org/wiki/Independent_Commission_for_Infrastructure" },
    ],
  },
  {
    id: "ghost-projects",
    place: "bulacan",
    category: "justice",
    date: "2026-02-11",
    title: "Bulacan's 'ghost' flood-control projects remain scandal's ground zero",
    summary:
      "Bulacan towns like Calumpit sit at the heart of the flood-control scandal — 'ghost' projects, contractor monopolies, and misallocated billions exposed in 2025 continued to drive Senate inquiries, resignations, and public outrage well into 2026.",
    wiki: "Calumpit",
    sources: [
      { outlet: "GMA News (special report)", url: "https://www.gmanetwork.com/news/topstories/specialreports/967723/the-corruption-of-philippine-flood-control-projects/story/" },
      { outlet: "Wikipedia", url: "https://en.wikipedia.org/wiki/Flood_control_projects_scandal_in_the_Philippines" },
    ],
  },
  {
    id: "rail-push",
    place: "mrt3",
    category: "infra",
    date: "2026-03-30",
    title: "Metro Manila doubles down on rail to beat gridlock",
    summary:
      "A fresh JICA loan of ¥21.6 billion signed in 2026 funds sustained rehabilitation of MRT-3, while the 33-km Metro Manila Subway from Valenzuela to NAIA advances — and analysts report transit-oriented growth is now reshaping where offices and homes get built.",
    wiki: "MRT Line 3 (Metro Manila)",
    sources: [
      { outlet: "Manila Bulletin", url: "https://mb.com.ph/2026/03/30/metro-manila-embraces-transit-oriented-growth-amid-traffic-woescolliers" },
      { outlet: "Wikipedia", url: "https://en.wikipedia.org/wiki/Manila_Metro_Rail_Transit_System" },
    ],
  },

  // ————— West Philippine Sea —————
  {
    id: "ayungin-baton",
    place: "ayungin",
    category: "wps",
    date: "2026-07-20",
    title: "Navy sailor hurt in China Coast Guard baton attack at Ayungin Shoal",
    summary:
      "A Philippine Navy serviceman suffered a head injury after eight China Coast Guard personnel struck Filipino troops with wooden batons near the BRP Sierra Madre on July 20. The AFP rejected Beijing's account, saying Chinese personnel intruded into waters where the Philippines exercises sovereign rights; the US condemned the 'dangerous, escalatory' actions.",
    wiki: "Second Thomas Shoal",
    sources: [
      { outlet: "Philstar.com", url: "https://www.philstar.com/headlines/2026/07/21/2543548/philippine-navy-personnel-hurt-china-coast-guard-baton-attack" },
      { outlet: "GMA News", url: "https://www.gmanetwork.com/news/topstories/nation/995491/china-coast-guard-hit-ph-navy-member-with-baton-at-ayungin-shoal-says-afp/story/" },
      { outlet: "The Manila Times", url: "https://www.manilatimes.net/2026/07/21/news/afp-rejects-chinas-account-of-ayungin-incident-says-its-coast-guard-intruded-into-philippine-waters/2388151" },
    ],
  },

  // ————— Visayas —————
  {
    id: "kanlaon",
    place: "kanlaon",
    category: "disaster",
    date: "2026-07-07",
    title: "Kanlaon erupts again — 7th explosive event of 2026",
    summary:
      "A strong July 7 explosion sent a grey ash plume to roughly 4.5–5.5 km altitude, with a block-and-ash flow running at least 4 km down Kanlaon's southern slope. The volcano has erupted seven times in 2026; PHIVOLCS keeps Alert Level 2 and warns persistent crater glow could force a step up to Level 3 and wider evacuations.",
    wiki: "Kanlaon",
    sources: [
      { outlet: "Smithsonian GVP", url: "https://volcano.si.edu/showreport.cfm?gvpvar=GVP.DVAR20260707-272020" },
      { outlet: "SunStar", url: "https://www.sunstar.com.ph/cebu/kanlaon-volcano-erupts-sends-ash-plume-up" },
      { outlet: "Gulf News", url: "https://gulfnews.com/world/asia/philippines/philippines-kanlaon-volcano-makes-explosive-eruption-shoots-ash-plume-2500-metres-above-the-crater-1.500456510" },
    ],
  },
  {
    id: "cumpio-verdict",
    place: "tacloban",
    category: "justice",
    date: "2026-01-22",
    title: "Journalist Frenchie Mae Cumpio sentenced to up to 18 years",
    summary:
      "After nearly six years in detention, the Tacloban Regional Trial Court convicted community journalist Frenchie Mae Cumpio of terrorism financing (acquitting her on firearms charges) and sentenced her to 12–18 years. Bail pending appeal was denied on February 13. CPJ called the sentence 'absurd'; press-freedom groups call the case a travesty of justice.",
    wiki: "Tacloban",
    sources: [
      { outlet: "CPJ", url: "https://cpj.org/2026/01/cpj-condemns-absurd-prison-sentence-of-up-to-18-years-for-philippine-journalist-frenchie-mae-cumpio/" },
      { outlet: "RSF", url: "https://rsf.org/en/philippines-journalist-frenchie-mae-cumpio-s-trial-enters-final-phase-look-back-nearly-six-years" },
      { outlet: "Rappler", url: "https://www.rappler.com/newsbreak/iq/timeline-frenchie-mae-cumpio-conviction-terrorism-financing/" },
    ],
  },
  {
    id: "cebu-beach-games",
    place: "cebu_city",
    category: "culture",
    date: "2026-03-15",
    title: "Cebu City named host of the 2028 Asian Beach Games",
    summary:
      "In March 2026, Cebu City was announced as host of the 2028 Asian Beach Games — a marquee win for the Philippine Sports Commission's sports-tourism push and a morale boost for a province rebuilding from 2025's earthquake and storms.",
    wiki: "Cebu City",
    sources: [
      { outlet: "Wikipedia", url: "https://en.wikipedia.org/wiki/2028_Asian_Beach_Games" },
      { outlet: "GMA News", url: "https://www.gmanetwork.com/news/sports/othersports/971468/what-major-competitions-await-ph-athletes-in-2026/story/" },
    ],
  },
  {
    id: "cebu-recovery",
    place: "north_cebu",
    category: "disaster",
    date: "2026-01-15",
    title: "Northern Cebu rebuilds after quake–typhoon double blow",
    summary:
      "Recovery continues through 2026 after the Sept 30, 2025 earthquake (79 dead, 134,000+ homes damaged) was followed weeks later by Typhoon Tino (Kalmaegi), which made five landfalls across the Visayas and displaced nearly 600,000 people. The IFRC describes a country 'struggling against relentless catastrophes.'",
    wiki: "2025 Cebu earthquake",
    sources: [
      { outlet: "IFRC", url: "https://www.ifrc.org/emergency/philippines-cebu-earthquake" },
      { outlet: "IFRC", url: "https://www.ifrc.org/press-release/earthquake-typhoons-philippines-struggles-against-relentless-catastrophes" },
      { outlet: "CARE", url: "https://www.care.org/media-and-press/philippines-typhoon-tino-deepens-crisis-for-earthquake-and-flood-survivors/" },
    ],
  },

  // ————— Mindanao —————
  {
    id: "sarangani-quake",
    place: "sarangani",
    category: "disaster",
    date: "2026-06-08",
    title: "M7.8 earthquake off Sarangani kills at least 94",
    summary:
      "The strongest Philippine quake since 1976 struck off Sarangani on June 8 — the first day of the school year — killing at least 94, injuring 1,300+, and triggering tsunami evacuations of about 10,000 families with run-up reaching 2.5 m at Lebak. General Santos and coastal Sarangani towns like Glan saw massive housing damage.",
    wiki: "2026 Mindanao earthquake",
    sources: [
      { outlet: "UN News", url: "https://news.un.org/en/story/2026/06/1167672" },
      { outlet: "Wikipedia", url: "https://en.wikipedia.org/wiki/2026_Mindanao_earthquake" },
      { outlet: "IFRC", url: "https://www.ifrc.org/press-release/earthquake-typhoons-philippines-struggles-against-relentless-catastrophes" },
    ],
  },
  {
    id: "barmm-polls",
    place: "cotabato",
    category: "politics",
    date: "2026-07-16",
    title: "Election period opens for Bangsamoro's first parliamentary polls",
    summary:
      "The election period began July 16 for the historic first regular Bangsamoro Parliament election on September 14, 2026. Over 2.3 million voters will elect 80 members of Parliament — the culmination of the peace process under the Bangsamoro Organic Law. Campaigning runs July 30 to September 12.",
    wiki: "Bangsamoro",
    sources: [
      { outlet: "The Manila Times", url: "https://www.manilatimes.net/2026/07/17/regions/election-period-begins-in-barmm/2386033" },
      { outlet: "Bangsamoro Government", url: "https://bangsamoro.gov.ph/news/latest-news/traditional-leaders-vow-for-peaceful-credible-barmm-parliamentary-polls/" },
      { outlet: "The Diplomat", url: "https://thediplomat.com/2026/03/bangsamoros-first-parliamentary-elections-a-test-for-the-peace-process/" },
    ],
  },
  {
    id: "palaro-2026",
    place: "prosperidad",
    category: "culture",
    date: "2026-05-24",
    title: "Agusan del Sur hosts the 66th Palarong Pambansa",
    summary:
      "Prosperidad, Agusan del Sur welcomed the nation's young athletes for the 66th Palarong Pambansa on May 24–31, 2026, with competitions across 35 sports — the country's biggest grassroots sporting stage and a first-time spotlight for the Caraga hosts.",
    wiki: "Palarong Pambansa",
    sources: [
      { outlet: "Wikipedia", url: "https://en.wikipedia.org/wiki/2026_Palarong_Pambansa" },
      { outlet: "GMA News", url: "https://www.gmanetwork.com/news/sports/othersports/971468/what-major-competitions-await-ph-athletes-in-2026/story/" },
    ],
  },
  {
    id: "duterte-icc",
    place: "davao",
    category: "justice",
    date: "2026-04-23",
    title: "ICC confirms charges vs Duterte; trial opens November 30",
    summary:
      "The ICC Pre-Trial Chamber unanimously confirmed three counts of crimes against humanity against former president Rodrigo Duterte on April 23, committing Davao City's longtime mayor to trial in The Hague starting November 30, 2026. In May, judges ruled he stays in detention. The drug war killed 6,000+ by government count — over 30,000 by rights groups' estimates.",
    wiki: "Rodrigo Duterte",
    sources: [
      { outlet: "International Criminal Court", url: "https://www.icc-cpi.int/news/duterte-case-trial-open-30-november-2026" },
      { outlet: "International Criminal Court", url: "https://www.icc-cpi.int/news/icc-pre-trial-chamber-i-confirms-all-charges-against-rodrigo-roa-duterte-and-commits-him-trial" },
      { outlet: "Inquirer.net", url: "https://globalnation.inquirer.net/324906/icc-sets-opening-of-dutertes-trial-on-nov-30-2026" },
    ],
  },

  // ————— Luzon (Bicol) —————
  {
    id: "mayon-2026",
    place: "mayon",
    category: "disaster",
    date: "2026-05-02",
    title: "Mayon erupts, blanketing Albay in ash — 102,000+ affected",
    summary:
      "The country's most active volcano erupted on May 2, raining ash on more than 30,000 families (102,406 people) across 87 barangays, with 124 barangays in Albay ultimately affected by ashfall, lava flows, and pyroclastic currents. PHIVOLCS held Alert Level 3 as the effusive eruption ran for over 130 consecutive days, exposing gaps in evacuation transport and shelters.",
    wiki: "Mayon",
    sources: [
      { outlet: "Al Jazeera", url: "https://www.aljazeera.com/video/newsfeed/2026/5/2/philippines-volcano-erupts-blanketing-ash-across-the-sky" },
      { outlet: "Inquirer.net", url: "https://newsinfo.inquirer.net/2223366/mayon-volcano-ashfall-hits-over-30000-families" },
      { outlet: "Philstar.com", url: "https://www.philstar.com/nation/2026/05/03/2525376/mayon-keeps-alert-level-3-amid-ash-fall" },
    ],
  },

  // ————— Economy —————
  {
    id: "inflation-2026",
    place: "bsp",
    category: "infra",
    date: "2026-05-25",
    title: "Growth under siege: inflation hits 7.2% as GDP slows to 2.8%",
    summary:
      "An oil-price shock pushed headline inflation to 7.2% in April while first-quarter GDP growth slumped to 2.8%, far below target. The Bangko Sentral ng Pilipinas — which had raised its 2026 inflation forecast to 5.1% in late March — lifted its benchmark rate to 4.5%, with analysts warning it may keep hiking even at the expense of near-term growth.",
    wiki: "Bangko Sentral ng Pilipinas",
    sources: [
      { outlet: "ISEAS Perspective", url: "https://www.iseas.edu.sg/articles-commentaries/iseas-perspective/2026-38-the-philippine-economy-in-2026-growth-under-siege-by-jc-punongbayan/" },
      { outlet: "Manila Bulletin", url: "https://mb.com.ph/2026/05/25/bsp-likely-to-sacrifice-growth-to-tame-inflation" },
      { outlet: "OECD Economic Surveys", url: "https://www.oecd.org/en/publications/oecd-economic-surveys-philippines-2026_f0e0c581-en.html" },
    ],
  },

  // ————— Mindanao (Sulu) —————
  {
    id: "sulu-transition",
    place: "jolo",
    category: "politics",
    date: "2026-06-29",
    title: "Sulu formally shifts to Zamboanga Peninsula; Marcos hands over ₱453.8M",
    summary:
      "Following the Supreme Court ruling that Sulu is not part of BARMM, President Marcos declared the province part of the Zamboanga Peninsula region and ordered uninterrupted government services for its roughly one million residents. On a June visit he turned over ₱453.8 million for food-security and community projects across Zamboanga and Sulu — a transition Rappler calls a stress test for service delivery.",
    wiki: "Sulu",
    sources: [
      { outlet: "Presidential Communications Office", url: "https://pco.gov.ph/news_releases/pbbm-declares-sulu-part-of-zamboanga-peninsula-orders-uninterrupted-govt-services/" },
      { outlet: "Rappler", url: "https://www.rappler.com/philippines/mindanao/sulu-shift-zamboanga-peninsula-tests-government-ability-services/" },
      { outlet: "Philstar.com", url: "https://www.philstar.com/nation/2026/06/30/2538687/marcos-hands-over-p4538-million-zamboanga-sulu-projects" },
    ],
  },

  // ————— Tourism —————
  {
    id: "tourism-boom",
    place: "boracay",
    category: "culture",
    date: "2026-04-30",
    title: "PH posts Southeast Asia's fastest aviation growth as tourism surges",
    summary:
      "The Philippines hit 5.82 million airline seats in April — Southeast Asia's fastest-growing aviation market per OAG, with domestic capacity up 16% — as Boracay, Palawan, and Siargao ranked among Asia's best islands in Condé Nast Traveler's Readers' Choice Awards. Boracay still packs beyond its limits, reviving debates over carrying capacity set after its 2018 rehabilitation.",
    wiki: "Boracay",
    sources: [
      { outlet: "Travel And Tour World", url: "https://www.travelandtourworld.com/news/article/philippines-manila-cebu-and-boracay-lead-southeast-asia-tourism-boom-as-philippine-aviation-sector-records-fastest-growth-in-2026/" },
      { outlet: "BusinessMirror", url: "https://businessmirror.com.ph/2026/04/09/tourist-numbers-dip-but-boracay-still-packs-beyond-its-limits/" },
      { outlet: "Philippine News Agency", url: "https://www.pna.gov.ph/articles/1266128" },
    ],
  },

  // ————— Western Visayas —————
  {
    id: "philbex-iloilo",
    place: "iloilo",
    category: "infra",
    date: "2026-07-09",
    title: "PHILBEX Iloilo returns: 400+ exhibitors converge on ICON",
    summary:
      "The Philippine Building and Construction Expo returned to the Iloilo Convention Center on July 9–12 for its fourth straight year, bundled with travel and food expos as 'Iloilo Trio 2026' — more than 400 exhibitors underscoring Iloilo's rise as Western Visayas' business-events hub.",
    wiki: "Iloilo City",
    sources: [
      { outlet: "Panay News", url: "https://www.panaynews.net/worldbex-presents-philbex-iloilo-western-visayas-premier-construction-and-design-expo/" },
      { outlet: "Panay News", url: "https://www.panaynews.net/worldbex-brings-business-travel-and-flavors-to-life-at-iloilo-trio-2026/" },
    ],
  },

  // ————— Science —————
  {
    id: "mula-satellite",
    place: "philsa",
    category: "infra",
    date: "2026-03-21",
    title: "MULA, the Philippines' most advanced satellite, readies for launch",
    summary:
      "The 130-kg Multispectral Unit for Land Assessment — built with Surrey Satellite Technology and carrying a TrueColour imager with 2 TB of storage — was slated for a SpaceX rideshare by Q4 2026, though later reports point to a slip toward April 2027 on Transporter-20. PhilSA's 2026 slate also includes the Maya-7 cubesat and new nationwide mangrove and benthic-habitat maps.",
    wiki: "Philippine Space Agency",
    sources: [
      { outlet: "The Manila Times", url: "https://www.manilatimes.net/2026/03/21/business/science-technology/spacex-to-launch-philippines-mula-satellite-by-q4/2304518" },
      { outlet: "PhilSA", url: "https://philsa.gov.ph/news/president-marcos-jr-convenes-philippine-space-council-approves-programs-on-satellite-development-and-key-space-initiatives/" },
      { outlet: "Philippine News Agency", url: "https://www.pna.gov.ph/articles/1258899" },
    ],
  },

  // ————— ASEAN chairmanship —————
  {
    id: "asean-fmm",
    place: "picc",
    category: "politics",
    date: "2026-07-22",
    title: "Manila hosts ASEAN foreign ministers under PH chairmanship",
    summary:
      "Foreign ministers gather in Manila this week for the 59th ASEAN Foreign Ministers' Meeting as the Philippines chairs the bloc in 2026. US Secretary of State Marco Rubio is expected to join the related meetings and pay a courtesy call on President Marcos — with the South China Sea code of conduct high on the agenda.",
    wiki: "Philippine International Convention Center",
    sources: [
      { outlet: "The Manila Times", url: "https://www.manilatimes.net/2026/07/20/news/president-marcos-meets-us-envoys-to-india-and-ph-reaffirms-century-old-alliance/2387598" },
    ],
  },
];
