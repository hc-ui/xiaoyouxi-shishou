const $ = function (id) { return document.getElementById(id); };

const menu = $('menu');
const hud = $('hud');
const pauseScreen = $('pause');
const resultScreen = $('result');
const canvas = $('game');
const minimap = $('minimap');
const crosshair = $('crosshair');
const ctx = canvas.getContext('2d', { alpha: false });
const mctx = minimap.getContext('2d');

let game = null;
let raf = 0;
let last = 0;
let playing = false;
let selectedDiff = 'normal';
let nextHudAt = 0;
let nextMinimapAt = 0;
const hudCache = {};

const STORAGE_KEY = 'br_lite_v1';

function loadStore() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch (e) {
    return {};
  }
}

function saveStore(partial) {
  const cur = loadStore();
  for (const k in partial) cur[k] = partial[k];
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cur));
  } catch (e) {}
}

const pointer = {
  x: window.innerWidth / 2,
  y: window.innerHeight / 2,
  down: false,
  right: false,
};

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.floor(window.innerWidth * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);
  canvas.style.width = window.innerWidth + 'px';
  canvas.style.height = window.innerHeight + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  // 小地图分辨率
  if (minimap) {
    const s = window.innerWidth < 640 ? 110 : 160;
    minimap.width = s;
    minimap.height = s;
    minimap.style.width = s + 'px';
    minimap.style.height = s + 'px';
  }
}

function show(el) { if (el) el.classList.remove('hidden'); }
function hide(el) { if (el) el.classList.add('hidden'); }

