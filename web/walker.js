const RAD = Math.PI / 180;
const MAX_SUBSTEP_S = 1 / 120;
const MAX_FRAME_S = 0.1;
const CLIFF_DROP_M = 0.4;
const WALL_TOLERANCE_M = 0.05;
const STRIDE_M = 1.1;

export const EYE_HEIGHT_M = 1.7;

export const GAITS = {
  apollo: { walk: 1.4, lope: 4.5, accel: 2.4, brake: 1.8, gravity: 1.62, jump: 1.9, hop: 0.9, hopBoost: 1.3, maxSlopeDeg: 30, bobM: 0.035 },
  explorer: { walk: 25, lope: 100, accel: Infinity, brake: Infinity, gravity: 0, jump: 0, hop: 0, hopBoost: 0, maxSlopeDeg: 90, bobM: 0 }
};

export class HeightGrid {
  constructor(half, segments, heights) {
    this.half = half;
    this.segments = segments;
    this.cell = (2 * half) / segments;
    this.heights = heights;
  }

  static fromPositions(positions, half, segments) {
    const heights = new Float32Array(positions.count);
    for (let i = 0; i < positions.count; i++) heights[i] = positions.getY(i);
    return new HeightGrid(half, segments, heights);
  }

  at(x, z) {
    const u = (x + this.half) / this.cell;
    const v = (z + this.half) / this.cell;
    if (!(u >= 0 && v >= 0 && u <= this.segments && v <= this.segments)) return NaN;
    const ix = Math.min(Math.floor(u), this.segments - 1);
    const iz = Math.min(Math.floor(v), this.segments - 1);
    const fu = u - ix;
    const fv = v - iz;
    const n = this.segments + 1;
    const a = this.heights[iz * n + ix];
    const b = this.heights[(iz + 1) * n + ix];
    const c = this.heights[(iz + 1) * n + ix + 1];
    const d = this.heights[iz * n + ix + 1];
    return fu + fv <= 1 ? a + fu * (d - a) + fv * (b - a) : c + (1 - fu) * (b - c) + (1 - fv) * (d - c);
  }
}

const approach = (vx, vz, tx, tz, maxDelta) => {
  const dx = tx - vx;
  const dz = tz - vz;
  const dist = Math.hypot(dx, dz);
  if (dist <= maxDelta) return [tx, tz];
  return [vx + (dx / dist) * maxDelta, vz + (dz / dist) * maxDelta];
};

export class Walker {
  constructor(ground, { x, z, limit, gait }) {
    this.ground = ground;
    this.limit = limit;
    this.x = x;
    this.z = z;
    this.y = ground(x, z);
    this.vx = 0;
    this.vy = 0;
    this.vz = 0;
    this.grounded = true;
    this.stride = 0;
    this.bob = 0;
    this.setGait(gait);
  }

  get eyeY() {
    return this.y + EYE_HEIGHT_M + this.bob;
  }

  get speed() {
    return Math.hypot(this.vx, this.vz);
  }

  setGait(name) {
    this.gait = GAITS[name];
    this.maxSlope = Math.tan(this.gait.maxSlopeDeg * RAD);
    if (!this.gait.gravity) {
      this.y = this.ground(this.x, this.z);
      this.vy = 0;
      this.grounded = true;
    }
  }

  step(dt, input) {
    const before = [this.x, this.y, this.z, this.bob];
    let left = Math.min(dt, MAX_FRAME_S);
    while (left > 1e-9) {
      const h = Math.min(left, MAX_SUBSTEP_S);
      this.substep(h, input);
      left -= h;
    }
    return before[0] !== this.x || before[1] !== this.y || before[2] !== this.z || before[3] !== this.bob;
  }

  substep(dt, input) {
    const g = this.gait;
    const mag = Math.hypot(input.forward, input.side);
    let tx = 0;
    let tz = 0;
    if (mag) {
      const speed = input.lope ? g.lope : g.walk;
      const f = input.forward / mag;
      const s = input.side / mag;
      tx = (Math.sin(input.yaw) * f + Math.cos(input.yaw) * s) * speed;
      tz = (-Math.cos(input.yaw) * f + Math.sin(input.yaw) * s) * speed;
    }
    if (this.grounded) {
      [this.vx, this.vz] = approach(this.vx, this.vz, tx, tz, (mag ? g.accel : g.brake) * dt);
      if (input.jump && g.jump) this.launch(g.jump);
      else if (input.lope && mag && g.hop && this.speed > g.walk * 1.2) {
        [this.vx, this.vz] = approach(this.vx, this.vz, tx, tz, g.hopBoost);
        this.launch(g.hop);
      }
    }
    this.moveHorizontally(dt);
    this.moveVertically(dt);
    this.updateBob(dt, input);
  }

  launch(speed) {
    this.vy = speed;
    this.grounded = false;
  }

  moveHorizontally(dt) {
    const nx = this.x + this.vx * dt;
    const nz = this.z + this.vz * dt;
    if (this.canStand(nx, nz)) return this.place(nx, nz);
    if (this.canStand(nx, this.z)) {
      this.vz = 0;
      return this.place(nx, this.z);
    }
    if (this.canStand(this.x, nz)) {
      this.vx = 0;
      return this.place(this.x, nz);
    }
    this.vx = 0;
    this.vz = 0;
  }

  place(x, z) {
    this.x = x;
    this.z = z;
  }

  canStand(x, z) {
    if (Math.abs(x) > this.limit || Math.abs(z) > this.limit) return false;
    const floor = this.ground(x, z);
    if (!Number.isFinite(floor)) return false;
    if (!this.grounded) return floor <= this.y + WALL_TOLERANCE_M;
    const rise = floor - this.ground(this.x, this.z);
    return rise <= Math.hypot(x - this.x, z - this.z) * this.maxSlope;
  }

  moveVertically(dt) {
    const g = this.gait;
    const floor = this.ground(this.x, this.z);
    if (this.grounded) {
      if (g.gravity && this.y - floor > CLIFF_DROP_M) this.grounded = false;
      else this.y = floor;
      if (this.grounded) return;
    }
    this.vy -= g.gravity * dt;
    this.y += this.vy * dt;
    if (this.y <= floor) {
      this.y = floor;
      this.vy = 0;
      this.grounded = true;
    }
  }

  updateBob(dt, input) {
    const g = this.gait;
    const walking = this.grounded && g.bobM && !input.lope && this.speed > 0.05;
    if (!walking) {
      this.bob = 0;
      return;
    }
    this.stride += this.speed * dt;
    this.bob = g.bobM * Math.sin((2 * Math.PI * this.stride) / STRIDE_M);
  }
}
