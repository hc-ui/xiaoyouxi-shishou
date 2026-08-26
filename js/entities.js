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
      return x > b.x - 20 && x < b.x + b.w + 20 && y > b.y - 20 && y < b.y + b.h + 20;
    }) ||
      (playerPos && dist({ x: x, y: y }, playerPos) < safeDist) ||
      (botDist > 0 && othersList.some(function (o) {
        return dist({ x: x, y: y }, o) < botDist;
      })))
  );
  if (typeof resolveCircleBuilding === 'function') {
    const placed = { x: x, y: y, r: 14 };
    resolveCircleBuilding(placed, buildings);
    x = placed.x;
    y = placed.y;
  }

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

function getActiveWeapon(entity) {
  return entity.weapons[entity.weaponIndex] || WEAPONS.fists;
}

function ensureMag(entity, weapon) {
  if (entity.mag[weapon.id] === undefined) {
    entity.mag[weapon.id] = weapon.magSize === Infinity ? Infinity : weapon.magSize;
  }
}

function tryReload(entity, now) {
  const w = getActiveWeapon(entity);
  if (w.isMelee || entity.reloading) return false;
  ensureMag(entity, w);
  if (entity.mag[w.id] >= w.magSize) return false;
  if (entity.reserveAmmo <= 0) return false;
  entity.reloading = true;
  entity.reloadEnd = now + w.reload;
  if (entity.isPlayer && typeof SFX !== 'undefined') SFX.reload();
  return true;
}

function finishReload(entity) {
  const w = getActiveWeapon(entity);
  if (w.isMelee) {
    entity.reloading = false;
    return;
  }
  ensureMag(entity, w);
  const need = w.magSize - entity.mag[w.id];
  const take = Math.min(need, entity.reserveAmmo);
  entity.mag[w.id] += take;
  entity.reserveAmmo -= take;
  entity.reloading = false;
}

function equipWeapon(entity, weaponId) {
  const w = cloneWeapon(WEAPONS[weaponId]);
  if (!w) return;
  let slot = entity.weapons.findIndex(function (wp, i) {
    return i > 0 && !wp;
  });
  if (slot === -1) {
    const same = entity.weapons.findIndex(function (wp) {
      return wp && wp.id === weaponId;
    });
    if (same >= 0) {
      ensureMag(entity, w);
      entity.mag[weaponId] = Math.min(w.magSize, (entity.mag[weaponId] || 0) + Math.floor(w.magSize / 2));
      entity.weaponIndex = same;
      return;
    }
    slot = entity.weaponIndex === 0 ? 1 : entity.weaponIndex;
  }
  entity.weapons[slot] = w;
  entity.weaponIndex = slot;
  ensureMag(entity, w);
  if (entity.mag[w.id] === 0 || entity.mag[w.id] === undefined) {
    entity.mag[w.id] = Math.min(w.magSize, 14);
  }
}

function applyDamage(entity, dmg, attacker) {
  if (!entity.alive || entity.invuln > 0) return false;
  if (attacker && !attacker.isPlayer) dmg *= BALANCE.botDamageMul;
  let remain = dmg;
  if (entity.armor > 0) {
    const absorbed = Math.min(entity.armor, remain * 0.72);
    entity.armor -= absorbed;
    remain -= absorbed;
  }
  entity.hp -= remain;
  entity.lastHurt = 0.35;
  if (entity.isPlayer && remain > 0 && attacker && typeof SFX !== 'undefined') SFX.hurt();
  if (attacker && attacker.isPlayer && remain > 0 && typeof SFX !== 'undefined') SFX.hit();
  if (entity.hp <= 0) {
    entity.hp = 0;
    entity.alive = false;
    if (attacker && attacker.alive) attacker.kills += 1;
    if (attacker && attacker.isPlayer && typeof SFX !== 'undefined') SFX.kill();
    return true;
  }
  return false;
}

function useMedkit(entity) {
  if (!entity.alive || entity.medkits <= 0 || entity.hp >= entity.maxHp) return false;
  entity.medkits -= 1;
  entity.hp = Math.min(entity.maxHp, entity.hp + 65);
  if (entity.isPlayer && typeof SFX !== 'undefined') SFX.medkit();
  return true;
}

