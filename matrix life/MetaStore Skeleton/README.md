# MetaStore Skeleton · 元宇宙 3D 线上商店骨架系统

> Three.js r160+ · Vite · 原生 CSS / CSS2DRenderer / CSS3DRenderer
> 高扩展性骨架：**严禁以球体/立方体等几何体代替商品** —— 商品全部通过 URL 导入 glTF/GLB，
> 加载前以 GridHelper + Box3Helper 占位，放入模型文件即可直接运行。

## 快速开始

```bash
npm install     # 安装依赖（postinstall 自动拷贝 Draco 解码器到 public/draco）
npm run dev     # 启动 Vite dev server -> http://localhost:5173
```

> 说明：项目内 `.npmrc` 使用本地缓存目录（`.npm-cache`），
> 可规避系统级 npm 缓存目录权限问题；如网络代理环境可自行调整。

生产构建：`npm run build && npm run preview`

冒烟测试（需先启动 dev server）：`node scripts/smoke-test.mjs`

## 目录结构

```
├── index.html                  # 应用壳（canvas / HUD / 聊天窗 / 遮罩）
├── vite.config.js
├── scripts/copy-draco.mjs      # Draco WASM 解码器本地化（离线可用）
├── public/
│   ├── manifests/              # ProductManifest JSON 场景清单（动态扩展入口）
│   │   ├── store-a.json        # 主展厅（3 商品 + 1 传送门）
│   │   ├── store-b.json        # 二楼智能生活馆（2 商品 + 1 传送门）
│   │   └── product-manifest.schema.json   # 清单 JSON Schema
│   ├── models/                 # glTF/GLB 模型目录（放入即用）
│   ├── textures/               # HDR 环境贴图目录（studio.hdr）
│   └── draco/                  # 自动生成
└── src/
    ├── main.js                 # 应用装配入口
    ├── config.js               # 全局运行配置
    ├── core/                   # 引擎核心
    │   ├── Engine.js           # WebGLRenderer + CSS2D/CSS3D + 环境光 + 主循环 + Stats
    │   └── InputManager.js     # 混合相机：OrbitControls / 陀螺仪 + 横竖屏补偿
    ├── world/                  # 场景管理
    │   ├── SceneManager.js     # 场景注册 / 无缝传送 / 灯光 / CSS3D 标牌
    │   ├── Product.js          # 商品实体（占位符 + 状态机 + 命中检测）
    │   └── Portal.js           # 传送门（entryPoint / targetScene / spawnPoint）
    ├── ui/                     # 界面逻辑
    │   ├── UIManager.js        # CSS2D 空间标签系统（商品面板 / 传送门铭牌）
    │   ├── ChatWindow.js       # 屏幕空间 AI 问答窗口（打字机）
    │   └── HUD.js              # 模式切换 / 场景信息 / 加载遮罩
    ├── utils/                  # 工具类
    │   ├── ModelLoader.js      # GLTFLoader + DRACOLoader 封装
    │   ├── EnvironmentLoader.js# HDR Equirect 环境贴图（含 RoomEnvironment 回退）
    │   ├── LLMService.js       # LLM 客户端（模拟流式数据 + 真实端点预留）
    │   ├── Typewriter.js       # 打字机效果
    │   └── vendor/DeviceOrientationControls.js  # 官方陀螺仪控制（r163 移除后 vendored）
    └── styles/main.css         # 全部原生 CSS
```

## 功能对照

| 需求 | 实现位置 |
| --- | --- |
| WebGLRenderer antialias + shadowMap 预留 | `core/Engine.js`（`CONFIG.renderer.enableShadows` 一键启用） |
| HDR 环境贴图（EquirectangularReflectionMapping）+ PBR | `utils/EnvironmentLoader.js` |
| 渲染循环 + Stats.js | `core/Engine.js#start/_tick` |
| PerspectiveCamera FOV=60 | `core/Engine.js` |
| OrbitControls + DeviceOrientationControls 双模 | `core/InputManager.js`（UA 自动检测 + UI Toggle） |
| screen.orientation 横竖屏视角补偿 | `utils/vendor/DeviceOrientationControls.js` + `InputManager._onOrientationChange` |
| GLTFLoader + DRACOLoader（本地解码路径） | `utils/ModelLoader.js` |
| 占位符（GridHelper/Box3Helper）+ LoadingManager 进度条 | `world/Product.js` + `ui/HUD.js` |
| ProductManifest JSON（路径/缩放/锚点/元数据） | `public/manifests/*.json` + JSON Schema |
| CSS2D 零性能损耗标签系统 | `ui/UIManager.js` |
| 商品 3D 面板（名称/价格/详情/提问按钮） | `ui/UIManager.js` |
| 屏幕空间聊天窗口 + 模拟 LLM + 打字机 | `ui/ChatWindow.js` + `utils/LLMService.js` |
| Portal（entryPoint/targetScene/spawnPoint）+ Raycaster 触发 | `world/Portal.js` + `main.js` |
| 淡入淡出无缝切换 + 相机/OrbitControls 目标同步 | `world/SceneManager.js#switchTo` |

## 如何接入真实资产

### 1. 商品模型
```bash
cp my-product.glb public/models/
```
在 `public/manifests/store-a.json` 的 `products` 数组新增条目：

```json
{
  "id": "p-new-01",
  "name": "新品",
  "price": "¥999",
  "category": "家具",
  "model": "my-product.glb",
  "position": [0, 0, -1],
  "scale": [1, 1, 1],
  "bounds": { "min": [-0.5, 0, -0.5], "max": [0.5, 1.8, 0.5] },
  "anchor": [0, 2.0, 0],
  "metadata": { "desc": "任意元数据" }
}
```

### 2. 新场景 / 传送门
在 `public/manifests/` 新建 `store-c.json`，在 `src/main.js` 的 `registerScene` 列表注册，
任意场景的 `portals[]` 中 `targetScene: "store-c"` 即可互传。

### 3. 真实 HDR 环境
下载 equirect .hdr 放入 `public/textures/studio.hdr`，自动生效（PBR 光照 + 背景）。

### 4. 真实 LLM 服务
配置 `src/config.js` → `llm.endpoint`，并实现 `utils/LLMService.js#_requestRemote`
（fetch 流式 / SSE / WebSocket 均可，逐块回调 `onChunk` 即自动打字机输出）。

## 移动端陀螺仪说明
- 桌面端自动使用 OrbitControls；手机/平板（coarse pointer）自动切陀螺仪。
- 右上角按钮可手动切换；iOS 13+ 首次使用需点击「启用陀螺仪」授权。
- 陀螺仪模式下屏幕中心出现准星：**注视传送门 1.2 秒** 即可传送（Gaze 触发）。

## 交互速览
| 操作 | 效果 |
| --- | --- |
| 鼠标拖拽 / 滚轮 | 旋转 / 缩放视角（OrbitControls） |
| 点击传送门 | 淡出 -> 瞬移 -> 淡入（无缝切换场景） |
| 点击商品 | 打开 AI 导购聊天窗口 |
| 商品面板「详情」 | 预设问题直达 AI 问答 |
| 注视传送门 1.2s（陀螺仪模式） | Gaze 传送 |
