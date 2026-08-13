/** 游戏常量与武器 — 休闲有开局保护，标准/困难保持强度 */

const WORLD = {
  size: 2000,
  botCount: 14,
};

/** 难度：easy | normal | hard —— 默认标准 */
let GAME_DIFFICULTY = 'normal';

const DIFFICULTY_PRESETS = {
  easy: {
    botCount: 12,
    botDamageMul: 0.72,
    botAccuracyMin: 0.38,
    botAccuracyMax: 0.58,
    botShootChance: 0.42,
    botEngageBonus: 28,
    botHp: 90,
    botArmedChance: 0.55,
    botHuntChance: 0.14,
    playerHp: 110,
    playerStartArmor: 25,
    playerStartMedkits: 1,
    playerStartAmmo: 50,
    playerInvuln: 6.0, // baseline 5.0
    spawnMinPlayerDist: 1020, // baseline 560; beyond sniper 900, map 2000
    spawnMinBotDist: 400, // baseline 280
    botPlayerGrace: 9.5, // baseline 6.5
    botPlayerEngageCap: 430, // bots only shoot/hunt player at on-screen-ish range
    botOpenWindow: 14, // opening loot/wander; reduced bot-bot fights
    botOpenFightRange: 165,
    aimAssist: 0.1,
    zoneScale: 1.0, // 毒圈节奏倍率（越小越紧）
    label: '休闲',
  },
  normal: {
    botCount: 16,
    botDamageMul: 0.95,
    botAccuracyMin: 0.5,
    botAccuracyMax: 0.72,
    botShootChance: 0.78,
    botEngageBonus: 100,
    botHp: 100,
    botArmedChance: 0.72,
    botHuntChance: 0.55,
    playerHp: 100,
    playerStartArmor: 0,
    playerStartMedkits: 0,
    playerStartAmmo: 24,
    playerInvuln: 0.6,
    spawnMinPlayerDist: 240,
    spawnMinBotDist: 0,
    botPlayerGrace: 0,
    aimAssist: 0.06,
    zoneScale: 0.85,
    label: '标准',
  },
  hard: {
    botCount: 22,
    botDamageMul: 1.2,
    botAccuracyMin: 0.62,
    botAccuracyMax: 0.88,
    botShootChance: 0.9,
    botEngageBonus: 140,
    botHp: 115,
    botArmedChance: 0.88,
    botHuntChance: 0.75,
    playerHp: 90,
    playerStartArmor: 0,
    playerStartMedkits: 0,
    playerStartAmmo: 12,
    playerInvuln: 0.3,
    spawnMinPlayerDist: 180,
    spawnMinBotDist: 0,
    botPlayerGrace: 0,
    aimAssist: 0.03,
    zoneScale: 0.7,
    label: '困难',
  },
};

function applyDifficulty(level) {
  const p = DIFFICULTY_PRESETS[level] || DIFFICULTY_PRESETS.normal;
  GAME_DIFFICULTY = level;
  WORLD.botCount = p.botCount;
  BALANCE.botDamageMul = p.botDamageMul;
  BALANCE.botAccuracyMin = p.botAccuracyMin;
  BALANCE.botAccuracyMax = p.botAccuracyMax;
  BALANCE.botShootChance = p.botShootChance;
  BALANCE.botEngageBonus = p.botEngageBonus;
  BALANCE.botHp = p.botHp;
  BALANCE.botArmedChance = p.botArmedChance;
  BALANCE.botHuntChance = p.botHuntChance;
  BALANCE.playerHp = p.playerHp;
  BALANCE.playerStartArmor = p.playerStartArmor;
  BALANCE.playerStartMedkits = p.playerStartMedkits;
  BALANCE.playerStartAmmo = p.playerStartAmmo;
  BALANCE.playerInvuln = p.playerInvuln;
  BALANCE.spawnMinPlayerDist = p.spawnMinPlayerDist != null ? p.spawnMinPlayerDist : 240;
  BALANCE.spawnMinBotDist = p.spawnMinBotDist || 0;
  BALANCE.botPlayerGrace = p.botPlayerGrace || 0;
  BALANCE.botPlayerEngageCap = p.botPlayerEngageCap || 0;
  BALANCE.botOpenWindow = p.botOpenWindow || 0;
  BALANCE.botOpenFightRange = p.botOpenFightRange || 0;
  BALANCE.aimAssist = p.aimAssist;
  BALANCE.scopeAimAssist = Math.max(0.08, p.aimAssist + 0.08);
  BALANCE.zoneScale = p.zoneScale;
  return p;
}

