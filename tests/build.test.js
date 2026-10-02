'use strict';
/* node tests/build.test.js — 単体HTMLのまとめ方(ビルド)が壊れていないか確かめる */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { build } = require('../scripts/build.js');

let failed = false;
function test(name, fn) {
  try { fn(); console.log('  ok  ' + name); } catch (e) { failed = true; console.error('  NG  ' + name + '\n      ' + e.message); }
}

const standalone = build();
const artifact = build({ artifact: true });
const inlineScripts = (h) => [...h.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);

test('単体HTML: 外部ファイルを読み込まない(相対パスの script / stylesheet がない)', () => {
  assert.ok(!/<script[^>]+src=/.test(standalone), '<script src> が残っている');
  assert.ok(!/<link[^>]+rel="stylesheet"/.test(standalone), '<link stylesheet> が残っている');
});

test('単体HTML: ゲームに必要な要素が入っている', () => {
  for (const id of ['game', 'hud', 'minimap', 'btnStart', 'result', 'stickL', 'stickR', 'touchHints']) assert.ok(standalone.includes(`id="${id}"`), id);
  assert.ok(standalone.includes('<meta name="viewport"'));
});

test('単体HTML: 中のスクリプトが構文として正しい', () => {
  const scripts = inlineScripts(standalone);
  assert.strictEqual(scripts.length, 1);
  new vm.Script(scripts[0]); // 構文エラーなら例外
  for (const f of ['util', 'config', 'world', 'art', 'audio', 'input', 'entities', 'render', 'main']) assert.ok(scripts[0].includes(`---- js/${f}.js ----`), f);
});

test('公開ページ用: <html>/<head>/<body> を含まず、先頭に title とスタイルがある', () => {
  assert.ok(!/<!doctype|<html|<head|<body/i.test(artifact));
  assert.ok(/^<title>[^<]+<\/title>/.test(artifact));
  assert.ok(artifact.includes('<style>'));
  const scripts = inlineScripts(artifact);
  assert.strictEqual(scripts.length, 1);
  new vm.Script(scripts[0]);
});

test('公開ページ用: 外部ホストを読み込まない(CSP で止められる)', () => {
  assert.ok(!/(src|href)="https?:/.test(artifact));
  assert.ok(!/style="/.test(artifact), 'インライン style 属性は CSP で止まる場合がある');
});

test('コミットされている index.html が最新のソースから作ったものと同じ', () => {
  const committed = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.strictEqual(committed, standalone, 'src/ を変えたら node scripts/build.js を実行してください');
});

if (failed) process.exit(1);
console.log('\nビルドのテスト 通過');
