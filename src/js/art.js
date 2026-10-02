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

  // ---------- 木・岩・山などのスプライト ----------
  const TREE_COL = [
    { base: '#58c96f', light: '#a6ec8e', dark: '#2e9a58' },
    { base: '#3fb89a', light: '#92e6c8', dark: '#238a78' },
    { base: '#a7d85a', light: '#e3f59f', dark: '#6fae3a' },
    { base: '#f2a24a', light: '#ffd98e', dark: '#d06a2c' },
  ];

  function buildTrees() {
    S.trunk = mk(76, 56, 38, 36, (g) => {
      shadow(g, 30, 10, 0.26, 10, 5);
      g.beginPath(); g.moveTo(-10, 5); g.quadraticCurveTo(-8, -10, -6, -28); g.lineTo(6, -28); g.quadraticCurveTo(8, -10, 10, 5); g.quadraticCurveTo(0, 9, -10, 5); g.closePath();
      fillStroke(g, '#a8734a', 2.4, '#3b2a2f');
      g.beginPath(); g.moveTo(2, -28); g.lineTo(6, -28); g.quadraticCurveTo(8, -10, 10, 5); g.quadraticCurveTo(6, 7, 2, 7); g.closePath();
      g.fillStyle = '#8a5a38'; g.fill();
      g.strokeStyle = '#c99467'; g.lineWidth = 2; g.lineCap = 'round';
      g.beginPath(); g.moveTo(-4, -4); g.lineTo(-4.5, -18); g.stroke();
    });
    S.canopy = TREE_COL.map((c) => mk(150, 140, 75, 124, (g) => {
      const cs = [[0, -62, 36], [-28, -48, 27], [28, -48, 27], [-17, -86, 25], [19, -88, 23], [0, -40, 28]];
      g.lineJoin = 'round';
      for (const [x, y, r] of cs) { g.beginPath(); g.arc(x, y, r, 0, TAU); g.lineWidth = 6; g.strokeStyle = FOLIAGE_OUT; g.stroke(); }
      for (const [x, y, r] of cs) { g.beginPath(); g.arc(x, y, r, 0, TAU); g.fillStyle = c.base; g.fill(); }
      g.globalCompositeOperation = 'source-atop';
      const gr = g.createLinearGradient(0, -110, 0, -20);
      gr.addColorStop(0, 'rgba(255,255,170,0.22)'); gr.addColorStop(0.55, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(10,50,60,0.42)');
      g.fillStyle = gr; g.fillRect(-80, -140, 160, 150);
      g.fillStyle = c.light;
      for (const [x, y, r] of [[-22, -80, 11], [-6, -96, 8], [14, -98, 6], [-34, -58, 8]]) { g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); }
      g.fillStyle = c.dark; g.globalAlpha = 0.55;
      for (const [x, y, r] of [[26, -40, 14], [8, -34, 12], [34, -60, 9]]) { g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); }
      g.globalAlpha = 1;
      g.strokeStyle = 'rgba(30,90,60,0.4)'; g.lineWidth = 1.6; g.lineCap = 'round';
      for (const [x, y] of [[-10, -70], [14, -66], [-26, -46], [24, -78], [2, -50], [-4, -92]]) { g.beginPath(); g.arc(x, y, 5, Math.PI * 1.1, Math.PI * 1.9); g.stroke(); }
      g.globalCompositeOperation = 'source-over';
    }));
    S.pine = [['#2fa56b', '#5fd08f', '#1c6b4a'], ['#3b9d86', '#74d0b8', '#206e62']].map(([base, light, out]) => mk(110, 150, 55, 136, (g) => {
      shadow(g, 30, 9, 0.26, 8, 4);
      rrect(g, -5, -16, 10, 20, 3, '#8a5a38', 2.2);
      const tiers = [[-66, -14, 31], [-94, -42, 25], [-122, -70, 19]];
      for (const [top, bot, hw] of tiers) {
        g.beginPath(); g.moveTo(0, top); g.lineTo(hw, bot); g.quadraticCurveTo(hw / 2, bot + 9, 0, bot + 2); g.quadraticCurveTo(-hw / 2, bot + 9, -hw, bot); g.closePath();
        g.fillStyle = base; g.fill();
        g.save(); g.clip(); g.fillStyle = light; g.fillRect(-hw, top, hw * 0.85, bot - top + 12);
        g.fillStyle = 'rgba(10,50,50,0.28)'; g.fillRect(hw * 0.35, top, hw, bot - top + 12); g.restore();
        g.beginPath(); g.moveTo(0, top); g.lineTo(hw, bot); g.quadraticCurveTo(hw / 2, bot + 9, 0, bot + 2); g.quadraticCurveTo(-hw / 2, bot + 9, -hw, bot); g.closePath();
        g.lineWidth = 2.6; g.strokeStyle = out; g.lineJoin = 'round'; g.stroke();
      }
    }));
    S.bush = [['#5ed06c', '#2b8a50', '#ff5a6e'], ['#7ad65a', '#3a9a40', null], ['#4fc08e', '#24886a', '#fff6a0']].map(([base, dark, dot]) => mk(80, 56, 40, 42, (g) => {
      shadow(g, 26, 8, 0.24, 5, 3);
      const cs = [[0, -16, 17], [-15, -8, 13], [15, -8, 13]];
      for (const [x, y, r] of cs) { g.beginPath(); g.arc(x, y, r, 0, TAU); g.lineWidth = 5; g.strokeStyle = FOLIAGE_OUT; g.stroke(); }
      for (const [x, y, r] of cs) { g.beginPath(); g.arc(x, y, r, 0, TAU); g.fillStyle = base; g.fill(); }
      g.globalCompositeOperation = 'source-atop';
      g.fillStyle = dark; g.globalAlpha = 0.5; g.fillRect(-30, -4, 60, 20); g.globalAlpha = 1;
      g.fillStyle = 'rgba(255,255,200,0.35)'; g.beginPath(); g.arc(-6, -24, 7, 0, TAU); g.fill();
      g.globalCompositeOperation = 'source-over';
      if (dot) for (const [x, y] of [[-8, -14], [6, -20], [14, -8], [-16, -6], [2, -6]]) circ(g, x, y, 2.4, dot, 1.2);
    }));
  }

  function buildRocks() {
    const shapes = [
      [-26, 0, -30, -14, -20, -30, -2, -38, 18, -32, 30, -16, 28, 0],
      [-30, 0, -26, -22, -10, -34, 8, -36, 26, -26, 32, -8, 26, 0],
      [-24, 0, -30, -18, -14, -30, 6, -26, 20, -38, 32, -18, 26, 0],
    ];
    S.rock = shapes.map((pts) => [false, true].map((moss) => mk(84, 70, 42, 54, (g) => {
      shadow(g, 32, 9, 0.26, 6, 4);
      blob(g, pts, '#b9c1d8', 2.4);
      g.save(); g.beginPath(); blob(g, pts, null, 0); g.clip();
      g.fillStyle = '#dfe5f4'; g.beginPath(); g.ellipse(-8, -30, 18, 10, -0.5, 0, TAU); g.fill();
      g.fillStyle = 'rgba(80,90,130,0.38)'; g.beginPath(); g.ellipse(22, -6, 20, 24, 0, 0, TAU); g.fill();
      g.fillStyle = 'rgba(60,70,110,0.3)'; g.fillRect(-40, -8, 80, 20);
      if (moss) { g.fillStyle = '#74c46a'; for (const [x, y, r] of [[-4, -36, 12], [10, -34, 9], [-16, -30, 8]]) { g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); } g.fillStyle = '#9be08a'; g.beginPath(); g.arc(-6, -38, 5, 0, TAU); g.fill(); }
      g.restore();
      blob(g, pts, null, 2.4);
      g.strokeStyle = 'rgba(53,40,63,0.55)'; g.lineWidth = 1.6; g.lineCap = 'round';
      g.beginPath(); g.moveTo(8, -26); g.lineTo(4, -16); g.lineTo(9, -8); g.stroke();
    })));
    S.stump = mk(60, 50, 30, 38, (g) => {
      shadow(g, 20, 7, 0.24, 4, 3);
      g.beginPath(); g.moveTo(-14, 0); g.lineTo(-13, -16); g.lineTo(13, -16); g.lineTo(14, 0); g.quadraticCurveTo(0, 6, -14, 0); fillStroke(g, '#a8734a', 2.4);
      g.fillStyle = '#8a5a38'; g.beginPath(); g.moveTo(4, -16); g.lineTo(13, -16); g.lineTo(14, 0); g.quadraticCurveTo(10, 3, 5, 3); g.fill();
      ell(g, 0, -17, 14, 6, '#e8c79a', 2.4);
      g.strokeStyle = '#c99a6a'; g.lineWidth = 1.4;
      g.beginPath(); g.ellipse(0, -17, 8, 3.2, 0, 0, TAU); g.stroke(); g.beginPath(); g.ellipse(0, -17, 3, 1.3, 0, 0, TAU); g.stroke();
    });
    S.log = [0, 1].map((v) => mk(90, 46, 45, 28, (g) => {
      shadow(g, 34, 8, 0.24, 2, 3);
      rrect(g, -30, -17, 60, 20, 9, v ? '#9a6a45' : '#a8734a', 2.4);
      g.fillStyle = 'rgba(60,35,25,0.3)'; g.fillRect(-26, -4, 52, 5);
      g.strokeStyle = '#7a4d33'; g.lineWidth = 1.4;
      g.beginPath(); g.moveTo(-14, -12); g.lineTo(-2, -12); g.moveTo(6, -6); g.lineTo(20, -6); g.stroke();
      ell(g, -30, -7, 5.5, 9.5, '#ecd0a2', 2.2);
      g.strokeStyle = '#c99a6a'; g.lineWidth = 1.2; g.beginPath(); g.ellipse(-30, -7, 2.4, 5, 0, 0, TAU); g.stroke();
    }));
  }

  function buildMountains() {
    // 各山の輪郭(根元中心が原点、上が -y)
    const outlines = [
      [-105, 0, -94, -30, -66, -62, -50, -96, -26, -128, 0, -180, 22, -142, 36, -118, 60, -86, 82, -60, 96, -28, 105, 0],
      [-105, 0, -86, -34, -70, -70, -48, -92, -34, -150, -12, -122, 6, -100, 24, -170, 40, -120, 66, -88, 92, -40, 105, 0],
      [-105, 0, -90, -26, -72, -58, -54, -110, -38, -160, -20, -108, 0, -80, 20, -112, 40, -176, 56, -112, 80, -64, 96, -26, 105, 0],
    ];
    const peaks = [[0, -180], [24, -170], [40, -176]];
    S.mountain = outlines.map((pts, v) => mk(240, 250, 120, 205, (g) => {
      shadow(g, 112, 30, 0.22, 6, 4);
      // 山すそを少し丸くする
      const body = () => { g.beginPath(); g.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]); g.quadraticCurveTo(0, 46, pts[0], pts[1]); g.closePath(); };
      body(); g.fillStyle = '#8d99c6'; g.fill();
      g.save(); body(); g.clip();
      const px = peaks[v][0];
      g.fillStyle = '#aab6de'; g.beginPath(); g.moveTo(-120, 60); g.lineTo(-120, -200); g.lineTo(px, -200); g.lineTo(px - 8, -120); g.lineTo(px + 6, -80); g.lineTo(px - 4, -30); g.lineTo(px + 8, 60); g.closePath(); g.fill();
      g.fillStyle = 'rgba(70,70,130,0.35)'; g.beginPath(); g.ellipse(0, 24, 120, 34, 0, 0, TAU); g.fill();
      // 岩肌の線
      g.strokeStyle = 'rgba(53,52,102,0.4)'; g.lineWidth = 2; g.lineCap = 'round';
      for (const [x0, y0, x1, y1] of [[-54, -70, -40, -40], [-20, -90, -26, -50], [30, -80, 44, -44], [60, -50, 52, -20], [-76, -34, -66, -12], [12, -60, 8, -30]]) { g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); }
      // 雪
      const sx = peaks[v][0];
      const sy = peaks[v][1];
      g.fillStyle = '#f6f9ff';
      g.beginPath(); g.moveTo(sx - 52, sy + 58); g.lineTo(sx - 36, sy + 48); g.lineTo(sx - 26, sy + 62); g.lineTo(sx - 12, sy + 46); g.lineTo(sx, sy + 64); g.lineTo(sx + 12, sy + 44); g.lineTo(sx + 24, sy + 62); g.lineTo(sx + 38, sy + 48); g.lineTo(sx + 52, sy + 58); g.lineTo(sx + 52, sy - 30); g.lineTo(sx - 52, sy - 30); g.closePath(); g.fill();
      g.fillStyle = '#cdd9f3'; g.beginPath(); g.moveTo(sx + 2, sy - 30); g.lineTo(sx + 52, sy - 30); g.lineTo(sx + 52, sy + 58); g.lineTo(sx + 38, sy + 48); g.lineTo(sx + 24, sy + 62); g.lineTo(sx + 12, sy + 44); g.lineTo(sx, sy + 64); g.closePath(); g.fill();
      g.restore();
      body(); g.lineWidth = 3.2; g.strokeStyle = '#3a3566'; g.lineJoin = 'round'; g.stroke();
      // ふもとの針葉樹
      for (const [x, y, s] of [[-84, -4, 0.8], [-62, 6, 1], [70, 2, 0.9], [92, -6, 0.7], [-20, 16, 0.9], [34, 18, 1.0]]) {
        g.save(); g.translate(x, y); g.scale(s, s);
        g.beginPath(); g.moveTo(0, -30); g.lineTo(11, -4); g.lineTo(-11, -4); g.closePath(); fillStroke(g, '#2fa56b', 2.2, '#1c6b4a');
        g.beginPath(); g.moveTo(0, -18); g.lineTo(14, 6); g.lineTo(-14, 6); g.closePath(); fillStroke(g, '#3dbb7c', 2.2, '#1c6b4a');
        g.restore();
      }
    }));
  }

  function buildProps() {
    S.tent = [['#ff8a5c', '#ffd2b8'], ['#5cb8ff', '#c4e6ff']].map(([c1, c2]) => mk(110, 90, 55, 70, (g) => {
      shadow(g, 46, 12, 0.26, 6, 4);
      poly(g, [-40, 2, 0, -62, 40, 2], c1, 2.6);
      poly(g, [0, -62, 40, 2, 10, 2], 'rgba(60,30,60,0.22)', 0);
      poly(g, [-40, 2, 0, -62, 40, 2], null, 2.6);
      poly(g, [-9, 2, 0, -26, 9, 2], '#4a3050', 2);
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
    S.tuft = [['#5fb840', '#9be061'], ['#6cc447', '#b2ec6e'], ['#52ac3c', '#8ad655'], ['#74c94a', '#c3f080']].map(([a, b]) => mk(30, 24, 15, 20, (g) => {
      g.lineCap = 'round'; g.lineWidth = 2.6;
      for (const [x, h, bend] of [[-6, 11, -4], [0, 16, 1], [6, 12, 5], [-2, 9, 3]]) {
        g.strokeStyle = a; g.beginPath(); g.moveTo(x, 0); g.quadraticCurveTo(x + bend * 0.3, -h * 0.6, x + bend, -h); g.stroke();
      }
      g.strokeStyle = b; g.lineWidth = 1.4;
      g.beginPath(); g.moveTo(0, -1); g.quadraticCurveTo(1, -9, 2, -14); g.stroke();
    }));
    const petals = ['#ffffff', '#ffe76a', '#ffb3d9', '#9fd8ff', '#ffb066'];
    S.flower = petals.map((c) => mk(22, 26, 11, 22, (g) => {
      g.strokeStyle = '#3f9a3a'; g.lineWidth = 1.8; g.lineCap = 'round';
      g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(1.5, -6, 0, -12); g.stroke();
      g.beginPath(); g.moveTo(0, -5); g.quadraticCurveTo(5, -8, 6, -5); g.strokeStyle = '#5cc04a'; g.stroke();
      for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU - Math.PI / 2; circ(g, Math.cos(a) * 3.8, -14 + Math.sin(a) * 3.8, 3.2, c, 1.2); }
      circ(g, 0, -14, 2.4, '#ffcf3a', 1);
    }));
    S.pebble = [0, 1, 2].map((v) => mk(24, 16, 12, 10, (g) => {
      const pts = v === 0 ? [[-4, 0, 4, 3.2, 0], [5, 2, 3, 2.4, 0]] : v === 1 ? [[0, 0, 5, 3.4, 0]] : [[-5, 1, 3, 2.2, 0], [1, -1, 4.2, 3, 0], [6, 2, 2.4, 1.8, 0]];
      for (const [x, y, rx, ry] of pts) ell(g, x, y, rx, ry, '#c9cfdf', 1.4);
    }));
    S.reed = [0, 1].map((v) => mk(26, 64, 13, 58, (g) => {
      g.lineCap = 'round';
      const st = v ? [[-5, 38, -3], [0, 50, 1], [5, 42, 4]] : [[-4, 44, -2], [3, 52, 2]];
      for (const [x, h, bend] of st) {
        g.strokeStyle = '#4aa341'; g.lineWidth = 2.4; g.beginPath(); g.moveTo(x, 0); g.quadraticCurveTo(x, -h * 0.5, x + bend, -h); g.stroke();
        rrect(g, x + bend - 2.6, -h - 12, 5.2, 14, 2.4, '#8a5a38', 1.6);
      }
      for (const [x, y, rot] of [[-8, -22, -0.9], [8, -26, 0.9]]) { g.strokeStyle = '#6cc447'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(x * 0.5, y * 0.6, x, y); g.stroke(); }
    }));
  }

  // ---------- キノコ ----------
  function drawMushroomBody(g, kind, v) {
    const poison = kind === 'poison';
    const cols = poison
      ? (v === 0 ? { cap: '#a24be0', hi: '#d99cff', lip: '#6b2a9c', spot: '#ffe94d', stem: '#efe3f7' } : { cap: '#e63a4b', hi: '#ff8f9b', lip: '#9c1f3a', spot: '#ffffff', stem: '#fdf2e3' })
      : (v === 0 ? { cap: '#e9a05a', hi: '#ffd39b', lip: '#b46d32', spot: '#fff0cf', stem: '#fff6e4' } : { cap: '#f4e8d2', hi: '#ffffff', lip: '#d4b48a', spot: '#e6cfa5', stem: '#fffaf0' });
    shadow(g, 17, 5, 0.24, 3, 2);
    // 軸
    g.beginPath(); g.moveTo(-8, 1); g.quadraticCurveTo(-9, -11, -7, -17); g.lineTo(7, -17); g.quadraticCurveTo(9, -11, 8, 1); g.quadraticCurveTo(0, 5, -8, 1); g.closePath();
    fillStroke(g, cols.stem, 2.2);
    g.fillStyle = 'rgba(90,60,110,0.16)'; g.beginPath(); g.moveTo(3, -17); g.lineTo(7, -17); g.quadraticCurveTo(9, -11, 8, 1); g.quadraticCurveTo(5, 3, 3, 3); g.fill();
    // かさの裏
    ell(g, 0, -16, 21, 5.5, cols.lip, 2.2);
    // かさ
    g.beginPath(); g.moveTo(-21, -16); g.quadraticCurveTo(-24, -43, 0, -45); g.quadraticCurveTo(24, -43, 21, -16); g.quadraticCurveTo(0, -10, -21, -16); g.closePath();
    fillStroke(g, cols.cap, 2.4);
    g.save(); g.clip();
    g.fillStyle = 'rgba(40,10,70,0.22)'; g.beginPath(); g.ellipse(12, -14, 22, 12, 0, 0, TAU); g.fill();
    g.restore();
    g.strokeStyle = cols.hi; g.lineWidth = 3.2; g.lineCap = 'round';
    g.beginPath(); g.moveTo(-17, -24); g.quadraticCurveTo(-14, -36, -5, -40); g.stroke();
    // 水玉
    for (const [x, y, r] of [[-10, -29, 4.2], [6, -37, 3.2], [12, -26, 3.8], [-2, -23, 2.6]]) circ(g, x, y, r, cols.spot, poison ? 1.6 : 0);
    // 顔
    if (poison) {
      for (const sx of [-1, 1]) {
        ell(g, sx * 3.6, -8, 2.5, 3, '#fff', 1.4);
        circ(g, sx * 3.4, -7.6, 1.4, OUT, 0);
        g.strokeStyle = OUT; g.lineWidth = 2; g.lineCap = 'round';
        g.beginPath(); g.moveTo(sx * 7.4, -13.4); g.lineTo(sx * 1.6, -10.2); g.stroke();
      }
      g.strokeStyle = OUT; g.lineWidth = 1.6; g.lineJoin = 'round';
      g.beginPath(); g.moveTo(-3.8, -3.6); g.lineTo(-1.9, -1.4); g.lineTo(0, -3.6); g.lineTo(1.9, -1.4); g.lineTo(3.8, -3.6); g.stroke();
    } else {
      for (const sx of [-1, 1]) {
        ell(g, sx * 3.6, -8, 1.7, 2.4, OUT, 0);
        circ(g, sx * 3.2, -9, 0.7, '#fff', 0);
        ell(g, sx * 6.6, -4.6, 2.2, 1.3, 'rgba(255,120,150,0.55)', 0);
      }
      g.strokeStyle = OUT; g.lineWidth = 1.5; g.lineCap = 'round';
      g.beginPath(); g.arc(0, -4.6, 2.6, 0.2, Math.PI - 0.2); g.stroke();
    }
  }
  function buildMushrooms() {
    S.mush = {
      poison: [0, 1].map((v) => mk(56, 60, 28, 50, (g) => drawMushroomBody(g, 'poison', v))),
      good: [0, 1].map((v) => mk(56, 60, 28, 50, (g) => drawMushroomBody(g, 'good', v))),
    };
    const glow = (rgb) => mk(110, 110, 55, 55, (g) => {
      const gr = g.createRadialGradient(0, 0, 3, 0, 0, 52);
      gr.addColorStop(0, `rgba(${rgb},0.6)`); gr.addColorStop(1, `rgba(${rgb},0)`);
      g.fillStyle = gr; g.fillRect(-55, -55, 110, 110);
    });
    S.glowPoison = glow('190,90,255');
    S.glowGood = glow('255,236,130');
    S.glowBoost = glow('255,230,90');
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
    S.splatSmall = mk(30, 30, 15, 15, (g) => { circ(g, 0.8, 1.4, 6, INK.dark, 0); circ(g, 0, 0, 6, INK.main, 0); circ(g, -2, -2, 1.8, 'rgba(255,255,255,0.6)', 0); });
    S.inkball = mk(28, 28, 14, 14, (g) => {
      circ(g, 0, 0, 10, 'rgba(255,61,154,0.28)', 0);
      circ(g, 0, 0, 6.2, INK.main, 1.6); g.beginPath(); g.arc(0, 0, 6.2, 0, TAU); g.strokeStyle = '#fff'; g.lineWidth = 1.4; g.stroke();
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
    const k = -recoil * 3.5;
    rrect(g, -1 + k, -3.2, 10, 6.4, 3, SKIN, 1.8);                  // うで
    rrect(g, 6 + k, -4, 19, 8.4, 3, '#fdfdff', 2);                  // 本体
    rrect(g, 9 + k, -10.5, 11, 7, 3, 'rgba(255,92,168,0.92)', 1.8); // インクタンク
    g.fillStyle = 'rgba(255,255,255,0.7)'; g.fillRect(11 + k, -9, 2, 4);
    rrect(g, 23 + k, -2.8, 9, 5.6, 2.4, INK.main, 1.8);             // ノズル
    circ(g, 8 + k, 1.5, 3, SKIN, 1.6);                              // 手
    g.restore();
  }
  function drawBoy(g, P, t) {
    const aim = P.aim;
    const up = Math.sin(aim) < -0.5;
    const side = Math.cos(aim);
    const wt = P.walkT;
    const bob = P.moving ? -Math.abs(Math.sin(wt)) * 2.4 : -Math.sin(t * 2.6) * 0.7;
    const hurt = P.hurtT > 0;
    shadow(g, 14, 5, 0.26);
    g.save();
    g.translate(0, bob);
    // インクタンク(背負っている)
    const tank = () => {
      rrect(g, -7, -33, 14, 18, 6, 'rgba(255,255,255,0.7)', 2);
      rrect(g, -5, -24, 10, 7, 3, 'rgba(255,61,154,0.95)', 0);
      g.fillStyle = 'rgba(255,255,255,0.6)'; g.fillRect(-4, -31, 2, 12);
      rrect(g, -3, -37, 6, 5, 2, '#ffcf3a', 1.6);
    };
    if (!up) { g.save(); g.translate(side >= 0 ? -5 : 5, -2); tank(); g.restore(); }
    // 足
    const swing = P.moving ? Math.sin(wt) : 0;
    for (const sx of [-1, 1]) {
      const ph = sx * swing;
      const lift = P.moving ? Math.max(0, ph) * 3.2 : 0;
      const fx = sx * 4.6 + (P.moving ? ph * 1.6 : 0);
      rrect(g, fx - 2.6, -13 - bob * 0, 5.2, 11 - lift, 2.2, SKIN, 1.8);
      ell(g, fx + (side > 0.3 ? 1.4 : side < -0.3 ? -1.4 : 0), -2.2 - lift, 4.6, 3, '#fff', 1.8);
      g.fillStyle = '#e53d4f'; g.fillRect(fx - 3.4, -3.4 - lift, 6.8, 1.6);
    }
    // 短パン
    g.beginPath(); g.moveTo(-8.4, -19); g.lineTo(8.4, -19); g.lineTo(9, -10); g.lineTo(1, -10); g.lineTo(0, -12.5); g.lineTo(-1, -10); g.lineTo(-9, -10); g.closePath(); fillStroke(g, '#3c5fa8', 2);
    // 空いているほうの手
    const freeX = side >= 0 ? -9.4 : 9.4;
    const armSwing = P.moving ? Math.sin(wt + Math.PI) * 3 : 0;
    ell(g, freeX, -22 + armSwing * 0.5, 3.4, 6.4, SKIN, 1.8, freeX < 0 ? 0.12 : -0.12);
    // 銃(後ろ向きなら体の後ろ)
    if (up) drawGun(g, aim, P.recoil, hurt);
    // 胴
    g.beginPath(); g.moveTo(-8.6, -17); g.quadraticCurveTo(-10.2, -26, -6.4, -29.4); g.lineTo(6.4, -29.4); g.quadraticCurveTo(10.2, -26, 8.6, -17); g.closePath();
    fillStroke(g, '#ff7a3d', 2.2);
    g.fillStyle = '#fff3d6'; g.fillRect(-9.2, -23.6, 18.4, 3);
    g.fillStyle = 'rgba(120,30,20,0.18)'; g.fillRect(2, -29, 6, 12);
    if (!up) { g.fillStyle = '#ffd24d'; g.beginPath(); g.arc(0, -28.8, 3.2, 0, Math.PI); g.fill(); } // えり
    if (!up) drawGun(g, aim, P.recoil, hurt);
    if (up) { g.save(); g.translate(0, 0); tank(); g.restore(); }
    // 頭
    g.save();
    const hx = clamp(side * 1.6, -1.6, 1.6);
    g.translate(hx, -36.5);
    drawBoyHead(g, P, t, up, hurt);
    g.restore();
    g.restore();
    // 毒でふらふら: まわる星
    if (P.slowT > 0) {
      for (let i = 0; i < 3; i++) { const a = t * 4 + (i * TAU) / 3; star(g, Math.cos(a) * 12, -58 + bob + Math.sin(a) * 3.2, 3.6, a, '#c8ff5a', 1.2); }
    }
  }
  function drawBoyHead(g, P, t, up, hurt) {
    const aim = P.aim;
    const lx = clamp(Math.cos(aim) * 2.4, -2.4, 2.4);
    const ly = clamp(Math.sin(aim) * 1.4, -1.2, 1.6);
    if (up) {
      circ(g, 0, 0, 13.2, '#6b3f2a', 2.4);
      g.fillStyle = '#8a5a3c'; g.beginPath(); g.ellipse(-4, -6, 7, 4.4, -0.4, 0, TAU); g.fill();
      g.fillStyle = '#4e2c1d'; g.beginPath(); g.ellipse(4, 6, 10, 6, 0, 0, TAU); g.fill();
      g.strokeStyle = OUT; g.lineWidth = 2.4; g.lineCap = 'round';
      g.beginPath(); g.moveTo(0, -13); g.quadraticCurveTo(-5, -22, 3, -23); g.stroke();
      g.strokeStyle = '#6b3f2a'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(0, -13); g.quadraticCurveTo(-5, -22, 3, -23); g.stroke();
      return;
    }
    // 耳
    circ(g, -13, 1, 3.6, SKIN, 1.8); circ(g, 13, 1, 3.6, SKIN, 1.8);
    circ(g, 0, 0, 13.2, SKIN, 2.4);
    // ほっぺ
    ell(g, -8.4 + lx * 0.5, 8 + ly * 0.3, 3.2, 2, 'rgba(255,120,130,0.5)', 0);
    ell(g, 8.4 + lx * 0.5, 8 + ly * 0.3, 3.2, 2, 'rgba(255,120,130,0.5)', 0);
    // 目
    const blink = (t % 3.4) < 0.12;
    const poisoned = P.slowT > 0;
    for (const sx of [-1, 1]) {
      const ex = sx * 5.4 + lx * 0.7;
      const ey = 3.8 + ly * 0.5;
      if (hurt) {
        g.strokeStyle = OUT; g.lineWidth = 2; g.lineCap = 'round';
        g.beginPath(); g.moveTo(ex - sx * 3, ey - 3); g.lineTo(ex + sx * 2.4, ey); g.lineTo(ex - sx * 3, ey + 3); g.stroke();
      } else if (blink) {
        g.strokeStyle = OUT; g.lineWidth = 2; g.lineCap = 'round';
        g.beginPath(); g.moveTo(ex - 3.4, ey + 1); g.lineTo(ex + 3.4, ey + 1); g.stroke();
      } else if (poisoned) {
        circ(g, ex, ey, 4.4, '#fff', 1.8);
        g.strokeStyle = OUT; g.lineWidth = 1.4; g.beginPath();
        for (let a = 0; a < 9; a += 0.5) { const rr = a * 0.42; const px = ex + Math.cos(a + t * 6) * rr, py = ey + Math.sin(a + t * 6) * rr; a === 0 ? g.moveTo(px, py) : g.lineTo(px, py); }
        g.stroke();
      } else {
        ell(g, ex, ey, 3.7, 4.7, '#fff', 1.7);
        ell(g, ex + lx * 0.5, ey + 0.6 + ly * 0.6, 2.7, 3.5, '#4a6a3a', 0);
        ell(g, ex + lx * 0.5, ey + 0.8 + ly * 0.6, 1.6, 2.4, '#1d1a2a', 0);
        circ(g, ex + lx * 0.5 - 1, ey - 1, 1.3, '#fff', 0);
        circ(g, ex + lx * 0.5 + 1, ey + 2.6, 0.7, '#fff', 0);
        g.strokeStyle = OUT; g.lineWidth = 2; g.lineCap = 'round';
        g.beginPath(); g.moveTo(ex - 4, ey - 4); g.quadraticCurveTo(ex, ey - 5.8, ex + 4, ey - 4.2); g.stroke();
      }
    }
    // 口
    g.strokeStyle = OUT; g.lineWidth = 1.7; g.lineCap = 'round';
    if (hurt) { ell(g, lx * 0.6, 10, 2, 1.6, '#c0405a', 1.4); }
    else if (P.firing) { ell(g, lx * 0.6, 10, 2.4, 2, '#c0405a', 1.6); }
    else if (poisoned) { g.beginPath(); g.moveTo(-2.6 + lx * 0.6, 10.6); g.quadraticCurveTo(lx * 0.6, 8.8, 2.6 + lx * 0.6, 10.6); g.stroke(); }
    else { g.beginPath(); g.arc(lx * 0.6, 8.6, 2.6, 0.25, Math.PI - 0.25); g.stroke(); }
    if (poisoned) { g.fillStyle = 'rgba(120,220,60,0.32)'; g.beginPath(); g.arc(0, 0, 13, 0, TAU); g.fill(); }
    // 髪
    g.beginPath();
    g.moveTo(-13.6, 3);
    g.bezierCurveTo(-16, -12, -8, -18, 0, -18);
    g.bezierCurveTo(8, -18, 16, -12, 13.6, 3);
    g.lineTo(11.6, -5); g.lineTo(8.8, -1.2); g.lineTo(5.6, -7.4); g.lineTo(2.2, -1.6); g.lineTo(-1.2, -8.6);
    g.lineTo(-4.4, -1.4); g.lineTo(-7.6, -7.6); g.lineTo(-10.6, -1.4); g.lineTo(-12.4, -5); g.closePath();
    fillStroke(g, '#6b3f2a', 2.1);
    g.fillStyle = '#8f5d3e'; g.beginPath(); g.ellipse(-5, -12.4, 6.6, 3, -0.35, 0, TAU); g.fill();
    g.strokeStyle = OUT; g.lineWidth = 2.4; g.lineCap = 'round';
    g.beginPath(); g.moveTo(1, -17.6); g.quadraticCurveTo(-5, -24, 3, -25.6); g.stroke();
    g.strokeStyle = '#6b3f2a'; g.lineWidth = 1.1; g.stroke();
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

  function drawBoar(g, e, t) {
    const moving = e.moving;
    const wind = e.state === 'windup' ? clamp(e.st / e.dur, 0, 1) : 0;
    const charging = e.state === 'attack';
    const wk = moving ? Math.sin(e.t * (charging ? 30 : 15)) : 0;
    shadow(g, 30, 8, 0.26, 0, 3);
    g.save();
    if (wind > 0) g.translate(Math.sin(e.t * 70) * 1.3, 0);
    const bob = moving ? -Math.abs(wk) * 2.4 : 0;
    // 脚
    for (const [x, ph] of [[-15, 1], [-7, -1], [9, -1], [17, 1]]) {
      const l = moving ? Math.max(0, wk * ph) * 4 : 0;
      rrect(g, x - 3.2 + wk * ph * 2, -11 + bob, 6.4, 11 - l, 2.4, '#5a3822', 2);
    }
    // しっぽ
    g.strokeStyle = OUT; g.lineWidth = 2; g.lineCap = 'round'; g.beginPath(); g.moveTo(-24, -23 + bob); g.quadraticCurveTo(-33, -28, -29, -35); g.quadraticCurveTo(-26, -31, -31, -30); g.stroke();
    // 胴
    ell(g, 0, -21 + bob, 27, 18.5, '#8a5634', 2.4);
    g.save(); g.beginPath(); g.ellipse(0, -21 + bob, 27, 18.5, 0, 0, TAU); g.clip();
    g.fillStyle = '#b57d54'; g.beginPath(); g.ellipse(2, -9 + bob, 24, 10, 0, 0, TAU); g.fill();
    g.fillStyle = 'rgba(40,20,20,0.18)'; g.fillRect(-30, -22 + bob, 60, 6);
    g.restore();
    // たてがみ(背中のとげとげ)
    g.beginPath(); g.moveTo(-22, -34 + bob);
    for (let i = 0; i < 6; i++) { const x = -22 + i * 7.4; g.lineTo(x + 3.7, -47 + bob - (i % 2) * 2); g.lineTo(x + 7.4, -36 + bob); }
    g.closePath(); fillStroke(g, '#4e3022', 2);
    // 頭
    const hd = wind * 5 + (charging ? 5 : 0);
    g.save(); g.translate(25, -22 + bob + hd);
    circ(g, 0, 0, 15, '#8a5634', 2.4);
    g.beginPath(); g.moveTo(-6, -12); g.lineTo(-3, -23); g.lineTo(5, -13); g.closePath(); fillStroke(g, '#6d4228', 2);
    ell(g, 12, 5, 10, 8, '#f2a7a0', 2.2);
    circ(g, 15, 3.4, 1.5, OUT, 0); circ(g, 15, 7.4, 1.5, OUT, 0);
    poly(g, [8, 1, 14, -9, 16, 0], '#fffdf5', 1.8);   // きば
    poly(g, [3, 8, 11, 17, 14, 9], '#fffdf5', 1.8);
    ell(g, 2, -3, 3.6, 3.8, '#fff', 1.6); circ(g, 3, -2.6, 1.9, OUT, 0); circ(g, 3.6, -3.4, 0.7, '#fff', 0);
    g.strokeStyle = OUT; g.lineWidth = 2.4; g.lineCap = 'round';
    g.beginPath(); g.moveTo(-3, -9 + (wind > 0 ? 2 : 0)); g.lineTo(8, -4.6); g.stroke();
    g.restore();
    inkCover(g, e, [[-12, -28, 4.4], [4, -34, 3.6], [16, -18, 4], [-20, -16, 3.4], [26, -26, 3.4], [-4, -14, 3]]);
    g.restore();
    if (e.state === 'stun' || e.state === 'flee') dizzy(g, e, -52);
    if (wind > 0) alertMark(g, -60, t);
  }

  function alertMark(g, y, t) {
    const s = 1 + Math.sin(t * 24) * 0.12;
    g.save(); g.translate(0, y); g.scale(s, s);
    poly(g, [-5, -9, 5, -9, 2.4, 3, -2.4, 3], '#ff3b3b', 2); circ(g, 0, 8, 2.6, '#ff3b3b', 1.8);
    g.restore();
  }

  function drawBear(g, e, t) {
    const moving = e.moving;
    const wk = moving ? Math.sin(e.t * 9) : 0;
    const bob = moving ? -Math.abs(wk) * 2.2 : Math.sin(e.t * 2) * -0.8;
    const wind = e.state === 'windup' ? clamp(e.st / e.dur, 0, 1) : 0;
    const swing = e.state === 'attack' ? clamp(e.st / 0.25, 0, 1) : 0;
    const dir = e.face >= 0 ? 1 : -1;
    shadow(g, 34, 10, 0.28, 0, 3);
    g.save();
    // 足
    ell(g, -13 + wk * 3, -5, 11, 7, '#6a3f26', 2.2); ell(g, 13 - wk * 3, -5, 11, 7, '#6a3f26', 2.2);
    ell(g, -13 + wk * 3, -4, 6, 4, '#a8744f', 0); ell(g, 13 - wk * 3, -4, 6, 4, '#a8744f', 0);
    // 反対側の腕
    const arm = (sx, atk) => {
      let hx = sx * 33, hy = -22 + bob * 0.6;
      if (atk) {
        if (wind > 0) { hx = sx * (30 + 10 * wind); hy = -22 - 56 * wind; }
        else if (swing > 0) { hx = sx * (40 - 74 * swing); hy = -78 + 56 * swing; }
      }
      g.strokeStyle = OUT; g.lineWidth = 21; g.lineCap = 'round'; g.beginPath(); g.moveTo(sx * 21, -42 + bob); g.lineTo(hx, hy); g.stroke();
      g.strokeStyle = '#7a4a2e'; g.lineWidth = 16.5; g.beginPath(); g.moveTo(sx * 21, -42 + bob); g.lineTo(hx, hy); g.stroke();
      circ(g, hx, hy, 9.5, '#7a4a2e', 2.2);
      g.strokeStyle = '#fff6e8'; g.lineWidth = 2; for (const k of [-3.4, 0, 3.4]) { g.beginPath(); g.moveTo(hx + k, hy + 4); g.lineTo(hx + k * 1.2, hy + 11); g.stroke(); }
    };
    arm(-dir, false);
    // 胴
    ell(g, 0, -29 + bob, 28, 28, '#7a4a2e', 2.6);
    g.save(); g.beginPath(); g.ellipse(0, -29 + bob, 28, 28, 0, 0, TAU); g.clip();
    g.fillStyle = '#a8744f'; g.beginPath(); g.ellipse(0, -22 + bob, 17, 19, 0, 0, TAU); g.fill();
    g.fillStyle = 'rgba(40,20,20,0.2)'; g.beginPath(); g.ellipse(18, -24 + bob, 14, 30, 0, 0, TAU); g.fill();
    g.restore();
    // 頭
    g.save(); g.translate(0, -58 + bob + wind * 3);
    circ(g, -17, -12, 8, '#7a4a2e', 2.2); circ(g, 17, -12, 8, '#7a4a2e', 2.2); circ(g, -17, -12, 4, '#d9a07a', 0); circ(g, 17, -12, 4, '#d9a07a', 0);
    circ(g, 0, 0, 21, '#7a4a2e', 2.6);
    ell(g, 0, 7, 11.5, 8.6, '#d9ad88', 2);
    ell(g, 0, 3.4, 4.6, 3.2, OUT, 0); circ(g, -1.4, 2.4, 1, '#fff', 0);
    g.strokeStyle = OUT; g.lineWidth = 1.8; g.lineCap = 'round';
    if (wind > 0 || swing > 0) { g.beginPath(); g.moveTo(-5, 10); g.quadraticCurveTo(0, 15, 5, 10); g.stroke(); poly(g, [-3, 11, -1.4, 14, 0, 11], '#fff', 1.2); poly(g, [3, 11, 1.4, 14, 0, 11], '#fff', 1.2); }
    else { g.beginPath(); g.moveTo(0, 6); g.lineTo(0, 9.4); g.moveTo(-5, 11.4); g.quadraticCurveTo(0, 8.6, 5, 11.4); g.stroke(); }
    for (const sx of [-1, 1]) {
      ell(g, sx * 8, -5, 3.3, 3.8, '#fff', 1.6); circ(g, sx * 7.4, -4.6, 1.9, OUT, 0); circ(g, sx * 7.8, -5.4, 0.7, '#fff', 0);
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
    shadow(g, 32 - z * 0.12, 9 - z * 0.04, 0.28 - z * 0.002, 0, 3);
    g.save(); g.translate(0, -z);
    // 足
    ell(g, -12, -7, 10.5, 8, '#3a4156', 2.2); ell(g, 12, -7, 10.5, 8, '#3a4156', 2.2);
    // うで: 肩から手へ太い線
    const arm = (sx, i) => {
      let hx = sx * 36, hy = -10 + bob * 0.4 + (moving ? wk * sx * 3 : 0);
      if (beat) { hx = sx * 9; hy = -38 + Math.sin(e.t * 34 + i * Math.PI) * 5; }
      else if (e.state === 'attack' && e.atk === 'leap') { hx = sx * 22; hy = -92; }
      else if (punch > 0 && sx === dir) { hx = sx * (14 + 40 * punch); hy = -48 + 8 * punch; }
      const sy = -50 + bob;
      g.strokeStyle = OUT; g.lineWidth = 19; g.lineCap = 'round'; g.beginPath(); g.moveTo(sx * 25, sy); g.lineTo(hx, hy); g.stroke();
      g.strokeStyle = '#454d63'; g.lineWidth = 14.4; g.beginPath(); g.moveTo(sx * 25, sy); g.lineTo(hx, hy); g.stroke();
      circ(g, hx, hy, 8.6, '#3a4156', 2.2);
    };
    // 胴
    arm(-1, 0);
    g.beginPath(); g.moveTo(-26, -22 + bob); g.quadraticCurveTo(-34, -52 + bob, -18, -66 + bob); g.lineTo(18, -66 + bob); g.quadraticCurveTo(34, -52 + bob, 26, -22 + bob); g.quadraticCurveTo(0, -12 + bob, -26, -22 + bob); g.closePath();
    fillStroke(g, '#454d63', 2.6);
    g.save(); g.clip();
    g.fillStyle = '#6e7896'; g.beginPath(); g.ellipse(0, -40 + bob, 16, 17, 0, 0, TAU); g.fill();
    g.fillStyle = 'rgba(20,20,40,0.22)'; g.beginPath(); g.ellipse(24, -40 + bob, 12, 30, 0, 0, TAU); g.fill();
    g.restore();
    g.strokeStyle = 'rgba(53,40,63,0.5)'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(0, -52 + bob); g.lineTo(0, -28 + bob); g.stroke();
    arm(1, 1);
    // 頭
    g.save(); g.translate(0, -70 + bob + wind * 2);
    circ(g, -14, 2, 5, '#3a4156', 2); circ(g, 14, 2, 5, '#3a4156', 2);
    g.beginPath(); g.moveTo(-14, 6); g.quadraticCurveTo(-18, -16, 0, -20); g.quadraticCurveTo(18, -16, 14, 6); g.quadraticCurveTo(0, 14, -14, 6); g.closePath(); fillStroke(g, '#3a4156', 2.6);
    ell(g, 0, 3, 11, 9.6, '#b59c88', 2);
    g.strokeStyle = OUT; g.lineWidth = 3.2; g.lineCap = 'round'; g.beginPath(); g.moveTo(-11, -4); g.quadraticCurveTo(0, -1, 11, -4); g.stroke();
    for (const sx of [-1, 1]) {
      ell(g, sx * 5, -0.6, 2.6, 2.8, '#fff', 1.4); circ(g, sx * 4.6, -0.2, 1.5, OUT, 0);
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
    shadow(g, 10 - lift * 0.2, 3.4, 0.26, 0, 1);
    g.save(); g.scale(dir, 1); g.translate(0, -lift); g.scale(sx, sy);
    const eared = c.fear ? -0.5 : 0;
    ell(g, -9, -9, 5.4, 5.2, '#fffdf8', 1.9);                         // しっぽ
    ell(g, 0, -9, 10.4, 8.2, '#fffaf4', 2);                            // 胴
    g.fillStyle = 'rgba(150,120,160,0.16)'; g.beginPath(); g.ellipse(2, -4, 8, 4, 0, 0, TAU); g.fill();
    ell(g, 5, -2, 3, 2.4, '#fffaf4', 1.6);                             // 足
    circ(g, 9, -15.5, 7.2, '#fffaf4', 2);                              // 頭
    for (const [ex, ey, rot] of [[5.4, -29, -0.18 + eared], [11, -28.4, 0.22 + eared]]) {
      ell(g, ex, ey, 3.2, 8.4, '#fffaf4', 1.9, rot); ell(g, ex, ey + 0.6, 1.5, 5.6, '#ffb3c6', 0, rot);
    }
    circ(g, 12, -17, 1.7, OUT, 0); circ(g, 12.5, -17.6, 0.6, '#fff', 0);
    circ(g, 15.8, -14.4, 1.2, '#ff8fb0', 1);
    ell(g, 9.4, -12.4, 2, 1.2, 'rgba(255,120,150,0.55)', 0);
    g.restore();
  }

  function drawSquirrel(g, c, t) {
    const dir = c.face >= 0 ? 1 : -1;
    const air = c.hopU > 0 && c.hopU < 1;
    const lift = air ? Math.sin(Math.PI * c.hopU) * 12 : 0;
    const sway = Math.sin(c.t * (air ? 12 : 3)) * 0.12;
    shadow(g, 11 - lift * 0.2, 3.4, 0.26, 0, 1);
    g.save(); g.scale(dir, 1); g.translate(0, -lift);
    // 大きなしっぽ
    g.save(); g.translate(-7, -9); g.rotate(sway);
    g.beginPath(); g.moveTo(0, 0); g.bezierCurveTo(-14, -2, -16, -24, -4, -30); g.bezierCurveTo(4, -32, 6, -22, 2, -16); g.bezierCurveTo(5, -9, 4, -3, 0, 0); g.closePath();
    fillStroke(g, '#d9904a', 2);
    g.save(); g.clip(); g.strokeStyle = '#f2b574'; g.lineWidth = 3; for (const y of [-6, -13, -20, -27]) { g.beginPath(); g.moveTo(-18, y); g.quadraticCurveTo(-4, y - 3, 8, y); g.stroke(); }
    g.fillStyle = '#fff1d0'; g.beginPath(); g.arc(-3, -31, 7, 0, TAU); g.fill(); g.restore();
    g.restore();
    ell(g, 0, -9, 8.6, 8.4, '#d18642', 2);
    ell(g, 3, -7, 5, 6, '#f8e2bc', 0);
    circ(g, 6, -18, 6.6, '#d18642', 2);
    poly(g, [2.4, -22, 3.4, -29, 6.4, -23], '#d18642', 1.8); poly(g, [7, -23, 10, -29, 11, -21], '#d18642', 1.8);
    circ(g, 9, -19, 1.7, OUT, 0); circ(g, 9.5, -19.6, 0.6, '#fff', 0);
    circ(g, 12.2, -16.8, 1.2, OUT, 0);
    ell(g, 6.6, -15, 1.9, 1.1, 'rgba(255,120,150,0.5)', 0);
    ell(g, 6.5, -6.6, 2.6, 3.4, '#8a5a38', 1.5);  // どんぐり
    ell(g, 6.5, -8.6, 2.8, 1.5, '#5a3822', 1.2);
    g.restore();
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
    if (what === 'poison') blit(g, S.mush.poison[0], 0, 0);
    else if (what === 'good') blit(g, S.mush.good[0], 0, 0);
    else if (what === 'rabbit') { g.scale(1.5, 1.5); drawRabbit(g, fake, 0); }
    else if (what === 'squirrel') { g.scale(1.5, 1.5); drawSquirrel(g, fake, 0); }
    else if (what === 'bear') { g.scale(0.78, 0.78); drawBear(g, fake, 0); }
    else if (what === 'gorilla') { g.scale(0.78, 0.78); drawGorilla(g, fake, 0); }
    else if (what === 'boar') { g.scale(0.9, 0.9); drawBoar(g, fake, 0); }
    else if (what === 'boy') { g.scale(1.25, 1.25); drawBoy(g, { aim: 0.5, walkT: 0, moving: false, recoil: 0, hurtT: 0, slowT: 0, firing: false }, 0.5); }
    g.restore();
  }

  return { OUT, INK, S, init, blit, mk, drawBoy, drawBoar, drawBear, drawGorilla, drawRabbit, drawSquirrel, drawBridge, drawIcon, star, ell, circ, poly, rrect, shadow, TREE_COL };
})();
