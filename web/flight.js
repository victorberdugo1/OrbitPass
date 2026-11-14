import * as THREE from "./vendor/three.module.min.js";
import { createEarth, createTextureLoader, glowTexture, starField, surfaceDir } from "./bodies.js";
import { createLunarSurface } from "./moon.js";
import { FOCUS_FOV, FOCUS_RADII, RAD, RE, TRANSFER_S, UNIT, V3, clamp, moonAt, moonNormal, moonPos, moonVel, sitePos, smooth, toWorld, earthBasis, launchInstant } from "./astro.js";

const MU_E = 398600.4418;
const MU_M = 4902.8001;
const RM = 1737.4;
const LEO_ALT = 185;
const LLO_ALT = 100;
const ASCENT_S = 540;
const DOWNRANGE = 20 * RAD;
const TRANSFER_GAP = 8 * RAD;
const DESCENT_S = 720;
const HOLD_S = 3600;
const DESCENT_DV = 1.9;
const ASCENT_DV = 9.4;
const WALL = { ascent: 16, parking: 12, transfer: 34, lunar: 12, descent: 22, landed: 8 };
const LABEL = { ascent: "Launch and ascent", parking: "Parking orbit", transfer: "Translunar coast", lunar: "Lunar orbit", descent: "Powered descent", landed: "Landed" };
const SPEEDS = [0.5, 1, 2, 4, 8];
const DEFAULT_SPEED = 4;
const WORLD_UP = new V3(0, 1, 0);
const INTRO_WALL = 4;
const FLIGHT_FOV = 40;
const MOON_FALLBACK = "assets/moon.jpg";
const moonTile = (z, x, y) => `/trek/LRO_WAC_Mosaic_Global_303ppd_v02/1.0.0/default/default028mm/${z}/${y}/${x}.jpg`;

const toLocal = (b, v) => new V3(v.dot(b[0]), v.dot(b[1]), v.dot(b[2]));

function slerp(a, b, w) {
  const d = clamp(a.dot(b), -1, 1);
  const ang = Math.acos(d);
  if (ang < 1e-6) return a.clone();
  const s = Math.sin(ang);
  return a.clone().multiplyScalar(Math.sin((1 - w) * ang) / s).addScaledVector(b, Math.sin(w * ang) / s);
}




function moonBasis(m) {
  const y = m.pole.clone().normalize();
  const toEarth = m.pos.clone().negate().normalize();
  const x = toEarth.addScaledVector(y, -toEarth.dot(y)).normalize().applyAxisAngle(y, -m.lon * RAD);
  return [x, y, x.clone().cross(y)];
}


function stumpffC(z) {
  if (z > 1e-6) return (1 - Math.cos(Math.sqrt(z))) / z;
  if (z < -1e-6) return (Math.cosh(Math.sqrt(-z)) - 1) / -z;
  return 0.5 - z / 24;
}

function stumpffS(z) {
  if (z > 1e-6) return (Math.sqrt(z) - Math.sin(Math.sqrt(z))) / Math.pow(z, 1.5);
  if (z < -1e-6) return (Math.sinh(Math.sqrt(-z)) - Math.sqrt(-z)) / Math.pow(-z, 1.5);
  return 1 / 6 - z / 120;
}

function lambert(r1, r2, tof, normal) {
  const a = r1.length();
  const b = r2.length();
  const cosd = r1.dot(r2) / (a * b);
  let dnu = Math.acos(clamp(cosd, -1, 1));
  if (r1.clone().cross(r2).dot(normal) < 0) dnu = 2 * Math.PI - dnu;
  const A = Math.sin(dnu) * Math.sqrt((a * b) / (1 - cosd));
  const y = (z) => a + b + (A * (z * stumpffS(z) - 1)) / Math.sqrt(stumpffC(z));
  const time = (z) => {
    const yy = y(z);
    return yy < 0 ? -Infinity : (Math.pow(yy / stumpffC(z), 1.5) * stumpffS(z) + A * Math.sqrt(yy)) / Math.sqrt(MU_E);
  };
  let lo = -100;
  let hi = 4 * Math.PI * Math.PI - 1e-3;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (time(mid) < tof) lo = mid;
    else hi = mid;
  }
  const yy = y((lo + hi) / 2);
  const f = 1 - yy / a;
  const g = A * Math.sqrt(yy / MU_E);
  const gd = 1 - yy / b;
  return {
    v1: r2.clone().addScaledVector(r1, -f).multiplyScalar(1 / g),
    v2: r2.clone().multiplyScalar(gd).addScaledVector(r1, -1).multiplyScalar(1 / g)
  };
}