function toast(msg) {
  var t = $('share-toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'share-toast';
    t.className = 'share-toast';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(function () { t.classList.remove('show'); }, 2200);
}

function updateCrosshair() {
  if (!crosshair) return;
  if (game && game.player && game.player.scoping) {
    crosshair.style.display = 'none';
    return;
  }
  crosshair.style.display = '';
  crosshair.style.left = pointer.x + 'px';
  crosshair.style.top = pointer.y + 'px';
  crosshair.classList.toggle('hit', !!(game && game.hitMarker > 0 && game.killMarker <= 0));
  crosshair.classList.toggle('kill', !!(game && game.killMarker > 0));
}

function syncMouseToGame() {
  if (!game) return;
  const zoom = game.viewZoom || 1;
  const w = window.innerWidth;
  const h = window.innerHeight;
  game.mouse.x = pointer.x;
  game.mouse.y = pointer.y;
  game.mouse.down = pointer.down;
  game.mouse.right = pointer.right;
  game.mouse.worldX = game.camera.x + (pointer.x - w / 2) / zoom;
  game.mouse.worldY = game.camera.y + (pointer.y - h / 2) / zoom;
}

function refreshBestScoreUI() {
  const el = $('best-score');
  if (!el) return;
  const st = loadStore();
  const best = st.bestKills || 0;
  const wins = st.wins || 0;
  el.textContent = '历史最佳击杀 ' + best + ' · 吃鸡 ' + wins + ' 次';
}

function setDifficulty(level) {
  selectedDiff = level;
  applyDifficulty(level);
  saveStore({ difficulty: level });
  const buttons = document.querySelectorAll('.diff-btn');
  for (let i = 0; i < buttons.length; i++) {
    buttons[i].classList.toggle('active', buttons[i].getAttribute('data-diff') === level);
  }
  const label = (DIFFICULTY_PRESETS[level] || {}).label || level;
  const tip = $('menu-diff-tip');
  if (tip) tip.textContent = '当前难度：' + label + ' · ' + WORLD.botCount + ' 人机';
}

function startGame() {
  try {
    if (typeof SFX !== 'undefined') SFX.unlock();
    applyDifficulty(selectedDiff);
    game = new Game();
    hide(menu);
    hide(resultScreen);
    hide(pauseScreen);
    show(hud);
    if (hud) hud.classList.add('playing');
    playing = true;
    pointer.x = window.innerWidth / 2;
    pointer.y = window.innerHeight / 2;
    pointer.down = false;
    pointer.right = false;
    nextHudAt = 0;
    nextMinimapAt = 0;
    for (const k in hudCache) delete hudCache[k];
    resetTouchControls();
    updateCrosshair();
    syncMouseToGame();
    try { window.focus(); } catch (e) {}
    last = performance.now();
    cancelAnimationFrame(raf);
    loop(last);

    var hint = $('move-hint');
    if (hint) {
      hint.textContent = isTouchMode()
        ? '左摇杆移动 · 右摇杆瞄准射击 · 右侧按钮操作'
        : 'WASD 移动 · 右键/C 开镜(狙击) · F 拾枪';
      hint.classList.remove('hidden', 'fade');
      setTimeout(function () { hint.classList.add('fade'); }, 5500);
      setTimeout(function () { hint.classList.add('hidden'); }, 6200);
    }
  } catch (err) {
    console.error(err);
    alert('启动失败: ' + (err && err.message ? err.message : err));
  }
}

function backToMenu() {
  playing = false;
  cancelAnimationFrame(raf);
  hide(hud);
  hide(pauseScreen);
  hide(resultScreen);
  show(menu);
  if (hud) hud.classList.remove('playing');
  pointer.down = false;
  pointer.right = false;
  resetTouchControls();
  game = null;
  refreshBestScoreUI();
}

function togglePause() {
  if (!game || game.ended || !playing) return;
  game.paused = !game.paused;
  if (game.paused) {
    pointer.down = false;
    pointer.right = false;
    resetTouchControls();
    show(pauseScreen);
  } else {
    last = performance.now();
    hide(pauseScreen);
  }
}

function showResult() {
  if (!game) return;
  const s = game.getHudState();
  const win = s.result === 'win';
  const badge = $('result-badge');
  badge.textContent = win ? '胜利' : '被淘汰';
  badge.classList.toggle('lose', !win);
  $('result-title').innerHTML = win
    ? 'Winner Winner<br/>Chicken Dinner!'
    : '再接再厉 · 下次吃鸡';
  $('stat-rank').textContent = '#' + s.rank;
  $('stat-kills').textContent = String(s.kills);
  $('stat-time').textContent = s.time;
  show(resultScreen);

  // 记录成绩
  const st = loadStore();
  const best = Math.max(st.bestKills || 0, s.kills || 0);
  const wins = (st.wins || 0) + (win ? 1 : 0);
  saveStore({ bestKills: best, wins: wins, lastRank: s.rank });
}

function updateHud() {
  if (!game) return;
  const s = game.getHudState();
  setHudText('alive', 'alive-count', '存活 ' + s.alive);
  setHudText('zone', 'zone-info', s.zone);
  setHudText('kills', 'kill-count', '击杀 ' + s.kills);
  setHudText('hpText', 'hp-text', s.hp + (s.maxHp ? '/' + s.maxHp : ''));
  setHudText('armorText', 'armor-text', String(s.armor));
  const hpPct = s.maxHp ? Math.max(0, Math.min(100, (s.hp / s.maxHp) * 100)) : s.hp;
  setHudWidth('hpWidth', 'hp-bar', hpPct);
  setHudWidth('armorWidth', 'armor-bar', Math.max(0, Math.min(100, s.armor)));
  setHudText('weapon', 'weapon-name', s.weaponName);
  setHudText('ammo', 'ammo-text', s.ammo);
  setHudText('medkits', 'medkit-text', '医疗包 ×' + s.medkits + ' (Q/E)');

  const slots = $('weapon-slots');
  const slotsKey = s.weapons.map(function (w) {
    return w.key + ':' + w.name + ':' + (w.active ? 1 : 0) + ':' + (w.empty ? 1 : 0);
  }).join('|');
  if (hudCache.slots !== slotsKey) {
    hudCache.slots = slotsKey;
    slots.innerHTML = s.weapons.map(function (w, i) {
      return (
        '<div class="slot ' +
        (w.active ? 'active' : '') +
        (w.empty ? ' empty' : '') +
        '" data-slot="' + i + '"><div class="key">' +
        w.key +
        '</div><div>' +
        w.name +
        '</div></div>'
      );
    }).join('');
  }

  const hint = $('pickup-hint');
  if (s.nearLoot) {
    const auto = s.nearLoot.kind !== 'weapon';
    hint.textContent = auto
      ? '靠近自动拾取：' + s.nearLoot.label
      : '按 F 拾取：' + s.nearLoot.label;
    hint.classList.remove('hidden');
  } else {
    hint.classList.add('hidden');
  }

  const warn = $('zone-warn');
  if (s.inZoneDamage) warn.classList.remove('hidden');
  else warn.classList.add('hidden');

  const feedKey = game.killFeed.map(function (k) { return k.text; }).join('|');
  if (hudCache.feed !== feedKey) {
    hudCache.feed = feedKey;
    $('kill-feed').innerHTML = game.killFeed
      .map(function (k) {
        return '<div class="kill-item">' + k.text + '</div>';
      })
      .join('');
  }

  const scopeBtn = $('touch-scope');
  if (scopeBtn) {
    scopeBtn.classList.toggle('unavailable', !s.canScope);
    if (!s.canScope && pointer.right) {
      pointer.right = false;
      scopeBtn.classList.remove('active');
    }
  }
}

function setHudText(cacheKey, id, value) {
  if (hudCache[cacheKey] === value) return;
  hudCache[cacheKey] = value;
  const el = $(id);
  if (el) el.textContent = value;
}

function setHudWidth(cacheKey, id, value) {
  const rounded = Math.round(value * 10) / 10;
  if (hudCache[cacheKey] === rounded) return;
  hudCache[cacheKey] = rounded;
  const el = $(id);
  if (el) el.style.width = rounded + '%';
}

function loop(ts) {
  if (!game || !playing) {
    raf = 0;
    return;
  }
  raf = requestAnimationFrame(loop);
  if (game.paused) {
    last = ts;
    return;
  }

  const dt = Math.min(0.05, (ts - last) / 1000);
  last = ts;

  syncMouseToGame();
  game.update(dt);

  game.draw(ctx, { width: window.innerWidth, height: window.innerHeight });
  if (ts >= nextMinimapAt) {
    const ms = minimap ? minimap.width : 160;
    game.drawMinimap(mctx, ms);
    nextMinimapAt = ts + 100;
  }
  if (ts >= nextHudAt) {
    updateHud();
    nextHudAt = ts + 50;
  }
  updateCrosshair();

  if (game.ended) {
    playing = false;
    cancelAnimationFrame(raf);
    raf = 0;
    pointer.down = false;
    pointer.right = false;
    resetTouchControls();
    setTimeout(showResult, 700);
  }
}

function bind(id, evt, fn) {
  const el = $(id);
  if (!el) return;
  el.addEventListener(evt, fn);
}

function copyShareLink() {
  const url = location.href.split('#')[0];
  const text = '来玩免费网页吃鸡：Battle Royale Lite\n' + url;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(function () {
      toast('链接已复制，发给朋友即可玩');
    }).catch(function () {
      prompt('复制此链接分享：', url);
    });
  } else {
    prompt('复制此链接分享：', url);
  }
  // 可选原生分享
  if (navigator.share) {
    navigator.share({ title: '大逃杀轻量版', text: '网页吃鸡，点开即玩', url: url }).catch(function () {});
  }
  return text;
}

