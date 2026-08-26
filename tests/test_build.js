const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');

test('build script lists opening_grace after game modules', () => {
  const src = fs.readFileSync(path.join(root, '_build_single.js'), 'utf8');
  const start = src.indexOf('const jsOrder = [');
  assert.ok(start >= 0, 'jsOrder list missing');
  const chunk = src.slice(start, src.indexOf('];', start));
  assert.match(chunk, /opening_grace\.js/);
  assert.ok(chunk.indexOf('game.js') < chunk.indexOf('opening_grace.js'));
  assert.ok(chunk.indexOf('opening_grace.js') < chunk.indexOf('main.js'));
});

test('game reset passes existing bots into createBot', () => {
  const src = fs.readFileSync(path.join(root, 'js', 'game.js'), 'utf8');
  assert.match(src, /createBot\(this\.buildings, ppos, this\.bots\)/);
});

test('production bundle includes the casual opening-grace patch', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'xiaoyouxi-build-'));
  const copy = (rel) => {
    const dest = path.join(tmp, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(path.join(root, rel), dest);
  };
  copy('_build_single.js');
  copy('css/style.css');
  for (const name of fs.readdirSync(path.join(root, 'js'))) {
    copy(path.join('js', name));
  }
  const result = spawnSync(process.execPath, ['_build_single.js'], {
    cwd: tmp,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const html = fs.readFileSync(path.join(tmp, 'index.html'), 'utf8');
  assert.match(html, /openingGracePatch/);
  assert.match(html, /easyPeacefulStep/);
  assert.match(html, /botOpenWindow/);
  const dist = fs.readFileSync(path.join(tmp, 'dist', 'index.html'), 'utf8');
  assert.match(dist, /openingGracePatch/);
});
