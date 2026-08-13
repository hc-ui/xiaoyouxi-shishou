let nameIndex = 0;

function createPlayer(x, y) {
  const giveGun = BALANCE.playerStartAmmo > 0;
  const pistol = giveGun ? cloneWeapon(WEAPONS.pistol) : null;
  const weapons = [cloneWeapon(WEAPONS.fists), pistol, null, null];
  const mag = { fists: Infinity };
  if (pistol) mag.pistol = Math.min(pistol.magSize, 8);
  return {
    id: 'player',
    name: '你',
    x: x,
    y: y,
    r: 14,
    angle: 0,
    hp: BALANCE.playerHp,
    maxHp: BALANCE.playerHp,
    armor: BALANCE.playerStartArmor,
    maxArmor: 100,
    speed: 175,
    sprintMul: 1.48,
    alive: true,
    isPlayer: true,
    weapons: weapons,
    weaponIndex: pistol ? 1 : 0,
    mag: mag,
    reserveAmmo: BALANCE.playerStartAmmo,
    medkits: BALANCE.playerStartMedkits,
    kills: 0,
    lastShot: 0,
    reloading: false,
    reloadEnd: 0,
    invuln: BALANCE.playerInvuln != null ? BALANCE.playerInvuln : 0.6,
    color: '#3ddc97',
    lastHurt: 0,
    footsteps: 0,
    scoping: false,
  };
}

function isPlayerProtected(entity, game) {
  if (!entity || !entity.isPlayer) return false;
  if (entity.invuln > 0) return true;
  const grace = BALANCE.botPlayerGrace || 0;
  return !!(grace > 0 && game && game.time < grace);
}

function createBot(buildings, playerPos, others) {
  let x;
  let y;
  let tries = 0;
  const safeDist = BALANCE.spawnMinPlayerDist != null
    ? BALANCE.spawnMinPlayerDist
    : (GAME_DIFFICULTY === 'hard' ? 180 : GAME_DIFFICULTY === 'normal' ? 220 : 560);
  const botDist = BALANCE.spawnMinBotDist || 0;
  const othersList = others || [];
  do {
    x = randRange(80, WORLD.size - 80);
    y = randRange(80, WORLD.size - 80);
    tries++;
  } while (
    tries < 90 &&
    (buildings.some(function (b) {
      return x > b.x - 20 && x < b.x + b.w + 20 && y > b.y - 20 && y < b.y + h + 20;
    }) ||
      (playerPos && dist({ x: x, y: y }, playerPos) < safeDist) ||
      (botDist > 0 && othersList.some(function (o) {
        return dist({ x: x, y: y }, o) < botDist;
      })))
  );

  const name = BOT_NAMES[nameIndex % BOT_NAMES.length];
  nameIndex++;

  const armed = Math.random() < (BALANCE.botArmedChance || 0.7);
  let starter;
  if (armed) {
    const roll = Math.random();
    let id = 'pistol';
    if (roll < 0.28) id = 'smg';
    else if (roll < 0.48) id = 'shotgun';
    else if (roll < 0.68) id = 'rifle';
    else if (roll < 0.78) id = 'sniper';
    starter = cloneWeapon(WEAPONS[id]);
  } else {
    starter = cloneWeapon(WEAPONS.fists);
  }

  const mag = {};
  mag[starter.id] = starter.magSize === Infinity ? Infinity : starter.magSize;
  const hp = BALANCE.botHp || 100;

  return {
    id: 'bot-' + nameIndex,
    name: name,
    x: x,
    y: y,
    r: 14,
    angle: Math.random() * Math.PI * 2,
    hp: hp,
    maxHp: hp,
    armor: Math.random() < 0.35 ? randRange(20, 50) : (Math.random() < 0.2 ? 15 : 0),
    maxArmor: 100,
    speed: randRange(145, 175),
    sprintMul: 1.38,
    alive: true,
    isPlayer: false,
    weapons: [starter, null, null, null],
    weaponIndex: 0,
    mag: mag,
    reserveAmmo: 18 + Math.floor(Math.random() * 40),
    medkits: Math.random() < 0.35 ? 1 : 0,
    kills: 0,
    lastShot: 0,
    reloading: false,
    reloadEnd: 0,
    invuln: 0,
    color: 'hsl(' + Math.floor(Math.random() * 360) + ', 42%, 48%)',
    state: Math.random() < (BALANCE.botHuntChance || 0.5) ? 'hunt' : 'loot',
    target: null,
    wanderAngle: Math.random() * Math.PI * 2,
    stateTimer: randRange(0.5, 2),
    aimJitter: randRange(-0.1, 0.1),
    accuracy: randRange(BALANCE.botAccuracyMin, BALANCE.botAccuracyMax),
    reaction: randRange(0.55, 0.95),
    lastHurt: 0,
    aggression: randRange(0.55, 1),
  };
}
