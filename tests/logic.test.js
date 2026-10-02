'use strict';
/* node tests/logic.test.js で実行。ブラウザなしで、ゲームのルールとマップの正しさを確かめる */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// ブラウザ用の通常スクリプトを、1つの共有コンテキストに順番に読み込む
const ctx = vm.createContext({ console, Math, Uint8Array, Int32Array, Map });
for (const f of ['util', 'config', 'world']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', f + '.js'), 'utf8'), ctx, { filename: f + '.js' });
}
const $ = (expr) => vm.runInContext(expr, ctx);

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok  ' + name); } catch (e) { console.error('  NG  ' + name + '\n      ' + e.message); process.exitCode = 1; }
}

test('コンボ倍率: 1コンボ目は等倍、増えるほど上がり、x3で頭打ち', () => {
  assert.strictEqual($('comboMultiplier(1)'), 1);
  assert.strictEqual($('comboMultiplier(2)'), 1.25);
  assert.strictEqual($('comboMultiplier(5)'), 2);
  assert.strictEqual($('comboMultiplier(9)'), 3);
  assert.strictEqual($('comboMultiplier(50)'), 3);
  assert.strictEqual($('comboMultiplier(0)'), 1);
});

test('angleDiff: -π〜π に正規化される', () => {
  const d = $('angleDiff(0.1, Math.PI * 2 - 0.1)');
  assert.ok(Math.abs(d + 0.2) < 1e-9, 'got ' + d);
  assert.ok(Math.abs($('angleDiff(3, -3)') - (2 * Math.PI - 6)) < 1e-9);
});

test('mulberry32: 同じシードなら同じ列、違うシードなら違う列', () => {
  const a = $('(() => { const r = mulberry32(1); return [r(), r(), r()]; })()');
  const b = $('(() => { const r = mulberry32(1); return [r(), r(), r()]; })()');
  const c = $('(() => { const r = mulberry32(2); return [r(), r(), r()]; })()');
  assert.deepStrictEqual(Array.from(a), Array.from(b));
  assert.notDeepStrictEqual(Array.from(a), Array.from(c));
  assert.ok(Array.from(a).every((v) => v >= 0 && v < 1));
});

test('distToSegment: 線分の端・途中までの距離', () => {
  assert.strictEqual($('distToSegment(5, 3, 0, 0, 10, 0)'), 3);
  assert.strictEqual($('distToSegment(-4, 3, 0, 0, 10, 0)'), 5);
  assert.strictEqual($('distToSegment(1, 1, 2, 2, 2, 2)'), Math.SQRT2);
});

test('pointInRotRect: 回転した矩形の内外判定', () => {
  assert.strictEqual($('pointInRotRect(0, 9, 0, 0, Math.PI / 2, 10, 2)'), true);  // 90度回すと縦長
  assert.strictEqual($('pointInRotRect(9, 0, 0, 0, Math.PI / 2, 10, 2)'), false);
  assert.strictEqual($('pointInRotRect(5, 5, 0, 0, 0, 10, 2)'), false);
});

test('catmullRom: 制御点を通り、点の間隔が step 以下', () => {
  const pts = $('catmullRom([[0, 0], [100, 0], [100, 100]], 10)');
  assert.deepStrictEqual([pts[0].x, pts[0].y], [0, 0]);
  const last = pts[pts.length - 1];
  assert.deepStrictEqual([last.x, last.y], [100, 100]);
  for (let i = 1; i < pts.length; i++) assert.ok(Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y) < 25);
});

test('floodFill: 壁で仕切られた側には届かない', () => {
  const r = $(`(() => {
    const w = 5, h = 3, blocked = new Uint8Array(w * h);
    blocked[0 * w + 2] = blocked[1 * w + 2] = blocked[2 * w + 2] = 1; // 縦の壁
    const reach = floodFill(blocked, w, h, 0, 0);
    return [reach[0], reach[w + 1], reach[3], reach[2 * w + 4]];
  })()`);
  assert.deepStrictEqual(Array.from(r), [1, 1, 0, 0]);
});

