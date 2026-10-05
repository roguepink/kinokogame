'use strict';
/* 絵づくり。画像ファイルは使わず、すべて Canvas のパスで描く。
   アニメ風にするため「濃いふちどり + ベタ塗り + 2階調の影 + ハイライト」で統一する。
   木や岩などの止まっているものは起動時にスプライト(オフスクリーン画像)へ焼いておき、毎フレームは drawImage だけにする。 */

const Art = (() => {
  const OUT = '#35283f';       // キャラクターのふちどり(黒ではなく紫がかった濃色)
  const FOLIAGE_OUT = '#2a5a3c';
  const INK = { main: '#ff3d9a', light: '#ff9ad0', dark: '#c4126a' };
  const SKIN = '#ffd9b8';
  let SC = 2;
  const S = {}; // スプライト置き場

  // ---------- 描画ヘルパー ----------
  function fillStroke(g, fill, lw, stroke) {
    if (fill) { g.fillStyle = fill; g.fill(); }
    if (lw) { g.lineWidth = lw; g.strokeStyle = stroke || OUT; g.lineJoin = 'round'; g.lineCap = 'round'; g.stroke(); }
  }
  function ell(g, x, y, rx, ry, fill, lw = 2, rot = 0) {
    g.beginPath(); g.ellipse(x, y, rx, ry, rot, 0, TAU); fillStroke(g, fill, lw);
  }
  function circ(g, x, y, r, fill, lw = 2) {
    g.beginPath(); g.arc(x, y, r, 0, TAU); fillStroke(g, fill, lw);
  }
  function poly(g, pts, fill, lw = 2) {
    g.beginPath(); g.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
    g.closePath(); fillStroke(g, fill, lw);
  }
  function rrect(g, x, y, w, h, r, fill, lw = 2) {
    r = Math.min(r, w / 2, h / 2);
    g.beginPath();
    g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
    fillStroke(g, fill, lw);
  }
  // 点列をなめらかな閉曲線にする(岩など用)
  function blob(g, pts, fill, lw = 2) {
    const n = pts.length / 2;
    const mid = (i) => [(pts[(i % n) * 2] + pts[((i + 1) % n) * 2]) / 2, (pts[(i % n) * 2 + 1] + pts[((i + 1) % n) * 2 + 1]) / 2];
    g.beginPath();
    const m0 = mid(n - 1);
    g.moveTo(m0[0], m0[1]);
    for (let i = 0; i < n; i++) { const m = mid(i); g.quadraticCurveTo(pts[i * 2], pts[i * 2 + 1], m[0], m[1]); }
    g.closePath(); fillStroke(g, fill, lw);
  }
  function star(g, x, y, r, rot, fill, lw = 0) {
    g.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = rot + (i * Math.PI) / 4;
      const rr = i % 2 === 0 ? r : r * 0.32;
      g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    g.closePath(); fillStroke(g, fill, lw);
  }
  function shadow(g, rx, ry, a = 0.24, ox = 0, oy = 1) {
    if (typeof G !== 'undefined' && G.noShadow) return;
    g.fillStyle = `rgba(28,50,30,${a})`; g.beginPath(); g.ellipse(ox, oy, rx, ry, 0, 0, TAU); g.fill();
  }

  // 画像(スプライト)を作る。w,h は論理サイズ、(ox,oy) が基準点
  function mk(w, h, ox, oy, draw) {
    const c = document.createElement('canvas');
    c.width = Math.ceil(w * SC); c.height = Math.ceil(h * SC);
    const g = c.getContext('2d');
    g.scale(SC, SC); g.translate(ox, oy);
    draw(g);
    return { c, w, h, ox, oy };
  }
  function blit(ctx, s, x, y, sc = 1) {
    ctx.drawImage(s.c, x - s.ox * sc, y - s.oy * sc, s.w * sc, s.h * sc);
  }

  // ---------- 木・岩・山などのスプライト(絵本のような塗り重ね) ----------
  // 葉のかたまりを何枚も重ねて、光(左上)と影(右下)で丸みを出す
  const TREE_COL = [
    { base: '#4fae5a', light: '#8fd56a', dark: '#2c7a44', deep: '#1e5a34' },   // 若葉
    { base: '#3f9a7a', light: '#7fcfa6', dark: '#246b55', deep: '#174a3c' },   // 青みの葉
    { base: '#8fbf4a', light: '#cfe78a', dark: '#5a8f2e', deep: '#3d6a1e' },   // 黄緑
    { base: '#d9883a', light: '#f5c66a', dark: '#a8552a', deep: '#7a3a1c' },   // 紅葉
  ];
  const foliageRnd = mulberry32(31);

  // 円の集まり(cs)で輪郭を作り、その中に葉のかたまりを散らす
  function paintFoliage(g, cs, c, rnd, outlineW) {
    const path = () => { g.beginPath(); for (const [x, y, r] of cs) { g.moveTo(x + r, y); g.arc(x, y, r, 0, TAU); } };
    // ふちどり(濃い緑)
    path(); g.fillStyle = c.deep; g.fill();
    g.lineWidth = outlineW; g.strokeStyle = c.deep; g.lineJoin = 'round'; g.stroke();
    g.save(); path(); g.clip();
    g.fillStyle = c.dark; g.fillRect(-200, -300, 400, 400);
    // 葉のかたまり: 下から上へ、だんだん明るく
    let minY = 1e9; let maxY = -1e9; let minX = 1e9; let maxX = -1e9;
    for (const [x, y, r] of cs) { minY = Math.min(minY, y - r); maxY = Math.max(maxY, y + r); minX = Math.min(minX, x - r); maxX = Math.max(maxX, x + r); }
    const n = Math.floor(((maxX - minX) * (maxY - minY)) / 110);
    const blobs = [];
    for (let i = 0; i < n; i++) {
      const x = minX + rnd() * (maxX - minX);
      const y = minY + rnd() * (maxY - minY);
      blobs.push([x, y, 7 + rnd() * 9, rnd()]);
    }
    blobs.sort((a, b) => b[1] - a[1]);
    for (const [x, y, r, k] of blobs) {
      const u = 1 - (y - minY) / (maxY - minY); // 上ほど明るい
      const lightSide = (x - minX) / (maxX - minX) < 0.55 ? 1 : 0;
      let col = c.base;
      if (u > 0.55 && k < 0.5 + lightSide * 0.3) col = c.light;
      else if (u < 0.3 && k < 0.6) col = c.dark;
      g.fillStyle = col; g.beginPath(); g.ellipse(x, y, r, r * 0.8, 0, 0, TAU); g.fill();
      // かたまりの下側にうすい影
      g.fillStyle = 'rgba(20,60,40,0.18)'; g.beginPath(); g.ellipse(x + 1, y + r * 0.45, r * 0.9, r * 0.35, 0, 0, TAU); g.fill();
    }
    // 全体の立体感: 左上が明るく右下が暗い
    const gr = g.createRadialGradient(minX + (maxX - minX) * 0.32, minY + (maxY - minY) * 0.25, 4, (minX + maxX) / 2, (minY + maxY) / 2, (maxX - minX) * 0.75);
    gr.addColorStop(0, 'rgba(255,255,200,0.22)'); gr.addColorStop(0.55, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(10,40,30,0.5)');
    g.fillStyle = gr; g.fillRect(minX - 10, minY - 10, maxX - minX + 20, maxY - minY + 20);
    // ところどころ葉の形(ハイライト)
    g.strokeStyle = 'rgba(255,255,220,0.35)'; g.lineWidth = 1.4; g.lineCap = 'round';
    for (let i = 0; i < n / 3; i++) {
      const x = minX + rnd() * (maxX - minX); const y = minY + rnd() * (maxY - minY) * 0.6;
      g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 3, y - 4, x + 6, y - 2); g.stroke();
    }
    g.restore();
  }
  function softShadow(g, rx, ry, a, ox, oy) {
    if (typeof G !== 'undefined' && G.noShadow) return;
    if (S.shadowBlob) {
      g.save(); g.globalAlpha = a / 0.5;
      g.drawImage(S.shadowBlob.c, ox - rx, oy - ry, rx * 2, ry * 2);
      g.restore();
      return;
    }
    const gr = g.createRadialGradient(ox, oy, 2, ox, oy, rx);
    gr.addColorStop(0, `rgba(25,50,30,${a})`); gr.addColorStop(0.7, `rgba(25,50,30,${a * 0.55})`); gr.addColorStop(1, 'rgba(25,50,30,0)');
    g.save(); g.translate(ox, oy); g.scale(1, ry / rx); g.translate(-ox, -oy);
    g.fillStyle = gr; g.beginPath(); g.arc(ox, oy, rx, 0, TAU); g.fill(); g.restore();
  }
  function drawTrunk(g, w, h, roots) {
    // 幹: 下がひろがり、木目と根
    g.beginPath(); g.moveTo(-w * 1.5, 4); g.quadraticCurveTo(-w * 0.8, -h * 0.2, -w * 0.75, -h); g.lineTo(w * 0.75, -h); g.quadraticCurveTo(w * 0.8, -h * 0.2, w * 1.5, 4); g.quadraticCurveTo(0, 9, -w * 1.5, 4); g.closePath();
    const gr = g.createLinearGradient(-w, 0, w, 0);
    gr.addColorStop(0, '#5c3b24'); gr.addColorStop(0.35, '#8a5a38'); gr.addColorStop(0.7, '#6e4529'); gr.addColorStop(1, '#45291a');
    fillStroke(g, gr, 2.2, '#2e1c12');
    g.save(); g.clip();
    g.strokeStyle = 'rgba(40,20,10,0.35)'; g.lineWidth = 1.3; g.lineCap = 'round';
    for (let i = 0; i < 5; i++) { const x = -w * 0.6 + i * w * 0.3; g.beginPath(); g.moveTo(x, 2); g.quadraticCurveTo(x + 1.5, -h * 0.5, x - 1, -h); g.stroke(); }
    g.strokeStyle = 'rgba(255,220,180,0.25)'; g.beginPath(); g.moveTo(-w * 0.35, 0); g.quadraticCurveTo(-w * 0.3, -h * 0.5, -w * 0.4, -h); g.stroke();
    g.restore();
    if (roots) {
      g.fillStyle = '#5c3b24';
      for (const [x, d] of [[-w * 1.6, -1], [w * 1.6, 1], [-w * 0.4, -1], [w * 0.5, 1]]) { g.beginPath(); g.moveTo(x, 4); g.quadraticCurveTo(x + d * 6, 5, x + d * 9, 8); g.lineTo(x + d * 3, 8); g.closePath(); g.fill(); }
    }
  }

  function buildTrees() {
    S.trunk = mk(90, 70, 45, 44, (g) => {
      softShadow(g, 40, 16, 0.42, 12, 6);
      drawTrunk(g, 8, 34, true);
    });
    S.canopy = TREE_COL.map((c) => mk(170, 160, 85, 136, (g) => {
      const cs = [[0, -66, 42], [-32, -50, 30], [32, -50, 30], [-20, -92, 29], [22, -94, 27], [0, -42, 30], [-40, -72, 22], [40, -74, 22], [0, -112, 20]];
      paintFoliage(g, cs, c, foliageRnd, 5);
    }));
    // 針葉樹: 段ごとにぎざぎざの縁、針の筋
    S.pine = [['#2f8f5c', '#5fbf84', '#1b5a3c', '#123f2a'], ['#3a8f80', '#74c4b0', '#206055', '#143f38']].map(([base, light, dark, deep]) => mk(120, 160, 60, 146, (g) => {
      softShadow(g, 36, 14, 0.42, 10, 6);
      drawTrunk(g, 5, 22, false);
      const tiers = [[-58, -8, 36], [-88, -40, 29], [-116, -70, 22], [-140, -98, 14]];
      for (const [top, bot, hw] of tiers) {
        const edge = () => {
          g.beginPath(); g.moveTo(0, top);
          for (let i = 1; i <= 5; i++) { const t = i / 5; g.lineTo(hw * t + (i % 2 ? 3 : -2), top + (bot - top) * t + (i % 2 ? 5 : 0)); }
          g.quadraticCurveTo(hw * 0.5, bot + 10, 0, bot + 4);
          g.quadraticCurveTo(-hw * 0.5, bot + 10, -hw, bot);
          for (let i = 4; i >= 1; i--) { const t = i / 5; g.lineTo(-hw * t - (i % 2 ? 3 : -2), top + (bot - top) * t + (i % 2 ? 5 : 0)); }
          g.closePath();
        };
        edge(); g.fillStyle = deep; g.fill(); g.lineWidth = 4; g.strokeStyle = deep; g.lineJoin = 'round'; g.stroke();
        g.save(); edge(); g.clip();
        const gr = g.createLinearGradient(-hw, 0, hw, 0);
        gr.addColorStop(0, light); gr.addColorStop(0.45, base); gr.addColorStop(1, dark);
        g.fillStyle = gr; g.fillRect(-hw - 5, top - 5, hw * 2 + 10, bot - top + 20);
        g.strokeStyle = 'rgba(10,40,30,0.35)'; g.lineWidth = 1.2; g.lineCap = 'round';
        for (let i = 0; i < 9; i++) { const y = top + 6 + i * ((bot - top) / 9); const w = hw * ((y - top) / (bot - top)); g.beginPath(); g.moveTo(0, y - 4); g.lineTo(-w * 0.9, y + 4); g.moveTo(0, y - 4); g.lineTo(w * 0.9, y + 4); g.stroke(); }
        g.strokeStyle = 'rgba(255,255,220,0.3)'; g.beginPath(); g.moveTo(0, top + 2); g.lineTo(0, bot); g.stroke();
        g.restore();
      }
    }));
    // 柳: 葉のかたまりの下から、細い枝がしなやかに垂れる
    S.willow = [['#6fbf6a', '#a8e08a', '#3f8a4a', '#2a5f36'], ['#8fc77a', '#c8ec9a', '#5a9a4a', '#3a6a30']].map(([base, light, dark, deep]) => mk(170, 175, 85, 150, (g) => {
      softShadow(g, 44, 16, 0.42, 14, 6);
      drawTrunk(g, 7, 46, true);
      const cs = [[0, -98, 40], [-36, -86, 26], [36, -86, 26], [-14, -122, 26], [16, -124, 24]];
      paintFoliage(g, cs, { base, light, dark, deep }, foliageRnd, 4.5);
      g.lineCap = 'round';
      const rnd = mulberry32(base.length + 11);
      for (let i = 0; i < 18; i++) {
        const x = -58 + i * 6.6 + (rnd() - 0.5) * 4;
        const top = -84 + Math.abs(x) * 0.32;
        const len = 26 + rnd() * 30 + (24 - Math.abs(x) * 0.35);
        const sway = (rnd() - 0.5) * 14;
        g.strokeStyle = i % 2 ? dark : deep; g.lineWidth = 1.4;
        g.beginPath(); g.moveTo(x, top); g.quadraticCurveTo(x + sway * 0.4, top + len * 0.55, x + sway, top + len); g.stroke();
        g.fillStyle = i % 3 === 0 ? light : base;
        for (let k = 6; k < len; k += 7) { const px = x + sway * (k / len) * (k / len); g.beginPath(); g.ellipse(px + (k % 2 ? 2.4 : -2.4), top + k, 3.2, 1.5, k % 2 ? 0.7 : -0.7, 0, TAU); g.fill(); }
      }
    }));
    // 枯れ木
    S.dead = mk(120, 140, 60, 130, (g) => {
      softShadow(g, 30, 11, 0.4, 10, 5);
      const branch = (x0, y0, x1, y1, w) => { g.strokeStyle = '#2e1c12'; g.lineWidth = w + 4; g.lineCap = 'round'; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); g.strokeStyle = '#6b5240'; g.lineWidth = w; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); };
      branch(0, 0, -2, -60, 11); branch(-2, -60, 4, -110, 7);
      branch(-2, -50, -36, -86, 5); branch(-36, -86, -46, -112, 3); branch(-20, -68, -30, -96, 2.5);
      branch(0, -72, 30, -100, 5); branch(30, -100, 52, -108, 3); branch(18, -88, 24, -118, 2.5);
      branch(4, -110, -8, -128, 3); branch(4, -110, 16, -126, 2.5);
      g.strokeStyle = 'rgba(255,235,210,0.25)'; g.lineWidth = 2; g.beginPath(); g.moveTo(-4, -4); g.lineTo(-5, -56); g.stroke();
      // キツツキの穴とキノコ
      g.fillStyle = '#1e1208'; g.beginPath(); g.ellipse(2, -38, 3, 4, 0, 0, TAU); g.fill();
      for (const [x, y, sc] of [[6, -22, 1], [-7, -30, 0.8]]) { g.save(); g.translate(x, y); g.scale(sc, sc); g.beginPath(); g.moveTo(-6, 0); g.quadraticCurveTo(0, -8, 6, 0); g.closePath(); fillStroke(g, '#c9a060', 1.2); g.restore(); }
    });
    // 洗濯物(キャンプ)
    S.line = mk(130, 80, 65, 72, (g) => {
      softShadow(g, 50, 8, 0.3, 4, 4);
      for (const x of [-56, 56]) { rrect(g, x - 3, -62, 6, 64, 2.5, '#8a5a38', 2); }
      g.strokeStyle = OUT; g.lineWidth = 2; g.beginPath(); g.moveTo(-56, -58); g.quadraticCurveTo(0, -50, 56, -58); g.stroke();
      const items = [[-38, '#ff7a3d', 'shirt'], [-12, '#5cb8ff', 'shirt'], [12, '#fff', 'towel'], [36, '#ffd24d', 'shirt']];
      for (const [x, c, t] of items) {
        const y = -55 + Math.abs(x) * -0.08;
        if (t === 'shirt') { g.beginPath(); g.moveTo(x - 9, y); g.lineTo(x - 13, y + 8); g.lineTo(x - 8, y + 10); g.lineTo(x - 8, y + 26); g.lineTo(x + 8, y + 26); g.lineTo(x + 8, y + 10); g.lineTo(x + 13, y + 8); g.lineTo(x + 9, y); g.closePath(); fillStroke(g, c, 1.8); }
        else { rrect(g, x - 8, y, 16, 26, 2, c, 1.8); g.fillStyle = '#9be0ff'; g.fillRect(x - 8, y + 6, 16, 3); g.fillRect(x - 8, y + 16, 16, 3); }
        g.fillStyle = '#c9a060'; g.fillRect(x - 10, y - 3, 3, 5); g.fillRect(x + 7, y - 3, 3, 5);
      }
    });
    S.bankstone = [0, 1, 2].map((v) => mk(34, 22, 17, 14, (g) => {
      const pts = v === 0 ? [-12, 0, -10, -8, -2, -11, 8, -9, 12, -2, 8, 3, -6, 3] : v === 1 ? [-9, 1, -8, -7, 2, -10, 10, -5, 9, 2, 0, 4] : [-13, 0, -8, -6, 3, -8, 11, -5, 13, 1, 4, 4, -6, 3];
      blob(g, pts, '#c9c3b4', 1.6);
      g.save(); g.beginPath(); blob(g, pts, null, 0); g.clip(); g.fillStyle = 'rgba(255,255,255,0.4)'; g.beginPath(); g.ellipse(-3, -6, 6, 2.6, -0.3, 0, TAU); g.fill(); g.fillStyle = 'rgba(60,60,80,0.25)'; g.fillRect(-20, -1, 40, 10); g.restore();
    }));
    S.bush = [['#5fb860', '#2b7a4a', '#1d5a36', '#ff5a6e'], ['#78c45a', '#3a8a3a', '#245a26', null], ['#4faf86', '#247a62', '#174f42', '#fff0a0']].map(([base, dark, deep, dot]) => mk(90, 64, 45, 48, (g) => {
      softShadow(g, 34, 12, 0.36, 5, 4);
      const cs = [[0, -19, 20], [-18, -10, 15], [18, -10, 15], [-8, -28, 12], [10, -27, 12]];
      paintFoliage(g, cs, { base, light: '#b8e88a', dark, deep }, foliageRnd, 3.6);
      if (dot) for (const [x, y] of [[-10, -16], [6, -24], [16, -8], [-18, -6], [2, -8], [-4, -30]]) { circ(g, x, y, 2.6, dot, 1.2); circ(g, x - 0.8, y - 0.8, 0.9, '#fff', 0); }
    }));
  }

  function buildRocks() {
    const shapes = [
      [-26, 0, -30, -14, -20, -30, -2, -38, 18, -32, 30, -16, 28, 0],
      [-30, 0, -26, -22, -10, -34, 8, -36, 26, -26, 32, -8, 26, 0],
      [-24, 0, -30, -18, -14, -30, 6, -26, 20, -38, 32, -18, 26, 0],
    ];
    S.rock = shapes.map((pts) => [false, true].map((moss) => mk(84, 70, 42, 54, (g) => {
      softShadow(g, 36, 12, 0.4, 6, 5);
      blob(g, pts, '#9aa3bb', 2.2);
      g.save(); g.beginPath(); blob(g, pts, null, 0); g.clip();
      // 面: 上面が明るく、右下は陰
      const gr = g.createLinearGradient(-20, -40, 24, 4);
      gr.addColorStop(0, '#d9dfee'); gr.addColorStop(0.5, '#a9b2c8'); gr.addColorStop(1, '#6d7590');
      g.fillStyle = gr; g.fillRect(-50, -50, 100, 70);
      g.fillStyle = 'rgba(255,255,255,0.35)'; g.beginPath(); g.moveTo(-18, -26); g.lineTo(-4, -36); g.lineTo(14, -32); g.lineTo(2, -22); g.closePath(); g.fill();
      g.fillStyle = 'rgba(40,45,80,0.35)'; g.beginPath(); g.moveTo(2, -22); g.lineTo(14, -32); g.lineTo(28, -14); g.lineTo(24, 2); g.lineTo(0, 2); g.closePath(); g.fill();
      g.strokeStyle = 'rgba(40,45,80,0.4)'; g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(-18, -26); g.lineTo(2, -22); g.lineTo(0, 2); g.stroke();
      g.fillStyle = 'rgba(0,0,0,0.12)'; for (let i = 0; i < 14; i++) { const x = -26 + ((i * 37) % 52); const y = -32 + ((i * 23) % 30); g.beginPath(); g.arc(x, y, 1.2, 0, TAU); g.fill(); }
      if (moss) { g.fillStyle = '#6aa84f'; for (const [x, y, r] of [[-6, -36, 11], [8, -34, 8], [-18, -28, 7], [20, -26, 5]]) { g.beginPath(); g.ellipse(x, y, r, r * 0.6, 0, 0, TAU); g.fill(); } g.fillStyle = '#9ad46c'; g.beginPath(); g.ellipse(-8, -38, 5, 2.6, 0, 0, TAU); g.fill(); }
      g.restore();
      blob(g, pts, null, 2.2);
    })));
    S.stump = mk(60, 50, 30, 38, (g) => {
      softShadow(g, 24, 9, 0.36, 4, 4);
      g.beginPath(); g.moveTo(-15, 0); g.lineTo(-13, -16); g.lineTo(13, -16); g.lineTo(15, 0); g.quadraticCurveTo(0, 6, -15, 0);
      const gr = g.createLinearGradient(-14, 0, 14, 0); gr.addColorStop(0, '#5c3b24'); gr.addColorStop(0.4, '#8a5a38'); gr.addColorStop(1, '#4a2e1c');
      fillStroke(g, gr, 2.2, '#2e1c12');
      ell(g, 0, -17, 14, 6, '#e3c195', 2.2, 0);
      g.strokeStyle = '#b8905f'; g.lineWidth = 1.2;
      for (const r of [10, 7, 4]) { g.beginPath(); g.ellipse(0, -17, r, r * 0.42, 0, 0, TAU); g.stroke(); }
      g.strokeStyle = 'rgba(80,50,20,0.5)'; g.beginPath(); g.moveTo(-8, -17); g.lineTo(-11, -14); g.stroke();
    });
    S.log = [0, 1].map((v) => mk(90, 46, 45, 28, (g) => {
      softShadow(g, 36, 9, 0.36, 2, 4);
      const gr = g.createLinearGradient(0, -17, 0, 3); gr.addColorStop(0, v ? '#a9794f' : '#b8865a'); gr.addColorStop(0.6, v ? '#7a4d33' : '#8a5a38'); gr.addColorStop(1, '#4a2e1c');
      rrect(g, -30, -17, 60, 20, 9, gr, 2.2);
      g.strokeStyle = 'rgba(60,35,20,0.45)'; g.lineWidth = 1.2; g.lineCap = 'round';
      for (const [x0, x1, y] of [[-24, -8, -11], [-2, 18, -9], [-18, 2, -4], [8, 24, -2]]) { g.beginPath(); g.moveTo(x0, y); g.quadraticCurveTo((x0 + x1) / 2, y - 1.5, x1, y); g.stroke(); }
      ell(g, -30, -7, 5.5, 9.5, '#e8c89c', 2, 0);
      g.strokeStyle = '#b8905f'; g.lineWidth = 1.1; for (const r of [6, 3.5]) { g.beginPath(); g.ellipse(-30, -7, r * 0.55, r, 0, 0, TAU); g.stroke(); }
      if (v) { g.fillStyle = '#6aa84f'; g.beginPath(); g.ellipse(6, -17, 9, 3.5, 0, 0, TAU); g.fill(); }
    }));
  }

  function buildMountains() {
    const outlines = [
      [-105, 0, -94, -30, -66, -62, -50, -96, -26, -128, 0, -180, 22, -142, 36, -118, 60, -86, 82, -60, 96, -28, 105, 0],
      [-105, 0, -86, -34, -70, -70, -48, -92, -34, -150, -12, -122, 6, -100, 24, -170, 40, -120, 66, -88, 92, -40, 105, 0],
      [-105, 0, -90, -26, -72, -58, -54, -110, -38, -160, -20, -108, 0, -80, 20, -112, 40, -176, 56, -112, 80, -64, 96, -26, 105, 0],
    ];
    const peaks = [[0, -180], [24, -170], [40, -176]];
    S.mountain = outlines.map((pts, v) => mk(240, 250, 120, 205, (g) => {
      softShadow(g, 112, 34, 0.3, 6, 6);
      const body = () => { g.beginPath(); g.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]); g.quadraticCurveTo(0, 46, pts[0], pts[1]); g.closePath(); };
      body(); g.fillStyle = '#7d86b4'; g.fill();
      g.save(); body(); g.clip();
      const px = peaks[v][0];
      // 日が当たる面(左)と陰の面(右)
      const gl = g.createLinearGradient(-110, 0, px, -180); gl.addColorStop(0, '#9aa5cf'); gl.addColorStop(1, '#c3cce9');
      g.fillStyle = gl; g.beginPath(); g.moveTo(-120, 60); g.lineTo(-120, -200); g.lineTo(px, -200); g.lineTo(px - 8, -120); g.lineTo(px + 6, -80); g.lineTo(px - 4, -30); g.lineTo(px + 8, 60); g.closePath(); g.fill();
      const gd = g.createLinearGradient(px, -180, 120, 20); gd.addColorStop(0, '#6f78a6'); gd.addColorStop(1, '#4e5680');
      g.fillStyle = gd; g.beginPath(); g.moveTo(px, -200); g.lineTo(130, -200); g.lineTo(130, 60); g.lineTo(px + 8, 60); g.lineTo(px - 4, -30); g.lineTo(px + 6, -80); g.lineTo(px - 8, -120); g.closePath(); g.fill();
      // 尾根の線と岩肌
      g.strokeStyle = 'rgba(40,40,90,0.45)'; g.lineWidth = 2; g.lineCap = 'round';
      for (const [x0, y0, x1, y1] of [[-54, -70, -40, -40], [-20, -90, -26, -50], [30, -80, 44, -44], [60, -50, 52, -20], [-76, -34, -66, -12], [12, -60, 8, -30], [-40, -110, -30, -80], [70, -70, 78, -40]]) { g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); }
      g.strokeStyle = 'rgba(255,255,255,0.25)'; for (const [x0, y0, x1, y1] of [[-56, -72, -44, -44], [-22, -92, -28, -54]]) { g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); }
      // ふもとの緑と霞
      const gm = g.createLinearGradient(0, -40, 0, 40); gm.addColorStop(0, 'rgba(90,140,90,0)'); gm.addColorStop(1, 'rgba(90,150,90,0.55)');
      g.fillStyle = gm; g.fillRect(-130, -40, 260, 90);
      const gh = g.createLinearGradient(0, -60, 0, 30); gh.addColorStop(0, 'rgba(200,215,255,0)'); gh.addColorStop(1, 'rgba(200,215,255,0.35)');
      g.fillStyle = gh; g.fillRect(-130, -60, 260, 100);
      // 雪
      const sx = peaks[v][0]; const sy = peaks[v][1];
      g.fillStyle = '#f8fbff';
      g.beginPath(); g.moveTo(sx - 52, sy + 58); g.lineTo(sx - 36, sy + 48); g.lineTo(sx - 26, sy + 62); g.lineTo(sx - 12, sy + 46); g.lineTo(sx, sy + 64); g.lineTo(sx + 12, sy + 44); g.lineTo(sx + 24, sy + 62); g.lineTo(sx + 38, sy + 48); g.lineTo(sx + 52, sy + 58); g.lineTo(sx + 52, sy - 30); g.lineTo(sx - 52, sy - 30); g.closePath(); g.fill();
      g.fillStyle = '#c4d0ee'; g.beginPath(); g.moveTo(sx + 2, sy - 30); g.lineTo(sx + 52, sy - 30); g.lineTo(sx + 52, sy + 58); g.lineTo(sx + 38, sy + 48); g.lineTo(sx + 24, sy + 62); g.lineTo(sx + 12, sy + 44); g.lineTo(sx, sy + 64); g.closePath(); g.fill();
      g.restore();
      body(); g.lineWidth = 3; g.strokeStyle = '#3a3566'; g.lineJoin = 'round'; g.stroke();
      // ふもとの針葉樹
      for (const [x, y, s] of [[-84, -4, 0.8], [-62, 6, 1], [70, 2, 0.9], [92, -6, 0.7], [-20, 16, 0.9], [34, 18, 1.0], [-100, 10, 0.7], [8, 22, 0.8]]) {
        g.save(); g.translate(x, y); g.scale(s, s);
        g.beginPath(); g.moveTo(0, -30); g.lineTo(11, -4); g.lineTo(-11, -4); g.closePath(); fillStroke(g, '#2f8f5c', 2.2, '#1b5a3c');
        g.beginPath(); g.moveTo(0, -18); g.lineTo(14, 6); g.lineTo(-14, 6); g.closePath(); fillStroke(g, '#3aa06a', 2.2, '#1b5a3c');
        g.fillStyle = 'rgba(255,255,220,0.25)'; g.beginPath(); g.moveTo(0, -18); g.lineTo(-14, 6); g.lineTo(0, 6); g.closePath(); g.fill();
        g.restore();
      }
    }));
  }

  function buildProps() {
    S.tent = [['#ff8a5c', '#ffd2b8', '#c45a30'], ['#5cb8ff', '#c4e6ff', '#2f7ac0']].map(([c1, c2, c3]) => mk(110, 90, 55, 70, (g) => {
      softShadow(g, 50, 16, 0.4, 6, 5);
      poly(g, [-40, 2, 0, -62, 40, 2], c1, 2.6);
      const gr = g.createLinearGradient(0, -62, 40, 2); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(60,20,40,0.35)');
      poly(g, [0, -62, 40, 2, 10, 2], gr, 0);
      g.strokeStyle = c3; g.lineWidth = 1.4; for (let i = 1; i < 4; i++) { g.beginPath(); g.moveTo(-40 + i * 10, 2); g.lineTo(0 - i * 2, -62 + i * 14); g.stroke(); }
      poly(g, [-40, 2, 0, -62, 40, 2], null, 2.6);
      poly(g, [-9, 2, 0, -26, 9, 2], '#3a2440', 2);
      g.fillStyle = c2; g.beginPath(); g.moveTo(-26, -20); g.lineTo(-18, -34); g.lineTo(-6, -22); g.lineTo(-16, -14); g.closePath(); g.fill();
      g.strokeStyle = OUT; g.lineWidth = 2.2; g.beginPath(); g.moveTo(0, -62); g.lineTo(0, -76); g.stroke();
      poly(g, [0, -76, 14, -71, 0, -66], '#ffe14d', 1.8);
    }));
    S.glowWarm = mk(120, 120, 60, 60, (g) => {
      const gr = g.createRadialGradient(0, 0, 2, 0, 0, 58);
      gr.addColorStop(0, 'rgba(255,200,90,0.55)'); gr.addColorStop(1, 'rgba(255,160,60,0)');
      g.fillStyle = gr; g.fillRect(-60, -60, 120, 120);
    });
  }

  function buildDecor() {
    S.tuft = [['#4f9e38', '#8fcf58'], ['#5aab42', '#a8dc6a'], ['#479433', '#7fc44f'], ['#6ab548', '#bde57c']].map(([a, b]) => mk(30, 26, 15, 22, (g) => {
      g.lineCap = 'round'; g.lineWidth = 2.4;
      for (const [x, h, bend] of [[-7, 12, -5], [-3, 17, -1], [1, 19, 2], [5, 14, 5], [-1, 10, 3], [8, 9, 6]]) {
        g.strokeStyle = a; g.beginPath(); g.moveTo(x, 0); g.quadraticCurveTo(x + bend * 0.3, -h * 0.6, x + bend, -h); g.stroke();
      }
      g.strokeStyle = b; g.lineWidth = 1.3;
      for (const [x, h, bend] of [[-3, 17, -1], [1, 19, 2]]) { g.beginPath(); g.moveTo(x + 0.6, -1); g.quadraticCurveTo(x + bend * 0.3, -h * 0.6, x + bend, -h + 1); g.stroke(); }
    }));
    const petals = ['#ffffff', '#ffe76a', '#ffb3d9', '#9fd8ff', '#ffb066'];
    S.flower = petals.map((c) => mk(22, 26, 11, 22, (g) => {
      g.strokeStyle = '#3f8a3a'; g.lineWidth = 1.8; g.lineCap = 'round';
      g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(1.5, -6, 0, -12); g.stroke();
      g.beginPath(); g.moveTo(0, -5); g.quadraticCurveTo(5, -8, 6, -5); g.strokeStyle = '#5cb04a'; g.stroke();
      for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU - Math.PI / 2; circ(g, Math.cos(a) * 3.8, -14 + Math.sin(a) * 3.8, 3.2, c, 1); }
      circ(g, 0, -14, 2.4, '#ffcf3a', 0.8);
    }));
    S.pebble = [0, 1, 2].map((v) => mk(24, 16, 12, 10, (g) => {
      const pts = v === 0 ? [[-4, 0, 4, 3.2], [5, 2, 3, 2.4]] : v === 1 ? [[0, 0, 5, 3.4]] : [[-5, 1, 3, 2.2], [1, -1, 4.2, 3], [6, 2, 2.4, 1.8]];
      for (const [x, y, rx, ry] of pts) { ell(g, x, y, rx, ry, '#b9bfcf', 1.2); g.fillStyle = 'rgba(255,255,255,0.4)'; g.beginPath(); g.ellipse(x - rx * 0.3, y - ry * 0.3, rx * 0.4, ry * 0.3, 0, 0, TAU); g.fill(); }
    }));
    S.reed = [0, 1].map((v) => mk(26, 64, 13, 58, (g) => {
      g.lineCap = 'round';
      const st = v ? [[-5, 38, -3], [0, 50, 1], [5, 42, 4]] : [[-4, 44, -2], [3, 52, 2]];
      for (const [x, h, bend] of st) {
        g.strokeStyle = '#4a9a3e'; g.lineWidth = 2.4; g.beginPath(); g.moveTo(x, 0); g.quadraticCurveTo(x, -h * 0.5, x + bend, -h); g.stroke();
        rrect(g, x + bend - 2.6, -h - 12, 5.2, 14, 2.4, '#7a4a2a', 1.4);
      }
      for (const [x, y] of [[-8, -22], [8, -26]]) { g.strokeStyle = '#6cbf47'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(x * 0.5, y * 0.6, x, y); g.stroke(); }
    }));
    // シダ: 葉が扇のようにひろがる
    S.fern = [0, 1].map((v) => mk(60, 44, 30, 40, (g) => {
      const fronds = v ? [[-1.9, 26], [-1.2, 30], [-0.4, 32], [0.4, 31], [1.2, 29], [1.9, 25]] : [[-1.7, 24], [-0.8, 29], [0.3, 30], [1.3, 27], [2.1, 22]];
      for (const [a, len] of fronds) {
        g.save(); g.rotate(a - Math.PI / 2);
        g.strokeStyle = '#2f7a3a'; g.lineWidth = 1.4; g.lineCap = 'round'; g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(3, len * 0.5, 0, len); g.stroke();
        g.fillStyle = v ? '#4fa54a' : '#5db352';
        for (let i = 2; i < len - 2; i += 3.2) { const w = 4.5 * (1 - i / len) + 1; g.beginPath(); g.ellipse(-w * 0.6, i, w, 1.4, 0.2, 0, TAU); g.fill(); g.beginPath(); g.ellipse(w * 0.6, i, w, 1.4, -0.2, 0, TAU); g.fill(); }
        g.restore();
      }
    }));
    // おちば
    S.leaf = ['#c9a23a', '#d9772e', '#a8552a', '#8fa83a'].map((c) => mk(16, 12, 8, 6, (g) => {
      g.fillStyle = c; g.beginPath(); g.ellipse(0, 0, 6, 3.2, 0.3, 0, TAU); g.fill();
      g.strokeStyle = 'rgba(60,40,10,0.45)'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(-5.5, 1.5); g.lineTo(5.5, -1.5); g.stroke();
    }));
    // 小さなキノコの群れ(飾り)
    S.shroomlet = [0, 1].map((v) => mk(26, 20, 13, 17, (g) => {
      for (const [x, s] of v ? [[-6, 0.8], [2, 1], [8, 0.65]] : [[-4, 1], [5, 0.75]]) {
        g.save(); g.translate(x, 0); g.scale(s, s);
        rrect(g, -2.2, -8, 4.4, 9, 2, '#f1e3c2', 1);
        g.beginPath(); g.moveTo(-6, -7); g.quadraticCurveTo(0, -17, 6, -7); g.closePath(); fillStroke(g, '#b88a52', 1);
        g.restore();
      }
    }));
    // 木もれ日: 地面にうつる光のまだら
    S.dapple = mk(256, 256, 0, 0, (g) => {
      const rnd = mulberry32(77);
      for (let i = 0; i < 22; i++) {
        const x = rnd() * 256; const y = rnd() * 256; const r = 14 + rnd() * 30;
        for (const [ox, oy] of [[0, 0], [256, 0], [-256, 0], [0, 256], [0, -256]]) {
          const gr = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
          gr.addColorStop(0, 'rgba(255,250,190,0.55)'); gr.addColorStop(1, 'rgba(255,250,190,0)');
          g.fillStyle = gr; g.beginPath(); g.ellipse(x + ox, y + oy, r, r * 0.65, 0.4, 0, TAU); g.fill();
        }
      }
    });
  }

  // ---------- 立体感のための塗り ----------
  // 色を混ぜる(結果は使い回す)
  const colCache = new Map();
  const hexToRgb = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  function mix(a, b, t) {
    const k = a + b + (t * 100 | 0);
    let c = colCache.get(k);
    if (c) return c;
    const A = hexToRgb(a); const B = hexToRgb(b);
    c = '#' + [0, 1, 2].map((i) => Math.round(A[i] + (B[i] - A[i]) * t).toString(16).padStart(2, '0')).join('');
    colCache.set(k, c);
    return c;
  }
  const lite = (c, t) => mix(c, '#fff6e2', t);   // 明るい側: あたたかい白へ
  const dark = (c, t) => mix(c, '#2a1a44', t);   // 暗い側: 紫がかった影へ
  const gradCache = new Map();
  // 丸いものの陰影(描く前に中心へ translate)。左上がいちばん明るく、ふちへ向かって暗くなる
  function ball(g, key, r, base, kl, kd) {
    let gr = gradCache.get(key);
    if (gr) return gr;
    gr = g.createRadialGradient(-r * 0.32, -r * 0.38, r * 0.05, 0, 0, r * 1.1);
    gr.addColorStop(0, lite(base, kl === undefined ? 0.5 : kl));
    gr.addColorStop(0.4, base);
    gr.addColorStop(0.78, dark(base, 0.2));
    gr.addColorStop(1, dark(base, kd === undefined ? 0.5 : kd));
    gradCache.set(key, gr);
    return gr;
  }
  // 筒(うで・あし・ゆび): ふちどり + 影側 + 本体 + 上のハイライト。pts は [x0,y0,x1,y1,...]
  function tube(g, pts, w, base) {
    g.lineCap = 'round'; g.lineJoin = 'round';
    const path = (ox, oy) => { g.beginPath(); g.moveTo(pts[0] + ox, pts[1] + oy); for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i] + ox, pts[i + 1] + oy); };
    path(0, 0); g.strokeStyle = OUT; g.lineWidth = w + 3.4; g.stroke();
    path(0, 0); g.strokeStyle = dark(base, 0.32); g.lineWidth = w; g.stroke();
    path(-w * 0.1, -w * 0.15); g.strokeStyle = base; g.lineWidth = w * 0.74; g.stroke();
    path(-w * 0.18, -w * 0.3); g.strokeStyle = lite(base, 0.4); g.lineWidth = w * 0.24; g.stroke();
  }
  // やわらかい白いハイライト(中心 x,y、半径 rx/ry)
  function gloss(g, x, y, rx, ry, a, rot) {
    const key = 'gl' + rx + '_' + (a * 100 | 0);
    let gr = gradCache.get(key);
    if (!gr) { gr = g.createRadialGradient(0, 0, 0, 0, 0, rx); gr.addColorStop(0, `rgba(255,255,255,${a})`); gr.addColorStop(0.5, `rgba(255,255,255,${a * 0.45})`); gr.addColorStop(1, 'rgba(255,255,255,0)'); gradCache.set(key, gr); }
    g.save(); g.translate(x, y); g.rotate(rot || 0); g.scale(1, ry / rx); g.fillStyle = gr; g.beginPath(); g.arc(0, 0, rx, 0, TAU); g.fill(); g.restore();
  }
  // 今のパスの中を、かたまりらしく陰影づける: 左上に光、右下に影(multiply)
  function shadeInside(g, cx, cy, r, hi, lo) {
    g.save(); g.clip();
    const key = 'sh' + r + '_' + (hi * 100 | 0) + '_' + (lo * 100 | 0);
    let grs = gradCache.get(key);
    if (!grs) {
      const a = g.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.1, 0, 0, r * 1.15); a.addColorStop(0, `rgba(255,255,255,${hi})`); a.addColorStop(0.45, 'rgba(255,255,255,0)'); a.addColorStop(1, 'rgba(255,255,255,0)');
      const b = g.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.2, 0, 0, r * 1.15); b.addColorStop(0, 'rgba(60,30,90,0)'); b.addColorStop(0.55, 'rgba(60,30,90,0)'); b.addColorStop(1, `rgba(60,30,90,${lo})`);
      grs = [a, b]; gradCache.set(key, grs);
    }
    g.translate(cx, cy);
    g.fillStyle = grs[0]; g.fillRect(-r * 1.3, -r * 1.3, r * 2.6, r * 2.6);
    g.globalCompositeOperation = 'multiply'; g.fillStyle = grs[1]; g.fillRect(-r * 1.3, -r * 1.3, r * 2.6, r * 2.6);
    g.restore();
  }

  // ---------- キノコ ----------
  function drawMushroomBody(g, kind, v) {
    const poison = kind === 'poison';
    const cols = poison
      ? (v === 0 ? { cap: '#a24be0', lip: '#5e2690', spot: '#ffe94d', stem: '#efe3f7' } : { cap: '#e63a4b', lip: '#8e1a34', spot: '#ffffff', stem: '#fdf2e3' })
      : (v === 0 ? { cap: '#e9a05a', lip: '#a8622a', spot: '#fff0cf', stem: '#fff6e4' } : { cap: '#f4e8d2', lip: '#cfa878', spot: '#e6cfa5', stem: '#fffaf0' });
    softShadow(g, 24, 9, 0.42, 3, 3);
    // 軸: 筒の陰影(左が明るく右が暗い)。かさの下は影になる
    const stem = () => { g.beginPath(); g.moveTo(-8.5, 1); g.quadraticCurveTo(-9.6, -11, -7.5, -17); g.lineTo(7.5, -17); g.quadraticCurveTo(9.6, -11, 8.5, 1); g.quadraticCurveTo(0, 5.5, -8.5, 1); g.closePath(); };
    stem();
    const sg = g.createLinearGradient(-9, 0, 9, 0);
    sg.addColorStop(0, lite(cols.stem, 0.3)); sg.addColorStop(0.3, cols.stem); sg.addColorStop(0.75, dark(cols.stem, 0.16)); sg.addColorStop(1, dark(cols.stem, 0.36));
    fillStroke(g, sg, 2.3);
    g.save(); stem(); g.clip();
    const ao = g.createLinearGradient(0, -17, 0, -4); ao.addColorStop(0, 'rgba(50,20,80,0.4)'); ao.addColorStop(1, 'rgba(50,20,80,0)');
    g.fillStyle = ao; g.fillRect(-12, -18, 24, 16);
    g.fillStyle = 'rgba(255,255,255,0.35)'; g.beginPath(); g.ellipse(-4.5, -8, 1.6, 7, 0, 0, TAU); g.fill();
    g.restore();
    // かさの裏(ひだ)
    ell(g, 0, -16, 22, 6, cols.lip, 2.3);
    g.save(); g.beginPath(); g.ellipse(0, -16, 22, 6, 0, 0, TAU); g.clip();
    g.strokeStyle = 'rgba(255,255,255,0.22)'; g.lineWidth = 1;
    for (let i = -20; i <= 20; i += 4) { g.beginPath(); g.moveTo(i * 0.25, -16); g.lineTo(i, -11); g.stroke(); }
    g.fillStyle = 'rgba(30,10,50,0.35)'; g.beginPath(); g.ellipse(0, -13, 24, 4, 0, 0, TAU); g.fill();
    g.restore();
    // かさ: ドーム。ベタ塗り → 水玉 → 陰影(左上に光・ふちに影・下に反射光)
    const cap = () => { g.beginPath(); g.moveTo(-22, -16); g.quadraticCurveTo(-25, -44, 0, -46.5); g.quadraticCurveTo(25, -44, 22, -16); g.quadraticCurveTo(0, -9.5, -22, -16); g.closePath(); };
    cap(); g.fillStyle = cols.cap; g.fill();
    for (const [x, y, r] of [[-10, -30, 4.4], [6, -38, 3.3], [12.5, -26, 3.9], [-2, -23, 2.7], [-17, -22, 2.2]]) {
      g.save(); g.translate(x, y);
      g.fillStyle = ball(g, 'spot' + cols.spot + r, r, cols.spot, 0.3, 0.25); g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill();
      if (poison) { g.lineWidth = 1.3; g.strokeStyle = dark(cols.cap, 0.4); g.stroke(); }
      g.restore();
    }
    cap(); shadeInside(g, 0, -30, 25, 0.5, 0.55);
    g.save(); cap(); g.clip();
    g.fillStyle = 'rgba(255,255,255,0.16)'; g.beginPath(); g.ellipse(0, -14, 19, 3, 0, 0, TAU); g.fill(); // ふちの反射光
    g.restore();
    gloss(g, -11, -36, 8, 5, 0.75, -0.5);
    cap(); fillStroke(g, null, 2.5);
    // 顔
    if (poison) {
      for (const sx of [-1, 1]) {
        ell(g, sx * 3.8, -8, 2.7, 3.2, '#fff', 1.4);
        circ(g, sx * 3.6, -7.5, 1.5, OUT, 0); circ(g, sx * 3.1, -8.3, 0.55, '#fff', 0);
        g.strokeStyle = OUT; g.lineWidth = 2.1; g.lineCap = 'round';
        g.beginPath(); g.moveTo(sx * 7.6, -13.6); g.lineTo(sx * 1.7, -10.4); g.stroke();
      }
      g.strokeStyle = OUT; g.lineWidth = 1.7; g.lineJoin = 'round';
      g.beginPath(); g.moveTo(-4, -3.6); g.lineTo(-2, -1.4); g.lineTo(0, -3.6); g.lineTo(2, -1.4); g.lineTo(4, -3.6); g.stroke();
    } else {
      for (const sx of [-1, 1]) {
        ell(g, sx * 3.6, -8, 1.7, 2.5, OUT, 0);
        circ(g, sx * 3.2, -9, 0.75, '#fff', 0);
        ell(g, sx * 6.8, -4.4, 2.3, 1.3, 'rgba(255,120,150,0.55)', 0);
      }
      g.strokeStyle = OUT; g.lineWidth = 1.5; g.lineCap = 'round';
      g.beginPath(); g.arc(0, -4.6, 2.6, 0.2, Math.PI - 0.2); g.stroke();
    }
  }
  function buildMushrooms() {
    S.mush = {
      poison: [0, 1].map((v) => mk(62, 64, 31, 52, (g) => drawMushroomBody(g, 'poison', v))),
      good: [0, 1].map((v) => mk(62, 64, 31, 52, (g) => drawMushroomBody(g, 'good', v))),
    };
    const glow = (rgb) => mk(110, 110, 55, 55, (g) => {
      const gr = g.createRadialGradient(0, 0, 3, 0, 0, 52);
      gr.addColorStop(0, `rgba(${rgb},0.6)`); gr.addColorStop(1, `rgba(${rgb},0)`);
      g.fillStyle = gr; g.fillRect(-55, -55, 110, 110);
    });
    S.glowPoison = glow('190,90,255');
    S.glowGood = glow('255,236,130');
    S.glowBoost = glow('255,230,90');
    S.glowGold = glow('255,215,70');
  }

  // ---------- インク ----------
  function buildInk() {
    const rnd = mulberry32(99);
    S.splat = [];
    for (let k = 0; k < 6; k++) {
      S.splat.push(mk(84, 84, 42, 42, (g) => {
        const n = 11;
        const pts = [];
        for (let i = 0; i < n; i++) { const a = (i / n) * TAU; const r = 15 + rnd() * 9 + (i % 2 ? 4 : 0); pts.push(Math.cos(a) * r, Math.sin(a) * r); }
        g.save(); g.translate(1.5, 2.5); blob(g, pts, INK.dark, 0); g.restore();
        blob(g, pts, INK.main, 0);
        for (let i = 0; i < 8; i++) {
          const a = rnd() * TAU; const d = 26 + rnd() * 11; const r = 2 + rnd() * 4;
          g.fillStyle = INK.dark; g.beginPath(); g.arc(Math.cos(a) * d + 1.2, Math.sin(a) * d + 2, r, 0, TAU); g.fill();
          g.fillStyle = INK.main; g.beginPath(); g.arc(Math.cos(a) * d, Math.sin(a) * d, r, 0, TAU); g.fill();
        }
        g.fillStyle = 'rgba(255,255,255,0.45)'; g.beginPath(); g.ellipse(-5, -6, 7, 3.4, -0.5, 0, TAU); g.fill();
      }));
    }
    const grnd = mulberry32(1234);
    S.gsplat = [];
    for (let k = 0; k < 6; k++) {
      S.gsplat.push(mk(84, 84, 42, 42, (g) => {
        const n = 11;
        const pts = [];
        for (let i = 0; i < n; i++) { const a = (i / n) * TAU; const r = 15 + grnd() * 9 + (i % 2 ? 4 : 0); pts.push(Math.cos(a) * r, Math.sin(a) * r); }
        g.save(); g.translate(1.5, 2.5); blob(g, pts, '#d18f00', 0); g.restore();
        blob(g, pts, '#ffd23f', 0);
        for (let i = 0; i < 8; i++) {
          const a = grnd() * TAU; const d = 26 + grnd() * 11; const r = 2 + grnd() * 4;
          g.fillStyle = '#d18f00'; g.beginPath(); g.arc(Math.cos(a) * d + 1.2, Math.sin(a) * d + 2, r, 0, TAU); g.fill();
          g.fillStyle = '#ffd23f'; g.beginPath(); g.arc(Math.cos(a) * d, Math.sin(a) * d, r, 0, TAU); g.fill();
        }
        g.fillStyle = 'rgba(255,255,255,0.55)'; g.beginPath(); g.ellipse(-5, -6, 7, 3.4, -0.5, 0, TAU); g.fill();
      }));
    }
    S.goldball = mk(28, 28, 14, 14, (g) => {
      circ(g, 0, 0, 11, 'rgba(255,220,80,0.35)', 0);
      circ(g, 0, 0, 6.4, '#ffd23f', 1.6); g.beginPath(); g.arc(0, 0, 6.4, 0, TAU); g.strokeStyle = '#fff'; g.lineWidth = 1.4; g.stroke();
      circ(g, -2, -2.2, 2.2, '#fff', 0);
    });
    S.splatSmall = mk(30, 30, 15, 15, (g) => { circ(g, 0.8, 1.4, 6, INK.dark, 0); circ(g, 0, 0, 6, INK.main, 0); circ(g, -2, -2, 1.8, 'rgba(255,255,255,0.6)', 0); });
    S.inkball = mk(28, 28, 14, 14, (g) => {
      circ(g, 0, 0, 10, 'rgba(255,61,154,0.28)', 0);
      g.fillStyle = ball(g, 'inkball', 6.4, INK.main, 0.5, 0.35); g.beginPath(); g.arc(0, 0, 6.4, 0, TAU); g.fill();
      g.lineWidth = 1.6; g.strokeStyle = OUT; g.stroke(); g.beginPath(); g.arc(0, 0, 6.4, 0, TAU); g.strokeStyle = '#fff'; g.lineWidth = 1.4; g.stroke();
      circ(g, -2, -2.2, 2, '#fff', 0);
    });
    // 浄化された跡にさく花
    S.inkFlower = mk(44, 44, 22, 22, (g) => {
      for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; ell(g, Math.cos(a) * 9, Math.sin(a) * 9, 6.4, 4.2, i % 2 ? INK.light : '#ffc2e2', 1.6, a); }
      circ(g, 0, 0, 5, '#ffe14d', 1.8);
    });
  }

  // ---------- 主人公(男の子) ----------
  function drawGun(g, aim, recoil, hurt) {
    g.save(); g.translate(0, -21); g.rotate(aim);
    if (Math.cos(aim) < 0) g.scale(1, -1);
    const k = -recoil * 5.5;
    g.rotate(-recoil * 0.18 * (Math.cos(aim) < 0 ? -1 : 1));
    if (typeof G !== 'undefined' && G.stage === 2) {
      // まち: ピストル(武器で色が変わる)
      const wc2 = (G.weapon && typeof Features !== 'undefined') ? Features.C.weapons[G.weapon].color : null;
      tube(g, [-2 + k, 0, 8 + k, 1.5], 4.4, SKIN);
      const long = G.weapon === 'rifle';
      const bodyCol = wc2 ? wc2 : '#4a4f5c';
      const gg = g.createLinearGradient(0, -4.5, 0, 3.5); gg.addColorStop(0, lite(bodyCol, 0.35)); gg.addColorStop(0.5, bodyCol); gg.addColorStop(1, dark(bodyCol, 0.4));
      rrect(g, 6 + k, -4.5, long ? 34 : 20, 8, 3, gg, 2);
      rrect(g, 8 + k, 2, 7, 9, 2, '#6b4a2a', 1.8);
      g.fillStyle = 'rgba(255,255,255,0.3)'; g.fillRect(8 + k, -3.5, long ? 30 : 16, 2);
      if (G.weapon === 'shotgun') rrect(g, 14 + k, -7.5, 18, 4, 2, '#6b4a2a', 1.6);
      circ(g, 8 + k, 1.5, 3.2, SKIN, 1.6);
      g.restore();
      return;
    }
    tube(g, [-2 + k, 0, 8 + k, 1.5], 4.4, SKIN);                          // うで
    const bg = g.createLinearGradient(0, -4, 0, 4.4); bg.addColorStop(0, '#ffffff'); bg.addColorStop(0.55, '#f1f1fb'); bg.addColorStop(1, '#c9c9dd');
    rrect(g, 6 + k, -4, 19, 8.4, 3, bg, 2);                                 // 本体
    const wc = (typeof G !== 'undefined' && G.weapon && typeof Features !== 'undefined') ? Features.C.weapons[G.weapon].color : null;
    const tc = wc || '#ff5ca8';
    const tg = g.createLinearGradient(0, -10.5, 0, -3.5); tg.addColorStop(0, lite(tc, 0.45)); tg.addColorStop(1, dark(tc, 0.25));
    rrect(g, 9 + k, -10.5, 11, 7, 3, tg, 1.8);                              // インクタンク(武器で色が変わる)
    g.fillStyle = 'rgba(255,255,255,0.75)'; g.fillRect(11 + k, -9, 2, 4);
    rrect(g, 23 + k, -2.8, 9, 5.6, 2.4, wc || INK.main, 1.8);               // ノズル
    g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(24 + k, -2, 7, 1.6);
    circ(g, 8 + k, 1.5, 3.2, SKIN, 1.6);                                    // 手
    g.restore();
  }
  // 日本刀: 柄・つば・反りのある刀身。持ちかたは Melee.pose から
  function drawKatana(g, P, t, ghost) {
    const pz = Melee.pose(P, t);
    const face = P.face >= 0 ? 1 : -1;
    const busy = P.sw.phase === 'wind' || P.sw.phase === 'active';
    // うで: 肩から手へ(両手で持つときは反対の手も)
    const shX = face * 8.5; const shY = -27;
    const ex = (shX + pz.hx) / 2 + face * 2; const ey = (shY + pz.hy) / 2 + 3;
    if (pz.grip) tube(g, [-shX, shY, (-shX + pz.hx) / 2 - face * 2, ey + 1, pz.hx - Math.cos(pz.a) * 3, pz.hy - Math.sin(pz.a) * 3], 4.2, SKIN);
    tube(g, [shX, shY, ex, ey, pz.hx, pz.hy], 4.4, SKIN);
    g.save(); g.translate(pz.hx, pz.hy); g.rotate(pz.a);
    // 柄(つか): 黒い柄巻き、菱形に見える白い部分
    rrect(g, -13.5, -2.3, 15, 4.6, 1.8, '#242038', 1.6);
    g.fillStyle = '#e8dcc0'; for (let i = -11.5; i < 0.5; i += 3.2) { g.beginPath(); g.moveTo(i, -1.9); g.lineTo(i + 1.4, 0); g.lineTo(i, 1.9); g.lineTo(i - 1.4, 0); g.closePath(); g.fill(); }
    rrect(g, -15, -2.6, 3, 5.2, 1, '#c89a3c', 1.2); // 柄頭
    // つば
    ell(g, 1.5, 0, 2.6, 4.6, '#d9a53a', 1.5); circ(g, 1.5, 0, 1.2, '#8a5a1a', 0);
    // 刀身(反り): 峰(上)は鋼色、刃(下)は白。あいだに波の刃文(はもん)
    const L = 46;
    const spineY = (x) => -2.2 - (x / L) * 3.4;           // 峰の線(先にいくほど上へ反る)
    const edgeY = (x) => 2.2 - (x / L) * 1.6;             // 刃の線
    const blade = () => { g.beginPath(); g.moveTo(3.5, spineY(3.5)); g.quadraticCurveTo(L * 0.55, spineY(L * 0.55) - 0.6, L, spineY(L)); g.lineTo(L + 3.5, edgeY(L) - 1.2); g.quadraticCurveTo(L * 0.55, edgeY(L * 0.55) + 0.3, 3.5, edgeY(3.5)); g.closePath(); };
    blade(); g.fillStyle = '#f7fafe'; g.fill();
    // 峰側(鋼色)
    g.save(); blade(); g.clip();
    g.beginPath(); g.moveTo(0, -8); g.lineTo(L + 6, -12); g.lineTo(L + 6, edgeY(L) - 2.6);
    for (let x = L; x >= 0; x -= 4) g.lineTo(x, (spineY(x) + edgeY(x)) / 2 + 0.3 + Math.sin(x * 0.55) * 0.7);
    g.lineTo(0, -8); g.closePath();
    let bg = gradCache.get('blade');
    if (!bg) { bg = g.createLinearGradient(0, -6, 0, 1); bg.addColorStop(0, '#8e9ab2'); bg.addColorStop(0.5, '#b9c3d6'); bg.addColorStop(1, '#dde4f0'); gradCache.set('blade', bg); }
    g.fillStyle = bg; g.fill();
    // 刃文: 白くにじむ波
    g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 1.1; g.lineCap = 'round'; g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.4)'; g.fillRect(0, -1, L + 6, 1.2);
    g.restore();
    blade(); g.lineWidth = 1.5; g.strokeStyle = OUT; g.lineJoin = 'round'; g.stroke();
    // 峰の細い線
    g.strokeStyle = 'rgba(30,30,60,0.35)'; g.lineWidth = 0.7; g.beginPath(); g.moveTo(5, spineY(5) + 1); g.quadraticCurveTo(L * 0.55, spineY(L * 0.55) + 0.4, L - 1, spineY(L - 1) + 1); g.stroke();
    // ふっているときは 刀身が光る
    if (busy && !ghost) { g.strokeStyle = 'rgba(255,255,255,0.95)'; g.lineWidth = 2.6; g.beginPath(); g.moveTo(8, spineY(8) - 0.8); g.lineTo(L - 2, spineY(L - 2) - 0.8); g.stroke(); g.save(); g.globalAlpha = 0.6; gloss(g, L * 0.55, -3, 24, 7, 0.9, -0.08); g.restore(); }
    g.restore();
    circ(g, pz.hx, pz.hy, 3.3, SKIN, 1.6);
    if (pz.grip) circ(g, pz.hx - Math.cos(pz.a) * 3.4, pz.hy - Math.sin(pz.a) * 3.4, 3, SKIN, 1.6);
  }
  function drawBoy(g, P, t, ghost) {
    const aim = P.aim;
    const sword = !!(P.sw && P.sw.out);
    const up = Math.sin(aim) < -0.5 && !sword;
    const side = Math.cos(aim);
    const wt = P.walkT;
    const run = P.moving;
    const sp = Math.hypot(P.vx || 0, P.vy || 0);
    const fast = clamp(sp / 260, 0, 1.4);
    const slashing = sword && P.sw.phase !== 'idle';
    // 走ると上下にはずみ、止まると呼吸でゆっくりゆれる。斬るときは少し沈みこむ
    const bob = run ? -Math.abs(Math.sin(wt)) * (2 + fast * 2) : -Math.sin(t * 2.2) * 0.8;
    const breath = run ? 0 : Math.sin(t * 2.2) * 0.012;
    const hurt = P.hurtT > 0;
    const lean = (P.lean || 0) + (run ? fast * 0.06 * (P.vx > 0 ? 1 : -1) : 0) + (slashing ? Math.cos(P.sw.angle) * 0.12 : 0);
    const crouch = slashing && P.sw.phase === 'active' ? 0.06 : 0;
    if (!ghost) softShadow(g, 19, 8, 0.42, 0, 1);
    g.save();
    g.translate(0, bob + crouch * 20);
    g.rotate(lean);            // 進む向きにからだをかたむける
    g.scale(1 - breath + crouch, 1 + breath - crouch);
    // インクタンク(背負っている)。刀のときは鞘(さや)も
    const tank = () => {
      const tg = g.createLinearGradient(-7, 0, 7, 0); tg.addColorStop(0, 'rgba(255,255,255,0.95)'); tg.addColorStop(0.5, 'rgba(240,240,250,0.9)'); tg.addColorStop(1, 'rgba(190,190,215,0.9)');
      rrect(g, -7, -33, 14, 18, 6, tg, 2);
      rrect(g, -5, -24, 10, 7, 3, 'rgba(255,61,154,0.95)', 0);
      g.fillStyle = 'rgba(255,255,255,0.7)'; g.fillRect(-4, -31, 2, 12);
      rrect(g, -3, -37, 6, 5, 2, '#ffcf3a', 1.6);
    };
    const sheath = () => { g.save(); g.translate(side >= 0 ? -5 : 5, -16); g.rotate(side >= 0 ? -1.05 : 1.05); rrect(g, -3, -2.6, 36, 5.2, 2.2, '#2b2550', 1.8); g.fillStyle = '#c89a3c'; g.fillRect(2, -2.2, 3, 4.4); g.fillRect(26, -2.2, 3, 4.4); g.fillStyle = 'rgba(255,255,255,0.22)'; g.fillRect(4, -2, 22, 1.4); g.restore(); };
    if (!up) { g.save(); g.translate(side >= 0 ? -6 : 6, -2); tank(); g.restore(); if (sword) sheath(); }
    // 足: ももとすねを別に描き、ひざが曲がる
    const swing = run ? Math.sin(wt) : 0;
    const leg = (sx) => {
      const ph = sx * swing;                       // 前に出ている足ほど +
      const hipX = sx * 4.4;
      const hipY = -14;
      const stride = run ? ph * (4 + fast * 3) : (slashing ? sx * Math.cos(P.sw.angle) * 3 : 0);
      const lift = run ? Math.max(0, -ph) * (3 + fast * 3) : 0;   // 後ろに蹴った足が上がる
      const kneeX = hipX + stride * 0.55 + (run ? (lift > 0 ? sx * -1.5 : 0) : 0);
      const kneeY = hipY + 6 - lift * 0.5;
      const footX = hipX + stride;
      const footY = -2 - lift;
      const faceDir = side > 0.3 ? 1 : side < -0.3 ? -1 : 0;
      tube(g, [hipX, hipY, kneeX, kneeY, footX, footY - 1], 4.6, SKIN);
      // くつ
      g.save(); g.translate(footX + faceDir * 1.4, footY); g.rotate(run ? -ph * 0.35 * (faceDir || 1) : 0);
      const shg = g.createLinearGradient(0, -3, 0, 3); shg.addColorStop(0, '#ffffff'); shg.addColorStop(1, '#d8d8e6');
      ell(g, 0, 0, 5.4, 3.3, shg, 1.8);
      g.fillStyle = '#e53d4f'; g.fillRect(-4.4, -1.4, 8.8, 1.7);
      g.fillStyle = 'rgba(0,0,0,0.14)'; g.beginPath(); g.ellipse(0, 1.6, 5, 1.2, 0, 0, TAU); g.fill();
      g.restore();
    };
    // 奥の足から
    leg(side >= 0 ? -1 : 1);
    leg(side >= 0 ? 1 : -1);
    // 短パン
    g.beginPath(); g.moveTo(-8.8, -20); g.lineTo(8.8, -20); g.lineTo(9.4, -10.5); g.lineTo(1, -10.5); g.lineTo(0, -13); g.lineTo(-1, -10.5); g.lineTo(-9.4, -10.5); g.closePath();
    const pg = g.createLinearGradient(-9, -20, 9, -10); pg.addColorStop(0, '#5a82d2'); pg.addColorStop(0.5, '#3f63b0'); pg.addColorStop(1, '#273f7a');
    fillStroke(g, pg, 2);
    g.strokeStyle = 'rgba(20,30,70,0.35)'; g.lineWidth = 1; g.beginPath(); g.moveTo(-6, -17); g.lineTo(-6.6, -12); g.moveTo(6, -17); g.lineTo(6.6, -12); g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(-7, -19, 6, 2);
    // 空いているほうのうで(足と逆にふる)
    const freeSide = side >= 0 ? -1 : 1;
    const armSwing = run ? Math.sin(wt + Math.PI) * (0.55 + fast * 0.35) : Math.sin(t * 2.2) * 0.05;
    const drawFreeArm = () => {
      const sx = freeSide;
      const shX = sx * 8.4; const shY = -27;
      const elX = shX + sx * 2.2 + Math.sin(armSwing) * 4; const elY = shY + 6;
      const haX = elX + sx * 0.5 + Math.sin(armSwing) * 5; const haY = elY + 6.5 - Math.abs(Math.sin(armSwing)) * 3;
      tube(g, [shX, shY, elX, elY, haX, haY], 3.8, SKIN);
      circ(g, haX, haY, 3, SKIN, 1.6);
    };
    if (!up && !sword) drawFreeArm();
    // 武器(後ろ向きなら体の後ろ)
    if (up) drawGun(g, aim, P.recoil, hurt);
    // 胴: Tシャツにやわらかい陰
    const torso = () => { g.beginPath(); g.moveTo(-9, -18); g.quadraticCurveTo(-10.8, -27, -6.8, -30.4); g.lineTo(6.8, -30.4); g.quadraticCurveTo(10.8, -27, 9, -18); g.closePath(); };
    torso();
    const sc = (P.outfit && P.outfit.shirt) || ['#ff9a5c', '#ff7a3d', '#d9552a'];
    const sg = g.createLinearGradient(-9, 0, 9, 0); sg.addColorStop(0, sc[0]); sg.addColorStop(0.5, sc[1]); sg.addColorStop(1, sc[2]);
    fillStroke(g, sg, 2.2);
    g.save(); g.clip();
    g.fillStyle = '#fff3d6'; g.fillRect(-10, -24.6, 20, 3.2);
    g.fillStyle = 'rgba(120,30,20,0.18)'; g.fillRect(3, -31, 7, 14);
    g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(-10, -20.5, 20, 2.6);
    g.fillStyle = 'rgba(255,255,255,0.28)'; g.beginPath(); g.ellipse(-4.5, -27.5, 3, 1.8, -0.3, 0, TAU); g.fill();
    g.restore();
    if (!up) { g.fillStyle = '#ffd24d'; g.beginPath(); g.arc(0, -29.8, 3.2, 0, Math.PI); g.fill(); } // えり
    if (sword) drawKatana(g, P, t, ghost);
    else if (!up) drawGun(g, aim, P.recoil, hurt);
    if (up) { tank(); drawFreeArm(); }
    // 頭: 走ると少し前に、はねる
    g.save();
    const hx = clamp(side * 1.6, -1.6, 1.6) + (run ? Math.sign(P.vx || 0) * fast * 1.2 : 0) + (slashing ? Math.cos(P.sw.angle) * 1.5 : 0);
    const headBob = run ? Math.sin(wt * 2) * 0.6 : 0;
    g.translate(hx, -38.5 + headBob);
    g.rotate(run ? -lean * 0.5 : (slashing ? Math.cos(P.sw.angle) * 0.08 : 0));
    drawBoyHead(g, P, t, up, hurt, run ? Math.sin(wt * 2 + 1) * 1.6 * (0.5 + fast) : Math.sin(t * 2.2) * 0.4, slashing);
    g.restore();
    g.restore();
    // 毒でふらふら: まわる星
    if (P.slowT > 0 && !ghost) {
      for (let i = 0; i < 3; i++) { const a = t * 4 + (i * TAU) / 3; star(g, Math.cos(a) * 12, -58 + bob + Math.sin(a) * 3.2, 3.6, a, '#c8ff5a', 1.2); }
    }
  }
  function drawBoyHead(g, P, t, up, hurt, hb, slashing) {
    hb = hb || 0;
    const aim = P.aim;
    const lx = clamp(Math.cos(aim) * 2.6, -2.6, 2.6);
    const ly = clamp(Math.sin(aim) * 1.5, -1.3, 1.7);
    const R = 15.5; // 大きめの頭(かわいく)
    const HAIR = '#6b3f2a';
    if (up) {
      g.beginPath(); g.arc(0, 0, R, 0, TAU); g.fillStyle = ball(g, 'hairball', R, HAIR, 0.3, 0.45); g.fill(); g.lineWidth = 2.4; g.strokeStyle = OUT; g.stroke();
      g.fillStyle = 'rgba(255,230,200,0.22)'; g.beginPath(); g.ellipse(-5, -7, 8, 4, -0.4, 0, TAU); g.fill();
      g.strokeStyle = OUT; g.lineWidth = 2.4; g.lineCap = 'round';
      g.beginPath(); g.moveTo(0, -R + 1); g.quadraticCurveTo(-5, -24, 3, -25.5); g.stroke();
      g.strokeStyle = HAIR; g.lineWidth = 1.2; g.stroke();
      drawHat(g, P.outfit && P.outfit.hat, 0);
      return;
    }
    // 耳・顔(肌は球の陰影)
    for (const sx of [-1, 1]) { g.save(); g.translate(sx * (R - 1), 2); g.beginPath(); g.arc(0, 0, 3.9, 0, TAU); g.fillStyle = ball(g, 'ear', 3.9, SKIN, 0.3, 0.35); g.fill(); g.lineWidth = 1.8; g.strokeStyle = OUT; g.stroke(); g.restore(); }
    g.beginPath(); g.ellipse(0, 0.5, R, R - 0.5, 0, 0, TAU); g.fillStyle = ball(g, 'face', R, SKIN, 0.32, 0.3); g.fill(); g.lineWidth = 2.4; g.strokeStyle = OUT; g.stroke();
    // ほっぺ(ふんわり)
    for (const sx of [-1, 1]) { g.save(); g.translate(sx * 9 + lx * 0.4, 7); let gr = gradCache.get('cheek'); if (!gr) { gr = g.createRadialGradient(0, 0, 0.5, 0, 0, 4.8); gr.addColorStop(0, 'rgba(255,110,130,0.6)'); gr.addColorStop(1, 'rgba(255,110,130,0)'); gradCache.set('cheek', gr); } g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 4.8, 0, TAU); g.fill(); g.restore(); }
    // 目: 大きく、きらきら。斬るときは きりっと
    const blink = (t % 3.6) < 0.11;
    const poisoned = P.slowT > 0;
    for (const sx of [-1, 1]) {
      const ex = sx * 5.8 + lx * 0.7;
      const ey = 2.6 + ly * 0.5;
      if (hurt) {
        g.strokeStyle = OUT; g.lineWidth = 2.2; g.lineCap = 'round';
        g.beginPath(); g.moveTo(ex - sx * 3.4, ey - 3.4); g.lineTo(ex + sx * 2.6, ey); g.lineTo(ex - sx * 3.4, ey + 3.4); g.stroke();
      } else if (blink) {
        g.strokeStyle = OUT; g.lineWidth = 2.2; g.lineCap = 'round';
        g.beginPath(); g.moveTo(ex - 4, ey + 1.5); g.quadraticCurveTo(ex, ey + 3.5, ex + 4, ey + 1.5); g.stroke();
      } else if (poisoned) {
        ell(g, ex, ey, 4.8, 5.6, '#fff', 1.8);
        g.strokeStyle = OUT; g.lineWidth = 1.5; g.beginPath();
        for (let a = 0; a < 10; a += 0.5) { const rr2 = a * 0.44; const px = ex + Math.cos(a + t * 6) * rr2; const py = ey + Math.sin(a + t * 6) * rr2; a === 0 ? g.moveTo(px, py) : g.lineTo(px, py); }
        g.stroke();
      } else {
        const sq = slashing ? 0.78 : 1;
        ell(g, ex, ey, 4.7, 5.9 * sq, '#fff', 1.9);
        const ix = ex + lx * 0.55; const iy = ey + 0.9 + ly * 0.6;
        const ig = g.createLinearGradient(ix, iy - 4, ix, iy + 4); ig.addColorStop(0, '#5aa06a'); ig.addColorStop(1, '#2f6a44');
        ell(g, ix, iy, 3.5, 4.6 * sq, ig, 0);
        ell(g, ix, iy + 0.6, 2.1, 3.1 * sq, '#1d1a2a', 0);
        circ(g, ix - 1.3, iy - 1.9 * sq, 1.6, '#fff', 0);
        circ(g, ix + 1.3, iy + 2.2 * sq, 0.9, '#fff', 0);
        circ(g, ix + 1.9, iy - 0.6, 0.5, '#fff', 0);
        // まつげ(上まぶた)
        g.strokeStyle = OUT; g.lineWidth = 2.2; g.lineCap = 'round';
        g.beginPath(); g.moveTo(ex - 4.8, ey - 4.6 * sq); g.quadraticCurveTo(ex, ey - 7.2 * sq, ex + 4.8, ey - 4.6 * sq); g.stroke();
        g.lineWidth = 1.6; g.beginPath(); g.moveTo(ex + sx * 4.6, ey - 4.9 * sq); g.lineTo(ex + sx * 6.2, ey - 6.4 * sq); g.stroke();
      }
    }
    // まゆ(やわらかく。斬るときは つり上がる)
    g.strokeStyle = 'rgba(80,50,30,0.85)'; g.lineWidth = 1.7; g.lineCap = 'round';
    for (const sx of [-1, 1]) { const ex = sx * 5.8 + lx * 0.7; const k = slashing ? sx * 1.6 : 0; g.beginPath(); g.moveTo(ex - 3.2, -5.2 + ly * 0.3 - k * 0.3); g.quadraticCurveTo(ex, -6.6 + ly * 0.3, ex + 3.2, -5.4 + ly * 0.3 + k); g.stroke(); }
    // 口(小さく)
    g.strokeStyle = OUT; g.lineWidth = 1.7; g.lineCap = 'round';
    if (hurt) { ell(g, lx * 0.6, 10.5, 2.2, 1.8, '#c0405a', 1.4); }
    else if (slashing) { ell(g, lx * 0.6, 10.8, 3, 2.4, '#c0405a', 1.6); g.fillStyle = '#fff'; g.fillRect(lx * 0.6 - 2.2, 9.2, 4.4, 1.4); }
    else if (P.firing) { ell(g, lx * 0.6, 10.6, 2.4, 2.2, '#c0405a', 1.6); g.fillStyle = '#ff9aa8'; g.beginPath(); g.ellipse(lx * 0.6, 11.6, 1.4, 0.9, 0, 0, TAU); g.fill(); }
    else if (poisoned) { g.beginPath(); g.moveTo(-2.8 + lx * 0.6, 11.4); g.quadraticCurveTo(lx * 0.6, 9.4, 2.8 + lx * 0.6, 11.4); g.stroke(); }
    else { g.beginPath(); g.moveTo(-2.6 + lx * 0.6, 9.6); g.quadraticCurveTo(lx * 0.6, 12.2, 2.6 + lx * 0.6, 9.6); g.stroke(); }
    if (poisoned) { g.fillStyle = 'rgba(120,220,60,0.32)'; g.beginPath(); g.arc(0, 0, R, 0, TAU); g.fill(); }
    // 髪: まるい前髪(ぱっつん風に ふんわり)。上がつやつや
    g.save(); g.translate(0, -hb * 0.3); g.scale(1, 1 + hb * 0.025);
    const hair = () => {
      g.beginPath();
      g.moveTo(-R - 1, 2);
      g.bezierCurveTo(-R - 3, -14, -9, -21, 0, -21);
      g.bezierCurveTo(9, -21, R + 3, -14, R + 1, 2);
      const lobes = [[R - 1, -2], [10, -7], [4, -9], [-3, -9.5], [-9, -7.5], [-R + 1, -2]];
      let px = R + 1; let py = 2;
      for (const [x, y] of lobes) { const mx = (px + x) / 2; const my = (py + y) / 2 + 3.6; g.quadraticCurveTo(mx, my, x, y); px = x; py = y; }
      g.closePath();
    };
    hair();
    let hg = gradCache.get('hair');
    if (!hg) { hg = g.createLinearGradient(-10, -22, 8, 2); hg.addColorStop(0, '#8f5d3e'); hg.addColorStop(0.45, HAIR); hg.addColorStop(1, '#4a2a1c'); gradCache.set('hair', hg); }
    fillStroke(g, hg, 2.2);
    g.save(); hair(); g.clip();
    g.fillStyle = 'rgba(255,225,190,0.3)'; g.beginPath(); g.ellipse(-4, -15, 9, 3.2, -0.3, 0, TAU); g.fill();
    g.fillStyle = 'rgba(255,240,220,0.35)'; g.beginPath(); g.ellipse(-6.5, -16.5, 5, 1.4, -0.3, 0, TAU); g.fill();
    g.fillStyle = 'rgba(40,20,10,0.22)'; g.beginPath(); g.ellipse(0, -2, 18, 5, 0, 0, TAU); g.fill();
    g.restore();
    // サイドの髪(耳の前)
    for (const sx of [-1, 1]) { g.beginPath(); g.moveTo(sx * (R - 1), -1); g.quadraticCurveTo(sx * (R + 3), 4, sx * (R - 2), 9); g.quadraticCurveTo(sx * (R - 4), 4, sx * (R - 1), -1); g.closePath(); fillStroke(g, HAIR, 2); }
    const hat = P.outfit && P.outfit.hat;
    if (!hat || hat === 'none' || hat === 'flower') {
      g.strokeStyle = OUT; g.lineWidth = 2.4; g.lineCap = 'round';
      g.beginPath(); g.moveTo(1, -20.6); g.quadraticCurveTo(-5 - hb, -27, 3 - hb * 1.5, -28.6); g.stroke();
      g.strokeStyle = HAIR; g.lineWidth = 1.1; g.stroke();
    }
    drawHat(g, hat, lx);
    g.restore();
  }
  function drawHat(g, hat, lx) {
    if (!hat || hat === 'none') return;
    g.save(); g.translate(0, -3); g.scale(1.1, 1.1);
    if (hat === 'cap') {
      g.beginPath(); g.moveTo(-13.5, -8); g.bezierCurveTo(-14, -20, -6, -24, 0, -24); g.bezierCurveTo(6, -24, 14, -20, 13.5, -8); g.closePath();
      const cg = g.createLinearGradient(-10, -24, 10, -8); cg.addColorStop(0, '#ff6a7a'); cg.addColorStop(0.5, '#e53d4f'); cg.addColorStop(1, '#a8263a'); fillStroke(g, cg, 2.2);
      g.fillStyle = 'rgba(255,255,255,0.28)'; g.beginPath(); g.ellipse(-5, -17, 5, 3, -0.4, 0, TAU); g.fill();
      rrect(g, lx >= 0 ? 2 : -20, -11, 18, 4.5, 2, '#c0303f', 2);
      circ(g, 0, -24.5, 2.2, '#e53d4f', 1.6);
    } else if (hat === 'straw') {
      ell(g, 0, -9, 21, 6, '#f1d27a', 2.2);
      g.beginPath(); g.moveTo(-11, -9); g.quadraticCurveTo(-12, -24, 0, -25); g.quadraticCurveTo(12, -24, 11, -9); g.closePath();
      const stg = g.createLinearGradient(-10, -25, 10, -9); stg.addColorStop(0, '#fff0b8'); stg.addColorStop(0.5, '#f6dd8e'); stg.addColorStop(1, '#c9ac58'); fillStroke(g, stg, 2.2);
      g.fillStyle = '#e04a6a'; g.fillRect(-11.5, -14, 23, 3.4);
      g.strokeStyle = 'rgba(120,90,20,0.35)'; g.lineWidth = 1; for (const y of [-19, -22]) { g.beginPath(); g.moveTo(-9, y); g.lineTo(9, y); g.stroke(); }
    } else if (hat === 'flower') {
      g.save(); g.translate(9, -16);
      for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU; circ(g, Math.cos(a) * 3.6, Math.sin(a) * 3.6, 3, '#ffb3d9', 1.2); }
      circ(g, 0, 0, 2.4, '#ffe14d', 1); g.restore();
    } else if (hat === 'crown') {
      const cg = g.createLinearGradient(0, -27, 0, -14); cg.addColorStop(0, '#fff0a0'); cg.addColorStop(0.5, '#ffd23f'); cg.addColorStop(1, '#d99600');
      poly(g, [-9, -14, -6, -24, -3, -16, 0, -27, 3, -16, 6, -24, 9, -14], cg, 2);
      circ(g, -6, -23, 1.5, '#ff3d9a', 0); circ(g, 6, -23, 1.5, '#4fc3ff', 0); circ(g, 0, -26, 1.7, '#9dffb0', 0);
    } else if (hat === 'star') {
      g.beginPath(); g.moveTo(-13, -10); g.quadraticCurveTo(-4, -34, 4, -38); g.quadraticCurveTo(12, -26, 13, -10); g.closePath();
      const sg2 = g.createLinearGradient(-10, -36, 10, -10); sg2.addColorStop(0, '#5a7fd0'); sg2.addColorStop(0.5, '#3c5fa8'); sg2.addColorStop(1, '#22376a'); fillStroke(g, sg2, 2.2);
      star(g, 4, -36, 5, 0.3, '#ffe14d', 1.4); star(g, -4, -20, 2.4, 0, '#fff6a8', 0); star(g, 6, -16, 2, 1, '#fff6a8', 0);
      ell(g, 0, -10, 14.5, 4, '#2f4c8c', 2);
    }
    g.restore();
  }

  // ---------- どうぶつ ----------
  function inkCover(g, e, spots) {
    const cover = 1 - clamp(e.hp / e.maxHp, 0, 1);
    const n = Math.floor(cover * spots.length + (e.state === 'flee' ? spots.length : 0));
    for (let i = 0; i < Math.min(n, spots.length); i++) {
      const [x, y, r] = spots[i];
      g.fillStyle = INK.main; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.5)'; g.beginPath(); g.arc(x - r * 0.3, y - r * 0.3, r * 0.3, 0, TAU); g.fill();
    }
  }
  function dizzy(g, e, y) {
    for (let i = 0; i < 3; i++) { const a = e.t * 5 + (i * TAU) / 3; star(g, Math.cos(a) * 15, y + Math.sin(a) * 4, 4, a, '#ffe14d', 1.2); }
  }
  function alertMark(g, y, t) {
    const s = 1 + Math.sin(t * 24) * 0.12;
    g.save(); g.translate(0, y); g.scale(s, s);
    poly(g, [-5, -9, 5, -9, 2.4, 3, -2.4, 3], '#ff3b3b', 2); circ(g, 0, 8, 2.6, '#ff3b3b', 1.8);
    g.restore();
  }
  // 丸い体や頭: 陰影つきで塗って ふちどり。(cx,cy) 中心、rx/ry 半径
  function orb(g, key, cx, cy, rx, ry, base, lw, kl, kd) {
    g.save(); g.translate(cx, cy); g.scale(1, ry / rx);
    g.beginPath(); g.arc(0, 0, rx, 0, TAU);
    g.fillStyle = ball(g, key, rx, base, kl, kd); g.fill();
    if (lw) { g.lineWidth = lw * (rx / ry) ** 0.5; g.strokeStyle = OUT; g.stroke(); }
    g.restore();
  }
  // 毛なみの線(影側に)
  function furLines(g, cx, cy, r, col, n, seed) {
    g.strokeStyle = col; g.lineWidth = 1.2; g.lineCap = 'round';
    for (let i = 0; i < n; i++) { const a = -0.6 + i * (2.4 / n) + seed; const x = cx + Math.cos(a) * r * 0.78; const y = cy + Math.sin(a) * r * 0.78; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * 4, y + Math.sin(a) * 5); g.stroke(); }
  }

  function drawBoar(g, e, t) {
    const moving = e.moving;
    const wind = e.state === 'windup' ? clamp(e.st / e.dur, 0, 1) : 0;
    const charging = e.state === 'attack';
    const wk = moving ? Math.sin(e.t * (charging ? 30 : 15)) : 0;
    const breath = moving ? 0 : Math.sin(e.t * 2.5) * 0.015;
    softShadow(g, 36, 12, 0.44, 0, 3);
    g.save();
    if (wind > 0) g.translate(Math.sin(e.t * 70) * 1.3, 0);
    const bob = moving ? -Math.abs(wk) * 2.4 : 0;
    g.rotate(moving ? wk * 0.035 * (charging ? 1.6 : 1) : 0);   // 走ると体が前後にゆれる
    g.scale(1 + breath, 1 - breath);
    const FUR = '#8a5634';
    // 脚: 対角の2本ずつが交互に出る(速足)
    for (const [x, ph] of [[-15, 1], [-7, -1], [9, -1], [17, 1]]) {
      const k = wk * ph;
      const l = moving ? Math.max(0, k) * 5 : 0;
      const kneeX = x + k * 2.5; const kneeY = -6 + bob - l * 0.5;
      const footX = x + k * 4.5; const footY = 0 - l;
      tube(g, [x, -12 + bob, kneeX, kneeY, footX, footY], 5, '#5a3822');
      ell(g, footX, footY + 0.5, 3.6, 2.1, '#2e1c12', 0);
    }
    // しっぽ
    g.strokeStyle = OUT; g.lineWidth = 2.2; g.lineCap = 'round'; g.beginPath(); g.moveTo(-24, -23 + bob); g.quadraticCurveTo(-33, -28, -29, -35); g.quadraticCurveTo(-26, -31, -31, -30); g.stroke();
    // 胴: 丸い陰影 + おなかの明るい毛 + 毛の線
    orb(g, 'boarbody', 0, -21 + bob, 27.5, 19, FUR, 2.4, 0.42, 0.52);
    g.save(); g.beginPath(); g.ellipse(0, -21 + bob, 27.5, 19, 0, 0, TAU); g.clip();
    g.fillStyle = 'rgba(190,140,100,0.55)'; g.beginPath(); g.ellipse(2, -9 + bob, 23, 9, 0, 0, TAU); g.fill();
    furLines(g, 0, -21 + bob, 22, 'rgba(50,25,15,0.35)', 7, 0.9);
    g.restore();
    // たてがみ(背中のとげとげ)
    g.beginPath(); g.moveTo(-22, -34 + bob);
    for (let i = 0; i < 6; i++) { const x = -22 + i * 7.4; g.lineTo(x + 3.7, -47 + bob - (i % 2) * 2); g.lineTo(x + 7.4, -36 + bob); }
    g.closePath();
    const mg = g.createLinearGradient(0, -47, 0, -34); mg.addColorStop(0, '#6a4530'); mg.addColorStop(1, '#3e2418'); fillStroke(g, mg, 2);
    // 頭: 走ると上下にふる
    const hd = wind * 5 + (charging ? 5 : 0) + (moving ? Math.sin(e.t * 15) * 1.5 : Math.sin(e.t * 2.5) * 0.8);
    g.save(); g.translate(25, -22 + bob + hd); g.rotate(moving ? -wk * 0.08 : 0);
    orb(g, 'boarhead', 0, 0, 15.5, 15.5, FUR, 2.4, 0.42, 0.5);
    g.beginPath(); g.moveTo(-6, -12); g.lineTo(-3, -23); g.lineTo(5, -13); g.closePath(); fillStroke(g, '#6d4228', 2);
    g.fillStyle = '#d99a80'; g.beginPath(); g.moveTo(-3.5, -14); g.lineTo(-2.5, -20); g.lineTo(2, -14.5); g.closePath(); g.fill();
    orb(g, 'boarnose', 12, 5, 10.5, 8.5, '#f2a7a0', 2.2, 0.35, 0.3);
    circ(g, 15, 3.4, 1.6, OUT, 0); circ(g, 15, 7.4, 1.6, OUT, 0);
    poly(g, [8, 1, 14, -9, 16, 0], '#fffdf5', 1.8);   // きば
    poly(g, [3, 8, 11, 17, 14, 9], '#fffdf5', 1.8);
    ell(g, 2, -3, 3.8, 4, '#fff', 1.6); circ(g, 3, -2.6, 2, OUT, 0); circ(g, 3.7, -3.5, 0.75, '#fff', 0);
    g.strokeStyle = OUT; g.lineWidth = 2.5; g.lineCap = 'round';
    g.beginPath(); g.moveTo(-3, -9 + (wind > 0 ? 2 : 0)); g.lineTo(8, -4.6); g.stroke();
    g.restore();
    inkCover(g, e, [[-12, -28, 4.4], [4, -34, 3.6], [16, -18, 4], [-20, -16, 3.4], [26, -26, 3.4], [-4, -14, 3]]);
    g.restore();
    if (e.state === 'stun' || e.state === 'flee') dizzy(g, e, -52);
    if (wind > 0) alertMark(g, -60, t);
  }

  function drawBear(g, e, t) {
    const moving = e.moving;
    const wk = moving ? Math.sin(e.t * 9) : 0;
    const bob = moving ? -Math.abs(wk) * 2.6 : Math.sin(e.t * 2) * -0.8;
    const breath = moving ? 0 : Math.sin(e.t * 2) * 0.014;
    const wind = e.state === 'windup' ? clamp(e.st / e.dur, 0, 1) : 0;
    const swing = e.state === 'attack' ? clamp(e.st / 0.25, 0, 1) : 0;
    const dir = e.face >= 0 ? 1 : -1;
    const FUR = '#7a4a2e';
    softShadow(g, 40, 14, 0.46, 0, 3);
    g.save();
    g.rotate(moving ? wk * 0.03 : 0);   // のっしのっしと左右にゆれる
    g.scale(1 + breath, 1 - breath);
    // 足: 歩くと交互に前へ出て、上がる
    for (const sx of [-1, 1]) {
      const k = wk * sx;
      const lift = moving ? Math.max(0, k) * 5 : 0;
      orb(g, 'bearfoot', sx * 13 + k * 5, -5 - lift, 11.5, 7.5, '#6a3f26', 2.2, 0.3, 0.45);
      ell(g, sx * 13 + k * 5, -4 - lift, 6, 4, '#b58057', 0);
      for (const dx of [-3.5, 0, 3.5]) circ(g, sx * 13 + k * 5 + dx, -8.5 - lift, 1.3, '#b58057', 0);
    }
    // 反対側の腕
    const arm = (sx, atk) => {
      const ws = moving ? Math.sin(e.t * 9 + (sx > 0 ? Math.PI : 0)) : 0;
      let hx = sx * 33 + ws * 6; let hy = -22 + bob * 0.6 - Math.abs(ws) * 4;
      if (atk) {
        if (wind > 0) { hx = sx * (30 + 10 * wind); hy = -22 - 56 * wind; }
        else if (swing > 0) { hx = sx * (40 - 74 * swing); hy = -78 + 56 * swing; }
      }
      tube(g, [sx * 21, -42 + bob, hx, hy], 16.5, FUR);
      orb(g, 'bearpaw', hx, hy, 9.8, 9.8, FUR, 2.2, 0.35, 0.45);
      g.strokeStyle = '#fff6e8'; g.lineWidth = 2.2; g.lineCap = 'round'; for (const k of [-3.4, 0, 3.4]) { g.beginPath(); g.moveTo(hx + k, hy + 4); g.lineTo(hx + k * 1.25, hy + 11.5); g.stroke(); }
    };
    arm(-dir, false);
    // 胴: 丸い陰影 + おなか
    orb(g, 'bearbody', 0, -29 + bob, 29, 29, FUR, 2.6, 0.4, 0.52);
    g.save(); g.beginPath(); g.ellipse(0, -29 + bob, 29, 29, 0, 0, TAU); g.clip();
    g.save(); g.translate(0, -22 + bob); g.beginPath(); g.ellipse(0, 0, 17.5, 19.5, 0, 0, TAU); g.fillStyle = ball(g, 'bearbelly', 18, '#b58057', 0.35, 0.25); g.fill(); g.restore();
    furLines(g, 0, -29 + bob, 25, 'rgba(50,25,15,0.3)', 9, 0.6);
    g.restore();
    // 頭: 歩くと左右にゆれる
    g.save(); g.translate(moving ? wk * 2 : 0, -58 + bob + wind * 3); g.rotate(moving ? wk * 0.05 : Math.sin(e.t * 1.3) * 0.03);
    for (const sx of [-1, 1]) { orb(g, 'bearear', sx * 17, -12, 8.2, 8.2, FUR, 2.2, 0.35, 0.45); circ(g, sx * 17, -12, 4, '#d9a07a', 0); }
    orb(g, 'bearhead', 0, 0, 21.5, 21.5, FUR, 2.6, 0.45, 0.5);
    orb(g, 'bearmuzzle', 0, 7, 11.8, 8.8, '#d9ad88', 2, 0.3, 0.25);
    ell(g, 0, 3.4, 4.8, 3.3, OUT, 0); circ(g, -1.5, 2.3, 1.1, '#fff', 0);
    g.strokeStyle = OUT; g.lineWidth = 1.8; g.lineCap = 'round';
    if (wind > 0 || swing > 0) { g.beginPath(); g.moveTo(-5, 10); g.quadraticCurveTo(0, 15, 5, 10); g.stroke(); poly(g, [-3, 11, -1.4, 14, 0, 11], '#fff', 1.2); poly(g, [3, 11, 1.4, 14, 0, 11], '#fff', 1.2); }
    else { g.beginPath(); g.moveTo(0, 6); g.lineTo(0, 9.4); g.moveTo(-5, 11.4); g.quadraticCurveTo(0, 8.6, 5, 11.4); g.stroke(); }
    for (const sx of [-1, 1]) {
      ell(g, sx * 8, -5, 3.4, 3.9, '#fff', 1.6); circ(g, sx * 7.4, -4.6, 2, OUT, 0); circ(g, sx * 7.9, -5.5, 0.75, '#fff', 0);
      g.strokeStyle = OUT; g.lineWidth = 2.6; g.beginPath(); g.moveTo(sx * 13.4, -11.6); g.lineTo(sx * 3.6, -7.6); g.stroke();
    }
    g.restore();
    arm(dir, true);
    inkCover(g, e, [[-14, -34 + bob, 5], [12, -48 + bob, 4.4], [-4, -70 + bob, 4.4], [18, -26 + bob, 4], [-22, -52 + bob, 3.6], [6, -22 + bob, 3.6], [-8, -56 + bob, 3.2]]);
    g.restore();
    if (e.state === 'stun' || e.state === 'flee') dizzy(g, e, -84);
    if (wind > 0) alertMark(g, -92, t);
  }

  function drawGorilla(g, e, t) {
    const moving = e.moving;
    const wk = moving ? Math.sin(e.t * 10) : 0;
    const wind = e.state === 'windup' ? clamp(e.st / e.dur, 0, 1) : 0;
    const beat = wind > 0 && e.atk === 'leap';
    const punch = e.state === 'attack' && e.atk === 'punch' ? clamp(e.st / 0.25, 0, 1) : 0;
    const z = e.z || 0;
    const dir = e.face >= 0 ? 1 : -1;
    const bob = moving ? -Math.abs(wk) * 2.4 : Math.sin(e.t * 2.4) * -0.8;
    const breath = moving ? 0 : Math.sin(e.t * 2.4) * 0.014;
    const FUR = '#454d63';
    softShadow(g, 38 - z * 0.12, 13 - z * 0.04, 0.46 - z * 0.003, 0, 3);
    g.save(); g.translate(0, -z);
    g.rotate(moving ? wk * 0.04 : 0);
    g.scale(1 + breath, 1 - breath);
    // 足
    orb(g, 'gorfoot', -12, -7, 11, 8.4, '#3a4156', 2.2, 0.3, 0.45); orb(g, 'gorfoot', 12, -7, 11, 8.4, '#3a4156', 2.2, 0.3, 0.45);
    // うで: 肩から手へ太い線
    const arm = (sx, i) => {
      // 歩くと左右のこぶしが交互に前へ出る(ナックルウォーク)
      const ws = moving ? Math.sin(e.t * 10 + (sx > 0 ? Math.PI : 0)) : 0;
      let hx = sx * 36 + ws * 9 * (e.face >= 0 ? 1 : -1); let hy = -10 + bob * 0.4 - Math.max(0, ws) * 7;
      if (beat) { hx = sx * 9; hy = -38 + Math.sin(e.t * 34 + i * Math.PI) * 5; }
      else if (e.state === 'attack' && e.atk === 'leap') { hx = sx * 22; hy = -92; }
      else if (punch > 0 && sx === dir) { hx = sx * (14 + 40 * punch); hy = -48 + 8 * punch; }
      const sy = -50 + bob;
      tube(g, [sx * 25, sy, hx, hy], 14.4, FUR);
      orb(g, 'gorfist', hx, hy, 9, 9, '#3a4156', 2.2, 0.35, 0.45);
      g.strokeStyle = 'rgba(20,20,40,0.5)'; g.lineWidth = 1.4; for (const k of [-3, 0, 3]) { g.beginPath(); g.moveTo(hx + k, hy - 2); g.lineTo(hx + k, hy + 3); g.stroke(); }
    };
    // 胴
    arm(-1, 0);
    const body = () => { g.beginPath(); g.moveTo(-26, -22 + bob); g.quadraticCurveTo(-34, -52 + bob, -18, -66 + bob); g.lineTo(18, -66 + bob); g.quadraticCurveTo(34, -52 + bob, 26, -22 + bob); g.quadraticCurveTo(0, -12 + bob, -26, -22 + bob); g.closePath(); };
    body(); g.fillStyle = FUR; g.fill();
    body(); shadeInside(g, 0, -44 + bob, 32, 0.4, 0.6);
    g.save(); body(); g.clip();
    g.save(); g.translate(0, -40 + bob); g.beginPath(); g.ellipse(0, 0, 16.5, 17.5, 0, 0, TAU); g.fillStyle = ball(g, 'gorchest', 17, '#6e7896', 0.3, 0.3); g.fill(); g.restore();
    g.strokeStyle = 'rgba(20,20,40,0.35)'; g.lineWidth = 1.2; g.lineCap = 'round';
    for (let i = 0; i < 8; i++) { const x = -22 + i * 6; g.beginPath(); g.moveTo(x, -60 + bob); g.quadraticCurveTo(x - 1, -50 + bob, x - 2, -40 + bob); g.stroke(); }
    g.restore();
    body(); fillStroke(g, null, 2.6);
    g.strokeStyle = 'rgba(53,40,63,0.5)'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(0, -52 + bob); g.lineTo(0, -28 + bob); g.stroke();
    arm(1, 1);
    // 頭
    g.save(); g.translate(0, -70 + bob + wind * 2);
    orb(g, 'gorear', -14, 2, 5.2, 5.2, '#3a4156', 2, 0.3, 0.4); orb(g, 'gorear', 14, 2, 5.2, 5.2, '#3a4156', 2, 0.3, 0.4);
    const head = () => { g.beginPath(); g.moveTo(-14, 6); g.quadraticCurveTo(-18, -16, 0, -20); g.quadraticCurveTo(18, -16, 14, 6); g.quadraticCurveTo(0, 14, -14, 6); g.closePath(); };
    head(); g.fillStyle = '#3a4156'; g.fill(); head(); shadeInside(g, 0, -4, 17, 0.45, 0.5); head(); fillStroke(g, null, 2.6);
    orb(g, 'gorface', 0, 3, 11.5, 10, '#b59c88', 2, 0.3, 0.3);
    g.strokeStyle = OUT; g.lineWidth = 3.2; g.lineCap = 'round'; g.beginPath(); g.moveTo(-11, -4); g.quadraticCurveTo(0, -1, 11, -4); g.stroke();
    for (const sx of [-1, 1]) {
      ell(g, sx * 5, -0.6, 2.7, 2.9, '#fff', 1.4); circ(g, sx * 4.6, -0.2, 1.6, OUT, 0); circ(g, sx * 5, -0.9, 0.55, '#fff', 0);
      circ(g, sx * 1.8, 6, 1.1, OUT, 0);
    }
    g.lineWidth = 1.7; g.beginPath();
    if (wind > 0 || z > 0) { g.moveTo(-5, 9); g.quadraticCurveTo(0, 14, 5, 9); g.stroke(); poly(g, [-3, 9.4, -1.6, 12.4, 0, 9.4], '#fff', 1.1); poly(g, [3, 9.4, 1.6, 12.4, 0, 9.4], '#fff', 1.1); }
    else { g.moveTo(-4.4, 10); g.quadraticCurveTo(0, 8, 4.4, 10); g.stroke(); }
    g.restore();
    inkCover(g, e, [[-16, -44 + bob, 5], [14, -56 + bob, 4.4], [-4, -76 + bob, 4.4], [20, -32 + bob, 4], [-24, -58 + bob, 3.6], [6, -30 + bob, 3.6]]);
    g.restore();
    if (e.state === 'stun' || e.state === 'flee') dizzy(g, e, -98 - z);
    if (wind > 0) alertMark(g, -104, t);
  }

  function drawRabbit(g, c, t) {
    const dir = c.face >= 0 ? 1 : -1;
    const air = c.hopU > 0 && c.hopU < 1;
    const lift = air ? Math.sin(Math.PI * c.hopU) * 15 : 0;
    const sx = air ? 0.93 : 1.05;
    const sy = air ? 1.08 : 0.94;
    softShadow(g, 12 - lift * 0.2, 4.5, 0.36, 0, 1);
    g.save(); g.scale(dir, 1); g.translate(0, -lift); g.scale(sx, sy);
    const eared = c.fear ? -0.5 : 0;
    const WH = '#fffaf4';
    orb(g, 'rabtail', -9, -9, 5.4, 5.2, WH, 1.9, 0.2, 0.3);                       // しっぽ
    orb(g, 'rabbody', 0, -9, 10.6, 8.4, WH, 2, 0.2, 0.32);                         // 胴
    ell(g, 5, -2, 3.2, 2.5, WH, 1.6);                                              // 足
    for (const [ex, ey, rot] of [[5.4, -29, -0.18 + eared], [11, -28.4, 0.22 + eared]]) {
      ell(g, ex, ey, 3.3, 8.6, WH, 1.9, rot); ell(g, ex, ey + 0.6, 1.5, 5.6, '#ffb3c6', 0, rot);
    }
    orb(g, 'rabhead', 9, -15.5, 7.4, 7.4, WH, 2, 0.2, 0.3);                        // 頭
    circ(g, 12, -17, 1.8, OUT, 0); circ(g, 12.5, -17.7, 0.65, '#fff', 0);
    circ(g, 15.8, -14.4, 1.2, '#ff8fb0', 1);
    ell(g, 9.4, -12.4, 2.1, 1.3, 'rgba(255,120,150,0.55)', 0);
    g.restore();
  }

  function drawSquirrel(g, c, t) {
    const dir = c.face >= 0 ? 1 : -1;
    const air = c.hopU > 0 && c.hopU < 1;
    const lift = air ? Math.sin(Math.PI * c.hopU) * 12 : 0;
    const sway = Math.sin(c.t * (air ? 12 : 3)) * 0.12;
    softShadow(g, 13 - lift * 0.2, 4.5, 0.36, 0, 1);
    g.save(); g.scale(dir, 1); g.translate(0, -lift);
    const FUR = '#d18642';
    // 大きなしっぽ
    g.save(); g.translate(-7, -9); g.rotate(sway);
    const tail = () => { g.beginPath(); g.moveTo(0, 0); g.bezierCurveTo(-14, -2, -16, -24, -4, -30); g.bezierCurveTo(4, -32, 6, -22, 2, -16); g.bezierCurveTo(5, -9, 4, -3, 0, 0); g.closePath(); };
    tail(); g.fillStyle = '#d9904a'; g.fill();
    tail(); shadeInside(g, -5, -16, 17, 0.4, 0.45);
    g.save(); tail(); g.clip(); g.strokeStyle = 'rgba(255,215,160,0.55)'; g.lineWidth = 3; for (const y of [-6, -13, -20, -27]) { g.beginPath(); g.moveTo(-18, y); g.quadraticCurveTo(-4, y - 3, 8, y); g.stroke(); }
    g.fillStyle = '#fff1d0'; g.beginPath(); g.arc(-3, -31, 7, 0, TAU); g.fill(); g.restore();
    tail(); fillStroke(g, null, 2);
    g.restore();
    orb(g, 'sqbody', 0, -9, 8.8, 8.6, FUR, 2, 0.4, 0.4);
    ell(g, 3, -7, 5, 6, '#f8e2bc', 0);
    orb(g, 'sqhead', 6, -18, 6.8, 6.8, FUR, 2, 0.4, 0.4);
    poly(g, [2.4, -22, 3.4, -29, 6.4, -23], FUR, 1.8); poly(g, [7, -23, 10, -29, 11, -21], FUR, 1.8);
    circ(g, 9, -19, 1.8, OUT, 0); circ(g, 9.5, -19.7, 0.65, '#fff', 0);
    circ(g, 12.2, -16.8, 1.2, OUT, 0);
    ell(g, 6.6, -15, 1.9, 1.1, 'rgba(255,120,150,0.5)', 0);
    orb(g, 'acorn', 6.5, -6.6, 2.7, 3.5, '#8a5a38', 1.5, 0.3, 0.4);  // どんぐり
    ell(g, 6.5, -8.6, 2.9, 1.6, '#5a3822', 1.2);
    g.restore();
  }

  // ---------- 金色キノコ(走って逃げる) ----------
  function drawGold(g, m, t) {
    const run = m.moving;
    const wk = run ? Math.sin(m.runT) : 0;
    const bob = run ? -Math.abs(wk) * 3 : Math.sin(t * 3) * -0.8;
    const lean = run ? 0.18 : 0;
    softShadow(g, 20, 7, 0.4, 2, 2);
    // 足
    for (const sx of [-1, 1]) {
      const ph = sx * wk;
      const lift = run ? Math.max(0, ph) * 5 : 0;
      const fx = sx * 5 + (run ? ph * 4 : 0);
      rrect(g, fx - 2.6, -10 - lift + bob * 0.3, 5.2, 10 + lift * 0.4, 2.4, '#f3dc8a', 1.8);
      ell(g, fx + 1, -1 - lift, 4.6, 2.8, '#ffe9a8', 1.8);
    }
    g.save(); g.translate(0, bob); g.rotate(lean);
    g.scale(1.2, 1.2);
    // 軸
    const stem = () => { g.beginPath(); g.moveTo(-8, 1); g.quadraticCurveTo(-9, -11, -7, -17); g.lineTo(7, -17); g.quadraticCurveTo(9, -11, 8, 1); g.quadraticCurveTo(0, 5, -8, 1); g.closePath(); };
    stem();
    let sg = gradCache.get('goldstem');
    if (!sg) { sg = g.createLinearGradient(-8, 0, 8, 0); sg.addColorStop(0, '#fffbe6'); sg.addColorStop(0.5, '#fff4cc'); sg.addColorStop(1, '#d9c48a'); gradCache.set('goldstem', sg); }
    fillStroke(g, sg, 2.2);
    // うで(走るとふる)
    const arm = run ? wk * 0.9 : 0;
    tube(g, [-8, -12, -14 + Math.cos(arm) * 2, -8 - Math.sin(arm) * 6], 2.8, '#fff4cc');
    tube(g, [8, -12, 14 - Math.cos(arm) * 2, -8 + Math.sin(arm) * 6], 2.8, '#fff4cc');
    ell(g, 0, -16, 21, 5.5, '#c98a00', 2.2);
    // かさ(金)
    const cap = () => { g.beginPath(); g.moveTo(-21, -16); g.quadraticCurveTo(-24, -43, 0, -45); g.quadraticCurveTo(24, -43, 21, -16); g.quadraticCurveTo(0, -10, -21, -16); g.closePath(); };
    cap();
    let gr = gradCache.get('goldcap');
    if (!gr) { gr = g.createLinearGradient(-20, -45, 18, -14); gr.addColorStop(0, '#fff2a8'); gr.addColorStop(0.45, '#ffcf2e'); gr.addColorStop(1, '#d99600'); gradCache.set('goldcap', gr); }
    fillStroke(g, gr, 2.4);
    cap(); shadeInside(g, 0, -29, 24, 0.5, 0.45);
    g.save(); cap(); g.clip();
    // 流れるハイライト
    const hx = ((t * 60) % 90) - 45;
    g.fillStyle = 'rgba(255,255,255,0.55)'; g.beginPath(); g.moveTo(hx - 6, -50); g.lineTo(hx + 4, -50); g.lineTo(hx - 8, -8); g.lineTo(hx - 18, -8); g.closePath(); g.fill();
    g.restore();
    for (const [x, y, r] of [[-10, -29, 4.2], [6, -37, 3.2], [12, -26, 3.8], [-2, -23, 2.6]]) circ(g, x, y, r, '#fff8dc', 1.6);
    // 顔(にやり)
    for (const sx of [-1, 1]) {
      ell(g, sx * 3.6, -8, 2.5, 3, '#fff', 1.4);
      circ(g, sx * 3.4 + (m.face > 0 ? 0.8 : -0.8), -7.6, 1.4, OUT, 0);
      g.strokeStyle = OUT; g.lineWidth = 2; g.lineCap = 'round';
      g.beginPath(); g.moveTo(sx * 7.4, -13.4); g.lineTo(sx * 1.6, -10.2); g.stroke();
    }
    g.strokeStyle = OUT; g.lineWidth = 1.6; g.beginPath(); g.moveTo(-4, -3.2); g.quadraticCurveTo(0, 0.4, 4.4, -4); g.stroke();
    g.restore();
    // まわりのきらきら
    for (let i = 0; i < 3; i++) { const a = t * 3 + (i * TAU) / 3; star(g, Math.cos(a) * 26, -24 + Math.sin(a * 1.3) * 16, 3.5 + Math.sin(t * 9 + i) * 1.2, a, '#fff6a8', 0); }
  }

  // ---------- 武器の箱 ----------
  function drawCrate(g, c, t) {
    const bob = Math.sin(t * 3 + c.t) * 2;
    softShadow(g, 22, 9, 0.42, 0, 2);
    g.save(); g.translate(0, -bob);
    const col = { boomerang: '#ffb347', missile: '#ff6a3d', omni: '#9be0ff', rainbow: '#ff8ad0', rifle: '#8fd8ff', shotgun: '#ffb347', drone: '#9fd3ec' }[c.w] || '#fff';
    g.save(); g.globalAlpha = 0.5 + Math.sin(t * 5) * 0.2; blit(g, S.glowGold, 0, -14, 0.7); g.restore();
    let wg = gradCache.get('crate');
    if (!wg) { wg = g.createLinearGradient(-16, -30, 16, -2); wg.addColorStop(0, '#e2b27a'); wg.addColorStop(0.5, '#c9955c'); wg.addColorStop(1, '#8f6238'); gradCache.set('crate', wg); }
    rrect(g, -16, -30, 32, 28, 4, wg, 2.4);
    g.fillStyle = 'rgba(80,40,10,0.25)'; g.fillRect(-16, -16, 32, 3); g.fillRect(-2, -30, 3, 28);
    g.strokeStyle = '#7a4a2a'; g.lineWidth = 1.6; g.strokeRect(-12, -26, 24, 20);
    rrect(g, -18, -32, 36, 7, 3, col, 2.2);
    g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(-16, -31, 32, 2);
    g.fillStyle = '#fff'; g.font = '800 12px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 3; g.strokeStyle = OUT; g.strokeText('?', 0, -15); g.fillStyle = col; g.fillText('?', 0, -15);
    g.restore();
    for (let i = 0; i < 2; i++) { const a = t * 2.5 + i * Math.PI; star(g, Math.cos(a) * 22, -18 + Math.sin(a * 1.4) * 8, 3, a, '#fff6a8', 0); }
  }

  // ---------- 武器(ブーメラン) ----------
  function drawBoomerang(g, lv, gold) {
    const s = 0.9 + lv * 0.25;
    g.save(); g.scale(s, s);
    g.beginPath(); g.moveTo(-16, 6); g.quadraticCurveTo(-6, -14, 10, -16); g.quadraticCurveTo(16, -16, 14, -10); g.quadraticCurveTo(4, -8, -4, 4); g.quadraticCurveTo(-8, 12, -16, 6); g.closePath();
    fillStroke(g, gold ? '#ffd23f' : '#ffb347', 2.2);
    g.strokeStyle = 'rgba(80,40,10,0.45)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(-10, 4); g.quadraticCurveTo(-2, -8, 8, -11); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(-13, 4); g.quadraticCurveTo(-4, -11, 9, -14); g.stroke();
    g.fillStyle = '#ff3d9a'; for (const [x, y] of [[-8, 2], [2, -8]]) { g.beginPath(); g.arc(x, y, 2.2, 0, TAU); g.fill(); }
    g.restore();
  }

  // ---------- ボス「キノコおやかた」 ----------
  function drawBoss(g, B, t) {
    const sc = 3.1;
    const weak = B.weak > 0;
    const wob = B.wob > 0 ? Math.sin(t * 30) * 0.08 : 0;
    const breath = Math.sin(t * 1.6) * 0.02;
    const intro = B.intro > 0 ? clamp(1 - B.intro / 2.2, 0, 1) : 1;
    const rise = (1 - intro) * 60;
    softShadow(g, 74 * intro, 26 * intro, 0.5, 0, 6);
    g.save(); g.translate(0, rise); g.scale(sc * (1 + breath), sc * (1 - breath) * intro);
    g.rotate(wob);
    // 足
    for (const sx of [-1, 1]) { ell(g, sx * 9, -1, 7, 3.6, '#e9dcc0', 1.6); }
    // 軸(太い)
    const stem = () => { g.beginPath(); g.moveTo(-13, 1); g.quadraticCurveTo(-15, -18, -11, -26); g.lineTo(11, -26); g.quadraticCurveTo(15, -18, 13, 1); g.quadraticCurveTo(0, 6, -13, 1); g.closePath(); };
    stem();
    let sg = gradCache.get('bossstem');
    if (!sg) { sg = g.createLinearGradient(-13, 0, 13, 0); sg.addColorStop(0, '#fff8e8'); sg.addColorStop(0.4, '#f3e9d2'); sg.addColorStop(1, '#b8a888'); gradCache.set('bossstem', sg); }
    fillStroke(g, sg, 1.6);
    g.save(); stem(); g.clip(); const ao = g.createLinearGradient(0, -26, 0, -14); ao.addColorStop(0, 'rgba(50,20,80,0.4)'); ao.addColorStop(1, 'rgba(50,20,80,0)'); g.fillStyle = ao; g.fillRect(-16, -27, 32, 14); g.restore();
    // 顔
    for (const sx of [-1, 1]) {
      ell(g, sx * 5, -14, 3.2, 3.8, '#fff', 1.2); circ(g, sx * 4.6, -13.4, 1.9, OUT, 0); circ(g, sx * 4.2, -14.2, 0.7, '#fff', 0);
      g.strokeStyle = OUT; g.lineWidth = 1.6; g.lineCap = 'round'; g.beginPath(); g.moveTo(sx * 9.5, -20.5); g.lineTo(sx * 2, -17.5); g.stroke();
    }
    g.strokeStyle = OUT; g.lineWidth = 1.3; g.beginPath();
    if (weak) { g.moveTo(-4, -6); g.quadraticCurveTo(0, -1.5, 4, -6); g.stroke(); poly(g, [-2.5, -5.5, -1, -3, 0, -5.5], '#fff', 0.8); poly(g, [2.5, -5.5, 1, -3, 0, -5.5], '#fff', 0.8); }
    else { g.moveTo(-5, -5); g.lineTo(-2, -7); g.lineTo(0, -5); g.lineTo(2, -7); g.lineTo(5, -5); g.stroke(); }
    // ひげ
    g.strokeStyle = '#8a7a60'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(-3, -9.5); g.quadraticCurveTo(-7, -11, -9, -8); g.moveTo(3, -9.5); g.quadraticCurveTo(7, -11, 9, -8); g.stroke();
    // かさ(弱点のときは持ち上がって裏が見える)
    const lift = weak ? 9 + Math.sin(t * 6) * 1.2 : 0;
    g.save(); g.translate(0, -lift);
    ell(g, 0, -25, 30, 7, weak ? '#ff6fb0' : '#5a2d80', 1.8);
    if (weak) { // 弱点: 光る
      g.save(); g.globalAlpha = 0.6 + Math.sin(t * 10) * 0.3; blit(g, S.glowGold, 0, -25, 0.45); g.restore();
      ell(g, 0, -25, 26, 5, '#ffe14d', 1.4); g.fillStyle = '#ff3d9a'; g.beginPath(); g.arc(0, -25, 5, 0, TAU); g.fill();
      g.strokeStyle = '#7a2d60'; g.lineWidth = 0.8; for (let i = -22; i <= 22; i += 5.5) { g.beginPath(); g.moveTo(i, -28); g.lineTo(i * 0.9, -22); g.stroke(); }
    }
    const cap = () => { g.beginPath(); g.moveTo(-30, -25); g.quadraticCurveTo(-34, -66, 0, -68); g.quadraticCurveTo(34, -66, 30, -25); g.quadraticCurveTo(0, -16, -30, -25); g.closePath(); };
    cap(); g.fillStyle = '#8a3fd0'; g.fill();
    for (const [x, y, r] of [[-14, -46, 5.5], [8, -58, 4.5], [18, -38, 5], [-2, -34, 3.5], [-22, -34, 3.2], [6, -44, 3]]) { g.save(); g.translate(x, y); g.fillStyle = ball(g, 'bossspot' + r, r, '#ffe94d', 0.3, 0.3); g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill(); g.lineWidth = 1.2; g.strokeStyle = '#4a1a7a'; g.stroke(); g.restore(); }
    cap(); shadeInside(g, 0, -45, 34, 0.5, 0.6);
    gloss(g, -14, -56, 10, 6, 0.7, -0.5);
    cap(); fillStroke(g, null, 2);
    // 王冠
    const cg = g.createLinearGradient(0, -79, 0, -66); cg.addColorStop(0, '#fff0a0'); cg.addColorStop(0.5, '#ffd23f'); cg.addColorStop(1, '#d99600');
    poly(g, [-9, -66, -6, -76, -3, -68, 0, -79, 3, -68, 6, -76, 9, -66], cg, 1.4);
    circ(g, -6, -75, 1.4, '#ff3d9a', 0); circ(g, 6, -75, 1.4, '#4fc3ff', 0); circ(g, 0, -78, 1.6, '#9dffb0', 0);
    g.restore();
    g.restore();
    // 胞子・いかり
    if (B.flash > 0) { g.save(); g.globalAlpha = B.flash * 4; g.globalCompositeOperation = 'lighter'; circ(g, 0, -130, 80, 'rgba(255,255,255,0.4)', 0); g.restore(); }
  }

  // ---------- 橋 ----------
  function drawBridge(g, b) {
    g.save(); g.translate(b.x, b.y); g.rotate(b.ang);
    const L = b.hl, Wd = b.hw;
    g.fillStyle = 'rgba(20,50,80,0.22)'; g.fillRect(-L + 4, -Wd + 8, L * 2, Wd * 2);
    g.fillStyle = '#b98055'; g.fillRect(-L, -Wd, L * 2, Wd * 2);
    const n = Math.floor((L * 2) / 15);
    for (let i = 0; i < n; i++) {
      const x = -L + (i * L * 2) / n;
      g.fillStyle = i % 2 ? '#c99466' : '#be8a5c'; g.fillRect(x + 0.6, -Wd + 1, (L * 2) / n - 1.2, Wd * 2 - 2);
      g.fillStyle = 'rgba(255,230,190,0.28)'; g.fillRect(x + 0.6, -Wd + 1, (L * 2) / n - 1.2, 3);
    }
    g.strokeStyle = OUT; g.lineWidth = 2.6; g.lineJoin = 'round'; g.strokeRect(-L, -Wd, L * 2, Wd * 2);
    // 手すり
    for (const sy of [-Wd, Wd]) {
      g.strokeStyle = OUT; g.lineWidth = 7; g.lineCap = 'round'; g.beginPath(); g.moveTo(-L, sy); g.lineTo(L, sy); g.stroke();
      g.strokeStyle = '#8a5a38'; g.lineWidth = 3.6; g.beginPath(); g.moveTo(-L, sy); g.lineTo(L, sy); g.stroke();
      for (let i = 0; i <= 6; i++) { const x = -L + (i * L * 2) / 6; circ(g, x, sy, 4.4, '#a8734a', 2); circ(g, x - 1, sy - 1, 1.3, '#d6a678', 0); }
    }
    g.restore();
  }

  // ---------- 初期化とアイコン ----------
  function init(scale) {
    SC = scale;
    S.longShadow = mk(128, 64, 64, 32, (g) => {
      const gr = g.createRadialGradient(0, 0, 2, 0, 0, 60);
      gr.addColorStop(0, 'rgba(20,45,25,0.45)'); gr.addColorStop(0.75, 'rgba(20,45,25,0.22)'); gr.addColorStop(1, 'rgba(20,45,25,0)');
      g.fillStyle = gr; g.beginPath(); g.ellipse(0, 0, 62, 30, 0, 0, TAU); g.fill();
    });
    S.shadowBlob = mk(64, 64, 32, 32, (g) => {
      const gr = g.createRadialGradient(0, 0, 1, 0, 0, 32);
      gr.addColorStop(0, 'rgba(25,50,30,0.5)'); gr.addColorStop(0.7, 'rgba(25,50,30,0.27)'); gr.addColorStop(1, 'rgba(25,50,30,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 32, 0, TAU); g.fill();
    });
    buildTrees(); buildRocks(); buildMountains(); buildProps(); buildDecor(); buildMushrooms(); buildInk();
  }

  // 説明画面のイラスト用
  function drawIcon(canvas, what) {
    const g = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    g.clearRect(0, 0, w, h);
    g.save(); g.translate(w / 2, h * 0.86);
    const sc = (h * 0.8) / 62;
    g.scale(sc, sc);
    const fake = { x: 0, y: 0, face: 1, t: 0.4, st: 0, dur: 1, hp: 1, maxHp: 1, state: 'wander', moving: false, hopU: 0, atk: '' };
    const fakeBoy = (sw) => ({ aim: 0.5, walkT: 0, moving: false, recoil: 0, hurtT: 0, slowT: 0, firing: false, vx: 0, vy: 0, lean: 0, face: 1, sw: Object.assign(Melee.makeState(), sw || {}) });
    if (what === 'poison') blit(g, S.mush.poison[0], 0, 0);
    else if (what === 'good') blit(g, S.mush.good[0], 0, 0);
    else if (what === 'boss') { g.scale(0.36, 0.36); g.translate(0, 0); drawBoss(g, { weak: 1, wob: 0, intro: 0, flash: 0 }, 0.5); }
    else if (what === 'crate') { g.scale(1.3, 1.3); drawCrate(g, { w: 'missile', t: 0 }, 0.4); }
    else if (what === 'thief') { g.scale(1.3, 1.3); Town.drawThief(g, fake, 0.3); }
    else if (what === 'zombie') { g.scale(1.25, 1.25); Town.drawZombie(g, fake, 0.3); }
    else if (what === 'yankee') { g.scale(1.2, 1.2); Town.drawYankee(g, fake, 0.3); }
    else if (what === 'bossy') { g.scale(0.48, 0.48); Town.drawBossYankee(g, { weak: 1, wob: 0, intro: 0, flash: 0, hp: 1, maxHp: 1, state: 'x', face: 1 }, 0.5); }
    else if (what === 'police') { g.scale(1.5, 1.5); Town.drawPolice(g, { face: 1, hopping: false, t: 0 }, 0.4); }
    else if (what === 'gold') { g.scale(0.9, 0.9); drawGold(g, { moving: true, runT: 1.2, face: 1, hitT: 0 }, 0.4); }
    else if (what === 'rabbit') { g.scale(1.5, 1.5); drawRabbit(g, fake, 0); }
    else if (what === 'squirrel') { g.scale(1.5, 1.5); drawSquirrel(g, fake, 0); }
    else if (what === 'bear') { g.scale(0.78, 0.78); drawBear(g, fake, 0); }
    else if (what === 'gorilla') { g.scale(0.78, 0.78); drawGorilla(g, fake, 0); }
    else if (what === 'boar') { g.scale(0.9, 0.9); drawBoar(g, fake, 0); }
    else if (what === 'boy') { g.scale(1.25, 1.25); drawBoy(g, fakeBoy(), 0.5); }
    else if (what === 'katana') { g.scale(1.15, 1.15); g.translate(-6, 0); drawBoy(g, fakeBoy({ out: true, outT: 1, phase: 'active', idx: 0, t: 0.05, angle: 0.2, cur: 0.3 }), 0.5); }
    else if (what === 'dash') {
      g.scale(1.15, 1.15); g.translate(4, 0);
      for (const [dx, a] of [[-26, 0.18], [-15, 0.35]]) { g.save(); g.globalAlpha = a; g.translate(dx, 0); drawBoy(g, fakeBoy(), 0.5, true); g.restore(); }
      drawBoy(g, Object.assign(fakeBoy(), { moving: true, walkT: 1.2, vx: 300, lean: 0.2, aim: 0 }), 0.5);
    }
    g.restore();
  }

  return { OUT, INK, S, init, blit, mk, drawBoy, drawBoar, drawBear, drawGorilla, drawRabbit, drawSquirrel, drawGold, drawCrate, drawBoss, drawBoomerang, drawBridge, drawIcon, star, ell, circ, poly, rrect, shadow, TREE_COL, ball, tube, orb, gloss, shadeInside, lite, dark, mix };
})();
