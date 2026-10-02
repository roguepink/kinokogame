'use strict';
/* ゲームの中身: プレイヤー・インク弾・敵・動物・キノコの更新処理 */

const rr = (a, b) => a + Math.random() * (b - a);
const LOW_KINDS = { bush: 1, stump: 1, log: 1, fire: 1 }; // インクが飛び越える低い障害物

// ---------- 当たり判定つきの移動 ----------
// 水と障害物(木・岩・山…)にぶつかる。戻り値: { hit: ぶつかった障害物, water: 水にぶつかった }
function moveBody(e, dx, dy, r, noObs) {
  const W = G.world;
  const ox = e.x;
  const oy = e.y;
  let water = false;
  const nx = e.x + dx;
  if (!W.waterBlocked(nx, e.y, r)) e.x = nx; else if (dx !== 0) water = true;
  const ny = e.y + dy;
  if (!W.waterBlocked(e.x, ny, r)) e.y = ny; else if (dy !== 0) water = true;
  const lim = W.size - r - 30;
  e.x = clamp(e.x, r + 30, lim);
  e.y = clamp(e.y, r + 30, lim);
  let hit = null;
  if (!noObs) {
    W.hash.query(e.x - r - 6, e.y - r - 6, e.x + r + 6, e.y + r + 6, (o) => {
      const ddx = e.x - o.x;
      const ddy = e.y - o.y;
      const min = r + o.r;
      const d2 = ddx * ddx + ddy * ddy;
      if (d2 < min * min) {
        const d = Math.sqrt(d2) || 0.001;
        const k = (min - d) / d;
        e.x += ddx * k; e.y += ddy * k;
        hit = o;
      }
    });
    if (hit && W.waterBlocked(e.x, e.y, r)) { e.x = ox; e.y = oy; }
  }
  return { hit, water };
}

// ---------- パーティクル・文字・インクの跡 ----------
function addParticle(p) {
  if (G.particles.length < 800) G.particles.push(p);
}
// shape: dot / spark / ring / bubble / heart / dust / ink / streak / leaf
function burst(x, y, n, o) {
  for (let i = 0; i < n; i++) {
    const a = o.dir !== undefined ? o.dir + (Math.random() - 0.5) * (o.spread || 1) : Math.random() * TAU;
    const sp = rr(o.s0 || 20, o.s1 || 80);
    const life = rr(o.l0 || 0.4, o.l1 || 0.8);
    addParticle({
      x: x + (o.jx ? rr(-o.jx, o.jx) : 0), y: y + (o.jy ? rr(-o.jy, o.jy) : 0),
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, ay: o.ay || 0, drag: o.drag || 0,
      life, max: life, size: rr(o.z0 || 2, o.z1 || 4), grow: o.grow || 0,
      color: Array.isArray(o.color) ? o.color[Math.floor(Math.random() * o.color.length)] : (o.color || '#fff'),
      shape: o.shape || 'dot', rot: Math.random() * TAU, vr: rr(-6, 6),
    });
  }
}
function ring(x, y, r0, r1, life, color, width) {
  addParticle({ x, y, vx: 0, vy: 0, ay: 0, drag: 0, life, max: life, size: r0, grow: (r1 - r0) / life, color, shape: 'ring', width: width || 4, rot: 0, vr: 0 });
}
function floatText(x, y, text, color, size) {
  G.texts.push({ x, y, text, color: color || '#fff', size: size || 20, life: 1.1, max: 1.1, vy: -42 });
}
function addDecal(x, y, size, type, life) {
  const d = { x, y, s: size, v: Math.floor(Math.random() * 6), rot: Math.random() * TAU, t: 0, max: life || 14, type: type || 'splat' };
  G.decals[G.decalHead] = d;
  G.decalHead = (G.decalHead + 1) % G.decals.length;
}

// ---------- 作る ----------
function makePlayer() {
  const W = G.world;
  return {
    kind: 'player', x: W.start.x, y: W.start.y, vx: 0, vy: 0, kx: 0, ky: 0,
    r: CONFIG.player.r, hp: CONFIG.player.maxHp, aim: 0.4, walkT: 0, moving: false, firing: false,
    recoil: 0, hurtT: 0, invuln: 0, slowT: 0, boostT: 0, fireCd: 0, trailT: 0, face: 1,
  };
}
function makeMushroom(type, x, y, big) {
  const W = G.world;
  const patch = W.patchAt(x, y);
  const hp = big ? CONFIG.mushroom.bigHp : CONFIG.mushroom.hp;
  return {
    kind: 'mushroom', type, x, y, v: Math.random() < 0.5 ? 0 : 1, big: !!big, size: big ? 1.6 : 1,
    hp: type === 'poison' ? hp : 1, maxHp: type === 'poison' ? hp : 1, hr: (big ? 30 : 19),
    hidden: type === 'poison' && !!patch, inPatch: !!patch, wob: 0, t: Math.random() * 10, bubT: rr(0, 1), pop: 0, dead: false, hitT: 0,
  };
}
function makeCritter(type) {
  return { kind: 'critter', type, x: 0, y: 0, face: 1, t: Math.random() * 9, hopU: 0, hopping: false, hopDur: 0.34, hopSpeed: 0, dx: 1, dy: 0, rest: rr(0.2, 1.5), bump: 0, gone: false, respawn: 0, fear: false, y0: 0 };
}
function makeEnemy(type, x, y) {
  const def = CONFIG.enemies[type];
  return {
    kind: 'enemy', type, def, x, y, hp: def.hp, maxHp: def.hp, state: 'wander', st: 0, t: Math.random() * 9,
    face: Math.random() < 0.5 ? 1 : -1, homeX: x, homeY: y, tx: x, ty: y, wanderT: 0, idle: rr(0.3, 2), avoidT: 0, avoidSide: 1,
    stuckT: 0, cool: 1, slow: 0, flash: 0, kx: 0, ky: 0, dur: 1, atk: '', aim: 0, moving: false, z: 0, hitDone: false,
    senseT: rr(0, 0.3), loseT: 0, seen: false, cvx: 0, cvy: 0, sx: 0, sy: 0, ex: 0, ey: 0,
  };
}

