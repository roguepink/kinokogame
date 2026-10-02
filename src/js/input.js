'use strict';
/* 入力を1か所に集める。
   PC: WASD/矢印で移動、マウスでねらって左クリック(またはスペース)で発射
   スマホ: 画面の左半分をドラッグで移動、右半分をドラッグでねらって発射(両手ツインスティック) */

const Input = (() => {
  const keys = new Set();
  const mouse = { x: 0, y: 0, down: false, seen: false };
  const stick = { L: { id: null, ox: 0, oy: 0, x: 0, y: 0 }, R: { id: null, ox: 0, oy: 0, x: 0, y: 0 } };
  const STICK_R = 54;
  let doms = {};
  let touchUsed = false;
  let lastAim = 0.4;

  const MOVE_KEYS = { KeyW: 'u', ArrowUp: 'u', KeyS: 'd', ArrowDown: 'd', KeyA: 'l', ArrowLeft: 'l', KeyD: 'r', ArrowRight: 'r' };

  function setStickDom(side, active) {
    const d = doms[side];
    if (!d) return;
    const s = stick[side];
    d.el.classList.toggle('hidden', !active);
    if (!active) return;
    d.el.style.left = s.ox + 'px';
    d.el.style.top = s.oy + 'px';
    const dx = s.x - s.ox;
    const dy = s.y - s.oy;
    const len = Math.hypot(dx, dy) || 1;
    const k = Math.min(len, STICK_R) / len;
    d.knob.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
  }

  function attach(canvas, elL, elR, hooks) {
    doms = {
      L: { el: elL, knob: elL.querySelector('.knob') },
      R: { el: elR, knob: elR.querySelector('.knob') },
    };
    window.addEventListener('keydown', (e) => {
      if (e.repeat) { if (MOVE_KEYS[e.code] || e.code === 'Space') e.preventDefault(); return; }
      if (MOVE_KEYS[e.code] || e.code === 'Space') e.preventDefault();
      keys.add(e.code);
      if (hooks.onKey) hooks.onKey(e.code);
    });
    window.addEventListener('keyup', (e) => keys.delete(e.code));
    window.addEventListener('blur', () => { keys.clear(); mouse.down = false; releaseAll(); });

    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    // スマホのブラウザのスクロール・ピンチ拡大・ダブルタップ拡大を止める
    canvas.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
    canvas.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
    for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, (e) => e.preventDefault());
    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') {
        if (e.button !== 0) return;
        mouse.down = true; mouse.seen = true; mouse.x = e.clientX; mouse.y = e.clientY;
        if (hooks.onFirstInput) hooks.onFirstInput();
        return;
      }
      touchUsed = true;
      const side = e.clientX < window.innerWidth * 0.5 ? 'L' : 'R';
      const s = stick[side];
      if (s.id !== null) return;
      s.id = e.pointerId; s.ox = s.x = e.clientX; s.oy = s.y = e.clientY;
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* 無視 */ }
      setStickDom(side, true);
      if (hooks.onStick) hooks.onStick(side);
      if (hooks.onFirstInput) hooks.onFirstInput();
    });
    canvas.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'mouse') { mouse.x = e.clientX; mouse.y = e.clientY; mouse.seen = true; return; }
      for (const side of ['L', 'R']) {
        const s = stick[side];
        if (s.id === e.pointerId) { s.x = e.clientX; s.y = e.clientY; setStickDom(side, true); }
      }
    });
    const up = (e) => {
      if (e.pointerType === 'mouse') { mouse.down = false; return; }
      for (const side of ['L', 'R']) {
        const s = stick[side];
        if (s.id === e.pointerId) { s.id = null; setStickDom(side, false); }
      }
    };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('lostpointercapture', up);
  }

  function releaseAll() {
    for (const side of ['L', 'R']) { stick[side].id = null; setStickDom(side, false); }
  }

  // 移動入力 (長さ最大1)
  function move() {
    let x = 0;
    let y = 0;
    for (const k of keys) {
      const m = MOVE_KEYS[k];
      if (m === 'l') x -= 1; else if (m === 'r') x += 1; else if (m === 'u') y -= 1; else if (m === 'd') y += 1;
    }
    const s = stick.L;
    if (s.id !== null) {
      const dx = (s.x - s.ox) / STICK_R;
      const dy = (s.y - s.oy) / STICK_R;
      const len = Math.hypot(dx, dy);
      if (len > 0.12) { x += dx / Math.max(len, 1); y += dy / Math.max(len, 1); }
    }
    const l = Math.hypot(x, y);
    if (l > 1) { x /= l; y /= l; }
    return { x, y };
  }

  // ねらいと発射。px,py はプレイヤーの画面上の位置(CSSピクセル)
  function aim(px, py, moveAngle) {
    const r = stick.R;
    if (r.id !== null) {
      const dx = r.x - r.ox;
      const dy = r.y - r.oy;
      if (Math.hypot(dx, dy) > 10) lastAim = Math.atan2(dy, dx);
      return { angle: lastAim, fire: true, touch: true };
    }
    const fireKey = keys.has('Space') || keys.has('KeyJ') || keys.has('KeyK');
    if (mouse.seen) {
      lastAim = Math.atan2(mouse.y - py, mouse.x - px);
      return { angle: lastAim, fire: mouse.down || fireKey, touch: false };
    }
    if (moveAngle !== null) lastAim = moveAngle;
    return { angle: lastAim, fire: fireKey, touch: false };
  }

  return { attach, move, aim, releaseAll, isTouch: () => touchUsed, setLastAim: (a) => { lastAim = a; } };
})();
