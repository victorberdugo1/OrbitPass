import * as THREE from "./vendor/three.module.min.js";
import { createMoon, createTextureLoader } from "./bodies.js";

const CATEGORIES = [
  { id: "all", name: "All" },
  { id: "attractions", name: "Attractions" },
  { id: "food", name: "Food" },
  { id: "events", name: "Events" }
];

const SORTS = {
  recommended: (a, b) => b.score - a.score,
  rating: (a, b) => b.rating - a.rating || b.reviews - a.reviews,
  reviews: (a, b) => b.reviews - a.reviews,
  price: (a, b) => a.priceUsd - b.priceUsd,
  distance: (a, b) => a.distanceKm - b.distanceKm
};

const NAV = [
  { id: "explore", name: "Explore" },
  { id: "bases", name: "Bases" },
  { id: "trip", name: "My Trip" }
];

const WINDOW_HOURS = 14 * 24;
const GROUP_LABEL = { attractions: "Attraction", food: "Dining", events: "Event" };
const pad = (n) => String(n).padStart(2, "0");
const usd = (n) => "$" + Math.round(n).toLocaleString("en-US");
const durationText = (m) => (m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}` : `${m} min`);
const todayIso = () => new Date().toISOString().slice(0, 10);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const stars = (r) => {
  const full = Math.round(r);
  return `<span class="tp-stars">${"★".repeat(full)}${"☆".repeat(5 - full)}</span>`;
};

export function createExplorer(root, { launchSites, sky }) {
  const state = {
    view: "explore",
    detail: null,
    cat: "all",
    base: "all",
    launch: 0,
    date: todayIso(),
    hour: new Date().getUTCHours(),
    q: "",
    min: 0,
    sort: "recommended",
    openOnly: false,
    guests: 2,
    session: null,
    trip: []
  };
  let data = null;
  let bases = new Map();
  let venues = new Map();
  const windows = new Map();
  let moonFrame = 0;

  const currentMs = () => Date.parse(`${state.date}T${pad(state.hour)}:00:00Z`);

  function timeline(base, startMs) {
    const key = `${base.id}|${startMs}`;
    if (!windows.has(key)) {
      const rows = [];
      for (let h = 0; h < WINDOW_HOURS; h++) {
        const s = sky(startMs + h * 36e5, base);
        rows.push({ sun: s.sun.up, earth: s.earth.up, sunEl: s.sun.el, earthEl: s.earth.el });
      }
      if (windows.size > 64) windows.clear();
      windows.set(key, rows);
    }
    return windows.get(key);
  }

  function availability(v, ms) {
    const rows = timeline(bases.get(v.base), ms);
    const need = v.earthView ? "earth" : v.outdoor ? "sun" : "any";
    const okAt = (r) => (need === "any" ? true : need === "sun" ? r.sun : r.earth);
    const now = rows[0];
    if (okAt(now)) return { ok: true, need, now };
    const next = rows.findIndex(okAt);
    return { ok: false, need, now, next: next > 0 ? next : null };
  }

  const availabilityBadge = (a) => {
    if (a.ok) return `<span class="tp-badge ok">${a.need === "any" ? "Open" : a.need === "sun" ? "Daylight now" : "Earth in view"}</span>`;
    const label = a.need === "sun" ? "Night" : "Earth below horizon";
    const wait = a.next === null ? "" : ` · in ${a.next} h`;
    return `<span class="tp-badge warn">${label}${wait}</span>`;
  };

  const venueScore = (v) => v.rating * Math.log10(v.reviews + 10);

  function filtered() {
    const q = state.q.trim().toLowerCase();
    const ms = currentMs();
    return data.venues
      .filter((v) => (state.cat === "all" || v.group === state.cat) &&
        (state.base === "all" || v.base === state.base) &&
        v.rating >= state.min &&
        (!q || `${v.name} ${v.type} ${bases.get(v.base).name} ${v.description}`.toLowerCase().includes(q)))
      .map((v) => ({ v, a: availability(v, ms), score: venueScore(v) }))
      .filter(({ a }) => !state.openOnly || a.ok)
      .sort((x, y) => SORTS[state.sort]({ ...x.v, score: x.score }, { ...y.v, score: y.score }));
  }

  const baseOptions = () => [
    `<option value="all">All lunar bases</option>`,
    `<optgroup label="Apollo landing sites">${data.bases.filter((b) => b.status === "Apollo landing site").map((b) => `<option value="${b.id}" ${state.base === b.id ? "selected" : ""}>${esc(b.name)}</option>`).join("")}</optgroup>`,
    `<optgroup label="Planned districts">${data.bases.filter((b) => b.status !== "Apollo landing site").map((b) => `<option value="${b.id}" ${state.base === b.id ? "selected" : ""}>${esc(b.name)}</option>`).join("")}</optgroup>`
  ].join("");

  const hourOptions = () => Array.from({ length: 24 }, (_, h) => `<option value="${h}" ${state.hour === h ? "selected" : ""}>${pad(h)}:00 UTC</option>`).join("");

  function header() {
    const tabs = NAV.map((n) => {
      const count = n.id === "trip" ? ` <span class="tp-count">${state.trip.length}</span>` : "";
      return `<button data-nav="${n.id}" class="${state.view === n.id || (state.view === "detail" && n.id === "explore") ? "on" : ""}">${n.name}${count}</button>`;
    }).join("");
    return `<header class="tp-top"><div class="tp-brand">OrbitPass <span>Tourist</span></div><nav class="tp-nav">${tabs}</nav></header>`;
  }

  function sidebar() {
    const launch = launchSites.map((l, i) => `<option value="${i}" ${state.launch === i ? "selected" : ""}>${esc(l.name)}</option>`).join("");
    return `<aside class="tp-side">
  <div class="tp-tabs">${CATEGORIES.map((c) => `<button data-cat="${c.id}" class="${state.cat === c.id ? "on" : ""}">${c.name}</button>`).join("")}</div>
  <label>Date<input type="date" id="tp-date" value="${state.date}"></label>
  <label>Local time<select id="tp-hour">${hourOptions()}</select></label>
  <label>Arrival (launch site)<select id="tp-launch">${launch}</select></label>
  <label>Destination base<select id="tp-base">${baseOptions()}</select></label>
  <label>Search<span class="tp-search"><input type="search" id="tp-q" value="${esc(state.q)}" placeholder="Venue, type or base"><button data-search="1">Search</button></span></label>
  <label>Minimum rating<select id="tp-min">${[[0, "Any rating"], [4, "4.0 and up"], [4.5, "4.5 and up"]].map(([v, t]) => `<option value="${v}" ${state.min === v ? "selected" : ""}>${t}</option>`).join("")}</select></label>
  <label class="tp-check"><input type="checkbox" id="tp-open" ${state.openOnly ? "checked" : ""}> Available at selected time only</label>
  <div class="tp-note">Transfer from ${esc(launchSites[state.launch].name)}: about ${data.meta.transferDays} days.</div>