// ---------- 場所さがし ----------
const farFromPlayer = (x, y, d) => Math.hypot(x - G.player.x, y - G.player.y) >= d;
function nearAnyMushroom(x, y, d) {
  for (const m of G.mushrooms) if (!m.dead && Math.hypot(m.x - x, m.y - y) < d) return true;
  return false;
}

function spawnPoisonCluster(opts) {
  const W = G.world;
  const o = opts || {};
  let cx;
  let cy;
  let spread = 95;
  const ps = G.player;
  if (o.near) {
    // 最初の群れはスタート付近(画面のすぐ外)に置く
    const a = rr(-0.6, 0.6) + (Math.random() < 0.5 ? 0 : Math.PI);
    const d = rr(380, 470);
    cx = ps.x + Math.cos(a) * d;
    cy = ps.y + Math.sin(a) * d;
    if (!W.isOpen(cx, cy, 30)) { cx = ps.x + 400; cy = ps.y - 60; }
  } else if (Math.random() < 0.35 && W.patches.length) {
    // 草むらに隠れた群れ
    const cand = W.patches.filter((p) => W.isOpen(p.x, p.y, 30) && farFromPlayer(p.x, p.y, 750));
    if (cand.length) {
      const p = cand[Math.floor(Math.random() * cand.length)];
      cx = p.x; cy = p.y; spread = p.r * 0.7;
    }
  }
  if (cx === undefined) {
    const s = W.randomSpot(Math.random, (x, y) => farFromPlayer(x, y, 750) && !nearAnyMushroom(x, y, 200));
    if (!s) return 0;
    cx = s.x; cy = s.y;
  }
  const n = Math.floor(rr(3, 7));
  let made = 0;
  for (let i = 0; i < n * 4 && made < n; i++) {
    const a = Math.random() * TAU;
    const d = Math.sqrt(Math.random()) * spread;
    const x = cx + Math.cos(a) * d;
    const y = cy + Math.sin(a) * d * 0.8;
    if (!W.isOpen(x, y, 20) || nearAnyMushroom(x, y, 34)) continue;
    G.mushrooms.push(makeMushroom('poison', x, y, made === 0 && Math.random() < 0.18));
    made++;
  }
  return made;
}
function spawnGoodMushroom() {
  const W = G.world;
  for (let tries = 0; tries < 30; tries++) {
    const t = W.trees[Math.floor(Math.random() * W.trees.length)];
    if (!t) return;
    const a = rr(0.3, Math.PI - 0.3); // 木の根もと(手前側)に生える
    const d = rr(28, 52) * t.s;
    const x = t.x + Math.cos(a) * d;
    const y = t.y + Math.sin(a) * d;
    if (!W.isOpen(x, y, 20) || !farFromPlayer(x, y, 320) || nearAnyMushroom(x, y, 60)) continue;
    G.mushrooms.push(makeMushroom('good', x, y, false));
    return;
  }
}
function placeCritter(c, minDist) {
  const s = G.world.randomSpot(Math.random, (x, y) => farFromPlayer(x, y, minDist || 450));
  if (s) { c.x = s.x; c.y = s.y; }
  c.gone = false; c.hopping = false; c.hopU = 0; c.rest = rr(0.3, 1.5);
}
function pickEnemyType() {
  const cnt = { boar: 0, bear: 0, gorilla: 0 };
  for (const e of G.enemies) cnt[e.type]++;
  const order = ['gorilla', 'bear', 'boar'];
  order.sort((a, b) => cnt[a] - cnt[b] || Math.random() - 0.5);
  return order[0];
}
function spawnEnemy(far) {
  const W = G.world;
  const lo = far ? 700 : 600;
  const s = W.randomSpot(Math.random, (x, y) => {
    const d = Math.hypot(x - G.player.x, y - G.player.y);
    return d >= lo && d <= (far ? 4000 : 1300);
  });
  if (!s) return null;
  const e = makeEnemy(pickEnemyType(), s.x, s.y);
  G.enemies.push(e);
  return e;
}
function respawnEnemy(e) {
  const W = G.world;
  const s = W.randomSpot(Math.random, (x, y) => Math.hypot(x - G.player.x, y - G.player.y) >= 800);
  if (s) { e.x = s.x; e.y = s.y; e.homeX = s.x; e.homeY = s.y; }
  e.hp = e.maxHp; e.state = 'wander'; e.st = 0; e.cool = 3; e.z = 0; e.slow = 0; e.idle = 1;
}

// ゲーム開始時の状態をつくる
function resetGame() {
  G.player = makePlayer();
  G.enemies = []; G.critters = []; G.mushrooms = []; G.proj = [];
  G.particles = []; G.texts = [];
  G.decals = new Array(520).fill(null); G.decalHead = 0;
  G.t = 0; G.timeLeft = CONFIG.timeLimit;
  G.score = 0; G.combo = 0; G.comboT = 0; G.comboMult = 1;
  G.stats = { purified: 0, eaten: 0, boosts: 0, inked: 0, poisoned: 0, bestCombo: 0 };
  G.shownHints = {}; G.flashRed = 0; G.alertCd = 0; G.mushT = 0; G.over = null; G.fullHintT = 0;
  G.cam.shake = 0;
  // 毒キノコの群れ。最初の1つはスタートの近く
  spawnPoisonCluster({ near: true });
  let guard = 0;
  while (G.mushrooms.filter((m) => m.type === 'poison').length < CONFIG.mushroom.poisonTarget && guard++ < 40) spawnPoisonCluster();
  guard = 0;
  while (G.mushrooms.length - G.mushrooms.filter((m) => m.type === 'poison').length < CONFIG.mushroom.goodTarget && guard++ < 80) spawnGoodMushroom();
  for (let i = 0; i < CONFIG.critter.count; i++) { const c = makeCritter('rabbit'); placeCritter(c, 300); G.critters.push(c); }
  for (let i = 0; i < CONFIG.critter.count; i++) { const c = makeCritter('squirrel'); placeCritter(c, 300); G.critters.push(c); }
  // スタート近くにうさぎを1匹
  const near = G.critters[0];
  const sp = G.world.randomSpot(Math.random, (x, y) => Math.hypot(x - G.player.x, y - G.player.y) < 260 && Math.hypot(x - G.player.x, y - G.player.y) > 140);
  if (sp) { near.x = sp.x; near.y = sp.y; }
  for (let i = 0; i < CONFIG.director.start; i++) spawnEnemy(true);
}

