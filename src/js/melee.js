'use strict';
/* 日本刀(近接攻撃): 近くに敵がいると自動で刀にきりかえ、ボタンを押すたびに 3段のコンボで斬る。
   1段目 横なぎ → 2段目 逆なぎ → 3段目 回転斬り(大きくふっとばす)。
   敵が攻撃をためている間に斬ると「カウンター」でひるむ。
   entities.js の updatePlayer から Melee.update を呼び、絵は art.js(drawKatana)、斬撃の弧は render.js が描く */

const Melee = (() => {
  const C = {
    engage: 140,      // この距離に敵がいると刀にきりかえる(体の表面から)
    engageArc: 1.75,  // ねらいの向きから ±この角度(rad)の敵が対象
    near: 85,         // これより近ければ向きに関係なく対象
    holdOut: 1.0,     // 敵がいなくなっても この秒数は刀のまま(ぱたぱた切りかわらないように)
    chainWindow: 0.5, // 前の斬りからこの秒以内に次を入力するとコンボがつながる
    mushDmg: 2,       // 毒キノコへのダメージ(ふつうのキノコは1発)
    counterStun: 1.1, counterScore: 50,
    // 3段コンボ。from/to は刀の角度(ねらいの向きからの相対、rad)。wind=ため active=ふっている recover=もどし
    hits: [
      { wind: 0.05, active: 0.1,  recover: 0.17, range: 118, arc: 1.35, dmg: 4, kb: 300, lunge: 85,  hitStop: 0.045, shake: 4,  from: -1.5, to: 1.2 },
      { wind: 0.04, active: 0.1,  recover: 0.16, range: 122, arc: 1.35, dmg: 4, kb: 330, lunge: 95,  hitStop: 0.05,  shake: 4,  from: 1.5,  to: -1.2 },
      { wind: 0.1,  active: 0.17, recover: 0.38, range: 150, arc: Math.PI, dmg: 7, kb: 720, lunge: 120, hitStop: 0.11, shake: 12, from: -2.7, to: 3.1, finisher: true },
    ],
  };
  const rr = (a, b) => a + Math.random() * (b - a);

  function makeState() {
    return { out: false, outT: 0, phase: 'idle', idx: 0, t: 0, since: 10, angle: 0, cur: 0, hit: new Set(), fx: null, drawT: 0, tgt: null, hitsInChain: 0 };
  }
  const busy = (P) => P.sw.phase === 'wind' || P.sw.phase === 'active';

  // 刀でねらう相手: 近くの敵・ボス(川の向こうは対象外)
  function findTarget(P, aimA) {
    let best = null;
    let bd = 1e9;
    const W = G.world;
    const test = (x, y, cr, o) => {
      const d = Math.hypot(x - P.x, y - P.y) - cr;
      if (d > C.engage) return;
      const rel = Math.abs(angleDiff(aimA, Math.atan2(y - P.y, x - P.x)));
      if (d > C.near && rel > C.engageArc) return;
      if (!W.lineClear(P.x, P.y, x, y)) return;
      const score = d + rel * 25;
      if (score < bd) { bd = score; best = o; }
    };
    for (const e of G.enemies) if (isHostile(e) && e.z < 40) test(e.x, e.y, e.def.cr, e);
    const B = G.boss;
    if (B && !B.dead && B.intro <= 0) test(B.x, B.y, G.stage === 2 ? Town.BOSS.cr : Features.C.boss.cr, B);
    return best;
  }

  function startSlash(P, aimA, tgt, chain) {
    const sw = P.sw;
    sw.idx = chain || sw.since < C.chainWindow ? (sw.idx + 1) % C.hits.length : 0;
    if (!chain && sw.since >= C.chainWindow) { sw.idx = 0; sw.hitsInChain = 0; }
    const H = C.hits[sw.idx];
    // ねらい: 近くの敵がいれば そちらへ向きを合わせる(大きくは曲げない)
    let ang = aimA;
    if (tgt) { const ta = Math.atan2(tgt.y - P.y, tgt.x - P.x); const dd = angleDiff(aimA, ta); if (Math.abs(dd) < 1.3) ang = aimA + dd; }
    sw.angle = ang; sw.phase = 'wind'; sw.t = 0; sw.cur = H.from; sw.tgt = tgt; sw.hit.clear();
    P.fireCd = Math.max(P.fireCd, 0.08);
    P.recoil = 0;
  }

  function beginActive(P) {
    const sw = P.sw;
    const H = C.hits[sw.idx];
    sw.phase = 'active'; sw.t = 0; sw.hit.clear();
    sw.fx = { x: P.x, y: P.y - 20, angle: sw.angle, from: H.from, cur: H.from, r: H.range, life: H.active + 0.22, max: H.active + 0.22, done: false, finisher: !!H.finisher, gold: G.power > 0, idx: sw.idx };
    G.slashes.push(sw.fx);
    G.stats.slashes += 1;
    Sound.sfx.swish(!!H.finisher);
    if (H.finisher) {
      // 回転斬り: 足もとの風
      ring(P.x, P.y + 2, 10, H.range * 0.9, 0.32, 'rgba(255,255,255,0.7)', 3);
      G.cam.shake = Math.max(G.cam.shake, 3);
    }
    // 草むらの中で斬ると 葉っぱが舞う
    const patch = G.world.patchAt(P.x, P.y);
    if (patch) burst(P.x + Math.cos(sw.angle) * 40, P.y - 6, H.finisher ? 18 : 9, { dir: sw.angle, spread: H.finisher ? 6.3 : 2.2, s0: 60, s1: 200, l0: 0.5, l1: 0.9, z0: 3, z1: 5, color: ['#8fd04a', '#5aab42', '#c8f07a'], shape: 'leafbit', ay: 120, drag: 2.5 });
  }

  // 斬撃の当たり判定: 刀がふれた範囲(from〜cur)に入った相手に1回ずつ当てる
  function checkHits(P, sw, H) {
    const lo = Math.min(H.from, sw.cur);
    const hi = Math.max(H.from, sw.cur);
    const inSweep = (x, y, cr) => {
      const d = Math.hypot(x - P.x, y - P.y);
      if (d > H.range + cr) return false;
      if (d < 10) return true;
      const rel = angleDiff(sw.angle, Math.atan2(y - P.y, x - P.x));
      const tol = Math.atan2(cr * 0.85, Math.max(d, 1));
      return Math.abs(rel) <= H.arc + tol && rel + tol >= lo && rel - tol <= hi;
    };
    for (const e of G.enemies) {
      if (!isHostile(e) || sw.hit.has(e) || e.z > 30) continue;
      if (!inSweep(e.x, e.y - 8, e.def.cr)) continue;
      sw.hit.add(e); strikeEnemy(P, e, H, sw);
    }
    const B = G.boss;
    if (B && !B.dead && B.intro <= 0 && !sw.hit.has(B) && inSweep(B.x, B.y - 30, B.hr * 0.7)) {
      sw.hit.add(B);
      const a = Math.atan2(B.y - 30 - P.y, B.x - P.x);
      Features.hitBoss({ x: B.x - Math.cos(a) * B.hr * 0.5, y: B.y - 10, vx: Math.cos(sw.angle) * 500, vy: Math.sin(sw.angle) * 500, dmg: H.dmg * (G.power > 0 ? 2 : 1), gold: G.power > 0, melee: true });
      sparks(P, B.x - Math.cos(a) * B.hr * 0.5, B.y - 40, sw.angle, H.finisher);
      floatText(B.x + rr(-20, 20), B.y - 150, String(H.dmg * (G.power > 0 ? 2 : 1) * (B.weak > 0 ? Features.C.boss.weakMul : 1)), B.weak > 0 ? '#ffe14d' : '#fff', H.finisher ? 30 : 22);
      feel(P, H, sw, true);
    }
    for (const m of G.mushrooms) {
      if (m.dead || m.type === 'good' || sw.hit.has(m)) continue;
      if (!inSweep(m.x, m.y, m.hr * 0.7)) continue;
      sw.hit.add(m);
      const dmg = (m.type === 'gold' ? 3 : C.mushDmg) * (G.power > 0 ? 2 : 1);
      hitMushroom(m, { x: m.x, y: m.y - 8, vx: Math.cos(sw.angle) * 520, vy: Math.sin(sw.angle) * 520, dmg, gold: G.power > 0, melee: true });
      sparks(P, m.x, m.y - 16, sw.angle, false);
      G.hitStop = Math.max(G.hitStop, 0.03);
    }
  }
  function sparks(P, x, y, a, big) {
    addParticle({ x, y, vx: 0, vy: 0, ay: 0, drag: 0, life: 0.22, max: 0.22, size: big ? 46 : 32, color: '#fff', shape: 'cut', rot: a + (Math.random() < 0.5 ? 0.5 : -0.5), vr: 0, grow: 0 });
    burst(x, y, big ? 14 : 8, { dir: a, spread: 1.8, s0: 120, s1: 340, l0: 0.16, l1: 0.34, z0: 2, z1: 4.5, color: ['#fff', '#fff6a8', '#ffe14d'], shape: 'spark', drag: 4 });
    burst(x, y, big ? 7 : 4, { dir: a, spread: 2.6, s0: 60, s1: 220, l0: 0.18, l1: 0.36, z0: 10, z1: 20, color: 'rgba(255,255,255,0.95)', shape: 'streak', drag: 3 });
  }
  // 手ごたえ: ヒットストップ・画面ゆれ・カメラのけり・ズーム
  function feel(P, H, sw, strong) {
    G.hitStop = Math.max(G.hitStop, H.hitStop);
    G.cam.shake = Math.max(G.cam.shake, H.shake);
    const k = H.finisher ? 10 : 5;
    G.cam.kx += Math.cos(sw.angle) * k; G.cam.ky += Math.sin(sw.angle) * k;
    G.zoomPunch = Math.max(G.zoomPunch || 0, H.finisher ? 0.06 : 0.025);
    if (H.finisher) G.flashWhite = Math.max(G.flashWhite || 0, 0.18);
    Sound.sfx.slashHit(!!H.finisher || strong);
    if (navigator.vibrate && Input.isTouch()) { try { navigator.vibrate(H.finisher ? 40 : 18); } catch (e) { /* 無視 */ } }
  }
  function strikeEnemy(P, e, H, sw) {
    const a = Math.atan2(e.y - P.y, e.x - P.x);
    const dmg = H.dmg * (G.power > 0 ? 2 : 1);
    const winding = e.state === 'windup' || (e.state === 'attack' && e.atk === 'charge');
    e.kx += Math.cos(a) * H.kb; e.ky += Math.sin(a) * H.kb;
    sw.hitsInChain += 1;
    hitEnemy(e, { x: e.x - Math.cos(a) * e.def.cr * 0.6, y: e.y, vx: Math.cos(sw.angle) * 40, vy: Math.sin(sw.angle) * 40, dmg, melee: true, finisher: !!H.finisher, gold: G.power > 0 });
    addParticle({ x: e.x, y: e.y - e.def.hr * 0.9, vx: 0, vy: 0, ay: 0, drag: 0, life: 0.24, max: 0.24, size: H.finisher ? 52 : 36, color: '#fff', shape: 'cut', rot: sw.angle + (sw.idx === 1 ? -0.6 : 0.6), vr: 0, grow: 0 });
    if (isHostile(e)) {
      if (winding) {
        // 攻撃のためを斬った: カウンター
        stunEnemy(e, C.counterStun); e.cool = 1.2;
        floatText(e.x, e.y - e.def.hr * 1.6 - 60, 'カウンター!', '#9be0ff', 26);
        addScore(C.counterScore, e.x, e.y - e.def.hr * 1.6 - 86, '#9be0ff');
        G.stats.counters += 1;
        G.hitStop = Math.max(G.hitStop, 0.09);
        Sound.sfx.counter();
      } else if (H.finisher) { stunEnemy(e, 0.6); }
      else if (e.state === 'chase') { e.cool = Math.max(e.cool, 0.3); }
    }
    if (sw.hitsInChain >= 3 && H.finisher && isHostile(e)) floatText(e.x, e.y - e.def.hr * 1.6 - 40, sw.hitsInChain + ' HIT!', '#ffb347', 22);
    feel(P, H, sw, false);
  }

  // 毎フレーム。戻り値 true = 刀を構えている(銃はうたない)
  function update(P, aimA, dt, firing) {
    const sw = P.sw;
    const playing = G.state === 'playing';
    const tgt = playing ? findTarget(P, aimA) : null;
    if (tgt) sw.outT = C.holdOut; else if (sw.outT > 0) sw.outT -= dt;
    const wasOut = sw.out;
    sw.out = sw.outT > 0 || sw.phase !== 'idle';
    if (sw.out && !wasOut) {
      sw.drawT = 0.16;
      ring(P.x, P.y - 20, 6, 48, 0.25, 'rgba(255,255,255,0.8)', 2.5);
      if (playing) Sound.sfx.draw();
      if (!G.shownHints.sword && playing) { G.shownHints.sword = true; UI.toast('近くの てきは 日本刀で 斬る! おしっぱなしで 3段コンボ', 3200); }
    }
    if (sw.drawT > 0) sw.drawT -= dt;
    if (sw.since < 10) sw.since += dt;
    sw.t += dt;
    if (sw.phase === 'idle') {
      if (sw.out && firing && P.dashT <= 0 && P.fireCd <= 0) { startSlash(P, aimA, tgt, false); }
      return sw.out;
    }
    const H = C.hits[sw.idx];
    if (sw.phase === 'wind' && sw.t >= H.wind) beginActive(P);
    if (sw.phase === 'active') {
      const u = clamp(sw.t / H.active, 0, 1);
      const eu = 1 - Math.pow(1 - u, 2.4);
      sw.cur = H.from + (H.to - H.from) * eu;
      // 踏みこみ(相手がすぐそこなら小さく)
      let lunge = H.lunge;
      if (sw.tgt) { const d = Math.hypot(sw.tgt.x - P.x, sw.tgt.y - P.y) - (sw.tgt.def ? sw.tgt.def.cr : 48) - P.r; lunge *= clamp(d / 70, 0.15, 1); }
      const step = (lunge / H.active) * dt;
      moveBody(P, Math.cos(sw.angle) * step, Math.sin(sw.angle) * step, P.r);
      if (sw.fx) { sw.fx.x = P.x; sw.fx.y = P.y - 20; sw.fx.cur = sw.cur; }
      checkHits(P, sw, H);
      if (sw.t >= H.active) { sw.phase = 'recover'; sw.t = 0; if (sw.fx) sw.fx.done = true; sw.cur = H.to; }
    } else if (sw.phase === 'recover') {
      if (sw.t >= H.recover) { sw.phase = 'idle'; sw.since = 0; sw.t = 0; if (H.finisher) sw.since = 10; }
      else if (firing && !H.finisher && sw.t >= H.recover * 0.5 && P.dashT <= 0) startSlash(P, aimA, tgt, true);
    }
    return true;
  }

  // 絵のための 刀の持ちかた。戻り値: { hx, hy: 手の位置(体の座標), a: 刀の角度(世界), grip: 両手なら true }
  function pose(P, t) {
    const sw = P.sw;
    const face = P.face >= 0 ? 1 : -1;
    const aim = P.aim;
    if (sw.phase === 'idle') {
      // 構え: 体の前で 斜め下に。抜いた直後は さっと振り下ろす
      const bob = Math.sin(t * 2.4) * 0.05;
      const rest = face > 0 ? 0.95 : Math.PI - 0.95;
      if (sw.drawT > 0) { const u = sw.drawT / 0.16; const up = face > 0 ? -1.9 : Math.PI + 1.9; return { hx: face * 8, hy: -24, a: rest + (up - rest) * u * u, grip: false }; }
      return { hx: face * 9 + Math.cos(aim) * 2, hy: -23 + bob * 10, a: rest + bob + Math.sin(aim) * 0.15, grip: false };
    }
    const H = C.hits[sw.idx];
    if (sw.phase === 'wind') {
      const u = clamp(sw.t / H.wind, 0, 1);
      const a = sw.angle + H.from;
      return { hx: Math.cos(sw.angle) * 4 - Math.cos(a) * 4, hy: -27 - u * 3 + Math.sin(a) * 2, a, grip: true };
    }
    if (sw.phase === 'active') { const a = sw.angle + sw.cur; return { hx: Math.cos(sw.angle) * 9, hy: -25 + Math.sin(sw.angle) * 3, a, grip: true }; }
    // recover: 振り切った位置から 構えへ
    const u = clamp(sw.t / H.recover, 0, 1);
    const ease = u * u * (3 - 2 * u);
    const end = sw.angle + H.to;
    const rest = face > 0 ? 0.95 : Math.PI - 0.95;
    return { hx: Math.cos(sw.angle) * 9 * (1 - ease) + face * 9 * ease, hy: -25 + 2 * ease, a: end + angleDiff(end, rest) * ease, grip: u < 0.6 };
  }

  return { C, makeState, update, busy, pose, findTarget };
})();
