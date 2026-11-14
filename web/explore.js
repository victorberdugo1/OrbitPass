import * as THREE from "./vendor/three.module.min.js";
import { createMoon, createTextureLoader } from "./bodies.js";

const CATEGORIES = [
  { id: "all", name: "All", icon: "grid" },
  { id: "attractions", name: "Attractions", icon: "star" },
  { id: "food", name: "Food", icon: "fork" },
  { id: "events", name: "Events", icon: "ticket" }
];

const ICONS = {
  bag: '<rect x="4" y="8" width="16" height="12" rx="3"/><path d="M9 8V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M4 13h16"/>',
  grid: '<rect x="4" y="4" width="6.5" height="6.5" rx="1.6"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.6"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.6"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.6"/>',
  star: '<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 17l-5.2 2.7 1-5.9-4.3-4.1 5.9-.8z"/>',
  fork: '<path d="M7 3v7a2 2 0 0 0 2 2v9M11 3v7a2 2 0 0 1-2 2M17 21V3c-2 1-3 4-3 7s1 4 3 4"/>',
  ticket: '<path d="M3.5 8.5V7a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2v1.5a2.5 2.5 0 0 0 0 5V17a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-3.5a2.5 2.5 0 0 0 0-5z"/><path d="M14 5v14"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  hourglass: '<path d="M7 4h10M7 20h10M8 4c0 4 4 5 4 8s-4 4-4 8M16 4c0 4-4 5-4 8s4 4 4 8"/>',
  nav: '<path d="M20 4L4 11l7 2 2 7z"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  pin: '<path d="M12 21s6.5-5.6 6.5-11a6.5 6.5 0 0 0-13 0C5.5 15.4 12 21 12 21z"/><circle cx="12" cy="10" r="2.4"/>',
  calendar: '<rect x="4" y="5.5" width="16" height="14.5" rx="2.5"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/>',
  users: '<circle cx="9" cy="9" r="3.2"/><path d="M3.5 19c.6-3.2 3-5 5.5-5s4.9 1.8 5.5 5M16 6.3a3 3 0 0 1 0 5.6M18 14.4c1.7.6 2.8 2.2 3 4.6"/>',
  dome: '<path d="M3.5 19a8.5 8.5 0 0 1 17 0z"/><path d="M12 10.5V19M7.4 13l2.3 6M16.6 13l-2.3 6"/>',
  sun: '<circle cx="12" cy="12" r="3.6"/><path d="M12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2M6 6l1.4 1.4M16.6 16.6L18 18M18 6l-1.4 1.4M7.4 16.6L6 18"/>',
  earth: '<circle cx="12" cy="12" r="8.5"/><path d="M3.8 10c3 .2 4.5-1.4 5-3.5M20 13c-2.6-.4-4.4.6-5 3M12 3.5c-1.4 2.4-1.4 5.6.4 8"/>',
  tag: '<path d="M3.5 12.2V5.5a2 2 0 0 1 2-2h6.7l8.3 8.3a2 2 0 0 1 0 2.8l-6.2 6.2a2 2 0 0 1-2.8 0z"/><circle cx="8.5" cy="8.5" r="1.2"/>'
};

const TILES = ["earth", "moon", "night"];

const baseArt = (b) => `--img:url(${b.image})`;

const icon = (name) => `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;

const artVars = (id) => {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return `--ex:${18 + (h % 62)}%;--ey:${26 + ((h >> 8) % 22)}%`;
};

const gauss = () => Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random());

const BAND_ANGLE = 0.3;

const bandPoint = (w, h, t) => {
  const half = 0.62 * Math.hypot(w, h);
  return { x: w * 0.55 + t * half * Math.cos(BAND_ANGLE), y: h * 0.3 + t * half * Math.sin(BAND_ANGLE) };
};

const STAR_COLORS = [[0.78, 0.86, 1], [1, 1, 1], [1, 0.9, 0.78], [0.82, 0.76, 1]];

const STAR_VERT = `
attribute float aSize;
attribute float aPhase;
attribute vec3 aColor;
uniform float uTime;
uniform float uPx;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vColor = aColor;
  vAlpha = 0.8 + 0.2 * sin(uTime * (0.35 + aPhase * 0.4) + aPhase * 6.2831);
  gl_PointSize = aSize * uPx;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const STAR_FRAG = `
varying vec3 vColor;
varying float vAlpha;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  if (d > 1.0) discard;
  gl_FragColor = vec4(vColor, exp(-d * d * 5.0) * vAlpha);
}`;

