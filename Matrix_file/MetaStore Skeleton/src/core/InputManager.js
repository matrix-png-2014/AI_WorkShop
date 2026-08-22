/**
 * @file InputManager —— 混合交互输入（单例）
 * @description
 * 第一人称视角下的双模输入：
 * - pointer：桌面端（Pointer Lock 鼠标转向 + WASD，由 FirstPersonControls 管理）
 * - gyro   ：移动端陀螺仪视角（增量式融合进 FirstPersonControls 的 yaw/pitch，
 *            与虚拟摇杆移动共存；screen.orientation 横竖屏切换时重置基准防跳变）
 *
 * 职责：
 * - UA 自动检测 + 手动切换
 * - iOS 13+ DeviceOrientationEvent.requestPermission() 权限引导
 * - 视线聚焦（Gaze）射线源：商品注视讲解、门注视退出
 */

import * as THREE from 'three';
import { Engine } from './Engine.js';
import { CONFIG } from '../config.js';

/** @type {InputManager|null} 全局唯一实例 */
let _instance = null;

/** 输入模式枚举 */
export const ControlMode = Object.freeze({
  AUTO: 'auto',
  POINTER: 'pointer',
  GYRO: 'gyro',
});

/**
 * 混合输入单例。
 */
export class InputManager {
  /**
   * @returns {InputManager}
   */
  static get instance() {
    if (!_instance) throw new Error('[InputManager] 尚未初始化');
    return _instance;
  }

  /**
   * 初始化（幂等）。
   * @param {Object} opts
   * @param {import('./FirstPersonControls.js').FirstPersonControls} opts.fps 第一人称控制器
   * @param {string} [opts.mode='auto']
   * @returns {InputManager}
   */
  static init(opts) {
    if (_instance) return _instance;
    _instance = new InputManager(opts);
    return _instance;
  }

  /**
   * @param {Object} opts
   * @private
   */
  constructor({ fps, mode = CONFIG.input.initialMode }) {
    this.engine = Engine.instance;
    this.fps = fps;
    this.mode = mode;

    /** 当前生效模式 */
    this._activeMode = ControlMode.POINTER;

    this._gazeVector = new THREE.Vector2(0, 0);
    this._gazeTarget = null;
    this._gazeTimer = 0;
    this._gazeCooldownUntil = 0;
    this._gazeLocked = false;

    // 陀螺仪增量基准
    this._gyroBase = { alpha: null, beta: null, gamma: null, orient: 0 };
    this._gyroSupported = 'DeviceOrientationEvent' in window;

    this._applyMode(mode === ControlMode.AUTO ? this._detectMode() : mode);
    window.addEventListener('orientationchange', this._onOrientationChange);
    document.addEventListener('visibilitychange', this._onVisibilityChange);
  }

  /* ------------------------------------------------------------------ */
  /* 公共 API                                                           */
  /* ------------------------------------------------------------------ */

  /**
   * 当前生效模式。
   * @returns {'pointer'|'gyro'}
   */
  get activeMode() {
    return this._activeMode;
  }

  /**
   * 设置模式（'auto' 先检测）。
   * @param {string} mode
   * @returns {InputManager} this
   */
  setMode(mode) {
    this.mode = mode;
    this._applyMode(mode === ControlMode.AUTO ? this._detectMode() : mode);
    return this;
  }

  /**
   * 切换模式（UI Toggle）。
   * @returns {'pointer'|'gyro'}
   */
  toggleMode() {
    const next = this._activeMode === ControlMode.GYRO ? ControlMode.POINTER : ControlMode.GYRO;
    this.setMode(next);
    return next;
  }

  /**
   * 请求陀螺仪权限（iOS 13+）。
   * @returns {Promise<boolean>}
   */
  async requestGyroPermission() {
    const D = window.DeviceOrientationEvent;
    if (D && typeof D.requestPermission === 'function') {
      try {
        const state = await D.requestPermission();
        if (state !== 'granted') {
          console.warn('[InputManager] 陀螺仪权限被拒绝:', state);
          return false;
        }
      } catch (err) {
        console.warn('[InputManager] 陀螺仪权限请求失败:', err);
        return false;
      }
    }
    this._resetGyroBase();
    if (this.mode === ControlMode.AUTO || this.mode === ControlMode.GYRO) {
      this._applyMode(ControlMode.GYRO);
    }
    return true;
  }

  /**
   * 每帧更新：陀螺仪增量融合 + 移动（由引擎钩子调用）。
   * @param {number} delta
   */
  update(delta) {
    if (this._activeMode === ControlMode.GYRO) {
      // 陀螺仪增量已由 deviceorientation 事件写入 fps.yaw/pitch
      // （事件驱动，见 _onDeviceOrientation）
    }
    this.fps.update(delta);
  }