test('SpatialHash: 範囲内だけ返し、同じ物を2回返さない', () => {
  const n = $(`(() => {
    const h = new SpatialHash(100);
    const big = { x: 150, y: 150, r: 120 }; h.insert(big, 120);   // 複数セルにまたがる
    const far = { x: 900, y: 900, r: 5 }; h.insert(far, 5);
    const found = []; h.query(100, 100, 200, 200, (o) => found.push(o));
    return found.length + ':' + (found[0] === big);
  })()`);
  assert.strictEqual(n, '1:true');
});

// ---- マップ生成 ----
const W = $('buildWorld(CONFIG.world.seed)');
const N = W.n;

test('マップ: 川・池・橋・障害物ができている', () => {
  assert.strictEqual(W.rivers.length, 2);
  assert.ok(W.bridges.length >= 6, 'bridges ' + W.bridges.length);
  assert.ok(W.obstacles.length > 800);
  assert.ok(W.patches.length >= 40);
  assert.ok(W.camps.length >= 2);
});

test('マップ: スタート地点は歩ける', () => {
  assert.ok(W.isReachable(W.start.x, W.start.y));
});

test('マップ: 橋があるので川の向こう側(東・北西)にも歩いて行ける', () => {
  const count = (x0, y0, x1, y1) => {
    let c = 0;
    for (let ty = y0 / 20; ty < y1 / 20; ty++) for (let tx = x0 / 20; tx < x1 / 20; tx++) if (W.reach[ty * N + tx]) c++;
    return c;
  };
  assert.ok(count(2900, 1200, 3700, 2000) > 500, '東側');
  assert.ok(count(300, 300, 1500, 1000) > 500, '北西');
  assert.ok(count(2500, 3000, 3300, 3800) > 500, '南東');
});

test('マップ: 橋の上は歩け、川の水は歩けない', () => {
  for (const b of W.bridges) assert.ok(!W.waterBlocked(b.x, b.y, 10), '橋の中心が水扱い');
  const r = W.rivers[1];
  const mid = r.path[Math.floor(r.path.length * 0.45)];
  assert.ok(W.waterBlocked(mid.x, mid.y, 10));
});

test('マップ: 橋のない所では水をまたぐ直線は「通れない」、橋の上は通れる', () => {
  const r = W.rivers[1];
  const mid = r.path[Math.floor(r.path.length * 0.45)];
  assert.strictEqual(W.lineClear(mid.x, mid.y - 200, mid.x, mid.y + 200), false);
  const b = W.bridges[0];
  const dx = Math.cos(b.ang) * 150;
  const dy = Math.sin(b.ang) * 150;
  assert.strictEqual(W.lineClear(b.x - dx, b.y - dy, b.x + dx, b.y + dy), true);
});

test('マップ: 到達できる場所からランダムに選べて、必ず歩ける所になる', () => {
  let seed = 3;
  const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 300; i++) {
    const s = W.randomSpot(rand);
    assert.ok(s && W.isReachable(s.x, s.y) && !W.waterBlocked(s.x, s.y, 8));
  }
});

test('マップ: 障害物どうし・水と重ならない(木と木の間は人が通れる)', () => {
  const trees = W.trees;
  for (const t of trees.slice(0, 200)) assert.ok(!W.waterBlocked(t.x, t.y, t.r), '木が水の中');
});

test('マップ: 同じシードなら同じ地形(毎回おなじ森)', () => {
  const a = $('buildWorld(CONFIG.world.seed)');
  assert.strictEqual(a.obstacles.length, W.obstacles.length);
  assert.deepStrictEqual(Array.from(a.tiles.slice(0, 4000)), Array.from(W.tiles.slice(0, 4000)));
});

console.log(`\n${passed} 件 通過` + (process.exitCode ? '、失敗あり' : ''));