const GLOW_VERT = `
varying vec3 vN;
void main() {
  vN = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const GLOW_FRAG = `
uniform vec2 uSun;
varying vec3 vN;
void main() {
  float edge = pow(clamp(-vN.z / 0.35, 0.0, 1.0), 2.4);
  float lit = 0.25 + 0.75 * smoothstep(-0.4, 0.8, dot(normalize(vN.xy + 1e-5), uSun));
  float k = edge * lit * 0.8;
  gl_FragColor = vec4(vec3(0.62, 0.7, 1.0) * k, k);
}`;

function paintNebula(canvas, w, h, dpr) {
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const g = canvas.getContext("2d");
  g.scale(dpr, dpr);
  const base = g.createLinearGradient(0, 0, 0, h);
  base.addColorStop(0, "#03050f");
  base.addColorStop(0.55, "#050818");
  base.addColorStop(1, "#02030a");
  g.fillStyle = base;
  g.fillRect(0, 0, w, h);
  g.globalCompositeOperation = "lighter";
  const blob = (x, y, r, rgb, a) => {
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, `rgba(${rgb},${a})`);
    grad.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = grad;
    g.fillRect(x - r, y - r, 2 * r, 2 * r);
  };
  blob(w * 0.78, h * 0.18, w * 0.38, "92,64,210", 0.16);
  blob(w * 0.12, h * 0.42, w * 0.3, "40,96,200", 0.12);
  blob(w * 0.9, h * 0.85, w * 0.34, "150,60,190", 0.09);
  blob(w * 0.45, h * 0.05, w * 0.28, "60,70,190", 0.1);
  for (let i = 0; i <= 40; i++) {
    const p = bandPoint(w, h, -1 + i / 20);
    blob(p.x, p.y, h * 0.26, "150,140,255", 0.045);
    blob(p.x, p.y, h * 0.12, "215,200,255", 0.035);
  }
}

function buildStars(w, h) {
  const field = Math.round((w * h) / 1400);
  const total = field + Math.round(field * 0.55);
  const position = new Float32Array(total * 3);
  const size = new Float32Array(total);
  const phase = new Float32Array(total);
  const color = new Float32Array(total * 3);
  const sigma = h * 0.09;
  for (let i = 0; i < total; i++) {
    const inBand = i >= field;
    let x = Math.random() * w;
    let y = Math.random() * h;
    if (inBand) {
      const t = Math.max(-1, Math.min(1, gauss() * 0.45));
      const p = bandPoint(w, h, t);
      const offset = gauss() * sigma;
      x = p.x - Math.sin(BAND_ANGLE) * offset;
      y = p.y + Math.cos(BAND_ANGLE) * offset;
    }
    position.set([x, h - y, 0], i * 3);
    size[i] = inBand ? 1 + Math.pow(Math.random(), 3) * 1.4
      : Math.random() < 0.012 ? 7 + Math.random() * 6
      : 1.2 + Math.pow(Math.random(), 3) * 2.4;
    phase[i] = Math.random();
    const tint = STAR_COLORS[Math.floor(Math.random() * STAR_COLORS.length)];
    const brightness = (0.55 + 0.45 * Math.random()) * (inBand ? 0.8 : 1);
    color.set(tint.map((c) => c * brightness), i * 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(position, 3));
  geometry.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
  geometry.setAttribute("aPhase", new THREE.BufferAttribute(phase, 1));
  geometry.setAttribute("aColor", new THREE.BufferAttribute(color, 3));
  return geometry;
}

function createBackdrop(root) {
  const host = root.querySelector(".tp-stage");
  const nebula = host.querySelector(".tp-nebula");
  const canvas = host.querySelector(".tp-space");
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(0, 1, 1, 0, -2000, 2000);
  const starMaterial = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uPx: { value: 1 } },
    vertexShader: STAR_VERT,
    fragmentShader: STAR_FRAG,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  const stars = new THREE.Points(new THREE.BufferGeometry(), starMaterial);
  stars.position.z = -1000;
  stars.frustumCulled = false;
  scene.add(stars);
  const sunDirection = new THREE.Vector3(0.9, 0.55, 0.45).normalize();
  scene.add(new THREE.AmbientLight(0x8a93c8, 0.22));
  const sun = new THREE.DirectionalLight(0xfff4e6, 2.8);
  sun.position.copy(sunDirection);
  scene.add(sun);
  const textures = createTextureLoader(renderer);
  const moon = createMoon(textures.load);
  moon.root.rotation.set(0.2, 0, -0.25);
  moon.root.add(new THREE.Mesh(new THREE.SphereGeometry(1.07, 64, 48), new THREE.ShaderMaterial({
    uniforms: { uSun: { value: new THREE.Vector2(sunDirection.x, sunDirection.y).normalize() } },
    vertexShader: GLOW_VERT,
    fragmentShader: GLOW_FRAG,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false
  })));
  scene.add(moon.root);

  const resize = () => {
    const w = host.clientWidth;
    const h = host.clientHeight;
    if (!w || !h) return;
    const dpr = Math.min(devicePixelRatio, 2);
    const compact = w < 960;
    const radius = compact ? w * 0.95 : Math.min(w * 0.42, h * 0.95);
    const visibleHeight = h * (compact ? 0.16 : 0.36);
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    camera.right = w;
    camera.top = h;
    camera.updateProjectionMatrix();
    starMaterial.uniforms.uPx.value = dpr;
    stars.geometry.dispose();
    stars.geometry = buildStars(w, h);
    paintNebula(nebula, w, h, dpr);
    moon.root.scale.setScalar(radius);
    moon.root.position.set(compact ? w * 0.5 : w * 0.2, visibleHeight - radius, 0);
  };
  new ResizeObserver(resize).observe(host);
  resize();

  let last = performance.now();
  const loop = (now) => {
    requestAnimationFrame(loop);
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    if (root.getClientRects().length === 0) return;
    if (!still) {
      starMaterial.uniforms.uTime.value = now / 1000;
      moon.spin.rotation.y += 0.014 * dt;
    }
    renderer.render(scene, camera);
  };
  requestAnimationFrame(loop);
}

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
    return `<header class="tp-top"><nav class="tp-nav">${tabs}</nav></header>`;
  }

  function sidebar() {
    const launch = launchSites.map((l, i) => `<option value="${i}" ${state.launch === i ? "selected" : ""}>${esc(l.name)}</option>`).join("");
    const tabs = CATEGORIES.map((c) => `<button data-cat="${c.id}" class="${state.cat === c.id ? "on" : ""}">${icon(c.icon)}<span>${c.name}</span></button>`).join("");
    const ratings = [[0, "Any rating"], [4, "4.0 and up"], [4.5, "4.5 and up"]].map(([v, t]) => `<option value="${v}" ${state.min === v ? "selected" : ""}>${t}</option>`).join("");
    return `<aside class="tp-side">
  <div class="tp-side-head">${icon("bag")}<h2>Tourist</h2></div>
  <div class="tp-tabs">${tabs}</div>
  <div class="tp-pair">
    <label>Date<input type="date" id="tp-date" value="${state.date}"></label>
    <label>Local time<select id="tp-hour">${hourOptions()}</select></label>
  </div>
  <label>Arrival (launch site)<select id="tp-launch">${launch}</select></label>
  <label>Destination base<select id="tp-base">${baseOptions()}</select></label>
  <label>Keyword<input type="search" id="tp-q" value="${esc(state.q)}" placeholder="Venue, type or base"></label>
  <label>Minimum rating<select id="tp-min">${ratings}</select></label>
  <label class="tp-check"><span>Available at selected time only</span><input type="checkbox" id="tp-open" ${state.openOnly ? "checked" : ""}></label>
  <button class="tp-cta" data-search="1">${icon("search")}<span>Search</span></button>
  <div class="tp-note">Transfer from ${esc(launchSites[state.launch].name)}: about ${data.meta.transferDays} days.</div>