</aside>`;
  }

  function card(v, a) {
    const b = bases.get(v.base);
    return `<article class="tp-card">
  <div class="tp-art ${v.group}"><span class="tp-type">${esc(v.type)}</span><span class="tp-art-name">${esc(GROUP_LABEL[v.group])}</span></div>
  <div class="tp-body">
    <div class="tp-row"><b class="tp-name">${esc(v.name)}</b><span class="tp-rating">★ ${v.rating.toFixed(1)} <small>(${v.reviews.toLocaleString("en-US")})</small></span></div>
    <div class="tp-sub">${esc(b.name)} · ${esc(b.program)}</div>
    <p>${esc(v.description)}</p>
    <div class="tp-chips"><span>${esc(v.hours)}</span><span>${durationText(v.durationMin)}</span><span>${v.distanceKm} km from base</span></div>
    <div class="tp-row tp-foot">${availabilityBadge(a)}<span class="tp-price">from <b>${usd(v.priceUsd)}</b></span><button class="tp-link" data-open="${v.id}">View details →</button></div>
  </div>
</article>`;
  }

  function exploreView() {
    const ms = currentMs();
    const items = filtered();
    const cat = CATEGORIES.find((c) => c.id === state.cat).name;
    const base = state.base === "all" ? "All lunar bases" : bases.get(state.base).name;
    return `<div class="tp-layout">${sidebar()}
  <section class="tp-main">
    <div class="tp-bar"><div><b>${items.length} results</b> for <span class="tp-accent">${cat}</span> · ${esc(base)} · ${state.date} ${pad(state.hour)}:00 UTC</div>
      <label class="tp-sort">Sort by <select id="tp-sort">${[["recommended", "Recommended"], ["rating", "Highest rated"], ["reviews", "Most reviewed"], ["price", "Lowest price"], ["distance", "Nearest to base"]].map(([v, t]) => `<option value="${v}" ${state.sort === v ? "selected" : ""}>${t}</option>`).join("")}</select></label></div>
    <div class="tp-grid">${items.length ? items.map(({ v }) => card(v, availability(v, ms))).join("") : `<div class="tp-empty">No venues match these filters.</div>`}</div>
  </section></div>`;
  }

  function detailView() {
    const v = venues.get(state.detail);
    const b = bases.get(v.base);
    const ms = currentMs();
    const a = availability(v, ms);
    const now = timeline(b, ms)[0];
    const total = v.breakdown.reduce((s, n) => s + n, 0) || 1;
    const labels = ["5 star", "4 star", "3 star", "2 star", "1 star"];
    const bars = v.breakdown.map((n, i) => `<div><span>${labels[i]}</span><div class="tp-bar-track"><i style="width:${(n / total * 100).toFixed(1)}%"></i></div><span>${Math.round(n / total * 100)}%</span></div>`).join("");
    const reviews = v.reviewList.map((r) => `<div class="tp-review"><div class="tp-row"><span class="tp-stars">${"★".repeat(r.stars)}</span><b>${esc(r.author)}</b><span class="tp-sub">${r.travel} · ${r.date}</span></div><p>${esc(r.text)}</p></div>`).join("");
    const sessions = v.sessions.map((s) => `<option value="${s}" ${state.session === s ? "selected" : ""}>${s}</option>`).join("");
    const menu = v.menu.length
      ? `<h3>Menu</h3><table class="tp-menu">${v.menu.map((m) => `<tr><td><b>${esc(m.name)}</b><div class="tp-sub">${esc(m.desc)}</div></td><td class="tp-num">${usd(m.priceUsd)}</td></tr>`).join("")}</table>`
      : `<h3>Programme</h3><ul class="tp-list">${v.sessions.map((s) => `<li><span>${s}</span> ${esc(v.type)} session</li>`).join("")}</ul>`;
    const siblings = data.venues.filter((x) => x.base === v.base && x.id !== v.id).slice(0, 4)
      .map((x) => `<button class="tp-mini" data-open="${x.id}"><b>${esc(x.name)}</b><span>★ ${x.rating.toFixed(1)} · ${esc(x.type)}</span></button>`).join("");
    const reserved = state.trip.some((t) => t.id === v.id && t.date === state.date);
    return `<div class="tp-crumb"><button data-nav="explore">← Back to results</button></div>
