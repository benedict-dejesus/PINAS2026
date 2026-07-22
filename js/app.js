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
    const CLUSTER_PX = 52; // markers closer than this (in px) merge into a cluster
    const fmtDate = (iso) =>
      new Date(iso + "T00:00:00").toLocaleDateString("en-PH", {
        year: "numeric", month: "long", day: "numeric",
      });

    // Defensive: ignore stories that point at unknown places or categories.
    const DATA = NEWS_DATA.filter((s) => PLACES[s.place] && CATEGORIES[s.category]);

    // ————— Map —————
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

    // Primary dark basemap, with an automatic fallback to OSM (recolored via
    // CSS) if the CARTO CDN is unreachable.
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

    // ————— Group stories by place —————
    const byPlace = new Map();
    for (const story of DATA) {
      if (!byPlace.has(story.place)) byPlace.set(story.place, []);
      byPlace.get(story.place).push(story);
    }
    for (const stories of byPlace.values()) {
      stories.sort((a, b) => b.date.localeCompare(a.date));
    }

    document.getElementById("brandSub").textContent =
      `${DATA.length} verified stories · ${byPlace.size} places`;

    // ————— State —————
    let selectedPlace = null;
    let activeFilter = "all";
    let introDone = false;
    const hasHover = window.matchMedia("(hover: hover)").matches;

    // ————— Place markers (created once, shown/hidden by the clusterer) —————
    const placeMarkers = new Map(); // placeId -> L.Marker
    let clusterMarkers = [];

    function leadCategory(placeId) {
      const stories = visibleStories(placeId);
      return CATEGORIES[stories[0].category];
    }

    function makePlaceMarker(placeId, dropIndex) {
      const stories = byPlace.get(placeId);
      const place = PLACES[placeId];
      const cat = leadCategory(placeId);
      const count = visibleStories(placeId).length;
      const size = count > 1 ? 46 : 38;
      const delay = introDone ? 0 : 0.45 + dropIndex * 0.06;
      const icon = L.divIcon({
        className: "news-marker",
        html: `<div class="nm${placeId === selectedPlace ? " selected" : ""}"
                    style="--c:${cat.color};--delay:${delay}s" data-place="${placeId}">
                 <span class="nm-pulse"></span>
                 <span class="nm-ring"></span>
                 <span class="nm-core">${cat.icon}</span>
                 ${count > 1 ? `<span class="nm-count">${count}</span>` : ""}
               </div>`,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
      });
      const marker = L.marker([place.lat, place.lng], { icon, riseOnHover: true })
        .on("click", () => openPlace(placeId));
      if (hasHover) {
        marker.bindTooltip(
          `${count > 1 ? `${count} stories` : stories[0].title}
           <small>${place.name} · ${place.area}</small>`,
          { className: "nm-tip", direction: "top", offset: [0, -size / 2 - 4], opacity: 1 }
        );
      }
      return marker;
    }

    function makeClusterMarker(memberIds, latlng, dropIndex) {
      const storyCount = memberIds.reduce((n, id) => n + visibleStories(id).length, 0);
      const delay = introDone ? 0 : 0.45 + dropIndex * 0.06;
      const icon = L.divIcon({
        className: "news-marker",
        html: `<div class="nm nm-cluster" style="--c:#fcd116;--delay:${delay}s">
                 <span class="nm-pulse"></span>
                 <span class="nm-core">${storyCount}</span>
               </div>`,
        iconSize: [52, 52],
        iconAnchor: [26, 26],
      });
      const marker = L.marker(latlng, { icon }).on("click", () => {
        const bounds = L.latLngBounds(memberIds.map((id) => [PLACES[id].lat, PLACES[id].lng]));
        // Always make zoom progress: fitting the bounds alone can stall on
        // small screens when members are only a few hundred meters apart.
        const fitZoom = map.getBoundsZoom(bounds, false, L.point(70, 70));
        const target = Math.min(Math.max(fitZoom, map.getZoom() + 1.75), 16);
        map.flyTo(bounds.getCenter(), target, { duration: 0.8 });
      });
      if (hasHover) {
        marker.bindTooltip(
          `${storyCount} stories · ${memberIds.length} places<small>Tap to zoom in</small>`,
          { className: "nm-tip", direction: "top", offset: [0, -30], opacity: 1 }
        );
      }
      return marker;
    }

    function visiblePlaceIds() {
      return [...byPlace.keys()].filter(
        (id) => activeFilter === "all" || byPlace.get(id).some((s) => s.category === activeFilter)
      );
    }

    // Greedy pixel-distance clustering, recomputed on zoom and filter changes.
    function renderMarkers() {
      for (const m of placeMarkers.values()) map.removeLayer(m);
      for (const m of clusterMarkers) map.removeLayer(m);
      placeMarkers.clear();
      clusterMarkers = [];

      const zoom = map.getZoom();
      const clusters = [];
      for (const id of visiblePlaceIds()) {
        const pt = map.project([PLACES[id].lat, PLACES[id].lng], zoom);
        let home = null;
        for (const c of clusters) {
          if (c.members.some((m) => m.pt.distanceTo(pt) < CLUSTER_PX)) { home = c; break; }
        }
        if (home) home.members.push({ id, pt });
        else clusters.push({ members: [{ id, pt }] });
      }

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
    renderMarkers();
    setTimeout(() => { introDone = true; }, 2200);

    function markerEl(placeId) {
      return placeMarkers.get(placeId)?.getElement()?.querySelector(".nm");
    }

    // ————— Filters —————
    const filtersNav = document.getElementById("filters");
    const filterDefs = [["all", { label: "All stories", color: "#fcd116" }], ...Object.entries(CATEGORIES)];
    for (const [key, def] of filterDefs) {
      const count = key === "all" ? DATA.length : DATA.filter((s) => s.category === key).length;
      const btn = document.createElement("button");
      btn.className = "chip" + (key === "all" ? " active" : "");
      btn.style.setProperty("--c", def.color);
      btn.innerHTML = `<span class="dot"></span>${def.label}<span class="n">${count}</span>`;
      btn.addEventListener("click", () => setFilter(key, btn));
      filtersNav.appendChild(btn);
    }

    function setFilter(key, btn) {
      activeFilter = key;
      filtersNav.querySelectorAll(".chip").forEach((c) => c.classList.remove("active"));
      btn.classList.add("active");
      if (selectedPlace && !(key === "all" || byPlace.get(selectedPlace).some((s) => s.category === key))) {
        closeSheet();
      }
      renderMarkers();
    }

    // ————— Wikipedia lead images (representative photos, lazy + cached) —————
    const wikiCache = new Map();
    function wikiImage(title) {
      if (wikiCache.has(title)) return wikiCache.get(title);
      const promise = fetch(
        `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`
      )
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => {
          if (!j || !j.thumbnail) return null;
          // phone-friendly size: Wikimedia rejects thumbs wider than the original
          const src = j.originalimage && j.originalimage.width > 820
            ? j.thumbnail.source.replace(/\/(\d+)px-/, "/800px-")
            : (j.originalimage?.source ?? j.thumbnail.source);
          return { src, fallback: j.thumbnail.source, page: j.content_urls?.desktop?.page };
        })
        .catch(() => null);
      wikiCache.set(title, promise);
      return promise;
    }

    // ————— Sheet —————
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
      if (selectedPlace) markerEl(selectedPlace)?.classList.remove("selected");
      selectedPlace = placeId;
      markerEl(placeId)?.classList.add("selected");

      const place = PLACES[placeId];
      const zoom = zoomOverride ?? Math.max(map.getZoom(), 8);
      let target = L.latLng(place.lat, place.lng);
      if (!isDesktop()) {
        // shift the map center down so the marker sits above the peeking sheet
        const pt = map.project(target, zoom);
        pt.y += window.innerHeight * 0.22;
        target = map.unproject(pt, zoom);
      }
      map.flyTo(target, zoom, { duration: 0.9 });

      const stories = visibleStories(placeId);
      if (stories.length === 1) renderStory(stories[0]);
      else renderPlaceList(placeId, stories);
      openSheet("peek");
    }

    function visibleStories(placeId) {
      const all = byPlace.get(placeId);
      if (activeFilter === "all") return all;
      const filtered = all.filter((s) => s.category === activeFilter);
      return filtered.length ? filtered : all;
    }

    function renderPlaceList(placeId, stories) {
      const place = PLACES[placeId];
      setSheetHtml(`
        <div class="place-head">
          <h2>${place.name}</h2>
          <p>${place.area} · ${stories.length} verified stories</p>
          <span class="hot">⚡ News hotspot</span>
        </div>
        ${stories.map((s, i) => {
          const cat = CATEGORIES[s.category];
          return `<div class="story-card" style="--c:${cat.color};--d:${i * 0.06}s" data-story="${s.id}">
            <span class="sc-dot"></span>
            <div>
              <h3>${s.title}</h3>
              <div class="sc-meta">${cat.icon} ${cat.label} · ${fmtDate(s.date)}</div>
            </div>
            <span class="sc-arrow">›</span>
          </div>`;
        }).join("")}
      `);
      sheetContent.querySelectorAll(".story-card").forEach((card) => {
        card.addEventListener("click", () => {
          const story = DATA.find((s) => s.id === card.dataset.story);
          renderStory(story, { backTo: placeId });
          openSheet(sheet.classList.contains("full") ? "full" : "peek");
        });
      });
    }

    function renderStory(story, opts = {}) {
      const place = PLACES[story.place];
      const cat = CATEGORIES[story.category];
      const heroId = `hero-${story.id}`;
      setSheetHtml(`
        ${opts.backTo ? `<button class="back-btn" id="backBtn">‹ ${PLACES[opts.backTo].name}</button>` : ""}
        <div class="story-hero loading" id="${heroId}" style="--c:${cat.color}">
          <span class="hero-fallback">${cat.icon}</span>
          <div class="hero-grad"></div>
        </div>
        <div class="story-meta" style="--c:${cat.color}">
          <span class="cat-pill">${cat.icon} ${cat.label}</span>
          <span class="story-date">📅 ${fmtDate(story.date)}</span>
          <span class="story-place">📍 ${place.name}, ${place.area}</span>
        </div>
        <h2 class="story-title">${story.title}</h2>
        <p class="story-summary">${story.summary}</p>
        <div class="sources-label"><span class="check">✔</span> Verified sources — read the full story</div>
        <div class="source-links">
          ${story.sources.map((src) => {
            const host = new URL(src.url).hostname.replace("www.", "");
            return `<a class="source-link" href="${src.url}" target="_blank" rel="noopener noreferrer">
              <span class="fav">${src.outlet.charAt(0)}</span>
              <span>${src.outlet}<div class="host">${host}</div></span>
              <span class="ext">↗</span>
            </a>`;
          }).join("")}
        </div>
      `);
      document.getElementById("backBtn")?.addEventListener("click", () =>
        renderPlaceList(opts.backTo, visibleStories(opts.backTo))
      );

      // Hand-picked story image if provided, otherwise the wiki lead photo
      const imageSource = story.image
        ? Promise.resolve(story.image)
        : wikiImage(story.wiki);
      imageSource.then((img) => {
        const hero = document.getElementById(heroId);
        if (!hero) return;
        if (!img) { hero.classList.remove("loading"); return; }
        const el = new Image();
        el.alt = `${story.wiki} — representative photo`;
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

    // ————— FABs: reset view + surprise me —————
    document.getElementById("fabReset").addEventListener("click", () => {
      closeSheet();
      map.flyToBounds(PH_BOUNDS, { padding: [10, 10], duration: 1.1 });
    });
    document.getElementById("fabShuffle").addEventListener("click", () => {
      const pool = DATA.filter((s) => activeFilter === "all" || s.category === activeFilter);
      const story = pool[Math.floor(Math.random() * pool.length)];
      if (!story) return;
      openPlace(story.place, Math.max(map.getZoom(), 10));
      renderStory(story, byPlace.get(story.place).length > 1 ? { backTo: story.place } : {});
    });

    // ————— Sheet drag (mobile) —————
    const handle = document.getElementById("sheetHandle");
    let dragStartY = 0, startTranslate = 0, dragging = false;

    handle.addEventListener("touchstart", (e) => {
      dragging = true;
      dragStartY = e.touches[0].clientY;
      // translateY is relative to the sheet's natural (fully visible) position
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

    // ————— About modal —————
    const aboutModal = document.getElementById("aboutModal");
    document.getElementById("aboutBtn").addEventListener("click", () => (aboutModal.hidden = false));
    document.getElementById("aboutClose").addEventListener("click", () => (aboutModal.hidden = true));
    aboutModal.addEventListener("click", (e) => { if (e.target === aboutModal) aboutModal.hidden = true; });
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { aboutModal.hidden = true; closeSheet(); }
    });

    // ————— Intro —————
    // Init succeeded: dismiss the veil once markers have dropped in.
    clearTimeout(window.__veilTimer);
    setTimeout(() => document.getElementById("introVeil").classList.add("gone"), 1100);
  }
})();
