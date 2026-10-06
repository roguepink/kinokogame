'use strict';
/* 起動・状態遷移(タイトル → プレイ → けっか)・メインループ・画面表示(HUD) */

const $ = (id) => document.getElementById(id);

const UI = {
  el: {},
  toastTimer: 0,
  last: {},
  init() {
    for (const id of ['hud', 'hpFill', 'hpText', 'score', 'combo', 'comboN', 'comboM', 'comboFill', 'chips', 'timer', 'btnSound', 'btnPause', 'toast', 'banner', 'hint',
      'title', 'pause', 'result', 'touchHints', 'thL', 'thR', 'event', 'eventText', 'eventFill', 'bossBar', 'bossFill', 'mission', 'missionText', 'missionProg', 'hiscores', 'todayForest', 'dailyBox', 'loopBox', 'loopChk', 'resMeta', 'cntCodex', 'cntAch', 'cntPts', 'btnStart', 'btnResume', 'btnQuit', 'btnRetry', 'btnToTitle', 'bestTitle', 'resTitle', 'resRank', 'resMsg', 'resScore', 'resNew', 'resStats']) {
      this.el[id] = $(id);
    }
  },
  show(id, on) { this.el[id].classList.toggle('hidden', !on); },
  toast(msg, ms) {
    const t = this.el.toast;
    t.textContent = msg;
    t.classList.remove('hidden');
    t.style.animation = 'none'; void t.offsetWidth; t.style.animation = '';
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => t.classList.add('hidden'), ms || 2600);
  },
  banner(text) {
    const b = this.el.banner;
    b.textContent = text;
    b.classList.remove('hidden');
    b.style.animation = 'none'; void b.offsetWidth; b.style.animation = '';
    setTimeout(() => b.classList.add('hidden'), 1400);
  },
  // 値が変わったときだけDOMを書き換える
  set(key, val, fn) {
    if (this.last[key] === val) return;
    this.last[key] = val;
    fn(val);
  },
  updateHud() {
    if (G.state === 'title') return;
    const P = G.player;
    const e = this.el;
    const hp = Math.ceil(P.hp);
    this.set('hp', hp, (v) => {
      e.hpFill.style.width = Math.min(100, (v / (CONFIG.player.maxHp + (P.maxHpBonus || 0))) * 100) + '%';
      e.hpFill.className = 'hp-fill' + (v <= 30 ? ' low' : v <= 60 ? ' mid' : '');
      e.hpText.textContent = v;
    });
    // スコアはカウントアップ表示
    if (G.dispScore < G.score) G.dispScore = Math.min(G.score, G.dispScore + Math.max(3, Math.ceil((G.score - G.dispScore) * 0.2)));
    this.set('score', G.dispScore, (v) => {
      e.score.textContent = v.toLocaleString('en-US');
      e.score.classList.remove('bump'); void e.score.offsetWidth; e.score.classList.add('bump');
    });
    const sec = Math.ceil(G.timeLeft);
    this.set('time', sec, (v) => {
      e.timer.textContent = Math.floor(v / 60) + ':' + String(v % 60).padStart(2, '0');
      e.timer.classList.toggle('warn', v <= 30 && G.state === 'playing');
    });
    // コンボ
    const showCombo = G.combo >= 2 && G.state === 'playing';
    this.set('comboShow', showCombo, (v) => e.combo.classList.toggle('hidden', !v));
    if (showCombo) {
      this.set('combo', G.combo, (v) => {
        e.comboN.textContent = 'COMBO ' + v;
        e.comboM.textContent = 'スコア x' + G.comboMult;
        e.combo.style.animation = 'none'; void e.combo.offsetWidth; e.combo.style.animation = '';
      });
      e.comboFill.style.width = clamp(G.comboT / CONFIG.mushroom.comboWindow, 0, 1) * 100 + '%';
    }
    // 状態アイコン(どく・スピードアップ)
    const slow = P.slowT > 0;
    const boost = P.boostT > 0;
    const power = G.power > 0;
    this.set('chipsKey', (slow ? 1 : 0) + (boost ? 2 : 0) + (power ? 4 : 0), () => {
      e.chips.innerHTML = (power ? '<div class="chip power">ゴールドパワー<i id="chipPower"></i><div class="chip-bar"><div id="chipPowerFill"></div></div></div>' : '')
        + (slow ? '<div class="chip poison">どく のろのろ<i id="chipSlow"></i></div>' : '') + (boost ? '<div class="chip boost">スピードアップ<i id="chipBoost"></i></div>' : '');
    });
    if (slow) { const c = $('chipSlow'); if (c) c.textContent = P.slowT.toFixed(1) + 's'; }
    if (boost) { const c = $('chipBoost'); if (c) c.textContent = P.boostT.toFixed(1) + 's'; }
    // 日本刀(近くに敵がいるとき)
    const sword = !!(P.sw && P.sw.out);
    this.set('sword', sword, (v) => { const old = e.chips.querySelector('.chip.sword'); if (old) old.remove(); if (v) { const d = document.createElement('div'); d.className = 'chip sword'; d.textContent = '日本刀!'; e.chips.prepend(d); } });
    // 武器
    const wkey = G.weapon || '';
    this.set('weaponKey', wkey, (v) => {
      const old = e.chips.querySelector('.chip.weapon'); if (old) old.remove();
      if (v) { const d = document.createElement('div'); d.className = 'chip weapon ' + v; d.innerHTML = Features.C.weapons[v].name + '<i id="chipWeapon"></i>'; e.chips.appendChild(d); }
    });
    if (wkey) { const c = $('chipWeapon'); if (c) c.textContent = G.weaponT.toFixed(1) + 's'; }
    // 大発生
    const ev = G.ev;
    this.set('evShow', !!ev, (v) => e.event.classList.toggle('hidden', !v));
    if (ev) {
      const alive = ev.mush.length;
      this.set('evText', Math.ceil(ev.left) + ':' + alive, () => { e.eventText.textContent = 'どくの大発生! のこり ' + alive + '本 / ' + Math.ceil(ev.left) + 'びょう'; });
      e.eventFill.style.width = clamp(ev.left / Features.C.outbreak.limit, 0, 1) * 100 + '%';
    }
    // ボス
    const B = G.boss;
    this.set('bossShow', !!(B && !B.dead), (v) => { e.bossBar.classList.toggle('hidden', !v); e.bossBar.querySelector('span').textContent = G.stage === 2 ? 'リーゼント総長' : 'キノコおやかた'; });
    if (B) e.bossFill.style.width = clamp(B.hp / B.maxHp, 0, 1) * 100 + '%';
    // ミッション
    const M = G.missions;
    const cur = M && M.cur;
    this.set('missionShow', !!cur && G.state === 'playing', (v) => e.mission.classList.toggle('hidden', !v));
    if (cur) {
      this.set('missionText', cur.def.id, () => { e.missionText.textContent = typeof cur.def.text === 'function' ? cur.def.text() : cur.def.text; });
      this.set('missionProg', cur.prog + '/' + cur.def.n, (v) => { e.missionProg.textContent = v; });
    }
    this.set('missionFlash', M && M.flash > 0, (v) => e.mission.classList.toggle('done', !!v));
    if (power) { const c = $('chipPower'); if (c) c.textContent = G.power.toFixed(1) + 's'; const f = $('chipPowerFill'); if (f) f.style.width = (G.power / CONFIG.power.time) * 100 + '%'; }
  },
};

