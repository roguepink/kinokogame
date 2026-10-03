'use strict';
/* 広い森のマップを作る。見た目の描画は render.js / art.js が担当 */

const T_LAND = 0;
const T_WATER = 1;
const T_BRIDGE = 2;

function buildWorld(seed) {
  const rng = mulberry32(seed);
  const R = (a, b) => a + rng() * (b - a);
  const S = CONFIG.world.size;
  const TS = CONFIG.world.tile;
  const N = S / TS;
  const tiles = new Uint8Array(N * N);
  const W = {
    size: S, tile: TS, n: N, tiles,
    rivers: [], ponds: [], bridges: [],
    obstacles: [], hash: new SpatialHash(128),
    decor: new SpatialHash(256), patches: [], camps: [], trees: [],
    clear: [], start: { x: 1000, y: 2750 },
    reach: null, spots: null,
  };

  const inGrid = (tx, ty) => tx >= 0 && ty >= 0 && tx < N && ty < N;
  const forTiles = (x0, y0, x1, y1, fn) => {
    const tx0 = Math.max(0, Math.floor(x0 / TS));
    const ty0 = Math.max(0, Math.floor(y0 / TS));
    const tx1 = Math.min(N - 1, Math.floor(x1 / TS));
    const ty1 = Math.min(N - 1, Math.floor(y1 / TS));
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) fn(tx, ty);
  };
  const markCircle = (cx, cy, r, val) => {
    forTiles(cx - r, cy - r, cx + r, cy + r, (tx, ty) => {
      const dx = (tx + 0.5) * TS - cx;
      const dy = (ty + 0.5) * TS - cy;
      if (dx * dx + dy * dy <= r * r) tiles[ty * N + tx] = val;
    });
  };

  // ---- 川 ----
  const riverDefs = [
    { w: 120, bridges: [0.17, 0.36, 0.62, 0.84],
      pts: [[2650, -150], [2450, 420], [2750, 950], [2400, 1450], [2050, 1900], [2300, 2450], [1850, 2950], [1550, 3450], [1750, 4150]] },
    { w: 100, bridges: [0.28, 0.58, 0.8],
      pts: [[-150, 1250], [420, 950], [950, 1350], [1500, 1650], [2050, 1900]] },
  ];
  for (const def of riverDefs) {
    const path = catmullRom(def.pts, 14);
    W.rivers.push({ w: def.w, path, bridgeFracs: def.bridges });
    for (const p of path) markCircle(p.x, p.y, def.w / 2 - 5, T_WATER);
  }

  // ---- 池 ----
  const pondDefs = [
    { x: 700, y: 3350, rx: 170, ry: 110 },
    { x: 3300, y: 2700, rx: 200, ry: 140 },
    { x: 1050, y: 520, rx: 150, ry: 100 },
    { x: 3250, y: 3450, rx: 150, ry: 100 },
  ];
  for (const p of pondDefs) {
    W.ponds.push(p);
    forTiles(p.x - p.rx, p.y - p.ry, p.x + p.rx, p.y + p.ry, (tx, ty) => {
      const dx = ((tx + 0.5) * TS - p.x) / (p.rx - 4);
      const dy = ((ty + 0.5) * TS - p.y) / (p.ry - 4);
      if (dx * dx + dy * dy <= 1) tiles[ty * N + tx] = T_WATER;
    });
  }

  // ---- 橋(川に直角に架ける) ----
  for (const river of W.rivers) {
    const path = river.path;
    for (const f of river.bridgeFracs) {
      const i = Math.floor(f * (path.length - 1));
      const p = path[i];
      const a = path[Math.max(i - 3, 0)];
      const b = path[Math.min(i + 3, path.length - 1)];
      const ang = Math.atan2(b.y - a.y, b.x - a.x) + Math.PI / 2;
      const br = { x: p.x, y: p.y, ang, hl: river.w / 2 + 40, hw: 34 };
      W.bridges.push(br);
      W.clear.push({ x: br.x, y: br.y, r: br.hl + 60 });
      forTiles(br.x - br.hl - 40, br.y - br.hl - 40, br.x + br.hl + 40, br.y + br.hl + 40, (tx, ty) => {
        if (pointInRotRect((tx + 0.5) * TS, (ty + 0.5) * TS, br.x, br.y, br.ang, br.hl, br.hw)) tiles[ty * N + tx] = T_BRIDGE;
      });
    }
  }
  W.clear.push({ x: W.start.x, y: W.start.y, r: 240 });

  // ---- 問い合わせ用の関数 ----
  W.tileAt = (x, y) => {
    const tx = Math.floor(x / TS);
    const ty = Math.floor(y / TS);
    return inGrid(tx, ty) ? tiles[ty * N + tx] : T_WATER; // 範囲外は水扱い(=通れない)
  };
  // 半径 r の円のどこかが水に入っているか
  W.waterBlocked = (x, y, r) => {
    if (W.tileAt(x, y) === T_WATER) return true;
    const k = r * 0.9;
    const d = k * 0.7071;
    return (
      W.tileAt(x + k, y) === T_WATER || W.tileAt(x - k, y) === T_WATER ||
      W.tileAt(x, y + k) === T_WATER || W.tileAt(x, y - k) === T_WATER ||
      W.tileAt(x + d, y + d) === T_WATER || W.tileAt(x - d, y + d) === T_WATER ||
      W.tileAt(x + d, y - d) === T_WATER || W.tileAt(x - d, y - d) === T_WATER
    );
  };
  // 2点の間に水(橋のない川)がないか。敵が川の向こうのプレイヤーを追いかけないために使う
  W.lineClear = (ax, ay, bx, by) => {
    const dist = Math.hypot(bx - ax, by - ay);
    const steps = Math.ceil(dist / 22);
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      if (W.tileAt(ax + (bx - ax) * t, ay + (by - ay) * t) === T_WATER) return false;
    }
    return true;
  };
  const waterNear = (x, y, rad) => {
    let hit = false;
    forTiles(x - rad - TS, y - rad - TS, x + rad + TS, y + rad + TS, (tx, ty) => {
      if (hit || tiles[ty * N + tx] !== T_WATER) return;
      const dx = (tx + 0.5) * TS - x;
      const dy = (ty + 0.5) * TS - y;
      const rr = rad + TS * 0.7;
      if (dx * dx + dy * dy <= rr * rr) hit = true;
    });
    return hit;
  };
  const inClear = (x, y, r) => W.clear.some((c) => Math.hypot(c.x - x, c.y - y) < c.r + r);

  // ---- 障害物 ----
  const push = (o) => {
    o.ph = rng() * TAU;
    W.obstacles.push(o);
    W.hash.insert(o, o.r + 2);
    return o;
  };
  // 近くに他の障害物がないか(gap は最低限あけたい隙間)
  const tooClose = (x, y, r, gap) => {
    let bad = false;
    W.hash.query(x - r - 120, y - r - 120, x + r + 120, y + r + 120, (p) => {
      if (!bad && Math.hypot(p.x - x, p.y - y) < r + p.r + gap) bad = true;
    });
    return bad;
  };
  const place = (o, gap, waterMargin, ignoreClear) => {
    const m = 70;
    if (o.x < m || o.y < m || o.x > S - m || o.y > S - m) return null;
    if (!ignoreClear && inClear(o.x, o.y, o.r)) return null;
    if (waterNear(o.x, o.y, o.r + waterMargin)) return null;
    if (tooClose(o.x, o.y, o.r, gap)) return null;
    return push(o);
  };

  // 山: 1つの山は横に並べた小さな円の連なりを当たり判定にする(見下ろしで平たく見えるため)
  const addMountain = (x, y, hw, v) => {
    if (waterNear(x, y, hw * 0.9)) return;
    if (Math.hypot(x - W.start.x, y - W.start.y) < hw + 320) return;
    if (inClear(x, y, hw * 0.5)) return;
    const main = push({ kind: 'mountain', x, y, r: 0.45 * hw, hw: hw * 1.05, hgt: hw * 1.95, v, s: hw / 105 });
    for (const k of [-0.62, 0.62]) push({ kind: 'col', x: x + k * hw, y, r: 0.45 * hw });
    return main;
  };
  for (let x = 120; x < S; x += R(210, 290)) addMountain(x, R(40, 170), R(110, 175), Math.floor(R(0, 3)));
  const massifs = [[3450, 820, 6, 240], [3560, 3650, 5, 220], [330, 2350, 5, 230]];
  for (const [mx, my, n, rad] of massifs) {
    for (let i = 0; i < n; i++) {
      const a = R(0, TAU);
      const d = R(0, rad);
      addMountain(mx + Math.cos(a) * d, my + Math.sin(a) * d * 0.7, R(95, 150), Math.floor(R(0, 3)));
    }
  }

  // 丸太: 中心(cx,cy)に描き、当たり判定は両端の小さな円2つ
  const addLog = (cx, cy, ang, v, sc) => {
    const dx = Math.cos(ang) * 16 * sc;
    const dy = Math.sin(ang) * 16 * sc;
    push({ kind: 'log', x: cx - dx, y: cy - dy, cx, cy, r: 9, hgt: 26, hw: 36, ang, s: sc, v });
    push({ kind: 'col', x: cx + dx, y: cy + dy, r: 9, low: true });
  };

  // キャンプ(テント+たき火+丸太のイス)
  const campSpots = [[1250, 2480], [3000, 1700], [700, 760]];
  for (const [cx, cy] of campSpots) {
    let done = false;
    for (let tries = 0; tries < 40 && !done; tries++) {
      const x = cx + R(-120, 120) * (tries / 10);
      const y = cy + R(-120, 120) * (tries / 10);
      if (waterNear(x, y, 120) || tooClose(x, y, 90, 0) || (inClear(x, y, 90) && !(Math.hypot(x - W.start.x, y - W.start.y) < 600))) continue;
      push({ kind: 'tent', x, y, r: 30, hgt: 80, hw: 50, v: Math.floor(R(0, 2)), s: 1 });
      push({ kind: 'fire', x: x + 62, y: y + 14, r: 11, hgt: 50, hw: 30, s: 1 });
      push({ kind: 'line', x: x - 70, y: y + 30, r: 6, hgt: 70, hw: 50, s: 1 });
      push({ kind: 'col', x: x - 10, y: y + 30, r: 6, low: true });
      addLog(x + 62, y - 28, -0.3, 0, 0.85);
      addLog(x + 44, y + 48, 0.25, 1, 0.85);
      W.camps.push({ x, y });
      W.clear.push({ x, y, r: 80 });
      done = true;
    }
  }

  // 木: まず森の塊(グローブ)、次に点在する木、最後にマップ外周の木の壁
  // 地域で木の種類が変わる: 川や池のそばは柳、山ぎわは針葉樹、それ以外は広葉樹
  const nearWaterFor = (x, y, d) => waterNear(x, y, d);
  const mountainsNear = (x, y) => y < 420 || W.obstacles.some((o) => o.kind === 'mountain' && Math.hypot(o.x - x, o.y - y) < 420);
  const addTree = (x, y, s, gap, wm, forceKind) => {
    let kind = forceKind;
    if (!kind) {
      const q = rng();
      if (nearWaterFor(x, y, 150)) kind = q < 0.55 ? 'willow' : q < 0.85 ? 'tree' : 'pine';
      else if (mountainsNear(x, y)) kind = q < 0.72 ? 'pine' : 'tree';
      else kind = q < 0.22 ? 'pine' : q < 0.27 ? 'dead' : 'tree';
    }
    const pine = kind === 'pine';
    const o = {
      kind, x, y, s,
      r: (pine ? 11 : kind === 'dead' ? 10 : 13) * s, hgt: (pine ? 125 : kind === 'willow' ? 150 : kind === 'dead' ? 120 : 135) * s, hw: (kind === 'willow' ? 70 : 58) * s,
      v: pine ? Math.floor(R(0, 2)) : kind === 'willow' ? Math.floor(R(0, 2)) : kind === 'dead' ? 0 : (() => { const q = rng(); return q < 0.5 ? 0 : q < 0.78 ? 1 : q < 0.93 ? 2 : 3; })(),
    };
    const p = place(o, gap, wm);
    if (p) W.trees.push(p);
    return p;
  };
  // 大木のまわりに 若木が集まる
  const addGrove = (gx, gy, rad, cnt) => {
    const big = addTree(gx, gy, R(1.3, 1.5), 30, 30);
    for (let i = 0; i < cnt; i++) {
      const a = R(0, TAU);
      const d = Math.sqrt(rng()) * rad;
      const sz = d < rad * 0.4 ? R(0.95, 1.15) : R(0.65, 0.95);
      addTree(gx + Math.cos(a) * d, gy + Math.sin(a) * d, sz, 22, 26);
    }
    return big;
  };
  for (let g = 0; g < 30; g++) addGrove(R(250, S - 250), R(250, S - 250), R(150, 330), Math.floor(R(12, 28)));
  for (let i = 0; i < 700; i++) addTree(R(100, S - 100), R(100, S - 100), R(0.7, 1.05), 40, 30);
  // 川沿いの柳と葦
  for (const river of W.rivers) {
    for (let i = 6; i < river.path.length - 6; i += 9) {
      const pt = river.path[i]; const q = river.path[i + 3];
      const a = Math.atan2(q.y - pt.y, q.x - pt.x) + Math.PI / 2;
      const side = rng() < 0.5 ? -1 : 1;
      const off = river.w / 2 + R(40, 90);
      addTree(pt.x + Math.cos(a) * off * side, pt.y + Math.sin(a) * off * side, R(0.9, 1.25), 26, 24, rng() < 0.7 ? 'willow' : 'tree');
    }
  }
  for (let t = 40; t < S - 40; t += 52) {
    for (const inset of [34, 92]) {
      addTree(t + R(-10, 10), inset + R(-8, 8), R(1.0, 1.2), 14, 20);
      addTree(t + R(-10, 10), S - inset + R(-8, 8), R(1.0, 1.2), 14, 20);
      addTree(inset + R(-8, 8), t + R(-10, 10), R(1.0, 1.2), 14, 20);
      addTree(S - inset + R(-8, 8), t + R(-10, 10), R(1.0, 1.2), 14, 20);
    }
  }

  // 低木・岩・切り株・丸太
  for (let i = 0; i < 420; i++) place({ kind: 'bush', x: R(100, S - 100), y: R(100, S - 100), r: 17, s: R(0.9, 1.3), hgt: 50, hw: 36, v: Math.floor(R(0, 3)) }, 6, 24);
  for (let i = 0; i < 420; i++) {
    const r = R(13, 27);
    place({ kind: 'rock', x: R(100, S - 100), y: R(100, S - 100), r, s: r / 26, hgt: r * 2.6, hw: r * 1.4, v: Math.floor(R(0, 3)), moss: rng() < 0.5 }, 6, 14);
  }
  for (let i = 0; i < 220; i++) place({ kind: 'stump', x: R(100, S - 100), y: R(100, S - 100), r: 11, s: R(0.9, 1.2), hgt: 34, hw: 24, v: 0 }, 6, 20);
  for (let i = 0; i < 120; i++) {
    const x = R(150, S - 150);
    const y = R(150, S - 150);
    const ang = R(-0.6, 0.6);
    if (waterNear(x, y, 60) || inClear(x, y, 40) || tooClose(x, y, 40, 6)) continue;
    addLog(x, y, ang, Math.floor(R(0, 2)), 1.1);
  }

  // ---- 土の小道(見た目だけ。歩きやすさは変わらない) ----
  W.paths = [];
  const trailDefs = [
    [[W.start.x, W.start.y], [1250, 2480], [1550, 2300], [1850, 2450]],
    [[700, 760], [1050, 900], [1500, 1150], [1900, 1500]],
    [[3000, 1700], [2700, 2000], [2500, 2400], [2450, 2900]],
    [[2600, 600], [2900, 900], [3100, 1300]],
  ];
  for (const pts of trailDefs) {
    const wig = pts.map(([x, y], i) => (i === 0 || i === pts.length - 1 ? [x, y] : [x + R(-60, 60), y + R(-60, 60)]));
    const path = catmullRom(wig, 18).filter((p) => W.tileAt(p.x, p.y) !== T_WATER);
    W.paths.push({ path, w: R(26, 40) });
  }

  // ---- 飾り(当たり判定なし): 草の房・花・小石・葦 ----
  const addDecor = (kind, x, y, v, extra) => {
    const d = Object.assign({ kind, x, y, v }, extra || {});
    W.decor.insert(d, 4);
    return d;
  };
  for (let i = 0; i < 3200; i++) {
    const x = R(40, S - 40);
    const y = R(40, S - 40);
    if (W.tileAt(x, y) === T_WATER) continue;
    addDecor('tuft', x, y, Math.floor(R(0, 4)));
  }
  for (let i = 0; i < 1300; i++) {
    const x = R(40, S - 40);
    const y = R(40, S - 40);
    if (W.tileAt(x, y) !== T_LAND) continue;
    addDecor('flower', x, y, Math.floor(R(0, 5)));
  }
  for (let i = 0; i < 360; i++) {
    const x = R(40, S - 40);
    const y = R(40, S - 40);
    if (W.tileAt(x, y) !== T_LAND) continue;
    addDecor('pebble', x, y, Math.floor(R(0, 3)));
  }
  // 川岸の石と砂
  for (const river of W.rivers) {
    for (let i = 2; i < river.path.length - 2; i += 2) {
      const pt = river.path[i]; const q = river.path[i + 2];
      const a = Math.atan2(q.y - pt.y, q.x - pt.x) + Math.PI / 2;
      for (const side of [-1, 1]) {
        if (rng() < 0.45) continue;
        const off = river.w / 2 + R(4, 16);
        const x = pt.x + Math.cos(a) * off * side; const y = pt.y + Math.sin(a) * off * side;
        if (W.tileAt(x, y) === T_LAND) addDecor(rng() < 0.6 ? 'pebble' : 'bankstone', x, y, Math.floor(R(0, 3)));
      }
    }
  }
  for (const pd of W.ponds) for (let i = 0; i < 10; i++) { const a = R(0, TAU); const x = pd.x + Math.cos(a) * (pd.rx + R(4, 14)); const y = pd.y + Math.sin(a) * (pd.ry + R(4, 14)); if (W.tileAt(x, y) === T_LAND) addDecor('bankstone', x, y, Math.floor(R(0, 3))); }
  // 木の根もと: シダ・おちば・小さなキノコ
  for (const t of W.trees) {
    if (rng() < 0.45) { const a = R(0.2, Math.PI - 0.2); addDecor('fern', t.x + Math.cos(a) * R(24, 40) * t.s, t.y + Math.sin(a) * R(10, 22) * t.s + 4, Math.floor(R(0, 2))); }
    if (rng() < 0.5) for (let k = 0; k < 3; k++) { const a = R(0, TAU); const d = R(14, 60) * t.s; const x = t.x + Math.cos(a) * d; const y = t.y + Math.sin(a) * d * 0.6 + 6; if (W.tileAt(x, y) === T_LAND) addDecor('leaf', x, y, t.v === 3 ? Math.floor(R(0, 3)) : Math.floor(R(2, 4)), { rot: R(0, TAU) }); }
    if (rng() < 0.12) addDecor('shroomlet', t.x + R(-30, 30), t.y + R(6, 18), Math.floor(R(0, 2)));
  }
  for (let i = 0; i < 500; i++) { const x = R(40, S - 40); const y = R(40, S - 40); if (W.tileAt(x, y) === T_LAND) addDecor('leaf', x, y, Math.floor(R(0, 4)), { rot: R(0, TAU) }); }
  for (let i = 0; i < 300; i++) { const x = R(40, S - 40); const y = R(40, S - 40); if (W.tileAt(x, y) === T_LAND) addDecor('fern', x, y, Math.floor(R(0, 2))); }
  // 土が見えているところ・クローバーのような濃い草地
  for (let i = 0; i < 160; i++) { const rr2 = R(40, 120); addDecor('dirt', R(0, S), R(0, S), 0, { rx: rr2, ry: rr2 * R(0.5, 0.7) }); }
  // 地面の濃淡(大きなぼかし円)
  for (let i = 0; i < 420; i++) {
    const rr = R(90, 260);
    addDecor('blob', R(0, S), R(0, S), Math.floor(R(0, 3)), { rx: rr, ry: rr * R(0.5, 0.8) });
  }
  // 川岸の葦
  for (const river of W.rivers) {
    for (let i = 3; i < river.path.length - 3; i += 3) {
      const p = river.path[i];
      const q = river.path[i + 2];
      const a = Math.atan2(q.y - p.y, q.x - p.x) + Math.PI / 2;
      const side = rng() < 0.5 ? -1 : 1;
      const off = river.w / 2 + R(6, 22);
      const x = p.x + Math.cos(a) * off * side;
      const y = p.y + Math.sin(a) * off * side;
      if (W.tileAt(x, y) !== T_LAND || rng() < 0.35) continue;
      addDecor('reed', x, y, Math.floor(R(0, 2)));
    }
  }
  // 池のふちの葦とスイレン
  for (const p of W.ponds) {
    for (let i = 0; i < 14; i++) {
      const a = R(0, TAU);
      const x = p.x + Math.cos(a) * (p.rx + R(2, 18));
      const y = p.y + Math.sin(a) * (p.ry + R(2, 18));
      if (W.tileAt(x, y) === T_LAND) addDecor('reed', x, y, Math.floor(R(0, 2)));
    }
    p.pads = [];
    for (let i = 0; i < 9; i++) {
      const a = R(0, TAU);
      const d = Math.sqrt(rng()) * 0.78;
      p.pads.push({ x: p.x + Math.cos(a) * p.rx * d, y: p.y + Math.sin(a) * p.ry * d, r: R(9, 15), flower: rng() < 0.4 });
    }
  }

  // ---- 草むら(背の高い草。キノコが隠れる) ----
  for (let tries = 0; tries < 400 && W.patches.length < 72; tries++) {
    const r = R(55, 105);
    const x = R(150, S - 150);
    const y = R(150, S - 150);
    if (waterNear(x, y, r + 20) || inClear(x, y, r * 0.6)) continue;
    if (W.patches.some((q) => Math.hypot(q.x - x, q.y - y) < q.r + r + 60)) continue;
    const blades = [];
    const n = Math.floor((r * r) / 85);
    for (let i = 0; i < n; i++) {
      const a = R(0, TAU);
      const d = Math.sqrt(rng()) * r;
      blades.push({ dx: Math.cos(a) * d, dy: Math.sin(a) * d * 0.8, h: R(15, 30), w: R(3, 5.2), ph: R(0, TAU), c: Math.floor(R(0, 3)) });
    }
    blades.sort((p, q) => p.dy - q.dy);
    W.patches.push({ x, y, r, blades });
  }
  W.patchAt = (x, y) => {
    for (const p of W.patches) {
      const dx = x - p.x;
      const dy = (y - p.y) / 0.8;
      if (dx * dx + dy * dy < (p.r * 0.85) * (p.r * 0.85)) return p;
    }
    return null;
  };

  // ---- 歩ける範囲(スタート地点から到達できる場所)を調べる ----
  const blocked = new Uint8Array(N * N);
  for (let i = 0; i < N * N; i++) blocked[i] = tiles[i] === T_WATER ? 1 : 0;
  for (let ty = 0; ty < N; ty++) {
    for (let tx = 0; tx < N; tx++) {
      if (tx < 3 || ty < 3 || tx >= N - 3 || ty >= N - 3) blocked[ty * N + tx] = 1;
    }
  }
  for (const o of W.obstacles) {
    if (o.r > 0) {
      const rr = o.r + 12;
      forTiles(o.x - rr, o.y - rr, o.x + rr, o.y + rr, (tx, ty) => {
        const dx = (tx + 0.5) * TS - o.x;
        const dy = (ty + 0.5) * TS - o.y;
        if (dx * dx + dy * dy <= rr * rr) blocked[ty * N + tx] = 1;
      });
    }
  }
  W.blocked = blocked;
  W.reach = floodFill(blocked, N, N, Math.floor(W.start.x / TS), Math.floor(W.start.y / TS));
  const spots = [];
  for (let i = 0; i < N * N; i++) if (W.reach[i]) spots.push(i);
  W.spots = Int32Array.from(spots);

  // 到達可能な場所をランダムに選ぶ。cond(x,y) が true を返す場所だけ
  // 水ぎわすれすれは避ける(敵や動物が水と重なって動けなくならないように margin だけ離す)
  W.randomSpot = (rand, cond, margin) => {
    const m = margin === undefined ? 26 : margin;
    for (let tries = 0; tries < 80; tries++) {
      const i = W.spots[Math.floor(rand() * W.spots.length)];
      const x = ((i % N) + rand()) * TS;
      const y = (Math.floor(i / N) + rand()) * TS;
      if (W.waterBlocked(x, y, m)) continue;
      if (!cond || cond(x, y)) return { x, y };
    }
    return null;
  };
  // 歩ける場所で、半径 r の体が水にかからないか
  W.isOpen = (x, y, r) => W.isReachable(x, y) && !W.waterBlocked(x, y, r);
  W.isReachable = (x, y) => {
    const tx = Math.floor(x / TS);
    const ty = Math.floor(y / TS);
    return inGrid(tx, ty) && W.reach[ty * N + tx] === 1;
  };
  return W;
}

if (typeof module !== 'undefined' && module.exports) module.exports = { buildWorld };
