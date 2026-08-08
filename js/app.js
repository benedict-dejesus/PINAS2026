/* PINAS 2026 — app logic */
(() => {
  "use strict";

  if (typeof L === "undefined") {
    window.__appFatal?.("Couldn't load the map engine. Check your connection, then reload.");
    return;
  }

  try {
    init();
  } catch (err) {
    console.error(err);
    window.__appFatal?.("Something went wrong while starting the map. Tap to dismiss, then reload.");
  }

  function init() {
    const PH_BOUNDS = L.latLngBounds([4.2, 114.0], [21.5, 127.6]);
    const CLUSTER_PX = 54;
    const DAY_MS = 864e5;
    const LIST_LIMIT = 60; // max story cards rendered into the sheet at once

    /* ————————————————— time tiers ————————————————— */
    // This is a guide to the latest news, so the map holds one week and no
    // more. Anything older is dropped rather than shown — which also means the
    // story count plateaus instead of growing forever.
    const MAX_AGE_DAYS = 7;

    // Exclusive tiers drive marker colour and pulse speed.
    const TIERS = [
      { id: "today", label: "Today",       maxDays: 0,        color: "#ff2d6f", pulse: "1.3s" },
      { id: "days3", label: "Last 3 days", maxDays: 3,        color: "#fcd116", pulse: "2.1s" },
      { id: "week",  label: "This week",   maxDays: Infinity, color: "#38bdf8", pulse: "2.9s" },
    ];
    // Cumulative, which is how people actually think about recency:
    // "last 3 days" includes today, "this week" includes both.
    const FILTERS = [
      { id: "today", label: "Today",       color: "#ff2d6f", test: (d) => d <= 0 },
      { id: "days3", label: "Last 3 days", color: "#fcd116", test: (d) => d <= 3 },
      { id: "week",  label: "This week",   color: "#38bdf8", test: (d) => d <= MAX_AGE_DAYS },
    ];

    // daysOld() runs tens of thousands of times per render once the map is
    // full, so cache by date string and only rebuild the base at midnight.
    let midnightMs = 0, nextMidnightMs = 0;
    const dayCache = new Map();
    function refreshDayBase() {
      const t = new Date();
      t.setHours(0, 0, 0, 0);
      midnightMs = t.getTime();
      nextMidnightMs = midnightMs + DAY_MS;
      dayCache.clear();
    }
    refreshDayBase();
    function daysOld(iso) {
      if (Date.now() >= nextMidnightMs) refreshDayBase();
      let cached = dayCache.get(iso);
      if (cached === undefined) {
        const parsed = Date.parse(iso + "T00:00:00");
        cached = Number.isNaN(parsed) ? 9999 : Math.round((midnightMs - parsed) / DAY_MS);
        dayCache.set(iso, cached);
      }
      return cached;
    }
    const tierOf = (days) => TIERS.find((t) => days <= t.maxDays) ?? TIERS[TIERS.length - 1];
    const withinWindow = (s) => daysOld(s.date) <= MAX_AGE_DAYS;

    function relativeTime(iso) {
      const d = daysOld(iso);
      if (d < 0) return d === -1 ? "Tomorrow" : `In ${Math.abs(d)} days`;
      if (d === 0) return "Today";
      if (d === 1) return "Yesterday";
      if (d < 7) return `${d} days ago`;
      if (d < 14) return "Last week";
      if (d < 62) return `${Math.round(d / 7)} weeks ago`;
      return `${Math.round(d / 30)} months ago`;
    }
    const fmtDate = (iso) =>
      new Date(iso + "T00:00:00").toLocaleDateString("en-PH", {
        year: "numeric", month: "long", day: "numeric",
      });
    function agoFromTimestamp(ts) {
      const mins = Math.round((Date.now() - new Date(ts).getTime()) / 60000);
      if (!Number.isFinite(mins) || mins < 0) return "just now";
      if (mins < 2) return "just now";
      if (mins < 60) return `${mins} min ago`;
      const hrs = Math.round(mins / 60);
      if (hrs < 24) return `${hrs}h ago`;
      return `${Math.round(hrs / 24)}d ago`;
    }
    const escapeHtml = (s) =>
      String(s).replace(/[&<>"']/g, (c) =>
        ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

    /* ————————————————— map ————————————————— */
    const map = L.map("map", {
      zoomControl: false,
      attributionControl: true,
      maxBounds: PH_BOUNDS.pad(0.35),
      maxBoundsViscosity: 0.8,
      minZoom: 5,
      maxZoom: 17,
      zoomSnap: 0.25,
    });
    map.attributionControl.setPrefix(false);

    let tileErrors = 0, tilesSwapped = false;
    const primaryTiles = L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      attribution: "© OpenStreetMap contributors © CARTO",
      subdomains: "abcd",
      maxZoom: 19,
    }).addTo(map);
    primaryTiles.on("tileerror", () => {
      if (tilesSwapped || ++tileErrors < 6) return;
      tilesSwapped = true;
      map.removeLayer(primaryTiles);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap contributors",
        maxZoom: 19,
        className: "osm-fallback",
      }).addTo(map);
    });

    map.fitBounds(PH_BOUNDS, { padding: [10, 10] });

    // Leaflet caches the container size. If the viewport changes (phone
    // rotation, window resize, browser chrome collapsing) and we don't tell
    // it, its projection math starts returning NaN and every later flyTo
    // poisons the map state. Re-measure, then re-cluster for the new width.
    let resizeTimer;
    const handleResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        map.invalidateSize({ animate: false });
        renderMarkers();
      }, 180);
    };
    window.addEventListener("resize", handleResize);
    window.addEventListener("orientationchange", handleResize);

    /** Leaflet throws on NaN coordinates, so never hand it an unchecked zoom. */
    const safeZoom = (value, fallback) => {
      const z = Number.isFinite(value) ? value : fallback;
      return Math.min(Math.max(z, map.getMinZoom()), map.getMaxZoom());
    };
    const currentZoom = () => (Number.isFinite(map.getZoom()) ? map.getZoom() : 7);

    /* ————————————————— data ————————————————— */
    const places = { ...PLACES };
    let stories = [];
    let byPlace = new Map();
    let autoMeta = null;

    function normalizeUrl(url) {
      try {
        const u = new URL(url);
        u.hash = ""; u.search = "";
        return u.toString().replace(/\/$/, "");
      } catch { return url; }
    }

    function rebuildIndex() {
      byPlace = new Map();
      for (const story of stories) {
        if (!places[story.place]) continue;
        if (!byPlace.has(story.place)) byPlace.set(story.place, []);
        byPlace.get(story.place).push(story);
      }
      for (const list of byPlace.values()) list.sort((a, b) => b.date.localeCompare(a.date));
    }

    // Curated stories first — they are the hand-verified backbone. Older ones
    // stay in news-data.js but sit outside the one-week window, so they are
    // not shown; widen MAX_AGE_DAYS to bring them back.
    stories = NEWS_DATA
      .filter((s) => PLACES[s.place] && CATEGORIES[s.category] && withinWindow(s))
      .map((s) => ({ ...s, provenance: "curated" }));
    rebuildIndex();

    /* ————————————————— state ————————————————— */
    let selectedPlace = null;
    let activeFilter = "week"; // widest view — everything the map holds
    let introDone = false;
    const hasHover = window.matchMedia("(hover: hover)").matches;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const activeFilterDef = () =>
      FILTERS.find((f) => f.id === activeFilter) ?? FILTERS[FILTERS.length - 1];
    const storyMatches = (s) => activeFilterDef().test(daysOld(s.date));

    function visibleStories(placeId) {
      const all = byPlace.get(placeId) ?? [];
      const hit = all.filter(storyMatches);
      return hit.length ? hit : all;
    }
    function visiblePlaceIds() {
      return [...byPlace.keys()].filter((id) => byPlace.get(id).some(storyMatches));
    }
    /** Freshest story at a place decides its colour. */
    function leadTier(placeId) {
      const list = visibleStories(placeId);
      return tierOf(Math.min(...list.map((s) => daysOld(s.date))));
    }

    /* ————————————————— markers ————————————————— */
    const placeMarkers = new Map();
    let clusterMarkers = [];

    function makePlaceMarker(placeId, dropIndex) {
      const place = places[placeId];
      const list = visibleStories(placeId);
      const tier = leadTier(placeId);
      const cat = CATEGORIES[list[0].category] ?? CATEGORIES.politics;
      const count = list.length;
      const size = count > 1 ? 46 : 38;
      const delay = introDone ? 0 : 0.4 + dropIndex * 0.045;
      const isLive = tier.id === "today";
      const upcoming = daysOld(list[0].date) < 0;

      const icon = L.divIcon({
        className: "news-marker",
        html: `<div class="nm${placeId === selectedPlace ? " selected" : ""}${isLive ? " live" : ""}"
                    style="--c:${tier.color};--delay:${delay}s;--pulse:${tier.pulse}"
                    data-place="${escapeHtml(placeId)}">
                 <span class="nm-pulse"></span>
                 <span class="nm-ring"></span>
                 <span class="nm-core">${cat.icon}</span>
                 ${count > 1 ? `<span class="nm-count">${count}</span>` : ""}
                 ${isLive ? `<span class="nm-live">${upcoming ? "SOON" : "LIVE"}</span>` : ""}
               </div>`,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
      });
      const marker = L.marker([place.lat, place.lng], { icon, riseOnHover: true })
        .on("click", () => openPlace(placeId));
      if (hasHover) {
        marker.bindTooltip(
          `${count > 1 ? `${count} stories` : escapeHtml(list[0].title)}
           <small>${escapeHtml(place.name)} · ${relativeTime(list[0].date)}</small>`,
          { className: "nm-tip", direction: "top", offset: [0, -size / 2 - 4], opacity: 1 }
        );
      }
      return marker;
    }

    function makeClusterMarker(memberIds, latlng, dropIndex) {
      const total = memberIds.reduce((n, id) => n + visibleStories(id).length, 0);
      const tier = TIERS.reduce((best, t) => {
        const has = memberIds.some((id) => leadTier(id).id === t.id);
        return best ?? (has ? t : null);
      }, null) ?? TIERS[1];
      const delay = introDone ? 0 : 0.4 + dropIndex * 0.045;
      const icon = L.divIcon({
        className: "news-marker",
        html: `<div class="nm nm-cluster${tier.id === "today" ? " live" : ""}"
                    style="--c:${tier.color};--delay:${delay}s;--pulse:${tier.pulse}">
                 <span class="nm-pulse"></span>
                 <span class="nm-core">${total}</span>
               </div>`,
        iconSize: [54, 54],
        iconAnchor: [27, 27],
      });
      const marker = L.marker(latlng, { icon }).on("click", () => {
        const bounds = L.latLngBounds(memberIds.map((id) => [places[id].lat, places[id].lng]));
        // Always make zoom progress: fitting the bounds alone can stall when
        // members sit only a few hundred metres apart.
        const fitZoom = map.getBoundsZoom(bounds, false, L.point(70, 70));
        const stepped = Math.max(
          Number.isFinite(fitZoom) ? fitZoom : 0,
          currentZoom() + 1.75
        );
        map.flyTo(bounds.getCenter(), safeZoom(Math.min(stepped, 16), 12), { duration: 0.8 });
      });
      if (hasHover) {
        marker.bindTooltip(
          `${total} stories · ${memberIds.length} places<small>Tap to zoom in</small>`,
          { className: "nm-tip", direction: "top", offset: [0, -30], opacity: 1 }
        );
      }
      return marker;
    }

    function renderMarkers() {
      for (const m of placeMarkers.values()) map.removeLayer(m);
      for (const m of clusterMarkers) map.removeLayer(m);
      placeMarkers.clear();
      clusterMarkers = [];

      const zoom = currentZoom();
      const clusters = [];
      for (const id of visiblePlaceIds()) {
        const spot = places[id];
        if (!Number.isFinite(spot?.lat) || !Number.isFinite(spot?.lng)) continue;
        const pt = map.project([spot.lat, spot.lng], zoom);
        let home = null;
        for (const c of clusters) {
          if (c.members.some((m) => m.pt.distanceTo(pt) < CLUSTER_PX)) { home = c; break; }
        }
        if (home) home.members.push({ id, pt });
        else clusters.push({ members: [{ id, pt }] });
      }

      // Freshest places drop in first so the eye lands on today's news.
      clusters.sort((a, b) =>
        Math.min(...a.members.map((m) => daysOld(visibleStories(m.id)[0].date))) -
        Math.min(...b.members.map((m) => daysOld(visibleStories(m.id)[0].date)))
      );

      let dropIndex = 0;
      for (const c of clusters) {
        if (c.members.length === 1) {
          const id = c.members[0].id;
          const marker = makePlaceMarker(id, dropIndex++);
          placeMarkers.set(id, marker);
          marker.addTo(map);
        } else {
          const mean = c.members.reduce(
            (acc, m) => acc.add(m.pt.divideBy(c.members.length)), L.point(0, 0));
          const marker = makeClusterMarker(
            c.members.map((m) => m.id), map.unproject(mean, zoom), dropIndex++);
          clusterMarkers.push(marker);
          marker.addTo(map);
        }
      }
    }

    map.on("zoomend", renderMarkers);
    const markerEl = (placeId) =>
      placeMarkers.get(placeId)?.getElement()?.querySelector(".nm");

    /* ————————————————— filters ————————————————— */
    const filtersNav = document.getElementById("filters");
    function renderFilters() {
      const counts = Object.fromEntries(
        FILTERS.map((f) => [f.id, stories.filter((s) => f.test(daysOld(s.date))).length])
      );
      filtersNav.innerHTML = "";
      for (const f of FILTERS) {
        const btn = document.createElement("button");
        btn.className = "chip" + (f.id === activeFilter ? " active" : "");
        btn.style.setProperty("--c", f.color);
        btn.disabled = counts[f.id] === 0 && f.id !== "all";
        btn.innerHTML =
          `<span class="dot"></span>${f.label}<span class="n">${counts[f.id]}</span>`;
        btn.addEventListener("click", () => setFilter(f.id));
        filtersNav.appendChild(btn);
      }
    }
    function setFilter(id) {
      activeFilter = id;
      renderFilters();
      if (selectedPlace && !byPlace.get(selectedPlace)?.some(storyMatches)) closeSheet();
      renderMarkers();
    }

    /* ————————————————— header stats & sparkline ————————————————— */
    function renderHeader() {
      const sub = document.getElementById("brandSub");
      const dot = document.getElementById("liveDot");
      const todayCount = stories.filter((s) => daysOld(s.date) <= 0).length;
      const bits = [`${stories.length} stories`, `${byPlace.size} places`];
      if (autoMeta?.generatedAt) bits.push(`updated ${agoFromTimestamp(autoMeta.generatedAt)}`);
      sub.textContent = bits.join(" · ");
      dot.classList.toggle("hot", todayCount > 0);
      dot.title = todayCount > 0 ? `${todayCount} stories today` : "No stories yet today";

      const fresh = document.getElementById("aboutFresh");
      if (fresh) {
        const perRun = autoMeta?.topPerRun;
        fresh.textContent = autoMeta?.generatedAt
          ? `Automated stories last refreshed ${agoFromTimestamp(autoMeta.generatedAt)} ` +
            `(${new Date(autoMeta.generatedAt).toLocaleString("en-PH")}). ` +
            // Older data files predate the top-N policy and carry no topPerRun,
            // so only describe the cadence when the file actually states it.
            (perRun ? `Each refresh adds the top ${perRun} headlines, four times a day. ` : "") +
            `${autoMeta.counts?.items ?? 0} automated stories are currently on the map, ` +
            // The UI clips to MAX_AGE_DAYS no matter what the file was built
            // with, so quote the window actually enforced — a data file cached
            // before a window change would otherwise advertise the old one.
            `kept for ${Math.min(autoMeta.retentionDays ?? MAX_AGE_DAYS, MAX_AGE_DAYS)} days. ` +
            `Healthy sources this run: ${(autoMeta.sourceHealth ?? []).filter((h) => h.ok).length}` +
            `/${(autoMeta.sourceHealth ?? []).length}.`
          : "Showing hand-verified stories only — the automated feed hasn't been loaded yet. " +
            "Once the GitHub Action runs, fresh stories appear here automatically.";
      }
      renderSpark();
    }

    function renderSpark() {
      const el = document.getElementById("spark");
      if (!el) return;
      // One bar per day the window can hold, inclusive of today — otherwise
      // the tail of the sparkline is permanently empty.
      const days = MAX_AGE_DAYS + 1;
      const buckets = new Array(days).fill(0);
      for (const s of stories) {
        const d = daysOld(s.date);
        if (d >= 0 && d < days) buckets[days - 1 - d]++;
      }
      const peak = Math.max(1, ...buckets);
      el.innerHTML = buckets
        .map((n, i) => {
          const tier = tierOf(days - 1 - i);
          const h = n === 0 ? 8 : 18 + Math.round((n / peak) * 82);
          return `<i style="--h:${h}%;--c:${n ? tier.color : "rgba(255,255,255,.13)"};--i:${i}"></i>`;
        })
        .join("");
      el.title = `${buckets.reduce((a, b) => a + b, 0)} stories in the last ${days} days`;
    }

    /* ————————————————— Wikipedia lead images ————————————————— */
    const wikiCache = new Map();
    function wikiImage(title) {
      if (!title) return Promise.resolve(null);
      if (wikiCache.has(title)) return wikiCache.get(title);
      const promise = fetch(
        `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`
      )
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => {
          if (!j || !j.thumbnail) return null;
          const src = j.originalimage && j.originalimage.width > 820
            ? j.thumbnail.source.replace(/\/(\d+)px-/, "/800px-")
            : (j.originalimage?.source ?? j.thumbnail.source);
          return { src, fallback: j.thumbnail.source, page: j.content_urls?.desktop?.page };
        })
        .catch(() => null);
      wikiCache.set(title, promise);
      return promise;
    }

    /* ————————————————— sheet ————————————————— */
    const sheet = document.getElementById("sheet");
    const sheetContent = document.getElementById("sheetContent");
    const isDesktop = () => window.matchMedia("(min-width: 820px)").matches;

    function setSheetHtml(html) {
      sheetContent.innerHTML = `<div class="sheet-view">${html}</div>`;
      sheetContent.scrollTop = 0;
    }
    function openSheet(state = "peek") {
      sheet.classList.remove("peek", "full");
      sheet.classList.add(isDesktop() ? "full" : state);
    }
    function closeSheet() {
      sheet.classList.remove("peek", "full");
      if (selectedPlace) {
        markerEl(selectedPlace)?.classList.remove("selected");
        selectedPlace = null;
      }
    }
    document.getElementById("sheetClose").addEventListener("click", closeSheet);

    function openPlace(placeId, zoomOverride) {
      const spot = places[placeId];
      if (!spot || !Number.isFinite(spot.lat) || !Number.isFinite(spot.lng)) return;
      if (selectedPlace) markerEl(selectedPlace)?.classList.remove("selected");
      selectedPlace = placeId;
      const el = markerEl(placeId);
      el?.classList.add("selected");
      if (el && !reduceMotion) {
        el.classList.remove("tapped");
        void el.offsetWidth;
        el.classList.add("tapped");
      }

      const place = spot;
      const zoom = safeZoom(zoomOverride ?? Math.max(currentZoom(), 8), 8);
      let target = L.latLng(place.lat, place.lng);
      if (!isDesktop()) {
        const pt = map.project(target, zoom);
        pt.y += window.innerHeight * 0.22;
        target = map.unproject(pt, zoom);
      }
      map.flyTo(target, zoom, { duration: 0.9 });

      const list = visibleStories(placeId);
      if (list.length === 1) renderStory(list[0]);
      else renderPlaceList(placeId, list);
      openSheet("peek");
    }

    function provenanceBadge(story) {
      return story.provenance === "auto"
        ? `<span class="prov-badge auto" title="Headline pulled automatically from an allowlisted newsroom">◈ Auto</span>`
        : `<span class="prov-badge curated" title="Hand-researched and cross-checked">✔ Verified</span>`;
    }

    function storyCardHtml(story, index, opts = {}) {
      const cat = CATEGORIES[story.category] ?? CATEGORIES.politics;
      const tier = tierOf(daysOld(story.date));
      const place = places[story.place];
      return `<button class="story-card" style="--c:${tier.color};--d:${index * 0.045}s"
                      data-story="${escapeHtml(story.id)}">
        <span class="sc-dot"></span>
        <span class="sc-body">
          <span class="sc-title">${escapeHtml(story.title)}</span>
          <span class="sc-meta">
            <span class="sc-time">${relativeTime(story.date)}</span>
            <span class="sc-sep">·</span>${cat.icon} ${cat.label}
            ${opts.showPlace && place ? `<span class="sc-sep">·</span>📍 ${escapeHtml(place.name)}` : ""}
          </span>
        </span>
        <span class="sc-arrow">›</span>
      </button>`;
    }

    function wireCards(root, onPick) {
      root.querySelectorAll(".story-card").forEach((card) => {
        card.addEventListener("click", () => {
          const story = stories.find((s) => s.id === card.dataset.story);
          if (story) onPick(story);
        });
      });
    }

    function renderPlaceList(placeId, fullList) {
      const place = places[placeId];
      const tier = leadTier(placeId);
      // A busy place can hold hundreds of stories; rendering them all would
      // stall the sheet, so cap the DOM and say what was trimmed.
      const list = fullList.slice(0, LIST_LIMIT);
      setSheetHtml(`
        <div class="place-head" style="--c:${tier.color}">
          <h2>${escapeHtml(place.name)}</h2>
          <p>${escapeHtml(place.area)} · ${fullList.length} stor${fullList.length === 1 ? "y" : "ies"}${
            fullList.length > list.length ? ` · newest ${list.length} shown` : ""
          }</p>
          <span class="hot">⚡ News hotspot</span>
        </div>
        ${list.map((s, i) => storyCardHtml(s, i)).join("")}
      `);
      wireCards(sheetContent, (story) => {
        renderStory(story, { backTo: placeId });
        openSheet(sheet.classList.contains("full") ? "full" : "peek");
      });
    }

    function renderLatest() {
      const filter = activeFilterDef();
      const matching = stories.filter((s) => filter.test(daysOld(s.date)));
      const list = matching
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, LIST_LIMIT);
      setSheetHtml(`
        <div class="place-head" style="--c:${filter.color}">
          <h2>Latest stories</h2>
          <p>${filter.label} · showing ${list.length}${
            matching.length > list.length ? ` of ${matching.length}` : ""
          }</p>
        </div>
        ${list.length
          ? list.map((s, i) => storyCardHtml(s, i, { showPlace: true })).join("")
          : `<p class="empty-note">No stories in this period yet.</p>`}
      `);
      wireCards(sheetContent, (story) => {
        openPlace(story.place, Math.max(currentZoom(), 9));
        renderStory(story, { backTo: "__latest__" });
        openSheet(sheet.classList.contains("full") ? "full" : "peek");
      });
      openSheet("peek");
    }

    function renderStory(story, opts = {}) {
      const place = places[story.place];
      const cat = CATEGORIES[story.category] ?? CATEGORIES.politics;
      const tier = tierOf(daysOld(story.date));
      const heroId = `hero-${story.id}`;
      const backLabel = opts.backTo === "__latest__"
        ? "Latest stories"
        : opts.backTo ? places[opts.backTo]?.name : null;

      setSheetHtml(`
        ${backLabel ? `<button class="back-btn" id="backBtn">‹ ${escapeHtml(backLabel)}</button>` : ""}
        <div class="story-hero loading" id="${heroId}" style="--c:${tier.color}">
          <span class="hero-fallback">${cat.icon}</span>
          <div class="hero-grad"></div>
          <span class="hero-tier" style="--c:${tier.color}">${relativeTime(story.date)}</span>
        </div>
        <div class="story-meta" style="--c:${tier.color}">
          ${provenanceBadge(story)}
          <span class="cat-pill">${cat.icon} ${cat.label}</span>
          <span class="story-date">📅 ${fmtDate(story.date)}</span>
          <span class="story-place">📍 ${escapeHtml(place.name)}, ${escapeHtml(place.area)}</span>
        </div>
        <h2 class="story-title">${escapeHtml(story.title)}</h2>
        <p class="story-summary">${escapeHtml(story.summary)}</p>
        ${story.provenance === "auto"
          ? `<p class="auto-note">◈ Summary above is the outlet's own wording, pulled automatically from its
               news feed. Open the source for the full report.</p>`
          : ""}
        <div class="sources-label"><span class="check">✔</span>
          ${story.provenance === "auto" ? "Source — read the full story" : "Verified sources — read the full story"}
        </div>
        <div class="source-links">
          ${story.sources.map((src) => {
            let host = src.url;
            try { host = new URL(src.url).hostname.replace("www.", ""); } catch {}
            return `<a class="source-link" href="${escapeHtml(src.url)}" target="_blank" rel="noopener noreferrer">
              <span class="fav">${escapeHtml(src.outlet.charAt(0))}</span>
              <span class="sl-body">${escapeHtml(src.outlet)}<span class="host">${escapeHtml(host)}</span></span>
              <span class="ext">↗</span>
            </a>`;
          }).join("")}
        </div>
      `);

      document.getElementById("backBtn")?.addEventListener("click", () => {
        if (opts.backTo === "__latest__") renderLatest();
        else renderPlaceList(opts.backTo, visibleStories(opts.backTo));
      });

      const wikiTitle = story.wiki || place.wiki;
      const imageSource = story.image ? Promise.resolve(story.image) : wikiImage(wikiTitle);
      imageSource.then((img) => {
        const hero = document.getElementById(heroId);
        if (!hero) return;
        if (!img) { hero.classList.remove("loading"); return; }
        const el = new Image();
        el.alt = `${wikiTitle || place.name} — representative photo`;
        el.onload = () => {
          hero.classList.remove("loading");
          hero.prepend(el);
          setTimeout(() => el.classList.add("loaded"), 30);
          if (img.page) {
            const credit = document.createElement("a");
            credit.className = "hero-credit";
            credit.href = img.page;
            credit.target = "_blank";
            credit.rel = "noopener noreferrer";
            credit.textContent = img.credit || "Photo via Wikipedia";
            hero.appendChild(credit);
          }
        };
        el.onerror = () => {
          if (img.fallback && el.src !== img.fallback) el.src = img.fallback;
          else hero.classList.remove("loading");
        };
        el.src = img.src;
      });
    }

    /* ————————————————— FABs ————————————————— */
    document.getElementById("fabReset").addEventListener("click", () => {
      closeSheet();
      map.flyToBounds(PH_BOUNDS, { padding: [10, 10], duration: 1.1 });
    });
    document.getElementById("fabLatest").addEventListener("click", renderLatest);
    document.getElementById("fabShuffle").addEventListener("click", () => {
      const pool = stories.filter(storyMatches);
      const story = pool[Math.floor(Math.random() * pool.length)];
      if (!story) return;
      openPlace(story.place, Math.max(currentZoom(), 10));
      renderStory(story, (byPlace.get(story.place)?.length ?? 0) > 1 ? { backTo: story.place } : {});
    });

    /* ————————————————— sheet drag (mobile) ————————————————— */
    const handle = document.getElementById("sheetHandle");
    let dragStartY = 0, startTranslate = 0, dragging = false;

    handle.addEventListener("touchstart", (e) => {
      dragging = true;
      dragStartY = e.touches[0].clientY;
      const naturalTop = window.innerHeight - sheet.offsetHeight;
      startTranslate = sheet.getBoundingClientRect().top - naturalTop;
      sheet.classList.add("dragging");
    }, { passive: true });

    window.addEventListener("touchmove", (e) => {
      if (!dragging) return;
      const dy = e.touches[0].clientY - dragStartY;
      const t = Math.min(
        Math.max(startTranslate + dy, window.innerHeight * 0.04),
        sheet.offsetHeight
      );
      sheet.style.transform = `translateY(${t}px)`;
    }, { passive: true });

    window.addEventListener("touchend", () => {
      if (!dragging) return;
      dragging = false;
      sheet.classList.remove("dragging");
      const top = sheet.getBoundingClientRect().top;
      sheet.style.transform = "";
      const h = window.innerHeight;
      if (top < h * 0.35) openSheet("full");
      else if (top < h * 0.8) openSheet("peek");
      else closeSheet();
    });

    /* ————————————————— about modal ————————————————— */
    const aboutModal = document.getElementById("aboutModal");
    document.getElementById("aboutBtn").addEventListener("click", () => (aboutModal.hidden = false));
    document.getElementById("aboutClose").addEventListener("click", () => (aboutModal.hidden = true));
    aboutModal.addEventListener("click", (e) => { if (e.target === aboutModal) aboutModal.hidden = true; });
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { aboutModal.hidden = true; closeSheet(); }
    });

    /* ————————————————— first paint, then the live feed ————————————————— */
    renderFilters();
    renderHeader();
    renderMarkers();
    setTimeout(() => { introDone = true; }, 2200);

    clearTimeout(window.__veilTimer);
    setTimeout(() => document.getElementById("introVeil").classList.add("gone"), 1000);

    loadAutoNews();

    async function loadAutoNews() {
      try {
        const res = await fetch(`data/auto-news.json?t=${Date.now()}`, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const payload = await res.json();
        if (!payload || !Array.isArray(payload.items)) throw new Error("malformed payload");

        for (const [id, p] of Object.entries(payload.places ?? {})) {
          if (!places[id]) places[id] = p;
        }
        // A curated story always beats an auto copy of the same article.
        const curatedUrls = new Set(
          stories.flatMap((s) => (s.sources ?? []).map((x) => normalizeUrl(x.url)))
        );
        const fresh = payload.items.filter((item) => {
          if (!places[item.place] || !item.date || !item.title) return false;
          if (!Array.isArray(item.sources) || !item.sources.length) return false;
          // Belt and braces: the ingest already prunes, but never trust a data
          // file to respect the window the UI promises.
          if (!withinWindow(item)) return false;
          return !item.sources.some((x) => curatedUrls.has(normalizeUrl(x.url)));
        });

        autoMeta = payload;
        stories = [...stories, ...fresh];
        rebuildIndex();
        renderFilters();
        renderHeader();
        renderMarkers();
      } catch (err) {
        // Expected before the first Action run, or when opened straight from
        // the filesystem. The curated map is fully usable without it.
        console.info("Auto news feed unavailable — showing curated stories only.", err.message);
        renderHeader();
      }
    }
  }
})();
