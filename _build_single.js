const fs = require('fs');
const path = require('path');
const dir = __dirname;

function stripBom(s) {
  return s.replace(/^\uFEFF/, '');
}

const css = stripBom(fs.readFileSync(path.join(dir, 'css/style.css'), 'utf8'));
const jsFiles = ['config.js', 'audio.js', 'world.js', 'zone.js', 'entities.js', 'game.js', 'main.js']
  .map((f) => stripBom(fs.readFileSync(path.join(dir, 'js', f), 'utf8')))
  .join('\n\n');

let js = jsFiles
  .replace(/result\?\.killed/g, 'result && result.killed')
  .replace(/p\.mag\[w\.id\] \?\? 0/g, '(p.mag[w.id] != null ? p.mag[w.id] : 0)');

const errorBootstrap = `
window.onerror = function(msg, src, line, col, err) {
  var box = document.getElementById('boot-error');
  if (!box) {
    box = document.createElement('div');
    box.id = 'boot-error';
    box.style.cssText = 'position:fixed;left:12px;right:12px;bottom:12px;z-index:9999;background:#3a1010;color:#ffd0d0;padding:14px 16px;border:1px solid #ff5c5c;border-radius:10px;font:13px/1.5 Consolas,monospace;white-space:pre-wrap;';
    document.body.appendChild(box);
  }
  box.textContent = '游戏脚本错误:\\n' + msg + '\\n' + (src || '') + ':' + line + ':' + col;
};
`;

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <meta name="description" content="免费网页大逃杀：缩圈、搜打装、狙击开镜、人机对战。点开即玩，无需下载。" />
  <meta name="theme-color" content="#0b0f14" />
  <meta property="og:title" content="小游戏试手 · 大逃杀轻量版" />
  <meta property="og:description" content="浏览器里玩的吃鸡小游戏：缩圈、搜打装、狙击开镜。免费在线。" />
  <meta property="og:type" content="website" />
  <meta name="twitter:card" content="summary" />
  <title>小游戏试手 · 大逃杀轻量版</title>
  <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect fill='%230b0f14' width='64' height='64' rx='12'/%3E%3Ccircle cx='32' cy='32' r='14' fill='none' stroke='%233ddc97' stroke-width='4'/%3E%3Ccircle cx='32' cy='32' r='4' fill='%23c084fc'/%3E%3C/svg%3E" />
  <style>
${css}
#boot-ok{position:fixed;left:12px;bottom:12px;z-index:5;color:#3ddc97;font-size:12px;opacity:.75;pointer-events:none}
  </style>