// ---------- スコア ----------
function addScore(pts, x, y, color) {
  G.score += pts;
  floatText(x, y, '+' + pts, color || '#fff6a8', 22);
}

function hurtPlayer(dmg, sx, sy, kb) {
  const P = G.player;
  if (P.invuln > 0 || G.state !== 'playing') return false;
  P.hp = Math.max(0, P.hp - dmg);
  P.invuln = CONFIG.player.invuln;
  P.hurtT = 0.5;
  const a = Math.atan2(P.y - sy, P.x - sx);
  P.kx = Math.cos(a) * kb; P.ky = Math.sin(a) * kb;
  G.cam.shake = Math.max(G.cam.shake, 10);
  G.flashRed = 0.4;
  G.combo = 0; G.comboT = 0;
  floatText(P.x, P.y - 56, '-' + dmg, '#ff5a5a', 26);
  burst(P.x, P.y - 22, 10, { s0: 60, s1: 170, l0: 0.25, l1: 0.5, z0: 2, z1: 4.5, color: ['#fff', '#ffd24d', '#ff7a5a'], shape: 'spark' });
  Sound.sfx.hurt();
  if (P.hp <= 0) endGame('down');
  return true;
}

// ---------- プレイヤー ----------
function updatePlayer(dt) {
  const P = G.player;
  const C = CONFIG.player;
  const playing = G.state === 'playing';
  if (P.invuln > 0) P.invuln -= dt;
  if (P.hurtT > 0) P.hurtT -= dt;
  if (P.slowT > 0) P.slowT -= dt;
  if (P.boostT > 0) P.boostT -= dt;
  if (P.recoil > 0) P.recoil = Math.max(0, P.recoil - dt * 8);
  if (P.fireCd > 0) P.fireCd -= dt;

  let mv = playing ? Input.move() : { x: 0, y: 0 };
  let speed = C.speed * (P.slowT > 0 ? C.slowMul : 1) * (P.boostT > 0 ? C.boostMul : 1);
  const tx = mv.x * speed;
  const ty = mv.y * speed;
  P.vx = approach(P.vx, tx, C.accel * dt);
  P.vy = approach(P.vy, ty, C.accel * dt);
  const sp = Math.hypot(P.vx, P.vy);
  P.moving = sp > 24;
  if (P.moving) P.walkT += dt * (7 + sp * 0.045);
  let dx = P.vx * dt;
  let dy = P.vy * dt;
  if (Math.abs(P.kx) + Math.abs(P.ky) > 3) {
    dx += P.kx * dt; dy += P.ky * dt;
    const f = Math.exp(-9 * dt);
    P.kx *= f; P.ky *= f;
  } else { P.kx = 0; P.ky = 0; }
  moveBody(P, dx, dy, P.r);
  if (G.world.waterBlocked(P.x, P.y, P.r)) { // 念のため: 水と重なっていたら歩ける所へ戻す
    P.trapT = (P.trapT || 0) + dt;
    if (P.trapT > 0.5) { const s = G.world.randomSpot(Math.random, (x, y) => Math.hypot(x - P.x, y - P.y) < 400); if (s) { P.x = s.x; P.y = s.y; } P.trapT = 0; }
  } else P.trapT = 0;

  // ねらい
  const view = G.view;
  const psx = (P.x - view.left) * view.zoom;
  const psy = (P.y - 21 - view.top) * view.zoom;
  const moveAngle = (mv.x !== 0 || mv.y !== 0) ? Math.atan2(mv.y, mv.x) : null;
  const a = playing ? Input.aim(psx, psy, moveAngle) : { angle: P.aim, fire: false, touch: false };
  P.aim = a.angle;
  P.face = Math.cos(P.aim) >= 0 ? 1 : -1;
  P.firing = a.fire && playing;
  if (P.firing && P.fireCd <= 0) {
    shoot(P, a.touch || !Input.isTouch() ? assistAim(P.aim, a.touch) : P.aim);
    P.fireCd = 1 / CONFIG.gun.rate;
  }
  // ブースト中のスピード線
  if (P.boostT > 0 && P.moving && Math.random() < dt * 40) {
    addParticle({ x: P.x - P.vx * 0.05 + rr(-8, 8), y: P.y - rr(4, 30), vx: -P.vx * 0.25, vy: 0, ay: 0, drag: 0, life: 0.28, max: 0.28, size: rr(10, 18), color: 'rgba(255,240,150,0.85)', shape: 'streak', rot: Math.atan2(P.vy, P.vx), vr: 0, grow: 0 });
  }
  if (P.slowT > 0 && Math.random() < dt * 5) {
    addParticle({ x: P.x + rr(-9, 9), y: P.y - 44, vx: rr(-10, 10), vy: -26, ay: 0, drag: 0, life: 1, max: 1, size: rr(2.5, 4.2), color: '#c35cff', shape: 'bubble', rot: 0, vr: 0, grow: 0 });
  }
}

