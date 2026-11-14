import * as THREE from "./vendor/three.module.min.js";

const RAD = Math.PI / 180;
const FOV = 6;
const CAM_Z = 160;
const SUN = new THREE.Vector3(0.9, 0.3, 0.6).normalize();
const SPIN = 0.04;
const ASSETS = { earth: "assets/earth_day.jpg", night: "assets/earth_night.jpg", clouds: "assets/clouds.jpg", moon: "assets/moon.jpg" };

const EARTH_VERT = `
varying vec2 vUv;
varying vec3 vN;
varying vec3 vW;
void main() {
  vUv = uv;
  vN = normalize(mat3(modelMatrix) * normal);
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const EARTH_FRAG = `
uniform sampler2D uDay;
uniform sampler2D uNight;
uniform vec3 uSun;
varying vec2 vUv;
varying vec3 vN;
varying vec3 vW;
void main() {
  vec3 n = normalize(vN);
  float m = smoothstep(-0.1, 0.25, dot(n, uSun));
  vec3 day = texture2D(uDay, vUv).rgb * (0.05 + 1.15 * m);
  vec3 lights = texture2D(uNight, vUv).rgb * vec3(1.0, 0.78, 0.5) * 1.4 * (1.0 - m);
  vec3 v = normalize(cameraPosition - vW);
  float rim = pow(1.0 - max(dot(n, v), 0.0), 3.0);
  gl_FragColor = vec4(day + lights + vec3(0.15, 0.45, 1.0) * rim * (0.35 + 0.9 * m), 1.0);
}`;

const GLOW_VERT = `
varying vec3 vN;
varying vec3 vV;
void main() {
  vN = normalize(normalMatrix * normal);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vV = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;

const GLOW_FRAG = `
varying vec3 vN;
varying vec3 vV;
void main() {
  float s = -dot(vN, vV);
  float i = pow(smoothstep(0.0, 0.3, s), 2.0);
  gl_FragColor = vec4(0.3, 0.65, 1.0, 1.0) * i * 1.2;
}`;

function starField() {
  const n = 2500;
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const v = new THREE.Vector3().randomDirection().multiplyScalar(180);
    pos.set([v.x, v.y, v.z], i * 3);
  }
  const geo = new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(pos, 3));
  return new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, size: 1.2, sizeAttenuation: false, opacity: 0.75, transparent: true }));
}

export function createLanding(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor(0x02050b, 1);
  const canvas = renderer.domElement;
  canvas.style.cssText = "display:block;width:100%;height:100%;touch-action:none;cursor:grab";
  container.appendChild(canvas);

  const scene = new THREE.Scene();
  scene.add(starField());
  const camera = new THREE.PerspectiveCamera(FOV, 1, 1, 600);
  camera.position.set(0, 0, CAM_Z);

  const sun = new THREE.DirectionalLight(0xffffff, 2.6);
  sun.position.copy(SUN).multiplyScalar(50);
  scene.add(sun, new THREE.AmbientLight(0xffffff, 0.16));

  const loader = new THREE.TextureLoader();
  const aniso = renderer.capabilities.getMaxAnisotropy();
  const placeholder = new THREE.DataTexture(new Uint8Array([8, 16, 32, 255]), 1, 1);
  placeholder.needsUpdate = true;
  const textures = [];
  const load = (url, apply, srgb) =>
    loader.load(url, (t) => {
      t.anisotropy = aniso;
      if (srgb) t.colorSpace = THREE.SRGBColorSpace;
      textures.push(t);
      apply(t);
    });

  const earthTilt = new THREE.Group();
  earthTilt.rotation.set(0.5, 0, 0.1);
  scene.add(earthTilt);
  const earthSpin = new THREE.Group();
  earthSpin.rotation.y = 0.5;
  earthTilt.add(earthSpin);

  const earthMaterial = new THREE.ShaderMaterial({
    uniforms: { uDay: { value: placeholder }, uNight: { value: placeholder }, uSun: { value: SUN } },
    vertexShader: EARTH_VERT,
    fragmentShader: EARTH_FRAG
  });
  earthSpin.add(new THREE.Mesh(new THREE.SphereGeometry(1, 96, 72), earthMaterial));
  load(ASSETS.earth, (t) => (earthMaterial.uniforms.uDay.value = t));
  load(ASSETS.night, (t) => (earthMaterial.uniforms.uNight.value = t));

  const cloudMaterial = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, depthWrite: false });
  const cloudSpin = new THREE.Group();
  cloudSpin.add(new THREE.Mesh(new THREE.SphereGeometry(1.012, 72, 54), cloudMaterial));
  earthTilt.add(cloudSpin);
  load(ASSETS.clouds, (t) => {
    cloudMaterial.alphaMap = t;
    cloudMaterial.needsUpdate = true;
  });

  const atmosphere = new THREE.Mesh(
    new THREE.SphereGeometry(1.05, 64, 48),
    new THREE.ShaderMaterial({ vertexShader: GLOW_VERT, fragmentShader: GLOW_FRAG, side: THREE.BackSide, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false })
  );
  earthTilt.add(atmosphere);

  const moonGroup = new THREE.Group();
  scene.add(moonGroup);
  const moonSpin = new THREE.Group();
  moonGroup.add(moonSpin);
  const moonMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0 });
  moonSpin.add(new THREE.Mesh(new THREE.SphereGeometry(1, 72, 54), moonMaterial));
  load(ASSETS.moon, (t) => {
    moonMaterial.map = t;
    moonMaterial.needsUpdate = true;
  }, true);
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
    moonPos.copy(landscape ? at(0.77, 0.37) : at(0.8, 0.2));
    moonR = landscape ? 0.17 * vh : 0.11 * vw;
    earthTilt.position.copy(earthPos);
    earthTilt.scale.setScalar(earthR);
    moonGroup.position.copy(moonPos);
    moonGroup.scale.setScalar(moonR);
  }
  const observer = new ResizeObserver(layout);
  observer.observe(container);
  layout();

  let drag = null;
  canvas.addEventListener("pointerdown", (e) => {
    canvas.setPointerCapture(e.pointerId);
    drag = e.clientX;
    canvas.style.cursor = "grabbing";
  });
  canvas.addEventListener("pointermove", (e) => {
    if (drag === null) return;
    earthSpin.rotation.y += (e.clientX - drag) * 0.006;
    drag = e.clientX;
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
      cloudSpin.rotation.y += SPIN * 1.25 * dt;
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
      textures.forEach((t) => t.dispose());
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    }
  };
}
