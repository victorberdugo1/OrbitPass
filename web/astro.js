import * as THREE from "./vendor/three.module.min.js";
import { surfaceDir } from "./bodies.js";

export const RAD = Math.PI / 180;

export const RE = 6371;

export const UNIT = 1000;
export const TRANSFER_S = 3.5 * 86400;

export const OBLIQUITY = 23.4393 * RAD;

export const V3 = THREE.Vector3;

export const jd = (t) => t / 86400 + 2440587.5;

export const ecl = (a) => new V3(a[0], a[2], -a[1]);

export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

export const smooth = (x) => {
  const t = clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
};

export const toWorld = (b, v) => b[0].clone().multiplyScalar(v.x).addScaledVector(b[1], v.y).addScaledVector(b[2], v.z);

export function moonAt(t) {
  const s = moonState(jd(t));
  return { pos: ecl(s.pos), pole: ecl(s.pole), lon: s.lon, sun: ecl(s.sun) };
}

export const moonPos = (t) => moonAt(t).pos;

export const moonVel = (t) => moonPos(t + 30).sub(moonPos(t - 30)).multiplyScalar(1 / 60);

export const moonNormal = (t) => moonPos(t).cross(moonVel(t)).normalize();

export function earthBasis(t) {
  const th = (280.46061837 + 360.98564736629 * (jd(t) - 2451545)) * RAD;
  const x = new V3(Math.cos(th), -Math.sin(th) * Math.sin(OBLIQUITY), -Math.sin(th) * Math.cos(OBLIQUITY));
  const y = new V3(0, Math.cos(OBLIQUITY), -Math.sin(OBLIQUITY));
  return [x, y, x.clone().cross(y)];
}

export const sitePos = (t, site) => toWorld(earthBasis(t), surfaceDir(site.lat, site.lon)).multiplyScalar(RE);

export function launchInstant(startMs, site) {
  const t0 = startMs / 1000;
  const n = moonNormal(t0 + 86400 + TRANSFER_S / 2);
  let best = { t: t0, miss: Infinity };
  for (let s = 0; s < 86400; s += 60) {
    const miss = Math.abs(sitePos(t0 + s, site).normalize().dot(n));
    if (miss < best.miss) best = { t: t0 + s, miss };
  }
  return best.t;
}

export const FOCUS_FOV = 6;
export const FOCUS_RADII = 1 / (0.74 * 2 * Math.tan((FOCUS_FOV * Math.PI) / 180 / 2));

export const siteDirection = (site, t) => toWorld(earthBasis(t), surfaceDir(site.lat, site.lon)).normalize();
