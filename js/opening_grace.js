/** 休闲开局：跳过 origUpdateBot 的 hunt/fight，人机只搜刮/游荡（标准/困难不改）。 */
(function openingGracePatch() {
  var _ogGame = null;

  function matchTime() {
    return _ogGame && typeof _ogGame.time === 'number' ? _ogGame.time : 0;
  }

  function playerEngageCap() {
    return (BALANCE && BALANCE.botPlayerEngageCap) || 0;
  }

  function openWindow() {
    return (BALANCE && BALANCE.botOpenWindow) || 0;
  }

  function inOpenWindow() {
    var w = openWindow();
    return w > 0 && matchTime() < w;
  }

  function isEasy() {
    return typeof GAME_DIFFICULTY !== 'undefined' && GAME_DIFFICULTY === 'easy';
  }

  function botMayHarmPlayer(bot, player) {
    if (!bot || !player || !player.isPlayer) return true;
    if (typeof isPlayerProtected === 'function' && isPlayerProtected(player, _ogGame)) return false;
    var cap = playerEngageCap();
    if (cap > 0 && dist(bot, player) > cap) return false;
    return true;
  }

  function isCombatTarget(t) {
    return !!(t && t.alive && t.taken == null);
  }

  function preferLoot(bot) {
    if (isCombatTarget(bot.target)) bot.target = null;
    if (bot.state === 'hunt' || bot.state === 'fight') {
      bot.state = Math.random() < 0.6 ? 'loot' : 'wander';
      bot.stateTimer = randRange(1.2, 2.6);
    }
  }

  function keepAwayR() {
    return Math.max(playerEngageCap() + 90, 520);
  }

  function steerAwayFromPlayer(bot, player, dx, dy) {
    if (!player || !player.alive) return { dx: dx, dy: dy };
    var d = dist(bot, player);
    var r = keepAwayR();
    if (d >= r || d < 1) return { dx: dx, dy: dy };
    var push = (r - d) / r;
    return {
      dx: dx + (bot.x - player.x) * push * 2.4,
      dy: dy + (bot.y - player.y) * push * 2.4
    };
  }

  /** Opening easy bots: loot/wander only. Never hunt, fight, or close on the player. */
  function easyPeacefulStep(bot, dt, now, game) {
    if (!bot || !bot.alive) return;
    bot.stateTimer -= dt;
    if (bot.invuln > 0) bot.invuln -= dt;
    if (bot.lastHurt > 0) bot.lastHurt -= dt;
    if (bot.reloading && now >= bot.reloadEnd && typeof finishReload === 'function') finishReload(bot);
    if (bot.hp < 45 && bot.medkits > 0 && Math.random() < 0.04 && typeof useMedkit === 'function') useMedkit(bot);

    if (bot.state === 'hunt' || bot.state === 'fight') {
      bot.state = Math.random() < 0.65 ? 'loot' : 'wander';
      bot.stateTimer = randRange(1.2, 2.8);
    }
    if (bot.target && (bot.target.isPlayer || bot.target.alive)) bot.target = null;

    var buildings = game.buildings;
    var player = game.player;
    var rKeep = keepAwayR();

    if (game.zone && typeof game.zone.isOutside === 'function' && game.zone.isOutside(bot)) {
      bot.state = 'zone';
      bot.target = null;
      var angZ = angleTo(bot, { x: game.zone.cx, y: game.zone.cy });
      var stZ = steerAwayFromPlayer(bot, player, Math.cos(angZ), Math.sin(angZ));
      moveEntity(bot, stZ.dx, stZ.dy, dt, buildings, true);
      bot.angle = angZ;
      if (!game.zone.isOutside(bot)) {
        bot.state = 'loot';
        bot.stateTimer = 1.2;
      }
      return;
    }

    if (bot.stateTimer <= 0) {
      var best = null;
      var bestD = 380;
      if (game.loot) {
        for (var i = 0; i < game.loot.length; i++) {
          var item = game.loot[i];
          if (!item || item.taken) continue;
          if (player && player.alive && dist(item, player) < rKeep) continue;
          var prefer = item.kind === 'weapon' ? 0.65 : 1;
          var dItem = dist(bot, item) * prefer;
          if (dItem < bestD) {
            bestD = dItem;
            best = item;
          }
        }
      }
      if (best) {
        bot.target = best;
        bot.state = 'loot';
        bot.stateTimer = 4;
      } else {
        bot.wanderAngle = (bot.wanderAngle || 0) + randRange(-0.7, 0.7);
        bot.state = 'wander';
        bot.stateTimer = randRange(1.2, 2.8);
        bot.target = null;
      }
    }

    if (bot.state === 'loot' && bot.target && bot.target.taken === false) {
      var ang = angleTo(bot, bot.target);
      var dLoot = dist(bot, bot.target);
      bot.angle = ang;
      var tooClose = player && player.alive && dist(bot, player) < rKeep * 0.85;
      if (tooClose) {
        bot.target = null;
        bot.state = 'wander';
        bot.wanderAngle = angleTo(player, bot) + randRange(-0.4, 0.4);
        bot.stateTimer = randRange(1.0, 2.0);
        var stF = steerAwayFromPlayer(bot, player, Math.cos(bot.wanderAngle), Math.sin(bot.wanderAngle));
        moveEntity(bot, stF.dx, stF.dy, dt, buildings, true);
      } else {
        var stL = steerAwayFromPlayer(bot, player, Math.cos(ang), Math.sin(ang));
        moveEntity(bot, stL.dx, stL.dy, dt, buildings, dLoot > 90);
        if (dLoot < 28 && typeof pickupLoot === 'function') {
          pickupLoot(bot, bot.target, true);
          bot.target = null;
          bot.stateTimer = 0.2;
          bot.state = 'wander';
        }
      }
    } else {
      if (bot.state === 'loot' && (!bot.target || bot.target.taken)) bot.stateTimer = 0;
      var wa = bot.wanderAngle || 0;
      var stW = steerAwayFromPlayer(bot, player, Math.cos(wa), Math.sin(wa));
      moveEntity(bot, stW.dx, stW.dy, dt, buildings, Math.random() < 0.3);
      bot.angle = Math.atan2(stW.dy, stW.dx);
      bot.state = bot.state === 'zone' ? 'zone' : 'wander';
      if (typeof WORLD !== 'undefined' && (bot.x < 40 || bot.x > WORLD.size - 40 || bot.y < 40 || bot.y > WORLD.size - 40)) {
        bot.wanderAngle = (bot.wanderAngle || 0) + Math.PI + randRange(-0.5, 0.5);
      }
    }
  }

  function shouldSkipOrigHunt(bot, game) {
    if (!isEasy()) return false;
    if (inOpenWindow()) return true;
    var p = game && game.player;
    if (p && p.alive && p.isPlayer && !botMayHarmPlayer(bot, p)) {
      if (bot.target && bot.target.isPlayer) return true;
      if (bot.state === 'hunt' || bot.state === 'fight') return true;
    }
    return false;
  }

  if (typeof applyDamage === 'function') {
    var origApplyDamage = applyDamage;
    applyDamage = function (entity, dmg, attacker) {
      if (inOpenWindow() && attacker && !attacker.isPlayer && entity && !entity.isPlayer) return false;
      if (entity && entity.isPlayer && attacker && !attacker.isPlayer) {
        if (!botMayHarmPlayer(attacker, entity)) return false;
      }
      return origApplyDamage(entity, dmg, attacker);
    };
  }

  if (typeof fireWeapon === 'function') {
    var origFireWeapon = fireWeapon;
    fireWeapon = function (entity, now, aimAngle, buildings, others, bullets, sparks) {
      if (entity && !entity.isPlayer) {
        if (inOpenWindow()) others = [];
        else if (others && others.length) {
          others = others.filter(function (o) {
            if (!o || !o.isPlayer) return true;
            return botMayHarmPlayer(entity, o);
          });
        }
      }
      return origFireWeapon(entity, now, aimAngle, buildings, others, bullets, sparks);
    };
  }

  if (typeof maybeBotShoot === 'function') {
    var origMaybeBotShoot = maybeBotShoot;
    maybeBotShoot = function (bot, now, game) {
      if (game) _ogGame = game;
      if (inOpenWindow()) return;
      if (bot && bot.target && bot.target.isPlayer && !botMayHarmPlayer(bot, bot.target)) return;
      return origMaybeBotShoot(bot, now, game);
    };
  }

  if (typeof createBot === 'function') {
    var origCreateBot = createBot;
    createBot = function (buildings, playerPos, others) {
      var minP = (BALANCE && BALANCE.spawnMinPlayerDist) || 0;
      var minB = (BALANCE && BALANCE.spawnMinBotDist) || 0;
      var startIdx = typeof nameIndex === 'number' ? nameIndex : 0;
      var best = null;
      var bestScore = -1;
      var attempts = isEasy() ? 10 : 1;
      for (var k = 0; k < attempts; k++) {
        if (typeof nameIndex === 'number') nameIndex = startIdx;
        var bot = origCreateBot(buildings, playerPos, others);
        var score = playerPos ? dist(bot, playerPos) : 0;
        var ok = true;
        if (playerPos && minP && score < minP) ok = false;
        if (minB && others && others.some(function (o) { return dist(bot, o) < minB; })) ok = false;
        if (ok) {
          best = bot;
          break;
        }
        if (score > bestScore) {
          bestScore = score;
          best = bot;
        }
      }
      if (typeof nameIndex === 'number') nameIndex = startIdx + 1;
      if (!best) best = origCreateBot(buildings, playerPos, others);
      if (isEasy() && best) {
        best.state = Math.random() < 0.7 ? 'loot' : 'wander';
        best.target = null;
        best.stateTimer = randRange(1.8, 4.2);
        var w = typeof getActiveWeapon === 'function' ? getActiveWeapon(best) : null;
        if (w && w.id === 'sniper' && typeof cloneWeapon === 'function' && WEAPONS && WEAPONS.rifle) {
          var rifle = cloneWeapon(WEAPONS.rifle);
          best.weapons[0] = rifle;
          best.weaponIndex = 0;
          best.mag[rifle.id] = rifle.magSize;
        }
      }
      return best;
    };
  }

  if (typeof updateBot === 'function') {
    var origUpdateBot = updateBot;
    updateBot = function (bot, dt, now, game) {
      if (game) _ogGame = game;
      if (!bot || !bot.alive) return origUpdateBot(bot, dt, now, game);

      if (shouldSkipOrigHunt(bot, game)) {
        easyPeacefulStep(bot, dt, now, game);
        return;
      }

      origUpdateBot(bot, dt, now, game);

      if (!bot.alive) return;
      if (bot.target && bot.target.isPlayer && !botMayHarmPlayer(bot, bot.target)) {
        preferLoot(bot);
      }
    };
  }

  if (typeof Game !== 'undefined' && Game.prototype && Game.prototype.update) {
    var origUpdate = Game.prototype.update;
    Game.prototype.update = function () {
      _ogGame = this;
      return origUpdate.apply(this, arguments);
    };
  }
})();