function moveEntity(entity, dx, dy, dt, buildings, sprint, speedFactor) {
  if (!entity.alive) return false;
  const len = Math.hypot(dx, dy);
  if (len > 0) {
    dx /= len;
    dy /= len;
    const analog = speedFactor == null ? 1 : clamp(speedFactor, 0, 1);
    const spd = entity.speed * (sprint ? entity.sprintMul : 1) * analog;
    entity.x += dx * spd * dt;
    entity.y += dy * spd * dt;
    resolveCircleBuilding(entity, buildings);
    return true;
  }
  resolveCircleBuilding(entity, buildings);
  return false;
}

function canSee(from, to, buildings) {
  return !lineHitsBuilding(from.x, from.y, to.x, to.y, buildings);
}

function canWeaponScope(w) {
  return !!(w && w.canScope);
}

function fireWeapon(entity, now, aimAngle, buildings, others, bullets, sparks) {
  if (!entity.alive || entity.reloading) return null;
  const w = getActiveWeapon(entity);
  if (now - entity.lastShot < w.fireRate) return null;
  ensureMag(entity, w);

  if (!w.isMelee && entity.mag[w.id] <= 0) {
    tryReload(entity, now);
    return null;
  }

  entity.lastShot = now;
  if (!w.isMelee) entity.mag[w.id] -= 1;

  const isSniper = w.id === 'sniper';
  const scoped = !!(entity.scoping && canWeaponScope(w));
  if (entity.isPlayer && typeof SFX !== 'undefined') {
    if (isSniper) SFX.sniper();
    else SFX.shoot(!w.isMelee && w.id === 'shotgun');
  }

  const mx = entity.x + Math.cos(aimAngle) * (entity.r + 18);
  const my = entity.y + Math.sin(aimAngle) * (entity.r + 18);
  sparks.push({
    x: mx, y: my,
    life: isSniper ? 0.1 : 0.06,
    color: isSniper ? '#e9d5ff' : '#ffe8a0',
    r: isSniper ? 9 : 6,
  });

  const pellets = w.pellets || 1;
  let lastResult = null;

  let baseSpread = w.spread;
  if (scoped && w.scopeSpread != null) baseSpread = w.scopeSpread;
  else if (canWeaponScope(w) && !scoped) baseSpread = w.spread * 1.15;

  for (let i = 0; i < pellets; i++) {
    let extraSpread = entity.isPlayer ? 0 : 0.04;
    if (entity.isPlayer && scoped) extraSpread = 0;
    const spread = (Math.random() - 0.5) * (baseSpread + extraSpread) * 2;
    const ang = aimAngle + spread;

    if (w.isMelee) {
      for (let oi = 0; oi < others.length; oi++) {
        const o = others[oi];
        if (!o.alive || o === entity) continue;
        if (dist(entity, o) <= w.range + o.r) {
          const a = angleTo(entity, o);
          let diff = Math.abs(a - aimAngle);
          while (diff > Math.PI) diff = Math.abs(diff - Math.PI * 2);
          if (diff < 0.75) {
            const killed = applyDamage(o, w.damage, entity);
            sparks.push({ x: o.x, y: o.y, life: 0.22, color: '#fff', r: 5 });
            lastResult = { hit: o, killed: killed };
            return lastResult;
          }
        }
      }
      return null;
    }

    const reach = w.range;
    const ex = entity.x + Math.cos(ang) * reach;
    const ey = entity.y + Math.sin(ang) * reach;
    const steps = 30;
    let hitEntity = null;
    let hitX = ex;
    let hitY = ey;
    let maxT = 1;

    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      const px = entity.x + (ex - entity.x) * t;
      const py = entity.y + (ey - entity.y) * t;
      if (lineHitsBuilding(entity.x, entity.y, px, py, buildings)) {
        hitX = px;
        hitY = py;
        maxT = t;
        break;
      }
      for (let oi = 0; oi < others.length; oi++) {
        const o = others[oi];
        if (!o.alive || o === entity) continue;
        if (Math.hypot(px - o.x, py - o.y) <= o.r + 5) {
          hitEntity = o;
          hitX = px;
          hitY = py;
          maxT = t;
          break;
        }
      }
      if (hitEntity) break;
    }

    bullets.push({
      x1: entity.x + Math.cos(ang) * (entity.r + 6),
      y1: entity.y + Math.sin(ang) * (entity.r + 6),
      x2: hitX,
      y2: hitY,
      life: 0.09,
      color: w.color,
      owner: entity.id,
    });

    if (hitEntity) {
      const falloff = clamp(1.15 - maxT * 0.35, 0.55, 1);
      const killed = applyDamage(hitEntity, w.damage * falloff, entity);
      sparks.push({ x: hitX, y: hitY, life: 0.2, color: '#ffb070', r: 4 });
      lastResult = { hit: hitEntity, killed: killed };
    } else {
      sparks.push({ x: hitX, y: hitY, life: 0.1, color: '#bbb', r: 2 });
    }
  }

  if (!w.isMelee && entity.mag[w.id] <= 0 && entity.reserveAmmo > 0) {
    tryReload(entity, now);
  }
  return lastResult;
}