// 軽いオートエイム: 毒キノコ・敵が照準の近くにあれば少しだけ吸い付く
function assistAim(angle, strong) {
  const P = G.player;
  const maxA = CONFIG.gun.assist * (strong ? 1.6 : 0.8);
  let best = null;
  let bestScore = 1e9;
  const test = (t, hr) => {
    const dx = t.x - P.x;
    const dy = t.y - P.y;
    const d = Math.hypot(dx, dy);
    if (d > CONFIG.gun.range * 0.95 || d < 20) return;
    const ang = Math.atan2(dy, dx);
    const diff = Math.abs(angleDiff(angle, ang));
    const tol = maxA + Math.atan2(hr, d);
    if (diff < tol && diff * d < bestScore) { bestScore = diff * d; best = ang; }
  };
  for (const m of G.mushrooms) if (!m.dead && m.type === 'poison') test(m, m.hr);
  for (const e of G.enemies) if (e.state !== 'flee') test(e, e.def.hr);
  if (best === null) return angle;
  return angle + angleDiff(angle, best) * 0.7;
}

function shoot(P, aim) {
  const g = CONFIG.gun;
  const a = aim + (Math.random() - 0.5) * 2 * g.spread;
  const sp = g.speed * rr(0.94, 1.06);
  G.proj.push({ x: P.x + Math.cos(a) * 24, y: P.y + Math.sin(a) * 24, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: g.range / g.speed * rr(0.9, 1.05), dropT: 0, h: 22 });
  P.recoil = 1;
  Sound.sfx.shoot();
}

// ---------- インク弾 ----------
function updateProjectiles(dt) {
  const W = G.world;
  const out = [];
  for (const p of G.proj) {
    p.life -= dt;
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.dropT += Math.hypot(p.vx, p.vy) * dt;
    p.h = Math.max(4, p.h - dt * 14);
    if (p.dropT > 140) { p.dropT = 0; addDecal(p.x + rr(-5, 5), p.y + rr(-5, 5), 0.34, 'drop', 6); }
    let dead = p.life <= 0;
    let hitKind = null;
    if (!dead) {
      // 草むらに隠れたキノコにも当たる
      for (const m of G.mushrooms) {
        if (m.dead || m.type !== 'poison') continue;
        if (Math.hypot(m.x - p.x, m.y - p.y) < m.hr) { hitMushroom(m, p); dead = true; hitKind = 'mushroom'; break; }
      }
    }
    if (!dead) {
      for (const e of G.enemies) {
        if (e.state === 'flee') continue;
        if (Math.hypot(e.x - p.x, e.y - p.y) < e.def.hr) { hitEnemy(e, p); dead = true; hitKind = 'enemy'; break; }
      }
    }
    if (!dead) {
      W.hash.query(p.x - 4, p.y - 4, p.x + 4, p.y + 4, (o) => {
        if (dead) return;
        if (LOW_KINDS[o.kind] || o.low) return;
        if (Math.hypot(o.x - p.x, o.y - p.y) < o.r + 2) { dead = true; hitKind = 'wall'; }
      });
    }
    if (dead) {
      if (!hitKind || hitKind === 'wall') {
        if (W.tileAt(p.x, p.y) === T_WATER) {
          ring(p.x, p.y, 4, 22, 0.45, 'rgba(255,255,255,0.85)', 2.5);
          burst(p.x, p.y - 4, 4, { s0: 20, s1: 60, l0: 0.3, l1: 0.5, z0: 1.5, z1: 3, color: '#ffd0ea', ay: 160 });
        } else {
          addDecal(p.x, p.y, rr(0.55, 0.85), 'splat', 14);
          burst(p.x, p.y - 4, 5, { s0: 30, s1: 90, l0: 0.25, l1: 0.45, z0: 1.6, z1: 3.2, color: ['#ff3d9a', '#ff9ad0'], shape: 'ink', ay: 240 });
          Sound.sfx.splat();
        }
      }
    } else out.push(p);
  }
  G.proj = out;
}

function hitMushroom(m, p) {
  m.hp -= 1;
  m.wob = 0.3;
  m.hitT = 0.12;
  if (m.hidden) { m.hidden = false; }
  burst(p.x, p.y - 8, 6, { s0: 40, s1: 120, l0: 0.25, l1: 0.5, z0: 1.8, z1: 3.6, color: ['#ff3d9a', '#ff9ad0', '#c35cff'], shape: 'ink', ay: 260 });
  addDecal(m.x + rr(-10, 10), m.y + rr(-4, 8), 0.5, 'splat', 12);
  Sound.sfx.splat();
  if (m.hp <= 0) purify(m);
}

function purify(m) {
  m.dead = true;
  G.combo += 1;
  G.comboT = CONFIG.mushroom.comboWindow;
  G.comboMult = comboMultiplier(G.combo);
  G.stats.bestCombo = Math.max(G.stats.bestCombo, G.combo);
  const base = m.big ? CONFIG.mushroom.bigScore : CONFIG.mushroom.score;
  const pts = Math.round(base * G.comboMult);
  G.score += pts;
  G.stats.purified += 1;
  floatText(m.x, m.y - 44 * m.size, '+' + pts + (G.comboMult > 1 ? '  x' + G.comboMult : ''), m.big ? '#ffe14d' : '#fff6a8', m.big ? 30 : 24);
  burst(m.x, m.y - 20 * m.size, m.big ? 26 : 14, { s0: 60, s1: 190, l0: 0.5, l1: 1, z0: 2.5, z1: 5.5, color: ['#ff3d9a', '#ff9ad0', '#fff6a8', '#c35cff'], shape: 'spark', ay: 60 });
  burst(m.x, m.y - 16 * m.size, 5, { s0: 15, s1: 40, l0: 0.9, l1: 1.4, z0: 6, z1: 9, color: '#ff9ad0', shape: 'heart', ay: -50 });
  ring(m.x, m.y - 4, 8, m.big ? 90 : 56, 0.5, 'rgba(255,180,225,0.9)', 4);
  addDecal(m.x, m.y, m.big ? 1.5 : 1, 'flower', 24);
  addDecal(m.x, m.y, m.big ? 1.6 : 1.1, 'splat', 18);
  Sound.sfx.pop();
}