// ---------- ハイスコア ----------
function loadTable() { try { const t = JSON.parse(localStorage.getItem('kinoko_table') || '[]'); return Array.isArray(t) ? t : []; } catch (e) { return []; } }
function saveTable(t) { try { localStorage.setItem('kinoko_table', JSON.stringify(t.slice(0, 5))); } catch (e) { /* 無視 */ } }
function addToTable(score, rank) {
  const t = loadTable();
  const d = new Date();
  t.push({ s: score, r: rank, d: (d.getMonth() + 1) + '/' + d.getDate() });
  t.sort((a, b) => b.s - a.s);
  saveTable(t);
  return t.slice(0, 5);
}
function renderTable() {
  const t = loadTable().slice(0, 5);
  UI.el.hiscores.innerHTML = t.map((r) => `<li>${r.r}ランク ${r.d}<span>${r.s.toLocaleString('en-US')}</span></li>`).join('');
}
// 日替わりの森: 日付からシードを決める
function dailySeed() {
  const d = new Date();
  const n = d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
  return (CONFIG.world.seed + n * 7919) >>> 0;
}
function loadBest() { try { return parseInt(localStorage.getItem('kinoko_best') || '0', 10) || 0; } catch (e) { return 0; } }
function saveBest(v) { try { localStorage.setItem('kinoko_best', String(v)); } catch (e) { /* 保存できなくても遊べる */ } }

