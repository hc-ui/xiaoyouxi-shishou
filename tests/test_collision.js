const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadWorld() {
  const root = path.join(__dirname, '..');
  const ctx = { Math, console };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(root, 'js/config.js'), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(root, 'js/world.js'), 'utf8'), ctx);
  return ctx;
}

function overlaps(entity, building) {
  const nx = Math.max(building.x, Math.min(entity.x, building.x + building.w));
  const ny = Math.max(building.y, Math.min(entity.y, building.y + building.h));
  return Math.hypot(entity.x - nx, entity.y - ny) < entity.r - 0.05;
}

test('entity fully inside a building is pushed to the nearest outside edge', () => {
  const ctx = loadWorld();
  const building = { x: 200, y: 200, w: 120, h: 80 };
  const entity = { x: 310, y: 240, r: 14 };
  ctx.resolveCircleBuilding(entity, [building]);
  assert.equal(ctx.circleHitsBuilding(entity, [building]), false);
  assert.ok(entity.x >= building.x + building.w, 'should exit through the nearer right wall');
});

test('corner of two buildings does not stay overlapping after multi-pass resolve', () => {
  const ctx = loadWorld();
  const buildings = [
    { x: 400, y: 400, w: 80, h: 80 },
    { x: 516, y: 400, w: 80, h: 80 },
  ];
  const entity = { x: 470, y: 440, r: 14 };
  ctx.resolveCircleBuilding(entity, buildings);
  assert.equal(overlaps(entity, buildings[0]), false);
  assert.equal(overlaps(entity, buildings[1]), false);
  assert.equal(ctx.circleHitsBuilding(entity, buildings), false);
});

test('stacked living entities are separated', () => {
  const ctx = loadWorld();
  const a = { x: 100, y: 100, r: 14, alive: true };
  const b = { x: 102, y: 100, r: 14, alive: true };
  ctx.resolveLivingOverlaps([a, b]);
  assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= 27.9);
});

test('loot spawned inside a building is pushed out', () => {
  const ctx = loadWorld();
  const buildings = [{ x: 300, y: 300, w: 100, h: 90 }];
  const loot = ctx.makeLootItem(340, 340, 'ammo', null, 20);
  const dummy = { x: loot.x, y: loot.y, r: 12 };
  ctx.resolveCircleBuilding(dummy, buildings);
  assert.equal(ctx.circleHitsBuilding(dummy, buildings), false);
});