function hitEnemy(e, p) {
  e.hp -= 1;
  e.flash = 0.12;
  e.slow = 0.5;
  e.kx += p.vx * 0.04; e.ky += p.vy * 0.04;
  burst(p.x, p.y - 12, 5, { s0: 40, s1: 110, l0: 0.25, l1: 0.45, z0: 1.8, z1: 3.4, color: ['#ff3d9a', '#ff9ad0'], shape: 'ink', ay: 260 });
  addDecal(e.x + rr(-14, 14), e.y + rr(-4, 8), 0.5, 'splat', 10);
  Sound.sfx.hitEnemy();
  if (e.state === 'wander' && e.cool <= 0.5) { e.state = 'chase'; e.st = 0; e.seen = true; }
  if (e.hp <= 0) {
    e.state = 'flee'; e.st = 0; e.z = 0; e.hitDone = true;
    G.stats.inked += 1;
    addScore(e.def.score, e.x, e.y - 70, '#ffb3dc');
    ring(e.x, e.y - 6, 10, 80, 0.5, 'rgba(255,100,180,0.9)', 5);
    burst(e.x, e.y - 30, 18, { s0: 60, s1: 200, l0: 0.5, l1: 0.9, z0: 2.5, z1: 5, color: ['#ff3d9a', '#ff9ad0', '#fff'], shape: 'spark', ay: 80 });
    floatText(e.x, e.y - 90, 'ぎゃふん!', '#ff9ad0', 22);
  }
}

// ---------- 敵 ----------
function enemyFace(e, dx) { if (Math.abs(dx) > 4) e.face = dx > 0 ? 1 : -1; }

// 障害物をよけながら進む。ぶつかったらいったん横にそれる
function steer(e, dx, dy, speed, dt) {
  let a = Math.atan2(dy, dx);
  if (e.avoidT > 0) { a += e.avoidSide * 1.1; e.avoidT -= dt; }
  const px = e.x;
  const py = e.y;
  moveBody(e, Math.cos(a) * speed * dt, Math.sin(a) * speed * dt, e.def.cr);
  e.moving = true;
  if (Math.abs(Math.cos(a)) > 0.25) e.face = Math.cos(a) > 0 ? 1 : -1;
  if (Math.hypot(e.x - px, e.y - py) < speed * dt * 0.35) {
    e.stuckT += dt;
    if (e.avoidT <= 0) { e.avoidT = 0.45; e.avoidSide = Math.random() < 0.5 ? -1 : 1; }
  } else e.stuckT = Math.max(0, e.stuckT - dt);
}

function noticePlayer(e) {
  e.state = 'chase'; e.st = 0; e.loseT = 0; e.seen = true;
  floatText(e.x, e.y - 84, '!', '#ff4d4d', 30);
  if (G.alertCd <= 0) { Sound.sfx.alert(); G.alertCd = 1.2; }
  if (!G.shownHints[e.type]) {
    G.shownHints[e.type] = true;
    UI.toast(e.def.name + 'が おってくる! ' + (e.type === 'boar' ? 'とっしんに ちゅうい' : e.type === 'bear' ? 'つめに ちゅうい' : 'ジャンプに ちゅうい'));
  }
}

function startWindup(e, atk) {
  const P = G.player;
  e.state = 'windup'; e.st = 0; e.atk = atk; e.hitDone = false;
  e.dur = (atk === 'punch' ? 0.42 : e.def.windup) / (1 + Math.min(G.t / 600, 0.35));
  e.aim = Math.atan2(P.y - e.y, P.x - e.x);
  e.ex = P.x; e.ey = P.y;
  if (atk === 'leap') Sound.sfx.roar();
}
function beginAttack(e) {
  const def = e.def;
  e.state = 'attack'; e.st = 0; e.hitDone = false;
  if (e.atk === 'charge') {
    e.dur = 0.58; e.cvx = Math.cos(e.aim) * def.charge; e.cvy = Math.sin(e.aim) * def.charge;
    Sound.sfx.roar();
  } else if (e.atk === 'swipe') { e.dur = 0.3; Sound.sfx.swipe(); }
  else if (e.atk === 'punch') { e.dur = 0.3; Sound.sfx.swipe(); }
  else if (e.atk === 'leap') {
    e.dur = def.leap;
    const dd = clamp(Math.hypot(e.ex - e.x, e.ey - e.y), 100, 340);
    e.sx = e.x; e.sy = e.y;
    e.tx = e.x + Math.cos(e.aim) * dd; e.ty = e.y + Math.sin(e.aim) * dd;
  }
}
function toRecover(e, dur) { e.state = 'recover'; e.st = 0; e.dur = dur; e.z = 0; }
function stunEnemy(e, dur) {
  e.state = 'stun'; e.st = 0; e.dur = dur; e.z = 0;
  burst(e.x, e.y - 8, 10, { s0: 40, s1: 120, l0: 0.4, l1: 0.8, z0: 5, z1: 10, color: 'rgba(210,190,150,0.8)', shape: 'dust', grow: 12 });
  if (Math.hypot(e.x - G.player.x, e.y - G.player.y) < 500) G.cam.shake = Math.max(G.cam.shake, 5);
}

