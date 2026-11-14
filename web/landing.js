import * as THREE from "./vendor/three.module.min.js";
import { createEarth, createMoon, createTextureLoader, starField } from "./bodies.js";

const RAD = Math.PI / 180;
const FOV = 6;
const CAM_Z = 160;
const SUN = new THREE.Vector3(0.9, 0.3, 0.6).normalize();
const SPIN = 0.04;

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
  }
  const observer = new ResizeObserver(layout);
  observer.observe(container);
  layout();

  const raycaster = new THREE.Raycaster();
  let drag = null;
  canvas.addEventListener("pointerdown", (e) => {
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

  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let raf = 0;
  let last = performance.now();
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    if (drag === null && !reduce) {
      earthSpin.rotation.y += SPIN * dt;
    }
    moonSpin.rotation.y += 0.02 * dt;
    renderer.render(scene, camera);
  }
  raf = requestAnimationFrame(frame);

  return {
    dispose() {
      cancelAnimationFrame(raf);
      observer.disconnect();
      scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) o.material.dispose();
      });
      textures.dispose();
      earth.placeholder.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    }
  };
}