const WEAPONS = {
  fists: {
    id: 'fists', name: '拳头', damage: 14, range: 44, fireRate: 300,
    spread: 0.08, magSize: Infinity, reload: 0, bulletSpeed: 0,
    color: '#ccc', isMelee: true,
  },
  pistol: {
    id: 'pistol', name: '手枪', damage: 24, range: 340, fireRate: 250,
    spread: 0.04, magSize: 12, reload: 1100, bulletSpeed: 900,
    color: '#f4d35e', isMelee: false,
  },
  smg: {
    id: 'smg', name: '冲锋枪', damage: 15, range: 400, fireRate: 85,
    spread: 0.085, magSize: 30, reload: 1500, bulletSpeed: 950,
    color: '#4cc9f0', isMelee: false,
  },
  rifle: {
    id: 'rifle', name: '步枪', damage: 30, range: 560, fireRate: 150,
    spread: 0.03, magSize: 30, reload: 1800, bulletSpeed: 1100,
    color: '#3ddc97', isMelee: false,
  },
  shotgun: {
    id: 'shotgun', name: '霰弹枪', damage: 13, range: 200, fireRate: 650,
    spread: 0.2, magSize: 6, reload: 2000, bulletSpeed: 800,
    pellets: 6, color: '#ff8fab', isMelee: false,
  },
  sniper: {
    id: 'sniper', name: '狙击枪', damage: 72, range: 900, fireRate: 1200,
    spread: 0.16,
    scopeSpread: 0.008,
    magSize: 5, reload: 2800, bulletSpeed: 1400,
    color: '#c084fc', isMelee: false,
    canScope: true,
    scopeZoom: 2.35,
    scopeMoveMul: 0.5,
  },
};

const LOOT_TYPES = [
  { kind: 'weapon', weaponId: 'pistol', label: '手枪', color: '#f4d35e', weight: 2.6 },
  { kind: 'weapon', weaponId: 'smg', label: '冲锋枪', color: '#4cc9f0', weight: 2.0 },
  { kind: 'weapon', weaponId: 'rifle', label: '步枪', color: '#3ddc97', weight: 1.4 },
  { kind: 'weapon', weaponId: 'shotgun', label: '霰弹枪', color: '#ff8fab', weight: 1.6 },
  { kind: 'weapon', weaponId: 'sniper', label: '狙击枪', color: '#c084fc', weight: 0.7 },
  { kind: 'ammo', amount: 30, label: '弹药', color: '#ffc857', weight: 4.0 },
  { kind: 'medkit', amount: 1, label: '医疗包', color: '#3ddc97', weight: 2.4 },
  { kind: 'armor', amount: 40, label: '护甲', color: '#3a86ff', weight: 2.2 },
];

const BOT_NAMES = [
  'Shadow', 'Viper', 'Nova', 'Rex', 'Kite',
  'Blaze', 'Frost', 'Echo', 'Raven', 'Drift',
  'Pulse', 'Ghost', 'Hawk', 'Bolt', 'Ash',
  'Zero', 'Luna', 'Ace', 'Jade', 'Orion',
  'Spectre', 'Wolf', 'Fang', 'Storm', 'Reaper',
];

const BALANCE = {
  botDamageMul: 0.95,
  botAccuracyMin: 0.5,
  botAccuracyMax: 0.72,
  botEngageBonus: 100,
  botShootChance: 0.78,
  botHp: 100,
  botArmedChance: 0.72,
  botHuntChance: 0.55,
  playerStartArmor: 0,
  playerStartMedkits: 0,
  playerStartAmmo: 24,
  playerHp: 100,
  playerInvuln: 0.6,
  spawnMinPlayerDist: 240,
  spawnMinBotDist: 0,
  botPlayerGrace: 0,
  botPlayerEngageCap: 0,
  botOpenWindow: 0,
  botOpenFightRange: 0,
  autoPickupR: 28,
  aimAssist: 0.06,
  lookAhead: 0.16,
  scopeAimAssist: 0.14,
  zoneScale: 0.85,
};


function rosterLabel(botCount) {
  const n = botCount != null ? botCount : WORLD.botCount;
  return n + ' 人机（共' + (n + 1) + '人）';
}

function pickLootType() {
  const total = LOOT_TYPES.reduce(function (s, t) { return s + t.weight; }, 0);
  let r = Math.random() * total;
  for (let i = 0; i < LOOT_TYPES.length; i++) {
    r -= LOOT_TYPES[i].weight;
    if (r <= 0) return LOOT_TYPES[i];
  }
  return LOOT_TYPES[0];
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function dist(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

function angleTo(from, to) {
  return Math.atan2(to.y - from.y, to.x - from.x);
}

function lerpAngle(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

function randRange(min, max) {
  return min + Math.random() * (max - min);
}

function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return m + ':' + String(s).padStart(2, '0');
}

function cloneWeapon(w) {
  const c = {};
  for (const k in w) c[k] = w[k];
  return c;
}

function hash2(x, y) {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}
