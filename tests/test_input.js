const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

test('paused matches still record held movement keys', () => {
  const src = fs.readFileSync(path.join(root, 'js', 'main.js'), 'utf8');
  assert.match(src, /if \(game\.paused\) \{/);
  assert.match(src, /game\.keys\.add\(e\.code\)/);
  assert.doesNotMatch(
    src,
    /if \(!game \|\| game\.paused\) return;\s*game\.onKeyDown/
  );
});

test('match request paints overlay before constructing Game', () => {
  const src = fs.readFileSync(path.join(root, 'js', 'main.js'), 'utf8');
  assert.match(src, /function requestMatch\(/);
  assert.match(src, /match-overlay/);
  assert.match(src, /matchLock/);
  assert.ok(src.indexOf('function requestMatch') < src.indexOf("bind('btn-start'"));
  assert.match(src, /bind\('btn-start', 'click', requestMatch\)/);
  assert.match(src, /updateHud\(\);/);
});

test('pointer release is handled on pointerup as well as mouseup', () => {
  const src = fs.readFileSync(path.join(root, 'js', 'main.js'), 'utf8');
  assert.match(src, /function releasePointerButton/);
  assert.match(src, /addEventListener\('pointerup'/);
  assert.match(src, /pointer\.right = false/);
});

test('html template includes the matchmaking overlay', () => {
  const src = fs.readFileSync(path.join(root, '_build_single.js'), 'utf8');
  assert.match(src, /id="match-overlay"/);
  assert.match(src, /正在匹配/);
});
