'use strict';
/* ゲームバランスの調整値はここにまとめる。遊びながら数字をいじって調整できる */

const CONFIG = {
  world: { size: 4000, tile: 20, seed: 7721 },
  // 画面の拡大率: 見える面積が targetArea 付近になるよう調整し、最低でも minW x minH は見えるようにする
  view: { targetArea: 400000, minW: 520, minH: 360, maxDpr: 2, maxPixels: 4.5e6 },
  timeLimit: 180, // 秒

  player: {
    r: 15, speed: 210, accel: 2400, maxHp: 100,
    invuln: 0.9,          // 被弾後の無敵時間
    slowMul: 0.5, slowTime: 6,   // 毒キノコを食べたとき
    boostMul: 1.55, boostTime: 7, boostMax: 12, // うさぎ・リス
    heal: 25,             // 普通のキノコ
  },
  gun: { rate: 8, speed: 700, range: 470, spread: 0.06, assist: 0.17, kick: 6 }, // kick: 撃ったときのカメラの反動(px)

  mushroom: {
    poisonTarget: 50,     // 世界にいつも存在する毒キノコの数
    goodTarget: 16,
    hp: 2, bigHp: 6,
    score: 100, bigScore: 300,
    comboWindow: 4.5,     // この秒数以内に次を倒すとコンボ継続
    revealRadius: 175,    // 草むらに隠れた毒キノコが見えるようになる距離
    // 金色の毒キノコ: 走って逃げる。倒すとパワーアップ
    goldHp: 7, goldScore: 500, goldSpeed: 172, goldFlee: 300, goldLife: 26, goldFirst: 20, goldEvery: 34,
  },
  // 金色キノコを倒したときのパワーアップ
  power: { time: 10, speedMul: 1.6, rate: 15, homing: 9, scoreMul: 2, damage: 2, ramScore: 150 },
  critter: { rabbit: 190, squirrel: 170, fleeRadius: 190, count: 7 },

  enemies: {
    boar:    { name: 'イノシシ', cr: 18, hr: 29, hp: 11, wander: 55, chase: 118, charge: 480, sight: 440, windup: 0.8,  damage: 14, score: 50 },
    bear:    { name: 'クマ',     cr: 25, hr: 40, hp: 24, wander: 46, chase: 98,  sight: 390, windup: 0.6,  damage: 20, reach: 92, score: 80 },
    gorilla: { name: 'ゴリラ',   cr: 23, hr: 36, hp: 17, wander: 52, chase: 112, sight: 450, windup: 0.9,  damage: 16, shock: 112, punch: 12, leap: 0.55, score: 80 },
  },
  director: { start: 3, max: 9, every: 35 }, // 敵の数: 最初 3 匹、35秒ごとに +1、最大 9
};

// ゲーム全体の状態を入れる入れ物(main.js で初期化する)
const G = {};
