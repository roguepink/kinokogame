'use strict';
/* ゲームバランスの調整値はここにまとめる。遊びながら数字をいじって調整できる */

const CONFIG = {
  world: { size: 4000, tile: 20, seed: 7721 },
  // 画面の拡大率: 見える面積が targetArea 付近になるよう調整し、最低でも minW x minH は見えるようにする
  view: { targetArea: 400000, minW: 520, minH: 360, maxDpr: 2, maxPixels: 4.5e6 },
  timeLimit: 180, // 秒

  player: {
    r: 13, speed: 205, accel: 2400, maxHp: 100,
    invuln: 0.9,          // 被弾後の無敵時間
    slowMul: 0.5, slowTime: 6,   // 毒キノコを食べたとき
    boostMul: 1.55, boostTime: 7, boostMax: 12, // うさぎ・リス
    heal: 25,             // 普通のキノコ
  },
  gun: { rate: 7.5, speed: 660, range: 450, spread: 0.07, assist: 0.17 },

  mushroom: {
    poisonTarget: 50,     // 世界にいつも存在する毒キノコの数
    goodTarget: 16,
    hp: 2, bigHp: 6,
    score: 100, bigScore: 300,
    comboWindow: 4.5,     // この秒数以内に次を倒すとコンボ継続
    revealRadius: 175,    // 草むらに隠れた毒キノコが見えるようになる距離
  },
  critter: { rabbit: 190, squirrel: 170, fleeRadius: 190, count: 7 },

  enemies: {
    boar:    { name: 'イノシシ', cr: 16, hr: 25, hp: 11, wander: 55, chase: 118, charge: 480, sight: 440, windup: 0.8,  damage: 14, score: 50 },
    bear:    { name: 'クマ',     cr: 22, hr: 35, hp: 24, wander: 46, chase: 98,  sight: 390, windup: 0.6,  damage: 20, reach: 80, score: 80 },
    gorilla: { name: 'ゴリラ',   cr: 20, hr: 31, hp: 17, wander: 52, chase: 112, sight: 450, windup: 0.9,  damage: 16, shock: 100, punch: 12, leap: 0.55, score: 80 },
  },
  director: { start: 3, max: 9, every: 35 }, // 敵の数: 最初 3 匹、35秒ごとに +1、最大 9
};

// ゲーム全体の状態を入れる入れ物(main.js で初期化する)
const G = {};