function propagate(p0, v0, total) {
  const acc = (r) => r.clone().multiplyScalar(-MU_E / Math.pow(r.length(), 3));
  const t = [0];
  const p = [p0.clone()];
  const v = [v0.clone()];
  let time = 0;
  let pos = p0.clone();
  let vel = v0.clone();
  while (time < total) {
    const h = Math.min(0.015 * Math.sqrt(Math.pow(pos.length(), 3) / MU_E), total - time);
    const k1v = acc(pos);
    const k1p = vel.clone();
    const k2v = acc(pos.clone().addScaledVector(k1p, h / 2));
    const k2p = vel.clone().addScaledVector(k1v, h / 2);
    const k3v = acc(pos.clone().addScaledVector(k2p, h / 2));
    const k3p = vel.clone().addScaledVector(k2v, h / 2);
    const k4v = acc(pos.clone().addScaledVector(k3p, h));
    const k4p = vel.clone().addScaledVector(k3v, h);
    pos = pos.clone().addScaledVector(k1p.add(k2p.multiplyScalar(2)).add(k3p.multiplyScalar(2)).add(k4p), h / 6);
    vel = vel.clone().addScaledVector(k1v.add(k2v.multiplyScalar(2)).add(k3v.multiplyScalar(2)).add(k4v), h / 6);
    time += h;
    t.push(time);
    p.push(pos);
    v.push(vel);
  }
  return {
    at(s) {
      let lo = 0;
      let hi = t.length - 1;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (t[mid] <= s) lo = mid;
        else hi = mid;
      }
      const h = t[hi] - t[lo];
      const u = clamp((s - t[lo]) / h, 0, 1);
      const u2 = u * u;
      const u3 = u2 * u;
      const pos = p[lo].clone().multiplyScalar(2 * u3 - 3 * u2 + 1)
        .addScaledVector(v[lo], (u3 - 2 * u2 + u) * h)
        .addScaledVector(p[hi], -2 * u3 + 3 * u2)
        .addScaledVector(v[hi], (u3 - u2) * h);
      return { pos, vel: v[lo].clone().lerp(v[hi], u) };
    }
  };
}


function inPlane(n, v, angle) {
  return v.clone().multiplyScalar(Math.cos(angle)).addScaledVector(n.clone().cross(v), Math.sin(angle));
}

