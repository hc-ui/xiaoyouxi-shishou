/** 地图：建筑、道路、树木、池塘、物资 */

const BUILDING_PALETTES = [
  { wall: '#c4b7a6', roof: '#8b5a3c', trim: '#6b4423', window: '#7ec8e3' },
  { wall: '#d8d2c4', roof: '#5c6b5a', trim: '#3d4a3c', window: '#9ad0e8' },
  { wall: '#b8a090', roof: '#6e3b3b', trim: '#4a2828', window: '#a8d4e8' },
  { wall: '#a8b0a0', roof: '#4a5560', trim: '#2f363d', window: '#8ec5d8' },
  { wall: '#cfc6b8', roof: '#9a6b3f', trim: '#6d4a2b', window: '#7eb8d0' },
];

function createWorld() {
  const buildings = createBuildings();
  const roads = createRoads(buildings);
  const ponds = createPonds(buildings);
  const trees = createTrees(buildings, ponds);
  const rocks = createRocks(buildings, ponds);
  const loot = createLoot(buildings);
  return { buildings, roads, ponds, trees, rocks, loot };
}

function createBuildings() {
  const buildings = [];
  // 几个预设小镇簇 + 随机散布
  const clusters = [
    { x: 420, y: 480 },
    { x: 1500, y: 520 },
    { x: 480, y: 1450 },
    { x: 1480, y: 1420 },
    { x: 1000, y: 1000 },
  ];

  for (const c of clusters) {
    const n = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      tryAddBuilding(buildings, c.x + randRange(-120, 120), c.y + randRange(-100, 100));
    }
  }

  for (let i = 0; i < 22; i++) {
    tryAddBuilding(
      buildings,
      randRange(100, WORLD.size - 200),
      randRange(100, WORLD.size - 200)
    );
  }
  return buildings;
}

function tryAddBuilding(buildings, x, y) {
  const w = randRange(70, 150);
  const h = randRange(60, 130);
  if (Math.hypot(x + w / 2 - WORLD.size / 2, y + h / 2 - WORLD.size / 2) < 160) return false;
  for (const b of buildings) {
    if (x < b.x + b.w + 36 && x + w + 36 > b.x && y < b.y + b.h + 36 && y + h + 36 > b.y) {
      return false;
    }
  }
  const pal = BUILDING_PALETTES[Math.floor(Math.random() * BUILDING_PALETTES.length)];
  buildings.push({
    x, y, w, h,
    wall: pal.wall,
    roof: pal.roof,
    trim: pal.trim,
    window: pal.window,
    // 兼容旧字段
    color: pal.wall,
    doorSide: Math.floor(Math.random() * 4),
    style: Math.random() < 0.3 ? 'warehouse' : 'house',
  });
  return true;
}

function createRoads(buildings) {
  // 十字主干道 + 几条斜路
  const roads = [
    { x1: 80, y1: WORLD.size / 2, x2: WORLD.size - 80, y2: WORLD.size / 2, w: 42 },
    { x1: WORLD.size / 2, y1: 80, x2: WORLD.size / 2, y2: WORLD.size - 80, w: 42 },
    { x1: 200, y1: 350, x2: 1700, y2: 500, w: 28 },
    { x1: 300, y1: 1600, x2: 1650, y2: 1400, w: 28 },
    { x1: 250, y1: 900, x2: 800, y2: 400, w: 24 },
  ];
  // 连接部分建筑的小径
  for (let i = 0; i < Math.min(8, buildings.length); i++) {
    const b = buildings[i];
    roads.push({
      x1: b.x + b.w / 2,
      y1: b.y + b.h / 2,
      x2: WORLD.size / 2 + randRange(-80, 80),
      y2: WORLD.size / 2 + randRange(-80, 80),
      w: 16,
    });
  }
  return roads;
}

function createPonds(buildings) {
  const ponds = [];
  for (let i = 0; i < 6; i++) {
    const r = randRange(45, 90);
    const x = randRange(150, WORLD.size - 150);
    const y = randRange(150, WORLD.size - 150);
    let bad = false;
    for (const b of buildings) {
      if (x + r > b.x - 20 && x - r < b.x + b.w + 20 && y + r > b.y - 20 && y - r < b.y + b.h + 20) {
        bad = true;
        break;
      }
    }
    if (!bad) ponds.push({ x, y, rx: r, ry: r * randRange(0.65, 0.95) });
  }
  return ponds;
}

