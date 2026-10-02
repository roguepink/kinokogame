'use strict';
/* 描画パイプライン: 地面 → 川・橋 → インクの跡 → 奥から手前へ並べた物体 → パーティクル → 画面効果 */

const Render = (() => {
  const FONT = '"Hiragino Maru Gothic ProN","Yu Gothic UI","Meiryo","Noto Sans JP","Noto Sans CJK JP","WenQuanYi Zen Hei",sans-serif';
  const OUT = Art.OUT;
  let spriteScale = 0;
  let groundPattern = null;
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
    let dpr = Math.min(window.devicePixelRatio || 1, CONFIG.view.maxDpr);
    while (W * H * dpr * dpr > CONFIG.view.maxPixels && dpr > 0.6) dpr *= 0.9;
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
    if (need !== spriteScale) { spriteScale = need; Art.init(need); groundPattern = null; }
    // ミニマップの解像度
    const mm = G.mini;
    if (mm) {
      const size = Math.round(parseFloat(getComputedStyle(mm).width) || 140);
      mm.width = Math.round(size * dpr); mm.height = Math.round(size * dpr);
    }
  }

  function makeGroundPattern(ctx) {
    const TILE_U = 320;
    const ps = Math.max(1, spriteScale);
    const c = document.createElement('canvas');
    c.width = TILE_U * ps; c.height = TILE_U * ps;
    const g = c.getContext('2d');
    g.scale(ps, ps);
    const rnd = mulberry32(5);
    const wrap = (x, y, fn) => { for (const ox of [-TILE_U, 0, TILE_U]) for (const oy of [-TILE_U, 0, TILE_U]) fn(x + ox, y + oy); };
    for (let i = 0; i < 26; i++) {
      const x = rnd() * TILE_U; const y = rnd() * TILE_U; const r = 18 + rnd() * 38;
      const light = rnd() < 0.5;
      g.fillStyle = light ? 'rgba(190,240,120,0.22)' : 'rgba(70,160,70,0.16)';
      wrap(x, y, (px, py) => { g.beginPath(); g.ellipse(px, py, r, r * 0.7, 0, 0, TAU); g.fill(); });
    }
    g.lineCap = 'round';
    for (let i = 0; i < 150; i++) {
      const x = rnd() * TILE_U; const y = rnd() * TILE_U;
      g.strokeStyle = rnd() < 0.5 ? 'rgba(60,150,60,0.32)' : 'rgba(210,255,140,0.38)';
      g.lineWidth = 1.5;
      wrap(x, y, (px, py) => { g.beginPath(); g.moveTo(px, py); g.lineTo(px + (rnd() - 0.5) * 3, py - 4 - rnd() * 4); g.stroke(); });
    }
    groundPattern = ctx.createPattern(c, 'repeat');
    try { groundPattern.setTransform(new DOMMatrix().scale(1 / ps)); } catch (e) { groundPattern = null; }
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
      const layers = [[r.w + 34, '#cdbf86'], [r.w + 24, '#efe3b0'], [r.w + 8, '#a8ecf4'], [r.w - 10, '#62c9f0'], [r.w - 46, '#47a8e6']];
      for (const [w, c] of layers) { ctx.lineWidth = w; ctx.strokeStyle = c; ctx.stroke(p); }
      // ゆれる白いすじ(流れて見える)
      ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 3; ctx.setLineDash([16, 54]);
      for (const [ox, oy, sp] of [[0, 0, 26], [18, -14, 19], [-20, 12, 23]]) {
        ctx.lineDashOffset = -t * sp;
        ctx.save(); ctx.translate(ox, oy); ctx.stroke(p); ctx.restore();
      }
      ctx.setLineDash([]);
    }
    for (const p of W.ponds) {
      if (p.x + p.rx < left - 40 || p.x - p.rx > right + 40 || p.y + p.ry < top - 40 || p.y - p.ry > bottom + 40) continue;
      const el = (k, c) => { ctx.beginPath(); ctx.ellipse(p.x, p.y, p.rx * k, p.ry * k, 0, 0, TAU); ctx.fillStyle = c; ctx.fill(); };
      el(1.16, '#cdbf86'); el(1.1, '#efe3b0'); el(1.03, '#a8ecf4'); el(0.93, '#62c9f0'); el(0.62, '#47a8e6');
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
    const poison = m.type === 'poison';
    const e = m.pop;
    const back = 1 + 2.2 * Math.pow(e - 1, 3) + 1.2 * Math.pow(e - 1, 2); // ぴょこっと飛び出す
    const wob = m.wob > 0 ? Math.sin(t * 38) * 0.16 * (m.wob / 0.3) : 0;
    const idle = Math.sin(t * 3 + m.t * 1.2) * 0.03;
    const sc = m.size * clamp(back, 0.01, 1.3);
    const glowA = 0.55 + Math.sin(t * 4 + m.t) * 0.2;
    ctx.save(); ctx.globalAlpha = glowA;
    Art.blit(ctx, poison ? S.glowPoison : S.glowGood, m.x, m.y - 18 * m.size, 0.62 * m.size);
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
      const w = 40;
      ctx.fillStyle = 'rgba(40,20,50,0.7)'; ctx.fillRect(m.x - w / 2 - 1.5, m.y - 82, w + 3, 8);
      ctx.fillStyle = '#ff3d9a'; ctx.fillRect(m.x - w / 2, m.y - 80.5, (w * m.hp) / m.maxHp, 5);
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

  function drawEntityItem(ctx, o, t) {
    const P = G.player;
    switch (o.kind) {
      case 'mushroom': drawMushroom(ctx, o, t); break;
      case 'critter':
        ctx.save(); ctx.translate(o.x, o.y);
        if (o.type === 'rabbit') Art.drawRabbit(ctx, o, t); else Art.drawSquirrel(ctx, o, t);
        ctx.restore();
        break;
      case 'enemy': {
        ctx.save(); ctx.translate(o.x, o.y);
        const dir = o.face >= 0 ? 1 : -1;
        const sq = o.flash > 0 ? 1 + o.flash * 0.9 : 1;
        if (o.type === 'boar') { ctx.scale(dir * sq, 2 - sq); Art.drawBoar(ctx, o, t); }
        else { ctx.scale(sq, 2 - sq); if (o.type === 'bear') Art.drawBear(ctx, o, t); else Art.drawGorilla(ctx, o, t); }
        ctx.restore();
        break;
      }
      case 'player': {
        ctx.save(); ctx.translate(o.x, o.y);
        if (o.invuln > 0 && Math.floor(t * 18) % 2 === 0) ctx.globalAlpha = 0.45;
        const sq = o.hurtT > 0 ? 1 + o.hurtT * 0.25 : 1;
        ctx.scale(sq, 2 - sq);
        Art.drawBoy(ctx, o, t);
        ctx.restore();
        break;
      }
      default: break;
    }
  }

  function drawObstacle(ctx, o, t, fade) {
    const S = Art.S;
    switch (o.kind) {
      case 'tree': case 'pine': drawTree(ctx, o, t, fade); break;
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
      else if (d.type === 'flower') { ctx.rotate(-d.rot); Art.blit(ctx, S.inkFlower, 0, 0, d.s * pop); }
      else Art.blit(ctx, S.splat[d.v], 0, 0, d.s * pop);
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
        case 'streak':
          ctx.strokeStyle = p.color; ctx.lineWidth = 2; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - Math.cos(p.rot) * p.size * 1.6, p.y - Math.sin(p.rot) * p.size * 1.6); ctx.stroke();
          break;
        default: ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (0.4 + 0.6 * a), 0, TAU); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
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

  function drawProjectiles(ctx) {
    const S = Art.S;
    for (const p of G.proj) {
      ctx.fillStyle = 'rgba(30,60,40,0.22)'; ctx.beginPath(); ctx.ellipse(p.x, p.y, 5, 2.6, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(255,61,154,0.5)'; ctx.lineWidth = 5; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(p.x - p.vx * 0.035, p.y - p.h - p.vy * 0.035); ctx.lineTo(p.x, p.y - p.h); ctx.stroke();
      Art.blit(ctx, S.inkball, p.x, p.y - p.h, 1);
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
    if (!groundPattern) makeGroundPattern(ctx);

    ctx.setTransform(V.dpr, 0, 0, V.dpr, 0, 0);
    ctx.fillStyle = '#86d257';
    ctx.fillRect(0, 0, V.W, V.H);
    ctx.setTransform(k, 0, 0, k, -left * k, -top * k);

    // 地面
    if (groundPattern) { ctx.fillStyle = groundPattern; ctx.fillRect(left - 2, top - 2, V.vw + 4, V.vh + 4); }
    const blobCol = ['rgba(190,240,120,0.2)', 'rgba(70,160,70,0.15)', 'rgba(220,250,140,0.16)'];
    W.decor.query(left - 280, top - 280, right + 280, bottom + 280, (d) => {
      if (d.kind !== 'blob') return;
      ctx.fillStyle = blobCol[d.v]; ctx.beginPath(); ctx.ellipse(d.x, d.y, d.rx, d.ry, 0, 0, TAU); ctx.fill();
    });
    mark('ground');
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
    drawDecals(ctx, left, top, right, bottom);
    drawTelegraphs(ctx, t);
    mark('decals');

    // 奥から手前へ並べて描く物体
    drawList.length = 0;
    W.hash.query(left - 240, top - 40, right + 240, bottom + 400, (o) => {
      if (o.kind === 'col') return;
      if (o.y - (o.hgt || 60) > bottom || Math.abs(o.x - (left + right) / 2) > V.vw / 2 + (o.hw || 60) + 20) return;
      drawList.push(o);
    });
    for (const m of G.mushrooms) if (!m.dead && !m.hidden && m.x > left - 80 && m.x < right + 80 && m.y > top - 60 && m.y < bottom + 90) drawList.push(m);
    for (const c of G.critters) if (!c.gone && c.x > left - 60 && c.x < right + 60 && c.y > top - 60 && c.y < bottom + 60) drawList.push(c);
    for (const e of G.enemies) if (e.x > left - 120 && e.x < right + 120 && e.y > top - 120 && e.y < bottom + 160) drawList.push(e);
    drawList.push(P);
    drawList.sort((a, b) => a.y - b.y);
    mark('listbuild');
    for (const o of drawList) {
      if (o.kind === 'player' || o.kind === 'enemy' || o.kind === 'critter' || o.kind === 'mushroom') { drawEntityItem(ctx, o, t); continue; }
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
    drawProjectiles(ctx);
    drawParticles(ctx, left, top, right, bottom);
    drawTexts(ctx);
    mark('particles');

    // ---- 画面全体の効果 ----
    ctx.setTransform(V.dpr, 0, 0, V.dpr, 0, 0);
    let red = G.flashRed > 0 ? clamp(G.flashRed / 0.4, 0, 1) * 0.9 : 0;
    if (G.state === 'playing' && P.hp > 0 && P.hp < 30) red = Math.max(red, 0.35 + 0.25 * Math.sin(t * 6));
    const purple = P.slowT > 0 ? Math.min(1, P.slowT) * (0.3 + 0.12 * Math.sin(t * 5)) : 0;
    setFx(red, purple);
    if (G.state === 'playing') drawIndicators(ctx, V, t);
    mark('overlay');
  }

  function setFx(red, purple) {
    if (!fxRed) { fxRed = document.getElementById('fxRed'); fxPurple = document.getElementById('fxPurple'); }
    if (!fxRed) return;
    if (Math.abs(red - fxLast.r) > 0.02) { fxLast.r = red; fxRed.style.opacity = red.toFixed(2); }
    if (Math.abs(purple - fxLast.p) > 0.02) { fxLast.p = purple; fxPurple.style.opacity = purple.toFixed(2); }
  }

  function drawIndicators(ctx, V, t) {
    const P = G.player;
    // 追いかけてくる敵の方向
    for (const e of G.enemies) {
      if (e.state !== 'chase' && e.state !== 'windup' && e.state !== 'attack') continue;
      if (Math.hypot(e.x - P.x, e.y - P.y) > 900) continue;
      edgeArrow(ctx, V, e.x, e.y, '#ff4d4d', '!', 1);
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
      if (o.kind === 'tree' || o.kind === 'pine') { g.fillStyle = '#3f9a56'; g.fillRect(o.x / u - 0.9, o.y / u - 0.9, 1.8, 1.8); }
      else if (o.kind === 'mountain') {
        g.fillStyle = '#9aa5c9'; g.beginPath(); g.moveTo(o.x / u - o.hw / u, o.y / u + 2); g.lineTo(o.x / u, o.y / u - o.hw / u * 1.2); g.lineTo(o.x / u + o.hw / u, o.y / u + 2); g.closePath(); g.fill();
        g.fillStyle = '#fff'; g.beginPath(); g.moveTo(o.x / u - 2, o.y / u - o.hw / u * 0.8); g.lineTo(o.x / u, o.y / u - o.hw / u * 1.2); g.lineTo(o.x / u + 2, o.y / u - o.hw / u * 0.8); g.fill();
      } else if (o.kind === 'tent') { g.fillStyle = '#ff8a5c'; g.beginPath(); g.arc(o.x / u, o.y / u, 2.4, 0, TAU); g.fill(); }
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
      if (m.dead || Math.hypot(m.x - P.x, m.y - P.y) > 950) continue;
      if (m.type === 'poison') dot(m.x, m.y, m.big ? 4 : 3, '#b03cff');
      else dot(m.x, m.y, 2.4, '#ffffff');
    }
    for (const e of G.enemies) if (Math.hypot(e.x - P.x, e.y - P.y) < 800) dot(e.x, e.y, 3.8, '#ff3b3b');
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

  return { resize, draw, buildMini, drawMini, FONT };
})();
