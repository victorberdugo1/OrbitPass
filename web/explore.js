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

const WINDOW_HOURS = 14 * 24;
const pad = (n) => String(n).padStart(2, "0");
const usd = (n) => "$" + Math.round(n).toLocaleString("en-US");
const durationText = (m) => (m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}` : `${m} min`);
const todayIso = () => new Date().toISOString().slice(0, 10);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export function createExplorer(root, { launchSites, sky }) {
  const state = {
    cat: "all",
    base: "all",
    launch: 0,
    date: todayIso(),
    hour: new Date().getUTCHours(),
    q: "",
    min: 0,
    sort: "recommended",
    openOnly: false,
    detail: null
  };
  let data = null;
  let bases = new Map();
  const windows = new Map();

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
    const base = bases.get(v.base);
    const rows = timeline(base, ms);
    const need = v.earthView ? "earth" : v.outdoor ? "sun" : "any";
    const okAt = (r) => (need === "any" ? true : need === "sun" ? r.sun : r.earth);
    const now = rows[0];
    if (okAt(now)) return { ok: true, need, now };
    const next = rows.findIndex(okAt);
    return { ok: false, need, now, next: next > 0 ? next : null };
  }

  function availabilityBadge(a) {
    if (a.ok) return `<span class="bd ok">${a.need === "any" ? "Open" : a.need === "sun" ? "Daylight now" : "Earth in view"}</span>`;
    const wait = a.next === null ? "" : ` · in ${a.next} h`;
    const label = a.need === "sun" ? "Night" : "Earth below horizon";
    return `<span class="bd warn">${label}${wait}</span>`;
  }

  function venueScore(v) {
    return v.rating * Math.log10(v.reviews + 10);
  }

  function filtered() {
    const q = state.q.trim().toLowerCase();
    const ms = currentMs();
    return data.venues
      .filter((v) => (state.cat === "all" || v.group === state.cat) &&
        (state.base === "all" || v.base === state.base) &&
        v.rating >= state.min &&
        (!q || `${v.name} ${v.type} ${bases.get(v.base).name} ${v.description}`.toLowerCase().includes(q)))
      .map((v) => ({ v, a: availability(v, ms) }))
      .filter(({ a }) => !state.openOnly || a.ok)
      .sort((x, y) => SORTS[state.sort]({ ...x.v, score: venueScore(x.v) }, { ...y.v, score: venueScore(y.v) }));
  }

  function shell() {
    const catTabs = CATEGORIES.map((c) => `<button data-cat="${c.id}" class="${state.cat === c.id ? "on" : ""}">${c.name}</button>`).join("");
    const baseOptions = [
      `<option value="all">All destinations</option>`,
      `<optgroup label="Apollo landing sites">${data.bases.filter((b) => b.status === "Apollo landing site").map((b) => `<option value="${b.id}">${esc(b.name)}</option>`).join("")}</optgroup>`,
      `<optgroup label="Future districts">${data.bases.filter((b) => b.status !== "Apollo landing site").map((b) => `<option value="${b.id}">${esc(b.name)}</option>`).join("")}</optgroup>`
    ].join("");
    const launchOptions = launchSites.map((l, i) => `<option value="${i}">${esc(l.name)}</option>`).join("");
    const hourOptions = Array.from({ length: 24 }, (_, h) => `<option value="${h}">${pad(h)}:00 UTC</option>`).join("");
    root.innerHTML = `
<div class="ex-head">
  <div><h2>Lunar Destinations Explorer <span class="bd">Synthetic data</span></h2><div class="note">${esc(data.meta.disclaimer)}</div></div>
</div>
<div class="ex-layout">
  <aside class="ex-side">
    <div class="ex-tabs" data-role="tabs">${catTabs}</div>
    <div><label for="ex-date">Date</label><input type="date" id="ex-date" value="${state.date}"></div>
    <div><label for="ex-hour">Local time</label><select id="ex-hour">${hourOptions}</select></div>
    <div><label for="ex-launch">Arrival (launch site)</label><select id="ex-launch">${launchOptions}</select></div>
    <div><label for="ex-base">Destination base</label><select id="ex-base">${baseOptions}</select></div>
    <div><label for="ex-q">Search</label><div class="row ex-search" style="gap:6px;flex-wrap:nowrap"><input type="search" id="ex-q" placeholder="Venue, type or base"><button data-role="search">Search</button></div></div>
    <div><label for="ex-min">Minimum rating</label><select id="ex-min"><option value="0">Any rating</option><option value="4">4.0 and up</option><option value="4.5">4.5 and up</option></select></div>
    <label class="ex-open"><input type="checkbox" id="ex-open"> Available at selected time only</label>
    <div class="note" id="ex-transfer"></div>
  </aside>
  <section class="ex-main">
    <div class="ex-bar"><div id="ex-count"></div><div class="row" style="gap:8px"><span class="note" style="margin:0">Sort by</span><select id="ex-sort"><option value="recommended">Recommended</option><option value="rating">Highest rated</option><option value="reviews">Most reviewed</option><option value="price">Lowest price</option><option value="distance">Nearest to base</option></select></div></div>
    <div id="ex-detail"></div>
    <div id="ex-list"></div>
    <h2 style="margin-top:22px">Destinations overview</h2>
    <div class="tbl-wrap" id="ex-bases"></div>
  </section>