function updateBot(bot, dt, now, game) {
  if (!bot.alive) return;
  bot.stateTimer -= dt;
  if (bot.invuln > 0) bot.invuln -= dt;
  if (bot.lastHurt > 0) bot.lastHurt -= dt;

  if (bot.reloading && now >= bot.reloadEnd) finishReload(bot);

  if (game.zone.isOutside(bot)) {
    bot.state = 'zone';
    bot.target = null;
  }

  if (bot.hp < 45 && bot.medkits > 0 && Math.random() < 0.04) useMedkit(bot);

  const enemies = game.aliveEntities().filter(function (e) {
    return e !== bot && e.alive;
  });
  let nearestEnemy = null;
  let nearestDist = Infinity;
  let playerEnemy = null;
  let playerDist = Infinity;
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    const d = dist(bot, e);
    if (e.isPlayer) {
      playerEnemy = e;
      playerDist = d;
    }
    if (isPlayerProtected(e, game)) continue;
    if (d < nearestDist) {
      nearestDist = d;
      nearestEnemy = e;
    }
  }

  if (bot.target && isPlayerProtected(bot.target, game)) {
    bot.target = null;
    if (bot.state === 'hunt' || bot.state === 'fight') {
      bot.state = 'loot';
      bot.stateTimer = 1.2;
    }
  }

  const playerHuntable = playerEnemy && !isPlayerProtected(playerEnemy, game);
  const huntMul = bot.aggression || 0.7;
  if (
    playerHuntable &&
    playerDist < 520 * huntMul + (BALANCE.botEngageBonus || 80) &&
    bot.state !== 'zone' &&
    Math.random() < (BALANCE.botHuntChance || 0.5) * 0.08
  ) {
    bot.state = 'hunt';
    bot.target = playerEnemy;
  }

  const w = getActiveWeapon(bot);
  const engageRange = (w.isMelee ? 70 : w.range * 0.72) + (BALANCE.botEngageBonus || 80);

  if (bot.state !== 'zone' && nearestEnemy && nearestDist < engageRange + 80) {
    const see = canSee(bot, nearestEnemy, game.buildings);
    if ((see || nearestDist < 140) && Math.random() < bot.reaction) {
      bot.state = 'fight';
      bot.target = nearestEnemy;
    }
  }

  if (bot.lastHurt > 0.2 && nearestEnemy && nearestDist < engageRange + 120) {
    bot.state = 'fight';
    bot.target = nearestEnemy;
  }

  if (bot.state === 'zone') {
    const ang = angleTo(bot, { x: game.zone.cx, y: game.zone.cy });
    moveEntity(bot, Math.cos(ang), Math.sin(ang), dt, game.buildings, true);
    bot.angle = ang;
    if (nearestEnemy && nearestDist < engageRange * 0.9 && canSee(bot, nearestEnemy, game.buildings)) {
      bot.angle = angleTo(bot, nearestEnemy) + bot.aimJitter * 0.5;
      maybeBotShoot(bot, now, game);
    }
    if (!game.zone.isOutside(bot)) {
      bot.state = Math.random() < 0.5 ? 'hunt' : 'loot';
      bot.stateTimer = 1.2;
    }
    return;
  }

  if (bot.state === 'hunt') {
    const prey = (bot.target && bot.target.alive && !isPlayerProtected(bot.target, game))
      ? bot.target
      : (playerHuntable ? playerEnemy : nearestEnemy);
    if (!prey) {
      bot.state = 'loot';
      bot.stateTimer = 1;
    } else {
      bot.target = prey;
      const d = dist(bot, prey);
      bot.angle = angleTo(bot, prey) + bot.aimJitter * (0.8 - bot.accuracy * 0.5);
      if (d > 60) {
        moveEntity(bot, Math.cos(bot.angle), Math.sin(bot.angle), dt, game.buildings, d > 180);
      }
      if (d < engageRange + 40 && (canSee(bot, prey, game.buildings) || d < 100)) {
        bot.state = 'fight';
      }
      if (bot.stateTimer <= 0 && d > 600) {
        bot.state = 'loot';
        bot.stateTimer = 2;
      }
    }
  }

  if (bot.state === 'fight' && bot.target && bot.target.alive) {
    const d = dist(bot, bot.target);
    const jitterScale = d < 160 ? 0.35 : 0.9;
    bot.angle = angleTo(bot, bot.target) + bot.aimJitter * (1.05 - bot.accuracy) * jitterScale;

    if (bot.hp < 18 && d < 160 && Math.random() < 0.4) {
      const flee = angleTo(bot.target, bot);
      moveEntity(bot, Math.cos(flee), Math.sin(flee), dt, game.buildings, true);
      bot.angle = flee;
    } else if (d > engageRange * 0.55) {
      moveEntity(bot, Math.cos(bot.angle), Math.sin(bot.angle), dt, game.buildings, d > 200);
    } else if (d < 70 && !w.isMelee && w.id !== 'shotgun') {
      moveEntity(bot, -Math.cos(bot.angle), -Math.sin(bot.angle), dt, game.buildings, false);
    } else {
      const side = Math.cos(bot.angle + Math.PI / 2) * (Math.sin(now / 280) > 0 ? 1 : -1);
      const sidY = Math.sin(bot.angle + Math.PI / 2) * (Math.sin(now / 280) > 0 ? 1 : -1);
      moveEntity(bot, side * 0.7 + Math.cos(bot.angle) * 0.3, sidY * 0.7 + Math.sin(bot.angle) * 0.3, dt, game.buildings, false);
    }

    if (d < engageRange + 30 && (canSee(bot, bot.target, game.buildings) || d < 90)) {
      maybeBotShoot(bot, now, game);
    }

    if (d > engageRange + 280 || !bot.target.alive) {
      bot.state = Math.random() < (BALANCE.botHuntChance || 0.5) ? 'hunt' : 'loot';
      bot.target = bot.target && bot.target.alive ? bot.target : null;
      bot.stateTimer = 1.2;
    }
    return;
  }

  if (bot.stateTimer <= 0) {
    const late = game.zone && game.zone.phase >= 1;
    if (late && nearestEnemy && nearestDist < 480 && Math.random() < 0.55) {
      bot.state = 'hunt';
      bot.target = nearestEnemy;
      bot.stateTimer = 3;
    } else {
      let best = null;
      let bestD = 300;
      for (let i = 0; i < game.loot.length; i++) {
        const item = game.loot[i];
        if (item.taken) continue;
        const prefer = item.kind === 'weapon' ? 0.65 : 1;
        const d = dist(bot, item) * prefer;
        if (d < bestD) {
          bestD = d;
          best = item;
        }
      }
      const armed = getActiveWeapon(bot) && !getActiveWeapon(bot).isMelee;
      if (best && (!armed || Math.random() < 0.55)) {
        bot.target = best;
        bot.state = 'loot';
        bot.stateTimer = 4;
      } else if (playerHuntable && Math.random() < (BALANCE.botHuntChance || 0.5)) {
        bot.state = 'hunt';
        bot.target = playerEnemy;
        bot.stateTimer = 4;
      } else {
        bot.wanderAngle += randRange(-0.7, 0.7);
        bot.state = 'wander';
        bot.stateTimer = randRange(1.2, 2.8);
        bot.target = null;
      }
    }
  }

  if (bot.state === 'loot' && bot.target && bot.target.taken === false) {
    const ang = angleTo(bot, bot.target);
    const dLoot = dist(bot, bot.target);
    bot.angle = ang;
    moveEntity(bot, Math.cos(ang), Math.sin(ang), dt, game.buildings, dLoot > 90);
    if (dLoot < 28) {
      pickupLoot(bot, bot.target, true);
      bot.target = null;
      bot.stateTimer = 0.15;
      if (Math.random() < 0.6) {
        bot.state = 'hunt';
        bot.stateTimer = 2;
      }
    }
  } else if (bot.state === 'wander' || (bot.state !== 'hunt' && bot.state !== 'fight' && bot.state !== 'loot')) {
    moveEntity(bot, Math.cos(bot.wanderAngle), Math.sin(bot.wanderAngle), dt, game.buildings, Math.random() < 0.3);
    bot.angle = bot.wanderAngle;
    if (bot.x < 40 || bot.x > WORLD.size - 40 || bot.y < 40 || bot.y > WORLD.size - 40) {
      bot.wanderAngle += Math.PI + randRange(-0.5, 0.5);
    }
  } else if (bot.state === 'loot' && (!bot.target || bot.target.taken)) {
    bot.stateTimer = 0;
  }
}