function toggleFullscreen() {
  const doc = document;
  if (!doc.fullscreenElement && !doc.webkitFullscreenElement) {
    const el = doc.documentElement;
    const req = el.requestFullscreen || el.webkitRequestFullscreen;
    if (req) req.call(el);
  } else {
    const exit = doc.exitFullscreen || doc.webkitExitFullscreen;
    if (exit) exit.call(doc);
  }
}

// 绑定
bind('btn-start', 'click', startGame);
bind('btn-again', 'click', startGame);
bind('btn-menu', 'click', backToMenu);
bind('btn-resume', 'click', function () {
  if (game) {
    game.paused = false;
    last = performance.now();
    hide(pauseScreen);
  }
});
bind('btn-quit', 'click', backToMenu);
bind('btn-share', 'click', copyShareLink);
bind('btn-fullscreen', 'click', toggleFullscreen);

var muteBtn = $('btn-mute');
if (muteBtn) {
  muteBtn.addEventListener('click', function () {
    if (typeof SFX === 'undefined') return;
    const m = SFX.toggleMute();
    muteBtn.textContent = m ? '音效：关' : '音效：开';
    saveStore({ muted: m });
  });
}

// 难度按钮
var diffBtns = document.querySelectorAll('.diff-btn');
for (let i = 0; i < diffBtns.length; i++) {
  diffBtns[i].addEventListener('click', function () {
    setDifficulty(this.getAttribute('data-diff'));
  });
}

