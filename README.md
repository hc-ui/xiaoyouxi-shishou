# 小游戏试手：大逃杀 · 轻量版 (Battle Royale Lite)

浏览器即玩的俯视角吃鸡：缩圈、搜打装、人机、**狙击开镜**。

## 在线游玩

**https://hc-ui.github.io/xiaoyouxi-shishou/**

把链接发给朋友即可，无需安装。

## 本地打开

双击 `index.html` 或 `open.bat`。

开发构建：

```bash
node _build_single.js
```

产物在 `index.html` 与 `dist/`。

## 功能

- 难度：休闲 / 标准 / 困难  
- 武器：手枪、冲锋枪、步枪、霰弹枪、**狙击枪（右键/C 开镜）**  
- 补给自动拾取、开局装备（休闲）
- 手机双摇杆：移动、瞄准射击、开镜、换弹、医疗、拾取
- 音效、全屏、复制分享链接
- 历史击杀 / 吃鸡次数本地记录
- 命中/淘汰准星反馈与低耗电 HUD、小地图刷新

## 部署

详见 [DEPLOY.md](./DEPLOY.md)。当前使用 GitHub Pages 的 `gh-pages` 分支。
