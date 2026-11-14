import * as THREE from "./vendor/three.module.min.js";

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

export function createTextureLoader(renderer) {
  const loader = new THREE.TextureLoader();
  const aniso = renderer.capabilities.getMaxAnisotropy();
  const textures = [];
  return {
    load(url, apply, srgb) {
      loader.load(url, (t) => {
        t.anisotropy = aniso;
        if (srgb) t.colorSpace = THREE.SRGBColorSpace;
        textures.push(t);
        apply(t);
      });
    },
    dispose() {
      textures.forEach((t) => t.dispose());
    }
  };
}

export function starField(radius) {
  const n = 2500;
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const v = new THREE.Vector3().randomDirection().multiplyScalar(radius);
    pos.set([v.x, v.y, v.z], i * 3);
  }
  const geo = new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(pos, 3));
  return new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, size: 1.2, sizeAttenuation: false, opacity: 0.75, transparent: true }));
}

export function createEarth(load, sun) {
  const placeholder = new THREE.DataTexture(new Uint8Array([8, 16, 32, 255]), 1, 1);
  placeholder.needsUpdate = true;
  const root = new THREE.Group();
  const spin = new THREE.Group();
  root.add(spin);

  const material = new THREE.ShaderMaterial({
    uniforms: { uDay: { value: placeholder }, uNight: { value: placeholder }, uSun: { value: sun } },
    vertexShader: EARTH_VERT,
    fragmentShader: EARTH_FRAG
  });
  spin.add(new THREE.Mesh(new THREE.SphereGeometry(1, 96, 72), material));
  load(ASSETS.earth, (t) => (material.uniforms.uDay.value = t));
  load(ASSETS.night, (t) => (material.uniforms.uNight.value = t));

  const cloudMaterial = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, depthWrite: false });
  spin.add(new THREE.Mesh(new THREE.SphereGeometry(1.012, 72, 54), cloudMaterial));
  load(ASSETS.clouds, (t) => {
    cloudMaterial.alphaMap = t;
    cloudMaterial.needsUpdate = true;
  });

  root.add(
    new THREE.Mesh(
      new THREE.SphereGeometry(1.05, 64, 48),
      new THREE.ShaderMaterial({ vertexShader: GLOW_VERT, fragmentShader: GLOW_FRAG, side: THREE.BackSide, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false })
    )
  );
  return { root, spin, placeholder };
}

export function createMoon(load) {
  const root = new THREE.Group();
  const spin = new THREE.Group();
  root.add(spin);
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0 });
  spin.add(new THREE.Mesh(new THREE.SphereGeometry(1, 72, 54), material));
  load(ASSETS.moon, (t) => {
    material.map = t;
    material.needsUpdate = true;
  }, true);
  return { root, spin };
}
