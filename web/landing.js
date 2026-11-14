import * as THREE from "./vendor/three.module.min.js";
import { createEarth, createMoon, createTextureLoader, glowTexture, starField, surfaceDir } from "./bodies.js";
import { FOCUS_FOV, FOCUS_RADII, earthBasis, launchInstant, moonAt, siteDirection, smooth } from "./astro.js";

const RAD = Math.PI / 180;
const CAM_Z = 160;
const CLOUD_DRIFT = -0.06;
const FOCUS_MS = 1800;
const HOLD_MS = 1400;
const DRAG_THRESHOLD = 6;

export function createLanding(container, mission) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor(0x02050b, 1);
  const canvas = renderer.domElement;
  canvas.style.cssText = "display:block;width:100%;height:100%;cursor:grab";
  container.appendChild(canvas);

  const scene = new THREE.Scene();
  scene.add(starField(180));
  const camera = new THREE.PerspectiveCamera(FOCUS_FOV, 1, 1, 600);
  camera.position.set(0, 0, CAM_Z);

  const sunWorld = new THREE.Vector3(0.9, 0.3, 0.6).normalize();
  const sunDir = new THREE.Vector3();
  const earthQuat = new THREE.Quaternion();
  const identity = new THREE.Quaternion();
  const sun = new THREE.DirectionalLight(0xffffff, 2.6);
  scene.add(sun, new THREE.AmbientLight(0xffffff, 0.16));

  const textures = createTextureLoader(renderer);

  const earth = createEarth(textures.load, sunDir);
  const earthTilt = earth.root;
  scene.add(earthTilt);

  const moon = createMoon(textures.load);
  const moonGroup = moon.root;
  const moonSpin = moon.spin;
  scene.add(moonGroup);

  const earthPos = new THREE.Vector3();
  const moonPos = new THREE.Vector3();
  let earthR = 1;
  let moonR = 1;
  let launchSite = mission.launch;
  let launchTime = 0;

  function layout() {
    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    const vh = 2 * Math.tan((FOCUS_FOV * RAD) / 2) * CAM_Z;
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
  }
  const observer = new ResizeObserver(layout);
  observer.observe(container);
  layout();

  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const glow = glowTexture();
  let focus = null;

  function lightEarth() {
    sunDir.copy(sunWorld).applyQuaternion(earthQuat.clone().invert()).applyQuaternion(earth.spin.quaternion).applyQuaternion(earthQuat);
  }

  function setMission({ startMs, launch }) {
    launchSite = launch;
    launchTime = launchInstant(startMs, launch);
    earthQuat.setFromRotationMatrix(new THREE.Matrix4().makeBasis(...earthBasis(launchTime)));
    earthTilt.quaternion.copy(earthQuat);
    sunWorld.copy(moonAt(launchTime).sun);
    sun.position.copy(sunWorld).multiplyScalar(50);
    lightEarth();
  }
  setMission(mission);

  function focusSite() {
    const up = surfaceDir(launchSite.lat, launchSite.lon);
    const core = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    const pulse = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: 0x59e3f7, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    core.position.copy(up).multiplyScalar(1.02);
    pulse.position.copy(core.position);
    core.scale.setScalar(0.035);
    earth.spin.add(core, pulse);

    const label = document.createElement("div");
    label.className = "ln-site";
    const caption = document.createElement("small");
    caption.textContent = "LAUNCH SITE";
    label.replaceChildren(caption, document.createTextNode(launchSite.name));
    container.appendChild(label);

    moonGroup.visible = false;
    const target = earthPos.clone().addScaledVector(siteDirection(launchSite, launchTime), FOCUS_RADII * earthR);
    return new Promise((resolve) => {
      focus = { from: camera.position.clone(), target, spinFrom: earth.spin.quaternion.clone(), t0: performance.now(), core, pulse, label, resolve };
    });
  }

  const wp = new THREE.Vector3();
  const origin = new THREE.Vector3();
  function updateFocus(now) {
    const elapsed = now - focus.t0;
    const k = reduce ? 1 : smooth(elapsed / FOCUS_MS);
    camera.position.lerpVectors(focus.from, focus.target, k);
    earth.spin.quaternion.copy(focus.spinFrom).slerp(identity, k);
    camera.lookAt(origin.clone().lerp(earthPos, k));
    const phase = (elapsed % 1600) / 1600;
    focus.pulse.scale.setScalar(0.05 + 0.11 * phase);
    focus.pulse.material.opacity = 0.9 * (1 - phase);
    focus.core.getWorldPosition(wp).project(camera);
    focus.label.style.transform = `translate(${(wp.x * 0.5 + 0.5) * container.clientWidth + 20}px, ${(0.5 - wp.y * 0.5) * container.clientHeight}px) translateY(-50%)`;
    focus.label.classList.toggle("on", k >= 1);
    if (elapsed >= (reduce ? 0 : FOCUS_MS) + HOLD_MS) focus.resolve();
  }

  const raycaster = new THREE.Raycaster();
  const surface = container.parentElement;
  const listeners = new AbortController();
  const { signal } = listeners;
  surface.style.touchAction = "none";
  let press = null;
  let drag = null;
  let swallowClick = false;

  const pickBody = (e) => {
    const r = canvas.getBoundingClientRect();
    raycaster.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
    return raycaster.intersectObject(moonGroup, true).length > 0 ? moonSpin : earth.spin;
  };
  const release = () => {
    if (drag !== null) {
      swallowClick = true;
      setTimeout(() => { swallowClick = false; }, 50);
    }
    press = null;
    drag = null;
    canvas.style.cursor = "grab";
  };

  surface.addEventListener("pointerdown", (e) => {
    if (focus !== null || e.button > 0 || e.target.closest("input, select, label, form")) return;
    press = { id: e.pointerId, body: pickBody(e), x: e.clientX, y: e.clientY };
  }, { signal });
  surface.addEventListener("pointermove", (e) => {
    if (press === null) return;
    if (drag === null) {
      if (Math.hypot(e.clientX - press.x, e.clientY - press.y) < DRAG_THRESHOLD) return;
      drag = { body: press.body, x: press.x, y: press.y };
      surface.setPointerCapture(press.id);
      canvas.style.cursor = "grabbing";
    }
    drag.body.rotation.y += (e.clientX - drag.x) * 0.006;
    drag.body.rotation.x += (e.clientY - drag.y) * 0.006;
    drag.x = e.clientX;
    drag.y = e.clientY;
  }, { signal });
  surface.addEventListener("pointerup", release, { signal });
  surface.addEventListener("pointercancel", release, { signal });
  surface.addEventListener("click", (e) => {
    if (!swallowClick) return;
    swallowClick = false;
    e.stopPropagation();
    e.preventDefault();
  }, { capture: true, signal });

  let raf = 0;
  let last = performance.now();
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    if (focus !== null) updateFocus(now);
    if (!reduce) earth.clouds.rotation.y += CLOUD_DRIFT * dt;
    if (drag === null) moonSpin.rotation.y += 0.02 * dt;
    lightEarth();
    renderer.render(scene, camera);
  }
  raf = requestAnimationFrame(frame);

  return {
    setMission,
    focusSite,
    dispose() {
      cancelAnimationFrame(raf);
      listeners.abort();
      surface.style.touchAction = "";
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