<section class="tp-hero ${v.group}">
  <div class="tp-hero-main">
    <span class="tp-type">${esc(v.type)}</span>
    <h1>${esc(v.name)}</h1>
    <div class="tp-sub">${esc(b.name)} · ${esc(b.program)}</div>
    <div class="tp-rating-line">${stars(v.rating)}<b>${v.rating.toFixed(1)}</b><span>${v.reviews.toLocaleString("en-US")} reviews</span></div>
    <p>${esc(v.description)}</p>
  </div>
  <form class="tp-book" id="tp-book">
    <div class="tp-book-title">Book your experience</div>
    <label>Date<input type="date" id="tp-date" value="${state.date}"></label>
    <label>Session<select id="tp-session">${sessions}</select></label>
    <label>Guests<select id="tp-guests">${[1, 2, 3, 4].map((g) => `<option value="${g}" ${state.guests === g ? "selected" : ""}>${g} ${g === 1 ? "guest" : "guests"}</option>`).join("")}</select></label>
    <div class="tp-total"><span>${usd(v.priceUsd)} × ${state.guests}</span><b>${usd(v.priceUsd * state.guests)}</b></div>
    <button type="button" class="tp-reserve" data-reserve="${v.id}" ${reserved ? "disabled" : ""}>${reserved ? "Added to My Trip" : "Add to My Trip"}</button>
    <div class="tp-note">Demo only: nothing is booked or charged.</div>
  </form>
</section>
<section class="tp-features">
  <div><span>${durationText(v.durationMin)}</span><small>Duration</small></div>
  <div><span>${v.distanceKm} km</span><small>From base</small></div>
  <div><span>${esc(v.hours)}</span><small>Hours</small></div>
  <div><span>${v.outdoor ? "Surface" : "Pressurized"}</span><small>Environment</small></div>
  <div><span>${v.earthView ? "Yes" : "No"}</span><small>Earth view</small></div>
  <div><span>${usd(v.priceUsd)}</span><small>From, per person</small></div>