</aside>`;
  }

  function card(v, a) {
    const b = bases.get(v.base);
    return `<article class="tp-card" data-open="${v.id}">
  <div class="tp-art ${v.group}${v.image ? " tp-photo" : ""}" style="${artVars(v.id)}${v.image ? `;--img:url(${v.image})` : ""}"><span class="tp-type">${esc(v.type)}</span><span class="tp-art-name">${esc(GROUP_LABEL[v.group])}</span></div>
  <div class="tp-body">
    <div class="tp-row"><b class="tp-name">${esc(v.name)}</b><span class="tp-rating"><i>★</i> ${v.rating.toFixed(1)} <small>(${v.reviews.toLocaleString("en-US")})</small></span></div>
    <div class="tp-sub">${esc(b.name)} · ${esc(b.program)}</div>
    <p>${esc(v.description)}</p>
    <div class="tp-meta"><span>${icon("clock")}${esc(v.hours)}</span><span>${icon("hourglass")}${durationText(v.durationMin)}</span><span>${icon("nav")}${v.distanceKm} km from base</span></div>
    <div class="tp-row tp-foot">${availabilityBadge(a)}<span class="tp-price">from <b>${usd(v.priceUsd)}</b></span></div>
  </div>
  <button class="tp-go" data-open="${v.id}" aria-label="View details of ${esc(v.name)}">${icon("arrow")}</button>