function createTrees(buildings, ponds) {
  const trees = [];
  // 移动端 / 低性能少画树
  const isMobile = typeof window !== 'undefined' && (window.innerWidth < 900 || /Mobile|Android/i.test(navigator.userAgent || ''));
  const treeCount = isMobile ? 90 : 150;
  for (let i = 0; i < treeCount; i++) {
    const x = randRange(40, WORLD.size - 40);
    const y = randRange(40, WORLD.size - 40);
    if (nearBuilding(x, y, buildings, 18)) continue;
    if (nearPond(x, y, ponds, 10)) continue;
    // 路边少一点
    if (Math.abs(x - WORLD.size / 2) < 30 || Math.abs(y - WORLD.size / 2) < 30) {
      if (Math.random() < 0.7) continue;
    }
    trees.push({
      x, y,
      r: randRange(14, 26),
      trunk: randRange(3, 5),
      hue: randRange(95, 140),
      type: Math.random() < 0.2 ? 'pine' : 'round',
    });
  }
  return trees;
}

function createRocks(buildings, ponds) {
  const rocks = [];
  for (let i = 0; i < 50; i++) {
    const x = randRange(50, WORLD.size - 50);
    const y = randRange(50, WORLD.size - 50);
    if (nearBuilding(x, y, buildings, 10)) continue;
    if (nearPond(x, y, ponds, 8)) continue;
    rocks.push({
      x, y,
      r: randRange(6, 14),
      shade: randRange(0.35, 0.55),
    });
  }
  return rocks;
}

function nearBuilding(x, y, buildings, pad) {
  for (const b of buildings) {
    if (x > b.x - pad && x < b.x + b.w + pad && y > b.y - pad && y < b.y + b.h + pad) return true;
  }
  return false;
}

function nearPond(x, y, ponds, pad) {
  for (const p of ponds) {
    const dx = (x - p.x) / (p.rx + pad);
    const dy = (y - p.y) / (p.ry + pad);
    if (dx * dx + dy * dy < 1) return true;
  }
  return false;
}

function createLoot(buildings) {
  const loot = [];
  for (const b of buildings) {
    const n = 2 + Math.floor(Math.random() * 2); // 建筑旁更多物资
    for (let i = 0; i < n; i++) {
      const side = Math.floor(Math.random() * 4);
      let x, y;
      if (side === 0) { x = b.x + randRange(10, b.w - 10); y = b.y - 20; }
      else if (side === 1) { x = b.x + b.w + 20; y = b.y + randRange(10, b.h - 10); }
      else if (side === 2) { x = b.x + randRange(10, b.w - 10); y = b.y + b.h + 20; }
      else { x = b.x - 20; y = b.y + randRange(10, b.h - 10); }
      loot.push(makeLootItem(x, y));
    }
  }
  // 野外
  for (let i = 0; i < 55; i++) {
    loot.push(makeLootItem(randRange(50, WORLD.size - 50), randRange(50, WORLD.size - 50)));
  }
  // 出生点附近保底物资
  const cx = WORLD.size / 2;
  const cy = WORLD.size / 2;
  // 出生点只有少量保底，不再白给套装
  loot.push(makeLootItem(cx + 55, cy + 30, 'weapon', 'pistol'));
  loot.push(makeLootItem(cx - 40, cy + 45, 'ammo', null, 20));
  if (Math.random() < 0.45) loot.push(makeLootItem(cx + 25, cy - 50, 'medkit', null, 1));
  // 地图上固定刷新几把狙击（稀有）
  const sniperSpots = [
    [320, 360], [1680, 380], [350, 1620], [1650, 1580], [1000, 280], [1000, 1720],
  ];
  for (let i = 0; i < sniperSpots.length; i++) {
    if (Math.random() < 0.72) {
      loot.push(makeLootItem(sniperSpots[i][0], sniperSpots[i][1], 'weapon', 'sniper'));
    }
  }
  for (let i = 0; i < loot.length; i++) {
    const dummy = { x: loot[i].x, y: loot[i].y, r: 12 };
    resolveCircleBuilding(dummy, buildings);
    loot[i].x = dummy.x;
    loot[i].y = dummy.y;
  }
  return loot;
}

function weaponLabel(id) {
  const map = {
    pistol: '手枪', smg: '冲锋枪', rifle: '步枪',
    shotgun: '霰弹枪', sniper: '狙击枪',
  };
  return map[id] || '武器';
}

function weaponColor(id) {
  const map = {
    pistol: '#f4d35e', smg: '#4cc9f0', rifle: '#3ddc97',
    shotgun: '#ff8fab', sniper: '#c084fc',
  };
  return map[id] || '#f4d35e';
}

function makeLootItem(x, y, forceKind, forceWeapon, forceAmount) {
  if (forceKind) {
    const labels = { weapon: '武器', ammo: '弹药', medkit: '医疗包', armor: '护甲' };
    const colors = { weapon: '#f4d35e', ammo: '#ffc857', medkit: '#3ddc97', armor: '#3a86ff' };
    const isW = forceKind === 'weapon';
    return {
      id: Math.random().toString(36).slice(2),
      x: x, y: y, r: 11,
      kind: forceKind,
      weaponId: forceWeapon || null,
      amount: forceAmount || 1,
      label: isW ? weaponLabel(forceWeapon) : (labels[forceKind] || '物资'),
      color: isW ? weaponColor(forceWeapon) : (colors[forceKind] || '#fff'),
      taken: false,
    };
  }
  const t = pickLootType();
  return {
    id: Math.random().toString(36).slice(2),
    x, y,
    r: 11,
    kind: t.kind,
    weaponId: t.weaponId || null,
    amount: t.amount || 1,
    label: t.label,
    color: t.color,
    taken: false,
  };
}

