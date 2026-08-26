class Game {
  constructor() {
    this.reset();
  }

  reset() {
    resetNameIndex();
    const world = createWorld();
    this.buildings = world.buildings;
    this.roads = world.roads;
    this.ponds = world.ponds;
    this.trees = world.trees;
    this.rocks = world.rocks;
    this.loot = world.loot;
    this.zone = new Zone();
    this.player = createPlayer(WORLD.size / 2 + randOffset(), WORLD.size / 2 + randOffset());
    if (typeof resolveCircleBuilding === 'function') {
      resolveCircleBuilding(this.player, this.buildings);
    }
    this.bots = [];
    const ppos = { x: this.player.x, y: this.player.y };
    for (let i = 0; i < WORLD.botCount; i++) {
      this.bots.push(createBot(this.buildings, ppos, this.bots));
    }
    this.bullets = [];
    this.sparks = [];
    this.dust = [];
    this.killFeed = [];
    this.time = 0;
    this.now = 0;
    this.running = true;
    this.paused = false;
    this.ended = false;
    this.result = null;
    this.rank = WORLD.botCount + 1;
    this.keys = new Set();
    this.mouse = { x: 0, y: 0, down: false, right: false, worldX: 0, worldY: 0 };
    this.camera = { x: this.player.x, y: this.player.y };
    this.nearLoot = null;
    this.shake = 0;
    this.ambientT = 0;
    this.hitFlash = 0;
    this.hitMarker = 0;
    this.killMarker = 0;
    this.zoneArrow = { active: false, ang: 0, dist: 0 };
    this.mobileMove = { x: 0, y: 0, sprint: false };
    this.viewZoom = 1; // 当前镜头倍率（平滑插值）
    this.targetZoom = 1;
    this.wasScoping = false;
    this.scopeFocusX = this.player.x;
    this.scopeFocusY = this.player.y;
  }

  aliveEntities() {
    const list = [];
    if (this.player.alive) list.push(this.player);
    for (let i = 0; i < this.bots.length; i++) {
      if (this.bots[i].alive) list.push(this.bots[i]);
    }
    return list;
  }

  aliveCount() {
    return this.aliveEntities().length;
  }

  addKillFeed(killer, victim) {
    this.killFeed.unshift({ text: killer + ' 淘汰了 ' + victim, life: 4.5 });
    if (this.killFeed.length > 6) this.killFeed.pop();
  }

  update(dt) {
    if (!this.running || this.paused || this.ended) return;

    this.time += dt;
    this.now = this.time * 1000;
    this.ambientT += dt;
    if (this.hitFlash > 0) this.hitFlash -= dt;
    if (this.hitMarker > 0) this.hitMarker -= dt;
    if (this.killMarker > 0) this.killMarker -= dt;

    const p = this.player;
    if (p.invuln > 0) p.invuln -= dt;
    if (p.lastHurt > 0) {
      p.lastHurt -= dt;
      this.hitFlash = Math.max(this.hitFlash, p.lastHurt);
    }

    if (p.alive) {
      const wpn = getActiveWeapon(p);
      // 开镜：右键或 C，且当前武器支持开镜
      const holdScope = !!(this.mouse.right || this.keys.has('KeyC'));
      const wantScope = !!(holdScope && canWeaponScope(wpn) && !p.reloading);
      if (wantScope !== p.scoping) {
        p.scoping = wantScope;
        if (typeof SFX !== 'undefined') {
          if (wantScope) SFX.scopeIn();
          else SFX.scopeOut();
        }
      }
      if (!canWeaponScope(wpn)) p.scoping = false;

      this.targetZoom = p.scoping && wpn.scopeZoom ? wpn.scopeZoom : 1;
      this.viewZoom += (this.targetZoom - this.viewZoom) * Math.min(1, dt * 10);

      let dx = 0;
      let dy = 0;
      let keyboardMove = false;
      if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) dy -= 1;
      if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) dy += 1;
      if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) dx -= 1;
      if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) dx += 1;
      keyboardMove = dx !== 0 || dy !== 0;
      if (this.mobileMove) {
        dx += this.mobileMove.x || 0;
        dy += this.mobileMove.y || 0;
      }
      const moveStrength = keyboardMove
        ? 1
        : clamp(Math.hypot(
          this.mobileMove ? this.mobileMove.x || 0 : 0,
          this.mobileMove ? this.mobileMove.y || 0 : 0
        ), 0, 1);
      // 开镜时移速下降，且不能冲刺
      let sprint = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') ||
        !!(this.mobileMove && this.mobileMove.sprint);
      if (p.scoping) sprint = false;
      const speedMul = p.scoping ? (wpn.scopeMoveMul || 0.55) : 1;
      const oldSpeed = p.speed;
      p.speed = oldSpeed * speedMul;
      const moved = moveEntity(p, dx, dy, dt, this.buildings, sprint, moveStrength);
      p.speed = oldSpeed;

      if (moved) {
        p.footsteps += dt * (sprint ? 10 : 6);
        if (p.footsteps > 1) {
          p.footsteps = 0;
          this.dust.push({
            x: p.x + randRange(-4, 4),
            y: p.y + randRange(2, 6),
            life: 0.35,
            vx: randRange(-12, 12),
            vy: randRange(-8, -2),
            r: randRange(2, 5),
          });
        }
      }

      // —— 瞄准 ——
      // 开镜时准星固定在屏幕中心。若相机贴在角色身上，中心≈自己，会「瞄自己」。
      // 正确做法：相机放到角色「准星前方」，瞄准点=中心对应世界坐标（前方），再用鼠标微调。
      const zoom = this.viewZoom || 1;
      const halfW = (typeof window !== 'undefined' ? window.innerWidth : 800) / 2;
      const halfH = (typeof window !== 'undefined' ? window.innerHeight : 600) / 2;
      const mOffX = (this.mouse.x - halfW) / zoom;
      const mOffY = (this.mouse.y - halfH) / zoom;

      if (p.scoping) {
        // 开镜焦距：准星中心落在角色前方 focus 处
        const focus = 320;
        const fx = p.x + Math.cos(p.angle) * focus;
        const fy = p.y + Math.sin(p.angle) * focus;
        // 鼠标相对中心的偏移 → 微调瞄准点
        const aimX = fx + mOffX;
        const aimY = fy + mOffY;
        let aim = Math.atan2(aimY - p.y, aimX - p.x);
        // 防止瞄准点几乎压在自己身上（数值抖动）
        if (Math.hypot(aimX - p.x, aimY - p.y) < 40) {
          aim = p.angle;
        }
        aim = applyAimAssist(p, aim, this.aliveEntities(), this.buildings);
        p.angle = aim;
        this.mouse.worldX = aimX;
        this.mouse.worldY = aimY;
        // 相机看向准星焦点（下一帧 draw / sync 用）
        this.scopeFocusX = p.x + Math.cos(p.angle) * focus;
        this.scopeFocusY = p.y + Math.sin(p.angle) * focus;
      } else {
        // 腰射：准星跟鼠标，瞄向鼠标世界坐标
        const aimX = this.camera.x + mOffX;
        const aimY = this.camera.y + mOffY;
        this.mouse.worldX = aimX;
        this.mouse.worldY = aimY;
        let aim = Math.atan2(aimY - p.y, aimX - p.x);
        if (Math.hypot(aimX - p.x, aimY - p.y) > 8) {
          aim = applyAimAssist(p, aim, this.aliveEntities(), this.buildings);
          p.angle = aim;
        }
        this.scopeFocusX = p.x;
        this.scopeFocusY = p.y;
      }

      if (p.reloading && this.now >= p.reloadEnd) finishReload(p);
      // 换弹时关镜
      if (p.reloading) {
        p.scoping = false;
        this.targetZoom = 1;
      }

      if (this.mouse.down) {
        const result = fireWeapon(
          p, this.now, p.angle, this.buildings,
          this.aliveEntities(), this.bullets, this.sparks
        );
        if (result) {
          // 狙击后坐力更大
          const kick = getActiveWeapon(p).id === 'sniper' ? 5 : 1.8;
          this.shake = Math.min(10, this.shake + kick);
          this.hitMarker = 0.14;
          if (result.killed) {
            this.killMarker = 0.3;
            this.addKillFeed(p.name, result.hit.name);
          }
        }
      }

      autoPickupNear(p, this.loot);
    } else {
      p.scoping = false;
      this.targetZoom = 1;
      this.viewZoom += (1 - this.viewZoom) * Math.min(1, dt * 8);
    }

    for (let i = 0; i < this.bots.length; i++) {
      updateBot(this.bots[i], dt, this.now, this);
    }

    if (typeof resolveLivingOverlaps === 'function') {
      const living = this.aliveEntities();
      resolveLivingOverlaps(living);
      for (let i = 0; i < living.length; i++) {
        resolveCircleBuilding(living[i], this.buildings);
      }
    }

    this.zone.update(dt);
    const entities = this.aliveEntities();
    for (let i = 0; i < entities.length; i++) {
      const e = entities[i];
      if (this.zone.isOutside(e)) {
        const before = e.hp;
        const killed = applyDamage(e, this.zone.damage * dt, null);
        if (e.isPlayer && e.hp < before) this.hitFlash = 0.25;
        if (killed) this.addKillFeed('毒圈', e.name);
      }
    }

    // 毒圈方向提示
    if (p.alive && this.zone.isOutside(p)) {
      this.zoneArrow.active = true;
      this.zoneArrow.ang = angleTo(p, { x: this.zone.cx, y: this.zone.cy });
      this.zoneArrow.dist = dist(p, { x: this.zone.cx, y: this.zone.cy }) - this.zone.radius;
    } else {
      this.zoneArrow.active = false;
    }

    for (let i = 0; i < this.bullets.length; i++) this.bullets[i].life -= dt;
    this.bullets = this.bullets.filter(function (b) { return b.life > 0; });
    for (let i = 0; i < this.sparks.length; i++) this.sparks[i].life -= dt;
    this.sparks = this.sparks.filter(function (s) { return s.life > 0; });
    for (let i = 0; i < this.dust.length; i++) {
      const d = this.dust[i];
      d.life -= dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
    }
    this.dust = this.dust.filter(function (d) { return d.life > 0; });
    for (let i = 0; i < this.killFeed.length; i++) this.killFeed[i].life -= dt;
    this.killFeed = this.killFeed.filter(function (k) { return k.life > 0; });

    this.nearLoot = null;
    if (p.alive) {
      let best = null;
      let bestD = 42;
      for (let i = 0; i < this.loot.length; i++) {
        const item = this.loot[i];
        if (item.taken) continue;
        const d = dist(p, item);
        if (d < bestD) {
          bestD = d;
          best = item;
        }
      }
      this.nearLoot = best;
      // 靠近武器时按 F 或直接站上去 0.4s 也能捡——简化为 F；武器也可 F
    }

    // 镜头：腰射跟角色；开镜跟「准星前方焦点」，避免中心对准自己
    let targetX = this.camera.x;
    let targetY = this.camera.y;
    if (p.alive) {
      if (p.scoping) {
        targetX = this.scopeFocusX != null ? this.scopeFocusX : p.x + Math.cos(p.angle) * 320;
        targetY = this.scopeFocusY != null ? this.scopeFocusY : p.y + Math.sin(p.angle) * 320;
      } else {
        const look = BALANCE.lookAhead || 0;
        targetX = p.x + Math.cos(p.angle) * 90 * look;
        targetY = p.y + Math.sin(p.angle) * 90 * look;
      }
    }
    // 开镜几乎贴死焦点，保证「镜心 = 子弹方向」
    const camLerp = p.scoping ? Math.min(1, dt * 18) : Math.min(1, dt * 7);
    this.camera.x += (targetX - this.camera.x) * camLerp;
    this.camera.y += (targetY - this.camera.y) * camLerp;
    if (p.alive && p.scoping) {
      // 首帧/抖动时再贴一点，防止镜心还停在角色身上
      if (Math.hypot(this.camera.x - p.x, this.camera.y - p.y) < 80) {
        this.camera.x = targetX;
        this.camera.y = targetY;
      }
    }
    this.shake *= Math.pow(0.015, dt);

    this.checkEnd();
  }

  checkEnd() {
    if (this.ended) return;
    const alive = this.aliveCount();
    if (!this.player.alive) {
      this.ended = true;
      this.result = 'lose';
      this.rank = alive + 1;
      if (typeof SFX !== 'undefined') SFX.lose();
      return;
    }
    if (alive === 1 && this.player.alive) {
      this.ended = true;
      this.result = 'win';
      this.rank = 1;
      if (typeof SFX !== 'undefined') SFX.win();
    }
  }

  onKeyDown(code) {
    this.keys.add(code);
    if (this.ended || this.paused) return;
    if (code === 'KeyR' && this.player.alive) tryReload(this.player, this.now);
    if (code === 'KeyF' && this.player.alive && this.nearLoot) {
      pickupLoot(this.player, this.nearLoot);
      this.nearLoot = null;
    }
    if ((code === 'KeyQ' || code === 'KeyE') && this.player.alive) useMedkit(this.player);
    if (code === 'Digit1') { this.player.weaponIndex = 0; this.player.scoping = false; }
    if (code === 'Digit2' && this.player.weapons[1]) { this.player.weaponIndex = 1; this.player.scoping = false; }
    if (code === 'Digit3' && this.player.weapons[2]) { this.player.weaponIndex = 2; this.player.scoping = false; }
    if (code === 'Digit4' && this.player.weapons[3]) { this.player.weaponIndex = 3; this.player.scoping = false; }
  }

  onKeyUp(code) {
    this.keys.delete(code);
  }

  draw(ctx, canvas) {
    const w = canvas.width;
    const h = canvas.height;
    const zoom = this.viewZoom || 1;
    const shakeX = (Math.random() - 0.5) * this.shake * 2;
    const shakeY = (Math.random() - 0.5) * this.shake * 2;

    // 天际底色
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#8ec5e8');
    sky.addColorStop(1, '#6aa8c8');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    // 镜头缩放：以屏幕中心为锚，世界坐标绕相机缩放
    ctx.save();
    ctx.translate(w / 2 + shakeX, h / 2 + shakeY);
    ctx.scale(zoom, zoom);
    ctx.translate(-this.camera.x, -this.camera.y);

    // 视口裁剪范围（世界坐标）
    const viewW = w / zoom;
    const viewH = h / zoom;
    const camX = this.camera.x - viewW / 2;
    const camY = this.camera.y - viewH / 2;

    this.drawGround(ctx, camX, camY, viewW, viewH);
    this.drawRoads(ctx, camX, camY, viewW, viewH);
    this.drawPonds(ctx, camX, camY, viewW, viewH);
    this.drawRocks(ctx, camX, camY, viewW, viewH);
    this.drawZone(ctx, camX, camY, viewW, viewH);
    this.drawLoot(ctx, camX, camY, viewW, viewH);
    this.drawBuildings(ctx, camX, camY, viewW, viewH);
    this.drawTrees(ctx, camX, camY, viewW, viewH);

    // 尘土
    for (let i = 0; i < this.dust.length; i++) {
      const d = this.dust[i];
      ctx.globalAlpha = d.life * 1.5;
      ctx.fillStyle = 'rgba(180,160,110,0.7)';
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r * (1.2 - d.life), 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    for (let i = 0; i < this.bullets.length; i++) {
      const b = this.bullets[i];
      ctx.strokeStyle = b.color;
      ctx.globalAlpha = Math.min(1, b.life * 11);
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(b.x1, b.y1);
      ctx.lineTo(b.x2, b.y2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    for (let i = 0; i < this.sparks.length; i++) {
      const s = this.sparks[i];
      ctx.fillStyle = s.color;
      ctx.globalAlpha = Math.min(1, s.life * 8);
      ctx.beginPath();
      ctx.arc(s.x, s.y, (s.r || 3) + (1 - s.life) * 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    for (let i = 0; i < this.bots.length; i++) {
      if (this.bots[i].alive) this.drawEntity(ctx, this.bots[i], false);
      else this.drawCorpse(ctx, this.bots[i]);
    }
    if (this.player.alive) this.drawEntity(ctx, this.player, true);
    else this.drawCorpse(ctx, this.player);

    this.drawTreeCanopies(ctx, camX, camY, viewW, viewH);

    // 安全区描边
    ctx.beginPath();
    ctx.arc(this.zone.cx, this.zone.cy, this.zone.radius, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.92)';
    ctx.lineWidth = 3 / zoom;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(120,210,255,0.22)';
    ctx.lineWidth = 10 / zoom;
    ctx.stroke();

    if (this.zone.state === 'wait') {
      ctx.beginPath();
      ctx.arc(this.zone.targetCx, this.zone.targetCy, this.zone.targetRadius, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(80,200,255,0.55)';
      ctx.setLineDash([12 / zoom, 8 / zoom]);
      ctx.lineWidth = 2 / zoom;
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.restore();

    // 开镜 UI
    if (this.player.alive && this.player.scoping) {
      this.drawScopeOverlay(ctx, w, h);
    } else {
      // 未开镜暗角
      const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(8,18,28,0.32)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }

    // 受伤红闪
    if (this.hitFlash > 0) {
      ctx.fillStyle = 'rgba(180,20,30,' + Math.min(0.45, this.hitFlash * 1.2) + ')';
      ctx.fillRect(0, 0, w, h);
    }

    // 毒圈方向箭头（屏幕层，开镜时略透明）
    if (this.zoneArrow.active && this.player.alive) {
      this.drawZoneArrow(ctx, w, h);
    }

    // 开镜提示（触屏已有右侧按钮，窄屏底栏会挡住这段字）
    if (this.player.alive) {
      const compactHud = typeof window !== 'undefined' && window.innerWidth < 640;
      const touchUi = typeof document !== 'undefined' &&
        document.documentElement.classList.contains('touch-ui');
      const wpn = getActiveWeapon(this.player);
      if (canWeaponScope(wpn) && !this.player.scoping && !touchUi && !compactHud) {
        ctx.fillStyle = 'rgba(192,132,252,0.75)';
        ctx.font = '12px Segoe UI, Microsoft YaHei, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('右键 / C 开镜', w / 2, h - 96);
      }
    }
  }

  drawScopeOverlay(ctx, w, h) {
    const cx = w / 2;
    const cy = h / 2;
    const R = Math.min(w, h) * 0.36;

    // 镜外全黑
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.88)';
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    ctx.arc(cx, cy, R, 0, Math.PI * 2, true);
    ctx.fill('evenodd');

    // 镜筒边框
    ctx.strokeStyle = 'rgba(30,30,35,0.95)';
    ctx.lineWidth = 14;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(90,90,100,0.8)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, cy, R - 6, 0, Math.PI * 2);
    ctx.stroke();

    // 十字准星
    ctx.strokeStyle = 'rgba(20,20,20,0.85)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx - R + 18, cy);
    ctx.lineTo(cx + R - 18, cy);
    ctx.moveTo(cx, cy - R + 18);
    ctx.lineTo(cx, cy + R - 18);
    ctx.stroke();

    // 密位点
    ctx.fillStyle = 'rgba(40,20,20,0.9)';
    ctx.beginPath();
    ctx.arc(cx, cy, 2.2, 0, Math.PI * 2);
    ctx.fill();
    // 上下密位
    for (let i = 1; i <= 3; i++) {
      const y = cy + i * 14;
      ctx.fillRect(cx - 5 - i, y - 0.5, 10 + i * 2, 1.5);
    }

    // 距离环
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, R * 0.55, 0, Math.PI * 2);
    ctx.stroke();

    // 倍率字
    ctx.fillStyle = 'rgba(200,180,255,0.85)';
    ctx.font = 'bold 13px Segoe UI, sans-serif';
    ctx.textAlign = 'left';
    const wpn = getActiveWeapon(this.player);
    ctx.fillText('×' + (wpn.scopeZoom || 2).toFixed(1) + '  SCOPE', cx - R + 20, cy - R + 28);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = '11px Segoe UI, Microsoft YaHei, sans-serif';
    ctx.fillText(wpn.name + ' · 松右键关镜', cx - R + 20, cy - R + 46);

    ctx.restore();
  }

  drawZoneArrow(ctx, w, h) {
    const ang = this.zoneArrow.ang;
    const cx = w / 2 + Math.cos(ang) * Math.min(w, h) * 0.28;
    const cy = h / 2 + Math.sin(ang) * Math.min(w, h) * 0.28;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(ang);
    ctx.globalAlpha = 0.75 + Math.sin(this.ambientT * 6) * 0.15;
    ctx.fillStyle = '#a78bfa';
    ctx.beginPath();
    ctx.moveTo(22, 0);
    ctx.lineTo(-10, 12);
    ctx.lineTo(-4, 0);
    ctx.lineTo(-10, -12);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = 'rgba(200,180,255,0.85)';
    ctx.font = 'bold 13px Segoe UI, Microsoft YaHei, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('安全区 → ' + Math.ceil(this.zoneArrow.dist) + 'm', w / 2, 100);
  }

  drawGround(ctx, camX, camY, w, h) {
    const grid = 64;
    const x0 = Math.floor(camX / grid) * grid;
    const y0 = Math.floor(camY / grid) * grid;
    for (let x = x0 - grid; x < camX + w + grid; x += grid) {
      for (let y = y0 - grid; y < camY + h + grid; y += grid) {
        if (x < -grid || y < -grid || x > WORLD.size + grid || y > WORLD.size + grid) continue;
        const n = hash2(Math.floor(x / grid), Math.floor(y / grid));
        const gv = 115 + n * 42;
        const rv = 70 + n * 30;
        const bv = 46 + n * 16;
        ctx.fillStyle = 'rgb(' + (rv | 0) + ',' + (gv | 0) + ',' + (bv | 0) + ')';
        ctx.fillRect(x, y, grid + 1, grid + 1);
        if (n > 0.4) {
          ctx.fillStyle = 'rgba(45,95,38,' + (0.12 + n * 0.18) + ')';
          for (let k = 0; k < 5; k++) {
            const gx = x + hash2(x + k, y) * grid;
            const gy = y + hash2(y + k, x) * grid;
            ctx.fillRect(gx, gy, 2, 5);
          }
        }
      }
    }
    for (let i = 0; i < 14; i++) {
      const fx = hash2(i, 3) * WORLD.size;
      const fy = hash2(7, i) * WORLD.size;
      const fw = 120 + hash2(i, 9) * 170;
      const fh = 90 + hash2(i, 11) * 130;
      if (fx + fw < camX || fx > camX + w || fy + fh < camY || fy > camY + h) continue;
      ctx.fillStyle = i % 2 === 0 ? 'rgba(165,145,75,0.16)' : 'rgba(85,125,55,0.14)';
      ctx.fillRect(fx, fy, fw, fh);
    }
    ctx.strokeStyle = 'rgba(40,60,30,0.55)';
    ctx.lineWidth = 6;
    ctx.strokeRect(0, 0, WORLD.size, WORLD.size);
  }

  drawRoads(ctx, camX, camY, w, h) {
    for (let i = 0; i < this.roads.length; i++) {
      const r = this.roads[i];
      const minX = Math.min(r.x1, r.x2) - r.w;
      const maxX = Math.max(r.x1, r.x2) + r.w;
      const minY = Math.min(r.y1, r.y2) - r.w;
      const maxY = Math.max(r.y1, r.y2) + r.w;
      if (maxX < camX || minX > camX + w || maxY < camY || minY > camY + h) continue;

      ctx.lineCap = 'round';
      ctx.strokeStyle = '#5e584c';
      ctx.lineWidth = r.w + 8;
      ctx.beginPath();
      ctx.moveTo(r.x1, r.y1);
      ctx.lineTo(r.x2, r.y2);
      ctx.stroke();

      ctx.strokeStyle = '#8f8776';
      ctx.lineWidth = r.w;
      ctx.beginPath();
      ctx.moveTo(r.x1, r.y1);
      ctx.lineTo(r.x2, r.y2);
      ctx.stroke();

      if (r.w >= 28) {
        ctx.strokeStyle = 'rgba(235,215,120,0.5)';
        ctx.lineWidth = 2;
        ctx.setLineDash([16, 18]);
        ctx.beginPath();
        ctx.moveTo(r.x1, r.y1);
        ctx.lineTo(r.x2, r.y2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
  }

  drawPonds(ctx, camX, camY, w, h) {
    for (let i = 0; i < this.ponds.length; i++) {
      const p = this.ponds[i];
      if (p.x + p.rx < camX || p.x - p.rx > camX + w || p.y + p.ry < camY || p.y - p.ry > camY + h) continue;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, p.rx + 10, p.ry + 10, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#6a874c';
      ctx.fill();
      const grd = ctx.createRadialGradient(p.x - p.rx * 0.25, p.y - p.ry * 0.25, 3, p.x, p.y, p.rx);
      grd.addColorStop(0, '#9ad8ec');
      grd.addColorStop(0.45, '#3f96c4');
      grd.addColorStop(1, '#1a5478');
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, p.rx, p.ry, 0, 0, Math.PI * 2);
      ctx.fillStyle = grd;
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,' + (0.15 + Math.sin(this.ambientT * 2 + i) * 0.08) + ')';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y - 3, p.rx * 0.5, p.ry * 0.22, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  drawRocks(ctx, camX, camY, w, h) {
    for (let i = 0; i < this.rocks.length; i++) {
      const r = this.rocks[i];
      if (r.x < camX - 20 || r.x > camX + w + 20 || r.y < camY - 20 || r.y > camY + h + 20) continue;
      ctx.beginPath();
      ctx.ellipse(r.x, r.y + 2, r.r * 1.1, r.r * 0.5, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,0,0,0.14)';
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(r.x, r.y, r.r, r.r * 0.72, 0, 0, Math.PI * 2);
      const g = (90 + r.shade * 85) | 0;
      ctx.fillStyle = 'rgb(' + g + ',' + g + ',' + ((g * 0.95) | 0) + ')';
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.18)';
      ctx.stroke();
    }
  }

  drawLoot(ctx, camX, camY, w, h) {
    for (let i = 0; i < this.loot.length; i++) {
      const item = this.loot[i];
      if (item.taken) continue;
      if (item.x < camX - 24 || item.x > camX + w + 24 || item.y < camY - 24 || item.y > camY + h + 24) continue;

      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillRect(item.x - 10, item.y + 5, 20, 5);
      ctx.fillStyle = '#4a3428';
      ctx.fillRect(item.x - 10, item.y - 8, 20, 15);
      ctx.fillStyle = item.color;
      ctx.fillRect(item.x - 10, item.y - 8, 20, 4);
      ctx.strokeStyle = 'rgba(255,255,255,0.3)';
      ctx.strokeRect(item.x - 10, item.y - 8, 20, 15);

      const pulse = 0.35 + Math.sin(this.ambientT * 3.2 + item.x * 0.02) * 0.25;
      ctx.strokeStyle = item.color;
      ctx.globalAlpha = pulse;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(item.x, item.y, 13 + pulse * 3, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;

      if (this.player.alive && dist(this.player, item) < 140) {
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.font = '11px Segoe UI, Microsoft YaHei, sans-serif';
        const label = item.kind === 'weapon' ? item.label + ' [F]' : item.label;
        const tw = ctx.measureText(label).width;
        ctx.fillRect(item.x - tw / 2 - 4, item.y - 30, tw + 8, 16);
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.fillText(label, item.x, item.y - 18);
      }
    }
  }

  drawBuildings(ctx, camX, camY, w, h) {
    for (let i = 0; i < this.buildings.length; i++) {
      const b = this.buildings[i];
      if (b.x + b.w < camX || b.x > camX + w || b.y + b.h < camY || b.y > camY + h) continue;

      ctx.fillStyle = 'rgba(0,0,0,0.16)';
      ctx.fillRect(b.x + 7, b.y + 7, b.w, b.h);

      ctx.fillStyle = b.wall || b.color;
      ctx.fillRect(b.x, b.y, b.w, b.h);

      // 墙面高光
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.fillRect(b.x, b.y, b.w * 0.35, b.h);

      ctx.fillStyle = b.roof || '#5a4638';
      if (b.style === 'warehouse') {
        ctx.fillRect(b.x - 4, b.y - 10, b.w + 8, 16);
        ctx.fillStyle = 'rgba(0,0,0,0.12)';
        for (let k = 0; k < 4; k++) {
          ctx.fillRect(b.x + 8 + k * (b.w / 4), b.y + 16, b.w / 5 - 6, b.h - 28);
        }
      } else {
        ctx.beginPath();
        ctx.moveTo(b.x - 5, b.y + 10);
        ctx.lineTo(b.x + b.w / 2, b.y - 18);
        ctx.lineTo(b.x + b.w + 5, b.y + 10);
        ctx.closePath();
        ctx.fill();
        ctx.fillRect(b.x, b.y + 6, b.w, 8);
      }

      ctx.fillStyle = b.trim || '#4a3428';
      const doorW = 16;
      const doorH = 22;
      if (b.doorSide === 0) ctx.fillRect(b.x + b.w / 2 - doorW / 2, b.y + b.h - doorH, doorW, doorH);
      else if (b.doorSide === 1) ctx.fillRect(b.x + b.w - 6, b.y + b.h / 2 - doorH / 2, 6, doorH);
      else if (b.doorSide === 2) ctx.fillRect(b.x + b.w / 2 - doorW / 2, b.y, doorW, 8);
      else ctx.fillRect(b.x, b.y + b.h / 2 - doorH / 2, 6, doorH);

      ctx.fillStyle = b.window || '#7ec8e3';
      const wy = b.y + b.h * 0.35;
      ctx.fillRect(b.x + 12, wy, 14, 12);
      ctx.fillRect(b.x + b.w - 26, wy, 14, 12);
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillRect(b.x + 12, wy, 7, 6);
      ctx.fillRect(b.x + b.w - 26, wy, 7, 6);

      ctx.strokeStyle = 'rgba(0,0,0,0.22)';
      ctx.lineWidth = 2;
      ctx.strokeRect(b.x, b.y, b.w, b.h);
    }
  }

  drawTrees(ctx, camX, camY, w, h) {
    for (let i = 0; i < this.trees.length; i++) {
      const t = this.trees[i];
      if (t.x < camX - 40 || t.x > camX + w + 40 || t.y < camY - 40 || t.y > camY + h + 40) continue;
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      ctx.beginPath();
      ctx.ellipse(t.x, t.y + 4, t.r * 0.5, t.r * 0.2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#5a3d28';
      ctx.fillRect(t.x - t.trunk / 2, t.y - 6, t.trunk, 12);
    }
  }

  drawTreeCanopies(ctx, camX, camY, w, h) {
    for (let i = 0; i < this.trees.length; i++) {
      const t = this.trees[i];
      if (t.x < camX - 40 || t.x > camX + w + 40 || t.y < camY - 40 || t.y > camY + h + 40) continue;
      if (t.type === 'pine') {
        ctx.fillStyle = 'hsla(' + t.hue + ',45%,28%,0.92)';
        ctx.beginPath();
        ctx.moveTo(t.x, t.y - t.r * 1.4);
        ctx.lineTo(t.x + t.r * 0.75, t.y + 2);
        ctx.lineTo(t.x - t.r * 0.75, t.y + 2);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = 'hsla(' + t.hue + ',50%,34%,0.9)';
        ctx.beginPath();
        ctx.moveTo(t.x, t.y - t.r);
        ctx.lineTo(t.x + t.r * 0.5, t.y - 2);
        ctx.lineTo(t.x - t.r * 0.5, t.y - 2);
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.fillStyle = 'hsla(' + t.hue + ',42%,29%,0.9)';
        ctx.beginPath();
        ctx.arc(t.x, t.y - 4, t.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'hsla(' + (t.hue + 12) + ',50%,38%,0.72)';
        ctx.beginPath();
        ctx.arc(t.x - t.r * 0.25, t.y - t.r * 0.35, t.r * 0.52, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  drawZone(ctx, camX, camY, w, h) {
    ctx.save();
    ctx.fillStyle = 'rgba(50, 28, 85, 0.34)';
    ctx.beginPath();
    ctx.rect(camX - 20, camY - 20, w + 40, h + 40);
    ctx.arc(this.zone.cx, this.zone.cy, this.zone.radius, 0, Math.PI * 2, true);
    ctx.fill('evenodd');
    ctx.strokeStyle = 'rgba(150,90,220,0.22)';
    ctx.lineWidth = 20;
    ctx.beginPath();
    ctx.arc(this.zone.cx, this.zone.cy, this.zone.radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  drawEntity(ctx, e, isPlayer) {
    ctx.beginPath();
    ctx.ellipse(e.x, e.y + 5, e.r * 0.95, e.r * 0.38, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.fill();

    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate(e.angle);

    ctx.fillStyle = isPlayer ? '#2a5a40' : '#353544';
    ctx.fillRect(-5, 2, 4, 10);
    ctx.fillRect(1, 2, 4, 10);

    ctx.fillStyle = e.color;
    ctx.beginPath();
    ctx.ellipse(0, -2, 9, 11, 0, 0, Math.PI * 2);
    ctx.fill();
    if (e.lastHurt > 0) {
      ctx.fillStyle = 'rgba(255,60,60,' + e.lastHurt + ')';
      ctx.beginPath();
      ctx.ellipse(0, -2, 9, 11, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = isPlayer ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.3)';
    ctx.lineWidth = isPlayer ? 2.5 : 1.5;
    ctx.stroke();

    ctx.fillStyle = '#e8c4a0';
    ctx.beginPath();
    ctx.arc(0, -14, 6.5, 0, Math.PI * 2);
    ctx.fill();

    const wpn = getActiveWeapon(e);
    ctx.fillStyle = '#222';
    if (wpn.id === 'sniper') {
      ctx.fillRect(6, -3.5, 28, 4);
      ctx.fillStyle = wpn.color;
      ctx.fillRect(30, -2.5, 14, 2.5);
      ctx.fillStyle = '#333';
      ctx.fillRect(16, -8, 8, 5);
      ctx.strokeStyle = '#88ccee';
      ctx.lineWidth = 1;
      ctx.strokeRect(16, -8, 8, 5);
    } else {
      ctx.fillRect(6, -4, wpn.isMelee ? 14 : 20, 5);
      if (!wpn.isMelee) {
        ctx.fillStyle = wpn.color;
        ctx.fillRect(18, -3, 12, 3);
      }
    }
    ctx.restore();

    if (e.invuln > 0 && ((this.ambientT * 12) | 0) % 2 === 0) {
      ctx.strokeStyle = 'rgba(255,240,120,0.75)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.r + 7, 0, Math.PI * 2);
      ctx.stroke();
    }

    const bw = 36;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(e.x - bw / 2, e.y - e.r - 24, bw, 5);
    ctx.fillStyle = e.hp / e.maxHp > 0.4 ? '#3ddc97' : '#ff5c5c';
    ctx.fillRect(e.x - bw / 2, e.y - e.r - 24, bw * clamp(e.hp / e.maxHp, 0, 1), 5);

    if (e.armor > 0) {
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(e.x - bw / 2, e.y - e.r - 18, bw, 3);
      ctx.fillStyle = '#4cc9f0';
      ctx.fillRect(e.x - bw / 2, e.y - e.r - 18, bw * clamp(e.armor / e.maxArmor, 0, 1), 3);
    }

    ctx.fillStyle = isPlayer ? '#3ddc97' : 'rgba(255,255,255,0.82)';
    ctx.font = '11px Segoe UI, Microsoft YaHei, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(e.name, e.x, e.y - e.r - 28);
  }

  drawCorpse(ctx, e) {
    ctx.beginPath();
    ctx.ellipse(e.x, e.y, e.r * 0.9, e.r * 0.48, 0.35, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(90,55,55,0.72)';
    ctx.fill();
  }

  drawMinimap(mctx, size) {
    mctx.clearRect(0, 0, size, size);
    const scale = size / WORLD.size;
    mctx.fillStyle = '#3d6b3a';
    mctx.fillRect(0, 0, size, size);

    mctx.strokeStyle = '#7a7468';
    mctx.lineWidth = 2;
    for (let i = 0; i < this.roads.length; i++) {
      const r = this.roads[i];
      mctx.beginPath();
      mctx.moveTo(r.x1 * scale, r.y1 * scale);
      mctx.lineTo(r.x2 * scale, r.y2 * scale);
      mctx.stroke();
    }

    mctx.fillStyle = '#3a8fbf';
    for (let i = 0; i < this.ponds.length; i++) {
      const p = this.ponds[i];
      mctx.beginPath();
      mctx.ellipse(p.x * scale, p.y * scale, Math.max(2, p.rx * scale), Math.max(2, p.ry * scale), 0, 0, Math.PI * 2);
      mctx.fill();
    }

    mctx.fillStyle = '#8b7355';
    for (let i = 0; i < this.buildings.length; i++) {
      const b = this.buildings[i];
      mctx.fillRect(b.x * scale, b.y * scale, Math.max(2, b.w * scale), Math.max(2, b.h * scale));
    }

    mctx.beginPath();
    mctx.arc(this.zone.cx * scale, this.zone.cy * scale, this.zone.radius * scale, 0, Math.PI * 2);
    mctx.strokeStyle = '#fff';
    mctx.lineWidth = 1.5;
    mctx.stroke();

    if (this.zone.state === 'wait') {
      mctx.beginPath();
      mctx.arc(this.zone.targetCx * scale, this.zone.targetCy * scale, this.zone.targetRadius * scale, 0, Math.PI * 2);
      mctx.strokeStyle = '#4cc9f0';
      mctx.setLineDash([3, 3]);
      mctx.stroke();
      mctx.setLineDash([]);
    }

    for (let i = 0; i < this.bots.length; i++) {
      const b = this.bots[i];
      if (!b.alive) continue;
      mctx.fillStyle = '#ff6b6b';
      mctx.beginPath();
      mctx.arc(b.x * scale, b.y * scale, 2.2, 0, Math.PI * 2);
      mctx.fill();
    }

    if (this.player.alive) {
      mctx.fillStyle = '#3ddc97';
      mctx.beginPath();
      mctx.arc(this.player.x * scale, this.player.y * scale, 3.2, 0, Math.PI * 2);
      mctx.fill();
      mctx.strokeStyle = '#3ddc97';
      mctx.beginPath();
      mctx.moveTo(this.player.x * scale, this.player.y * scale);
      mctx.lineTo(
        (this.player.x + Math.cos(this.player.angle) * 70) * scale,
        (this.player.y + Math.sin(this.player.angle) * 70) * scale
      );
      mctx.stroke();
    }
  }

  getHudState() {
    const p = this.player;
    const w = getActiveWeapon(p);
    ensureMag(p, w);
    return {
      alive: this.aliveCount(),
      zone: this.zone.getStatusText(),
      kills: p.kills,
      hp: Math.ceil(p.hp),
      maxHp: p.maxHp,
      armor: Math.ceil(p.armor),
      weaponName: p.reloading
        ? w.name + ' (换弹…)'
        : (p.scoping ? w.name + ' [开镜]' : w.name + (canWeaponScope(w) ? ' · 可开镜' : '')),
      ammo: w.isMelee ? '—' : (p.mag[w.id] != null ? p.mag[w.id] : 0) + ' / ' + p.reserveAmmo,
      medkits: p.medkits,
      scoping: !!p.scoping,
      canScope: canWeaponScope(w),
      weapons: p.weapons.map(function (wp, i) {
        return {
          key: String(i + 1),
          name: wp ? wp.name : '空',
          active: i === p.weaponIndex,
          empty: !wp,
        };
      }),
      nearLoot: this.nearLoot,
      inZoneDamage: p.alive && this.zone.isOutside(p),
      time: formatTime(this.time),
      rank: this.rank,
      result: this.result,
      hitFlash: this.hitFlash,
      hitMarker: this.hitMarker,
      killMarker: this.killMarker,
    };
  }
}

function randOffset() {
  return (Math.random() - 0.5) * 100;
}
