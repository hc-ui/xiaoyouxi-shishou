const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadConfig() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'config.js'), 'utf8');
  const ctx = { Math, console };
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  return ctx;
}

test('easy difficulty keeps opening-grace tunables', () => {
  const ctx = loadConfig();
  const preset = ctx.applyDifficulty('easy');
  const balance = vm.runInContext('BALANCE', ctx);
  assert.equal(preset.label, '休闲');
  assert.equal(vm.runInContext('GAME_DIFFICULTY', ctx), 'easy');
  assert.ok(balance.botOpenWindow > 0);
  assert.ok(balance.botPlayerGrace > 0);
  assert.ok(balance.spawnMinBotDist > 0);
  assert.ok(balance.spawnMinPlayerDist > 900);
});

test('normal difficulty does not enable casual opening window', () => {
  const ctx = loadConfig();
  ctx.applyDifficulty('normal');
  const balance = vm.runInContext('BALANCE', ctx);
  assert.equal(vm.runInContext('GAME_DIFFICULTY', ctx), 'normal');
  assert.equal(balance.botOpenWindow, 0);
  assert.equal(balance.botPlayerGrace, 0);
  assert.equal(balance.spawnMinBotDist, 0);
});

test('rosterLabel counts player plus bots', () => {
  const ctx = loadConfig();
  assert.equal(ctx.rosterLabel(16), '16 人机（共17人）');
});
