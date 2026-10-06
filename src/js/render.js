'use strict';
/* 描画パイプライン: 地面 → 川・橋 → インクの跡 → 奥から手前へ並べた物体 → パーティクル → 画面効果 */

const Render = (() => {
  const FONT = '"Hiragino Maru Gothic ProN","Yu Gothic UI","Meiryo","Noto Sans JP","Noto Sans CJK JP","WenQuanYi Zen Hei",sans-serif';
  const OUT = Art.OUT;
  let spriteScale = 0;
  let groundPattern = null;
  let patternTried = false;
  let dapplePattern = null;
  let fxRed = null;     // 画面効果は CSS のオーバーレイ(キャンバスを全面塗りしないので軽い)
  let fxPurple = null;
  let fxLast = { r: -1, p: -1 };
  let miniBase = null;
  const drawList = [];

  // ---------- 初期化・リサイズ ----------
  function resize() {
    const canvas = G.canvas;
    const W = window.innerWidth;
    const H = window.innerHeight;
    // 重い端末では G.rs(描画の細かさ)を下げて軽くする
    let dpr = Math.min(window.devicePixelRatio || 1, CONFIG.view.maxDpr) * (G.rs || 1);
    while (W * H * dpr * dpr > CONFIG.view.maxPixels && dpr > 0.5) dpr *= 0.9;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    const V = CONFIG.view;
    let zoom = Math.sqrt((W * H) / V.targetArea);
    zoom = Math.min(zoom, W / V.minW, H / V.minH);
    const v = G.view;
    v.W = W; v.H = H; v.dpr = dpr; v.zoom = zoom; v.vw = W / zoom; v.vh = H / zoom;
    const need = clamp(Math.ceil(zoom * dpr), 1, 4);
    if (need !== spriteScale) { spriteScale = need; Art.init(need); groundPattern = null; patternTried = false; dapplePattern = null; }
    // ミニマップの解像度
    const mm = G.mini;
    if (mm) {
      const size = Math.round(parseFloat(getComputedStyle(mm).width) || 140);
      mm.width = Math.round(size * dpr); mm.height = Math.round(size * dpr);
    }
  }

  function makeGroundPattern(ctx) {
    patternTried = true;
    const TILE_U = 320;
    let ps = Math.max(1, spriteScale);
    const test = ctx.createPattern(document.createElement('canvas'), 'repeat');
    const canScale = !!(test && typeof test.setTransform === 'function' && typeof DOMMatrix !== 'undefined');
    if (!canScale) ps = 1; // 拡大縮小できないときは 1px=1ユニットのまま使う
    const c = document.createElement('canvas');
    c.width = TILE_U * ps; c.height = TILE_U * ps;
    const g = c.getContext('2d');
    g.scale(ps, ps);
    const rnd = mulberry32(5);
    const wrap = (x, y, fn) => { for (const ox of [-TILE_U, 0, TILE_U]) for (const oy of [-TILE_U, 0, TILE_U]) fn(x + ox, y + oy); };
    for (let i = 0; i < 34; i++) {
      const x = rnd() * TILE_U; const y = rnd() * TILE_U; const r = 16 + rnd() * 40;
      const k = rnd();
      g.fillStyle = k < 0.35 ? 'rgba(170,215,95,0.22)' : k < 0.7 ? 'rgba(55,125,55,0.2)' : 'rgba(120,170,60,0.18)';
      wrap(x, y, (px, py) => { g.beginPath(); g.ellipse(px, py, r, r * 0.65, 0, 0, TAU); g.fill(); });
    }
    g.lineCap = 'round';
    for (let i = 0; i < 420; i++) {
      const x = rnd() * TILE_U; const y = rnd() * TILE_U;
      const k = rnd();
      g.strokeStyle = k < 0.4 ? 'rgba(50,120,50,0.35)' : k < 0.75 ? 'rgba(190,235,120,0.4)' : 'rgba(90,160,60,0.35)';
      g.lineWidth = 1.2 + rnd() * 0.8;
      const h = 3 + rnd() * 6;
      const bend = (rnd() - 0.5) * 4;
      wrap(x, y, (px, py) => { g.beginPath(); g.moveTo(px, py); g.quadraticCurveTo(px + bend * 0.4, py - h * 0.6, px + bend, py - h); g.stroke(); });
    }
    // 木もれ日のまだら
    for (let i = 0; i < 16; i++) {
      const x = rnd() * TILE_U; const y = rnd() * TILE_U; const r = 22 + rnd() * 40;
      wrap(x, y, (px, py) => {
        const gr = g.createRadialGradient(px, py, 0, px, py, r);
        gr.addColorStop(0, 'rgba(255,250,190,0.28)'); gr.addColorStop(1, 'rgba(255,250,190,0)');
        g.fillStyle = gr; g.beginPath(); g.ellipse(px, py, r, r * 0.65, 0.4, 0, TAU); g.fill();
      });
    }
    groundPattern = ctx.createPattern(c, 'repeat');
    if (canScale && groundPattern) {
      try { groundPattern.setTransform(new DOMMatrix().scale(1 / ps)); } catch (e) { groundPattern = null; }
    }
  }

  // ---------- 土の小道 ----------
  function drawPaths(ctx, left, top, right, bottom) {
    const W = G.world;
    if (!W.paths) return;
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    for (const p of W.paths) {
      if (!p.p2d) {
        const d = new Path2D();
        p.path.forEach((pt, i) => (i ? d.lineTo(pt.x, pt.y) : d.moveTo(pt.x, pt.y)));
        p.p2d = d;
        let x0 = 1e9; let y0 = 1e9; let x1 = -1e9; let y1 = -1e9;
        for (const pt of p.path) { x0 = Math.min(x0, pt.x); y0 = Math.min(y0, pt.y); x1 = Math.max(x1, pt.x); y1 = Math.max(y1, pt.y); }
        p.box = [x0 - 60, y0 - 60, x1 + 60, y1 + 60];
      }
      if (p.box[2] < left || p.box[0] > right || p.box[3] < top || p.box[1] > bottom) continue;
      ctx.lineWidth = p.w + 18; ctx.strokeStyle = 'rgba(120,140,60,0.28)'; ctx.stroke(p.p2d);
      ctx.lineWidth = p.w; ctx.strokeStyle = 'rgba(176,146,92,0.55)'; ctx.stroke(p.p2d);
      // ふまれて固まった土の明るいところ(点々と)
      if (!p.spots) { const rnd = mulberry32(p.path.length); p.spots = p.path.filter((_, i) => i % 3 === 0).map((pt) => [pt.x + (rnd() - 0.5) * p.w * 0.5, pt.y + (rnd() - 0.5) * p.w * 0.5, 4 + rnd() * 7]); }
      ctx.fillStyle = 'rgba(205,180,125,0.45)';
      for (const [x, y, r] of p.spots) { if (x < left - 20 || x > right + 20 || y < top - 20 || y > bottom + 20) continue; ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.55, 0, 0, TAU); ctx.fill(); }
    }
  }

  // ---------- まち: 道路・歩道 ----------
  function drawRoads(ctx, t, left, top, right, bottom) {
    const W = G.world;
    if (!W.roads) return;
    const RW = 110; const SW = 34;
    ctx.lineCap = 'butt';
    for (const pass of [[RW + SW * 2, '#cfcac0'], [RW + SW * 2 - 4, '#dedad0'], [RW, '#5a5e66'], [RW - 8, '#666a73']]) {
      ctx.lineWidth = pass[0]; ctx.strokeStyle = pass[1];
      for (const r of W.roads) { if (r.x0 === r.x1 ? (r.x0 + pass[0] < left || r.x0 - pass[0] > right) : (r.y0 + pass[0] < top || r.y0 - pass[0] > bottom)) continue; ctx.beginPath(); ctx.moveTo(r.x0, r.y0); ctx.lineTo(r.x1, r.y1); ctx.stroke(); }
    }
    // センターライン(白い破線)と歩道のタイル線
    ctx.setLineDash([26, 26]); ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    for (const r of W.roads) { ctx.beginPath(); ctx.moveTo(r.x0, r.y0); ctx.lineTo(r.x1, r.y1); ctx.stroke(); }
    ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(120,115,105,0.35)'; ctx.lineWidth = 1;
    for (const r of W.roads) {
      if (r.x0 === r.x1) { for (const sx of [-1, 1]) { const x = r.x0 + sx * (RW / 2 + SW / 2); if (x < left - 20 || x > right + 20) continue; for (let y = Math.max(top, r.y0); y < Math.min(bottom, r.y1); y += 40) { ctx.beginPath(); ctx.moveTo(x - SW / 2, Math.floor(y / 40) * 40); ctx.lineTo(x + SW / 2, Math.floor(y / 40) * 40); ctx.stroke(); } } }
      else { for (const sy of [-1, 1]) { const y = r.y0 + sy * (RW / 2 + SW / 2); if (y < top - 20 || y > bottom + 20) continue; for (let x = Math.max(left, r.x0); x < Math.min(right, r.x1); x += 40) { ctx.beginPath(); ctx.moveTo(Math.floor(x / 40) * 40, y - SW / 2); ctx.lineTo(Math.floor(x / 40) * 40, y + SW / 2); ctx.stroke(); } } }
    }
  }

  // ---------- 川・池・橋 ----------
  function riverPath(r) {
    if (!r.p2d) {
      const p = new Path2D();
      r.path.forEach((pt, i) => (i ? p.lineTo(pt.x, pt.y) : p.moveTo(pt.x, pt.y)));
      r.p2d = p;
    }
    return r.p2d;
  }
  function drawWater(ctx, t, left, top, right, bottom) {
    const W = G.world;
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    for (const r of W.rivers) {
      const p = riverPath(r);
      const layers = [[r.w + 40, 'rgba(90,110,50,0.35)'], [r.w + 30, '#b9a86e'], [r.w + 20, '#e5d8a4'], [r.w + 8, '#9fd9ea'], [r.w - 8, '#5cb9e3'], [r.w - 34, '#3f93cf'], [r.w - 64, '#3279b8']];
      for (const [w, c] of layers) { ctx.lineWidth = w; ctx.strokeStyle = c; ctx.stroke(p); }
      // 岸の影と水中の石
      ctx.lineWidth = r.w - 4; ctx.strokeStyle = 'rgba(20,60,110,0.12)'; ctx.save(); ctx.translate(3, 5); ctx.stroke(p); ctx.restore();
      // 流れのきらめき(細く短い光)と、岸ぎわの白い泡
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(255,255,255,0.42)'; ctx.lineWidth = 2; ctx.setLineDash([7, 64]);
      for (const [ox, oy, sp] of [[0, 0, 26], [16, -12, 19], [-18, 10, 23], [8, 20, 17]]) {
        ctx.lineDashOffset = -t * sp;
        ctx.save(); ctx.translate(ox, oy); ctx.stroke(p); ctx.restore();
      }
      ctx.strokeStyle = 'rgba(255,255,255,0.28)'; ctx.lineWidth = r.w - 6; ctx.setLineDash([3, 46]); ctx.lineDashOffset = -t * 12; ctx.stroke(p);
      ctx.setLineDash([]);
    }
    for (const p of W.ponds) {
      if (p.x + p.rx < left - 40 || p.x - p.rx > right + 40 || p.y + p.ry < top - 40 || p.y - p.ry > bottom + 40) continue;
      const el = (k, c) => { ctx.beginPath(); ctx.ellipse(p.x, p.y, p.rx * k, p.ry * k, 0, 0, TAU); ctx.fillStyle = c; ctx.fill(); };
      el(1.22, 'rgba(90,110,50,0.35)'); el(1.16, '#b9a86e'); el(1.1, '#e5d8a4'); el(1.03, '#9fd9ea'); el(0.93, '#5cb9e3'); el(0.72, '#3f93cf'); el(0.45, '#3279b8');
      ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 2.4; ctx.lineCap = 'round';
      for (let i = 0; i < 4; i++) {
        const a = i * 1.7 + t * 0.15;
        ctx.beginPath(); ctx.ellipse(p.x, p.y, p.rx * (0.45 + i * 0.1), p.ry * (0.45 + i * 0.1), 0, a, a + 0.7); ctx.stroke();
      }
      for (const pad of p.pads) {
        const bob = Math.sin(t * 1.5 + pad.x) * 0.8;
        ctx.save(); ctx.translate(pad.x, pad.y + bob);
        ctx.beginPath(); ctx.ellipse(0, 0, pad.r, pad.r * 0.62, 0, 0.35, TAU - 0.35); ctx.lineTo(0, 0); ctx.closePath();
        ctx.fillStyle = '#5ed06c'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#2b7a4a'; ctx.stroke();
        if (pad.flower) { Art.circ(ctx, 2, -2, 4, '#ffd0ea', 1.4); Art.circ(ctx, 2, -2, 1.6, '#ffe14d', 0); }
        ctx.restore();
      }
    }
  }

  // ---------- 1つずつ描く ----------
  function drawTree(ctx, o, t, fade) {
    const S = Art.S;
    if (o.kind === 'pine') {
      ctx.save(); ctx.translate(o.x, o.y);
      ctx.transform(1, 0, -Math.sin(t * 1.1 + o.ph) * 0.012, 1, 0, 0);
      if (fade) ctx.globalAlpha = 0.5;
      Art.blit(ctx, S.pine[o.v], 0, 0, o.s);
      ctx.restore();
      return;
    }
    Art.blit(ctx, S.trunk, o.x, o.y, o.s);
    ctx.save(); ctx.translate(o.x, o.y);
    ctx.transform(1, 0, -Math.sin(t * 1.3 + o.ph) * 0.022, 1, 0, 0);
    if (fade) ctx.globalAlpha = 0.5;
    Art.blit(ctx, S.canopy[o.v], 0, 0, o.s);
    ctx.restore();
  }

  function drawFire(ctx, o, t) {
    const S = Art.S;
    if (Math.random() < 0.08) addParticle({ x: o.x + rr(-4, 4), y: o.y - 30, vx: rr(6, 16), vy: -rr(18, 30), ay: -6, drag: 0.4, life: rr(2.2, 3.4), max: 3.4, size: rr(5, 8), grow: 7, color: 'rgba(230,230,230,0.35)', shape: 'dust', rot: 0, vr: 0 });
    ctx.save(); ctx.globalAlpha = 0.75 + Math.sin(t * 9 + o.ph) * 0.15;
    Art.blit(ctx, S.glowWarm, o.x, o.y - 14, 1.2);
    ctx.restore();
    Art.shadow(ctx, 16, 5, 0.24, 0, 3);
    ctx.save(); ctx.translate(o.x, o.y);
    // まき
    for (const a of [-0.5, 0.5]) { ctx.save(); ctx.rotate(a); Art.rrect(ctx, -15, -4, 30, 8, 4, '#8a5a38', 2); ctx.restore(); }
    // ほのお
    const fl = (s, c, dy) => {
      const w = 1 + Math.sin(t * 11 + s) * 0.12;
      ctx.beginPath(); ctx.moveTo(-9 * s * w, -3); ctx.quadraticCurveTo(-11 * s, -18 * s, 0, -30 * s * (1 + Math.sin(t * 9 + s * 3) * 0.1)); ctx.quadraticCurveTo(11 * s, -18 * s, 9 * s * w, -3); ctx.closePath();
      ctx.fillStyle = c; ctx.fill(); if (dy) { ctx.lineWidth = 2; ctx.strokeStyle = OUT; ctx.stroke(); }
    };
    fl(1, '#ff7a3d', true); fl(0.68, '#ffc83d', false); fl(0.38, '#fff3a0', false);
    ctx.restore();
  }

  function drawMushroom(ctx, m, t) {
    if (m.hidden) return;
    const S = Art.S;
    if (m.type === 'gold') {
      ctx.save(); ctx.globalAlpha = 0.6 + Math.sin(t * 6) * 0.25;
      Art.blit(ctx, S.glowGold, m.x, m.y - 18, 0.9);
      ctx.restore();
      ctx.save(); ctx.translate(m.x, m.y);
      const sq = m.hitT > 0 ? 1 + m.hitT * 2 : 1;
      const gs = CONFIG.scale.mushroom;
      ctx.scale(m.face * sq * gs, (2 - sq) * gs);
      Art.drawGold(ctx, m, t);
      ctx.restore();
      // 残り時間
      const w = 44;
      const k = clamp(m.life / CONFIG.mushroom.goldLife, 0, 1);
      ctx.fillStyle = 'rgba(40,20,50,0.7)'; ctx.fillRect(m.x - w / 2 - 1.5, m.y - 78, w + 3, 7);
      ctx.fillStyle = '#ffe14d'; ctx.fillRect(m.x - w / 2, m.y - 76.5, w * k, 4);
      if (m.hp < m.maxHp) { ctx.fillStyle = 'rgba(40,20,50,0.7)'; ctx.fillRect(m.x - w / 2 - 1.5, m.y - 70, w + 3, 7); ctx.fillStyle = '#ff3d9a'; ctx.fillRect(m.x - w / 2, m.y - 68.5, (w * m.hp) / m.maxHp, 4); }
      return;
    }
    const poison = m.type === 'poison';
    const e = m.pop;
    const back = 1 + 2.2 * Math.pow(e - 1, 3) + 1.2 * Math.pow(e - 1, 2); // ぴょこっと飛び出す
    const wob = m.wob > 0 ? Math.sin(t * 38) * 0.16 * (m.wob / 0.3) : 0;
    const idle = Math.sin(t * 3 + m.t * 1.2) * 0.03 + (m.hitT > 0 ? -m.hitT * 1.6 : 0);
    const sc = m.size * clamp(back, 0.01, 1.3) * CONFIG.scale.mushroom;
    const glowA = Math.min(1, 0.55 + Math.sin(t * 4 + m.t) * 0.2 + (G.night || 0) * 0.45);
    ctx.save(); ctx.globalAlpha = glowA;
    Art.blit(ctx, poison ? S.glowPoison : S.glowGood, m.x, m.y - 22 * m.size, 0.74 * m.size);
    ctx.restore();
    ctx.save(); ctx.translate(m.x, m.y);
    ctx.rotate(wob);
    ctx.scale(sc * (1 - idle), sc * (1 + idle));
    Art.blit(ctx, S.mush[m.type][m.v], 0, 0, 1);
    // インクがついた分だけピンクに
    if (poison && m.hp < m.maxHp) {
      const n = Math.min(m.maxHp - m.hp, 5);
      const spots = [[-9, -32, 6.4], [8, -37, 5.4], [11, -24, 5], [-3, -24, 4.4], [-14, -22, 4]];
      for (let i = 0; i < n; i++) { const [x, y, r] = spots[i]; ctx.fillStyle = Art.INK.main; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.beginPath(); ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.3, 0, TAU); ctx.fill(); }
    }
    ctx.restore();
    if (m.inPatch) drawGrassFront(ctx, m.x, m.y, 1);
    if (m.big && m.hp < m.maxHp) {
      const w = 44;
      ctx.fillStyle = 'rgba(40,20,50,0.7)'; ctx.fillRect(m.x - w / 2 - 1.5, m.y - 108, w + 3, 8);
      ctx.fillStyle = '#ff3d9a'; ctx.fillRect(m.x - w / 2, m.y - 106.5, (w * m.hp) / m.maxHp, 5);
    }
  }
  function drawGrassFront(ctx, x, y, s) {
    ctx.fillStyle = '#4fae3c'; ctx.strokeStyle = '#2f7a3a'; ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (const [dx, h, w] of [[-12, 16, 3.4], [-6, 12, 3], [4, 14, 3.2], [11, 17, 3.4], [-1, 10, 2.8]]) {
      ctx.moveTo(x + dx * s - w, y + 3); ctx.quadraticCurveTo(x + dx * s - w * 0.3, y - h * 0.6, x + dx * s + w * 0.4, y - h); ctx.quadraticCurveTo(x + dx * s + w * 0.6, y - h * 0.4, x + dx * s + w, y + 3);
    }
    ctx.fill(); ctx.stroke();
  }

  // ヒットした瞬間の白いシルエット: 別のキャンバスに描いて白で塗り、重ねる
  let flashCv = null;
  let flashG = null;
  function drawFlashed(ctx, x, y, alpha, drawFn, color) {
    const ps = Math.max(1, spriteScale);
    const Wd = 320; const Hd = 340; const oy = Hd * 0.8;
    if (!flashCv) { flashCv = document.createElement('canvas'); }
    if (flashCv.width !== Wd * ps) { flashCv.width = Wd * ps; flashCv.height = Hd * ps; flashG = flashCv.getContext('2d'); }
    const g = flashG;
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, flashCv.width, flashCv.height);
    g.setTransform(ps, 0, 0, ps, (Wd / 2) * ps, oy * ps);
    G.noShadow = true;
    drawFn(g);
    G.noShadow = false;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'source-atop'; g.fillStyle = color || '#fff'; g.fillRect(0, 0, flashCv.width, flashCv.height); g.globalCompositeOperation = 'source-over';
    ctx.save(); ctx.globalAlpha = alpha; ctx.drawImage(flashCv, x - Wd / 2, y - oy, Wd, Hd); ctx.restore();
  }
  function drawEnemyBody(ctx, o, t) {
    const dir = o.face >= 0 ? 1 : -1;
    const sq = o.flash > 0 ? 1 + o.flash * 0.9 : 1;
    const ES = CONFIG.scale.enemy;
    if (o.type === 'boar') { ctx.scale(dir * sq * ES, (2 - sq) * ES); Art.drawBoar(ctx, o, t); }
    else if (o.type === 'thief' || o.type === 'zombie' || o.type === 'yankee') { ctx.scale(sq * ES, (2 - sq) * ES); (o.type === 'thief' ? Town.drawThief : o.type === 'zombie' ? Town.drawZombie : Town.drawYankee)(ctx, o, t); }
    else { ctx.scale(sq * ES, (2 - sq) * ES); if (o.type === 'bear') Art.drawBear(ctx, o, t); else Art.drawGorilla(ctx, o, t); }
  }
  function drawEntityItem(ctx, o, t) {
    const P = G.player;
    switch (o.kind) {
      case 'mushroom': drawMushroom(ctx, o, t); break;
      case 'crate': ctx.save(); ctx.translate(o.x, o.y); Art.drawCrate(ctx, o, t); ctx.restore(); break;
      case 'boss': {
        ctx.save(); ctx.translate(o.x, o.y);
        const bz = o.z || 0;
        if (bz > 0) { Art.shadow(ctx, 70 - bz * 0.15, 24 - bz * 0.05, 0.35, 0, 4); ctx.translate(0, -bz); G.noShadow = true; }
        if (o.rage && !o.dead) { ctx.save(); ctx.globalAlpha = 0.35 + Math.sin(t * 12) * 0.15; Art.blit(ctx, Art.S.glowPoison, 0, -90, 2.4); ctx.restore(); }
        if (G.stage === 2) Town.drawBossYankee(ctx, o, t); else { ctx.scale(o.face || 1, 1); Art.drawBoss(ctx, o, t); }
        G.noShadow = false;
        ctx.restore();
        break;
      }
      case 'critter':
        ctx.save(); ctx.translate(o.x, o.y); ctx.scale(CONFIG.scale.critter, CONFIG.scale.critter);
        if (o.type === 'rabbit') Art.drawRabbit(ctx, o, t); else if (o.type === 'police') Town.drawPolice(ctx, o, t); else Art.drawSquirrel(ctx, o, t);
        ctx.restore();
        if (o.follow > 0) { ctx.save(); ctx.translate(o.x, o.y - 44 + Math.sin(t * 5) * 2); heartPath(ctx, 0, 0, 6); ctx.fillStyle = '#ff6fa0'; ctx.fill(); ctx.lineWidth = 1.6; ctx.strokeStyle = OUT; ctx.stroke(); ctx.restore(); }
        break;
      case 'enemy': {
        if (o.state === 'gone') break;
        if (o.state === 'launched') {
          // ふっとび中: 影は地面に、体は回転しながら宙を飛ぶ
          const z = o.z || 0;
          Art.shadow(ctx, 30 - z * 0.05, 11 - z * 0.02, 0.3, o.x, o.y + 2);
          ctx.save(); ctx.translate(o.x, o.y - z);
          const cy = -o.def.hr * 1.1;
          ctx.translate(0, cy); ctx.rotate(o.spin); ctx.translate(0, -cy);
          G.noShadow = true; drawEnemyBody(ctx, o, t); G.noShadow = false;
          ctx.restore();
          break;
        }
        ctx.save(); ctx.translate(o.x, o.y);
        drawEnemyBody(ctx, o, t);
        ctx.restore();
        if (o.hitFlash > 0) drawFlashed(ctx, o.x, o.y, Math.min(1, o.hitFlash * 12), (g) => drawEnemyBody(g, o, t));
        if (o.state === 'ally') { ctx.save(); ctx.translate(o.x, o.y - 100 + Math.sin(t * 5) * 3); heartPath(ctx, 0, 0, 8); ctx.fillStyle = '#ff8ad0'; ctx.fill(); ctx.lineWidth = 1.8; ctx.strokeStyle = OUT; ctx.stroke(); ctx.restore(); }
        break;
      }
      case 'player': {
        if (G.power > 0) {
          ctx.save(); ctx.globalAlpha = 0.55 + Math.sin(t * 14) * 0.2;
          Art.blit(ctx, Art.S.glowGold, o.x, o.y - 22, 1.5 + Math.sin(t * 7) * 0.15);
          ctx.restore();
          // 足もとの光の輪
          ctx.save(); ctx.translate(o.x, o.y + 2); ctx.rotate(t * 2.5);
          ctx.strokeStyle = 'rgba(255,230,120,0.85)'; ctx.lineWidth = 3; ctx.setLineDash([14, 9]);
          ctx.beginPath(); ctx.ellipse(0, 0, 30, 14, 0, 0, TAU); ctx.stroke(); ctx.restore();
        }
        // ダッシュの残像
        const PS = CONFIG.scale.player;
        for (const gh of G.ghosts || []) {
          drawFlashed(ctx, gh.x, gh.y, 0.5 * (gh.life / gh.max), (g) => { g.scale(PS, PS); Art.drawBoy(g, gh, t, true); }, '#bfefff');
        }
        ctx.save(); ctx.translate(o.x, o.y);
        if (o.invuln > 0 && o.dashT <= 0 && G.power <= 0 && Math.floor(t * 18) % 2 === 0) ctx.globalAlpha = 0.45;
        const sq = o.hurtT > 0 ? 1 + o.hurtT * 0.25 : 1;
        ctx.scale(sq * PS, (2 - sq) * PS);
        Art.drawBoy(ctx, o, t);
        ctx.restore();
        if (G.weapon === 'boomerang' && (G.boomLv || 1) > 1) { ctx.font = `800 13px ${FONT}`; ctx.textAlign = 'center'; ctx.lineWidth = 3; ctx.strokeStyle = OUT; ctx.strokeText('Lv' + G.boomLv, o.x, o.y - 70); ctx.fillStyle = '#ffe14d'; ctx.fillText('Lv' + G.boomLv, o.x, o.y - 70); }
        break;
      }
      default: break;
    }
  }

  function drawObstacle(ctx, o, t, fade) {
    const S = Art.S;
    switch (o.kind) {
      case 'tree': case 'pine': drawTree(ctx, o, t, fade); break;
      case 'willow': ctx.save(); ctx.translate(o.x, o.y); ctx.transform(1, 0, -Math.sin(t * 1.0 + o.ph) * 0.03, 1, 0, 0); if (fade) ctx.globalAlpha = 0.5; Art.blit(ctx, S.willow[o.v], 0, 0, o.s); ctx.restore(); break;
      case 'dead': if (fade) ctx.globalAlpha = 0.5; Art.blit(ctx, S.dead, o.x, o.y, o.s); ctx.globalAlpha = 1; break;
      case 'line': Art.blit(ctx, S.line, o.x, o.y, 1); break;
      case 'bush': Art.blit(ctx, S.bush[o.v], o.x, o.y, o.s); break;
      case 'rock': Art.blit(ctx, S.rock[o.v][o.moss ? 1 : 0], o.x, o.y, o.s); break;
      case 'stump': Art.blit(ctx, S.stump, o.x, o.y, o.s); break;
      case 'log':
        ctx.save(); ctx.translate(o.cx, o.cy); ctx.rotate(o.ang);
        Art.blit(ctx, S.log[o.v], 0, 0, o.s); ctx.restore();
        break;
      case 'mountain':
        if (fade) ctx.globalAlpha = 0.5;
        Art.blit(ctx, S.mountain[o.v], o.x, o.y, o.s);
        ctx.globalAlpha = 1;
        break;
      case 'tent': Art.blit(ctx, S.tent[o.v], o.x, o.y, 1); break;
      case 'building': Town.drawBuilding(ctx, o, t, fade); break;
      case 'car': Town.drawCar(ctx, o, t); break;
      case 'lamp': Town.drawLamp(ctx, o, t); break;
      case 'hydrant': case 'bin': case 'bench': case 'fence': case 'fountain': Town.drawSmall(ctx, o, t); break;
      case 'fire': drawFire(ctx, o, t); break;
      default: break;
    }
  }

  // ---------- 草むら ----------
  function drawPatch(ctx, p, t) {
    const near = (G.player.x - p.x) ** 2 + (G.player.y - p.y) ** 2 < (p.r + 70) ** 2;
    ctx.fillStyle = 'rgba(40,120,60,0.28)';
    ctx.beginPath(); ctx.ellipse(p.x, p.y + 4, p.r * 1.02, p.r * 0.8, 0, 0, TAU); ctx.fill();
    const cols = [['#4ba83a', '#2f7a3a'], ['#62bd45', '#2f7a3a'], ['#7bd053', '#3a8a40']];
    for (let c = 0; c < 3; c++) {
      ctx.beginPath();
      for (const b of p.blades) {
        if (b.c !== c) continue;
        const sway = Math.sin(t * (near ? 4.2 : 1.6) + b.ph) * (near ? 5 : 2.4);
        const x = p.x + b.dx;
        const y = p.y + b.dy;
        ctx.moveTo(x - b.w, y);
        ctx.quadraticCurveTo(x - b.w * 0.2 + sway * 0.4, y - b.h * 0.6, x + sway, y - b.h);
        ctx.quadraticCurveTo(x + b.w * 0.3 + sway * 0.4, y - b.h * 0.5, x + b.w, y);
      }
      ctx.fillStyle = cols[c][0]; ctx.fill();
      ctx.strokeStyle = cols[c][1]; ctx.lineWidth = 1; ctx.stroke();
    }
  }

  // ---------- インクの跡 ----------
  function drawDecals(ctx, left, top, right, bottom) {
    const S = Art.S;
    for (const d of G.decals) {
      if (!d) continue;
      if (d.x < left - 50 || d.x > right + 50 || d.y < top - 50 || d.y > bottom + 50) continue;
      const a = clamp((d.max - d.t) / 3, 0, 1);
      if (a <= 0) continue;
      const pop = Math.min(1, d.t / 0.08 + 0.4);
      ctx.save(); ctx.translate(d.x, d.y); ctx.rotate(d.rot); ctx.globalAlpha = a * (d.type === 'drop' ? 0.85 : 0.92);
      if (d.type === 'drop') Art.blit(ctx, S.splatSmall, 0, 0, d.s * 1.3 * pop);
      else if (d.type === 'gsplat') Art.blit(ctx, S.gsplat[d.v], 0, 0, d.s * pop);
      else if (d.type === 'flower') { ctx.rotate(-d.rot); Art.blit(ctx, S.inkFlower, 0, 0, d.s * pop); }
      else Art.blit(ctx, S.splat[d.v], 0, 0, d.s * pop);
      ctx.restore();
    }
  }

  // ---------- 大発生・汚染・ボスの毒の雲 ----------
  function zone(ctx, x, y, r, inner, outer) {
    const gr = ctx.createRadialGradient(x, y, r * 0.2, x, y, r);
    gr.addColorStop(0, inner); gr.addColorStop(1, outer);
    ctx.fillStyle = gr; ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.85, 0, 0, TAU); ctx.fill();
  }
  function drawZones(ctx, t) {
    for (const z of G.taints || []) { const a = Math.min(1, z.life / 5) * 0.5; zone(ctx, z.x, z.y, z.r, `rgba(120,40,170,${a})`, 'rgba(120,40,170,0)'); }
    const ev = G.ev;
    if (ev) {
      const pulse = 0.45 + Math.sin(t * 4) * 0.1;
      zone(ctx, ev.x, ev.y, ev.r, `rgba(140,40,200,${pulse})`, 'rgba(140,40,200,0)');
      ctx.strokeStyle = `rgba(200,90,255,${0.5 + Math.sin(t * 6) * 0.3})`; ctx.lineWidth = 3; ctx.setLineDash([12, 10]); ctx.lineDashOffset = -t * 30;
      ctx.beginPath(); ctx.ellipse(ev.x, ev.y, ev.r, ev.r * 0.85, 0, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
    }
    const B = G.boss;
    if (B && B.cloud > 0) { const k = Math.min(1, B.cloud / 0.6); zone(ctx, B.x, B.y, Features.C.boss.cloudR, `rgba(150,50,220,${0.5 * k})`, 'rgba(150,50,220,0)'); }
    // ボスの大技の予告(赤いゾーン)
    if (B && !B.dead && B.atk && (B.aphase === 'wind' || (B.atk === 'stomp' && B.aphase === 'go'))) {
      const CB = Features.C.boss;
      const u = B.aphase === 'wind' ? clamp(B.ast / B.windDur, 0, 1) : 1;
      ctx.save();
      ctx.fillStyle = `rgba(255,50,60,${0.18 + 0.1 * Math.sin(t * 22) + u * 0.12})`; ctx.strokeStyle = 'rgba(255,60,70,0.9)'; ctx.lineWidth = 3; ctx.setLineDash([12, 8]);
      if (B.atk === 'stomp') {
        let tx = B.tx; let ty = B.ty;
        if (B.aphase === 'wind') { const dd = Math.min(Math.hypot(B.tx - B.x, B.ty - B.y), 420); tx = B.x + Math.cos(B.aim) * dd; ty = B.y + Math.sin(B.aim) * dd; }
        ctx.beginPath(); ctx.ellipse(tx, ty, CB.stompR, CB.stompR * 0.8, 0, 0, TAU); ctx.fill(); ctx.stroke();
        ctx.setLineDash([]); ctx.fillStyle = 'rgba(255,60,70,0.35)'; ctx.beginPath(); ctx.ellipse(tx, ty, CB.stompR * u, CB.stompR * 0.8 * u, 0, 0, TAU); ctx.fill();
      } else {
        const len = CB.chargeSpeed * CB.chargeTime * (B.rage ? 1.15 : 1);
        ctx.translate(B.x, B.y); ctx.rotate(B.aim);
        ctx.beginPath(); ctx.rect(0, -CB.cr - 6, len, (CB.cr + 6) * 2); ctx.fill(); ctx.stroke();
        ctx.setLineDash([]); ctx.fillStyle = 'rgba(255,60,70,0.35)'; ctx.fillRect(0, -CB.cr - 6, len * u, (CB.cr + 6) * 2);
      }
      ctx.restore();
    }
  }

  // ---------- 敵の攻撃予告(赤いゾーン) ----------
  function drawTelegraphs(ctx, t) {
    for (const e of G.enemies) {
      if (e.state !== 'windup' && !(e.state === 'attack' && e.atk === 'leap')) continue;
      const u = e.state === 'windup' ? clamp(e.st / e.dur, 0, 1) : 1;
      const pulse = 0.2 + 0.1 * Math.sin(t * 22);
      ctx.save();
      ctx.fillStyle = `rgba(255,60,70,${pulse + u * 0.12})`;
      ctx.strokeStyle = 'rgba(255,70,80,0.85)'; ctx.lineWidth = 2.5; ctx.setLineDash([10, 7]);
      if (e.atk === 'charge') {
        ctx.translate(e.x, e.y); ctx.rotate(e.aim);
        ctx.beginPath(); ctx.rect(0, -22, 290, 44); ctx.fill(); ctx.stroke();
        ctx.fillStyle = 'rgba(255,70,80,0.38)'; ctx.fillRect(0, -22, 290 * u, 44);
      } else if (e.atk === 'swipe' || e.atk === 'punch') {
        const reach = e.atk === 'swipe' ? e.def.reach + 6 : 74;
        const arc = e.atk === 'swipe' ? 1.15 : 1.0;
        ctx.translate(e.x, e.y);
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, reach, e.aim - arc, e.aim + arc); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.setLineDash([]); ctx.fillStyle = 'rgba(255,70,80,0.38)';
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, reach * u, e.aim - arc, e.aim + arc); ctx.closePath(); ctx.fill();
      } else if (e.atk === 'leap') {
        let tx;
        let ty;
        if (e.state === 'attack') { tx = e.tx; ty = e.ty; } else {
          const dd = clamp(Math.hypot(e.ex - e.x, e.ey - e.y), 100, 340);
          tx = e.x + Math.cos(e.aim) * dd; ty = e.y + Math.sin(e.aim) * dd;
        }
        ctx.beginPath(); ctx.ellipse(tx, ty, e.def.shock, e.def.shock * 0.8, 0, 0, TAU); ctx.fill(); ctx.stroke();
        ctx.setLineDash([]); ctx.fillStyle = 'rgba(255,70,80,0.38)';
        ctx.beginPath(); ctx.ellipse(tx, ty, e.def.shock * u, e.def.shock * 0.8 * u, 0, 0, TAU); ctx.fill();
      }
      ctx.restore();
    }
  }

  // ---------- パーティクルと文字 ----------
  function heartPath(ctx, x, y, s) {
    ctx.beginPath(); ctx.moveTo(x, y + s * 0.4);
    ctx.bezierCurveTo(x - s, y - s * 0.2, x - s * 0.55, y - s * 0.95, x, y - s * 0.4);
    ctx.bezierCurveTo(x + s * 0.55, y - s * 0.95, x + s, y - s * 0.2, x, y + s * 0.4); ctx.closePath();
  }
  function drawParticles(ctx, left, top, right, bottom) {
    for (const p of G.particles) {
      if (p.x < left - 60 || p.x > right + 60 || p.y < top - 90 || p.y > bottom + 60) continue;
      const a = clamp(p.life / p.max, 0, 1);
      ctx.globalAlpha = p.shape === 'spark' || p.shape === 'heart' ? Math.min(1, a * 2) : a;
      switch (p.shape) {
        case 'spark': Art.star(ctx, p.x, p.y, p.size * (0.5 + 0.5 * a), p.rot, p.color, 0); break;
        case 'ring': ctx.strokeStyle = p.color; ctx.lineWidth = p.width * a; ctx.beginPath(); ctx.ellipse(p.x, p.y, p.size, p.size * 0.78, 0, 0, TAU); ctx.stroke(); break;
        case 'bubble':
          ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, TAU); ctx.fillStyle = p.color; ctx.globalAlpha = a * 0.55; ctx.fill();
          ctx.globalAlpha = a; ctx.lineWidth = 1.4; ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.stroke();
          ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.beginPath(); ctx.arc(p.x - p.size * 0.35, p.y - p.size * 0.35, p.size * 0.28, 0, TAU); ctx.fill();
          break;
        case 'heart': heartPath(ctx, p.x, p.y, p.size); ctx.fillStyle = p.color; ctx.fill(); ctx.lineWidth = 1.4; ctx.strokeStyle = OUT; ctx.stroke(); break;
        case 'dust': ctx.globalAlpha = a * 0.7; ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, TAU); ctx.fill(); break;
        case 'ink': ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, TAU); ctx.fill(); break;
        case 'flash': {
          const k = a;
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
          ctx.fillStyle = p.color; ctx.globalAlpha = 0.9 * k;
          ctx.beginPath(); ctx.moveTo(0, -p.size * 0.5); ctx.lineTo(p.size * 1.8, -p.size * 0.25); ctx.lineTo(p.size * 2.4, 0); ctx.lineTo(p.size * 1.8, p.size * 0.25); ctx.lineTo(0, p.size * 0.5); ctx.closePath(); ctx.fill();
          ctx.beginPath(); ctx.arc(0, 0, p.size * 0.6, 0, TAU); ctx.fill();
          ctx.restore();
          break;
        }
        case 'streak':
          ctx.strokeStyle = p.color; ctx.lineWidth = 2; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - Math.cos(p.rot) * p.size * 1.6, p.y - Math.sin(p.rot) * p.size * 1.6); ctx.stroke();
          break;
        case 'leafbit':
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillStyle = p.color; ctx.beginPath(); ctx.ellipse(0, 0, p.size * 1.6, p.size * 0.55, 0, 0, TAU); ctx.fill(); ctx.restore();
          break;
        case 'cut': {
          // 切り口: 一瞬でのびて、細くなりながら消える白い線
          const u = 1 - a; const len = p.size * Math.min(1, u * 6 + 0.3);
          const dx = Math.cos(p.rot) * len; const dy = Math.sin(p.rot) * len;
          ctx.globalAlpha = Math.min(1, a * 1.6);
          ctx.strokeStyle = OUT; ctx.lineWidth = 6 * a + 1; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(p.x - dx, p.y - dy); ctx.lineTo(p.x + dx, p.y + dy); ctx.stroke();
          ctx.strokeStyle = p.color; ctx.lineWidth = 3.4 * a + 0.4; ctx.beginPath(); ctx.moveTo(p.x - dx, p.y - dy); ctx.lineTo(p.x + dx, p.y + dy); ctx.stroke();
          break;
        }
        default: ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (0.4 + 0.6 * a), 0, TAU); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }
  function drawAmbient(ctx, t) {
    if (!G.ambient) return;
    for (const a of G.ambient) {
      const k = Math.min(1, a.life / 1.2, (a.max - a.life) / 0.8);
      ctx.globalAlpha = k * (a.leaf ? 0.9 : 0.75 + Math.sin(a.ph * 3) * 0.25);
      if (a.leaf) {
        ctx.save(); ctx.translate(a.x, a.y); ctx.rotate(a.rot); ctx.scale(1, 0.55 + Math.abs(Math.sin(a.ph)) * 0.45);
        ctx.fillStyle = a.color; ctx.beginPath(); ctx.ellipse(0, 0, a.size, a.size * 0.55, 0, 0, TAU); ctx.fill();
        ctx.strokeStyle = 'rgba(60,70,20,0.45)'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(-a.size, 0); ctx.lineTo(a.size, 0); ctx.stroke();
        ctx.restore();
      } else {
        if (a.firefly) { ctx.globalAlpha *= 0.5 + 0.5 * Math.sin(a.ph * 4); ctx.fillStyle = 'rgba(212,255,90,0.35)'; ctx.beginPath(); ctx.arc(a.x, a.y, a.size * 3, 0, TAU); ctx.fill(); }
        ctx.fillStyle = a.color; ctx.beginPath(); ctx.arc(a.x, a.y, a.size, 0, TAU); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  // 日本刀の斬撃: 白い三日月(ふった範囲)。ふり終わると ふっと消える
  function drawSlashes(ctx) {
    for (const sl of G.slashes || []) {
      const a0 = sl.angle + sl.from;
      const a1 = sl.angle + sl.cur;
      if (Math.abs(a1 - a0) < 0.05) continue;
      const k = clamp(sl.life / 0.22, 0, 1);              // 消えていく
      const fade = sl.done ? k : 1;
      const r = sl.r * (sl.done ? 1 + (1 - k) * 0.1 : 1);
      const inner = r * (sl.finisher ? 0.64 : 0.6);
      const ccw = a1 < a0;
      const col = sl.gold ? '255,225,90' : sl.finisher ? '255,214,240' : '235,245,255';
      ctx.save(); ctx.translate(sl.x, sl.y);
      // 三日月: 刀の先(外側)ほど濃く、根もと(内側)は透明。ふり始めの側は細く
      ctx.beginPath(); ctx.arc(0, 0, r, a0, a1, ccw); ctx.arc(0, 0, inner, a1, a0, !ccw); ctx.closePath();
      const gr = ctx.createRadialGradient(0, 0, inner, 0, 0, r);
      gr.addColorStop(0, `rgba(${col},0)`); gr.addColorStop(0.55, `rgba(${col},${0.32 * fade})`); gr.addColorStop(0.9, `rgba(${col},${0.8 * fade})`); gr.addColorStop(1, `rgba(${col},${0.1 * fade})`);
      ctx.fillStyle = gr; ctx.fill();
      // 刃先のするどい線(先端ほど明るい)
      ctx.lineCap = 'round';
      ctx.strokeStyle = `rgba(255,255,255,${0.95 * fade})`; ctx.lineWidth = sl.finisher ? 3.2 : 2.2;
      ctx.beginPath(); ctx.arc(0, 0, r * 0.96, ccw ? a1 : a0 + (a1 - a0) * 0.3, ccw ? a0 + (a1 - a0) * 0.3 : a1, false); ctx.stroke();
      ctx.strokeStyle = `rgba(${col},${0.35 * fade})`; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(0, 0, r * 0.82, a0, a1, ccw); ctx.stroke();
      // 風のすじ
      ctx.strokeStyle = `rgba(255,255,255,${0.5 * fade})`; ctx.lineWidth = 1;
      for (const f of [0.7, 0.88]) { ctx.beginPath(); ctx.arc(0, 0, r * f, a0 + (a1 - a0) * 0.15, a1 - (a1 - a0) * 0.05, ccw); ctx.stroke(); }
      ctx.restore();
    }
  }
  function drawTexts(ctx) {
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    for (const t of G.texts) {
      const a = clamp(t.life / 0.35, 0, 1);
      const pop = 1 + Math.max(0, (t.max - t.life) < 0.12 ? (0.12 - (t.max - t.life)) * 3 : 0);
      ctx.globalAlpha = a;
      ctx.font = `800 ${Math.round(t.size * pop)}px ${FONT}`;
      ctx.lineWidth = 5; ctx.strokeStyle = OUT; ctx.strokeText(t.text, t.x, t.y);
      ctx.fillStyle = t.color; ctx.fillText(t.text, t.x, t.y);
    }
    ctx.globalAlpha = 1;
  }

  function drawProjectiles(ctx, t) {
    const S = Art.S;
    for (const s of G.spores || []) {
      ctx.fillStyle = 'rgba(30,60,40,0.22)'; ctx.beginPath(); ctx.ellipse(s.x, s.y, 6, 3, 0, 0, TAU); ctx.fill();
      ctx.save(); ctx.translate(s.x, s.y - s.z); ctx.rotate(s.t * 6);
      Art.circ(ctx, 0, 0, 7, '#a24be0', 1.8); Art.circ(ctx, -2, -2, 2.2, '#e2b0ff', 0);
      for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU; Art.circ(ctx, Math.cos(a) * 8, Math.sin(a) * 8, 2, '#c35cff', 0); }
      ctx.restore();
    }
    for (const d of G.drones || []) { ctx.save(); ctx.translate(d.x, d.y); Town.drawDrone(ctx, d, t); ctx.restore(); }
    for (const bm of G.booms || []) {
      ctx.fillStyle = 'rgba(30,60,40,0.22)'; ctx.beginPath(); ctx.ellipse(bm.x, bm.y + 10, 12 + bm.lv * 3, 5, 0, 0, TAU); ctx.fill();
      ctx.save(); ctx.translate(bm.x, bm.y); ctx.rotate(bm.rot);
      Art.drawBoomerang(ctx, bm.lv, bm.gold);
      ctx.restore();
    }
    for (const p of G.proj) {
      if (p.pierce) {
        ctx.save(); ctx.translate(p.x, p.y - p.h); ctx.rotate(Math.atan2(p.vy, p.vx));
        ctx.fillStyle = 'rgba(79,195,255,0.35)'; ctx.beginPath(); ctx.ellipse(-30, 0, 46, p.hr, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = '#9be0ff'; ctx.beginPath(); ctx.ellipse(-16, 0, 34, p.hr * 0.65, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(-8, -2, 20, p.hr * 0.3, 0, 0, TAU); ctx.fill();
        ctx.restore();
        continue;
      }
      if (p.bubble) {
        ctx.fillStyle = 'rgba(30,60,40,0.18)'; ctx.beginPath(); ctx.ellipse(p.x, p.y, 10, 5, 0, 0, TAU); ctx.fill();
        const y = p.y - p.h; const r = 16 + Math.sin(p.ph * 2) * 1.5;
        ctx.fillStyle = 'rgba(160,225,255,0.35)'; ctx.beginPath(); ctx.arc(p.x, y, r, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(255,61,154,0.45)'; ctx.beginPath(); ctx.arc(p.x, y, r * 0.6, 0, TAU); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p.x, y, r, 0, TAU); ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.beginPath(); ctx.ellipse(p.x - r * 0.4, y - r * 0.4, r * 0.3, r * 0.18, -0.6, 0, TAU); ctx.fill();
        continue;
      }
      ctx.fillStyle = 'rgba(30,60,40,0.22)'; ctx.beginPath(); ctx.ellipse(p.x, p.y, 5, 2.6, 0, 0, TAU); ctx.fill();
      ctx.lineCap = 'round';
      ctx.strokeStyle = p.gold ? 'rgba(255,225,90,0.35)' : 'rgba(255,61,154,0.28)'; ctx.lineWidth = 9;
      ctx.beginPath(); ctx.moveTo(p.x - p.vx * 0.06, p.y - p.h - p.vy * 0.06); ctx.lineTo(p.x, p.y - p.h); ctx.stroke();
      ctx.strokeStyle = p.gold ? 'rgba(255,240,170,0.8)' : 'rgba(255,120,190,0.7)'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(p.x - p.vx * 0.035, p.y - p.h - p.vy * 0.035); ctx.lineTo(p.x, p.y - p.h); ctx.stroke();
      if (p.missile) {
        ctx.save(); ctx.translate(p.x, p.y - p.h); ctx.rotate(Math.atan2(p.vy, p.vx));
        ctx.fillStyle = 'rgba(255,120,80,0.35)'; ctx.beginPath(); ctx.ellipse(-16, 0, 20, 7, 0, 0, TAU); ctx.fill();
        Art.rrect(ctx, -12, -5, 22, 10, 5, p.gold ? '#ffd23f' : '#ff6a3d', 2);
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(8, 0, 3.4, 0, TAU); ctx.fill();
        Art.poly(ctx, [-12, -5, -18, -10, -14, 0, -18, 10, -12, 5], '#c0392b', 1.6);
        ctx.restore();
        continue;
      }
      if (p.rainbow) { const hue = (p.t * 720) % 360; ctx.fillStyle = `hsl(${hue},95%,65%)`; ctx.beginPath(); ctx.arc(p.x, p.y - p.h, 7, 0, TAU); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.6; ctx.stroke(); continue; }
      if (p.pellet) { ctx.fillStyle = p.gold ? '#ffe14d' : '#ffb347'; ctx.beginPath(); ctx.arc(p.x, p.y - p.h, 5, 0, TAU); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.4; ctx.stroke(); continue; }
      Art.blit(ctx, p.gold ? S.goldball : S.inkball, p.x, p.y - p.h, p.small ? 0.7 : p.wet ? 1.4 : p.gold ? 1.25 : 1.05);
    }
  }

  // ---------- 画面の端の矢印 ----------
  function edgeArrow(ctx, V, tx, ty, color, label, scale) {
    const cx = V.W / 2;
    const cy = V.H / 2;
    const sx = (tx - V.left) * V.zoom;
    const sy = (ty - V.top) * V.zoom;
    if (sx > 30 && sx < V.W - 30 && sy > 30 && sy < V.H - 30) return false;
    const dx = sx - cx;
    const dy = sy - cy;
    const k = Math.min((V.W / 2 - 34) / Math.abs(dx || 0.001), (V.H / 2 - 34) / Math.abs(dy || 0.001));
    const x = cx + dx * k;
    const y = cy + dy * k;
    const a = Math.atan2(dy, dx);
    ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale);
    ctx.rotate(a);
    ctx.beginPath(); ctx.moveTo(16, 0); ctx.lineTo(-8, -12); ctx.lineTo(-3, 0); ctx.lineTo(-8, 12); ctx.closePath();
    ctx.fillStyle = color; ctx.fill(); ctx.lineWidth = 2.4; ctx.strokeStyle = OUT; ctx.lineJoin = 'round'; ctx.stroke();
    ctx.rotate(-a);
    if (label) { ctx.font = `800 15px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineWidth = 4; ctx.strokeStyle = OUT; ctx.strokeText(label, -Math.cos(a) * 20, -Math.sin(a) * 20); ctx.fillStyle = '#fff'; ctx.fillText(label, -Math.cos(a) * 20, -Math.sin(a) * 20); }
    ctx.restore();
    return true;
  }

  // ---------- 1フレーム描く ----------
  function draw(t) {
    const prof = G.prof;
    let pt = prof ? performance.now() : 0;
    const mark = (name) => { if (prof) { G.ctx.getImageData(0, 0, 1, 1); const n = performance.now(); prof[name] = (prof[name] || 0) + n - pt; pt = n; } };
    const ctx = G.ctx;
    const V = G.view;
    const W = G.world;
    const P = G.player;
    const sh = G.cam.shake;
    const shx = sh > 0.2 ? (Math.random() - 0.5) * sh : 0;
    const shy = sh > 0.2 ? (Math.random() - 0.5) * sh : 0;
    const left = V.left + shx;
    const top = V.top + shy;
    const right = left + V.vw;
    const bottom = top + V.vh;
    const k = V.dpr * V.zoom;
    if (!groundPattern && !patternTried) makeGroundPattern(ctx);

    ctx.setTransform(V.dpr, 0, 0, V.dpr, 0, 0);
    ctx.fillStyle = '#76b24a';
    ctx.fillRect(0, 0, V.W, V.H);
    {
      const zp = G.zoomPunch || 0;
      const k2 = k * (1 + zp);
      ctx.setTransform(k2, 0, 0, k2, (V.W * V.dpr) / 2 - (left + V.vw / 2) * k2, (V.H * V.dpr) / 2 - (top + V.vh / 2) * k2);
    }

    // 地面: 草の濃淡 → 土の見えている所 → 小道 → 木もれ日
    if (groundPattern) { ctx.fillStyle = groundPattern; ctx.fillRect(left - 2, top - 2, V.vw + 4, V.vh + 4); }
    const blobCol = ['rgba(170,220,100,0.22)', 'rgba(50,130,60,0.2)', 'rgba(200,235,120,0.16)'];
    W.decor.query(left - 280, top - 280, right + 280, bottom + 280, (d) => {
      if (d.kind === 'blob') { ctx.fillStyle = blobCol[d.v]; ctx.beginPath(); ctx.ellipse(d.x, d.y, d.rx, d.ry, 0, 0, TAU); ctx.fill(); }
      else if (d.kind === 'lawn') { ctx.fillStyle = 'rgba(120,200,90,0.35)'; ctx.fillRect(d.x - d.rx, d.y - d.ry, d.rx * 2, d.ry * 2); ctx.strokeStyle = 'rgba(90,110,60,0.5)'; ctx.lineWidth = 3; ctx.strokeRect(d.x - d.rx, d.y - d.ry, d.rx * 2, d.ry * 2); }
      else if (d.kind === 'dirt') { ctx.fillStyle = 'rgba(150,120,70,0.28)'; ctx.beginPath(); ctx.ellipse(d.x, d.y, d.rx, d.ry, 0, 0, TAU); ctx.fill(); ctx.fillStyle = 'rgba(120,90,50,0.18)'; ctx.beginPath(); ctx.ellipse(d.x + d.rx * 0.1, d.y + d.ry * 0.15, d.rx * 0.6, d.ry * 0.55, 0, 0, TAU); ctx.fill(); }
    });
    drawPaths(ctx, left, top, right, bottom);

    mark('ground');
    if (G.stage === 2) drawRoads(ctx, t, left, top, right, bottom);
    // 川・池
    drawWater(ctx, t, left, top, right, bottom);
    mark('water');
    const S = Art.S;
    // 飾り(草・花・小石・葦)
    W.decor.query(left - 30, top - 30, right + 30, bottom + 70, (d) => {
      switch (d.kind) {
        case 'tuft': Art.blit(ctx, S.tuft[d.v], d.x, d.y, 1); break;
        case 'flower': Art.blit(ctx, S.flower[d.v], d.x, d.y, 1); break;
        case 'pebble': Art.blit(ctx, S.pebble[d.v], d.x, d.y, 1); break;
        case 'reed': Art.blit(ctx, S.reed[d.v], d.x, d.y, 1); break;
        case 'fern': Art.blit(ctx, S.fern[d.v], d.x, d.y, 1.1); break;
        case 'shroomlet': Art.blit(ctx, S.shroomlet[d.v], d.x, d.y, 1); break;
        case 'bankstone': Art.blit(ctx, S.bankstone[d.v], d.x, d.y, 1); break;
        case 'cross': ctx.save(); ctx.translate(d.x, d.y); ctx.rotate(d.rot); ctx.fillStyle = 'rgba(255,255,255,0.8)'; for (let i = -4; i <= 4; i++) ctx.fillRect(i * 14 - 5, -14, 10, 28); ctx.restore(); break;
        case 'manhole': ctx.beginPath(); ctx.arc(d.x, d.y, 12, 0, TAU); ctx.fillStyle = '#4a4e56'; ctx.fill(); ctx.strokeStyle = '#2c2f36'; ctx.lineWidth = 2; ctx.stroke(); ctx.beginPath(); ctx.arc(d.x, d.y, 7, 0, TAU); ctx.stroke(); break;
        case 'leaf': ctx.save(); ctx.translate(d.x, d.y); ctx.rotate(d.rot); Art.blit(ctx, S.leaf[d.v], 0, 0, 1); ctx.restore(); break;
        default: break;
      }
    });
    mark('decor');
    for (const b of W.bridges) {
      if (b.x + b.hl < left || b.x - b.hl > right || b.y + b.hl < top || b.y - b.hl > bottom) continue;
      Art.drawBridge(ctx, b);
    }
    // 草むら(背の高い草)
    for (const p of W.patches) {
      if (p.x + p.r < left || p.x - p.r > right || p.y + p.r < top || p.y - p.r > bottom + 30) continue;
      drawPatch(ctx, p, t);
    }
    mark('patches');
    drawZones(ctx, t);
    drawDecals(ctx, left, top, right, bottom);
    drawTelegraphs(ctx, t);
    mark('decals');

    // 太陽の向きの長い影(木・岩・山)。夕方は長く、夜は消える
    {
      const eve = G.eve || 0; const night = G.night || 0;
      const len = 1 + eve * 1.4; const alpha = (1 - night) * (0.9 - eve * 0.2);
      if (alpha > 0.05) {
        ctx.save(); ctx.globalAlpha = alpha;
        const img = S.longShadow.c;
        W.hash.query(left - 300, top - 300, right + 100, bottom + 100, (o) => {
          // 木と山だけ(小物は接地の影で十分)
          if (!(o.kind === 'tree' || o.kind === 'pine' || o.kind === 'willow' || o.kind === 'dead' || o.kind === 'mountain' || o.kind === 'tent' || o.kind === 'lamp')) return;
          const hw = (o.hw || 30) * 0.9; const hgt = (o.hgt || 60);
          const sx = o.x + hgt * 0.4 * len; const sy = o.y + 10 + hgt * 0.12 * len;
          const rx = hgt * 0.48 * len; const ry = hw * 0.4;
          if (sx + rx < left || sx - rx > right || sy + ry < top || sy - ry > bottom) return;
          ctx.drawImage(img, sx - rx, sy - ry, rx * 2, ry * 2);
        });
        ctx.restore();
      }
    }
    // 奥から手前へ並べて描く物体
    drawList.length = 0;
    W.hash.query(left - 240, top - 40, right + 240, bottom + 400, (o) => {
      if (o.kind === 'col') return;
      if (o.y - (o.hgt || 60) > bottom || Math.abs(o.x - (left + right) / 2) > V.vw / 2 + (o.hw || 60) + 20) return;
      drawList.push(o);
    });
    for (const m of G.mushrooms) if (!m.dead && !m.hidden && m.x > left - 80 && m.x < right + 80 && m.y > top - 60 && m.y < bottom + 90) drawList.push(m);
    for (const c of G.critters) if (!c.gone && c.x > left - 60 && c.x < right + 60 && c.y > top - 60 && c.y < bottom + 60) drawList.push(c);
    for (const e of G.enemies) if (e.state !== 'gone' && e.x > left - 120 && e.x < right + 120 && e.y > top - 160 && e.y < bottom + 160) drawList.push(e);
    for (const c of G.crates || []) if (c.x > left - 60 && c.x < right + 60 && c.y > top - 60 && c.y < bottom + 60) drawList.push(c);
    if (G.boss) drawList.push(G.boss);
    drawList.push(P);
    drawList.sort((a, b) => a.y - b.y);
    mark('listbuild');
    for (const o of drawList) {
      if (o.kind === 'player' || o.kind === 'enemy' || o.kind === 'critter' || o.kind === 'mushroom' || o.kind === 'crate' || o.kind === 'boss'   ) { drawEntityItem(ctx, o, t); continue; }
      // プレイヤーが木やテントのかげに入ったら、木を半透明にして見えるようにする
      const fade = o.y > P.y && Math.abs(P.x - o.x) < (o.hw || 50) * 0.7 && P.y > o.y - (o.hgt || 60) * 0.95;
      drawObstacle(ctx, o, t, fade);
    }
    // 隠れているキノコの「あやしい気配」は地面のうえに薄い影で
    for (const m of G.mushrooms) {
      if (!m.hidden || m.dead) continue;
      if (m.x < left - 40 || m.x > right + 40 || m.y < top - 40 || m.y > bottom + 40) continue;
      ctx.fillStyle = `rgba(160,70,230,${0.1 + 0.06 * Math.sin(t * 4 + m.t)})`;
      ctx.beginPath(); ctx.ellipse(m.x, m.y, 22, 14, 0, 0, TAU); ctx.fill();
    }
    mark('objects');
    drawSlashes(ctx);
    drawProjectiles(ctx, t);
    drawParticles(ctx, left, top, right, bottom);
    drawAmbient(ctx, t);
    drawTexts(ctx);
    mark('particles');

    // ---- 画面全体の効果 ----
    ctx.setTransform(V.dpr, 0, 0, V.dpr, 0, 0);
    let red = G.flashRed > 0 ? clamp(G.flashRed / 0.4, 0, 1) * 0.9 : 0;
    if (G.state === 'playing' && P.hp > 0 && P.hp < 30) red = Math.max(red, 0.35 + 0.25 * Math.sin(t * 6));
    const purple = P.slowT > 0 ? Math.min(1, P.slowT) * (0.3 + 0.12 * Math.sin(t * 5)) : 0;
    setFx(red, purple, G.night || 0, G.eve || 0, G.state === 'title' ? 0.3 : clamp(1 - G.t / 14, 0, 1) * 0.38, G.flashWhite || 0);
    if (G.state === 'playing') drawIndicators(ctx, V, t);
    mark('overlay');
  }

  let fxNight = null; let fxEve = null; let fxMist = null; let fxWhite = null;
  function setFx(red, purple, night, eve, mist, white) {
    if (!fxRed) { fxRed = document.getElementById('fxRed'); fxPurple = document.getElementById('fxPurple'); fxNight = document.getElementById('fxNight'); fxEve = document.getElementById('fxEve'); fxMist = document.getElementById('fxMist'); fxWhite = document.getElementById('fxWhite'); }
    if (fxWhite && Math.abs((white || 0) - (fxLast.w || 0)) > 0.01) { fxLast.w = white || 0; fxWhite.style.opacity = (white || 0).toFixed(2); }
    if (fxMist && Math.abs(mist - (fxLast.m || 0)) > 0.01) { fxLast.m = mist; fxMist.style.opacity = mist.toFixed(2); }
    if (!fxRed) return;
    if (Math.abs(red - fxLast.r) > 0.02) { fxLast.r = red; fxRed.style.opacity = red.toFixed(2); }
    if (Math.abs(purple - fxLast.p) > 0.02) { fxLast.p = purple; fxPurple.style.opacity = purple.toFixed(2); }
    if (fxNight && Math.abs(night - (fxLast.n || 0)) > 0.01) { fxLast.n = night; fxNight.style.opacity = night.toFixed(2); }
    if (fxEve && Math.abs(eve - (fxLast.e || 0)) > 0.01) { fxLast.e = eve; fxEve.style.opacity = eve.toFixed(2); }
  }

  function drawIndicators(ctx, V, t) {
    const P = G.player;
    // 追いかけてくる敵の方向
    for (const e of G.enemies) {
      if (e.state !== 'chase' && e.state !== 'windup' && e.state !== 'attack') continue;
      if (Math.hypot(e.x - P.x, e.y - P.y) > 900) continue;
      edgeArrow(ctx, V, e.x, e.y, '#ff4d4d', '!', 1);
    }
    if (G.ev) { ctx.globalAlpha = 0.85 + Math.sin(t * 6) * 0.15; edgeArrow(ctx, V, G.ev.x, G.ev.y, '#b04cff', '大発生', 1.2); ctx.globalAlpha = 1; }
    if (G.boss && !G.boss.dead) { edgeArrow(ctx, V, G.boss.x, G.boss.y, '#8a3fd0', 'ボス', 1.3); }
    for (const c of G.crates || []) edgeArrow(ctx, V, c.x, c.y, '#ffb347', '箱', 0.9);
    // 金色キノコがいるあいだは、その方向をいつも示す
    if (G.gold && !G.gold.dead) {
      ctx.globalAlpha = 0.8 + Math.sin(t * 8) * 0.2;
      edgeArrow(ctx, V, G.gold.x, G.gold.y, '#ffe14d', '★', 1.15);
      ctx.globalAlpha = 1;
    }
    // 近くに見える毒キノコがなければ、いちばん近い毒キノコの方向を薄く示す
    let best = null;
    let bd = 1e9;
    let visible = false;
    for (const m of G.mushrooms) {
      if (m.dead || m.type !== 'poison') continue;
      const sx = (m.x - V.left) * V.zoom;
      const sy = (m.y - V.top) * V.zoom;
      if (sx > 0 && sx < V.W && sy > 0 && sy < V.H && !m.hidden) { visible = true; break; }
      const d = Math.hypot(m.x - P.x, m.y - P.y);
      if (d < bd) { bd = d; best = m; }
    }
    if (!visible && best && bd < 1500) {
      ctx.globalAlpha = 0.75 + Math.sin(t * 5) * 0.2;
      edgeArrow(ctx, V, best.x, best.y, '#c35cff', '', 0.9);
      ctx.globalAlpha = 1;
    }
  }

  // ---------- ミニマップ ----------
  function buildMini() {
    const W = G.world;
    const N = 320;
    const u = W.size / N;
    const c = document.createElement('canvas');
    c.width = N; c.height = N;
    const g = c.getContext('2d');
    g.fillStyle = '#7fcf5a'; g.fillRect(0, 0, N, N);
    if (W.roads) { g.strokeStyle = '#6a6e76'; g.lineWidth = 110 / u; for (const r of W.roads) { g.beginPath(); g.moveTo(r.x0 / u, r.y0 / u); g.lineTo(r.x1 / u, r.y1 / u); g.stroke(); } }
    const px = N / W.n;
    for (let ty = 0; ty < W.n; ty++) {
      for (let tx = 0; tx < W.n; tx++) {
        const v = W.tiles[ty * W.n + tx];
        if (v === T_LAND) continue;
        g.fillStyle = v === T_WATER ? '#4fb8ee' : '#b98055';
        g.fillRect(tx * px, ty * px, px + 0.6, px + 0.6);
      }
    }
    for (const o of W.obstacles) {
      if (o.kind === 'tree' || o.kind === 'pine' || o.kind === 'willow' || o.kind === 'dead') { g.fillStyle = o.kind === 'dead' ? '#8a7a60' : '#3f9a56'; g.fillRect(o.x / u - 0.9, o.y / u - 0.9, 1.8, 1.8); }
      else if (o.kind === 'mountain') {
        g.fillStyle = '#9aa5c9'; g.beginPath(); g.moveTo(o.x / u - o.hw / u, o.y / u + 2); g.lineTo(o.x / u, o.y / u - o.hw / u * 1.2); g.lineTo(o.x / u + o.hw / u, o.y / u + 2); g.closePath(); g.fill();
        g.fillStyle = '#fff'; g.beginPath(); g.moveTo(o.x / u - 2, o.y / u - o.hw / u * 0.8); g.lineTo(o.x / u, o.y / u - o.hw / u * 1.2); g.lineTo(o.x / u + 2, o.y / u - o.hw / u * 0.8); g.fill();
      } else if (o.kind === 'tent') { g.fillStyle = '#ff8a5c'; g.beginPath(); g.arc(o.x / u, o.y / u, 2.4, 0, TAU); g.fill(); }
      else if (o.kind === 'building') { g.fillStyle = o.roof; g.fillRect((o.x - o.hw2) / u, (o.y - o.hh2) / u, (o.hw2 * 2) / u, (o.hh2 * 2) / u); }
    }
    miniBase = c;
  }
  function drawMini() {
    const mm = G.mini;
    if (!mm || !miniBase || !G.world) return;
    const g = mm.getContext('2d');
    const s = mm.width;
    const W = G.world;
    const P = G.player;
    const k = s / W.size;
    g.clearRect(0, 0, s, s);
    g.drawImage(miniBase, 0, 0, s, s);
    const dot = (x, y, r, c) => { g.fillStyle = c; g.beginPath(); g.arc(x * k, y * k, r * s / 140, 0, TAU); g.fill(); };
    for (const c of G.critters) if (!c.gone && Math.hypot(c.x - P.x, c.y - P.y) < 650) dot(c.x, c.y, 2.6, '#ffe14d');
    for (const m of G.mushrooms) {
      if (m.dead || (m.type !== 'gold' && Math.hypot(m.x - P.x, m.y - P.y) > 950)) continue;
      if (m.type === 'gold') dot(m.x, m.y, 4.5, '#ffe14d');
      else if (m.type === 'poison') dot(m.x, m.y, m.big ? 4 : 3, '#b03cff');
      else dot(m.x, m.y, 2.4, '#ffffff');
    }
    for (const e of G.enemies) if (e.state !== 'gone' && Math.hypot(e.x - P.x, e.y - P.y) < 800) dot(e.x, e.y, 3.8, e.state === 'ally' ? '#ff8ad0' : '#ff3b3b');
    if (G.ev) { g.fillStyle = 'rgba(176,76,255,0.45)'; g.beginPath(); g.arc(G.ev.x * k, G.ev.y * k, G.ev.r * k, 0, TAU); g.fill(); }
    for (const c of G.crates || []) dot(c.x, c.y, 3.4, '#ffb347');
    if (G.boss && !G.boss.dead) dot(G.boss.x, G.boss.y, 6, '#8a3fd0');
    // 見えているはんい
    const V = G.view;
    g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 1.4;
    g.strokeRect(V.left * k, V.top * k, V.vw * k, V.vh * k);
    // プレイヤー
    g.save(); g.translate(P.x * k, P.y * k); g.rotate(P.aim);
    g.beginPath(); g.moveTo(7 * s / 140, 0); g.lineTo(-4 * s / 140, -4.5 * s / 140); g.lineTo(-4 * s / 140, 4.5 * s / 140); g.closePath();
    g.fillStyle = '#ff7a3d'; g.fill(); g.lineWidth = 1.6; g.strokeStyle = '#fff'; g.stroke();
    g.restore();
  }

  // 動きが重いときに描画の細かさを1段階下げる(0.5 まで)。下げたら戻さない(行き来してカクつくのを避ける)
  function lowerQuality() {
    const cur = G.rs || 1;
    if (cur <= 0.55) return false;
    G.rs = Math.max(0.5, cur * 0.8);
    resize();
    return true;
  }

  return { resize, draw, buildMini, drawMini, lowerQuality, FONT };
})();
