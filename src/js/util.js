'use strict';
/* 共通ユーティリティ。DOMに依存しない純粋関数だけを置く(node でテストできるように) */

const TAU = Math.PI * 2;
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const lerp = (a, b, t) => a + (b - a) * t;
const approach = (v, to, step) => (v < to ? Math.min(v + step, to) : Math.max(v - step, to));
const angleDiff = (a, b) => {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  else if (d < -Math.PI) d += TAU;
  return d;
};

// シード付き乱数。マップ生成を毎回同じにするために使う
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// コンボ数(1以上)→スコア倍率。1コンボ増えるごとに +0.25、最大 x3
function comboMultiplier(combo) {
  return Math.min(1 + 0.25 * Math.max(combo - 1, 0), 3);
}

// 制御点を通る滑らかな折れ線(Catmull-Rom)を step 間隔でサンプリングする
function catmullRom(points, step) {
  const out = [];
  const n = points.length;
  for (let i = 0; i < n - 1; i++) {
    const p0 = points[Math.max(i - 1, 0)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(i + 2, n - 1)];
    const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const steps = Math.max(2, Math.ceil(len / step));
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (a, b, c, d) =>
        0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push({ x: f(p0[0], p1[0], p2[0], p3[0]), y: f(p0[1], p1[1], p2[1], p3[1]) });
    }
  }
  const last = points[n - 1];
  out.push({ x: last[0], y: last[1] });
  return out;
}

function distToSegment(px, py, ax, ay, bx, by) {
  const vx = bx - ax;
  const vy = by - ay;
  const l2 = vx * vx + vy * vy;
  const t = l2 === 0 ? 0 : clamp(((px - ax) * vx + (py - ay) * vy) / l2, 0, 1);
  return Math.hypot(px - (ax + vx * t), py - (ay + vy * t));
}

// 回転した矩形(中心 cx,cy / 角度 ang / 半長 hl / 半幅 hw)に点が入っているか
function pointInRotRect(px, py, cx, cy, ang, hl, hw) {
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  const dx = px - cx;
  const dy = py - cy;
  const lx = dx * c + dy * s;
  const ly = -dx * s + dy * c;
  return Math.abs(lx) <= hl && Math.abs(ly) <= hw;
}

// 4近傍の塗りつぶし。blocked が 1 のセルは通れない。戻り値は到達できたセルが 1 の配列
function floodFill(blocked, w, h, sx, sy) {
  const reach = new Uint8Array(w * h);
  if (sx < 0 || sy < 0 || sx >= w || sy >= h || blocked[sy * w + sx]) return reach;
  const queue = new Int32Array(w * h);
  let head = 0;
  let tail = 0;
  queue[tail++] = sy * w + sx;
  reach[sy * w + sx] = 1;
  while (head < tail) {
    const i = queue[head++];
    const x = i % w;
    const y = (i / w) | 0;
    if (x > 0 && !reach[i - 1] && !blocked[i - 1]) { reach[i - 1] = 1; queue[tail++] = i - 1; }
    if (x < w - 1 && !reach[i + 1] && !blocked[i + 1]) { reach[i + 1] = 1; queue[tail++] = i + 1; }
    if (y > 0 && !reach[i - w] && !blocked[i - w]) { reach[i - w] = 1; queue[tail++] = i - w; }
    if (y < h - 1 && !reach[i + w] && !blocked[i + w]) { reach[i + w] = 1; queue[tail++] = i + w; }
  }
  return reach;
}

// 空間ハッシュ。円(半径 rad)を覆うセルすべてに登録し、矩形で問い合わせる
// 注意: query のコールバック内で同じハッシュに再度 query しないこと(重複排除用スタンプが壊れる)
class SpatialHash {
  constructor(cell) {
    this.cell = cell;
    this.cells = new Map();
    this.stamp = 0;
  }
  _key(cx, cy) {
    return (cx + 200) * 1024 + (cy + 200);
  }
  insert(o, rad) {
    const c = this.cell;
    const x0 = Math.floor((o.x - rad) / c);
    const x1 = Math.floor((o.x + rad) / c);
    const y0 = Math.floor((o.y - rad) / c);
    const y1 = Math.floor((o.y + rad) / c);
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const k = this._key(cx, cy);
        let a = this.cells.get(k);
        if (!a) { a = []; this.cells.set(k, a); }
        a.push(o);
      }
    }
  }
  query(x0, y0, x1, y1, fn) {
    const c = this.cell;
    const st = ++this.stamp;
    const cx0 = Math.floor(x0 / c);
    const cx1 = Math.floor(x1 / c);
    const cy0 = Math.floor(y0 / c);
    const cy1 = Math.floor(y1 / c);
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const a = this.cells.get(this._key(cx, cy));
        if (!a) continue;
        for (let i = 0; i < a.length; i++) {
          const o = a[i];
          if (o._q === st) continue;
          o._q = st;
          fn(o);
        }
      }
    }
  }
}