window.addEventListener('resize', function () {
  syncInputModeClass();
  resize();
});

window.addEventListener('mousemove', function (e) {
  pointer.x = e.clientX;
  pointer.y = e.clientY;
  updateCrosshair();
  if (game) syncMouseToGame();
});

window.addEventListener('mousedown', function (e) {
  if (typeof SFX !== 'undefined') SFX.unlock();
  if (!game || game.paused || game.ended || !playing) return;
  if (!menu.classList.contains('hidden')) return;
  if (!resultScreen.classList.contains('hidden')) return;
  if (!pauseScreen.classList.contains('hidden')) return;
  pointer.x = e.clientX;
  pointer.y = e.clientY;
  if (e.button === 0) pointer.down = true;
  if (e.button === 2) {
    e.preventDefault();
    pointer.right = true;
    if (game) game.mouse.right = true;
  }
  syncMouseToGame();
});

window.addEventListener('mouseup', function (e) {
  if (e.button === 0) {
    pointer.down = false;
    if (game) game.mouse.down = false;
  }
  if (e.button === 2) {
    pointer.right = false;
    if (game) game.mouse.right = false;
  }
});

window.addEventListener('blur', function () {
  pointer.down = false;
  pointer.right = false;
  resetTouchControls();
  if (game) {
    game.mouse.down = false;
    game.mouse.right = false;
  }
});

function isTouchMode() {
  const coarse = !!(window.matchMedia &&
    window.matchMedia('(hover: none) and (pointer: coarse)').matches);
  const compactTouch = (navigator.maxTouchPoints || 0) > 0 && window.innerWidth <= 900;
  return coarse || compactTouch;
}

function syncInputModeClass() {
  document.documentElement.classList.toggle('touch-ui', isTouchMode());
}

function resetTouchControls() {
  pointer.down = false;
  if (game) {
    game.mouse.down = false;
    game.mobileMove.x = 0;
    game.mobileMove.y = 0;
    game.mobileMove.sprint = false;
  }
  const knobs = document.querySelectorAll('.stick-knob');
  for (let i = 0; i < knobs.length; i++) knobs[i].style.transform = 'translate(0, 0)';
  const scopeBtn = $('touch-scope');
  if (scopeBtn) scopeBtn.classList.remove('active');
}

function getStickVector(el, e) {
  const rect = el.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const radius = Math.max(24, rect.width * 0.31);
  let x = (e.clientX - cx) / radius;
  let y = (e.clientY - cy) / radius;
  const len = Math.hypot(x, y);
  if (len > 1) {
    x /= len;
    y /= len;
  }
  const knob = el.querySelector('.stick-knob');
  if (knob) knob.style.transform = 'translate(' + (x * radius) + 'px,' + (y * radius) + 'px)';
  return { x: x, y: y, strength: Math.min(1, len) };
}

function bindTouchStick(id, onChange, onEnd) {
  const el = $(id);
  if (!el) return;
  let activePointer = null;

  function move(e) {
    if (e.pointerId !== activePointer) return;
    e.preventDefault();
    e.stopPropagation();
    onChange(getStickVector(el, e), e);
  }

  function end(e) {
    if (e.pointerId !== activePointer) return;
    e.preventDefault();
    e.stopPropagation();
    activePointer = null;
    const knob = el.querySelector('.stick-knob');
    if (knob) knob.style.transform = 'translate(0, 0)';
    onEnd(e);
  }

  el.addEventListener('pointerdown', function (e) {
    if (!playing || !game || game.paused || game.ended) return;
    e.preventDefault();
    e.stopPropagation();
    activePointer = e.pointerId;
    if (el.setPointerCapture) el.setPointerCapture(e.pointerId);
    if (typeof SFX !== 'undefined') SFX.unlock();
    onChange(getStickVector(el, e), e);
  });
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
  el.addEventListener('lostpointercapture', function (e) {
    if (e.pointerId === activePointer) end(e);
  });
}

