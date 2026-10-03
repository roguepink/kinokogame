'use strict';
/* 追加の遊び: どくの大発生(ウェーブ)・武器の箱・ボス「キノコおやかた」・ミッション・仲間のどうぶつ・夕方から夜
   entities.js / render.js / main.js から Features.* を呼ぶ。状態は G.ev / G.crates / G.boss / G.missions に持つ */

const Features = (() => {
  const C = {
    outbreak: { first: 30, every: 48, limit: 42, r0: 70, r1: 250, count: 11, max: 22, addEvery: 5, bonus: 1200, taintSlow: 0.7, taintLife: 35 },
    crate: { first: 12, every: 22, max: 2 },
    weapons: {
      boomerang: { name: 'ブーメラン', color: '#ffb347', time: 20, rate: 7, max: 8, speed: 540, out: 0.5, returnMax: 2.2, tip: 'おしっぱなしで 次々 投げる(6個まで)。キャッチすると 大きく(Lv3まで)' },
      missile:   { name: 'ゆうどうミサイル', color: '#ff6a3d', time: 18, rate: 7, speed: 260, accel: 900, turn: 7, seek: 520, dmg: 2, life: 2.2, tip: 'てきや どくキノコを 自動で おいかける。当たると はじける' },
      omni:      { name: 'オムニショット', color: '#9be0ff', time: 15, rate: 5, n: 12, range: 330, tip: '四方八方に いっせいに うつ。かこまれても だいじょうぶ' },
      rainbow:   { name: '虹の水てっぽう', color: '#ff8ad0', time: 16, rate: 11, tip: '当てた どうぶつが なかまに なって、さいごまで いっしょに たたかう' },
      // ステージ2(まち)
      rifle:     { name: 'ライフル', color: '#8fd8ff', time: 18, rate: 7, speed: 1300, range: 900, dmg: 3, hr: 6, tip: '連射で 遠くまで つらぬく' },
      shotgun:   { name: 'ショットガン', color: '#ffb347', time: 18, rate: 4.5, n: 8, arc: 0.7, speed: 820, range: 360, dmg: 1, tip: '連射で ひろく ばらまく。ふっとばす' },
      drone:     { name: 'こうげきドローン', color: '#9fd3ec', time: 25, n: 3, life: 25, rate: 4, seek: 380, speed: 700, tip: '3台の ドローンが まわりを とんで、てきや どくキノコを 自動で うつ' },
    },
    boss: { at: 62, hp: 46, cr: 48, hr: 72, speed: 42, weakEvery: 7, weakTime: 2.6, weakMul: 3, sporeEvery: 4.5, spores: 5, cloudEvery: 10, cloudR: 170, cloudTime: 3.2, score: 3000 },
    mission: { bonusTime: 12, bonusScore: 300 },
    companion: { time: 14, max: 2, seek: 280, hitEvery: 1.1 },
    allyMax: 4,
    night: { eveStart: 55, nightStart: 120, nightFull: 165 },
  };
  const rr = (a, b) => a + Math.random() * (b - a);

  // ================= リセット =================
  function reset() {
    G.ev = null; G.evT = C.outbreak.first; G.taints = [];
    G.crates = []; G.crateT = C.crate.first;
    G.boss = null; G.spores = []; G.bossDone = false;
    G.missions = { cur: null, done: 0, list: [], flash: 0 };
    G.companions = 0;
    G.weapon = null; G.weaponT = 0; G.charge = 0; G.wasFiring = false;
    G.booms = []; G.boomLv = 1; G.omniPh = 0; G.lastCrate = null; G.drones = [];
    G.night = 0; G.eve = 0;
    G.stats.outbreaks = 0; G.stats.outbreaksCleared = 0; G.stats.missions = 0; G.stats.boss = 0; G.stats.crates = 0;
    nextMission();
  }

  // ================= どくの大発生 =================
  function startOutbreak() {
    const W = G.world;
    const P = G.player;
    const s = W.randomSpot(Math.random, (x, y) => { const d = Math.hypot(x - P.x, y - P.y); return d > 520 && d < 900; }, 60);
    if (!s) return false;
    const ev = { x: s.x, y: s.y, t: 0, r: C.outbreak.r0, left: C.outbreak.limit, mush: [], addT: 0, total: 0 };
    G.ev = ev;
    G.stats.outbreaks += 1;
    for (let i = 0; i < C.outbreak.count; i++) addOutbreakMushroom(ev);
    UI.banner('どくの大発生!');
    UI.toast('どくキノコが 大発生! ' + C.outbreak.limit + 'びょう以内に ぜんぶ きれいにしよう', 3600);
    Sound.sfx.alarm();
    return true;
  }
  function addOutbreakMushroom(ev) {
    const W = G.world;
    for (let tries = 0; tries < 24; tries++) {
      const a = Math.random() * TAU; const d = Math.sqrt(Math.random()) * ev.r * 0.95;
      const x = ev.x + Math.cos(a) * d; const y = ev.y + Math.sin(a) * d * 0.85;
      if (!W.isOpen(x, y, 16) || nearAnyMushroom(x, y, 24)) continue;
      const m = makeMushroom('poison', x, y, ev.total % 7 === 6);
      m.hidden = false; m.ev = ev; m.pop = 0;
      G.mushrooms.push(m); ev.mush.push(m); ev.total += 1;
      burst(x, y - 10, 5, { s0: 20, s1: 70, l0: 0.4, l1: 0.8, z0: 2, z1: 4, color: ['#c35cff', '#8a2be2'], shape: 'bubble', ay: -40 });
      return;
    }
  }
  function updateOutbreak(dt) {
    const ev = G.ev;
    if (!ev) {
      G.evT -= dt;
      if (G.evT <= 0 && !G.boss) { if (!startOutbreak()) G.evT = 4; else G.evT = C.outbreak.every; }
      return;
    }
    ev.t += dt; ev.left -= dt;
    ev.r = lerp(C.outbreak.r0, C.outbreak.r1, clamp(ev.t / C.outbreak.limit, 0, 1));
    ev.addT -= dt;
    if (ev.addT <= 0 && ev.total < C.outbreak.max) { ev.addT = C.outbreak.addEvery; addOutbreakMushroom(ev); }
    ev.mush = ev.mush.filter((m) => !m.dead);
    const alive = ev.mush.length;
    if (alive === 0 && ev.t > 0.5) {
      // せいこう
      const pts = Math.round(C.outbreak.bonus * scoreMul());
      G.score += pts; G.stats.outbreaksCleared += 1;
      floatText(ev.x, ev.y - 40, '森を すくった! +' + pts, '#9dffb0', 30);
      UI.banner('森を すくった!');
      ring(ev.x, ev.y, 20, ev.r + 80, 0.9, 'rgba(180,255,180,0.9)', 8);
      burst(ev.x, ev.y - 20, 40, { s0: 60, s1: 260, l0: 0.6, l1: 1.3, z0: 3, z1: 8, color: ['#9dffb0', '#fff6a8', '#ff9ad0', '#fff'], shape: 'spark', drag: 1.2 });
      for (let i = 0; i < 14; i++) { const a = Math.random() * TAU; const d = Math.sqrt(Math.random()) * ev.r; addDecal(ev.x + Math.cos(a) * d, ev.y + Math.sin(a) * d * 0.85, rr(0.8, 1.3), 'flower', 40); }
      Sound.sfx.clear();
      G.ev = null; G.evT = C.outbreak.every;
      return;
    }
    if (ev.left <= 0) {
      // 間に合わなかった: 汚染が残る
      UI.toast('汚染が ひろがってしまった… むらさきの地面は 足が おそくなる', 3600);
      G.taints.push({ x: ev.x, y: ev.y, r: ev.r, life: C.outbreak.taintLife });
      for (const m of ev.mush) m.ev = null;
      G.ev = null; G.evT = C.outbreak.every * 0.8;
      Sound.sfx.poison();
      return;
    }
    // 胞子がただよう
    if (Math.random() < dt * 10) addParticle({ x: ev.x + rr(-ev.r, ev.r), y: ev.y + rr(-ev.r, ev.r) * 0.85, vx: rr(-8, 8), vy: -rr(8, 20), ay: 0, drag: 0, life: rr(1.2, 2.4), max: 2.4, size: rr(2, 4), color: '#b04cff', shape: 'bubble', rot: 0, vr: 0, grow: 0 });
  }
  function inTaint(x, y) {
    if (G.ev) { const dx = x - G.ev.x; const dy = (y - G.ev.y) / 0.85; if (dx * dx + dy * dy < G.ev.r * G.ev.r) return true; }
    for (const t of G.taints) { const dx = x - t.x; const dy = (y - t.y) / 0.85; if (dx * dx + dy * dy < t.r * t.r) return true; }
    return false;
  }
  function playerSpeedMul() {
    const P = G.player;
    if (G.power > 0) return 1;
    return inTaint(P.x, P.y) ? C.outbreak.taintSlow : 1;
  }

  // ================= 武器の箱 =================
  // ブーメラン(何個も投げる)・ミサイル(自動誘導)・オムニ(四方八方)・虹(当てた敵が ずっと仲間)
  function spawnCrate() {
    const P = G.player;
    const s = G.world.randomSpot(Math.random, (x, y) => { const d = Math.hypot(x - P.x, y - P.y); return d > 280 && d < 700; }, 30);
    if (!s) return false;
    const keys = G.stage === 2 ? ['rifle', 'shotgun', 'missile', 'drone'] : ['boomerang', 'missile', 'omni', 'rainbow'];
    // 同じ武器が続かないように
    let w = keys[Math.floor(Math.random() * keys.length)];
    if (w === G.lastCrate && Math.random() < 0.7) w = keys[(keys.indexOf(w) + 1 + Math.floor(Math.random() * 3)) % keys.length];
    G.lastCrate = w;
    G.crates.push({ kind: 'crate', x: s.x, y: s.y, t: 0, w, life: 40 });
    return true;
  }
  function updateCrates(dt) {
    G.crateT -= dt;
    if (G.crateT <= 0 && G.crates.length < C.crate.max) { G.crateT = spawnCrate() ? C.crate.every : 3; }
    const P = G.player;
    const keep = [];
    for (const c of G.crates) {
      c.t += dt; c.life -= dt;
      if (c.life <= 0) continue;
      if (G.state === 'playing' && Math.hypot(c.x - P.x, c.y - P.y) < P.r + 20) { pickCrate(c); continue; }
      keep.push(c);
    }
    G.crates = keep;
    if (G.weapon) {
      G.weaponT -= dt;
      if (G.weaponT <= 0) { G.weapon = null; UI.toast('ふつうの みずでっぽうに もどった'); }
    }
    updateBoomerangs(dt);
    updateDrones(dt);
  }
  function pickCrate(c) {
    const w = C.weapons[c.w];
    const same = G.weapon === c.w;
    if (c.w === 'drone') {
      // ドローンは 武器を変えずに 3台 放つ
      const P = G.player;
      for (let i = 0; i < w.n; i++) { if (G.drones.length >= w.n) G.drones.shift(); G.drones.push({ x: P.x, y: P.y, ph: (i / w.n) * TAU, life: w.life + (G.charmWeaponTime || 0), cd: i * 0.2, t: 0 }); }
      G.stats.crates += 1;
      if (typeof Meta !== 'undefined') Meta.codexSee('w_drone');
      floatText(c.x, c.y - 40, 'ドローン 3台 はっしん!', w.color, 24);
      UI.toast(w.name + '! ' + w.tip, 3600);
      burst(c.x, c.y - 16, 20, { s0: 50, s1: 170, l0: 0.4, l1: 0.9, z0: 3, z1: 6, color: [w.color, '#fff'], shape: 'spark' });
      Sound.sfx.pickup();
      return;
    }
    G.weapon = c.w; G.weaponT = (same ? G.weaponT : 0) + w.time + (G.charmWeaponTime || 0);
    G.stats.crates += 1;
    if (typeof Meta !== 'undefined') Meta.codexSee('w_' + c.w);
    floatText(c.x, c.y - 40, w.name + '!', w.color, 26);
    UI.toast(w.name + ' ゲット! ' + w.tip, 3600);
    burst(c.x, c.y - 16, 20, { s0: 50, s1: 170, l0: 0.4, l1: 0.9, z0: 3, z1: 6, color: [w.color, '#fff', '#fff6a8'], shape: 'spark' });
    ring(c.x, c.y - 4, 6, 60, 0.4, w.color, 4);
    Sound.sfx.pickup();
  }
  function muzzle(P, a, color, size) {
    const mx = P.x + Math.cos(a) * 30; const my = P.y - 20 + Math.sin(a) * 30;
    addParticle({ x: mx, y: my, vx: 0, vy: 0, ay: 0, drag: 0, life: 0.07, max: 0.07, size, color, shape: 'flash', rot: a, vr: 0, grow: 0 });
    G.cam.kx -= Math.cos(a) * 4; G.cam.ky -= Math.sin(a) * 4;
  }
  // 発射を引き受ける。true を返したら通常の発射はしない
  function weaponFire(P, aim, dt) {
    G.wasFiring = P.firing;
    if (!G.weapon) return false;
    const w = C.weapons[G.weapon];
    const power = G.power > 0;
    if (!(P.firing && P.fireCd <= 0)) return true;
    switch (G.weapon) {
      case 'boomerang': {
        // おしっぱなしで 次々と投げる(同時に max 個まで)
        if (G.booms.length < w.max) {
          const lv = G.boomLv || 1;
          const sp = w.speed * (1 + (lv - 1) * 0.12);
          const a = aim + (Math.random() - 0.5) * 0.22;
          G.booms.push({ x: P.x + Math.cos(a) * 20, y: P.y - 10 + Math.sin(a) * 20, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, t: 0, out: w.out * rr(0.85, 1.15), lv, hit: new Set(), leg: 0, rot: Math.random() * TAU, dmg: lv + (power ? 1 : 0), gold: power });
          muzzle(P, a, w.color, 12);
          P.recoil = 0.8; P.fireCd = 1 / w.rate;
          Sound.sfx.swipe();
        } else P.fireCd = 0.05;
        return true;
      }
      case 'missile': {
        const a = aim + (Math.random() - 0.5) * 0.5;
        const sp = w.speed;
        G.proj.push({ x: P.x + Math.cos(a) * 26, y: P.y + Math.sin(a) * 26, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: w.life, dropT: 0, h: 26, dmg: w.dmg + (power ? 1 : 0), gold: power, homing: true, turn: w.turn, seek: w.seek, t: 0, missile: true, accel: w.accel });
        muzzle(P, a, w.color, 16);
        P.recoil = 1; P.fireCd = 1 / (power ? w.rate * 1.6 : w.rate);
        G.cam.kx -= Math.cos(a) * 6; G.cam.ky -= Math.sin(a) * 6;
        Sound.sfx.missile();
        return true;
      }
      case 'omni': {
        // 四方八方に いっせいに うつ
        for (let i = 0; i < w.n; i++) {
          const a = aim + (i / w.n) * TAU + (G.omniPh || 0);
          const sp = CONFIG.gun.speed * 0.9;
          G.proj.push({ x: P.x + Math.cos(a) * 22, y: P.y + Math.sin(a) * 22, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: w.range / sp, dropT: 0, h: 22, dmg: power ? 2 : 1, gold: power, homing: power, t: 0 });
        }
        G.omniPh = ((G.omniPh || 0) + TAU / w.n / 2) % TAU;
        ring(P.x, P.y - 10, 10, 50, 0.25, w.color, 3);
        P.recoil = 1; P.fireCd = 1 / (power ? w.rate * 1.5 : w.rate);
        G.cam.shake = Math.max(G.cam.shake, 2.5);
        Sound.sfx.shoot(true);
        return true;
      }
      case 'rifle': {
        const a = aim + (Math.random() - 0.5) * 0.02;
        G.proj.push({ x: P.x + Math.cos(a) * 30, y: P.y + Math.sin(a) * 30, vx: Math.cos(a) * w.speed, vy: Math.sin(a) * w.speed, life: w.range / w.speed, dropT: 0, h: 22, dmg: w.dmg + (power ? 2 : 0), gold: power, homing: false, t: 0, pierce: true, hit: new Set(), hr: w.hr, rifle: true });
        muzzle(P, a, '#fff', 22);
        P.recoil = 1.2; P.fireCd = 1 / (power ? w.rate * 1.6 : w.rate);
        G.cam.kx -= Math.cos(a) * 7; G.cam.ky -= Math.sin(a) * 7; G.cam.shake = Math.max(G.cam.shake, 1.5);
        Sound.sfx.rifle();
        return true;
      }
      case 'shotgun': {
        for (let i = 0; i < w.n; i++) {
          const a = aim + (i - (w.n - 1) / 2) * (w.arc / (w.n - 1)) + (Math.random() - 0.5) * 0.06;
          const sp = w.speed * rr(0.85, 1.1);
          G.proj.push({ x: P.x + Math.cos(a) * 28, y: P.y + Math.sin(a) * 28, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: w.range / w.speed * rr(0.85, 1.15), dropT: 0, h: 22, dmg: w.dmg + (power ? 1 : 0), gold: power, homing: false, t: 0, pellet: true, kb: 1 });
        }
        muzzle(P, aim, '#ffd0a0', 24);
        P.recoil = 1.4; P.fireCd = 1 / (power ? w.rate * 1.6 : w.rate);
        G.cam.kx -= Math.cos(aim) * 9; G.cam.ky -= Math.sin(aim) * 9; G.cam.shake = Math.max(G.cam.shake, 3);
        Sound.sfx.shotgun();
        return true;
      }
      case 'rainbow': {
        const a = aim + (Math.random() - 0.5) * 0.08;
        const sp = CONFIG.gun.speed;
        G.proj.push({ x: P.x + Math.cos(a) * 28, y: P.y + Math.sin(a) * 28, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: CONFIG.gun.range / sp, dropT: 0, h: 22, dmg: power ? 2 : 1, gold: power, homing: true, t: 0, rainbow: true });
        muzzle(P, a, '#ff8ad0', 16);
        P.recoil = 1; P.fireCd = 1 / (power ? CONFIG.power.rate : w.rate);
        Sound.sfx.shoot(true);
        return true;
      }
      default: return false;
    }
  }

  // --- こうげきドローン: プレイヤーのまわりをまわり、近くの敵・毒キノコを自動でうつ ---
  function updateDrones(dt) {
    if (!G.drones || !G.drones.length) return;
    const w = C.weapons.drone;
    const P = G.player;
    const keep = [];
    for (const d of G.drones) {
      d.t += dt; d.life -= dt; d.cd -= dt;
      if (d.life <= 0) { burst(d.x, d.y - 40, 8, { s0: 30, s1: 90, l0: 0.3, l1: 0.6, z0: 2, z1: 4, color: ['#9fd3ec', '#fff'], shape: 'spark' }); continue; }
      d.ph += dt * 1.6;
      const tx = P.x + Math.cos(d.ph) * 80; const ty = P.y + Math.sin(d.ph) * 50;
      d.x += (tx - d.x) * Math.min(1, dt * 5); d.y += (ty - d.y) * Math.min(1, dt * 5);
      if (d.cd <= 0) {
        let tgt = null; let bd = w.seek;
        for (const m of G.mushrooms) { if (m.dead || m.type === 'good') continue; const dd = Math.hypot(m.x - d.x, m.y - d.y); if (dd < bd) { bd = dd; tgt = m; } }
        for (const e of G.enemies) { if (e.state === 'flee' || e.state === 'ally') continue; const dd = Math.hypot(e.x - d.x, e.y - d.y); if (dd < bd) { bd = dd; tgt = e; } }
        if (G.boss && !G.boss.dead) { const dd = Math.hypot(G.boss.x - d.x, G.boss.y - d.y); if (dd < bd) { bd = dd; tgt = G.boss; } }
        if (tgt) {
          d.cd = 1 / w.rate;
          const a = Math.atan2(tgt.y - (tgt.kind === 'enemy' ? 10 : 0) - (d.y - 44), tgt.x - d.x);
          G.proj.push({ x: d.x, y: d.y, vx: Math.cos(a) * w.speed, vy: Math.sin(a) * w.speed, life: 0.7, dropT: 0, h: 40, dmg: G.power > 0 ? 2 : 1, gold: G.power > 0, homing: true, turn: 5, seek: 200, t: 0, small: true });
          addParticle({ x: d.x, y: d.y - 44, vx: 0, vy: 0, ay: 0, drag: 0, life: 0.06, max: 0.06, size: 8, color: '#ff6a3d', shape: 'flash', rot: a, vr: 0, grow: 0 });
        }
      }
      keep.push(d);
    }
    G.drones = keep;
  }

  // --- ブーメラン(複数) ---
  function updateBoomerangs(dt) {
    const w = C.weapons.boomerang;
    const P = G.player;
    const keep = [];
    for (const b of G.booms) {
      b.t += dt; b.rot += dt * 18;
      if (b.leg === 0 && b.t >= b.out) { b.leg = 1; b.hit = new Set(); }
      if (b.leg === 1) {
        const a = Math.atan2(P.y - 10 - b.y, P.x - b.x);
        const cur = Math.atan2(b.vy, b.vx);
        const na = cur + clamp(angleDiff(cur, a), -8 * dt, 8 * dt);
        const sp = Math.hypot(b.vx, b.vy);
        b.vx = Math.cos(na) * sp; b.vy = Math.sin(na) * sp;
        if (Math.hypot(P.x - b.x, P.y - 10 - b.y) < 36) {
          // キャッチ: レベルアップ(3まで)
          if ((G.boomLv || 1) < 3) { G.boomLv = (G.boomLv || 1) + 1; floatText(P.x, P.y - 60, G.boomLv >= 3 ? 'MAX! Lv3' : 'キャッチ! Lv' + G.boomLv, '#ffe14d', 20); }
          G.stats.boomMax = Math.max(G.stats.boomMax || 1, G.boomLv || 1);
          ring(P.x, P.y - 10, 6, 36, 0.25, 'rgba(255,230,120,0.9)', 3);
          Sound.sfx.click();
          continue;
        }
        if (b.t > b.out + w.returnMax) { burst(b.x, b.y, 6, { s0: 20, s1: 60, l0: 0.3, l1: 0.5, z0: 2, z1: 3, color: '#ffb347', shape: 'spark' }); continue; }
      }
      b.x += b.vx * dt; b.y += b.vy * dt;
      const r = 16 + b.lv * 6;
      for (const m of G.mushrooms) { if (m.dead || m.type === 'good' || b.hit.has(m)) continue; if (Math.hypot(m.x - b.x, m.y - b.y) < m.hr + r) { b.hit.add(m); hitMushroom(m, { x: m.x, y: m.y - 8, vx: b.vx, vy: b.vy, dmg: b.dmg, gold: b.gold }); } }
      for (const e of G.enemies) { if (e.state === 'flee' || e.state === 'ally' || b.hit.has(e)) continue; if (Math.hypot(e.x - b.x, e.y - b.y) < e.def.hr + r) { b.hit.add(e); hitEnemy(e, { x: e.x, y: e.y - 10, vx: b.vx, vy: b.vy, dmg: b.dmg, gold: b.gold }); } }
      if (G.boss && !G.boss.dead && !b.hit.has(G.boss) && Math.hypot(G.boss.x - b.x, G.boss.y - 30 - b.y) < G.boss.hr + r) { b.hit.add(G.boss); hitBoss({ x: b.x, y: b.y, vx: b.vx, vy: b.vy, dmg: b.dmg, gold: b.gold }); }
      if (Math.random() < dt * 30) addParticle({ x: b.x, y: b.y, vx: rr(-10, 10), vy: rr(-10, 10), ay: 120, drag: 0, life: 0.35, max: 0.35, size: rr(1.5, 3), color: b.gold ? '#ffe14d' : '#ff3d9a', shape: 'ink', rot: 0, vr: 0, grow: 0 });
      keep.push(b);
    }
    G.booms = keep;
  }

  // ================= ボス「キノコおやかた」 =================
  function spawnBoss() {
    const P = G.player;
    const s = G.world.randomSpot(Math.random, (x, y) => { const d = Math.hypot(x - P.x, y - P.y); return d > 420 && d < 700; }, 80);
    if (!s) return false;
    const hp = Math.round(C.boss.hp * (G.loop ? 1.6 : 1));
    Meta.codexSee('boss');
    const b = { kind: 'boss', x: s.x, y: s.y, hp, maxHp: hp, t: 0, weakT: C.boss.weakEvery, weak: 0, sporeT: 2.5, cloudT: 6, cloud: 0, flash: 0, face: 1, wob: 0, hr: C.boss.hr, dead: false, intro: 2.2 };
    G.boss = b;
    if (G.ev) { for (const m of G.ev.mush) m.ev = null; G.ev = null; }
    if (G.stage === 2) { b.hp = Math.round(Town.BOSS.hp * (G.loop ? 1.6 : 1)); b.maxHp = b.hp; b.hr = Town.BOSS.hr; }
    UI.banner(G.stage === 2 ? 'リーゼント総長!' : 'キノコおやかた!');
    UI.toast(G.stage === 2 ? 'ボスが あらわれた! 髪を くしで とかしている ときが チャンス!' : 'ボスが あらわれた! かさを もちあげた ときが チャンス!', 4200);
    Sound.sfx.bossRoar();
    G.cam.shake = Math.max(G.cam.shake, 12);
    return true;
  }
  function updateBoss(dt) {
    const B = G.boss;
    if (!B) {
      if (!G.bossDone && G.timeLeft <= C.boss.at && G.timeLeft > 8) { if (spawnBoss()) G.bossDone = true; }
      return;
    }
    const P = G.player;
    B.t += dt;
    if (B.flash > 0) B.flash -= dt;
    if (B.wob > 0) B.wob -= dt;
    if (B.intro > 0) { B.intro -= dt; return; }
    const dx = P.x - B.x; const dy = P.y - B.y; const d = Math.hypot(dx, dy);
    // ゆっくり追ってくる
    if (d > 150 && B.weak <= 0) { const a = Math.atan2(dy, dx); moveBody(B, Math.cos(a) * C.boss.speed * dt, Math.sin(a) * C.boss.speed * dt, C.boss.cr); if (Math.abs(dx) > 10) B.face = dx > 0 ? 1 : -1; }
    // 弱点をさらす
    if (B.weak > 0) { B.weak -= dt; if (B.weak <= 0) B.weakT = C.boss.weakEvery; }
    else { B.weakT -= dt; if (B.weakT <= 0) { B.weak = C.boss.weakTime * (G.charmBossWeak || 1); floatText(B.x, B.y - 150, 'いまだ!', '#ffe14d', 30); Sound.sfx.charged(); } }
    // 胞子
    B.sporeT -= dt;
    if (B.sporeT <= 0 && B.weak <= 0) {
      B.sporeT = C.boss.sporeEvery;
      for (let i = 0; i < C.boss.spores; i++) {
        const a = Math.atan2(dy, dx) + (i - (C.boss.spores - 1) / 2) * 0.45 + rr(-0.1, 0.1);
        const sp = rr(150, 230);
        G.spores.push({ x: B.x, y: B.y - 80, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, z: 80, vz: rr(120, 200), t: 0 });
      }
      B.wob = 0.4;
      Sound.sfx.spore();
    }
    // 毒の雲
    if (B.cloud > 0) {
      B.cloud -= dt;
      if (G.state === 'playing' && d < C.boss.cloudR + P.r && G.power <= 0 && P.slowT <= 0.5) { P.slowT = 1.2; }
      if (Math.random() < dt * 24) addParticle({ x: B.x + rr(-C.boss.cloudR, C.boss.cloudR), y: B.y + rr(-C.boss.cloudR, C.boss.cloudR) * 0.8, vx: rr(-10, 10), vy: -rr(5, 15), ay: 0, drag: 0, life: 1.2, max: 1.2, size: rr(4, 8), color: '#a24be0', shape: 'bubble', rot: 0, vr: 0, grow: 0 });
    } else { B.cloudT -= dt; if (B.cloudT <= 0 && B.weak <= 0) { B.cloudT = C.boss.cloudEvery; B.cloud = C.boss.cloudTime; ring(B.x, B.y, 20, C.boss.cloudR, 0.6, 'rgba(170,70,230,0.8)', 8); Sound.sfx.poison(); } }
    // 体当たりで押し返す(ダメージはない: 毒の雲と子キノコで攻める)
    const min = C.boss.cr + P.r;
    if (d < min && d > 0.1) { const k = (min - d); moveBody(P, (dx / d) * k, (dy / d) * k, P.r); if (G.power > 0) hitBoss({ x: P.x, y: P.y, vx: dx * 4, vy: dy * 4, dmg: 1, gold: true }); }
  }
  function updateSpores(dt) {
    const keep = [];
    for (const s of G.spores) {
      s.t += dt;
      s.x += s.vx * dt; s.y += s.vy * dt;
      s.vz -= 420 * dt; s.z += s.vz * dt;
      if (s.z <= 0) {
        // 着地: 小さな毒キノコが生える
        if (G.world.isOpen(s.x, s.y, 16) && !nearAnyMushroom(s.x, s.y, 26)) { const m = makeMushroom('poison', s.x, s.y, false); m.hidden = false; m.pop = 0; G.mushrooms.push(m); }
        burst(s.x, s.y - 4, 6, { s0: 20, s1: 70, l0: 0.3, l1: 0.6, z0: 2, z1: 4, color: ['#c35cff', '#8a2be2'], shape: 'bubble', ay: -30 });
        continue;
      }
      keep.push(s);
    }
    G.spores = keep;
  }
  function hitBoss(p) {
    const B = G.boss;
    if (!B || B.dead) return;
    const weak = B.weak > 0;
    const dmg = (p.dmg || 1) * (weak ? C.boss.weakMul : 1);
    B.hp -= dmg; B.flash = 0.12; B.wob = 0.3;
    burst(p.x, p.y - 20, weak ? 14 : 6, { dir: Math.atan2(p.vy, p.vx), spread: 2.4, s0: 50, s1: 170, l0: 0.25, l1: 0.5, z0: 2, z1: 4.5, color: p.gold ? ['#ffe14d', '#fff'] : weak ? ['#ff3d9a', '#fff', '#ffe14d'] : ['#ff3d9a', '#ff9ad0'], shape: 'ink', ay: 260 });
    if (weak) { floatText(p.x, p.y - 60, 'クリティカル! x' + C.boss.weakMul, '#ffe14d', 22); G.hitStop = Math.max(G.hitStop, 0.05); G.cam.shake = Math.max(G.cam.shake, 4); }
    Sound.sfx.hitEnemy();
    if (B.hp <= 0) defeatBoss();
  }
  function defeatBoss() {
    const B = G.boss;
    B.dead = true;
    const pts = Math.round(C.boss.score * scoreMul());
    G.score += pts; G.stats.boss = 1;
    Meta.codexKill('boss');
    floatText(B.x, B.y - 120, '+' + pts, '#ffe14d', 40);
    UI.banner(G.stage === 2 ? '総長 たいじ!' : 'おやかた たいじ!');
    ring(B.x, B.y, 30, 420, 1.1, 'rgba(255,230,120,0.95)', 12);
    burst(B.x, B.y - 60, 70, { s0: 80, s1: 360, l0: 0.7, l1: 1.6, z0: 3, z1: 9, color: ['#ffe14d', '#ff9ad0', '#9dffb0', '#fff', '#c35cff'], shape: 'spark', drag: 1.2 });
    burst(B.x, B.y - 60, 30, { s0: 60, s1: 260, l0: 0.5, l1: 1, z0: 4, z1: 9, color: ['#ff3d9a', '#c4126a'], shape: 'ink', ay: 420, drag: 1 });
    for (let i = 0; i < 12; i++) addDecal(B.x + rr(-120, 120), B.y + rr(-60, 60), rr(1, 1.8), 'splat', 30);
    // まわりの毒キノコもいっしょにきれいに
    for (const m of G.mushrooms) if (!m.dead && m.type === 'poison' && Math.hypot(m.x - B.x, m.y - B.y) < 420) purify(m);
    G.cam.shake = Math.max(G.cam.shake, 16); G.hitStop = Math.max(G.hitStop, 0.25);
    Sound.sfx.bossDown();
    G.timeLeft += 10; floatText(G.player.x, G.player.y - 70, 'タイム +10びょう', '#9dffb0', 24);
    setTimeout(() => { if (G.boss === B) G.boss = null; }, 1800);
  }

  // ================= ミッション =================
  const POOL = [
    { id: 'p5', text: 'どくキノコを 5本 きれいに', n: 5, get: () => G.stats.purified },
    { id: 'p8', text: 'どくキノコを 8本 きれいに', n: 8, get: () => G.stats.purified },
    { id: 'c5', text: '5コンボ する', n: 5, get: () => G.combo, peak: true },
    { id: 'c8', text: '8コンボ する', n: 8, get: () => G.combo, peak: true },
    { id: 'e1', text: () => (G.stage === 2 ? 'わるものを 1人 おいはらう' : 'どうぶつを 1匹 おいはらう'), n: 1, get: () => G.stats.inked },
    { id: 'e2', text: () => (G.stage === 2 ? 'わるものを 2人 おいはらう' : 'どうぶつを 2匹 おいはらう'), n: 2, get: () => G.stats.inked },
    { id: 'b2', text: () => (G.stage === 2 ? 'けいさつかんに 2回 さわる' : 'うさぎか リスに 2回 さわる'), n: 2, get: () => G.stats.boosts },
    { id: 'g1', text: 'ふつうのキノコを 1個 たべる', n: 1, get: () => G.stats.eaten },
    { id: 'w1', text: '武器の箱を 1つ ひろう', n: 1, get: () => G.stats.crates },
    { id: 'big', text: '大きな どくキノコを 1本 たおす', n: 1, get: () => G.stats.bigs || 0 },
    { id: 'gold', text: '金色のキノコを たおす', n: 1, get: () => G.stats.gold, late: true },
    { id: 'ob', text: '大発生を 1回 しずめる', n: 1, get: () => G.stats.outbreaksCleared, late: true },
  ];
  function nextMission() {
    const M = G.missions;
    const used = new Set(M.list);
    let cand = POOL.filter((p) => !used.has(p.id) && (!p.late || M.done >= 2));
    if (!cand.length) { M.cur = null; return; }
    const p = cand[Math.floor(Math.random() * cand.length)];
    M.list.push(p.id);
    M.cur = { def: p, base: p.peak ? 0 : p.get(), prog: 0 };
  }
  function updateMissions(dt) {
    const M = G.missions;
    if (M.flash > 0) M.flash -= dt;
    if (!M.cur) return;
    const m = M.cur;
    m.prog = m.def.peak ? Math.min(m.def.n, m.def.get()) : Math.min(m.def.n, m.def.get() - m.base);
    if (m.prog >= m.def.n) {
      M.done += 1; G.stats.missions += 1;
      const pts = Math.round(C.mission.bonusScore * scoreMul());
      G.score += pts; G.timeLeft += C.mission.bonusTime;
      const P = G.player;
      floatText(P.x, P.y - 70, 'ミッション クリア! +' + pts + '  タイム +' + C.mission.bonusTime + 'びょう', '#9dffb0', 24);
      burst(P.x, P.y - 30, 18, { s0: 50, s1: 160, l0: 0.5, l1: 1, z0: 3, z1: 6, color: ['#9dffb0', '#fff6a8', '#fff'], shape: 'spark' });
      M.flash = 1.2;
      Sound.sfx.mission();
      nextMission();
    }
  }

  // ================= 仲間のどうぶつ =================
  // さわったどうぶつは、しばらくついてきて、近くの毒キノコに体当たりしてくれる
  function recruit(c) {
    if (G.companions >= C.companion.max) return false;
    c.follow = C.companion.time * (G.charmFriend || 1); c.hitT = 0; c.target = null; c.fear = false;
    G.companions += 1;
    floatText(c.x, c.y - 56, 'なかまに なった!', '#9dffb0', 18);
    return true;
  }
  function updateCompanion(c, dt) {
    const P = G.player;
    c.follow -= dt;
    if (c.follow <= 0) { c.follow = 0; c.gone = true; c.respawn = rr(8, 14); G.companions -= 1; floatText(c.x, c.y - 40, 'バイバイ!', '#fff', 16); return; }
    if (c.hitT > 0) c.hitT -= dt;
    // ねらう毒キノコ
    if (!c.target || c.target.dead || Math.hypot(c.target.x - P.x, c.target.y - P.y) > C.companion.seek + 120) {
      c.target = null; let bd = C.companion.seek;
      for (const m of G.mushrooms) { if (m.dead || m.type !== 'poison') continue; const d = Math.hypot(m.x - P.x, m.y - P.y); if (d < bd) { bd = d; c.target = m; } }
    }
    const tx = c.target ? c.target.x : P.x - 34 * (P.face || 1);
    const ty = c.target ? c.target.y : P.y + 16;
    const dx = tx - c.x; const dy = ty - c.y; const d = Math.hypot(dx, dy);
    if (c.hopping) {
      c.hopU += dt / c.hopDur;
      const v = c.hopSpeed * (Math.PI / 2) * Math.sin(Math.PI * Math.min(c.hopU, 1));
      moveBody(c, c.dx * v * dt, c.dy * v * dt, 8);
      if (c.hopU >= 1) { c.hopping = false; c.hopU = 0; c.rest = 0.08; }
    } else {
      c.rest -= dt;
      if (c.rest <= 0 && d > 18) {
        const a = Math.atan2(dy, dx) + rr(-0.25, 0.25);
        c.dx = Math.cos(a); c.dy = Math.sin(a);
        c.hopSpeed = CONFIG.critter[c.type] * (d > 200 ? 1.15 : 0.8); c.hopDur = 0.3; c.hopping = true; c.hopU = 0.001;
        if (Math.abs(c.dx) > 0.2) c.face = c.dx > 0 ? 1 : -1;
      }
    }
    if (c.target && d < c.target.hr + 10 && c.hitT <= 0) {
      c.hitT = C.companion.hitEvery;
      G.stats.companionHits = (G.stats.companionHits || 0) + 1;
      hitMushroom(c.target, { x: c.target.x, y: c.target.y - 8, vx: dx * 8, vy: dy * 8, dmg: 1, gold: false });
      c.dx = -c.dx; c.dy = -c.dy; c.hopSpeed = 120; c.hopDur = 0.25; c.hopping = true; c.hopU = 0.001;
    }
  }

  // ================= 夕方から夜 =================
  function updateDaylight() {
    const N = C.night;
    G.eve = clamp((G.t - N.eveStart) / (N.nightStart - N.eveStart), 0, 1) * (1 - clamp((G.t - N.nightStart) / (N.nightFull - N.nightStart), 0, 1));
    G.night = clamp((G.t - N.nightStart) / (N.nightFull - N.nightStart), 0, 1);
    if (!G.shownHints.night && G.night > 0.3) { G.shownHints.night = true; UI.toast('夜になってきた… どくキノコが 光って 見つけやすい。でも どうぶつは 見えにくい'); }
  }

  // ================= 虹の水てっぽう: 倒した敵が仲間になる =================
  function makeAlly(e) {
    // 仲間は さいごまで いっしょ(多すぎるときは いちばん古い仲間が おわかれ)
    const allies = G.enemies.filter((o) => o.state === 'ally');
    if (allies.length >= C.allyMax) { const old = allies[0]; old.state = 'flee'; old.st = 0; old.hp = 0; floatText(old.x, old.y - 80, 'バイバイ!', '#fff', 16); }
    e.state = 'ally'; e.st = 0; e.hp = e.maxHp; e.z = 0; e.cool = 0;
    G.stats.allies = (G.stats.allies || 0) + 1;
    floatText(e.x, e.y - 90, 'なかまに なった!', '#ff8ad0', 22);
    ring(e.x, e.y - 6, 10, 80, 0.5, 'rgba(255,138,208,0.9)', 5);
    burst(e.x, e.y - 30, 20, { s0: 60, s1: 200, l0: 0.5, l1: 0.9, z0: 3, z1: 6, color: ['#ff8ad0', '#9be0ff', '#fff6a8', '#9dffb0'], shape: 'heart', ay: -40 });
    Sound.sfx.eat();
  }
  function updateAlly(e, dt) {
    const P = G.player;
    e.allyCd = Math.max(0, (e.allyCd || 0) - dt);
    // ねらう相手: 近くの敵 → ボス → 毒キノコ → いなければ主人公のそばへ
    let tgt = null; let bd = 900; let kind = null;
    // いま追っている相手は、たおすまで追いつづける
    const cur = e.allyTgt;
    if (cur && ((cur.kind === 'enemy' && cur.state !== 'flee' && cur.state !== 'ally') || (cur.kind === 'boss' && !cur.dead && G.boss === cur) || (cur.kind === 'mushroom' && !cur.dead)) && Math.hypot(cur.x - e.x, cur.y - e.y) < 1100) {
      tgt = cur; kind = cur.kind === 'enemy' ? 'enemy' : cur.kind === 'boss' ? 'boss' : 'mush';
    } else {
      for (const o of G.enemies) { if (o === e || o.state === 'flee' || o.state === 'ally') continue; const d = Math.hypot(o.x - e.x, o.y - e.y); if (d < bd) { bd = d; tgt = o; kind = 'enemy'; } }
      if (G.boss && !G.boss.dead && G.boss.intro <= 0) { const d = Math.hypot(G.boss.x - e.x, G.boss.y - e.y) * 0.6; if (d < bd) { bd = d; tgt = G.boss; kind = 'boss'; } }
      if (!tgt) { bd = 500; for (const m of G.mushrooms) { if (m.dead || m.type !== 'poison') continue; const d = Math.hypot(m.x - e.x, m.y - e.y); if (d < bd) { bd = d; tgt = m; kind = 'mush'; } } }
      e.allyTgt = tgt;
    }
    const tx = tgt ? tgt.x : P.x - 60 * (P.face || 1); const ty = tgt ? tgt.y : P.y + 30;
    const dx = tx - e.x; const dy = ty - e.y; const d = Math.hypot(dx, dy);
    const reach = tgt ? (kind === 'enemy' ? e.def.cr + tgt.def.cr + 22 : kind === 'boss' ? C.boss.cr + e.def.cr + 24 : tgt.hr + e.def.cr + 10) : 20;
    if (d > reach * 0.85) steer(e, dx, dy, e.def.chase * 1.15, dt); else e.moving = false;
    if (Math.abs(dx) > 4) e.face = dx > 0 ? 1 : -1;
    if (tgt && d < reach && e.allyCd <= 0) {
      // 殴る! (敵は3発くらいで撃退、ボスは少しずつ、毒キノコは1発)
      e.allyCd = 0.7; e.flash = 0.1;
      const hit = { x: tx, y: ty - 10, vx: dx * 6, vy: dy * 6, dmg: kind === 'boss' ? 2 : 3, gold: false };
      burst(tx, ty - 20, 8, { dir: Math.atan2(dy, dx), spread: 1.6, s0: 50, s1: 150, l0: 0.25, l1: 0.45, z0: 2, z1: 4, color: ['#ff8ad0', '#fff', '#ffe14d'], shape: 'spark' });
      floatText(tx, ty - 60, 'ポカッ!', '#ff8ad0', 18);
      if (kind === 'enemy') { tgt.kx += dx / d * 180; tgt.ky += dy / d * 180; hitEnemy(tgt, hit); if (tgt.state === 'flee') { G.stats.allyKills = (G.stats.allyKills || 0) + 1; } }
      else if (kind === 'boss') hitBoss(hit);
      else hitMushroom(tgt, hit);
      e.kx -= dx / d * 90; e.ky -= dy / d * 90;
      Sound.sfx.hitEnemy();
    }
    if (Math.random() < dt * 4) addParticle({ x: e.x + rr(-16, 16), y: e.y - rr(30, 70), vx: 0, vy: -20, ay: 0, drag: 0, life: 0.8, max: 0.8, size: 4, color: '#ff8ad0', shape: 'heart', rot: 0, vr: 0, grow: 0 });
  }

  // ================= まとめて更新 =================
  function update(dt) {
    updateOutbreak(dt);
    updateCrates(dt);
    updateBoss(dt);
    updateSpores(dt);
    updateMissions(dt);
    updateDaylight();
    G.taints = G.taints.filter((t) => (t.life -= dt) > 0);
  }
  function onPurify(m) { if (m.big) G.stats.bigs = (G.stats.bigs || 0) + 1; }

  return { C, reset, update, weaponFire, hitBoss, makeAlly, updateAlly, recruit, updateCompanion, playerSpeedMul, inTaint, onPurify, spawnBoss, startOutbreak, spawnCrate, pickCrate };
})();
