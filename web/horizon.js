import { DEM_MAX_M, DEM_MIN_M, MOON_RADIUS_M } from "./dem.js";

const RAD = Math.PI / 180;
const LEVEL = 5;
const TILE_PX = 256;
const WIDTH = TILE_PX * (2 << LEVEL);
const HEIGHT = WIDTH / 2;
const DEM_STEP_M = (DEM_MAX_M - DEM_MIN_M) / 254;
const MAX_RANGE_M = 200000;
const MIN_RANGE_M = 100;
const RAY_STEP_M = 250;
const AZIMUTHS = 360;
const CONCURRENCY = 12;

const wrap = (v, n) => ((v % n) + n) % n;

const tileKey = (row, col) => row * 1000 + col;

function tilesAround(site) {
  const reach = MAX_RANGE_M / MOON_RADIUS_M / RAD;
  const polar = Math.abs(site.lat) + reach >= 90;
  const lonReach = polar ? 180 : reach / Math.cos((Math.abs(site.lat) + reach) * RAD);
  const rowOf = (lat) => Math.min(HEIGHT - 1, Math.max(0, Math.floor(((90 - lat) / 180) * HEIGHT))) >> 8;
  const colOf = (lon) => Math.floor(((lon + 180) / 360) * WIDTH) >> 8;
  const rows = [];
  for (let r = rowOf(site.lat + reach); r <= rowOf(site.lat - reach); r++) rows.push(r);
  const cols = new Set();
  const span = Math.ceil(((lonReach * 2) / 360) * (WIDTH / TILE_PX)) + 1;
  const first = polar ? 0 : colOf(site.lon - lonReach);
  const count = polar ? WIDTH / TILE_PX : span;
  for (let i = 0; i < count; i++) cols.add(wrap(first + i, WIDTH / TILE_PX));
  return rows.flatMap((r) => [...cols].map((c) => [r, c]));
}

async function decodeTile(url, scratch) {
  const response = await fetch(url);
  if (!response.ok) return null;
  const bitmap = await createImageBitmap(await response.blob(), { colorSpaceConversion: "none" });
  scratch.drawImage(bitmap, 0, 0);
  const rgba = scratch.getImageData(0, 0, TILE_PX, TILE_PX).data;
  const values = new Uint8Array(TILE_PX * TILE_PX);
  for (let i = 0; i < values.length; i++) values[i] = rgba[i * 4];
  return values;
}

async function loadTiles(sites, tileUrl) {
  const wanted = new Map();
  sites.flatMap(tilesAround).forEach(([r, c]) => wanted.set(tileKey(r, c), [r, c]));
  const scratch = Object.assign(document.createElement("canvas"), { width: TILE_PX, height: TILE_PX }).getContext("2d", { willReadFrequently: true });
  const tiles = new Map();
  const jobs = [...wanted].map(([key, [r, c]]) => async () => tiles.set(key, await decodeTile(tileUrl(LEVEL, c, r), scratch).catch(() => null)));
  let next = 0;
  const worker = async () => {
    while (next < jobs.length) await jobs[next++]();
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  if (![...tiles.values()].some(Boolean)) throw new Error("no DEM tiles");
  return tiles;
}

function elevationSampler(tiles) {
  const texel = (ix, iy) => {
    const x = wrap(ix, WIDTH);
    const y = Math.min(HEIGHT - 1, Math.max(0, iy));
    const tile = tiles.get(tileKey(y >> 8, x >> 8));
    const v = tile ? tile[(y & 255) * TILE_PX + (x & 255)] : 0;
    return v === 0 ? NaN : DEM_MIN_M + (v - 1) * DEM_STEP_M;
  };
  return (lat, lon) => {
    const px = ((lon + 180) / 360) * WIDTH - 0.5;
    const py = ((90 - lat) / 180) * HEIGHT - 0.5;
    const x0 = Math.floor(px);
    const y0 = Math.floor(py);
    const fx = px - x0;
    const fy = py - y0;
    return (
      texel(x0, y0) * (1 - fx) * (1 - fy) +
      texel(x0 + 1, y0) * fx * (1 - fy) +
      texel(x0, y0 + 1) * (1 - fx) * fy +
      texel(x0 + 1, y0 + 1) * fx * fy
    );
  };
}

function siteHorizon(site, elevation) {
  const texelDeg = 360 / WIDTH;
  const around = [-1, 0, 1].flatMap((i) => [-1, 0, 1].map((j) => elevation(site.lat + i * texelDeg, site.lon + j * texelDeg)));
  const valid = around.filter(Number.isFinite);
  // Do not silently substitute zero or an average when the landing site is missing.
  const siteHeight = elevation(site.lat, site.lon);
  if (!Number.isFinite(siteHeight) || valid.length !== around.length) {
    throw new Error(`Insufficient DEM data at site ${site.lat},${site.lon}`);
  }
  const base = MOON_RADIUS_M + siteHeight;
  const sinLat = Math.sin(site.lat * RAD);
  const cosLat = Math.cos(site.lat * RAD);
  const horizon = new Float32Array(AZIMUTHS);
  for (let az = 0; az < AZIMUTHS; az++) {
    const sinAz = Math.sin(az * RAD);
    const cosAz = Math.cos(az * RAD);
    // A lunar horizon can lie below the local tangent plane.
    let best = -90;
    let samples = 0;
    let missing = 0;
    for (let d = MIN_RANGE_M; d <= MAX_RANGE_M; d += RAY_STEP_M) {
      const delta = d / MOON_RADIUS_M;
      const sinLat2 = sinLat * Math.cos(delta) + cosLat * Math.sin(delta) * cosAz;
      const lat2 = Math.asin(sinLat2);
      const lon2 = site.lon * RAD + Math.atan2(sinAz * Math.sin(delta) * cosLat, Math.cos(delta) - sinLat * sinLat2);
      const h = elevation(lat2 / RAD, lon2 / RAD);
      if (!Number.isFinite(h)) { missing++; continue; }
      samples++;
      const r = MOON_RADIUS_M + h;
      best = Math.max(best, Math.atan2(r * Math.cos(delta) - base, r * Math.sin(delta)) / RAD);
    }
    // A missing sample might conceal the highest obstacle along this ray.
    // Refuse to label an incomplete profile as verified terrain visibility.
    if (!samples || missing) {
      throw new Error(`Incomplete DEM ray az=${az}: ${missing} missing samples`);
    }
    horizon[az] = best;
  }
  return horizon;
}

export async function computeHorizons(sites, tileUrl) {
  const elevation = elevationSampler(await loadTiles(sites, tileUrl));
  return sites.map((site) => ({ horizon: siteHorizon(site, elevation), elevation: elevation(site.lat, site.lon) }));
}