function maybeBotShoot(bot, now, game) {
  if (bot.target && isPlayerProtected(bot.target, game)) return;
  const w = getActiveWeapon(bot);
  ensureMag(bot, w);
  if (!w.isMelee && bot.mag[w.id] <= 0) {
    tryReload(bot, now);
    return;
  }
  if (Math.random() > Math.min(0.98, bot.accuracy * BALANCE.botShootChance * 1.15)) return;
  let ang = bot.angle;
  if (bot.target && bot.target.alive) {
    ang = angleTo(bot, bot.target) + bot.aimJitter * (1 - bot.accuracy) * 0.6;
  }
  const result = fireWeapon(
    bot,
    now,
    ang,
    game.buildings,
    game.aliveEntities(),
    game.bullets,
    game.sparks
  );
  if (result && result.killed) game.addKillFeed(bot.name, result.hit.name);
}

function pickupLoot(entity, item, silent) {
  if (item.taken) return false;
  item.taken = true;
  if (item.kind === 'weapon') equipWeapon(entity, item.weaponId);
  else if (item.kind === 'ammo') entity.reserveAmmo += item.amount;
  else if (item.kind === 'medkit') entity.medkits += item.amount;
  else if (item.kind === 'armor') entity.armor = Math.min(entity.maxArmor, entity.armor + item.amount);
  if (entity.isPlayer && !silent && typeof SFX !== 'undefined') SFX.pickup();
  return true;
}