// ---------- 状態遷移 ----------
function startGame() {
  Sound.init(); Sound.setPaused(false);
  Sound.sfx.start();
  Sound.startBgm();
  resetGame();
  G.state = 'playing'; G.paused = false;
  G.dispScore = 0; G.overT = 0;
  UI.last = {};
  for (const id of ['title', 'pause', 'result']) UI.show(id, false);
  UI.show('hud', true);
  UI.banner('スタート!');
  G.cam.lx = 0; G.cam.ly = 0; G.zoomPunch = 0;
  UI.show('hint', true);
  clearTimeout(G.hintTimer);
  G.hintTimer = setTimeout(() => UI.show('hint', false), 8000);
  // スマホ: 操作ガイドの輪っかを出す(さわった側から消える。12秒でぜんぶ消える)
  for (const id of ['thL', 'thR']) UI.el[id].classList.remove('gone');
  UI.el.touchHints.classList.add('show');
  clearTimeout(G.thTimer);
  G.thTimer = setTimeout(() => UI.el.touchHints.classList.remove('show'), 12000);
  requestWakeLock();
  // カメラはすぐにプレイヤーへ
  G.cam.x = G.player.x; G.cam.y = G.player.y;
}

function endGame(reason) {
  if (G.state !== 'playing') return;
  G.state = 'over';
  G.over = { reason };
  G.overT = 0;
  Input.releaseAll();
  if (reason === 'time') Sound.sfx.timeup(); else Sound.sfx.over();
  UI.show('hint', false);
  UI.banner(reason === 'time' ? 'タイムアップ!' : 'ダウン…');
}

function showResult() {
  const reason = G.over.reason;
  const prevBest = loadBest();
  const isBest = G.score > prevBest;
  if (isBest) saveBest(G.score);
  const e = UI.el;
  e.resTitle.textContent = (G.stage === 2 ? 'まち: ' : 'もり: ') + (reason === 'time' ? 'タイムアップ!' : 'やられちゃった…');
  const ranks = [[15000, 'S', 'もりの でんせつ!'], [8500, 'A', 'もりの ヒーロー!'], [4000, 'B', 'なかなかの キノコハンター!'], [0, 'C', 'つぎは もっと うてるよ!']];
  let [, letter, msg] = ranks.find((r) => G.score >= r[0]);
  if (G.stats.boss && letter !== 'S') { letter = String.fromCharCode(letter.charCodeAt(0) - 1); if (letter === '@') letter = 'S'; msg = 'ボスを たおした! ' + msg; }
  addToTable(G.score, letter); renderTable();
  const meta = Meta.onGameEnd(G.score, letter);
  let mh = `ポイント +${meta.gained}(ぜんぶで <b>${meta.pts}</b>pt)`;
  mh += `<br>きょうのチャレンジ: ${meta.daily.text} → <b>${meta.daily.val}</b> ${meta.daily.star ? '<span class="new">★ たっせい!</span>' : ''}`;
  if (meta.newAch.length) mh += '<br><span class="new">じっせき かくとく: ' + meta.newAch.map((a) => '「' + a.name + '」').join(' ') + '</span>';
  if (meta.loopNew) mh += '<br><span class="new">「2周目の森」が あそべるように なった!</span>';
  if (meta.stage2New) mh += '<br><span class="new">ステージ2「まち」が あそべるように なった!</span>';
  e.resMeta.innerHTML = mh;
  refreshTitle();
  e.resRank.textContent = letter;
  e.resRank.style.background = letter === 'S' ? 'radial-gradient(circle at 35% 30%, #fff6a0, #ff5fb0)' : letter === 'A' ? 'radial-gradient(circle at 35% 30%, #ffe98a, #ff9d2e)' : letter === 'B' ? 'radial-gradient(circle at 35% 30%, #c8f5b0, #43c06a)' : 'radial-gradient(circle at 35% 30%, #d8e6ff, #7a9be0)';
  e.resMsg.textContent = msg;
  e.resScore.textContent = G.score.toLocaleString('en-US');
  e.resNew.classList.toggle('hidden', !isBest || G.score === 0);
  const s = G.stats;
  const rows = [['どくキノコ そうじ', s.purified + '本'], ['さいだいコンボ', s.bestCombo], ['日本刀で 斬った', (s.slashes || 0) + '回'], ['刀で ふっとばし', (s.slashKills || 0) + '匹'], ['カウンター', (s.counters || 0) + '回'], ['ダッシュ', (s.dashes || 0) + '回'], ['ミッション', s.missions + '個'], ['大発生を しずめた', s.outbreaksCleared + '/' + s.outbreaks + '回'], [G.stage === 2 ? 'リーゼント総長' : 'キノコおやかた', s.boss ? 'たいじ!' : 'にがした'], ['金色キノコ', s.gold + '/' + s.goldSeen + '匹'], ['おいはらった', s.inked + '匹'], ['体当たり', s.rams + '匹'], ['たべた キノコ', s.eaten + '個'], ['スピードアップ', s.boosts + '回'], ['どくを たべちゃった', s.poisoned + '回']];
  e.resStats.innerHTML = rows.map(([k, v]) => `<li><span>${k}</span><b>${v}</b></li>`).join('');
  e.bestTitle.textContent = Math.max(prevBest, G.score).toLocaleString('en-US');
  UI.show('result', true);
}

