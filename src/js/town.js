'use strict';
/* ステージ2「まち」: 道路と建物の街。敵は泥棒・ゾンビ・リーゼントのヤンキー、ボスは巨大頭のリーゼント。
   警察官が うさぎ・リス の役(さわると スピードアップ+なかま)。武器はピストルが基本で、箱からライフル・ショットガン・ミサイル・ドローン。
   マップ生成(populate)・絵(draw*)・敵の定義をこのファイルにまとめる */

const Town = (() => {
  const OUT = '#35283f';
  // ---------- 敵の定義(ステージ2) ----------
  const ENEMIES = {
    thief:  { name: 'どろぼう', cr: 15, hr: 26, hp: 9,  wander: 70, chase: 150, charge: 520, sight: 460, windup: 0.55, damage: 10, score: 60, atk: 'charge', steal: 80 },
    zombie: { name: 'ゾンビ',   cr: 18, hr: 32, hp: 26, wander: 30, chase: 72,  sight: 380, windup: 0.7,  damage: 18, reach: 70, score: 70, atk: 'swipe' },
    yankee: { name: 'ヤンキー', cr: 18, hr: 32, hp: 16, wander: 55, chase: 125, charge: 470, sight: 480, windup: 0.75, damage: 15, score: 80, atk: 'charge' },
  };
  const BOSS = { name: 'リーゼント総長', hp: 60, cr: 52, hr: 80 };

  // ---------- マップ ----------
  function populate(W, H) {
    const { rng, R, push, addDecor, addTree, forTiles, S, TS, N, tiles } = H;
    const T_ROAD = 3; const T_WALK = 4;
    W.roads = []; W.buildings = []; W.lots = []; W.parks = [];
    W.start = { x: 2000, y: 2100 };
    W.clear.length = 0; W.clear.push({ x: W.start.x, y: W.start.y, r: 200 });

    // 道路: 格子(少しずらす)。幅 110、歩道 30
    const xs = [300, 1000, 1700, 2400, 3100, 3700];
    const ys = [350, 1050, 1750, 2450, 3150, 3700];
    const RW = 110; const SW = 34;
    const markRoad = (x0, y0, x1, y1) => {
      forTiles(Math.min(x0, x1) - RW / 2 - SW, Math.min(y0, y1) - RW / 2 - SW, Math.max(x0, x1) + RW / 2 + SW, Math.max(y0, y1) + RW / 2 + SW, (tx, ty) => {
        const cx = (tx + 0.5) * TS; const cy = (ty + 0.5) * TS;
        const d = x0 === x1 ? Math.abs(cx - x0) : Math.abs(cy - y0);
        const along = x0 === x1 ? (cy >= Math.min(y0, y1) && cy <= Math.max(y0, y1)) : (cx >= Math.min(x0, x1) && cx <= Math.max(x0, x1));
        if (!along) return;
        const i = ty * N + tx;
        if (d <= RW / 2) tiles[i] = T_ROAD; else if (d <= RW / 2 + SW && tiles[i] !== T_ROAD) tiles[i] = T_WALK;
      });
    };
    for (const x of xs) { W.roads.push({ x0: x, y0: 200, x1: x, y1: S - 200 }); markRoad(x, 200, x, S - 200); }
    for (const y of ys) { W.roads.push({ x0: 200, y0: y, x1: S - 200, y1: y }); markRoad(200, y, S - 200, y); }
    W.tileKind = (x, y) => W.tileAt(x, y);

    // 区画ごとに 建物 or 公園 or 空き地
    const bcol = ['#f3d9b1', '#d9e6f2', '#f6e3e3', '#e3f0d6', '#efe2f5', '#fff1c9', '#dbe9ee'];
    const rcol = ['#c0392b', '#2e86c1', '#7d5a3a', '#4a7a4a', '#8e44ad', '#e67e22', '#5d6d7e'];
    const signs = ['パン', 'カフェ', '本', 'おかし', '花', 'おもちゃ', 'ゲーム', 'くつ', 'やおや', 'ラーメン', 'ピザ', 'ケーキ'];
    let lotIdx = 0;
    const parkLots = new Set([7, 14, 19]);
    for (let yi = 0; yi < ys.length - 1; yi++) {
      for (let xi = 0; xi < xs.length - 1; xi++) {
        const x0 = xs[xi] + RW / 2 + SW; const x1 = xs[xi + 1] - RW / 2 - SW;
        const y0 = ys[yi] + RW / 2 + SW; const y1 = ys[yi + 1] - RW / 2 - SW;
        const idx = lotIdx++;
        const cx = (x0 + x1) / 2; const cy = (y0 + y1) / 2;
        if (Math.hypot(cx - W.start.x, cy - W.start.y) < 420 || parkLots.has(idx)) {
          // 公園: 木・ベンチ・花だん・噴水(かざり)
          W.parks.push({ x0, y0, x1, y1 });
          addDecor('lawn', cx, cy, 0, { rx: (x1 - x0) / 2, ry: (y1 - y0) / 2 });
          for (let i = 0; i < 9; i++) { const tx = R(x0 + 40, x1 - 40); const ty = R(y0 + 40, y1 - 40); if (Math.hypot(tx - W.start.x, ty - W.start.y) < 150) continue; addTree(tx, ty, R(0.8, 1.15), 30, 0, rng() < 0.3 ? 'pine' : 'tree'); }
          for (let i = 0; i < 2; i++) push({ kind: 'bench', x: R(x0 + 60, x1 - 60), y: R(y0 + 60, y1 - 60), r: 10, hgt: 30, hw: 30, s: 1 });
          if (Math.hypot(cx - W.start.x, cy - W.start.y) > 420) push({ kind: 'fountain', x: cx, y: cy, r: 38, hgt: 60, hw: 50, s: 1 });
          else W.clear.push({ x: cx, y: cy, r: 160 });
          for (let i = 0; i < 24; i++) addDecor('flower', R(x0, x1), R(y0, y1), Math.floor(R(0, 5)));
          continue;
        }
        // 建物の列: 区画を横に 2〜3 分割
        const cols = Math.floor(R(2, 4));
        const gap = 30;
        const bw = ((x1 - x0) - gap * (cols - 1)) / cols;
        for (let c = 0; c < cols; c++) {
          const bx0 = x0 + c * (bw + gap); const bx1 = bx0 + bw;
          const rows = (y1 - y0) > 440 ? 2 : 1;
          const bh = ((y1 - y0) - gap * (rows - 1)) / rows;
          for (let r2 = 0; r2 < rows; r2++) {
            const by0 = y0 + r2 * (bh + gap); const by1 = by0 + bh;
            // 建物は区画より少し小さく、前(下)に庭やスペース
            const w = bw * R(0.78, 0.92); const h = Math.min(bh * R(0.55, 0.75), 300);
            const bxc = (bx0 + bx1) / 2; const byc = by0 + h / 2 + 10;
            const floors = Math.floor(R(1, 4));
            const b = { kind: 'building', rect: true, x: bxc, y: byc, hw2: w / 2, hh2: h / 2, r: 0, hgt: h + 60 * floors, hw: w / 2 + 10, floors, col: bcol[Math.floor(R(0, bcol.length))], roof: rcol[Math.floor(R(0, rcol.length))], sign: rng() < 0.55 ? signs[Math.floor(R(0, signs.length))] : null, v: Math.floor(R(0, 3)), ph: 0 };
            W.obstacles.push(b); W.hash.insert(b, Math.max(b.hw2, b.hh2) + 2); W.buildings.push(b);
            // 前の空き地に 駐車の車・街灯・植木
            if (rng() < 0.5) { const cx2 = bxc + R(-w * 0.3, w * 0.3); const cy2 = byc + h / 2 + R(40, 70); if (cy2 < by1 - 20) { const car = { kind: 'car', rect: true, x: cx2, y: cy2, hw2: 34, hh2: 16, r: 0, hgt: 50, hw: 40, col: rcol[Math.floor(R(0, rcol.length))], ang: 0, ph: 0 }; W.obstacles.push(car); W.hash.insert(car, 38); } }
            if (rng() < 0.6) addTree(bxc + (rng() < 0.5 ? -1 : 1) * w * 0.45, byc + h / 2 + R(30, 60), R(0.6, 0.85), 20, 0, 'tree');
          }
        }
      }
    }
    // 街灯・ゴミ箱・消火栓: 歩道に
    for (const x of xs) for (let y = 300; y < S - 300; y += 260) { for (const side of [-1, 1]) { const px = x + side * (RW / 2 + 16); if (rng() < 0.7) push({ kind: 'lamp', x: px, y: y + R(-30, 30), r: 5, hgt: 110, hw: 14, s: 1 }); } }
    for (const y of ys) for (let x = 300; x < S - 300; x += 300) { for (const side of [-1, 1]) { const py = y + side * (RW / 2 + 16); const k = rng(); if (k < 0.3) push({ kind: 'hydrant', x: x + R(-30, 30), y: py, r: 6, hgt: 30, hw: 10, s: 1 }); else if (k < 0.5) push({ kind: 'bin', x: x + R(-30, 30), y: py, r: 8, hgt: 34, hw: 12, s: 1 }); } }
    // 横断歩道・マンホール(かざり)
    for (const x of xs) for (const y of ys) { addDecor('cross', x, y - RW / 2 - 17, 0, { rot: 0 }); addDecor('cross', x, y + RW / 2 + 17, 0, { rot: 0 }); addDecor('cross', x - RW / 2 - 17, y, 0, { rot: Math.PI / 2 }); addDecor('cross', x + RW / 2 + 17, y, 0, { rot: Math.PI / 2 }); }
    for (let i = 0; i < 60; i++) { const x = xs[Math.floor(R(0, xs.length))] + R(-30, 30); const y = R(300, S - 300); if (W.tileAt(x, y) === T_ROAD) addDecor('manhole', x, y, 0); }
    // 空き地の草・落ち葉
    for (let i = 0; i < 1600; i++) { const x = R(40, S - 40); const y = R(40, S - 40); if (W.tileAt(x, y) === 0) addDecor('tuft', x, y, Math.floor(R(0, 4))); }
    for (let i = 0; i < 300; i++) { const x = R(40, S - 40); const y = R(40, S - 40); if (W.tileAt(x, y) === 0) addDecor('leaf', x, y, Math.floor(R(0, 4)), { rot: R(0, TAU) }); }
    // 草むら(公園に少し)
    for (const pk of W.parks) for (let i = 0; i < 2; i++) {
      const r = R(50, 80); const x = R(pk.x0 + r, pk.x1 - r); const y = R(pk.y0 + r, pk.y1 - r);
      const blades = []; const n = Math.floor((r * r) / 85);
      for (let k = 0; k < n; k++) { const a = R(0, TAU); const d = Math.sqrt(rng()) * r; blades.push({ dx: Math.cos(a) * d, dy: Math.sin(a) * d * 0.8, h: R(15, 30), w: R(3, 5.2), ph: R(0, TAU), c: Math.floor(R(0, 3)) }); }
      blades.sort((p, q) => p.dy - q.dy);
      W.patches.push({ x, y, r, blades });
    }
    // 外周のフェンス(壁)
    for (let t = 120; t < S - 120; t += 60) { for (const [x, y] of [[t, 120], [t, S - 120], [120, t], [S - 120, t]]) push({ kind: 'fence', x, y, r: 14, hgt: 40, hw: 32, s: 1, vert: x === 120 || x === S - 120 }); }
  }

  // ---------- 絵: 建物・車・街灯など ----------
  function rrect(g, x, y, w, h, r, fill, lw, stroke) { r = Math.min(r, w / 2, h / 2); g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); if (fill) { g.fillStyle = fill; g.fill(); } if (lw) { g.lineWidth = lw; g.strokeStyle = stroke || OUT; g.lineJoin = 'round'; g.stroke(); } }
  function drawBuilding(g, b, t, fade) {
    const w = b.hw2 * 2; const d = b.hh2 * 2; const H = 56 * b.floors;
    g.save(); g.translate(b.x, b.y);
    // 影(右下へ)
    g.fillStyle = 'rgba(20,30,40,0.22)'; g.fillRect(-w / 2 + 14, -d / 2 - H + 10, w, d + H);
    if (fade) g.globalAlpha = 0.45;
    // 正面の壁(手前の面)
    rrect(g, -w / 2, -d / 2 - H, w, H + d, 4, b.col, 2.6);
    // 屋根(上の面)
    g.fillStyle = b.roof; g.fillRect(-w / 2, -d / 2 - H, w, d * 0.55);
    g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(-w / 2, -d / 2 - H, w, 6);
    g.strokeStyle = OUT; g.lineWidth = 2.2; g.strokeRect(-w / 2, -d / 2 - H, w, d * 0.55);
    // 窓
    const top = -d / 2 - H + d * 0.55;
    const cols = Math.max(2, Math.floor(w / 46));
    for (let f = 0; f < b.floors; f++) {
      const y = top + 10 + f * 56;
      for (let c = 0; c < cols; c++) {
        const x = -w / 2 + 14 + c * ((w - 28) / cols) + ((w - 28) / cols - 22) / 2;
        const lit = (G.night || 0) > 0.3 && ((c + f + b.v) % 3 !== 0);
        rrect(g, x, y, 22, 26, 3, lit ? '#ffe9a0' : '#9fd3ec', 2);
        g.fillStyle = lit ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.55)'; g.fillRect(x + 3, y + 3, 7, 9);
        g.strokeStyle = 'rgba(53,40,63,0.5)'; g.lineWidth = 1; g.beginPath(); g.moveTo(x + 11, y); g.lineTo(x + 11, y + 26); g.stroke();
      }
    }
    // 入口とひさし
    const doorY = -d / 2 + d - 34;
    rrect(g, -14, doorY, 28, 34, 3, '#7a4a2a', 2.2);
    g.fillStyle = '#ffd24d'; g.beginPath(); g.arc(8, doorY + 18, 2, 0, TAU); g.fill();
    if (b.sign) {
      g.fillStyle = b.v === 0 ? '#e74c3c' : b.v === 1 ? '#2e86c1' : '#27ae60';
      g.fillRect(-w / 2 + 10, doorY - 22, w - 20, 18);
      g.strokeStyle = OUT; g.lineWidth = 2; g.strokeRect(-w / 2 + 10, doorY - 22, w - 20, 18);
      g.fillStyle = '#fff'; g.font = '800 12px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(b.sign, 0, doorY - 13);
      // ひさし(しましま)
      for (let i = 0; i < 6; i++) { g.fillStyle = i % 2 ? '#fff' : (b.v === 0 ? '#e74c3c' : b.v === 1 ? '#2e86c1' : '#27ae60'); g.fillRect(-36 + i * 12, doorY - 4, 12, 7); }
      g.strokeStyle = OUT; g.lineWidth = 1.6; g.strokeRect(-36, doorY - 4, 72, 7);
    }
    // 壁の下の影
    g.fillStyle = 'rgba(0,0,0,0.08)'; g.fillRect(-w / 2, -d / 2 + d - 8, w, 8);
    g.restore();
  }
  function drawCar(g, c, t) {
    g.save(); g.translate(c.x, c.y);
    g.fillStyle = 'rgba(20,30,40,0.25)'; g.beginPath(); g.ellipse(4, 6, 38, 16, 0, 0, TAU); g.fill();
    for (const x of [-20, 20]) { rrect(g, x - 7, 6, 14, 10, 4, '#2c2c34', 2); }
    rrect(g, -34, -14, 68, 28, 8, c.col, 2.4);
    rrect(g, -20, -30, 40, 20, 7, c.col, 2.2);
    rrect(g, -16, -27, 14, 13, 3, '#bfe8ff', 1.6); rrect(g, 2, -27, 14, 13, 3, '#bfe8ff', 1.6);
    g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(-30, -11, 60, 5);
    g.fillStyle = '#ffe9a0'; g.fillRect(-33, -6, 5, 6); g.fillRect(28, -6, 5, 6);
    g.restore();
  }
  function drawLamp(g, o, t) {
    g.save(); g.translate(o.x, o.y);
    g.fillStyle = 'rgba(20,30,40,0.25)'; g.beginPath(); g.ellipse(3, 2, 9, 4, 0, 0, TAU); g.fill();
    rrect(g, -3, -100, 6, 100, 2, '#5d6d7e', 2);
    rrect(g, -8, -112, 16, 14, 4, '#34495e', 2);
    const night = (G.night || 0) > 0.25;
    rrect(g, -6, -110, 12, 10, 3, night ? '#fff4b0' : '#cfe3ee', 1.6);
    if (night) { const gr = g.createRadialGradient(0, -104, 2, 0, -104, 90); gr.addColorStop(0, 'rgba(255,240,170,0.45)'); gr.addColorStop(1, 'rgba(255,240,170,0)'); g.fillStyle = gr; g.beginPath(); g.arc(0, -104, 90, 0, TAU); g.fill(); }
    g.restore();
  }
  function drawSmall(g, o, t) {
    g.save(); g.translate(o.x, o.y);
    g.fillStyle = 'rgba(20,30,40,0.25)'; g.beginPath(); g.ellipse(2, 2, o.hw, o.hw * 0.4, 0, 0, TAU); g.fill();
    if (o.kind === 'hydrant') { rrect(g, -6, -24, 12, 24, 4, '#e74c3c', 2); rrect(g, -9, -16, 18, 6, 2, '#c0392b', 1.6); rrect(g, -4, -29, 8, 6, 3, '#e74c3c', 1.6); }
    else if (o.kind === 'bin') { rrect(g, -9, -30, 18, 30, 4, '#5d6d7e', 2); rrect(g, -11, -34, 22, 6, 2, '#34495e', 1.6); g.fillStyle = '#9fd3ec'; g.fillRect(-5, -24, 10, 5); }
    else if (o.kind === 'bench') { rrect(g, -26, -16, 52, 8, 2, '#b8865a', 2); rrect(g, -26, -28, 52, 7, 2, '#b8865a', 2); for (const x of [-20, 20]) { rrect(g, x - 3, -10, 6, 10, 1, '#5d6d7e', 1.6); } }
    else if (o.kind === 'fence') { if (o.vert) { rrect(g, -4, -34, 8, 36, 2, '#8a5a38', 2); } else { rrect(g, -30, -30, 60, 6, 2, '#8a5a38', 2); rrect(g, -30, -18, 60, 6, 2, '#8a5a38', 2); for (const x of [-24, 0, 24]) rrect(g, x - 3, -36, 6, 38, 2, '#a8734a', 2); } }
    else if (o.kind === 'fountain') {
      g.beginPath(); g.ellipse(0, 0, 40, 24, 0, 0, TAU); g.fillStyle = '#c9c3b4'; g.fill(); g.lineWidth = 2.4; g.strokeStyle = OUT; g.stroke();
      g.beginPath(); g.ellipse(0, -2, 32, 18, 0, 0, TAU); g.fillStyle = '#5cb9e3'; g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.6)'; g.lineWidth = 2; for (let i = 0; i < 3; i++) { const a = t * 1.2 + i * 2; g.beginPath(); g.ellipse(0, -2, 12 + i * 7, 7 + i * 4, 0, a, a + 1); g.stroke(); }
      rrect(g, -5, -40, 10, 38, 3, '#c9c3b4', 2);
      for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + (i - 2) * 0.35; const h = 26 + Math.sin(t * 6 + i) * 3; g.strokeStyle = '#9fd3ec'; g.lineWidth = 3; g.lineCap = 'round'; g.beginPath(); g.moveTo(0, -40); g.quadraticCurveTo(Math.cos(a) * h, -40 + Math.sin(a) * h - 10, Math.cos(a) * h * 1.3, -8); g.stroke(); }
    }
    g.restore();
  }

  // ---------- 絵: 人間キャラ共通 ----------
  const SKIN = '#ffd9b8';
  function fill(g, c, lw) { g.fillStyle = c; g.fill(); if (lw) { g.lineWidth = lw; g.strokeStyle = OUT; g.lineJoin = 'round'; g.lineCap = 'round'; g.stroke(); } }
  function circ(g, x, y, r, c, lw) { g.beginPath(); g.arc(x, y, r, 0, TAU); fill(g, c, lw); }
  function ell(g, x, y, rx, ry, c, lw) { g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, TAU); fill(g, c, lw); }
  function legs(g, e, wk, bob, col, shoe, sp) {
    for (const sx of [-1, 1]) {
      const ph = sx * wk; const lift = e.moving ? Math.max(0, -ph) * 4 : 0;
      const hx = sx * 5; const hy = -16 + bob; const kx = hx + ph * 3; const ky = -8 - lift * 0.5; const fx = hx + ph * 5; const fy = -1 - lift;
      Art.tube(g, [hx, hy, kx, ky, fx, fy], 5, col);
      const sg = g.createLinearGradient(0, fy - 3, 0, fy + 3); sg.addColorStop(0, Art.lite(shoe, 0.35)); sg.addColorStop(1, Art.dark(shoe, 0.3));
      ell(g, fx + 1.4, fy + 0.5, 5.4, 3.2, sg, 1.8);
    }
  }
  function arms(g, sx, sy, ex, ey, hx, hy, col) {
    Art.tube(g, [sx, sy, ex, ey, hx, hy], 4.2, col);
    circ(g, hx, hy, 3.2, SKIN, 1.6);
  }
  // 頭: 球の陰影つき
  function head(g, key, x, y, r, col, lw) { Art.orb(g, key, x, y, r, r, col, lw || 2.2, 0.32, 0.32); }
  // 服: 上から下、左から右へ暗くなるグラデーション
  function cloth(g, key, x0, y0, x1, y1, col) {
    const gr = g.createLinearGradient(x0, y0, x1, y1); gr.addColorStop(0, Art.lite(col, 0.28)); gr.addColorStop(0.5, col); gr.addColorStop(1, Art.dark(col, 0.38)); return gr;
  }
  function softShadow(g, rx, ry, a, ox, oy) { const S = Art.S; if (S.shadowBlob) { g.save(); g.globalAlpha = a / 0.5; g.drawImage(S.shadowBlob.c, ox - rx, oy - ry, rx * 2, ry * 2); g.restore(); } }
  function alertMark(g, y, t) { const s = 1 + Math.sin(t * 24) * 0.12; g.save(); g.translate(0, y); g.scale(s, s); g.beginPath(); g.moveTo(-5, -9); g.lineTo(5, -9); g.lineTo(2.4, 3); g.lineTo(-2.4, 3); g.closePath(); fill(g, '#ff3b3b', 2); circ(g, 0, 8, 2.6, '#ff3b3b', 1.8); g.restore(); }
  function dizzy(g, e, y) { for (let i = 0; i < 3; i++) { const a = e.t * 5 + (i * TAU) / 3; Art.star(g, Math.cos(a) * 15, y + Math.sin(a) * 4, 4, a, '#ffe14d', 1.2); } }
  function inkCover(g, e, spots) {
    const cover = 1 - clamp(e.hp / e.maxHp, 0, 1);
    const n = Math.floor(cover * spots.length + (e.state === 'flee' ? spots.length : 0));
    for (let i = 0; i < Math.min(n, spots.length); i++) { const [x, y, r] = spots[i]; g.fillStyle = '#ff3d9a'; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); g.fillStyle = 'rgba(255,255,255,0.5)'; g.beginPath(); g.arc(x - r * 0.3, y - r * 0.3, r * 0.3, 0, TAU); g.fill(); }
  }

  // どろぼう: 黒マスク、しましま、ふくろ
  function drawThief(g, e, t) {
    const moving = e.moving; const wk = moving ? Math.sin(e.t * 16) : 0; const bob = moving ? -Math.abs(wk) * 3 : Math.sin(e.t * 2.4) * -0.8;
    const wind = e.state === 'windup' ? clamp(e.st / e.dur, 0, 1) : 0; const dir = e.face >= 0 ? 1 : -1;
    softShadow(g, 18, 7, 0.42, 0, 2);
    g.save(); g.scale(dir, 1); g.rotate(moving ? 0.12 : 0);
    legs(g, e, wk, bob, '#2c2c34', '#555', 1);
    // ふくろ(背中)
    g.save(); g.translate(-14, -30 + bob); g.rotate(-0.4); ell(g, 0, 0, 10, 13, '#e8dcc0', 2); g.strokeStyle = OUT; g.lineWidth = 1.5; g.beginPath(); g.moveTo(-5, -11); g.lineTo(5, -11); g.stroke(); g.fillStyle = OUT; g.font = '800 10px sans-serif'; g.textAlign = 'center'; g.fillText('¥', 0, 4); g.restore();
    // 胴(しましま)
    g.beginPath(); g.moveTo(-9, -17 + bob); g.quadraticCurveTo(-11, -30 + bob, -7, -34 + bob); g.lineTo(7, -34 + bob); g.quadraticCurveTo(11, -30 + bob, 9, -17 + bob); g.closePath(); fill(g, cloth(g, 'thief', -9, -34 + bob, 9, -17 + bob, '#f4f4f8'), 2.2);
    g.save(); g.clip(); g.fillStyle = '#2c2c34'; for (let y = -33; y < -16; y += 6) g.fillRect(-12, y + bob, 24, 3); g.fillStyle = 'rgba(40,20,60,0.22)'; g.fillRect(4, -35 + bob, 8, 20); g.restore();
    arms(g, 9, -31 + bob, 15 + wind * 4, -24 + bob, 20 + wind * 6, -18 + bob + wk * 2, '#fff');
    arms(g, -9, -31 + bob, -13, -22 + bob, -10, -14 + bob - wk * 2, '#fff');
    // 頭: 黒いマスクと目だけ
    g.save(); g.translate(1, -43 + bob);
    head(g, 'thiefhead', 0, 0, 12, SKIN);
    g.fillStyle = '#2c2c34'; g.beginPath(); g.ellipse(0, -2, 12.5, 6.5, 0, 0, TAU); g.fill();
    for (const sx of [-1, 1]) { ell(g, sx * 4.5, -2, 3.2, 2.4, '#fff', 0); circ(g, sx * 4.5 + 0.8, -2, 1.4, OUT, 0); }
    g.fillStyle = '#2c2c34'; g.beginPath(); g.ellipse(0, -11, 11, 4, 0, 0, TAU); g.fill(); // ぼうし
    g.strokeStyle = OUT; g.lineWidth = 1.6; g.beginPath(); g.moveTo(-3, 6); g.quadraticCurveTo(0, 8.5, 3, 6); g.stroke();
    // ひげ
    g.strokeStyle = OUT; g.lineWidth = 1.2; g.beginPath(); g.moveTo(-5, 4); g.lineTo(-8, 3); g.moveTo(5, 4); g.lineTo(8, 3); g.stroke();
    g.restore();
    inkCover(g, e, [[-6, -28 + bob, 4], [6, -36 + bob, 3.6], [3, -20 + bob, 3.4], [-8, -44 + bob, 3], [8, -46 + bob, 3]]);
    g.restore();
    if (e.state === 'stun' || e.state === 'flee') dizzy(g, e, -62);
    if (wind > 0) alertMark(g, -70, t);
  }
  // ゾンビ: 緑の肌、ぼろ服、腕を前に
  function drawZombie(g, e, t) {
    const moving = e.moving; const wk = moving ? Math.sin(e.t * 6) : 0; const bob = moving ? -Math.abs(wk) * 2 : Math.sin(e.t * 1.6) * -1;
    const wind = e.state === 'windup' ? clamp(e.st / e.dur, 0, 1) : 0; const swing = e.state === 'attack' ? clamp(e.st / 0.25, 0, 1) : 0; const dir = e.face >= 0 ? 1 : -1;
    softShadow(g, 20, 8, 0.44, 0, 2);
    g.save(); g.scale(dir, 1); g.rotate(0.08 + (moving ? wk * 0.05 : 0));
    legs(g, e, wk, bob, '#4a5a6a', '#2c2c34', 1);
    g.beginPath(); g.moveTo(-11, -16 + bob); g.lineTo(-9, -36 + bob); g.lineTo(9, -36 + bob); g.lineTo(11, -16 + bob); g.lineTo(6, -14 + bob); g.lineTo(2, -18 + bob); g.lineTo(-3, -13 + bob); g.lineTo(-7, -17 + bob); g.closePath(); fill(g, cloth(g, 'zomb', -11, -36 + bob, 11, -14 + bob, '#6c7a89'), 2.2);
    g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(-9, -24 + bob, 7, 5); g.fillRect(2, -32 + bob, 6, 4);
    // 腕を前に(のばす)
    const reach = 14 + wind * 10 + swing * 6;
    arms(g, 9, -33 + bob, 16, -34 + bob + Math.sin(e.t * 3) * 2, 9 + reach, -32 + bob, '#8fbf8a');
    arms(g, -9, -33 + bob, -2, -36 + bob, 6 + reach, -38 + bob + Math.sin(e.t * 3 + 1) * 2, '#8fbf8a');
    g.save(); g.translate(2, -46 + bob); g.rotate(0.15);
    head(g, 'zombhead', 0, 0, 12.5, '#8fbf8a');
    g.fillStyle = '#3c4a38'; g.beginPath(); g.moveTo(-12, -3); g.quadraticCurveTo(-8, -15, 2, -13); g.quadraticCurveTo(12, -12, 12, -2); g.lineTo(8, -7); g.lineTo(4, -4); g.lineTo(-1, -9); g.lineTo(-5, -4); g.lineTo(-9, -8); g.closePath(); g.fill(); g.lineWidth = 2; g.strokeStyle = OUT; g.stroke();
    ell(g, -4.5, 0, 3.4, 3.8, '#fff', 1.6); circ(g, -4, 0.5, 1.3, OUT, 0); ell(g, 5, 1, 2.6, 3, '#fff', 1.6); circ(g, 5.4, 1.5, 1.2, OUT, 0);
    g.strokeStyle = OUT; g.lineWidth = 1.6; g.beginPath(); g.moveTo(-5, 7); g.lineTo(-2, 5.5); g.lineTo(1, 7.5); g.lineTo(4, 5.5); g.lineTo(6, 7); g.stroke();
    g.fillStyle = '#fff'; g.fillRect(-2, 6, 2.2, 2.2); g.fillRect(2, 6, 2.2, 2.2);
    g.fillStyle = 'rgba(80,40,60,0.5)'; g.beginPath(); g.arc(8, -5, 2.2, 0, TAU); g.fill();
    g.restore();
    inkCover(g, e, [[-6, -28 + bob, 4.2], [6, -34 + bob, 3.6], [2, -20 + bob, 3.4], [-6, -48 + bob, 3.2], [9, -50 + bob, 3]]);
    g.restore();
    if (e.state === 'stun' || e.state === 'flee') dizzy(g, e, -64);
    if (wind > 0) alertMark(g, -72, t);
  }
  // リーゼント(髪)を描く。scale で大きさを変える
  function drawPompadour(g, s, col) {
    g.save(); g.scale(s, s);
    g.beginPath(); g.moveTo(-12, -6); g.quadraticCurveTo(-14, -18, -4, -22); g.quadraticCurveTo(8, -26, 20, -16); g.quadraticCurveTo(32, -8, 26, 0); g.quadraticCurveTo(14, -6, 6, -4); g.quadraticCurveTo(-2, -2, -12, -6); g.closePath(); fill(g, col, 2.2);
    g.fillStyle = 'rgba(255,255,255,0.28)'; g.beginPath(); g.moveTo(-6, -14); g.quadraticCurveTo(6, -22, 18, -14); g.quadraticCurveTo(8, -16, -4, -10); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.3)'; g.lineWidth = 1.2; for (const [x0, y0, x1, y1] of [[-2, -18, 10, -14], [4, -21, 16, -16], [10, -20, 22, -12]]) { g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); }
    g.restore();
  }
  // ヤンキー: 長ランとリーゼント
  function drawYankee(g, e, t) {
    const moving = e.moving; const wk = moving ? Math.sin(e.t * 11) : 0; const bob = moving ? -Math.abs(wk) * 2.6 : Math.sin(e.t * 2.4) * -0.8;
    const wind = e.state === 'windup' ? clamp(e.st / e.dur, 0, 1) : 0; const charging = e.state === 'attack'; const dir = e.face >= 0 ? 1 : -1;
    softShadow(g, 19, 7, 0.44, 0, 2);
    g.save(); g.scale(dir, 1); g.rotate(moving ? 0.1 : -0.04);
    legs(g, e, wk, bob, '#3b2f6b', '#fff', 1);
    // 長ラン(むらさき)
    g.beginPath(); g.moveTo(-12, -10 + bob); g.lineTo(-10, -36 + bob); g.lineTo(10, -36 + bob); g.lineTo(12, -10 + bob); g.closePath(); fill(g, cloth(g, 'yank', -12, -36 + bob, 12, -10 + bob, '#5b3f9e'), 2.2);
    g.fillStyle = '#ffd24d'; for (let i = 0; i < 3; i++) g.fillRect(-1.5, -30 + bob + i * 7, 3, 3);
    g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(4, -34 + bob, 7, 22);
    // 腕(ポケット or 殴る)
    const px = charging ? 22 : 8 + wind * 10;
    arms(g, 10, -33 + bob, 14 + wind * 4, -26 + bob, px, -24 + bob - (charging ? 10 : 0), '#5b3f9e');
    arms(g, -10, -33 + bob, -14, -24 + bob, -8, -16 + bob, '#5b3f9e');
    // 頭 + リーゼント
    g.save(); g.translate(1, -45 + bob);
    head(g, 'yankhead', 0, 0, 12, SKIN);
    g.strokeStyle = OUT; g.lineWidth = 2.2; for (const sx of [-1, 1]) { g.beginPath(); g.moveTo(sx * 7.5, -5.5); g.lineTo(sx * 2, -3); g.stroke(); }
    for (const sx of [-1, 1]) { ell(g, sx * 4.5, -1, 2.8, 2.2, '#fff', 1.4); circ(g, sx * 4.5 + 0.8, -0.8, 1.2, OUT, 0); }
    g.strokeStyle = OUT; g.lineWidth = 1.6; g.beginPath(); g.moveTo(-3, 6); g.lineTo(4, 5); g.stroke();
    g.fillStyle = '#e8a080'; g.beginPath(); g.ellipse(-6, 4, 2.4, 1.4, 0, 0, TAU); g.fill();
    g.save(); g.translate(-2, -6); drawPompadour(g, 1, '#2c2c34'); g.restore();
    // サングラス(ときどき)
    if (e.v === 1) { g.fillStyle = 'rgba(30,30,40,0.85)'; g.fillRect(-9, -3.5, 7, 4.5); g.fillRect(2, -3.5, 7, 4.5); }
    g.restore();
    inkCover(g, e, [[-6, -28 + bob, 4], [6, -34 + bob, 3.6], [2, -18 + bob, 3.4], [-5, -50 + bob, 3.2], [10, -54 + bob, 3]]);
    g.restore();
    if (e.state === 'stun' || e.state === 'flee') dizzy(g, e, -66);
    if (wind > 0) alertMark(g, -78, t);
  }
  // ボス: ものすごく大きい頭のリーゼント総長
  function drawBossYankee(g, B, t) {
    const weak = B.weak > 0; const wob = B.wob > 0 ? Math.sin(t * 30) * 0.06 : 0; const breath = Math.sin(t * 1.6) * 0.02;
    const intro = B.intro > 0 ? clamp(1 - B.intro / 2.2, 0, 1) : 1;
    softShadow(g, 60 * intro, 22 * intro, 0.5, 0, 6);
    g.save(); g.translate(0, (1 - intro) * 60); g.scale((1 + breath) * intro, (1 - breath) * intro); g.rotate(wob);
    g.scale(B.face || 1, 1);
    const wk = Math.sin(t * 5); const bob = -Math.abs(wk) * 2;
    // 足・長ラン(体は小さめ)
    for (const sx of [-1, 1]) { g.strokeStyle = OUT; g.lineWidth = 14; g.lineCap = 'round'; g.beginPath(); g.moveTo(sx * 10, -20); g.lineTo(sx * 12 + wk * sx * 3, 0); g.stroke(); g.strokeStyle = '#3b2f6b'; g.lineWidth = 9; g.beginPath(); g.moveTo(sx * 10, -20); g.lineTo(sx * 12 + wk * sx * 3, 0); g.stroke(); ell(g, sx * 12 + wk * sx * 3, 1, 9, 5, '#fff', 2); }
    g.beginPath(); g.moveTo(-22, -14 + bob); g.lineTo(-18, -58 + bob); g.lineTo(18, -58 + bob); g.lineTo(22, -14 + bob); g.closePath(); fill(g, cloth(g, 'bossyank', -22, -58 + bob, 22, -14 + bob, '#5b3f9e'), 2.6);
    g.fillStyle = '#ffd24d'; for (let i = 0; i < 4; i++) g.fillRect(-2.5, -50 + bob + i * 9, 5, 5);
    for (const sx of [-1, 1]) { const ax = sx * 20; arms(g, ax, -52 + bob, ax + sx * 14, -36 + bob + (weak ? -30 : 0), ax + sx * (weak ? 6 : 22), -24 + bob + (weak ? -56 : 0), '#5b3f9e'); }
    // 大きな頭
    g.save(); g.translate(0, -78 + bob);
    head(g, 'bosshead', 0, 0, 34, SKIN, 2.8);
    g.strokeStyle = OUT; g.lineWidth = 3.4; g.lineCap = 'round'; for (const sx of [-1, 1]) { g.beginPath(); g.moveTo(sx * 22, -14); g.lineTo(sx * 6, -8); g.stroke(); }
    for (const sx of [-1, 1]) { ell(g, sx * 13, -2, 7.5, 6, '#fff', 2); circ(g, sx * 13 + 2, -1.5, 3.2, OUT, 0); circ(g, sx * 13 + 1, -3, 1.2, '#fff', 0); }
    g.strokeStyle = OUT; g.lineWidth = 2.6; g.beginPath(); if (weak) { g.moveTo(-10, 14); g.quadraticCurveTo(0, 22, 10, 14); } else { g.moveTo(-10, 17); g.lineTo(10, 15); } g.stroke();
    g.fillStyle = '#fff'; if (!weak) { g.fillRect(-6, 14.5, 4, 3); g.fillRect(2, 14, 4, 3); }
    g.fillStyle = '#e8a080'; g.beginPath(); g.ellipse(-20, 10, 6, 3.5, 0, 0, TAU); g.fill(); g.beginPath(); g.ellipse(20, 10, 6, 3.5, 0, 0, TAU); g.fill();
    // 超リーゼント(弱点: くしで とかしている間は 光る)
    g.save(); g.translate(-6, -20);
    if (weak) { g.save(); g.globalAlpha = 0.6 + Math.sin(t * 10) * 0.3; Art.blit(g, Art.S.glowGold, 30, -30, 0.9); g.restore(); }
    drawPompadour(g, 2.9, weak ? '#4a3a6a' : '#2c2c34');
    g.restore();
    if (weak) { // くし
      g.save(); g.translate(-30, -44); g.rotate(-0.5 + Math.sin(t * 8) * 0.2); rrect(g, -3, -16, 6, 32, 2, '#e74c3c', 1.8); for (let i = 0; i < 6; i++) g.fillRect(3, -14 + i * 5, 6, 2); g.restore();
      Art.star(g, 40, -62, 6 + Math.sin(t * 9) * 2, t * 3, '#fff6a8', 0);
    }
    g.restore();
    inkCover(g, B, [[-10, -40 + bob, 6], [8, -50 + bob, 5], [-4, -70 + bob, 6], [14, -84 + bob, 5], [-22, -86 + bob, 5], [0, -30 + bob, 4]]);
    g.restore();
    if (B.flash > 0) { g.save(); g.globalAlpha = B.flash * 4; g.globalCompositeOperation = 'lighter'; circ(g, 0, -90, 90, 'rgba(255,255,255,0.4)', 0); g.restore(); }
  }
  // 警察官: 青い制服、帽子。うさぎの役(さわるとスピードアップ)。歩く
  function drawPolice(g, c, t) {
    const dir = c.face >= 0 ? 1 : -1;
    const moving = c.hopping;
    const wk = moving ? Math.sin(c.t * 14) : 0; const bob = moving ? -Math.abs(wk) * 2 : Math.sin(t * 2.2) * -0.6;
    softShadow(g, 12, 5, 0.4, 0, 1);
    g.save(); g.scale(dir * 0.8, 0.8);
    legs(g, { moving }, wk, bob, '#2e4a8a', '#2c2c34', 1);
    g.beginPath(); g.moveTo(-9, -17 + bob); g.quadraticCurveTo(-11, -30 + bob, -7, -34 + bob); g.lineTo(7, -34 + bob); g.quadraticCurveTo(11, -30 + bob, 9, -17 + bob); g.closePath(); fill(g, cloth(g, 'police', -9, -34 + bob, 9, -17 + bob, '#2e4a8a'), 2.2);
    g.fillStyle = '#ffd24d'; g.fillRect(-6, -30 + bob, 3, 3); g.fillStyle = '#fff'; g.fillRect(-3, -34 + bob, 6, 4);
    arms(g, 9, -31 + bob, 13, -24 + bob, 10, -16 + bob + wk * 3, '#2e4a8a');
    arms(g, -9, -31 + bob, -13, -24 + bob, -10, -16 + bob - wk * 3, '#2e4a8a');
    g.save(); g.translate(1, -43 + bob);
    head(g, 'policehead', 0, 0, 12, SKIN);
    for (const sx of [-1, 1]) { ell(g, sx * 4.5, 0, 3, 3.4, '#fff', 1.4); circ(g, sx * 4.5 + 0.6, 0.6, 1.5, OUT, 0); circ(g, sx * 4.5 + 1.2, -0.4, 0.6, '#fff', 0); }
    g.strokeStyle = OUT; g.lineWidth = 1.5; g.beginPath(); g.arc(0, 4.5, 2.6, 0.2, Math.PI - 0.2); g.stroke();
    g.fillStyle = '#2e4a8a'; g.beginPath(); g.moveTo(-13, -4); g.quadraticCurveTo(-12, -16, 0, -16); g.quadraticCurveTo(12, -16, 13, -4); g.closePath(); g.fill(); g.lineWidth = 2; g.strokeStyle = OUT; g.stroke();
    g.fillStyle = '#2c2c34'; g.beginPath(); g.ellipse(2, -3, 13, 3, 0, 0, TAU); g.fill();
    g.fillStyle = '#ffd24d'; g.beginPath(); g.arc(0, -10, 2.4, 0, TAU); g.fill();
    g.restore();
    g.restore();
    // サイレンの光(ときどき)
    if (Math.floor(t * 3) % 2 === 0) circ(g, 0, -58, 3, 'rgba(255,60,60,0.9)', 0); else circ(g, 0, -58, 3, 'rgba(80,120,255,0.9)', 0);
  }

  // ---------- 絵: 武器(ドローン・弾) ----------
  function drawDrone(g, d, t) {
    const hov = Math.sin(t * 6 + d.ph) * 3;
    g.save(); g.translate(0, -44 + hov);
    g.fillStyle = 'rgba(20,30,40,0.2)'; g.beginPath(); g.ellipse(0, 44 - hov, 14, 6, 0, 0, TAU); g.fill();
    for (const sx of [-1, 1]) { g.strokeStyle = OUT; g.lineWidth = 3; g.beginPath(); g.moveTo(sx * 6, -2); g.lineTo(sx * 16, -8); g.stroke(); g.save(); g.translate(sx * 16, -9); g.scale(1, 0.35); g.rotate(t * 40); g.fillStyle = 'rgba(80,90,110,0.7)'; g.fillRect(-10, -1.5, 20, 3); g.fillRect(-1.5, -10, 3, 20); g.restore(); }
    rrect(g, -9, -6, 18, 12, 5, '#5d6d7e', 2);
    circ(g, 0, 0, 3.6, d.cd < 0.1 ? '#ff6a3d' : '#9fd3ec', 1.4);
    rrect(g, 4, 4, 8, 4, 1.5, '#2c2c34', 1.2);
    g.restore();
  }

  return { ENEMIES, BOSS, populate, drawBuilding, drawCar, drawLamp, drawSmall, drawThief, drawZombie, drawYankee, drawBossYankee, drawPolice, drawDrone };
})();
