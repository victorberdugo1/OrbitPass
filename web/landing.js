import * as THREE from "./vendor/three.module.min.js";
import { createEarth, createMoon, createTextureLoader, glowTexture, starField, surfaceDir } from "./bodies.js";

const RAD = Math.PI / 180;
const FOV = 6;
const CAM_Z = 160;
const SUN = new THREE.Vector3(0.9, 0.3, 0.6).normalize();
const SPIN = 0.04;
const CLOUD_DRIFT = -0.06;
const FOCUS_MS = 1800;
const HOLD_MS = 1400;

export function createLanding(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor(0x02050b, 1);
  const canvas = renderer.domElement;
  canvas.style.cssText = "display:block;width:100%;height:100%;touch-action:none;cursor:grab";
  container.appendChild(canvas);

  const scene = new THREE.Scene();
  scene.add(starField(180));
  const camera = new THREE.PerspectiveCamera(FOV, 1, 1, 600);
  camera.position.set(0, 0, CAM_Z);

  const sun = new THREE.DirectionalLight(0xffffff, 2.6);
  sun.position.copy(SUN).multiplyScalar(50);
  scene.add(sun, new THREE.AmbientLight(0xffffff, 0.16));

  const textures = createTextureLoader(renderer);

  const earth = createEarth(textures.load, SUN);
  const earthTilt = earth.root;
  earthTilt.rotation.set(0.5, 0, 0.1);
  const earthSpin = earth.spin;
  earthSpin.rotation.y = 0.5;
  scene.add(earthTilt);

  const moon = createMoon(textures.load);
  const moonGroup = moon.root;
  const moonSpin = moon.spin;
  scene.add(moonGroup);

  const earthPos = new THREE.Vector3();
  const moonPos = new THREE.Vector3();
  const focusPoint = new THREE.Vector3();
  let earthR = 1;
  let moonR = 1;

  function layout() {
    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    const vh = 2 * Math.tan((FOV * RAD) / 2) * CAM_Z;
    const vw = vh * camera.aspect;
    const at = (fx, fy) => new THREE.Vector3((fx - 0.5) * vw, (0.5 - fy) * vh, 0);
    const landscape = camera.aspect >= 1.1;
    earthPos.copy(landscape ? at(0.03, 0.55) : at(0.27, 0.32));
    earthR = landscape ? 0.74 * vh : 0.42 * vw;
    moonPos.copy(landscape ? at(0.72, 0.34) : at(0.8, 0.2));
    moonR = landscape ? 0.17 * vh : 0.11 * vw;
    earthTilt.position.copy(earthPos);
    earthTilt.scale.setScalar(earthR);
    moonGroup.position.copy(moonPos);
    moonGroup.scale.setScalar(moonR);
    focusPoint.copy(landscape ? at(0.3, 0.5) : earthPos);
  }
  const observer = new ResizeObserver(layout);
  observer.observe(container);
  layout();

  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const glow = glowTexture();
  const wp = new THREE.Vector3();
  let focus = null;

  function targetQuaternion(local) {
    const v = focusPoint.clone().sub(earthPos);
    v.z = 0;
    if (v.length() > 0.9 * earthR) v.setLength(0.9 * earthR);
    const n = new THREE.Vector3(v.x, v.y, Math.sqrt(earthR * earthR - v.lengthSq())).normalize();
    const north = new THREE.Vector3(0, 1, 0).addScaledVector(n, -n.y).normalize();
    const world = new THREE.Matrix4().makeBasis(north.clone().cross(n), north, n).multiply(local);
    return new THREE.Quaternion().setFromRotationMatrix(world).premultiply(earthTilt.quaternion.clone().invert());
  }

  function focusSite(site) {
    const lat = (site.lat * Math.PI) / 180;
    const lon = (site.lon * Math.PI) / 180;
    const up = surfaceDir(site.lat, site.lon);
    const north = new THREE.Vector3(-Math.sin(lat) * Math.cos(lon), Math.cos(lat), Math.sin(lat) * Math.sin(lon));
    const local = new THREE.Matrix4().makeBasis(north.clone().cross(up), north, up).transpose();

    const core = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    const pulse = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: 0x59e3f7, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    core.position.copy(up).multiplyScalar(1.02);
    pulse.position.copy(core.position);
    core.scale.setScalar(0.035);
    earthSpin.add(core, pulse);

    const label = document.createElement("div");
    label.className = "ln-site";
    const caption = document.createElement("small");
    caption.textContent = "LAUNCH SITE";
    label.replaceChildren(caption, document.createTextNode(site.name));
    container.appendChild(label);

    return new Promise((resolve) => {
      focus = { local, from: earthSpin.quaternion.clone(), t0: performance.now(), core, pulse, label, resolve };
    });
  }

  function updateFocus(now) {
    const k = reduce ? 1 : Math.min((now - focus.t0) / FOCUS_MS, 1);
    earthSpin.quaternion.copy(focus.from).slerp(targetQuaternion(focus.local), k * k * (3 - 2 * k));
    const phase = ((now - focus.t0) % 1600) / 1600;
    focus.pulse.scale.setScalar(0.05 + 0.11 * phase);
    focus.pulse.material.opacity = 0.9 * (1 - phase);
    focus.core.getWorldPosition(wp).project(camera);
    focus.label.style.transform = `translate(${(wp.x * 0.5 + 0.5) * container.clientWidth + 20}px, ${(0.5 - wp.y * 0.5) * container.clientHeight}px) translateY(-50%)`;
    focus.label.classList.toggle("on", k >= 1);
    if (now - focus.t0 >= (reduce ? 0 : FOCUS_MS) + HOLD_MS) focus.resolve();
  }

  const raycaster = new THREE.Raycaster();
  let drag = null;
  canvas.addEventListener("pointerdown", (e) => {
    if (focus !== null) return;
    const r = canvas.getBoundingClientRect();
    raycaster.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
    canvas.setPointerCapture(e.pointerId);
    drag = { body: raycaster.intersectObject(moonGroup, true).length ? moonSpin : earthSpin, x: e.clientX, y: e.clientY };
    canvas.style.cursor = "grabbing";
  });
  canvas.addEventListener("pointermove", (e) => {
    if (drag === null) return;
    drag.body.rotation.y += (e.clientX - drag.x) * 0.006;
    drag.body.rotation.x += (e.clientY - drag.y) * 0.006;
    drag.x = e.clientX;
    drag.y = e.clientY;
  });
  const release = () => {
    drag = null;
    canvas.style.cursor = "grab";
  };
  canvas.addEventListener("pointerup", release);
  canvas.addEventListener("pointercancel", release);

  let raf = 0;
  let last = performance.now();
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    if (focus !== null) updateFocus(now);
    else if (drag === null && !reduce) earthSpin.rotation.y += SPIN * dt;
    if (!reduce && drag === null) earth.clouds.rotation.y += CLOUD_DRIFT * dt;
    moonSpin.rotation.y += 0.02 * dt;
    renderer.render(scene, camera);
  }
  raf = requestAnimationFrame(frame);

  return {
    focusSite,
    dispose() {
      cancelAnimationFrame(raf);
      observer.disconnect();
      scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) o.material.dispose();
      });
      textures.dispose();
      glow.dispose();
      if (focus !== null) focus.label.remove();
      earth.placeholder.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    }
  };
}