bindTouchStick('move-stick', function (v) {
  if (!game) return;
  game.mobileMove.x = v.x;
  game.mobileMove.y = v.y;
  game.mobileMove.sprint = v.strength > 0.88;
}, function () {
  if (!game) return;
  game.mobileMove.x = 0;
  game.mobileMove.y = 0;
  game.mobileMove.sprint = false;
});

bindTouchStick('aim-stick', function (v) {
  if (!game) return;
  if (v.strength > 0.12) {
    const reach = Math.min(390, Math.max(190, Math.min(window.innerWidth, window.innerHeight) * 0.48));
    pointer.x = window.innerWidth / 2 + v.x * reach;
    pointer.y = window.innerHeight / 2 + v.y * reach;
  }
  pointer.down = true;
  syncMouseToGame();
  updateCrosshair();
}, function () {
  pointer.down = false;
  if (game) game.mouse.down = false;
});

function bindTouchAction(id, action) {
  const el = $(id);
  if (!el) return;
  el.addEventListener('pointerdown', function (e) {
    e.preventDefault();
    e.stopPropagation();
    if (!playing || !game || game.paused || game.ended) return;
    if (typeof SFX !== 'undefined') SFX.unlock();
    action(el);
  });
}

bindTouchAction('touch-scope', function (el) {
  const w = game && game.player ? getActiveWeapon(game.player) : null;
  if (!canWeaponScope(w)) {
    toast('当前武器不支持开镜');
    return;
  }
  pointer.right = !pointer.right;
  el.classList.toggle('active', pointer.right);
  syncMouseToGame();
});
bindTouchAction('touch-reload', function () {
  game.onKeyDown('KeyR');
  game.onKeyUp('KeyR');
});
bindTouchAction('touch-medkit', function () {
  game.onKeyDown('KeyQ');
  game.onKeyUp('KeyQ');
});
bindTouchAction('touch-pickup', function () {
  game.onKeyDown('KeyF');
  game.onKeyUp('KeyF');
});

const weaponSlots = $('weapon-slots');
if (weaponSlots) {
  weaponSlots.addEventListener('mousedown', function (e) { e.stopPropagation(); });
  weaponSlots.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
  weaponSlots.addEventListener('click', function (e) {
    const slot = e.target.closest ? e.target.closest('[data-slot]') : null;
    if (!slot || !game || game.paused || game.ended) return;
    const index = Number(slot.getAttribute('data-slot'));
    if (!Number.isFinite(index)) return;
    game.onKeyDown('Digit' + (index + 1));
    game.onKeyUp('Digit' + (index + 1));
    pointer.right = false;
    const scopeBtn = $('touch-scope');
    if (scopeBtn) scopeBtn.classList.remove('active');
    updateHud();
  });
}

document.addEventListener('visibilitychange', function () {
  if (document.hidden && playing && game && !game.paused && !game.ended) {
    togglePause();
  }
});

window.addEventListener('keydown', function (e) {
  if (e.code === 'KeyM' && typeof SFX !== 'undefined') {
    const m = SFX.toggleMute();
    if (muteBtn) muteBtn.textContent = m ? '音效：关' : '音效：开';
    saveStore({ muted: m });
  }
  if (e.code === 'KeyF11') {
    e.preventDefault();
    toggleFullscreen();
  }
  if (e.code === 'Escape') {
    if (!resultScreen.classList.contains('hidden')) return;
    if (!menu.classList.contains('hidden')) return;
    togglePause();
    return;
  }
  if (!game || game.paused) return;
  game.onKeyDown(e.code);
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].indexOf(e.code) >= 0) {
    e.preventDefault();
  }
});

window.addEventListener('keyup', function (e) {
  if (!game) return;
  game.onKeyUp(e.code);
});

window.addEventListener('contextmenu', function (e) {
  if (playing) e.preventDefault();
});

window.addEventListener('dragstart', function (e) {
  if (playing) e.preventDefault();
});

// 初始化
syncInputModeClass();
resize();
updateCrosshair();

const stored = loadStore();
if (stored.muted && typeof SFX !== 'undefined') {
  // SFX 默认未静音；切换一次
  if (!SFX.isMuted()) SFX.toggleMute();
  if (muteBtn) muteBtn.textContent = '音效：关';
}
setDifficulty(stored.difficulty || 'normal');
refreshBestScoreUI();