// タイトル画面の数字(図鑑・実績・ポイント・日替わり)
function refreshTitle() {
  const e = UI.el;
  e.cntCodex.textContent = Meta.codexCount() + '/' + Meta.CODEX.length;
  e.cntAch.textContent = Meta.achCount() + '/' + Meta.ACH.length;
  e.cntPts.textContent = Meta.pts() + 'pt';
  const d = Meta.daily();
  e.dailyBox.innerHTML = 'きょうのチャレンジ: <b>' + d.text + '</b>' + (d.best ? ' / きろく ' + d.best : '') + (d.star ? ' <span class="star">★</span>' : '');
  e.loopBox.classList.toggle('hidden', !Meta.loopUnlocked());
  e.loopChk.checked = Meta.loopOn();
  document.querySelectorAll('[data-stage]').forEach((b) => { const n = +b.dataset.stage; b.classList.toggle('on', G.stage === n); b.classList.toggle('lock', n === 2 && !Meta.stage2Unlocked()); });
}
function toTitle() {
  Sound.stopBgm(); Sound.setPaused(false);
  G.state = 'title'; G.paused = false;
  resetGame();
  G.cam.x = G.player.x + 120; G.cam.y = G.player.y;
  UI.show('hud', false); UI.show('pause', false); UI.show('result', false); UI.show('hint', false);
  UI.show('title', true);
  UI.el.bestTitle.textContent = loadBest().toLocaleString('en-US');
  G.dispScore = 0;
  refreshTitle();
}

function setPaused(p) {
  if (G.state !== 'playing') return;
  G.paused = p;
  UI.show('pause', p);
  Sound.setPaused(p);
  if (p) Input.releaseAll();
}

// ---------- スマホ向けの補助 ----------
// 遊んでいる間は画面が暗くならないようにする(使えない端末では何もしない)
let wakeLock = null;
function requestWakeLock() {
  try {
    if (!navigator.wakeLock || document.hidden || wakeLock) return;
    navigator.wakeLock.request('screen').then((l) => { wakeLock = l; l.addEventListener('release', () => { wakeLock = null; }); }).catch(() => { /* 許可されなくても遊べる */ });
  } catch (e) { /* 無視 */ }
}

// 動きが重い端末では、描画の細かさを自動で下げる(コマ落ちを減らす)
const perf = { ema: 1 / 60, next: 0, lowered: 0 };
function watchPerformance(rawDt, now) {
  if (G.paused || G.state === 'title' || rawDt <= 0 || rawDt > 0.25) return; // 一時停止・タブ切り替え直後は数えない
  perf.ema = perf.ema * 0.94 + rawDt * 0.06;
  if (now < perf.next) return;
  if (perf.ema > 0.027) { // 平均 37fps より遅い
    if (Render.lowerQuality()) perf.lowered++;
    perf.ema = 1 / 60;
    perf.next = now + 3;
  }
}