</section>
<section class="tp-cols">
  <div class="tp-panel">
    <h3>Highlights</h3>
    <ul class="tp-list">${v.highlights.map((h) => `<li>${esc(h)}</li>`).join("")}</ul>
    ${menu}
    <h3>Availability at ${state.date} ${pad(state.hour)}:00 UTC</h3>
    <div class="tp-note">Sun ${now.sunEl.toFixed(1)}° (${now.sun ? "above" : "below"} horizon) · Earth ${now.earthEl.toFixed(1)}° (${now.earth ? "visible" : "not visible"})</div>
    <div class="tp-avail">${availabilityBadge(a)}<span class="tp-sub">${{ any: "Indoor, runs at any time", sun: "Needs daylight at the base", earth: "Needs Earth above the horizon" }[a.need]}</span></div>
  </div>
  <div class="tp-panel">
    <h3>Guest rating</h3>
    <div class="tp-rating-line big">${stars(v.rating)}<b>${v.rating.toFixed(1)}</b></div>
    <div class="tp-bars">${bars}</div>
    <h3>Reviews</h3>
    ${reviews}
  </div>
</section>
<section class="tp-panel tp-wide"><h3>More at ${esc(b.name)}</h3><div class="tp-minis">${siblings}</div></section>`;
  }

  function basesView() {
    const cards = data.bases.map((b) => {
      const vs = data.venues.filter((v) => v.base === b.id);
      const avg = vs.reduce((s, v) => s + v.rating, 0) / vs.length;
      const min = Math.min(...vs.map((v) => v.priceUsd));
      const max = Math.max(...vs.map((v) => v.priceUsd));
      const top = vs.slice().sort(SORTS.rating)[0];
      return `<article class="tp-card tp-base">
  <div class="tp-art ${b.status === "Apollo landing site" ? "food" : "events"}"><span class="tp-type">${esc(b.status)}</span><span class="tp-art-name">${esc(b.mission)}</span></div>
  <div class="tp-body">
    <div class="tp-row"><b class="tp-name">${esc(b.name)}</b><span class="tp-rating">★ ${avg.toFixed(2)}</span></div>
    <div class="tp-sub">${esc(b.program)} · ${b.lat.toFixed(2)}°, ${b.lon.toFixed(2)}°</div>
    <p>${esc(b.description)}</p>
    <div class="tp-chips"><span>${vs.length} venues</span><span>${usd(min)}–${usd(max)}</span><span>Top: ${esc(top.name)}</span></div>
    <div class="tp-row tp-foot"><span></span><button class="tp-link" data-base="${b.id}">Explore venues →</button></div>
  </div>
</article>`;
    }).join("");
    return `<section class="tp-page"><h2>Lunar bases</h2><p class="tp-sub">Destinations by mission and planned district. Select a base to see its venues for the chosen date.</p><div class="tp-grid">${cards}</div></section>`;
  }

  function tripView() {
    const rows = state.trip.map((t) => {
      const v = venues.get(t.id);
      return `<tr><td><b>${esc(v.name)}</b><div class="tp-sub">${esc(bases.get(v.base).name)}</div></td><td>${t.date} · ${t.session}</td><td>${t.guests}</td><td class="tp-num">${usd(v.priceUsd * t.guests)}</td><td><button class="tp-link" data-remove="${t.id}|${t.date}|${t.session}">Remove</button></td></tr>`;
    }).join("");
    const total = state.trip.reduce((s, t) => s + venues.get(t.id).priceUsd * t.guests, 0);
    return `<section class="tp-page"><h2>My Trip</h2><p class="tp-sub">Demo itinerary for this session. Nothing is booked or charged.</p>
${state.trip.length ? `<table class="tp-table"><tr><th>Experience</th><th>When</th><th>Guests</th><th>Total</th><th></th></tr>${rows}<tr><td colspan="3"><b>Total</b></td><td class="tp-num"><b>${usd(total)}</b></td><td></td></tr></table>` : `<div class="tp-empty">Your trip is empty. Add experiences from the results.</div>`}</section>`;
  }

  function render() {
    const body = state.view === "detail" ? detailView()
      : state.view === "bases" ? basesView()
      : state.view === "trip" ? tripView()
      : exploreView();
    root.querySelector(".tp-head").innerHTML = header();
    root.querySelector(".tp-view").innerHTML = body;
  }

  function shell() {
    root.innerHTML = `<div class="tp"><div class="tp-head"></div><div class="tp-view"></div>
