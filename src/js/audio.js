'use strict';
/* 効果音とBGMをWebAudioで合成する(音声ファイルは使わない)。最初のタップ/クリックの後に鳴り始める */

const Sound = (() => {
  let ctx = null;
  let master = null;
  let bgmGain = null;
  let noiseBuf = null;
  let muted = false;
  let bgmOn = false;
  let timer = null;
  let nextTime = 0;
  let step = 0;
  try { muted = localStorage.getItem('kinoko_mute') === '1'; } catch (e) { /* 保存できなくても遊べる */ }

  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.55;
      master.connect(ctx.destination);
      bgmGain = ctx.createGain();
      bgmGain.gain.value = 0.15;
      bgmGain.connect(master);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.6, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) { ctx = null; }
  }

  function tone(freq, dur, type, vol, slideTo, delay, dest) {
    if (!ctx || muted) return;
    const t0 = ctx.currentTime + (delay || 0);
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(slideTo, 20), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(dest || master);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }
  function noise(dur, vol, freq, type, delay) {
    if (!ctx || muted) return;
    const t0 = ctx.currentTime + (delay || 0);
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type || 'lowpass';
    f.frequency.value = freq || 1200;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(f); f.connect(g); g.connect(master);
    s.start(t0); s.stop(t0 + dur + 0.05);
  }

  const sfx = {
    shoot(power) {
      // 「ポシュッ」: 息の音 + 低いトン
      noise(0.07, 0.07, 2600, 'highpass'); tone(power ? 1200 : 820, 0.08, 'sine', 0.06, power ? 700 : 430);
      tone(power ? 220 : 160, 0.06, 'triangle', 0.09, 60);
      if (power) tone(1800, 0.05, 'square', 0.02, 2400);
    },
    splat() { noise(0.09, 0.05, 1400, 'lowpass'); },
    hitEnemy() { tone(240, 0.09, 'square', 0.05, 140); noise(0.05, 0.04, 2500, 'bandpass'); },
    // コンボが続くほど音が高くなる
    pop(combo) {
      const k = Math.pow(1.06, Math.min(combo || 0, 10));
      [520, 660, 880].forEach((f, i) => tone(f * k, 0.13, 'sine', 0.1, f * k * 1.08, i * 0.05));
      noise(0.2, 0.05, 5000, 'highpass', 0.05); tone(120, 0.1, 'sine', 0.12, 50);
    },
    eat() { [660, 880, 1100, 1320].forEach((f, i) => tone(f, 0.12, 'triangle', 0.09, null, i * 0.06)); },
    poison() { tone(320, 0.55, 'sawtooth', 0.08, 80); tone(330, 0.55, 'square', 0.05, 90, 0.04); },
    hurt() { tone(220, 0.28, 'sawtooth', 0.12, 70); noise(0.2, 0.1, 800, 'lowpass'); },
    boost() { tone(420, 0.22, 'square', 0.06, 1100); [880, 1175, 1568].forEach((f, i) => tone(f, 0.1, 'triangle', 0.06, null, 0.08 + i * 0.05)); },
    alert() { tone(440, 0.1, 'triangle', 0.09); tone(330, 0.14, 'triangle', 0.09, null, 0.11); },
    roar() { noise(0.4, 0.1, 500, 'lowpass'); tone(110, 0.4, 'sawtooth', 0.08, 70); },
    slam() { noise(0.4, 0.16, 380, 'lowpass'); tone(80, 0.35, 'sine', 0.2, 40); },
    swipe() { noise(0.16, 0.08, 1800, 'bandpass'); },
    start() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.16, 'triangle', 0.1, null, i * 0.09)); },
    over() { [523, 440, 349, 262].forEach((f, i) => tone(f, 0.28, 'triangle', 0.12, null, i * 0.2)); },
    timeup() { [523, 659, 784, 659, 784, 1047].forEach((f, i) => tone(f, 0.18, 'triangle', 0.11, null, i * 0.11)); },
    click() { tone(700, 0.06, 'square', 0.04); },
    gold() { [988, 1319, 1568, 2093].forEach((f, i) => tone(f, 0.22, 'triangle', 0.08, null, i * 0.09)); tone(2637, 0.4, 'sine', 0.05, null, 0.36); },
    power() {
      [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => { tone(f, 0.3, 'square', 0.05, null, i * 0.07); tone(f, 0.3, 'triangle', 0.08, null, i * 0.07); });
      tone(60, 0.6, 'sine', 0.25, 30); noise(0.5, 0.12, 900, 'lowpass');
      [2093, 2637].forEach((f, i) => tone(f, 0.5, 'sine', 0.06, null, 0.45 + i * 0.1));
    },
    alarm() { for (let i = 0; i < 3; i++) { tone(660, 0.16, 'square', 0.07, null, i * 0.24); tone(520, 0.16, 'square', 0.07, null, i * 0.24 + 0.12); } },
    clear() { [523, 659, 784, 1047, 1319].forEach((f, i) => { tone(f, 0.25, 'triangle', 0.1, null, i * 0.08); }); tone(1568, 0.6, 'sine', 0.07, null, 0.45); },
    pickup() { [880, 1175, 1760].forEach((f, i) => tone(f, 0.12, 'square', 0.05, null, i * 0.06)); },
    bubble() { tone(600, 0.12, 'sine', 0.07, 900); },
    charged() { tone(1200, 0.1, 'sine', 0.06, 1800); tone(1800, 0.12, 'sine', 0.04, null, 0.08); },
    beam() { noise(0.25, 0.14, 1800, 'highpass'); tone(300, 0.3, 'sawtooth', 0.1, 90); tone(1400, 0.2, 'sine', 0.06, 400); },
    mission() { [784, 988, 1175, 1568].forEach((f, i) => tone(f, 0.18, 'triangle', 0.09, null, i * 0.07)); },
    bossRoar() { noise(0.9, 0.16, 400, 'lowpass'); tone(70, 0.9, 'sawtooth', 0.14, 40); tone(140, 0.6, 'square', 0.05, 60, 0.1); },
    spore() { for (let i = 0; i < 4; i++) tone(500 + i * 90, 0.08, 'sine', 0.05, 300, i * 0.05); },
    bossDown() { [262, 330, 392, 523, 659, 784, 1047].forEach((f, i) => { tone(f, 0.35, 'triangle', 0.1, null, i * 0.09); tone(f * 2, 0.3, 'sine', 0.05, null, i * 0.09); }); noise(0.6, 0.12, 1200, 'lowpass'); tone(50, 0.8, 'sine', 0.25, 30); },
    rifle() { noise(0.12, 0.16, 2200, 'highpass'); tone(140, 0.18, 'square', 0.12, 50); tone(900, 0.08, 'sine', 0.05, 300); },
    shotgun() { noise(0.25, 0.22, 900, 'lowpass'); tone(90, 0.25, 'sawtooth', 0.14, 40); noise(0.08, 0.1, 4000, 'highpass'); },
    missile() { noise(0.2, 0.1, 1200, 'bandpass'); tone(200, 0.3, 'sawtooth', 0.08, 900); },
    powerEnd() { [784, 659, 523].forEach((f, i) => tone(f, 0.2, 'triangle', 0.08, null, i * 0.12)); },
  };

  // ---- BGM: ペンタトニックの明るいループ ----
  const MEL = [0, -1, 4, -1, 7, -1, 4, -1, 9, -1, 7, -1, 4, -1, 7, -1, 5, -1, 9, -1, 12, -1, 9, -1, 7, -1, 11, -1, 14, -1, 11, 7];
  const BASS = [0, -9, -7, -5]; // C, A, F, G(1小節ごと)
  const BASE = 523.25;
  const hz = (semi, oct) => BASE * Math.pow(2, semi / 12 + (oct || 0));
  function bgmStep(t, i) {
    const m = MEL[i % MEL.length];
    if (m >= 0) tone2(hz(m), 0.3, 'triangle', 0.5, t);
    if (i % 2 === 0) tone2(hz(BASS[Math.floor((i % 32) / 8)], -2), 0.34, 'sine', 0.7, t);
    if (i % 4 === 2) hat(t);
  }
  function tone2(freq, dur, type, vol, t0) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(bgmGain);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }
  function hat(t0) {
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.12, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.05);
    s.connect(f); f.connect(g); g.connect(bgmGain);
    s.start(t0); s.stop(t0 + 0.08);
  }
  function startBgm() {
    if (!ctx || bgmOn) return;
    bgmOn = true;
    nextTime = ctx.currentTime + 0.1;
    step = 0;
    timer = setInterval(() => {
      if (!ctx) return;
      while (nextTime < ctx.currentTime + 0.35) { if (!muted) bgmStep(nextTime, step); nextTime += 0.19; step++; }
    }, 90);
  }
  function stopBgm() { bgmOn = false; if (timer) { clearInterval(timer); timer = null; } }

  function setMuted(m) {
    muted = m;
    try { localStorage.setItem('kinoko_mute', m ? '1' : '0'); } catch (e) { /* 無視 */ }
    if (master) master.gain.value = m ? 0 : 0.55;
  }
  return { init, sfx, startBgm, stopBgm, setMuted, isMuted: () => muted };
})();
