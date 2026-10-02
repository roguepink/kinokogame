'use strict';
/* 開発用のソース(src/)を、1ファイルで動く HTML にまとめる。
     node scripts/build.js                      → ./index.html            (ダブルクリック・プレビュー・配布用)
     node scripts/build.js --artifact out.html  → out.html               (claude.ai に公開するページ用。<html>/<head>/<body> を含まない)
   画像や外部ファイルを使っていないので、まとめるだけで済む。 */

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const src = path.join(root, 'src');

function build(opts) {
  const html = fs.readFileSync(path.join(src, 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(src, 'style.css'), 'utf8');
  const scriptRe = /<script src="([^"]+)"><\/script>\s*/g;
  const files = [];
  html.replace(scriptRe, (m, f) => { files.push(f); return m; });
  if (!files.length) throw new Error('src/index.html に <script src> がありません');
  const js = files.map((f) => `/* ---- ${f} ---- */\n` + fs.readFileSync(path.join(src, f), 'utf8')).join('\n');
  // インラインにしたとき HTML として壊れる並びがないか
  if (/<\/script/i.test(js) || /<!--/.test(js)) throw new Error('JS の中に "</script" か "<!--" が含まれています');

  if (opts && opts.artifact) {
    const title = (html.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || 'どくキノコ大作戦';
    const body = html.match(/<body>([\s\S]*)<\/body>/)[1].replace(scriptRe, '').trim();
    return `<title>${title}</title>\n<style>\n/* 昼の森で固定したデザイン(ダークモード版は作っていない) */\n${css}</style>\n${body}\n<script>\n${js}\n</script>\n`;
  }
  const header = '<!-- このファイルは scripts/build.js が src/ から作ります。直接は編集しないでください。 -->\n';
  return html
    .replace('<!doctype html>\n', '<!doctype html>\n' + header)
    .replace('<link rel="stylesheet" href="style.css">', `<style>\n${css}</style>`)
    .replace(scriptRe, '')
    .replace('</body>', `<script>\n${js}\n</script>\n</body>`);
}

module.exports = { build };

if (require.main === module) {
  const i = process.argv.indexOf('--artifact');
  if (i >= 0) {
    const out = process.argv[i + 1];
    if (!out) { console.error('出力先を指定してください: --artifact out.html'); process.exit(1); }
    fs.writeFileSync(out, build({ artifact: true }));
    console.log('wrote ' + out + ' (' + Math.round(fs.statSync(out).size / 1024) + ' KB, 公開ページ用)');
  } else {
    const out = path.join(root, 'index.html');
    fs.writeFileSync(out, build());
    console.log('wrote index.html (' + Math.round(fs.statSync(out).size / 1024) + ' KB)');
  }
}