// ---------- カメラ ----------
function updateCamera(dt) {
  const V = G.view;
  const P = G.player;
  const C = G.cam;
  const S = CONFIG.world.size;
  let tx;
  let ty;
  if (G.state === 'title') {
    tx = G.world.start.x + 120 + Math.sin(G.clock * 0.25) * 30; ty = G.world.start.y + Math.cos(G.clock * 0.2) * 14;
  } else {
    // ねらいの先 + 走っている方向を少し先読み(なめらかに追いかける)
    C.lx = lerp(C.lx || 0, P.vx * 0.16, 1 - Math.exp(-4 * dt)); C.ly = lerp(C.ly || 0, P.vy * 0.16, 1 - Math.exp(-4 * dt));
    tx = P.x + Math.cos(P.aim) * 30 + C.lx; ty = P.y - 14 + Math.sin(P.aim) * 20 + C.ly;
  }
  const k = 1 - Math.exp(-7 * dt);
  C.x += (tx - C.x) * k; C.y += (ty - C.y) * k;
  if (G.zoomPunch) { G.zoomPunch *= Math.exp(-9 * dt); if (G.zoomPunch < 0.002) G.zoomPunch = 0; }
  if (G.flashWhite) { G.flashWhite -= dt * 1.4; if (G.flashWhite < 0) G.flashWhite = 0; }
  C.x = clamp(C.x, V.vw / 2, S - V.vw / 2);
  C.y = clamp(C.y, V.vh / 2, S - V.vh / 2);
  C.shake = Math.max(0, C.shake - dt * 36);
  const kf = Math.exp(-14 * dt);
  C.kx = (C.kx || 0) * kf; C.ky = (C.ky || 0) * kf;
  V.left = C.x + C.kx - V.vw / 2; V.top = C.y + C.ky - V.vh / 2;
}

// ---------- 1ステップ進める ----------
function step(h) {
  if (G.state === 'title') {
    const P = G.player;
    P.aim = 0.35 + Math.sin(G.clock * 0.8) * 0.15;
    updateAmbient(h);
  } else {
    updateGame(h);
    if (G.state === 'over') {
      G.overT += h;
      if (G.overT > 1.3 && UI.el.result.classList.contains('hidden')) showResult();
    }
  }
  updateCamera(h);
}

let lastTs = 0;
function loop(ts) {
  requestAnimationFrame(loop);
  const now = ts / 1000;
  const rawDt = now - lastTs;
  const dt = Math.min(Math.max(rawDt, 0), 0.1);
  lastTs = now;
  if (lastTs > 0 && rawDt < 1) watchPerformance(rawDt, now);
  if (!G.paused) {
    G.clock += dt;
    // 当たった瞬間だけ時間をぐっとおそくする(手ごたえ)
    let scale = 1;
    if (G.hitStop > 0) { G.hitStop -= dt; scale = 0.12; }
    let rem = dt * scale;
    while (rem > 1e-6) { const h = Math.min(rem, 1 / 60); safe('step', () => step(h)); rem -= h; }
  }
  safe('draw', () => Render.draw(G.clock));
  if (G.state !== 'title') { safe('hud', () => { Render.drawMini(); UI.updateHud(); }); }
  else if (!UI.el.title.classList.contains('hidden')) safe('title', () => drawTitleArt(G.clock));
}
// 思わぬエラーが起きても、そのフレームだけ飛ばして遊びつづけられるようにする
const errLog = [];
function safe(where, fn) {
  try { fn(); } catch (e) {
    if (errLog.length < 20) { errLog.push(where + ': ' + (e && e.message)); console.error(e); }
    if (where === 'draw') { try { G.ctx.setTransform(1, 0, 0, 1, 0, 0); G.ctx.globalAlpha = 1; G.ctx.globalCompositeOperation = 'source-over'; G.noShadow = false; } catch (e2) { /* 無視 */ } }
  }
}