function updateEnemy(e, dt) {
  const P = G.player;
  const def = e.def;
  const W = G.world;
  e.t += dt; e.st += dt;
  if (e.flash > 0) e.flash -= dt;
  if (e.cool > 0) e.cool -= dt;
  if (e.slow > 0) e.slow -= dt;
  e.moving = false;
  const dx = P.x - e.x;
  const dy = P.y - e.y;
  const d = Math.hypot(dx, dy);
  const diff = 1 + Math.min(G.t / 500, 0.4);
  const slowMul = e.slow > 0 ? 0.55 : 1;
  if (Math.abs(e.kx) + Math.abs(e.ky) > 3) {
    moveBody(e, e.kx * dt, e.ky * dt, def.cr);
    const f = Math.exp(-8 * dt);
    e.kx *= f; e.ky *= f;
  } else { e.kx = 0; e.ky = 0; }

  // 万一水と重なって動けなくなったら、別の場所へ移す
  if (W.waterBlocked(e.x, e.y, def.cr)) { e.trapT = (e.trapT || 0) + dt; if (e.trapT > 1.5) { e.trapT = 0; respawnEnemy(e); return; } } else e.trapT = 0;

  const alive = G.state === 'playing';
  switch (e.state) {
    case 'wander': {
      e.senseT -= dt;
      if (alive && e.senseT <= 0) {
        e.senseT = 0.2;
        if (e.cool <= 0 && d < def.sight && W.lineClear(e.x, e.y, P.x, P.y)) { noticePlayer(e); break; }
      }
      e.idle -= dt;
      if (e.idle > 0) break;
      e.wanderT -= dt;
      if (e.wanderT <= 0 || Math.hypot(e.tx - e.x, e.ty - e.y) < 14 || e.stuckT > 1.2) {
        // 森の動物はプレイヤーの気配に引かれて、少しずつ近づいてくる
        if (alive && d < 1500) { e.homeX += (P.x - e.homeX) * 0.3; e.homeY += (P.y - e.homeY) * 0.3; }
        const a = Math.random() * TAU;
        const r = rr(80, 260);
        e.tx = e.homeX + Math.cos(a) * r; e.ty = e.homeY + Math.sin(a) * r;
        e.idle = rr(0.4, 2); e.wanderT = rr(2.5, 5); e.stuckT = 0;
        break;
      }
      steer(e, e.tx - e.x, e.ty - e.y, def.wander * slowMul, dt);
      break;
    }
    case 'chase': {
      enemyFace(e, dx);
      e.senseT -= dt;
      if (e.senseT <= 0) {
        e.senseT = 0.25;
        e.seen = d < def.sight * 1.7 && W.lineClear(e.x, e.y, P.x, P.y);
      }
      e.loseT = e.seen ? 0 : e.loseT + dt;
      if (!alive || e.loseT > 1.6 || e.stuckT > 3) { e.state = 'wander'; e.st = 0; e.homeX = e.x; e.homeY = e.y; e.idle = 1; e.stuckT = 0; e.cool = 1.5; break; }
      steer(e, dx, dy, def.chase * diff * slowMul, dt);
      if (e.cool <= 0) {
        if (e.type === 'boar' && d < 300 && d > 70) startWindup(e, 'charge');
        else if (e.type === 'bear' && d < def.reach - 8) startWindup(e, 'swipe');
        else if (e.type === 'gorilla') {
          if (d < 72) startWindup(e, 'punch');
          else if (d > 130 && d < 340) startWindup(e, 'leap');
        }
      }
      break;
    }
    case 'windup': {
      enemyFace(e, dx);
      if (e.st < e.dur - 0.22) { e.aim = Math.atan2(dy, dx); e.ex = P.x; e.ey = P.y; }
      if (e.st >= e.dur) beginAttack(e);
      break;
    }
    case 'attack': {
      const inFront = (reach, arc) => d < reach + P.r && Math.abs(angleDiff(e.aim, Math.atan2(dy, dx))) < arc;
      if (e.atk === 'charge') {
        const r = moveBody(e, e.cvx * dt, e.cvy * dt, def.cr);
        e.moving = true;
        if (Math.random() < dt * 40) addParticle({ x: e.x - e.cvx * 0.05, y: e.y - 2, vx: rr(-20, 20), vy: rr(-30, -5), ay: 0, drag: 0, life: 0.45, max: 0.45, size: rr(6, 11), grow: 14, color: 'rgba(210,190,150,0.7)', shape: 'dust', rot: 0, vr: 0 });
        if (!e.hitDone && d < def.cr + P.r + 8) { e.hitDone = true; if (hurtPlayer(def.damage, e.x, e.y, 360)) { toRecover(e, 0.8); break; } }
        if (r.hit || r.water) { stunEnemy(e, 1.4); break; }
        if (e.st >= e.dur) toRecover(e, 0.7);
      } else if (e.atk === 'swipe' || e.atk === 'punch') {
        const reach = e.atk === 'swipe' ? def.reach : 70;
        if (!e.hitDone && e.st >= 0.08) {
          e.hitDone = true;
          if (inFront(reach, e.atk === 'swipe' ? 1.15 : 1.0)) hurtPlayer(e.atk === 'swipe' ? def.damage : def.punch, e.x, e.y, 300);
        }
        if (e.st >= e.dur) toRecover(e, e.atk === 'swipe' ? 0.9 : 0.7);
      } else if (e.atk === 'leap') {
        const u = clamp(e.st / e.dur, 0, 1);
        e.z = Math.sin(Math.PI * u) * 72;
        const nx = lerp(e.sx, e.tx, u);
        const ny = lerp(e.sy, e.ty, u);
        moveBody(e, nx - e.x, ny - e.y, def.cr, true);
        if (u >= 1) {
          moveBody(e, 0, 0, def.cr);
          e.z = 0;
          ring(e.x, e.y, 10, def.shock, 0.45, 'rgba(255,230,200,0.9)', 6);
          burst(e.x, e.y - 4, 14, { s0: 60, s1: 170, l0: 0.4, l1: 0.8, z0: 6, z1: 11, color: 'rgba(210,190,150,0.8)', shape: 'dust', grow: 16 });
          Sound.sfx.slam();
          if (Math.hypot(P.x - e.x, P.y - e.y) < def.shock + P.r) hurtPlayer(def.damage, e.x, e.y, 380);
          if (Math.hypot(P.x - e.x, P.y - e.y) < 700) G.cam.shake = Math.max(G.cam.shake, 9);
          toRecover(e, 1.0);
        }
      }
      break;
    }
    case 'recover':
      if (e.st >= e.dur) { e.state = 'chase'; e.st = 0; e.cool = rr(0.7, 1.4) / (1 + Math.min(G.t / 600, 0.5)); }
      break;
    case 'stun':
      if (e.st >= e.dur) { e.state = 'chase'; e.st = 0; e.cool = 0.6; }
      break;
    case 'flee': {
      const a = Math.atan2(-dy, -dx);
      steer(e, Math.cos(a), Math.sin(a), def.chase * 1.5, dt);
      if ((e.st > 4 && d > 650) || e.st > 12) respawnEnemy(e);
      break;
    }
    default: break;
  }
  // プレイヤーと体が重ならないように押し返す
  const min = def.cr + P.r;
  if (d < min && d > 0.01 && e.state !== 'flee' && e.z < 10) {
    const k = (min - d) * 0.5;
    moveBody(P, (dx / d) * k, (dy / d) * k, P.r);
    moveBody(e, -(dx / d) * k * 0.4, -(dy / d) * k * 0.4, def.cr);
  }
}