</div>`;
    root.querySelector("#ex-hour").value = state.hour;
    root.querySelector("#ex-launch").value = state.launch;
    root.querySelector("#ex-base").value = state.base;
    root.querySelector("#ex-min").value = state.min;
    root.querySelector("#ex-sort").value = state.sort;
    root.querySelector("#ex-open").checked = state.openOnly;
  }

  function renderTransfer() {
    const launch = launchSites[state.launch];
    root.querySelector("#ex-transfer").textContent = `Transfer from ${launch.name}: about ${data.meta.transferDays} days (translunar coast, lunar orbit insertion and descent).`;
  }

  function card(v, a) {
    const b = bases.get(v.base);
    return `<article class="ex-card">
  <div>
    <div class="row" style="gap:8px;margin-bottom:6px"><span class="ex-type ${v.group}">${esc(v.type)}</span>${availabilityBadge(a)}</div>
    <div class="row" style="gap:10px;align-items:baseline"><b class="ex-name">${esc(v.name)}</b><span class="ex-rate">★ ${v.rating.toFixed(1)} <small>(${v.reviews.toLocaleString("en-US")})</small></span></div>
    <div class="note" style="margin:2px 0 6px">${esc(b.name)} · ${esc(b.program)}</div>
    <p>${esc(v.description)}</p>
    <div class="chips"><span class="chip">${esc(v.hours)}</span><span class="chip">${durationText(v.durationMin)}</span><span class="chip">${v.distanceKm} km from base</span><span class="chip">from ${usd(v.priceUsd)}</span></div>
  </div>
  <div class="ex-action"><button class="sm" data-open="${v.id}">View details</button></div>
</article>`;
  }

  function renderList() {
    const ms = currentMs();
    const items = filtered();
    const catName = CATEGORIES.find((c) => c.id === state.cat).name;
    const baseName = state.base === "all" ? "All destinations" : bases.get(state.base).name;
    root.querySelector("#ex-count").innerHTML = `<b>${items.length} results</b> for <span class="ex-accent">${catName}</span> · ${esc(baseName)} · ${state.date} ${pad(state.hour)}:00 UTC`;
    root.querySelector("#ex-list").innerHTML = items.length
      ? items.map(({ v, a }) => card(v, a)).join("")
      : `<div class="note">No venues match the current filters.</div>`;
  }

  function renderDetail() {
    const el = root.querySelector("#ex-detail");
    if (!state.detail) {
      el.innerHTML = "";
      return;
    }
    const v = data.venues.find((x) => x.id === state.detail);
    const b = bases.get(v.base);
    const ms = currentMs();
    const a = availability(v, ms);
    const rows = timeline(b, ms);
    const now = rows[0];
    const total = v.breakdown.reduce((s, n) => s + n, 0) || 1;
    const labels = ["5 star", "4 star", "3 star", "2 star", "1 star"];
    const bars = v.breakdown.map((n, i) => `<div><span>${labels[i]}</span><div class="bar" style="margin:0"><i style="width:${(n / total * 100).toFixed(1)}%;background:var(--acc)"></i></div><span class="mono">${Math.round(n / total * 100)}%</span></div>`).join("");
    const reviews = v.reviewList.map((r) => `<div class="ex-rev"><div class="row" style="gap:8px"><span class="ex-rate">★ ${r.stars}.0</span><b>${esc(r.author)}</b><span class="note" style="margin:0">${r.travel} · ${r.date}</span></div><div style="margin-top:4px">${esc(r.text)}</div></div>`).join("");
    el.innerHTML = `<div class="ex-detail">
  <div class="row" style="justify-content:space-between;align-items:flex-start">
    <div><span class="ex-type ${v.group}">${esc(v.type)}</span><h2 style="margin:10px 0 2px;font-size:22px;letter-spacing:0;text-transform:none;color:var(--txt)">${esc(v.name)}</h2><div class="note" style="margin:0">${esc(b.name)} · ${esc(b.mission)} · ${b.lat.toFixed(2)}°, ${b.lon.toFixed(2)}°</div></div>
    <button class="sm ghost" data-close="1">Close</button>
  </div>
  <p style="margin:12px 0">${esc(v.description)}</p>
  <div class="kpis">
    <div class="kpi"><span>Rating</span><b>★ ${v.rating.toFixed(1)}</b></div>
    <div class="kpi"><span>Reviews</span><b>${v.reviews.toLocaleString("en-US")}</b></div>
    <div class="kpi"><span>From (per person)</span><b>${usd(v.priceUsd)}</b></div>
    <div class="kpi"><span>Duration</span><b>${durationText(v.durationMin)}</b></div>
    <div class="kpi"><span>Distance from base</span><b>${v.distanceKm} km</b></div>
    <div class="kpi"><span>Hours</span><b style="font-size:13px">${esc(v.hours)}</b></div>
  </div>
  <div class="cols" style="margin-top:14px">
    <div>
      <h2>Availability at ${state.date} ${pad(state.hour)}:00 UTC</h2>
      <div class="note" style="margin:0 0 8px">Sun ${now.sunEl.toFixed(1)}° (${now.sun ? "above" : "below"} horizon) · Earth ${now.earthEl.toFixed(1)}° (${now.earth ? "visible" : "not visible"})</div>
      <div style="margin-bottom:10px">${availabilityBadge(a)}</div>
      <div class="note" style="margin:0">Requirement: ${{ any: "none (indoor, runs at any time)", sun: "daylight at the base (surface activity)", earth: "Earth above the horizon (Earth-view venue)" }[a.need]}</div>
    </div>
    <div>
      <h2>Rating breakdown</h2>
      <div class="ex-bars">${bars}</div>
    </div>
  </div>
  <h2 style="margin-top:16px">Recent reviews <small style="margin-left:8px;text-transform:none;letter-spacing:0">synthetic</small></h2>
  <div class="ex-revs">${reviews}</div>