</article>`;
  }

  function exploreView() {
    const ms = currentMs();
    const items = filtered();
    const cat = CATEGORIES.find((c) => c.id === state.cat).name;
    const base = state.base === "all" ? "All lunar bases" : bases.get(state.base).name;
    const sorts = [["recommended", "Recommended"], ["rating", "Highest rated"], ["reviews", "Most reviewed"], ["price", "Lowest price"], ["distance", "Nearest to base"]];
    return `<div class="tp-layout">${sidebar()}
  <section class="tp-main"><div class="tp-results">
    <div class="tp-bar"><div class="tp-bar-title"><span class="tp-title">${items.length} results for <span class="tp-accent">${cat}</span></span><span class="tp-sub">${esc(base)} · ${state.date} ${pad(state.hour)}:00 UTC</span></div>
      <label class="tp-sort">Sort by <select id="tp-sort">${sorts.map(([v, t]) => `<option value="${v}" ${state.sort === v ? "selected" : ""}>${t}</option>`).join("")}</select></label></div>
    <div class="tp-feed">${items.length ? items.map(({ v }) => card(v, availability(v, ms))).join("") : `<div class="tp-empty">No venues match these filters.</div>`}</div>
  </div></section></div>`;
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
    const groupIcon = CATEGORIES.find((c) => c.id === v.group).icon;
    const rows = v.menu.length ? v.menu : v.sessions.map((s) => ({ name: s, desc: `${v.type} session`, priceUsd: v.priceUsd }));
    const menu = rows.map((m) => `<tr><td><b>${esc(m.name)}</b><div class="tp-sub">${esc(m.desc)}</div></td><td class="tp-num">${usd(m.priceUsd)}</td></tr>`).join("");
    const captions = (v.menu.length ? v.menu.map((m) => m.name) : v.highlights).slice(0, TILES.length);
    const tiles = captions.map((c, i) => `<div class="tp-tile"><i class="tp-sphere ${TILES[i]}"></i><span>${esc(c)}</span></div>`).join("");
    const features = [
      ["hourglass", durationText(v.durationMin), "Duration"],
      ["nav", `${v.distanceKm} km`, "From base"],
      ["clock", v.hours, "Hours"],
      [v.outdoor ? "sun" : "dome", v.outdoor ? "Surface" : "Pressurized", "Environment"],
      ["earth", v.earthView ? "Yes" : "No", "Earth view"],
      ["tag", usd(v.priceUsd), "From, per person"]
    ].map(([i, value, label]) => `<div>${icon(i)}<span><b>${esc(value)}</b><small>${label}</small></span></div>`).join("");
    const siblings = data.venues.filter((x) => x.base === v.base && x.id !== v.id).slice(0, 4)
      .map((x) => `<button class="tp-mini" data-open="${x.id}"><b>${esc(x.name)}</b><span>★ ${x.rating.toFixed(1)} · ${esc(x.type)}</span></button>`).join("");
    const reserved = state.trip.some((t) => t.id === v.id && t.date === state.date);
    return `<div class="tp-detail ${v.group}">