</head>
<body>
  <div id="app">
    <div id="menu" class="screen">
      <div class="menu-card">
        <p class="badge">BATTLE ROYALE LITE · ONLINE</p>
        <h1>小游戏试手 · 大逃杀</h1>
        <p class="subtitle">缩圈 · 搜打装 · 狙击开镜 · 最后一人获胜</p>
        <div class="menu-stats">
          <div><span>地图</span><strong>2000×2000</strong></div>
          <div><span>模式</span><strong>单机人机</strong></div>
          <div><span>部署</span><strong>网页即玩</strong></div>
        </div>
        <div class="diff-row" id="diff-row">
          <button type="button" class="diff-btn" data-diff="easy">休闲</button>
          <button type="button" class="diff-btn active" data-diff="normal">标准</button>
          <button type="button" class="diff-btn" data-diff="hard">困难</button>
        </div>
        <p class="menu-tips" id="menu-diff-tip">当前难度：标准 · 16 人机 · 会主动追杀</p>
        <button id="btn-start" class="btn primary" type="button">开始匹配</button>
        <div class="menu-actions">
          <button id="btn-share" class="btn ghost" type="button">复制链接分享</button>
          <button id="btn-fullscreen" class="btn ghost" type="button">全屏</button>
        </div>
        <p class="best-score" id="best-score">历史最佳击杀 0 · 吃鸡 0 次</p>
        <div class="controls-hint desktop-only">
          <h3>操作说明</h3>
          <ul>
            <li><kbd>W A S D</kbd> 移动 · <kbd>Shift</kbd> 冲刺</li>
            <li><kbd>鼠标</kbd> 瞄准 · <kbd>左键</kbd> 射击</li>
            <li><kbd>右键</kbd> / <kbd>C</kbd> 狙击开镜（约 2.3×）</li>
            <li><kbd>R</kbd> 换弹 · <kbd>F</kbd> 拾枪 · 补给自动捡</li>
            <li><kbd>1-4</kbd> 切枪 · <kbd>Q/E</kbd> 医疗 · <kbd>M</kbd> 音效</li>
          </ul>
        </div>
        <div class="controls-hint touch-only">
          <h3>触屏操作</h3>
          <ul>
            <li>左摇杆移动，推到底自动冲刺</li>
            <li>右摇杆瞄准并射击，点武器栏切枪</li>
            <li>使用右侧按钮开镜、换弹、医疗和拾取</li>
          </ul>
        </div>
        <p class="menu-tips">纯前端单机 · 可发给好友用浏览器打开</p>
      </div>
    </div>

    <button id="btn-mute" type="button">音效：开</button>

    <div id="hud" class="hidden">
      <canvas id="game"></canvas>
      <canvas id="minimap" width="160" height="160"></canvas>
      <div id="top-bar">
        <div class="pill" id="alive-count">存活 9</div>
        <div class="pill" id="zone-info">安全区 稳定</div>
        <div class="pill" id="kill-count">击杀 0</div>
      </div>
      <div id="kill-feed"></div>
      <div id="crosshair">+</div>
      <div id="bottom-hud">
        <div class="hp-block">
          <div class="bar-label">生命 <span id="hp-text">125</span></div>
          <div class="bar"><div id="hp-bar" class="fill hp"></div></div>
          <div class="bar-label armor">护甲 <span id="armor-text">45</span></div>
          <div class="bar"><div id="armor-bar" class="fill armor"></div></div>
        </div>
        <div class="weapon-block">
          <div id="weapon-name">手枪</div>
          <div id="ammo-text">12 / 90</div>
          <div id="medkit-text">医疗包 ×2 (Q/E)</div>
        </div>
        <div class="slots" id="weapon-slots"></div>
      </div>
      <div id="pickup-hint" class="hidden"></div>
      <div id="zone-warn" class="hidden">毒圈伤害中！跟随紫色箭头进圈</div>
      <div id="move-hint" class="hidden">WASD 移动 · 右键/C 开镜(狙击) · F 拾枪</div>
      <div id="mobile-controls" aria-label="触屏操作">
        <div id="move-stick" class="touch-stick" aria-label="移动摇杆">
          <div class="stick-knob"></div>
        </div>
        <div id="aim-stick" class="touch-stick" aria-label="瞄准与射击摇杆">
          <div class="stick-knob"></div>
        </div>
        <div class="touch-actions">
          <button id="touch-scope" class="touch-btn" type="button" aria-label="切换开镜">镜</button>
          <button id="touch-reload" class="touch-btn" type="button" aria-label="换弹">换</button>
          <button id="touch-medkit" class="touch-btn" type="button" aria-label="使用医疗包">医</button>
          <button id="touch-pickup" class="touch-btn" type="button" aria-label="拾取物资">拾</button>
        </div>
      </div>
    </div>

    <div id="pause" class="screen hidden">
      <div class="menu-card small">
        <h2>已暂停</h2>
        <button id="btn-resume" class="btn primary" type="button">继续</button>
        <button id="btn-quit" class="btn ghost" type="button">返回菜单</button>
      </div>
    </div>

    <div id="result" class="screen hidden">
      <div class="menu-card">
        <p class="badge" id="result-badge">胜利</p>
        <h1 id="result-title">Winner Winner<br/>Chicken Dinner!</h1>
        <div class="result-stats">
          <div><span>排名</span><strong id="stat-rank">#1</strong></div>
          <div><span>击杀</span><strong id="stat-kills">0</strong></div>
          <div><span>存活</span><strong id="stat-time">0:00</strong></div>
        </div>
        <button id="btn-again" class="btn primary" type="button">再来一局</button>
        <button id="btn-menu" class="btn ghost" type="button">主菜单</button>
      </div>
    </div>
  </div>
  <div id="share-toast" class="share-toast"></div>
  <div id="boot-ok">网页版已加载 · 选难度后开始</div>
  <script>
${errorBootstrap}
try {
${js}
  var ok = document.getElementById('boot-ok');
  if (ok) setTimeout(function(){ ok.style.display='none'; }, 3500);
} catch (e) {
  window.onerror(String(e && e.message || e), 'inline', 0, 0, e);
}
  </script>
</body>
</html>
`;

// 写根目录 index（本地双击）
fs.writeFileSync(path.join(dir, 'index.html'), html, { encoding: 'utf8' });

// 写 dist 部署目录
const dist = path.join(dir, 'dist');
if (!fs.existsSync(dist)) fs.mkdirSync(dist);
fs.writeFileSync(path.join(dist, 'index.html'), html, { encoding: 'utf8' });
fs.writeFileSync(path.join(dist, '404.html'), html, { encoding: 'utf8' }); // GitHub Pages SPA 友好
fs.writeFileSync(path.join(dist, 'CNAME.example'), '# 若有自定义域名，改名为 CNAME 并填入域名\n');
fs.writeFileSync(
  path.join(dist, 'README.md'),
  `# Battle Royale Lite\n\n打开 index.html 或访问 GitHub Pages 链接即可游玩。\n`,
  'utf8'
);

// 同步干净模块（开发用）
for (const f of ['config.js', 'audio.js', 'world.js', 'zone.js', 'entities.js', 'game.js', 'main.js']) {
  let t = stripBom(fs.readFileSync(path.join(dir, 'js', f), 'utf8'));
  t = t
    .replace(/result\?\.killed/g, 'result && result.killed')
    .replace(/p\.mag\[w\.id\] \?\? 0/g, '(p.mag[w.id] != null ? p.mag[w.id] : 0)');
  fs.writeFileSync(path.join(dir, 'js', f), t, { encoding: 'utf8' });
}
fs.writeFileSync(path.join(dir, 'css/style.css'), stripBom(css), { encoding: 'utf8' });

console.log('built index.html + dist/ bytes=', Buffer.byteLength(html, 'utf8'));
