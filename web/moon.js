import * as THREE from "./vendor/three.module.min.js";
import { DEM_MAX_M, DEM_MIN_M, MOON_RADIUS_M } from "./dem.js";

const RAD = Math.PI / 180;
const MAX_ATLAS = 8192;
const TILE_PX = 256;
const MIN_LEVEL = 3;
const RELIEF_EXAGGERATION = 6;
const RELIEF_SCALE = (RELIEF_EXAGGERATION * (DEM_MAX_M - DEM_MIN_M)) / MOON_RADIUS_M;
const CONCURRENCY = 12;
const FOV = 40;
const DIST_MIN = 1.15;
const DIST_MAX = 6;
const SURFACE = 1.004;
const LABEL_MAX_DIST = 2.6;
const COLORS = { site: "#e6e9ef", selected: "#4f8cff", sun: "#d99a2b", earth: "#3b8fd9" };

const SURFACE_VERT = `
varying vec3 vObj;
void main() {
  vObj = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const SURFACE_FRAG = `
const float RELIEF_SPAN = 0.004;
uniform samplerCube uMap;
uniform samplerCube uHeight;
uniform vec3 uSun;
uniform vec3 uEarth;
uniform float uRelief;
varying vec3 vObj;
void main() {
  vec3 n = normalize(vObj);
  vec3 albedo = pow(textureCube(uMap, n).rgb, vec3(2.2));
  vec3 t1 = normalize(cross(n, abs(n.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
  vec3 t2 = cross(n, t1);
  float dh1 = textureCube(uHeight, normalize(n + RELIEF_SPAN * t1)).r - textureCube(uHeight, normalize(n - RELIEF_SPAN * t1)).r;
  float dh2 = textureCube(uHeight, normalize(n + RELIEF_SPAN * t2)).r - textureCube(uHeight, normalize(n - RELIEF_SPAN * t2)).r;
  vec3 relief = normalize(n - uRelief * (dh1 * t1 + dh2 * t2) / (2.0 * RELIEF_SPAN));
  float day = pow(smoothstep(-0.12, 0.3, dot(relief, uSun)), 0.7);
  float earthshine = 0.08 * max(dot(normalize(vObj), uEarth), 0.0);
  vec3 color = albedo * (0.035 + 1.75 * day + earthshine);
  gl_FragColor = vec4(pow(color, vec3(1.0 / 2.2)), 1.0);
}`;

const direction = (lat, lon, radius = 1) => {
  const p = lat * RAD;
  const l = lon * RAD;
  return new THREE.Vector3(Math.cos(p) * Math.cos(l), Math.sin(p), -Math.cos(p) * Math.sin(l)).multiplyScalar(radius);
};

const loadImage = (url) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(url));
    img.src = url;
  });

async function runLimited(jobs, limit) {
  let next = 0;
  const worker = async () => {
    while (next < jobs.length) await jobs[next++]();
  };
  await Promise.all(Array.from({ length: limit }, worker));
}

function markerTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d");
  g.beginPath();
  g.arc(32, 32, 26, 0, 2 * Math.PI);
  g.fillStyle = "#fff";
  g.fill();
  g.lineWidth = 8;
  g.strokeStyle = "#0a0e14";
  g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function starField() {
  const n = 1800;
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const v = new THREE.Vector3().randomDirection().multiplyScalar(60);
    pos.set([v.x, v.y, v.z], i * 3);
  }
  const geo = new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(pos, 3));
  return new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, size: 1.1, sizeAttenuation: false, opacity: 0.7, transparent: true }));
}

async function buildCube(renderer, tileUrl, { minLevel, topLevel, onRefine, onProgress }) {
  const width = TILE_PX * (2 << topLevel);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = width / 2;
  const ctx = canvas.getContext("2d");
  ctx.setTransform(-1, 0, 0, 1, width, 0);

  const atlas = new THREE.CanvasTexture(canvas);
  atlas.generateMipmaps = true;
  atlas.minFilter = THREE.LinearMipmapLinearFilter;
  atlas.anisotropy = renderer.capabilities.getMaxAnisotropy();

  const target = new THREE.WebGLCubeRenderTarget(width / 4, { generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
  target.texture.anisotropy = atlas.anisotropy;

  await loadImage(tileUrl(0, 0, 0));
  let done = 0;
  const total = Array.from({ length: topLevel - minLevel + 1 }, (_, i) => 2 * 4 ** (minLevel + i)).reduce((a, b) => a + b, 0);

  for (let level = minLevel; level <= topLevel; level++) {
    const cols = 2 << level;
    const rows = 1 << level;
    const jobs = [];
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < cols; x++)
        jobs.push(async () => {
          const img = await loadImage(tileUrl(level, x, y)).catch(() => (level === minLevel ? Promise.reject(new Error("tile")) : null));
          if (img) ctx.drawImage(img, (x * width) / cols, (y * width) / 2 / rows, width / cols, width / 2 / rows);
          onProgress(++done / total);
        });
    await runLimited(jobs, CONCURRENCY);
    atlas.needsUpdate = true;
    target.fromEquirectangularTexture(renderer, atlas);
    onRefine(target.texture);
  }
  atlas.dispose();
  canvas.width = canvas.height = 0;
  return target;
}

async function fallbackCube(renderer, url, onRefine) {
  const img = await loadImage(url);
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d");
  ctx.setTransform(-1, 0, 0, 1, img.width, 0);
  ctx.drawImage(img, 0, 0);
  const atlas = new THREE.CanvasTexture(canvas);
  atlas.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const target = new THREE.WebGLCubeRenderTarget(img.width / 2, { generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
  target.fromEquirectangularTexture(renderer, atlas);
  atlas.dispose();
  onRefine(target.texture);
  return target;
}

export function createLunarSurface(renderer, tileUrl, fallbackUrl) {
  const uniforms = {
    uMap: { value: null },
    uHeight: { value: new THREE.WebGLCubeRenderTarget(1).texture },
    uSun: { value: new THREE.Vector3(0, 0, 1) },
    uEarth: { value: new THREE.Vector3() },
    uRelief: { value: 0 }
  };
  const material = new THREE.ShaderMaterial({ uniforms, vertexShader: SURFACE_VERT, fragmentShader: SURFACE_FRAG });
  const onRefine = (texture) => {
    uniforms.uMap.value = texture;
  };
  const ready = buildCube(renderer, tileUrl, { minLevel: MIN_LEVEL, topLevel: MIN_LEVEL, onRefine, onProgress: () => {} })
    .catch(() => fallbackCube(renderer, fallbackUrl, onRefine));
  return { material, uniforms, ready };
}

export function createMoon(container, { sites, tileUrl, demUrl, fallbackUrl }) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor(0x000000);
  const canvas = renderer.domElement;
  canvas.style.cssText = "display:block;width:100%;height:100%;touch-action:none;cursor:grab";
  container.appendChild(canvas);

  const scene = new THREE.Scene();
  scene.add(starField());
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.01, 200);

  const moon = new THREE.Group();
  moon.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI / 2);
  scene.add(moon);

  const uniforms = {
    uMap: { value: null },
    uHeight: { value: new THREE.WebGLCubeRenderTarget(1).texture },
    uSun: { value: new THREE.Vector3(0, 0, 1) },
    uEarth: { value: new THREE.Vector3() },
    uRelief: { value: RELIEF_SCALE }
  };
  moon.add(
    new THREE.Mesh(
      new THREE.SphereGeometry(1, 128, 96),
      new THREE.ShaderMaterial({ uniforms, vertexShader: SURFACE_VERT, fragmentShader: SURFACE_FRAG })
    )
  );

  const hud = document.createElement("div");
  hud.className = "hud";
  const labelLayer = document.createElement("div");
  labelLayer.style.cssText = "position:absolute;inset:0;pointer-events:none;overflow:hidden";
  container.append(labelLayer, hud);

  const loading = document.createElement("div");
  loading.style.cssText = "position:absolute;left:50%;bottom:14px;transform:translateX(-50%);width:min(320px,80%);background:rgba(10,14,20,.85);color:#e6e9ef;border:1px solid #1e2736;border-radius:6px;padding:8px 12px;font:12px ui-monospace,SFMono-Regular,Menlo,monospace;pointer-events:none";
  const loadingText = document.createElement("div");
  const loadingTrack = document.createElement("div");
  const loadingBar = document.createElement("div");
  loadingTrack.style.cssText = "height:4px;border-radius:2px;background:#1e2736;margin-top:6px;overflow:hidden";
  loadingBar.style.cssText = "height:100%;width:0;background:#4f8cff";
  loadingTrack.appendChild(loadingBar);
  loading.append(loadingText, loadingTrack);
  container.appendChild(loading);
  const showProgress = (fraction) => {
    loadingText.textContent = `Loading LRO WAC texture ${Math.round(fraction * 100)}%`;
    loadingBar.style.width = `${fraction * 100}%`;
  };
  showProgress(0);

  const dot = markerTexture();
  const marker = (color, size, text) => {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: dot, color, sizeAttenuation: false }));
    sprite.scale.setScalar(size);
    const label = document.createElement("div");
    label.textContent = text;
    label.style.cssText = "position:absolute;left:0;top:0;font:700 12px sans-serif;color:#fff;text-shadow:0 0 3px #000,0 0 3px #000,0 0 3px #000;white-space:nowrap;display:none";
    labelLayer.appendChild(label);
    moon.add(sprite);
    return { sprite, label, size };
  };

  const siteMarkers = sites.map((s) => {
    const m = marker(COLORS.site, 0.016, s.name);
    m.sprite.position.copy(direction(s.lat, s.lon, SURFACE));
    return m;
  });
  const sunMarker = marker(COLORS.sun, 0.032, "Subsolar point");
  const earthMarker = marker(COLORS.earth, 0.028, "Sub-Earth point");

  let selected = 0;
  let dist = 2.6;
  let targetDist = dist;
  let targetQuat = null;
  let dirty = true;

  const place = (m, p) => m.sprite.position.copy(direction(p.lat, p.lon, SURFACE));

  function updateLabels() {
    const camPos = camera.position;
    const w = container.clientWidth;
    const h = container.clientHeight;
    const entries = [
      ...siteMarkers.map((m, i) => ({ m, show: i === selected || dist <= LABEL_MAX_DIST })),
      { m: sunMarker, show: true },
      { m: earthMarker, show: true }
    ];
    for (const { m, show } of entries) {
      const world = m.sprite.getWorldPosition(new THREE.Vector3());
      const facing = world.dot(camPos) > SURFACE * SURFACE;
      m.sprite.visible = facing;
      m.label.style.display = facing && show ? "block" : "none";
      if (!facing || !show) continue;
      const p = world.project(camera);
      const x = (p.x * 0.5 + 0.5) * w;
      const flip = x + m.label.offsetWidth + 14 > w;
      m.label.style.transform = `translate(${flip ? x - m.label.offsetWidth - 10 : x + 10}px,${(-p.y * 0.5 + 0.5) * h - 8}px)`;
    }
  }

  function resize() {
    const w = container.clientWidth;
    const h = container.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    dirty = true;
  }
  new ResizeObserver(resize).observe(container);
  resize();

  const rotate = (dx, dy) => {
    const k = (2 * Math.tan((FOV * RAD) / 2) * Math.max(dist - 1, 0.05)) / container.clientHeight;
    const q = new THREE.Quaternion()
      .setFromAxisAngle(new THREE.Vector3(1, 0, 0), dy * k)
      .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), dx * k));
    moon.quaternion.premultiply(q).normalize();
    targetQuat = null;
    dirty = true;
  };
  const zoom = (factor) => {
    targetDist = THREE.MathUtils.clamp(targetDist * factor, DIST_MIN, DIST_MAX);
    dirty = true;
  };

  const pointers = new Map();
  let pinch = 0;
  canvas.addEventListener("pointerdown", (e) => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, e);
    canvas.style.cursor = "grabbing";
    pinch = 0;
  });
  canvas.addEventListener("pointermove", (e) => {
    const prev = pointers.get(e.pointerId);
    if (!prev) return;
    pointers.set(e.pointerId, e);
    if (pointers.size === 1) return rotate(e.clientX - prev.clientX, e.clientY - prev.clientY);
    const [a, b] = [...pointers.values()];
    const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    if (pinch) zoom(pinch / d);
    pinch = d;
  });
  const release = (e) => {
    pointers.delete(e.pointerId);
    pinch = 0;
    canvas.style.cursor = "grab";
  };
  canvas.addEventListener("pointerup", release);
  canvas.addEventListener("pointercancel", release);
  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      zoom(Math.exp(e.deltaY * 0.0012));
    },
    { passive: false }
  );

  const onRefine = (texture) => {
    uniforms.uMap.value = texture;
    dirty = true;
  };

  function frame() {
    requestAnimationFrame(frame);
    if (targetQuat) {
      moon.quaternion.slerp(targetQuat, 0.12);
      if (moon.quaternion.angleTo(targetQuat) < 1e-4) targetQuat = null;
      dirty = true;
    }
    if (Math.abs(targetDist - dist) > 1e-4) {
      dist += (targetDist - dist) * 0.15;
      dirty = true;
    }
    if (!dirty) return;
    dirty = false;
    camera.position.set(0, 0, dist);
    updateLabels();
    renderer.render(scene, camera);
  }
  frame();

  return {
    ready: Promise.all([
      buildCube(renderer, tileUrl, {
        minLevel: MIN_LEVEL,
        topLevel: MIN_LEVEL + (Math.min(renderer.capabilities.maxTextureSize, MAX_ATLAS) >= MAX_ATLAS ? 1 : 0),
        onRefine,
        onProgress: showProgress
      }).catch(() => fallbackCube(renderer, fallbackUrl, onRefine)),
      buildCube(renderer, demUrl, {
        minLevel: MIN_LEVEL,
        topLevel: MIN_LEVEL,
        onRefine: (texture) => {
          uniforms.uHeight.value = texture;
          dirty = true;
        },
        onProgress: () => {}
      }).catch(() => null)
    ]).finally(() => loading.remove()),
    update({ sun, earth, text }) {
      place(sunMarker, sun);
      place(earthMarker, earth);
      uniforms.uSun.value.copy(direction(sun.lat, sun.lon));
      hud.textContent = text;
      dirty = true;
    },
    select(index) {
      selected = index;
      siteMarkers.forEach((m, i) => {
        m.sprite.material.color.set(i === index ? COLORS.selected : COLORS.site);
        m.sprite.scale.setScalar(i === index ? m.size * 1.6 : m.size);
      });
      dirty = true;
    },
    flyTo(index, distance) {
      const s = sites[index];
      const current = direction(s.lat, s.lon).applyQuaternion(moon.quaternion);
      targetQuat = new THREE.Quaternion().setFromUnitVectors(current, new THREE.Vector3(0, 0, 1)).multiply(moon.quaternion);
      targetDist = distance ?? (s.lat < -80 ? 1.6 : 2.4);
      dirty = true;
    }
  };
}
