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
    shoot() { noise(0.06, 0.05, 3000, 'highpass'); tone(900, 0.07, 'sine', 0.05, 520); },
    splat() { noise(0.09, 0.05, 1400, 'lowpass'); },
    hitEnemy() { tone(240, 0.09, 'square', 0.05, 140); noise(0.05, 0.04, 2500, 'bandpass'); },
    pop() { [520, 660, 880].forEach((f, i) => tone(f, 0.12, 'sine', 0.09, f * 1.08, i * 0.05)); noise(0.18, 0.04, 5000, 'highpass', 0.05); },
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