// タイトル画面のイラスト: 刀を構えた主人公・どくキノコ・うさぎ(ゆれる)
let titleArt = null;
function drawTitleArt(t) {
  if (!titleArt) titleArt = $('titleArt');
  if (!titleArt || !Art.S.mush) return;
  const g = titleArt.getContext('2d');
  const W = titleArt.width; const H = titleArt.height;
  g.clearRect(0, 0, W, H);
  // 地面
  g.fillStyle = 'rgba(120,190,90,0.35)'; g.beginPath(); g.ellipse(W / 2, H - 14, W * 0.46, 14, 0, 0, TAU); g.fill();
  const P = { aim: 0.3, walkT: 0, moving: false, recoil: 0, hurtT: 0, slowT: 0, firing: false, vx: 0, vy: 0, lean: 0, face: 1, outfit: Meta.outfit(), sw: titleArt.sw || (titleArt.sw = Object.assign(Melee.makeState(), { out: true, outT: 1 })) };
  // ときどき 斬る
  const cyc = t % 4.2;
  const sw = P.sw;
  if (cyc < 0.08) { sw.phase = 'wind'; sw.idx = 0; sw.t = cyc; sw.angle = 0.1; sw.cur = -1.5; }
  else if (cyc < 0.2) { sw.phase = 'active'; sw.t = cyc - 0.08; sw.cur = -1.5 + 2.7 * (1 - Math.pow(1 - (cyc - 0.08) / 0.12, 2.4)); }
  else if (cyc < 0.45) { sw.phase = 'recover'; sw.t = cyc - 0.2; sw.cur = 1.2; }
  else { sw.phase = 'idle'; sw.t = 0; }
  g.save(); g.translate(W * 0.28, H - 18); g.scale(2.1, 2.1); Art.blit(g, Art.S.mush.poison[0], 0, 0, 1); g.restore();
  g.save(); g.translate(W * 0.75, H - 16); g.scale(1.9, 1.9); Art.drawRabbit(g, { face: -1, hopU: 0, fear: false, t }, t); g.restore();
  g.save(); g.translate(W * 0.5, H - 16 + Math.sin(t * 2.2) * 1.5); g.scale(2.3, 2.3); Art.drawBoy(g, P, t); g.restore();
  if (sw.phase === 'active' || (sw.phase === 'recover' && sw.t < 0.12)) {
    const a0 = sw.angle - 1.5; const a1 = sw.angle + sw.cur; const k = sw.phase === 'active' ? 1 : 1 - sw.t / 0.12;
    g.save(); g.translate(W * 0.5, H - 60); g.globalAlpha = 0.8 * k;
    g.beginPath(); g.arc(0, 0, 74, a0, a1); g.arc(0, 0, 50, a1, a0, true); g.closePath(); g.fillStyle = 'rgba(255,255,255,0.55)'; g.fill();
    g.strokeStyle = '#fff'; g.lineWidth = 2.5; g.beginPath(); g.arc(0, 0, 72, a0, a1); g.stroke();
    g.restore();
  }
}

// 凡例用のミニマップのイラスト
function drawMapIcon(c) {
  const g = c.getContext('2d');
  const w = c.width;
  g.fillStyle = '#7fcf5a'; g.beginPath(); g.roundRect ? g.roundRect(4, 4, w - 8, w - 8, 12) : g.rect(4, 4, w - 8, w - 8); g.fill();
  g.lineWidth = 4; g.strokeStyle = '#35283f'; g.stroke();
  g.strokeStyle = '#4fb8ee'; g.lineWidth = 7; g.lineCap = 'round'; g.beginPath(); g.moveTo(14, 56); g.quadraticCurveTo(30, 36, 44, 44); g.quadraticCurveTo(54, 50, 60, 18); g.stroke();
  const dot = (x, y, r, col) => { g.fillStyle = col; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); g.lineWidth = 1.6; g.strokeStyle = '#fff'; g.stroke(); };
  dot(24, 22, 5, '#b03cff'); dot(50, 30, 5, '#b03cff'); dot(40, 56, 4.5, '#ff3b3b'); dot(18, 42, 4.5, '#ff7a3d');
}