</div>`;
  }

  function renderOverview() {
    const rows = data.bases.map((b) => {
      const vs = data.venues.filter((v) => v.base === b.id);
      const avg = vs.reduce((s, v) => s + v.rating, 0) / vs.length;
      const min = Math.min(...vs.map((v) => v.priceUsd));
      const max = Math.max(...vs.map((v) => v.priceUsd));
      const top = vs.slice().sort(SORTS.rating)[0];
      return `<tr><td><b>${esc(b.name)}</b><div class="note" style="margin:0">${esc(b.program)} · ${b.status}</div></td><td class="mono">${vs.length}</td><td class="mono">★ ${avg.toFixed(2)}</td><td class="mono">${usd(min)}–${usd(max)}</td><td>${esc(top.name)} <span class="note" style="margin:0">★ ${top.rating.toFixed(1)}</span></td><td><button class="sm" data-base="${b.id}">Explore</button></td></tr>`;
    }).join("");
    root.querySelector("#ex-bases").innerHTML = `<table><tr><th>Destination</th><th>Venues</th><th>Avg rating</th><th>Price range</th><th>Top rated</th><th></th></tr>${rows}</table>`;
  }

  function renderAll() {
    renderTransfer();
    renderList();
    renderDetail();
  }

  function setState(patch) {
    Object.assign(state, patch);
    root.querySelectorAll("[data-role=tabs] button").forEach((b) => b.classList.toggle("on", b.dataset.cat === state.cat));
    root.querySelector("#ex-base").value = state.base;
    renderAll();
  }

  function bind() {
    root.addEventListener("click", (e) => {
      const cat = e.target.closest("[data-cat]");
      if (cat) return setState({ cat: cat.dataset.cat });
      const open = e.target.closest("[data-open]");
      if (open) {
        setState({ detail: open.dataset.open });
        return root.querySelector("#ex-detail").scrollIntoView({ behavior: "smooth", block: "start" });
      }
      if (e.target.closest("[data-close]")) return setState({ detail: null });
      const base = e.target.closest("[data-base]");
      if (base) {
        setState({ base: base.dataset.base, detail: null });
        return root.querySelector("#ex-list").scrollIntoView({ behavior: "smooth", block: "start" });
      }
      if (e.target.closest("[data-role=search]")) setState({ q: root.querySelector("#ex-q").value });
    });
    root.addEventListener("keydown", (e) => {
      if (e.target.id === "ex-q" && e.key === "Enter") setState({ q: e.target.value });
    });
    root.addEventListener("change", (e) => {
      const id = e.target.id;
      if (id === "ex-date") setState({ date: e.target.value || todayIso() });
      else if (id === "ex-hour") setState({ hour: +e.target.value });
      else if (id === "ex-launch") setState({ launch: +e.target.value });
      else if (id === "ex-base") setState({ base: e.target.value });
      else if (id === "ex-min") setState({ min: +e.target.value });
      else if (id === "ex-sort") setState({ sort: e.target.value });
      else if (id === "ex-open") setState({ openOnly: e.target.checked });
    });
  }

  async function init() {
    try {
      const response = await fetch("data/moon_tourism.json");
      if (!response.ok) throw new Error(String(response.status));
      data = await response.json();
    } catch (e) {
      root.innerHTML = `<div class="note">Destinations data not loaded (data/moon_tourism.json).</div>`;
      return;
    }
    bases = new Map(data.bases.map((b) => [b.id, b]));
    shell();
    bind();
    renderOverview();
    renderAll();
  }

  init();
  return {
    refresh: renderAll
  };
}