<div class="tp-crumb"><button data-nav="explore">← Back to results</button></div>
<section class="tp-hero">
  <div class="tp-scene" style="${baseArt(v.image ? v : b)}" aria-hidden="true"></div>
  <div class="tp-hero-main">
    <span class="tp-type">${esc(v.type)}</span>
    <div class="tp-hero-title"><span class="tp-hero-ico">${icon(groupIcon)}</span><h1>${esc(v.name)}</h1></div>
    <p>${esc(v.description)}</p>
    <div class="tp-loc">${icon("pin")}<span>${esc(b.name)} · ${esc(b.program)}</span></div>
    <div class="tp-rating-line">${stars(v.rating)}<b>${v.rating.toFixed(1)}</b><span>(${v.reviews.toLocaleString("en-US")} reviews)</span></div>
  </div>
  <form class="tp-book" id="tp-book">
    <div class="tp-book-title">Book your experience</div>
    <label><span>${icon("calendar")}Date</span><input type="date" id="tp-date" value="${state.date}"></label>
    <label><span>${icon("clock")}Session</span><select id="tp-session">${sessions}</select></label>
    <label><span>${icon("users")}Guests</span><select id="tp-guests">${[1, 2, 3, 4].map((g) => `<option value="${g}" ${state.guests === g ? "selected" : ""}>${g} ${g === 1 ? "guest" : "guests"}</option>`).join("")}</select></label>
    <div class="tp-total"><span>${usd(v.priceUsd)} × ${state.guests}</span><b>${usd(v.priceUsd * state.guests)}</b></div>
    <button type="button" class="tp-reserve" data-reserve="${v.id}" ${reserved ? "disabled" : ""}>${reserved ? "Added to My Trip" : `Add to My Trip${icon("arrow")}`}</button>
    <div class="tp-note">Demo only: nothing is booked or charged.</div>
  </form>
</section>
<section class="tp-features">${features}</section>
<section class="tp-showcase">
  <div class="tp-media"><div class="tp-scene" style="${baseArt(v.image ? v : b)}" aria-hidden="true"></div><div class="tp-media-body"><h3>Highlights</h3><ul class="tp-list">${v.highlights.map((h) => `<li>${esc(h)}</li>`).join("")}</ul></div></div>
  <div class="tp-panel">
    <div class="tp-panel-head">${icon(groupIcon)}<b>${v.menu.length ? "Menu" : "Programme"}</b><em>${esc(v.type)}</em></div>
    <table class="tp-menu">${menu}</table>
  </div>
  <div class="tp-gallery">${tiles}</div>
</section>
<section class="tp-cols">
  <div class="tp-panel">
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
<section class="tp-panel tp-wide"><h3>More at ${esc(b.name)}</h3><div class="tp-minis">${siblings}</div></section>
</div>`;
  }

  function basesView() {
    const cards = data.bases.map((b) => {
      const vs = data.venues.filter((v) => v.base === b.id);
      const avg = vs.reduce((s, v) => s + v.rating, 0) / vs.length;
      const min = Math.min(...vs.map((v) => v.priceUsd));
      const max = Math.max(...vs.map((v) => v.priceUsd));
      const top = vs.slice().sort(SORTS.rating)[0];
      return `<article class="tp-card tp-base">
  <div class="tp-art tp-photo" style="${baseArt(b)}"><span class="tp-type">${esc(b.status)}</span><span class="tp-art-name">${esc(b.mission)}</span></div>
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
    root.innerHTML = `<div class="tp-stage"><canvas class="tp-nebula"></canvas><canvas class="tp-space"></canvas></div>
<div class="tp"><div class="tp-head"></div><div class="tp-view"></div><div class="tp-foot-note">${esc(data.meta.disclaimer)}</div></div>`;
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
    createBackdrop(root);
  }

  init();
  return { refresh: render };
}
