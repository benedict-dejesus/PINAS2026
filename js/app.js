/* PILIPINAS 2026 — app logic */
(() => {
  "use strict";

  if (typeof L === "undefined") {
    window.__appFatal?.("Couldn't load the map engine. Check your connection, then reload.");
    return;
  }

  const PH_BOUNDS = L.latLngBounds([4.2, 114.0], [21.5, 127.6]);
  const fmtDate = (iso) =>
    new Date(iso + "T00:00:00").toLocaleDateString("en-PH", {
      year: "numeric", month: "long", day: "numeric",
    });

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

  L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
    attribution: "© OpenStreetMap contributors © CARTO",
    subdomains: "abcd",
    maxZoom: 19,
  }).addTo(map);

  map.fitBounds(PH_BOUNDS, { padding: [10, 10] });

  // ————— Group stories by place —————
  const byPlace = new Map();
  for (const story of NEWS_DATA) {
    if (!byPlace.has(story.place)) byPlace.set(story.place, []);
    byPlace.get(story.place).push(story);
  }
  for (const stories of byPlace.values()) {
    stories.sort((a, b) => b.date.localeCompare(a.date));
  }

  // ————— Markers —————
  const markers = new Map(); // placeId -> L.Marker
  let selectedPlace = null;
  let activeFilter = "all";

  function markerHtml(placeId) {
    const stories = byPlace.get(placeId);
    const lead = stories[0];
    const color = CATEGORIES[lead.category].color;
    const count = stories.length > 1
      ? `<span class="nm-count">${stories.length}</span>` : "";
    return `<div class="nm" style="--c:${color}" data-place="${placeId}">
      <span class="nm-pulse"></span>
      <span class="nm-core"></span>${count}
    </div>`;
  }

  let dropDelay = 0;
  for (const [placeId, stories] of byPlace) {
    const place = PLACES[placeId];
    const size = stories.length > 1 ? 46 : 36;
    const icon = L.divIcon({
      className: "news-marker",
      html: markerHtml(placeId),
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
    });
    const marker = L.marker([place.lat, place.lng], { icon, riseOnHover: true })
      .addTo(map)
      .on("click", () => openPlace(placeId));
    if (window.matchMedia("(hover: hover)").matches) {
      marker.bindTooltip(
        `${stories.length > 1 ? `${stories.length} stories` : stories[0].title}
         <small>${place.name} · ${place.area}</small>`,
        { className: "nm-tip", direction: "top", offset: [0, -size / 2 - 4], opacity: 1 }
      );
    }
    markers.set(placeId, marker);
    // stagger the drop-in animation
    marker.getElement()?.querySelector(".nm")?.style.setProperty("--delay", `${0.5 + dropDelay}s`);
    dropDelay += 0.07;
  }

  function markerEl(placeId) {
    return markers.get(placeId)?.getElement()?.querySelector(".nm");
  }

  // ————— Filters —————
  const filtersNav = document.getElementById("filters");
  const filterDefs = [["all", { label: "All stories", color: "#fcd116" }], ...Object.entries(CATEGORIES)];
  for (const [key, def] of filterDefs) {
    const count = key === "all"
      ? NEWS_DATA.length
      : NEWS_DATA.filter((s) => s.category === key).length;
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
    for (const [placeId, stories] of byPlace) {
      const visible = key === "all" || stories.some((s) => s.category === key);
      markerEl(placeId)?.classList.toggle("dimmed", !visible);
    }
    if (selectedPlace && !(key === "all" || byPlace.get(selectedPlace).some((s) => s.category === key))) {
      closeSheet();
    }
  }

  // ————— Wikipedia lead images (representative photos, lazy + cached) —————
  const wikiCache = new Map();
  async function wikiImage(title) {
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

  function openPlace(placeId) {
    if (selectedPlace) markerEl(selectedPlace)?.classList.remove("selected");
    selectedPlace = placeId;
    markerEl(placeId)?.classList.add("selected");

    const place = PLACES[placeId];
    const zoom = Math.max(map.getZoom(), 8);
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
    sheetContent.innerHTML = `
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
    `;
    sheetContent.scrollTop = 0;
    sheetContent.querySelectorAll(".story-card").forEach((card) => {
      card.addEventListener("click", () => {
        const story = NEWS_DATA.find((s) => s.id === card.dataset.story);
        renderStory(story, { backTo: placeId });
        openSheet(sheet.classList.contains("full") ? "full" : "peek");
      });
    });
  }

  function renderStory(story, opts = {}) {
    const place = PLACES[story.place];
    const cat = CATEGORIES[story.category];
    const heroId = `hero-${story.id}`;
    sheetContent.innerHTML = `
      ${opts.backTo ? `<button class="back-btn" id="backBtn">‹ ${PLACES[opts.backTo].name}</button>` : ""}
      <div class="story-hero" id="${heroId}" style="--c:${cat.color}">
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
    `;
    sheetContent.scrollTop = 0;
    document.getElementById("backBtn")?.addEventListener("click", () =>
      renderPlaceList(opts.backTo, visibleStories(opts.backTo))
    );

    // Lazy-load a representative photo from Wikipedia
    wikiImage(story.wiki).then((img) => {
      const hero = document.getElementById(heroId);
      if (!img || !hero) return;
      const el = new Image();
      el.alt = `${story.wiki} — representative photo`;
      el.onload = () => {
        hero.prepend(el);
        setTimeout(() => el.classList.add("loaded"), 30);
        if (img.page) {
          const credit = document.createElement("a");
          credit.className = "hero-credit";
          credit.href = img.page;
          credit.target = "_blank";
          credit.rel = "noopener noreferrer";
          credit.textContent = "Photo via Wikipedia";
          hero.appendChild(credit);
        }
      };
      el.onerror = () => {
        if (img.fallback && el.src !== img.fallback) el.src = img.fallback;
      };
      el.src = img.src;
    });
  }

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
})();