function resolveCircleBuilding(entity, buildings) {
  if (!entity || !buildings) return;
  const r = entity.r || 14;
  for (let pass = 0; pass < 3; pass++) {
    let moved = false;
    for (let i = 0; i < buildings.length; i++) {
      const b = buildings[i];
      const nearestX = Math.max(b.x, Math.min(entity.x, b.x + b.w));
      const nearestY = Math.max(b.y, Math.min(entity.y, b.y + b.h));
      const dx = entity.x - nearestX;
      const dy = entity.y - nearestY;
      const d = Math.hypot(dx, dy);
      if (d < r) {
        moved = true;
        if (d < 1e-8) {
          const left = entity.x - b.x;
          const right = b.x + b.w - entity.x;
          const top = entity.y - b.y;
          const bottom = b.y + b.h - entity.y;
          const m = Math.min(left, right, top, bottom);
          if (m === left) entity.x = b.x - r - 0.5;
          else if (m === right) entity.x = b.x + b.w + r + 0.5;
          else if (m === top) entity.y = b.y - r - 0.5;
          else entity.y = b.y + b.h + r + 0.5;
        } else {
          const push = (r - d) / d;
          entity.x += dx * push;
          entity.y += dy * push;
        }
      }
    }
    entity.x = Math.max(r, Math.min(WORLD.size - r, entity.x));
    entity.y = Math.max(r, Math.min(WORLD.size - r, entity.y));
    if (!moved) break;
  }
}

function circleHitsBuilding(entity, buildings) {
  if (!entity || !buildings) return false;
  const r = entity.r || 14;
  for (let i = 0; i < buildings.length; i++) {
    const b = buildings[i];
    const nearestX = Math.max(b.x, Math.min(entity.x, b.x + b.w));
    const nearestY = Math.max(b.y, Math.min(entity.y, b.y + b.h));
    if (Math.hypot(entity.x - nearestX, entity.y - nearestY) < r - 0.05) return true;
  }
  return false;
}

function resolveLivingOverlaps(entities) {
  if (!entities) return;
  for (let i = 0; i < entities.length; i++) {
    const a = entities[i];
    if (!a || !a.alive) continue;
    for (let j = i + 1; j < entities.length; j++) {
      const b = entities[j];
      if (!b || !b.alive) continue;
      let dx = a.x - b.x;
      let dy = a.y - b.y;
      let d = Math.hypot(dx, dy);
      const minD = (a.r || 14) + (b.r || 14);
      if (d < 1e-6) {
        dx = 1;
        dy = 0;
        d = 1;
      }
      if (d < minD) {
        const push = (minD - d) / 2;
        const nx = dx / d;
        const ny = dy / d;
        a.x += nx * push;
        a.y += ny * push;
        b.x -= nx * push;
        b.y -= ny * push;
      }
    }
  }
}

function lineHitsBuilding(x1, y1, x2, y2, buildings) {
  for (const b of buildings) {
    if (segmentRect(x1, y1, x2, y2, b.x, b.y, b.w, b.h)) return true;
  }
  return false;
}

function segmentRect(x1, y1, x2, y2, rx, ry, rw, rh) {
  const minX = Math.min(x1, x2);
  const maxX = Math.max(x1, x2);
  const minY = Math.min(y1, y2);
  const maxY = Math.max(y1, y2);
  if (maxX < rx || minX > rx + rw || maxY < ry || minY > ry + rh) return false;
  if (pointInRect(x1, y1, rx, ry, rw, rh) || pointInRect(x2, y2, rx, ry, rw, rh)) return true;
  const edges = [
    [rx, ry, rx + rw, ry],
    [rx + rw, ry, rx + rw, ry + rh],
    [rx + rw, ry + rh, rx, ry + rh],
    [rx, ry + rh, rx, ry],
  ];
  for (const e of edges) {
    if (segmentsIntersect(x1, y1, x2, y2, e[0], e[1], e[2], e[3])) return true;
  }
  return false;
}

function pointInRect(x, y, rx, ry, rw, rh) {
  return x >= rx && x <= rx + rw && y >= ry && y <= ry + rh;
}

function segmentsIntersect(x1, y1, x2, y2, x3, y3, x4, y4) {
  const d = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (Math.abs(d) < 1e-9) return false;
  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / d;
  const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / d;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}
