/** 休闲开局：人机不远距离点名玩家，且前几秒以搜刮为主（标准/困难不改）。 */
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

  function openFightRange() {
    return (BALANCE && BALANCE.botOpenFightRange) || 0;
  }

  function inOpenWindow() {
    var w = openWindow();
    return w > 0 && matchTime() < w;
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

  if (typeof applyDamage === 'function') {
    var origApplyDamage = applyDamage;
    applyDamage = function (entity, dmg, attacker) {
      if (entity && entity.isPlayer && attacker && !attacker.isPlayer) {
        if (!botMayHarmPlayer(attacker, entity)) return false;
      }
      return origApplyDamage(entity, dmg, attacker);
    };
  }

  if (typeof fireWeapon === 'function') {
    var origFireWeapon = fireWeapon;
    fireWeapon = function (entity, now, aimAngle, buildings, others, bullets, sparks) {
      if (entity && !entity.isPlayer && others && others.length) {
        others = others.filter(function (o) {
          if (!o || !o.isPlayer) return true;
          return botMayHarmPlayer(entity, o);
        });
      }
      return origFireWeapon(entity, now, aimAngle, buildings, others, bullets, sparks);
    };
  }

  if (typeof maybeBotShoot === 'function') {
    var origMaybeBotShoot = maybeBotShoot;
    maybeBotShoot = function (bot, now, game) {
      if (game) _ogGame = game;
      if (bot && bot.target && bot.target.isPlayer && !botMayHarmPlayer(bot, bot.target)) return;
      if (inOpenWindow() && bot && bot.target && !bot.target.isPlayer) {
        var fightR = openFightRange() || 165;
        if (dist(bot, bot.target) > fightR) return;
      }
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
      var attempts = GAME_DIFFICULTY === 'easy' ? 10 : 1;
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
      if (GAME_DIFFICULTY === 'easy' && best) {
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

      var opening = inOpenWindow();
      var cap = playerEngageCap();
      var fightR = openFightRange() || 165;

      if (opening) {
        if (bot.target && bot.target.isPlayer) preferLoot(bot);
        else if (bot.state === 'hunt') preferLoot(bot);
        else if (bot.state === 'fight' && bot.target && dist(bot, bot.target) > fightR) preferLoot(bot);
      }

      origUpdateBot(bot, dt, now, game);

      if (!bot.alive) return;

      if (bot.target && bot.target.isPlayer && !botMayHarmPlayer(bot, bot.target)) {
        preferLoot(bot);
      } else if (cap > 0 && bot.target && bot.target.isPlayer && dist(bot, bot.target) > cap) {
        preferLoot(bot);
      }

      if (opening) {
        if (bot.target && bot.target.isPlayer) preferLoot(bot);
        else if (bot.state === 'hunt') preferLoot(bot);
        else if (bot.state === 'fight' && bot.target && !bot.target.isPlayer && dist(bot, bot.target) > fightR) {
          preferLoot(bot);
        }
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
