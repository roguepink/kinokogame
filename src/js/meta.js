'use strict';
/* ゲームをまたいで残るもの: 図鑑・実績(じっせき)・着せ替え・おまもり・日替わりチャレンジ・2周目の森
   localStorage に保存する。保存できない環境でも遊べる(そのときは毎回まっさら) */

const Meta = (() => {
  const KEY = 'kinoko_meta_v1';
  const fresh = () => ({ codex: {}, ach: {}, pts: 0, charms: { owned: {}, eq: null }, outfit: { shirt: 0, hat: 0 }, daily: {}, loopUnlocked: false, loop: false, games: 0, best: 0, total: 0, firstDate: null, stage2: false, stage: 1 });
  let D = fresh();
  function load() { try { const raw = localStorage.getItem(KEY); if (raw) D = Object.assign(fresh(), JSON.parse(raw)); } catch (e) { D = fresh(); } }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(D)); } catch (e) { /* 保存できなくても遊べる */ } }
  load();

  // ---------- 図鑑 ----------
  const CODEX = [
    { id: 'poison', name: 'どくキノコ', icon: 'poison', desc: 'むらさきや あかの どくキノコ。インクで きれいにしよう。' },
    { id: 'big', name: '大きな どくキノコ', icon: 'poison', desc: 'タフな どくキノコ。たおすと 300点。' },
    { id: 'good', name: 'ふつうのキノコ', icon: 'good', desc: 'たべると HPが かいふく。' },
    { id: 'gold', name: '金色のキノコ', icon: 'gold', desc: '走って にげる。たおすと ゴールドパワー!' },
    { id: 'rabbit', name: 'うさぎ', icon: 'rabbit', desc: 'さわると スピードアップ。なかまに なってくれる。' },
    { id: 'squirrel', name: 'リス', icon: 'squirrel', desc: 'ジグザグに にげる。さわると スピードアップ。' },
    { id: 'boar', name: 'イノシシ', icon: 'boar', desc: 'まっすぐ とっしん。木に ぶつかると めをまわす。' },
    { id: 'bear', name: 'クマ', icon: 'bear', desc: 'つめで なぎはらう。タフ。' },
    { id: 'gorilla', name: 'ゴリラ', icon: 'gorilla', desc: 'ジャンプして 着地の しょうげき波。' },
    { id: 'boss', name: 'キノコおやかた', icon: 'boss', desc: '森の ぬし。かさを あげた ときが チャンス。' },
    { id: 'w_boomerang', name: 'ブーメラン', icon: 'crate', desc: '次々 投げられる。キャッチすると 大きくなる。' },
    { id: 'w_missile', name: 'ゆうどうミサイル', icon: 'crate', desc: 'てきを 自動で おいかけて はじける。' },
    { id: 'w_omni', name: 'オムニショット', icon: 'crate', desc: '四方八方に いっせいに うつ。' },
    { id: 'w_rainbow', name: '虹の水てっぽう', icon: 'crate', desc: '当てた どうぶつが ずっと なかまに。' },
    { id: 'thief', name: 'どろぼう', icon: 'thief', desc: 'まち: すばやく とっしんして スコアを ぬすむ。' },
    { id: 'zombie', name: 'ゾンビ', icon: 'zombie', desc: 'まち: のろいけど タフ。つかまれると いたい。' },
    { id: 'yankee', name: 'リーゼントの ヤンキー', icon: 'yankee', desc: 'まち: とっしんして けとばす。' },
    { id: 'bossy', name: 'リーゼント総長', icon: 'bossy', desc: 'まちの ボス。くしで 髪を とかす ときが チャンス。' },
    { id: 'police', name: 'けいさつかん', icon: 'police', desc: 'まち: さわると スピードアップ。なかまに なってくれる。' },
    { id: 'w_rifle', name: 'ライフル', icon: 'crate', desc: 'まち: 遠くまで つらぬく。' },
    { id: 'w_shotgun', name: 'ショットガン', icon: 'crate', desc: 'まち: 近くで ひろく 当たる。' },
    { id: 'w_drone', name: 'こうげきドローン', icon: 'crate', desc: 'まち: 3台が 自動で うつ。' },
  ];
  function codexSee(id) { const c = D.codex[id] || (D.codex[id] = { seen: 0, killed: 0 }); c.seen += 1; if (c.seen === 1) { save(); if (typeof UI !== 'undefined' && G.state === 'playing') UI.toast('ずかんに とうろく: ' + (CODEX.find((x) => x.id === id) || { name: id }).name, 2200); } }
  function codexKill(id) { const c = D.codex[id] || (D.codex[id] = { seen: 0, killed: 0 }); c.killed += 1; if (c.seen === 0) c.seen = 1; }
  const codexCount = () => CODEX.filter((c) => D.codex[c.id] && D.codex[c.id].seen > 0).length;
  const rainbowUnlocked = () => ((D.codex.gold && D.codex.gold.killed) || 0) >= 3;

  // ---------- 実績 ----------
  const ACH = [
    { id: 'first', name: 'はじめの いっぽ', desc: '1回 あそぶ', test: (s) => D.games >= 1 },
    { id: 'p20', name: 'おそうじ見習い', desc: '1ゲームで どくキノコを 20本', test: (s) => s.purified >= 20 },
    { id: 'p40', name: 'おそうじ名人', desc: '1ゲームで どくキノコを 40本', test: (s) => s.purified >= 40 },
    { id: 'combo10', name: 'れんぞく!', desc: '10コンボ', test: (s) => s.bestCombo >= 10 },
    { id: 'combo15', name: 'とまらない!', desc: '15コンボ', test: (s) => s.bestCombo >= 15 },
    { id: 'gold1', name: 'きんいろ ハンター', desc: '金色のキノコを たおす', test: (s) => s.gold >= 1 },
    { id: 'gold5', name: 'きんいろ コレクター', desc: '金色のキノコを ぜんぶで 5回', test: () => ((D.codex.gold && D.codex.gold.killed) || 0) >= 5 },
    { id: 'boss', name: 'ぬしを たおした', desc: 'キノコおやかたを たいじ', test: (s) => s.boss >= 1 },
    { id: 'bossclean', name: 'かすりきず ひとつなく', desc: 'ボスが出てから ダメージを うけずに たいじ', test: (s) => s.boss >= 1 && !s.bossHurt },
    { id: 'ob2', name: '森の まもりて', desc: '1ゲームで 大発生を 2回 しずめる', test: (s) => s.outbreaksCleared >= 2 },
    { id: 'ms4', name: 'おつかい じょうず', desc: '1ゲームで ミッションを 4つ', test: (s) => s.missions >= 4 },
    { id: 'ram5', name: 'ふっとばし王', desc: '1ゲームで 体当たりで 5匹', test: (s) => s.rams >= 5 },
    { id: 'nopoison', name: 'よく見て あるく', desc: 'どくを 1回も たべずに 20本 きれいにする', test: (s) => s.poisoned === 0 && s.purified >= 20 },
    { id: 'eat10', name: 'きのこ グルメ', desc: 'ふつうのキノコを ぜんぶで 10個', test: () => ((D.codex.good && D.codex.good.killed) || 0) >= 10 },
    { id: 'boost20', name: 'どうぶつの ともだち', desc: 'うさぎ・リスに ぜんぶで 20回', test: () => (D.boosts || 0) >= 20 },
    { id: 'weapons', name: '武器マスター', desc: '4しゅるいの 武器を ぜんぶ 使う', test: () => ['w_boomerang', 'w_missile', 'w_omni', 'w_rainbow'].every((k) => D.codex[k] && D.codex[k].seen > 0) },
    { id: 'allies3', name: 'どうぶつ たいちょう', desc: '1ゲームで 3匹を なかまに する', test: (s) => (s.allies || 0) >= 3 },
    { id: 'town', name: 'まちの ヒーロー', desc: 'ステージ2「まち」で ランクA', test: (s, score, rank) => G.stage === 2 && (rank === 'A' || rank === 'S') },
    { id: 'townboss', name: '総長を たおした', desc: 'リーゼント総長を たいじ', test: (s) => G.stage === 2 && s.boss >= 1 },
    { id: 'rainbow', name: 'にじいろの きずな', desc: '虹の水てっぽうで なかまに した どうぶつが 敵を たおす', test: (s) => (s.allyKills || 0) >= 1 },
    { id: 'night', name: 'よるの ハンター', desc: '夜に 金色のキノコを たおす', test: (s) => s.nightGold >= 1 },
    { id: 's12k', name: 'もりの でんせつ', desc: 'スコア 12000', test: (s, score) => score >= 12000 },
    { id: 'games10', name: 'じょうれんさん', desc: '10回 あそぶ', test: () => D.games >= 10 },
    { id: 'codex', name: 'ずかん コンプリート', desc: 'ずかんを ぜんぶ うめる', test: () => codexCount() >= CODEX.length },
    { id: 'loopA', name: '2周目の ヒーロー', desc: '2周目の森で ランクA', test: (s, score, rank, loop) => loop && (rank === 'A' || rank === 'S') },
    { id: 'friend', name: 'なかまと いっしょ', desc: 'なかまの どうぶつが 10回 体当たり', test: (s) => (s.companionHits || 0) >= 10 },
    { id: 'boom3', name: 'ブーメラン名人', desc: 'ブーメランを Lv3に', test: (s) => (s.boomMax || 0) >= 3 },
  ];
  const achCount = () => ACH.filter((a) => D.ach[a.id]).length;

  // ---------- 着せ替え(実績で増える) ----------
  const SHIRTS = [
    { name: 'オレンジ', c: ['#ff9a5c', '#ff7a3d', '#d9552a'] },
    { name: 'みずいろ', c: ['#8fd8ff', '#4fb3f0', '#2a7fc0'], ach: 'first' },
    { name: 'きみどり', c: ['#c8f07a', '#8fd04a', '#5a9a2a'], ach: 'p20' },
    { name: 'ピンク', c: ['#ffb3dc', '#ff6fb0', '#d03a80'], ach: 'combo10' },
    { name: 'むらさき', c: ['#d49bff', '#a24be0', '#6b2a9c'], ach: 'boss' },
    { name: 'きんいろ', c: ['#fff2a8', '#ffcf2e', '#d99600'], ach: 'gold5' },
    { name: 'よぞら', c: ['#5a6aa8', '#2e3a78', '#1a2250'], ach: 'night' },
    { name: 'にじ', c: ['#ff8ad0', '#9be0ff', '#9dffb0'], ach: 'rainbow' },
  ];
  const HATS = [
    { id: 'none', name: 'なし' },
    { id: 'cap', name: 'キャップ', ach: 'p40' },
    { id: 'straw', name: 'むぎわら', ach: 'ob2' },
    { id: 'flower', name: 'お花', ach: 'eat10' },
    { id: 'crown', name: '王かん', ach: 'bossclean' },
    { id: 'star', name: 'ほしのぼうし', ach: 's12k' },
  ];
  const shirtOk = (i) => !SHIRTS[i].ach || D.ach[SHIRTS[i].ach];
  const hatOk = (i) => !HATS[i].ach || D.ach[HATS[i].ach];
  function outfit() {
    const si = shirtOk(D.outfit.shirt) ? D.outfit.shirt : 0;
    const hi = hatOk(D.outfit.hat) ? D.outfit.hat : 0;
    return { shirt: SHIRTS[si].c, hat: HATS[hi].id };
  }

  // ---------- おまもり ----------
  const CHARMS = [
    { id: 'hp', name: 'げんきの おまもり', desc: 'HPが 130で はじまる', cost: 150 },
    { id: 'dash', name: 'はやあしの おまもり', desc: 'さいしょの 20びょう スピードアップ', cost: 150 },
    { id: 'weapon', name: '武器の おまもり', desc: '武器の 時間が +8びょう', cost: 250 },
    { id: 'bossweak', name: 'めざとい おまもり', desc: 'ボスの 弱点の 時間が 2倍', cost: 300 },
    { id: 'score', name: 'ごうかな おまもり', desc: 'スコア +10%', cost: 400 },
    { id: 'friend', name: 'なかよしの おまもり', desc: 'なかまの どうぶつが 2倍 長く いてくれる', cost: 250 },
  ];
  function buyCharm(id) { const c = CHARMS.find((x) => x.id === id); if (!c || D.charms.owned[id] || D.pts < c.cost) return false; D.pts -= c.cost; D.charms.owned[id] = true; save(); return true; }
  function equipCharm(id) { D.charms.eq = (id && D.charms.owned[id]) ? id : null; save(); }
  const charm = () => D.charms.eq;

  // ---------- 日替わりチャレンジ ----------
  const DAILY = [
    { key: 'purified', name: 'どくキノコを きれいに', unit: '本', target: 35 },
    { key: 'bestCombo', name: 'さいだいコンボ', unit: '', target: 8 },
    { key: 'inked', name: 'どうぶつを おいはらう', unit: '匹', target: 6 },
    { key: 'missions', name: 'ミッション', unit: '個', target: 4 },
    { key: 'outbreaksCleared', name: '大発生を しずめる', unit: '回', target: 2 },
    { key: 'score', name: 'スコア', unit: '点', target: 8000 },
    { key: 'crates', name: '武器の箱を ひろう', unit: '個', target: 4 },
  ];
  const todayKey = () => { const d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); };
  function daily() {
    const d = new Date();
    const def = DAILY[d.getDay()];
    const rec = D.daily[todayKey()] || { best: 0 };
    return { def, best: rec.best, star: rec.best >= def.target, text: def.name + ' ' + def.target + def.unit };
  }

  // ---------- ゲーム開始・終了 ----------
  function applyStart() {
    const o = outfit();
    G.player.outfit = o;
    const eq = charm();
    G.charmWeaponTime = eq === 'weapon' ? 8 : 0;
    G.charmScore = eq === 'score' ? 1.1 : 1;
    G.charmBossWeak = eq === 'bossweak' ? 2 : 1;
    G.charmFriend = eq === 'friend' ? 2 : 1;
    if (eq === 'hp') { G.player.hp = 130; G.player.maxHpBonus = 30; }
    if (eq === 'dash') G.player.boostT = 20;
    G.loop = !!(D.loop && D.loopUnlocked);
    G.stats.bossHurt = false; G.stats.nightGold = 0; G.stats.companionHits = 0; G.stats.boomMax = 1; G.stats.allyKills = 0;
  }
  function onGameEnd(score, rank) {
    D.games += 1; D.total += score; D.best = Math.max(D.best, score);
    const gained = Math.floor(score / 100) * (G.loop ? 2 : 1);
    D.pts += gained;
    D.boosts = (D.boosts || 0) + (G.stats.boosts || 0);
    const newAch = [];
    for (const a of ACH) { if (D.ach[a.id]) continue; let ok = false; try { ok = !!a.test(G.stats, score, rank, G.loop); } catch (e) { ok = false; } if (ok) { D.ach[a.id] = todayKey(); newAch.push(a); } }
    const dy = daily();
    const val = dy.def.key === 'score' ? score : (G.stats[dy.def.key] || 0);
    const rec = D.daily[todayKey()] || { best: 0 };
    const wasStar = rec.best >= dy.def.target;
    rec.best = Math.max(rec.best, val); D.daily[todayKey()] = rec;
    const dailyStar = !wasStar && rec.best >= dy.def.target;
    let loopNew = false;
    if (!D.loopUnlocked && (rank === 'A' || rank === 'S')) { D.loopUnlocked = true; loopNew = true; }
    let stage2New = false;
    if (!D.stage2 && G.stage === 1 && (rank === 'B' || rank === 'A' || rank === 'S')) { D.stage2 = true; stage2New = true; }
    // 古い日のきろくは消す
    for (const k of Object.keys(D.daily)) if (k !== todayKey() && Object.keys(D.daily).length > 7) delete D.daily[k];
    save();
    return { gained, pts: D.pts, newAch, daily: { ...dy, val, star: rec.best >= dy.def.target, newStar: dailyStar }, loopNew, stage2New };
  }

  // ---------- 画面(タイトルから開くパネル) ----------
  let panel = null;
  function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
  function openPanel(tab) {
    if (!panel) {
      panel = document.getElementById('metaPanel');
      panel.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => render(b.dataset.tab)));
      document.getElementById('btnMetaClose').addEventListener('click', () => { panel.classList.add('hidden'); if (typeof refreshTitle === 'function') refreshTitle(); });
    }
    panel.classList.remove('hidden');
    render(tab || 'codex');
  }
  function render(tab) {
    panel.querySelectorAll('.tab').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    const body = document.getElementById('metaBody');
    const howto = document.getElementById('howtoBody');
    howto.classList.toggle('hidden', tab !== 'howto');
    body.classList.toggle('hidden', tab === 'howto');
    if (tab === 'howto') { if (!howto.dataset.drawn) { howto.dataset.drawn = '1'; for (const [id, what] of [['ic-poison', 'poison'], ['ic-good', 'good'], ['ic-rabbit', 'rabbit'], ['ic-gold', 'gold'], ['ic-boss', 'boss'], ['ic-crate', 'crate'], ['ic-gorilla', 'gorilla'], ['ic-bear', 'bear'], ['ic-boar', 'boar']]) { const c = document.getElementById(id); if (c) Art.drawIcon(c, what); } const m = document.getElementById('ic-map'); if (m && typeof drawMapIcon === 'function') drawMapIcon(m); } return; }
    let h = '';
    if (tab === 'codex') {
      h += `<p class="meta-sub">ずかん ${codexCount()} / ${CODEX.length}</p><ul class="codex">`;
      for (const c of CODEX) {
        const r = D.codex[c.id];
        if (!r || !r.seen) { h += `<li class="locked"><div class="cx-ic">?</div><b>${c.secret ? '？？？' : '？？？'}</b><span>${c.secret ? 'かくされている…' : 'まだ 出会っていない'}</span></li>`; continue; }
        h += `<li><canvas class="cx-ic" data-icon="${c.icon}" width="64" height="64"></canvas><b>${esc(c.name)}</b><span>${esc(c.desc)}</span><i>見た ${r.seen} / ${c.id.startsWith('w_') ? 'つかった' : c.id === 'good' ? 'たべた' : 'たおした'} ${r.killed}</i></li>`;
      }
      h += '</ul>';
    } else if (tab === 'ach') {
      h += `<p class="meta-sub">じっせき ${achCount()} / ${ACH.length}</p><ul class="achs">`;
      for (const a of ACH) h += `<li class="${D.ach[a.id] ? 'done' : ''}"><b>${D.ach[a.id] ? '★' : '☆'} ${esc(a.name)}</b><span>${esc(a.desc)}</span></li>`;
      h += '</ul>';
    } else if (tab === 'outfit') {
      h += `<p class="meta-sub">じっせきを とると ふえる</p><div class="outfit-row"><canvas id="outfitPreview" width="140" height="140"></canvas><div>`;
      h += '<div class="opt-label">Tシャツ</div><div class="opts">' + SHIRTS.map((s, i) => `<button class="opt ${D.outfit.shirt === i ? 'on' : ''} ${shirtOk(i) ? '' : 'lock'}" data-shirt="${i}" data-col="${s.c[1]}" title="${esc(s.name)}">${shirtOk(i) ? '' : '🔒'}</button>`).join('') + '</div>';
      h += '<div class="opt-label">ぼうし</div><div class="opts">' + HATS.map((s, i) => `<button class="opt txt ${D.outfit.hat === i ? 'on' : ''} ${hatOk(i) ? '' : 'lock'}" data-hat="${i}">${hatOk(i) ? esc(s.name) : '🔒 ' + esc(s.name)}</button>`).join('') + '</div>';
      h += '</div></div>';
    } else if (tab === 'charm') {
      h += `<p class="meta-sub">ポイント <b>${D.pts}</b>(スコア100点で 1ポイント)。1つだけ つけられる</p><ul class="charms">`;
      for (const c of CHARMS) {
        const own = D.charms.owned[c.id]; const eq = D.charms.eq === c.id;
        h += `<li class="${eq ? 'eq' : ''}"><b>${esc(c.name)}</b><span>${esc(c.desc)}</span>` + (own ? `<button class="sub-btn" data-eq="${c.id}">${eq ? 'はずす' : 'つける'}</button>` : `<button class="sub-btn ${D.pts >= c.cost ? '' : 'lock'}" data-buy="${c.id}">${c.cost}pt で 買う</button>`) + '</li>';
      }
      h += '</ul>';
    }
    body.innerHTML = h;
    body.querySelectorAll('canvas[data-icon]').forEach((c) => Art.drawIcon(c, c.dataset.icon));
    body.querySelectorAll('[data-col]').forEach((b) => { b.style.background = b.dataset.col; });
    body.querySelectorAll('[data-shirt]').forEach((b) => b.addEventListener('click', () => { const i = +b.dataset.shirt; if (shirtOk(i)) { D.outfit.shirt = i; save(); render('outfit'); } }));
    body.querySelectorAll('[data-hat]').forEach((b) => b.addEventListener('click', () => { const i = +b.dataset.hat; if (hatOk(i)) { D.outfit.hat = i; save(); render('outfit'); } }));
    body.querySelectorAll('[data-buy]').forEach((b) => b.addEventListener('click', () => { if (buyCharm(b.dataset.buy)) { Sound.init(); Sound.sfx.pickup(); render('charm'); } }));
    body.querySelectorAll('[data-eq]').forEach((b) => b.addEventListener('click', () => { equipCharm(D.charms.eq === b.dataset.eq ? null : b.dataset.eq); render('charm'); }));
    const pv = document.getElementById('outfitPreview');
    if (pv) { const g = pv.getContext('2d'); g.clearRect(0, 0, 140, 140); g.save(); g.translate(70, 126); g.scale(2.6, 2.6); Art.drawBoy(g, { aim: 0.4, walkT: 0, moving: false, recoil: 0, hurtT: 0, slowT: 0, firing: false, vx: 0, vy: 0, lean: 0, outfit: outfit() }, 0.5); g.restore(); }
  }

  return { D, CODEX, ACH, SHIRTS, HATS, CHARMS, codexSee, codexKill, codexCount, achCount, rainbowUnlocked, outfit, charm, buyCharm, equipCharm, daily, applyStart, onGameEnd, openPanel, save, setLoop: (v) => { D.loop = !!v; save(); }, loopUnlocked: () => D.loopUnlocked, loopOn: () => !!(D.loop && D.loopUnlocked), pts: () => D.pts, stage2Unlocked: () => !!D.stage2, stage: () => (D.stage === 2 && D.stage2 ? 2 : 1), setStage: (n) => { D.stage = n; save(); } };
})();