function autoPickupNear(entity, lootList) {
  if (!entity.alive) return;
  for (let i = 0; i < lootList.length; i++) {
    const item = lootList[i];
    if (item.taken) continue;
    if (item.kind === 'weapon') continue;
    if (dist(entity, item) <= BALANCE.autoPickupR) {
      pickupLoot(entity, item, false);
    }
  }
}

function applyAimAssist(player, angle, others, buildings) {
  const assist = player.scoping ? (BALANCE.scopeAimAssist || 0.2) : BALANCE.aimAssist;
  if (!assist) return angle;
  let best = null;
  let bestScore = player.scoping ? 0.35 : 0.55;
  const maxD = player.scoping ? 900 : 420;
  for (let i = 0; i < others.length; i++) {
    const o = others[i];
    if (!o.alive || o === player) continue;
    const d = dist(player, o);
    if (d > maxD || d < 20) continue;
    if (!canSee(player, o, buildings)) continue;
    const a = angleTo(player, o);
    let diff = Math.abs(a - angle);
    while (diff > Math.PI) diff = Math.abs(diff - Math.PI * 2);
    if (diff < bestScore) {
      bestScore = diff;
      best = a;
    }
  }
  if (best == null) return angle;
  return lerpAngle(angle, best, assist);
}

function resetNameIndex() {
  nameIndex = 0;
}
