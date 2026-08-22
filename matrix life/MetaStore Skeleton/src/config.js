/**
 * @file 全局运行配置（单例对象，便于未来扩展为远程配置下发）
 * @module config
 */

/**
 * 引擎与场景的全局配置。
 * @type {Object}
 */
export const CONFIG = Object.freeze({
  /** 调试开关 */
  debug: Object.freeze({
    /** 是否显示 Stats.js 性能面板 */
    showStats: true,
    /** 是否在控制台输出场景切换等日志 */
    verbose: true,
  }),

  /** 渲染器配置 */
  renderer: Object.freeze({
    antialias: true,
    alpha: false,
    /** 阴影开关：true 时启用预置灯光阴影 */
    enableShadows: false,
    shadowMapType: 'PCFSoft', // PCFSoft | PCF | VSM
    toneMapping: 'ACESFilmic',
    toneMappingExposure: 1.0,
  }),

  /** 相机配置 */
  camera: Object.freeze({
    fov: 60,
    near: 0.1,
    far: 300,
  }),

  /** 第一人称玩家配置 */
  player: Object.freeze({
    /** 视角高度（米） */
    height: 1.6,
    /** 碰撞半径（米） */
    radius: 0.35,
    /** 行走速度（米/秒） */
    walkSpeed: 2.6,
    /** 奔跑倍率（Shift） */
    runFactor: 1.8,
    /** 鼠标灵敏度 */
    mouseSensitivity: 0.0022,
    /** 步长（米），每走一步触发脚步声 */
    stepDistance: 0.68,
    /** 移动端触摸摇杆灵敏度 */
    touchSensitivity: 0.006,
  }),

  /** 输入控制配置（移动端陀螺仪） */
  input: Object.freeze({
    /** 初始模式：'auto' | 'pointer' | 'gyro' */
    initialMode: 'auto',
    /** 陀螺仪视线聚焦（Gaze）时长（毫秒） */
    gazeDwellMs: 1200,
    /** 视线聚焦射线检测间隔（毫秒） */
    gazeIntervalMs: 120,
    /** Gaze 触发后的冷却（毫秒） */
    gazeCooldownMs: 2000,
  }),

  /** 资源管线配置 */
  assets: Object.freeze({
    /** Draco WASM 解码器路径（public/draco，由 postinstall 自动拷贝） */
    dracoDecoderPath: '/draco/',
    /** HDR 环境贴图（Equirectangular）。留空或缺失时回退 RoomEnvironment */
    envHdrUrl: '/textures/studio.hdr',
    /** 仓库内景点云（由 3DGS 转换的标准 PLY） */
    interiorUrl: '/3d/interior.ply',
    /** 商品模型根目录（product-1.glb ~ product-8.glb） */
    productRoot: '/3d/',
    /** 演示图根目录（poster-1.jpg ~ poster-8.jpg） */
    posterRoot: '/3d/',
    /** 商品数量 */
    productCount: 8,
    /** 演示图数量 */
    posterCount: 8,
    /** 单个模型加载超时（毫秒） */
    loadTimeoutMs: 60000,
  }),

  /** 展陈默认布局（管理员模式可调整并持久化） */
  exhibit: Object.freeze({
    /** 每张桌子的商品位数量 */
    productsPerTable: 2,
    /** 默认桌子数量 */
    tableCount: 4,
    /** 默认灯数量 */
    lightCount: 3,
  }),

  /** 管理员模式 */
  admin: Object.freeze({
    /** 管理员密码 SHA-256（明文见工作空间 admin-password.txt，300 位） */
    passwordHash: '97f46ad7e9821374e4111482d51e5b995d6180515b76f9cc3cf4330f96c3edf4',
    /** 布局持久化键名（localStorage） */
    layoutStorageKey: 'meta-store.layout.v1',
    /** 移动步长（米/次按键） */
    moveStep: 0.1,
    /** 快速移动步长（Shift） */
    moveStepFast: 0.5,
    /** 旋转步长（度） */
    rotateStep: 15,
  }),

  /** 音效配置（Web Audio 电音合成） */
  audio: Object.freeze({
    /** 主音量 */
    masterVolume: 0.8,
    /** 脚步声音量 */
    stepVolume: 0.22,
    /** 拾取音音量 */
    pickupVolume: 0.35,
    /** UI 音音量 */
    uiVolume: 0.2,
    /** 传送/出口音音量 */
    portalVolume: 0.3,
    /** 是否默认开启音效 */
    enabledByDefault: true,
  }),

  /** TTS 讲解（本地语音） */
  tts: Object.freeze({
    /** 语速 0.1~10 */
    rate: 1.05,
    /** 音高 0~2 */
    pitch: 1.0,
    /** 优先语音（zh-CN 中文） */
    lang: 'zh-CN',
  }),

  /** LLM 问答服务配置（预留真实 API 对接位） */
  llm: Object.freeze({
    endpoint: '',
    headers: Object.freeze({ 'Content-Type': 'application/json' }),
    typeSpeedMs: 18,
    mockLatency: Object.freeze([600, 1400]),
  }),

  /** 场景过渡（毫秒） */
  transition: Object.freeze({
    fadeOutMs: 450,
    fadeInMs: 450,
  }),
});

/** 便捷取值：阴影映射类型 */
export const SHADOW_MAP_TYPES = Object.freeze({ PCF: 'PCF', PCFSoft: 'PCFSoft', VSM: 'VSM' });