function separateEnemies() {
  const list = G.enemies;
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i];
      const b = list[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy) || 0.01;
      const min = a.def.cr + b.def.cr + 4;
      if (d < min) {
        const k = (min - d) * 0.5;
        moveBody(a, -(dx / d) * k, -(dy / d) * k, a.def.cr);
        moveBody(b, (dx / d) * k, (dy / d) * k, b.def.cr);
      }
    }
  }
}

// ---------- うさぎ・リス ----------
function startHop(c, d, dx, dy) {
  const speed = CONFIG.critter[c.type];
  c.hopping = true; c.hopU = 0.001;
  if (d < CONFIG.critter.fleeRadius) {
    c.fear = true;
    let a = Math.atan2(-dy, -dx) + rr(-0.7, 0.7) * (c.type === 'squirrel' ? 1.5 : 1) + c.bump;
    c.bump = 0;
    c.dx = Math.cos(a); c.dy = Math.sin(a);
    c.hopSpeed = speed; c.hopDur = 0.32;
  } else {
    c.fear = false;
    if (Math.random() < 0.45) { c.hopping = false; c.hopU = 0; c.rest = rr(0.6, 2); return; }
    const a = Math.random() * TAU + c.bump;
    c.bump = 0;
    c.dx = Math.cos(a); c.dy = Math.sin(a);
    c.hopSpeed = speed * 0.3; c.hopDur = 0.36;
  }
  if (Math.abs(c.dx) > 0.2) c.face = c.dx > 0 ? 1 : -1;
}
function updateCritter(c, dt) {
  const P = G.player;
  if (c.gone) {
    c.respawn -= dt;
    if (c.respawn <= 0) placeCritter(c, 520);
    return;
  }
  c.t += dt;
  const dx = P.x - c.x;
  const dy = P.y - c.y;
  const d = Math.hypot(dx, dy);
  if (G.world.waterBlocked(c.x, c.y, 8)) { c.trapT = (c.trapT || 0) + dt; if (c.trapT > 1) { c.trapT = 0; placeCritter(c, 300); return; } } else c.trapT = 0;
  if (c.hopping) {
    c.hopU += dt / c.hopDur;
    const v = c.hopSpeed * (Math.PI / 2) * Math.sin(Math.PI * Math.min(c.hopU, 1));
    const r = moveBody(c, c.dx * v * dt, c.dy * v * dt, 8);
    if (r.hit || r.water) c.bump = (Math.random() < 0.5 ? -1 : 1) * rr(1.1, 1.9);
    if (c.hopU >= 1) { c.hopping = false; c.hopU = 0; c.rest = d < CONFIG.critter.fleeRadius ? rr(0.03, 0.12) : rr(0.8, 2.2); }
  } else {
    c.rest -= dt;
    if (c.rest <= 0) startHop(c, d, dx, dy);
  }
  if (G.state === 'playing' && d < P.r + 11) collectCritter(c);
}
function collectCritter(c) {
  const P = G.player;
  const C = CONFIG.player;
  P.boostT = Math.min(P.boostT + C.boostTime, C.boostMax);
  G.stats.boosts += 1;
  c.gone = true; c.respawn = rr(6, 10);
  floatText(c.x, c.y - 40, 'スピードアップ!', '#ffe14d', 22);
  burst(c.x, c.y - 14, 16, { s0: 50, s1: 150, l0: 0.4, l1: 0.8, z0: 3, z1: 6, color: ['#ffe14d', '#fff6a8', '#ffffff'], shape: 'spark' });
  ring(c.x, c.y - 4, 6, 50, 0.4, 'rgba(255,230,90,0.9)', 4);
  Sound.sfx.boost();
}