  /**
   * 以屏幕中心构造射线。
   * @param {number} [ndcX=0]
   * @param {number} [ndcY=0]
   * @returns {THREE.Raycaster}
   */
  createRaycaster(ndcX = 0, ndcY = 0) {
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.engine.camera);
    return raycaster;
  }

  /**
   * 当前相机朝向射线。
   * @returns {THREE.Ray}
   */
  get gazeRay() {
    return this.createRaycaster(this._gazeVector.x, this._gazeVector.y).ray;
  }

  /**
   * 视线聚焦检测（陀螺仪模式用）。
   * @param {Array<{hitTest(ray): boolean, onGaze?: Function, onGazeEnter?: Function, onGazeLeave?: Function}>} targets
   * @param {number} delta
   * @returns {Object|null}
   */
  updateGaze(targets, delta) {
    if (targets.length === 0) return null;
    if (this._gazeCooldownUntil > performance.now()) return this._gazeTarget;
    const hit = targets.find((t) => t.hitTest(this.gazeRay));

    // 重新注视锁：触发后须先移开视线
    if (this._gazeLocked) {
      if (hit === null) this._gazeLocked = false;
      return this._gazeTarget;
    }

    if (hit === this._gazeTarget) {
      if (hit) {
        this._gazeTimer += delta * 1000;
        hit.onGazeProgress?.(Math.min(this._gazeTimer / CONFIG.input.gazeDwellMs, 1));
        if (this._gazeTimer >= CONFIG.input.gazeDwellMs) {
          hit.onGaze?.();
          this._gazeTimer = 0;
          this._gazeCooldownUntil = performance.now() + CONFIG.input.gazeCooldownMs;
          this._gazeLocked = true;
        }
      }
    } else {
      this._gazeTarget?.onGazeLeave?.();
      this._gazeTarget = hit;
      this._gazeTimer = 0;
      hit?.onGazeEnter?.();
    }
    return this._gazeTarget;
  }

  /**
   * 重置注视状态（传送/切换时调用）。
   */
  resetGaze() {
    this._gazeTarget?.onGazeLeave?.();
    this._gazeTarget = null;
    this._gazeTimer = 0;
  }

  /* ------------------------------------------------------------------ */
  /* 内部                                                               */
  /* ------------------------------------------------------------------ */

  /**
   * 设备检测。
   * @returns {'pointer'|'gyro'}
   * @private
   */
  _detectMode() {
    const coarse = window.matchMedia?.('(pointer: coarse)').matches;
    const small = window.innerWidth < 1024;
    const touch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    return coarse && small && touch && this._gyroSupported ? ControlMode.GYRO : ControlMode.POINTER;
  }

  /**
   * 应用模式。
   * @param {'pointer'|'gyro'} mode
   * @private
   */
  _applyMode(mode) {
    this._activeMode = mode;
    if (mode === ControlMode.GYRO) {
      this._resetGyroBase();
      window.addEventListener('deviceorientation', this._onDeviceOrientation);
      console.info('[InputManager] 输入模式 -> gyro（陀螺仪）');
    } else {
      window.removeEventListener('deviceorientation', this._onDeviceOrientation);
      console.info('[InputManager] 输入模式 -> pointer（鼠标/键盘）');
    }
  }

  /**
   * 重置陀螺仪增量基准（横竖屏切换/进入 gyro 时调用，防视角跳变）。
   * @private
   */
  _resetGyroBase() {
    this._gyroBase = {
      alpha: null,
      beta: null,
      gamma: null,
      orient: this._screenOrientationAngle(),
    };
  }

  /**
   * deviceorientation 事件：增量融合进 fps.yaw/pitch。
   * 桌面浏览器可能发射 null 值事件，忽略之。
   * @param {DeviceOrientationEvent} e
   * @private
   */
  _onDeviceOrientation = (e) => {
    if (e.alpha === null || e.beta === null || e.gamma === null) return;
    const base = this._gyroBase;
    const alpha = e.alpha;
    const beta = e.beta;
    const gamma = e.gamma;

    if (base.alpha !== null) {
      // 方位角增量 -> yaw（注意 alpha 逆时针为正，屏幕方向补偿）
      let dAlpha = alpha - base.alpha;
      if (dAlpha > 180) dAlpha -= 360;
      if (dAlpha < -180) dAlpha += 360;
      this.fps.yaw -= THREE.MathUtils.degToRad(dAlpha);

      // 俯仰增量 -> pitch
      const dBeta = beta - base.beta;
      this.fps.pitch -= THREE.MathUtils.degToRad(dBeta);
      this.fps.pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, this.fps.pitch));

      // 翻滚增量 -> 补偿到 yaw（横竖屏旋转补偿）
      const dGamma = gamma - base.gamma;
      if (Math.abs(dGamma) > 30) {
        this.fps.yaw += THREE.MathUtils.degToRad(dGamma) * 0.5;
      }
    }
    base.alpha = alpha;
    base.beta = beta;
    base.gamma = gamma;
  };

  /**
   * 横竖屏切换：重置基准，避免补偿跳变。
   * @private
   */
  _onOrientationChange = () => {
    this._resetGyroBase();
    console.info(`[InputManager] 屏幕方向变化 angle=${this._screenOrientationAngle()}°（基准已重置）`);
  };

  /**
   * 回到前台恢复传感器。
   * @private
   */
  _onVisibilityChange = () => {
    if (document.visibilityState === 'visible' && this._activeMode === ControlMode.GYRO) {
      this._resetGyroBase();
    }
  };

  /**
   * 屏幕方向角。
   * @returns {number}
   * @private
   */
  _screenOrientationAngle() {
    const so = window.screen?.orientation;
    if (so && typeof so.angle === 'number') return so.angle;
    return typeof window.orientation === 'number' ? window.orientation : 0;
  }

  /**
   * 释放资源。
   */
  dispose() {
    window.removeEventListener('deviceorientation', this._onDeviceOrientation);
    window.removeEventListener('orientationchange', this._onOrientationChange);
    document.removeEventListener('visibilitychange', this._onVisibilityChange);
    _instance = null;
  }
}