// ---------- 起動 ----------
function boot() {
  G.canvas = $('game');
  G.ctx = G.canvas.getContext('2d', { alpha: false });
  G.mini = $('minimap');
  G.cam = { x: 0, y: 0, shake: 0, kx: 0, ky: 0 };
  G.view = { left: 0, top: 0 };
  G.clock = 0; G.paused = false; G.state = 'title'; G.dispScore = 0;
  G.stage = Meta.stage();
  G.world = buildWorld(dailySeed(), G.stage);
  UI.init();
  { const d = new Date(); $('todayForest').textContent = 'きょうの森 ' + (d.getMonth() + 1) + '/' + d.getDate() + '(まいにち ちがう森)'; }
  renderTable();
  resetGame();
  Render.resize();
  Render.buildMini();
  G.cam.x = G.player.x + 120; G.cam.y = G.player.y;

  // スマホ・タブレットかどうか: 指が主な入力、または指しか使えない端末
  const mq = (q) => window.matchMedia && window.matchMedia(q).matches;
  if (mq('(pointer: coarse)') || (navigator.maxTouchPoints > 0 && !mq('(any-pointer: fine)'))) document.body.classList.add('touch');
  // 最初にさわったのがボタンでも「スマホ」と分かるように、画面のどこでも指でさわったら切りかえる
  document.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') document.body.classList.add('touch'); }, true);
  Input.attach(G.canvas, $('stickL'), $('stickR'), {
    onKey(code) {
      if (code === 'KeyP' || code === 'Escape') { if (G.state === 'playing') setPaused(!G.paused); }
      else if (code === 'KeyM') toggleMute();
      else if (code === 'Enter') {
        if (G.state === 'title') startGame();
        else if (!UI.el.result.classList.contains('hidden')) startGame();
        else if (G.paused) setPaused(false);
      }
    },
    onStick(side) { UI.el[side === 'L' ? 'thL' : 'thR'].classList.add('gone'); },
    onFirstInput() {
      Sound.init();
      if (Input.isTouch()) document.body.classList.add('touch');
    },
  });

  UI.el.btnStart.addEventListener('click', startGame);
  UI.el.btnRetry.addEventListener('click', startGame);
  UI.el.btnToTitle.addEventListener('click', toTitle);
  UI.el.btnResume.addEventListener('click', (e) => { e.stopPropagation(); setPaused(false); });
  // ポーズ画面は カードの外をタップしても つづける
  UI.el.pause.addEventListener('click', (e) => { if (e.target === UI.el.pause) setPaused(false); });
  UI.el.btnQuit.addEventListener('click', toTitle);
  // ボタンにフォーカスが残ると、スペースキー(発射)でボタンが押されてしまうので外す
  UI.el.btnPause.addEventListener('click', (e) => { setPaused(!G.paused); e.currentTarget.blur(); });
  UI.el.btnSound.addEventListener('click', (e) => { toggleMute(); e.currentTarget.blur(); });
  const syncMute = () => UI.el.btnSound.classList.toggle('muted', Sound.isMuted());
  function toggleMute() { Sound.init(); Sound.setMuted(!Sound.isMuted()); syncMute(); }
  syncMute();

  window.addEventListener('resize', () => { Render.resize(); });
  window.addEventListener('orientationchange', () => setTimeout(() => Render.resize(), 200));
  document.addEventListener('visibilitychange', () => { if (document.hidden) setPaused(true); else if (G.state === 'playing') requestWakeLock(); });
  window.addEventListener('blur', () => { if (G.state === 'playing') setPaused(true); });

  UI.el.bestTitle.textContent = loadBest().toLocaleString('en-US');
  document.querySelectorAll('[data-meta]').forEach((b) => b.addEventListener('click', () => { Sound.init(); Meta.openPanel(b.dataset.meta); }));
  UI.el.loopChk.addEventListener('change', () => { Meta.setLoop(UI.el.loopChk.checked); resetGame(); });
  document.querySelectorAll('[data-stage]').forEach((b) => b.addEventListener('click', () => {
    const n = +b.dataset.stage;
    if (n === 2 && !Meta.stage2Unlocked()) { UI.toast('ステージ1で ランクB以上を とると あそべるよ', 2600); return; }
    if (G.stage === n) return;
    Meta.setStage(n); G.stage = n;
    G.world = buildWorld(dailySeed(), G.stage); Render.buildMini(); resetGame();
    G.cam.x = G.player.x + 120; G.cam.y = G.player.y;
    refreshTitle();
  }));
  refreshTitle();
  // 説明のイラストは「あそびかた」を開いたときに描く(Meta.render)


  // 動作確認用: URL に ?debug を付けるとコンソールから状態を触れる
  if (/[?&]debug/.test(location.search)) window.__kinoko = { errLog, perf, Features, Meta, Melee, purify, hitMushroom, refreshTitle, G, CONFIG, startGame, endGame, resetGame, spawnEnemy, makeEnemy, makeMushroom, makeCritter, setPaused, moveBody, step };

  requestAnimationFrame(loop);
}

boot();
