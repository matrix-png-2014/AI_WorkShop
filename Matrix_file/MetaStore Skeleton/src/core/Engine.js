/**
 * @file Engine —— 引擎核心单例
 * @description
 * 负责 WebGLRenderer / CSS2DRenderer / CSS3DRenderer 的初始化、场景与相机的创建、
 * PMREM HDR 环境光照、主渲染循环（Animation Loop）以及 Stats.js 性能监控。
 *
 * 架构约定：
 * - 本类只负责「渲染基础设施」，不持有任何业务对象（商品 / 传送门等）。
 * - 业务世界（world/）通过 {@link Engine#addUpdateHook} 注入每帧更新逻辑。
 * - 阴影：默认开启 shadowMap 管线，`config.renderer.enableShadows` 置 true 即启用预置灯光阴影。
 */

import * as THREE from 'three';
import Stats from 'stats.js';
import { CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { CSS3DRenderer } from 'three/examples/jsm/renderers/CSS3DRenderer.js';
import { CONFIG, SHADOW_MAP_TYPES } from '../config.js';
import { EnvironmentLoader } from '../utils/EnvironmentLoader.js';

/** @type {Engine|null} 全局唯一实例 */
let _instance = null;

/**
 * 引擎核心：封装渲染器、场景、相机与主循环。
 * 单例模式，通过 {@link Engine.instance} 获取。
 */
export class Engine {
  /**
   * 获取全局引擎实例（未初始化则抛出异常）。
   * @returns {Engine}
   */
  static get instance() {
    if (!_instance) throw new Error('[Engine] 引擎尚未初始化，请先调用 Engine.init()');
    return _instance;
  }

  /**
   * 初始化引擎（幂等）。
   * @param {HTMLElement} [container] 挂载容器，缺省取 #app
   * @returns {Engine}
   */
  static init(container) {
    if (_instance) return _instance;
    _instance = new Engine(container);
    return _instance;
  }

  /**
   * @param {HTMLElement} [container] 挂载容器
   * @throws {Error} 容器不存在或 WebGL 不可用时抛出
   */
  constructor(container) {
    if (_instance) throw new Error('[Engine] 单例已存在，请使用 Engine.instance');
    this.container = container || document.getElementById('app');
    if (!this.container) throw new Error('[Engine] 找不到挂载容器 #app');

    this._hooks = [];      // 每帧更新钩子
    this._renderers = [];  // 所有需要同步渲染的 renderer
    this._clock = new THREE.Clock();
    this._rafId = 0;
    this._running = false;

    this._createRenderer();
    this._createSceneAndCamera();
    this._createCSSOverlays();
    this._createStats();
    this._bindResize();
    this._bindContextLoss();

    // 基础室内环境光（盒状房间无 HDR 背景时的兜底照明）
    this._baseLight = new THREE.AmbientLight(0x9aa4b8, 0.5);
    this.scene.add(this._baseLight);
  }

  /* ------------------------------------------------------------------ */
  /* 初始化                                                              */
  /* ------------------------------------------------------------------ */

  /**
   * 创建 WebGLRenderer：antialias + shadowMap 管线 + 色彩/色调映射。
   * @private
   */
  _createRenderer() {
    const cfg = CONFIG.renderer;
    const canvas = this.container.querySelector('#webgl-canvas');

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: cfg.antialias,
      alpha: cfg.alpha,
      powerPreference: 'high-performance',
    });

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);

    // ---- 阴影管线：骨架阶段预留，通过配置一键启用 ----
    this.renderer.shadowMap.enabled = true;
    const type = SHADOW_MAP_TYPES[cfg.shadowMapType] ?? THREE.PCFSoftShadowMap;
    this.renderer.shadowMap.type = type;

    // ---- 色彩管理与 PBR 色调映射 ----
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping =
      cfg.toneMapping === 'ACESFilmic' ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping;
    this.renderer.toneMappingExposure = cfg.toneMappingExposure;

    this._renderers.push(this.renderer);
  }

  /**
   * 创建场景与透视相机（FOV=60）。
   * @private
   */
  _createSceneAndCamera() {
    const { fov, near, far } = CONFIG.camera;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0b0d12);
    // 轻微雾效增强空间纵深感（不影响 PBR 材质）
    this.scene.fog = new THREE.Fog(0x0b0d12, 40, 120);

    /** 当前实际渲染的场景（默认引擎场景；SceneManager 可通过 useScene 切换） */
    this.renderScene = this.scene;

    this.camera = new THREE.PerspectiveCamera(
      fov,
      this.container.clientWidth / this.container.clientHeight,
      near,
      far
    );
    // 立即应用投影参数（fov/near/far），否则 projectionMatrix 保持单位矩阵，
    // 导致 CSS2D 标签视锥剔除与渲染全部异常
    this.camera.updateProjectionMatrix();
    this.camera.position.set(0, 1.6, 8);

    // ---- PBR 基础：HDR 环境贴图（EquirectangularReflectionMapping） ----
    // 异步加载；HDR 文件缺失时自动回退 RoomEnvironment 程序化光照，保证开箱即用。
    this._envPromise = EnvironmentLoader.load(this, CONFIG.assets.envHdrUrl).catch((err) => {
      console.warn('[Engine] 环境贴图加载失败，回退默认光照:', err);
      return null;
    });
  }

  /**
   * 创建 CSS2D / CSS3D 覆盖渲染层（零性能损耗的 DOM 覆盖层）。
   * @private
   */
  _createCSSOverlays() {
    // ---- CSS2DRenderer：商品标签、空间 UI 面板 ----
    this.css2DRenderer = new CSS2DRenderer();
    this.css2DRenderer.domElement.classList.add('overlay', 'overlay-css2d');
    this.container.appendChild(this.css2DRenderer.domElement);
    this.css2DRenderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this._renderers.push(this.css2DRenderer);

    // ---- CSS3DRenderer：预留的 3D CSS 面板层（如店铺招牌、广告牌） ----
    this.css3DRenderer = new CSS3DRenderer();
    this.css3DRenderer.domElement.classList.add('overlay', 'overlay-css3d');
    this.container.appendChild(this.css3DRenderer.domElement);
    this.css3DRenderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this._renderers.push(this.css3DRenderer);
  }

  /**
   * Stats.js 性能面板。
   * @private
   */
  _createStats() {
    if (!CONFIG.debug.showStats) return;
    this.stats = new Stats();
    this.stats.dom.style.position = 'absolute';
    this.stats.dom.style.top = '0';
    this.stats.dom.style.left = '0';
    this.stats.dom.style.zIndex = '100';
    document.getElementById('stats-container')?.appendChild(this.stats.dom);
  }

  /* ------------------------------------------------------------------ */
  /* 公共 API                                                            */
  /* ------------------------------------------------------------------ */

  /**
   * 切换当前渲染场景（传送门无缝导航核心之一）。
   * CSS2D/CSS3D 覆盖层与 WebGL 同步渲染同一场景。
   * @param {THREE.Scene} scene
   * @returns {Engine} this
   */
  useScene(scene) {
    this.renderScene = scene;
    return this;
  }

  /**
   * 注册每帧更新钩子（在渲染前依次调用）。
   * @param {(delta: number, elapsed: number) => void} hook
   * @returns {() => void} 注销函数
   */
  addUpdateHook(hook) {
    this._hooks.push(hook);
    return () => {
      const i = this._hooks.indexOf(hook);
      if (i >= 0) this._hooks.splice(i, 1);
    };
  }

  /**
   * 启动主渲染循环。
   * @returns {Engine} this（链式调用）
   */
  start() {
    if (this._running) return this;
    this._running = true;
    this._clock.start();
    const loop = () => {
      this._rafId = requestAnimationFrame(loop);
      this._tick();
    };
    loop();
    return this;
  }

  /**
   * 停止主渲染循环。
   * @returns {Engine} this
   */
  stop() {
    this._running = false;
    cancelAnimationFrame(this._rafId);
    return this;
  }

  /**
   * 渲染一帧（供循环调用，也可手动驱动）。
   * @private
   */
  _tick() {
    this.stats?.begin();

    const delta = this._clock.getDelta();
    const elapsed = this._clock.elapsedTime;

    // 业务更新钩子（相机控制 / 场景 / UI 等）
    for (const hook of this._hooks) hook(delta, elapsed);

    // 同步渲染所有覆盖层
    for (const r of this._renderers) r.render(this.renderScene, this.camera);

    this.stats?.end();
  }

  /**
   * 窗口尺寸变化同步。
   * @private
   */
  _bindResize() {
    this._onResize = () => {
      const w = this.container.clientWidth;
      const h = this.container.clientHeight;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      for (const r of this._renderers) r.setSize(w, h);
    };
    window.addEventListener('resize', this._onResize);
  }

  /**
   * WebGL 上下文丢失防御：阻止默认销毁，交由 three 自动恢复。
   * @private
   */
  _bindContextLoss() {
    const canvas = this.renderer.domElement;
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      console.warn('[Engine] WebGL 上下文丢失，等待自动恢复…');
    });
  }

  /**
   * 释放引擎资源（页面卸载时调用）。
   */
  dispose() {
    this.stop();
    window.removeEventListener('resize', this._onResize);
    this.renderer.dispose();
    this.css2DRenderer.domElement.remove();
    this.css3DRenderer.domElement.remove();
    this.stats?.dom.remove();
    _instance = null;
  }
}