<div class="tp-moon"><canvas></canvas><div class="tp-moon-label"><span>Live lunar view</span> · lighting from the selected date</div></div>
<div class="tp-foot-note">${esc(data.meta.disclaimer)}</div></div>`;
  }

  function moon() {
    const host = root.querySelector(".tp-moon");
    const canvas = host.querySelector("canvas");
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
    camera.position.set(0, 0, 6.2);
    scene.add(new THREE.AmbientLight(0xffffff, 0.12));
    const sun = new THREE.DirectionalLight(0xffffff, 2.4);
    sun.position.set(-4, 2, 5);
    scene.add(sun);
    const textures = createTextureLoader(renderer);
    const body = createMoon(textures.load);
    body.root.scale.setScalar(1.7);
    body.root.position.set(0, -1.1, 0);
    body.spin.rotation.z = 0.2;
    scene.add(body.root);
    const resize = () => {
      const w = host.clientWidth || 1;
      const h = host.clientHeight || 1;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    new ResizeObserver(resize).observe(host);
    resize();
    let last = performance.now();
    const loop = (now) => {
      requestAnimationFrame(loop);
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      if (host.offsetParent === null) return;
      body.spin.rotation.y += 0.05 * dt;
      body.root.position.y = -1.1 + Math.sin(now / 1800) * 0.04;
      renderer.render(scene, camera);
    };
    requestAnimationFrame(loop);
  }

  function bind() {
    root.addEventListener("click", (e) => {
      const t = (sel) => e.target.closest(sel);
      if (t("[data-nav]")) {
        state.view = t("[data-nav]").dataset.nav;
        state.detail = null;
        return render();
      }
      if (t("[data-cat]")) {
        state.cat = t("[data-cat]").dataset.cat;
        state.view = "explore";
        return render();
      }
      if (t("[data-open]")) {
        state.detail = t("[data-open]").dataset.open;
        const v = venues.get(state.detail);
        state.session = v.sessions[0];
        state.view = "detail";
        render();
        return root.querySelector(".tp-view").scrollIntoView({ behavior: "smooth", block: "start" });
      }
      if (t("[data-base]")) {
        state.base = t("[data-base]").dataset.base;
        state.view = "explore";
        return render();
      }
      if (t("[data-search]")) {
        state.q = root.querySelector("#tp-q").value;
        return render();
      }
      if (t("[data-reserve]")) {
        const id = t("[data-reserve]").dataset.reserve;
        if (!state.trip.some((x) => x.id === id && x.date === state.date && x.session === state.session)) {
          state.trip.push({ id, date: state.date, session: state.session, guests: state.guests });
        }
        return render();
      }
      if (t("[data-remove]")) {
        const [id, date, session] = t("[data-remove]").dataset.remove.split("|");
        state.trip = state.trip.filter((x) => !(x.id === id && x.date === date && x.session === session));
        return render();
      }
    });
    root.addEventListener("keydown", (e) => {
      if (e.target.id === "tp-q" && e.key === "Enter") {
        state.q = e.target.value;
        render();
      }
    });
    root.addEventListener("change", (e) => {
      const id = e.target.id;
      if (id === "tp-date") state.date = e.target.value || todayIso();
      else if (id === "tp-hour") state.hour = +e.target.value;
      else if (id === "tp-launch") state.launch = +e.target.value;
      else if (id === "tp-base") state.base = e.target.value;
      else if (id === "tp-min") state.min = +e.target.value;
      else if (id === "tp-sort") state.sort = e.target.value;
      else if (id === "tp-open") state.openOnly = e.target.checked;
      else if (id === "tp-session") state.session = e.target.value;
      else if (id === "tp-guests") state.guests = +e.target.value;
      else return;
      render();
    });
  }

  async function init() {
    try {
      const response = await fetch("data/moon_tourism.json");
      if (!response.ok) throw new Error(String(response.status));
      data = await response.json();
    } catch (e) {
      root.innerHTML = `<div class="tp-empty">Destinations data not loaded (data/moon_tourism.json).</div>`;
      return;
    }
    bases = new Map(data.bases.map((b) => [b.id, b]));
    venues = new Map(data.venues.map((v) => [v.id, v]));
    shell();
    bind();
    render();
    moon();
  }

  init();
  return { refresh: render };
}