function planMission({ startMs, launch, site }) {
  const r0 = RE + LEO_ALT;
  const w0 = Math.sqrt(MU_E / Math.pow(r0, 3));
  const tL = launchInstant(startMs, launch);
  const tIns = tL + ASCENT_S;
  let tTLI = tIns + (2 * Math.PI) / w0;
  let frame;
  for (let i = 0; i < 8; i++) {
    const tA = tTLI + TRANSFER_S;
    const n = moonNormal(tA);
    const site0 = sitePos(tL, launch).normalize();
    const flat = site0.addScaledVector(n, -site0.dot(n)).normalize();
    const insertion = inPlane(n, flat, DOWNRANGE);
    const tangent = n.clone().cross(insertion);
    const moonDir = moonPos(tA).normalize();
    const pDir = inPlane(n, moonDir, -(Math.PI - TRANSFER_GAP));
    let theta = Math.atan2(pDir.dot(tangent), pDir.dot(insertion));
    theta = ((theta % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    while (theta < 1.9 * Math.PI) theta += 2 * Math.PI;
    tTLI = tIns + theta / w0;
    frame = { n, insertion, tangent, pDir, tA };
  }
  const { n, insertion, tangent, pDir } = frame;
  const tA = tTLI + TRANSFER_S;
  const moonA = moonAt(tA);
  const moonDir = moonA.pos.clone().normalize();
  const rp = RM + LLO_ALT;
  const target = moonA.pos.clone().addScaledVector(moonDir, rp);
  const p1 = pDir.clone().multiplyScalar(r0);
  const { v1, v2 } = lambert(p1, target, TRANSFER_S, n);
  const transfer = propagate(p1, v1, TRANSFER_S);
  const vCirc = n.clone().cross(pDir).multiplyScalar(Math.sqrt(MU_E / r0));
  const dvTLI = v1.distanceTo(vCirc);
  const vInf = v2.distanceTo(moonVel(tA));
  const dvLOI = Math.sqrt(vInf * vInf + (2 * MU_M) / rp) - Math.sqrt(MU_M / rp);

  const wm = Math.sqrt(MU_M / Math.pow(rp, 3));
  const u = moonDir.clone();
  let tDesc = tA;
  let nl = n;
  let angD = 0;
  for (let i = 0; i < 3; i++) {
    const tEst = tDesc + DESCENT_S;
    const d = toWorld(moonBasis(moonAt(tEst)), surfaceDir(site.lat, site.lon));
    nl = u.clone().cross(d);
    nl = nl.length() < 1e-6 ? n : nl.normalize();
    angD = Math.acos(clamp(u.dot(d), -1, 1));
    let theta = angD - 80 * RAD;
    while (theta < 1.1 * Math.PI) theta += 2 * Math.PI;
    tDesc = tA + theta / wm;
  }
  const lunarAxisW = nl.clone().cross(u);
  const tLand = tDesc + DESCENT_S;
  const phases = [
    { id: "ascent", a: tL, b: tIns },
    { id: "parking", a: tIns, b: tTLI },
    { id: "transfer", a: tTLI, b: tA },
    { id: "lunar", a: tA, b: tDesc },
    { id: "descent", a: tDesc, b: tLand },
    { id: "landed", a: tLand, b: tLand + HOLD_S }
  ];
  let w = 0;
  phases.forEach((p) => {
    p.w0 = w;
    p.wall = WALL[p.id];
    w += p.wall;
  });

  const p0Rel = (t) => u.clone().multiplyScalar(Math.cos(wm * (t - tA))).addScaledVector(lunarAxisW, Math.sin(wm * (t - tA))).multiplyScalar(rp);
  const descentStart = toLocal(moonBasis(moonAt(tDesc)), p0Rel(tDesc)).normalize();
  const dFixed = surfaceDir(site.lat, site.lon);
  const slideAngle = Math.max(1e-3, Math.acos(clamp(descentStart.dot(dFixed), -1, 1)));
  const lead = clamp((wm * DESCENT_S) / slideAngle, 0.1, 1);

  function state(t) {
    if (t < tIns) {
      const tau = (t - tL) / ASCENT_S;
      const along = 1.64 * tau * tau - 0.64 * tau * tau * tau;
      const alt = LEO_ALT * (1 - (1 - tau) * (1 - tau));
      return { pos: slerp(sitePos(t, launch).normalize(), insertion, along).multiplyScalar(RE + alt), body: "earth" };
    }
    if (t < tTLI) {
      const th = w0 * (t - tIns);
      return { pos: insertion.clone().multiplyScalar(Math.cos(th)).addScaledVector(tangent, Math.sin(th)).multiplyScalar(r0), body: "earth" };
    }
    if (t < tA) return { pos: transfer.at(t - tTLI).pos, body: "earth" };
    const m = moonAt(t);
    if (t < tDesc) return { pos: m.pos.clone().add(p0Rel(t)), body: "moon", moon: m };
    const basis = moonBasis(m);
    if (t < tLand) {
      const tau = (t - tDesc) / DESCENT_S;
      const along = lead * tau + (3 - 2 * lead) * tau * tau + (lead - 2) * tau * tau * tau;
      const alt = LLO_ALT * (1 - tau) * (1 - tau);
      const local = slerp(descentStart, dFixed, along).multiplyScalar(RM + alt);
      return { pos: m.pos.clone().add(toWorld(basis, local)), body: "moon", moon: m, alt };
    }
    return { pos: m.pos.clone().add(toWorld(basis, dFixed.clone().multiplyScalar(RM))), body: "moon", moon: m, alt: 0 };
  }

  const path = [];
  const sample = (a, b, count, power) => {
    for (let i = 0; i <= count; i++) path.push(a + (b - a) * Math.pow(i / count, power));
  };
  sample(tL, tIns, 50, 1);
  sample(tIns, tTLI, 120, 1);
  sample(tTLI, tA, 500, 2.5);

  return {
    tL,
    tIns,
    tTLI,
    tA,
    tDesc,
    tLand,
    phases,
    wallTotal: w,
    state,
    path,
    n,
    normalL: nl,
    u,
    rp,
    dvTLI,
    dvLOI,
    launch,
    site
  };
}

function phaseAt(plan, wall) {
  const k = clamp(wall, 0, plan.wallTotal - 1e-6);
  const p = plan.phases.find((x) => k < x.w0 + x.wall);
  return { phase: p, t: p.a + ((p.b - p.a) * (k - p.w0)) / p.wall };
}

const fmtClock = (t) => new Date(t * 1000).toISOString().slice(0, 19).replace("T", " ");
const fmtMet = (s) => {
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `T+${d}d ${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
};
const fmtKm = (x) => Math.round(x).toLocaleString("en-US") + " km";

function planTable(plan, sky) {
  const land = sky(plan.tLand * 1000);
  const rows = [
    ["Launch", `${fmtClock(plan.tL)} UTC from ${plan.launch.name}`],
    ["Orbit insertion", `${LEO_ALT} km circular parking orbit, ${fmtClock(plan.tIns)} UTC`],
    ["Trans-lunar injection", `${fmtClock(plan.tTLI)} UTC, Δv ${plan.dvTLI.toFixed(2)} km/s`],
    ["Earth–Moon distance at arrival", fmtKm(moonPos(plan.tA).length())],
    ["Lunar orbit insertion", `${fmtClock(plan.tA)} UTC, Δv ${plan.dvLOI.toFixed(2)} km/s, ${LLO_ALT} km orbit`],
    ["Landing", `${plan.site.name} (${plan.site.lat.toFixed(2)}°, ${plan.site.lon.toFixed(2)}°), ${fmtClock(plan.tLand)} UTC`],
    ["Sky at landing", `Sun ${land.sun.el.toFixed(1)}° (${land.sun.up ? "above" : "below"} the horizon) · Earth ${land.earth.el.toFixed(1)}° (${land.earth.up ? "visible" : "not visible"})`]
  ];
  return `<table>${rows.map(([k, v]) => `<tr><td>${k}</td><td class="mono">${v}</td></tr>`).join("")}</table>`;
}

export function createFlight({ stage, info }, mission) {
  stage.innerHTML = `<div class="fl-kpis"></div><div class="row fl-bar"><button class="sm" data-fl="play">Pause</button><select data-fl="speed">${SPEEDS.map((s) => `<option value="${s}"${s === DEFAULT_SPEED ? " selected" : ""}>${s}×</option>`).join("")}</select><input type="range" data-fl="scrub" min="0" max="1000" value="0"><button class="sm ghost" data-fl="replay">Replay</button></div>`;
  info.innerHTML = `<div class="tbl-wrap fl-plan"></div>
<div class="note">Real data: Moon and Sun positions and Earth rotation from analytical ephemerides (Meeus), Moon orientation from optical libration, site coordinates from NASA/LRO. Trajectory: two-body Lambert transfer from a ${LEO_ALT} km parking orbit to a ${LLO_ALT} km lunar orbit (patched conics, impulsive burns); ascent, lunar orbit and descent are scripted. Not for operational use.</div>`;
  const kpiBox = stage.querySelector(".fl-kpis");
  const plan = planMission(mission);
  info.querySelector(".fl-plan").innerHTML = planTable(plan, mission.sky);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor(0x02050b, 1);
  stage.appendChild(renderer.domElement);
  renderer.domElement.style.cssText = "display:block;width:100%;height:100%";
  const hud = document.createElement("div");
  hud.className = "hud";
  stage.appendChild(hud);

  const scene = new THREE.Scene();
  scene.add(starField(2500));
  const camera = new THREE.PerspectiveCamera(FLIGHT_FOV, 1, 0.001, 4000);
  camera.up.copy(WORLD_UP);
  const sunLight = new THREE.DirectionalLight(0xffffff, 2.6);
  scene.add(sunLight, new THREE.AmbientLight(0xffffff, 0.16));

  const textures = createTextureLoader(renderer);
  const sunDir = new V3(1, 0, 0);
  const earth = createEarth(textures.load, sunDir);
  earth.root.scale.setScalar(RE / UNIT);
  const moonSurface = createLunarSurface(renderer, moonTile, MOON_FALLBACK);
  const moonRoot = new THREE.Group();
  moonRoot.add(new THREE.Mesh(new THREE.SphereGeometry(1, 128, 96), moonSurface.material));
  moonRoot.scale.setScalar(RM / UNIT);
  scene.add(earth.root, moonRoot);
  const introPos = sitePos(plan.tL, plan.launch).normalize().multiplyScalar((FOCUS_RADII * RE) / UNIT);
  const introLook = new V3();

  const craft = new THREE.Group();
  const body = new THREE.Mesh(new THREE.ConeGeometry(0.25, 1, 12), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  body.geometry.rotateX(Math.PI / 2);
  const flameTexture = glowTexture();
  const marker = new THREE.Sprite(new THREE.SpriteMaterial({ map: flameTexture, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  marker.scale.setScalar(5);
  const halo = (color) => {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: flameTexture, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    scene.add(sprite);
    return sprite;
  };
  const earthHalo = halo(0x4aa3ff);
  const moonHalo = halo(0xcfd6e0);
  craft.add(body, marker);
  scene.add(craft);

  const pathPoints = plan.path.map((t) => plan.state(t).pos.multiplyScalar(1 / UNIT));
  const pathArray = new Float32Array(pathPoints.length * 3);
  pathPoints.forEach((p, i) => p.toArray(pathArray, i * 3));
  const pathGeometry = new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(pathArray, 3));
  const future = new THREE.Line(pathGeometry, new THREE.LineBasicMaterial({ color: 0x6fe8ff, transparent: true, opacity: 0.25 }));
  const done = new THREE.Line(pathGeometry, new THREE.LineBasicMaterial({ color: 0x6fe8ff }));
  future.frustumCulled = done.frustumCulled = false;
  scene.add(future, done);

  const ringGeometry = new THREE.BufferGeometry().setFromPoints(
    Array.from({ length: 129 }, (_, i) => {
      const a = (i / 128) * 2 * Math.PI;
      return new V3(Math.cos(a), 0, Math.sin(a)).multiplyScalar(plan.rp / UNIT);
    })
  );
  const ring = new THREE.Line(ringGeometry, new THREE.LineBasicMaterial({ color: 0x6fe8ff, transparent: true, opacity: 0.5 }));
  ring.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(plan.u, plan.normalL, plan.u.clone().cross(plan.normalL)));
  scene.add(ring);

  const camPos = new V3();
  const camLook = new V3();
  let framed = false;
  let wall = 0;
  let playing = true;
  let speed = DEFAULT_SPEED;
  let raf = 0;
  let last = performance.now();
  let t = plan.tL;
  const tile = (k, v) => `<div class="kpi"><span>${k}</span><b>${v}</b></div>`;
  const earthDv = () => ASCENT_DV * smooth((t - plan.tL) / ASCENT_S) + (t >= plan.tTLI ? plan.dvTLI : 0);

  function desiredCamera(phase, st, tNow) {
    const sc = st.pos.clone().multiplyScalar(1 / UNIT);
    const eps = 1e-4;
    const ahead = plan.state(tNow + (phase.id === "ascent" ? 1 : 30)).pos.multiplyScalar(1 / UNIT).sub(sc);
    const fwd = ahead.lengthSq() > eps * eps ? ahead.normalize() : new V3(1, 0, 0);
    const m = moonPos(tNow).multiplyScalar(1 / UNIT);
    const k = (tNow - phase.a) / (phase.b - phase.a);
    if (phase.id === "ascent") {
      const up = sc.clone().normalize();
      const side = up.clone().cross(fwd).normalize();
      const s = 0.4 + 0.6 * k;
      return { pos: sc.clone().addScaledVector(up, 1.2 * s).addScaledVector(fwd, -1.4 * s).addScaledVector(side, 0.6 * s), look: sc };
    }
    if (phase.id === "parking") {
      const up = sc.clone().normalize();
      return { pos: sc.clone().multiplyScalar(0.5).addScaledVector(up, 24).addScaledVector(plan.n, 24).addScaledVector(fwd, -16), look: sc.clone().multiplyScalar(0.5) };
    }
    if (phase.id === "transfer") {
      const moonEnd = moonPos(plan.tA).multiplyScalar(1 / UNIT);
      const mid = moonEnd.clone().multiplyScalar(0.5);
      const near = { pos: sc.clone().multiplyScalar(0.5).addScaledVector(sc.clone().normalize(), 24).addScaledVector(plan.n, 24).addScaledVector(fwd, -16), look: sc.clone().multiplyScalar(0.5) };
      const wide = { pos: mid.clone().addScaledVector(plan.n, 300).addScaledVector(moonEnd.clone().normalize(), -120), look: mid };
      const approach = { pos: m.clone().addScaledVector(sc.clone().sub(m).normalize(), 18).addScaledVector(plan.n, 10), look: m.clone().lerp(sc, 0.3) };
      const a = smooth(k / 0.12);
      const b = smooth((k - 0.8) / 0.2);
      const tangent = plan.n.clone().cross(moonEnd.clone().normalize());
      return {
        pos: near.pos.lerp(wide.pos, a).lerp(approach.pos, b),
        look: near.look.lerp(wide.look, a).lerp(approach.look, b),
        up: WORLD_UP.clone().lerp(tangent, a * (1 - b)).normalize()
      };
    }
    const rel = sc.clone().sub(m);
    if (phase.id === "lunar") {
      const dir = plan.normalL.clone().multiplyScalar(0.55).addScaledVector(rel.clone().normalize().cross(plan.normalL), 0.9).normalize();
      return { pos: m.clone().addScaledVector(dir, 14), look: m };
    }
    const alt = st.alt || 0;
    const radial = rel.clone().normalize();
    const side = radial.clone().cross(fwd).normalize();
    const s = phase.id === "descent" ? 0.05 + 0.002 * alt : 0.08;
    const lookAt = sc.clone();
    return { pos: sc.clone().addScaledVector(radial, 0.55 * s).addScaledVector(fwd, -0.8 * s).addScaledVector(side, 0.35 * s), look: lookAt };
  }

  function nearestSurface(p, e, m) {
    return Math.min(p.distanceTo(e) - RE / UNIT, p.distanceTo(m) - RM / UNIT);
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    if (playing) wall = Math.min(plan.wallTotal, wall + dt * speed);
    const at = phaseAt(plan, wall);
    t = at.t;
    const st = plan.state(t);
    const m = moonAt(t);
    const sc = st.pos.clone().multiplyScalar(1 / UNIT);

    const eb = earthBasis(t);
    earth.root.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(eb[0], eb[1], eb[2]));
    const mb = moonBasis(m);
    moonRoot.position.copy(m.pos).multiplyScalar(1 / UNIT);
    moonRoot.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(...mb));
    moonSurface.uniforms.uSun.value.copy(toLocal(mb, m.sun)).normalize();
    moonSurface.uniforms.uEarth.value.copy(toLocal(mb, m.pos.clone().negate())).normalize();
    sunDir.copy(m.sun);
    sunLight.position.copy(m.sun).multiplyScalar(500);
    ring.position.copy(moonRoot.position);
    ring.visible = at.phase.id === "lunar";

    const fade = (halo, center, radius) => {
      const d = camPos.distanceTo(center);
      halo.position.copy(center);
      halo.scale.setScalar(Math.max(radius * 6, d * 0.05));
      halo.material.opacity = smooth((d / radius - 20) / 40) * 0.8;
    };
    fade(earthHalo, earth.root.position, RE / UNIT);
    fade(moonHalo, moonRoot.position, RM / UNIT);

    craft.position.copy(sc);
    const heading = plan.state(t + (at.phase.id === "ascent" ? 1 : 30)).pos.multiplyScalar(1 / UNIT).sub(sc);
    if (heading.lengthSq() > 1e-12) craft.lookAt(sc.clone().add(heading));

    const want = desiredCamera(at.phase, st, t);
    const intro = smooth(wall / INTRO_WALL);
    const goalPos = introPos.clone().lerp(want.pos, intro);
    const goalLook = introLook.clone().lerp(want.look, intro);
    if (!framed) {
      camPos.copy(introPos);
      camLook.copy(introLook);
      framed = true;
    }
    const ease = 1 - Math.exp(-dt * 2.2);
    camPos.lerp(goalPos, ease);
    camLook.lerp(goalLook, ease);
    camera.up.lerp(want.up || WORLD_UP, ease).normalize();
    camera.position.copy(camPos);
    camera.lookAt(camLook);
    const toCraft = camPos.distanceTo(sc);
    camera.fov = FOCUS_FOV + (FLIGHT_FOV - FOCUS_FOV) * intro;
    camera.near = clamp(Math.min(nearestSurface(camPos, new V3(), moonRoot.position), toCraft) * 0.2, 0.0002, 5);
    camera.updateProjectionMatrix();
    craft.scale.setScalar(Math.max(toCraft * 0.012 * Math.tan((camera.fov * RAD) / 2) / Math.tan((FLIGHT_FOV * RAD) / 2), 0.00005));
    const burn = at.phase.id === "ascent" || at.phase.id === "descent" || Math.abs(t - plan.tTLI) < 240 || Math.abs(t - plan.tA) < 240;
    marker.material.opacity = burn ? 1 : 0.55;
    marker.scale.setScalar(burn ? 5 : 3);

    let k = 0;
    while (k < plan.path.length && plan.path[k] <= t) k++;
    done.geometry.setDrawRange(0, k);

    const lunar = st.body === "moon";
    const vel = plan.state(t + 5).pos.sub(plan.state(t - 5).pos).multiplyScalar(0.1);
    const velRel = lunar ? vel.sub(moonPos(t + 5).sub(moonPos(t - 5)).multiplyScalar(0.1)) : vel;
    const altKm = lunar ? st.pos.distanceTo(m.pos) - RM : st.pos.length() - RE;
    const dv = lunar ? earthDv() + plan.dvLOI + (at.phase.id === "descent" || at.phase.id === "landed" ? DESCENT_DV * smooth((t - plan.tDesc) / DESCENT_S) : 0) : earthDv();
    hud.textContent = `${LABEL[at.phase.id]} | ${fmtClock(t)} UTC`;
    kpiBox.innerHTML =
      tile("Mission time", fmtMet(t - plan.tL)) +
      tile(lunar ? "Altitude (Moon)" : "Altitude (Earth)", fmtKm(Math.max(0, altKm))) +
      tile("Speed", velRel.length().toFixed(2) + " km/s") +
      tile("Distance to Moon", fmtKm(st.pos.distanceTo(m.pos))) +
      tile("Earth–Moon", fmtKm(m.pos.length())) +
      tile("Δv used", dv.toFixed(2) + " km/s");
    scrub.value = String(Math.round((wall / plan.wallTotal) * 1000));

    const w = stage.clientWidth || 1;
    const h = stage.clientHeight || 1;
    if (renderer.domElement.width !== Math.round(w * renderer.getPixelRatio())) {
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    renderer.render(scene, camera);
  }

  const playBtn = stage.querySelector('[data-fl="play"]');
  const scrub = stage.querySelector('[data-fl="scrub"]');
  playBtn.addEventListener("click", () => {
    playing = !playing;
    playBtn.textContent = playing ? "Pause" : "Play";
  });
  stage.querySelector('[data-fl="speed"]').addEventListener("change", (e) => (speed = +e.target.value));
  scrub.addEventListener("input", () => {
    wall = (+scrub.value / 1000) * plan.wallTotal;
    framed = false;
  });
  stage.querySelector('[data-fl="replay"]').addEventListener("click", () => {
    wall = 0;
    framed = false;
    playing = true;
    playBtn.textContent = "Pause";
  });

  raf = requestAnimationFrame(frame);
  const ready = textures.ready().then(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

  return {
    plan,
    ready,
    dispose() {
      cancelAnimationFrame(raf);
      scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) o.material.dispose();
      });
      textures.dispose();
      earth.placeholder.dispose();
      flameTexture.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      stage.replaceChildren();
      info.replaceChildren();
    }
  };
}