// ---------- キノコ ----------
function updateMushroom(m, dt) {
  const P = G.player;
  m.t += dt;
  if (m.wob > 0) m.wob -= dt;
  if (m.hitT > 0) m.hitT -= dt;
  if (m.pop < 1) m.pop = Math.min(1, m.pop + dt * 3.5);
  const d = Math.hypot(P.x - m.x, P.y - m.y);
  if (m.hidden && d < CONFIG.mushroom.revealRadius) {
    m.hidden = false;
    burst(m.x, m.y - 14, 6, { s0: 20, s1: 70, l0: 0.4, l1: 0.7, z0: 2, z1: 4, color: ['#c35cff', '#e2b0ff'], shape: 'spark', ay: -30 });
  }
  if (d < 620) {
    m.bubT -= dt;
    if (m.bubT <= 0) {
      m.bubT = rr(0.5, 1.1);
      if (m.type === 'poison') {
        addParticle({ x: m.x + rr(-9, 9) * m.size, y: m.y - 38 * m.size, vx: rr(-6, 6), vy: -rr(20, 34), ay: 0, drag: 0, life: 1.6, max: 1.6, size: rr(2.6, 5), color: '#c35cff', shape: 'bubble', rot: 0, vr: 0, grow: 0 });
      } else if (Math.random() < 0.6) {
        addParticle({ x: m.x + rr(-12, 12), y: m.y - rr(20, 40), vx: 0, vy: -rr(8, 16), ay: 0, drag: 0, life: 1.1, max: 1.1, size: rr(3, 5), color: '#fff6a8', shape: 'spark', rot: 0, vr: 3, grow: 0 });
      }
    }
  }
  if (G.state !== 'playing' || m.dead) return;
  if (d < P.r + 13 * m.size) {
    if (m.type === 'good') {
      if (P.hp >= CONFIG.player.maxHp) {
        if (G.fullHintT <= 0) { floatText(P.x, P.y - 60, 'HPまんたん!', '#bfffc9', 20); G.fullHintT = 2.5; }
        return;
      }
      m.dead = true;
      const heal = Math.min(CONFIG.player.heal, CONFIG.player.maxHp - P.hp);
      P.hp += heal;
      G.stats.eaten += 1;
      floatText(P.x, P.y - 60, 'おいしい! HP+' + heal, '#9dffb0', 22);
      burst(P.x, P.y - 30, 12, { s0: 30, s1: 90, l0: 0.7, l1: 1.2, z0: 6, z1: 9, color: '#ff8fb8', shape: 'heart', ay: -60 });
      burst(P.x, P.y - 30, 10, { s0: 40, s1: 120, l0: 0.4, l1: 0.8, z0: 2.5, z1: 5, color: ['#bfffc9', '#fff6a8'], shape: 'spark' });
      Sound.sfx.eat();
    } else {
      m.dead = true;
      P.slowT = CONFIG.player.slowTime;
      G.stats.poisoned += 1;
      G.combo = 0; G.comboT = 0;
      floatText(P.x, P.y - 60, 'どくだ…! のろのろ', '#d9a0ff', 22);
      burst(P.x, P.y - 28, 16, { s0: 30, s1: 100, l0: 0.6, l1: 1.1, z0: 3, z1: 7, color: ['#a24be0', '#c35cff', '#6b2a9c'], shape: 'bubble', ay: -40 });
      G.cam.shake = Math.max(G.cam.shake, 4);
      Sound.sfx.poison();
    }
  }
}

// ---------- まとめて更新 ----------
function updateParticles(dt) {
  const out = [];
  for (const p of G.particles) {
    p.life -= dt;
    if (p.life <= 0) continue;
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.vy += p.ay * dt;
    if (p.drag) { const f = Math.exp(-p.drag * dt); p.vx *= f; p.vy *= f; }
    p.rot += p.vr * dt;
    if (p.grow) p.size += p.grow * dt;
    out.push(p);
  }
  G.particles = out;
  const tx = [];
  for (const t of G.texts) {
    t.life -= dt;
    if (t.life <= 0) continue;
    t.y += t.vy * dt; t.vy *= Math.exp(-2.2 * dt);
    tx.push(t);
  }
  G.texts = tx;
  for (const d of G.decals) if (d) d.t += dt;
}

function updateDirector(dt) {
  const D = CONFIG.director;
  const target = Math.min(D.max, D.start + Math.floor(G.t / D.every));
  if (G.enemies.length < target) {
    G.spawnT = (G.spawnT || 0) - dt;
    if (G.spawnT <= 0) { G.spawnT = 1.5; spawnEnemy(false); }
  }
  G.mushT -= dt;
  if (G.mushT <= 0) {
    G.mushT = 1.2;
    const poison = G.mushrooms.filter((m) => !m.dead && m.type === 'poison').length;
    const good = G.mushrooms.filter((m) => !m.dead && m.type === 'good').length;
    if (poison < CONFIG.mushroom.poisonTarget - 3) spawnPoisonCluster();
    if (good < CONFIG.mushroom.goodTarget) spawnGoodMushroom();
    G.mushrooms = G.mushrooms.filter((m) => !m.dead);
  }
}

function updateGame(dt) {
  G.t += dt;
  if (G.alertCd > 0) G.alertCd -= dt;
  if (G.fullHintT > 0) G.fullHintT -= dt;
  const playing = G.state === 'playing';
  if (playing) {
    G.timeLeft -= dt;
    if (G.timeLeft <= 0) { G.timeLeft = 0; endGame('time'); }
    if (G.comboT > 0) { G.comboT -= dt; if (G.comboT <= 0) { G.combo = 0; G.comboMult = 1; } }
    if (G.flashRed > 0) G.flashRed -= dt;
  }
  updatePlayer(dt);
  updateProjectiles(dt);
  for (const e of G.enemies) updateEnemy(e, dt);
  separateEnemies();
  for (const c of G.critters) updateCritter(c, dt);
  for (const m of G.mushrooms) updateMushroom(m, dt);
  updateParticles(dt);
  if (playing) updateDirector(dt);
}

// タイトル画面の背景: 動物とパーティクルだけ動かす
function updateAmbient(dt) {
  G.t += dt;
  for (const c of G.critters) updateCritter(c, dt);
  for (const m of G.mushrooms) updateMushroom(m, dt);
  updateParticles(dt);
}

if (typeof module !== 'undefined' && module.exports) module.exports = { rr };
