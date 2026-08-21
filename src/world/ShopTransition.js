/**
 * @file ShopTransition —— 进出店平滑 3D 漫游动画
 * @description
 * 负责玩家进出店铺（或街口）时的流畅 3D 位移动画：
 * - 从当前位置沿 3D 路径移动到目标点
 * - 同时旋转朝向至目标角
 * - 三次缓动（easeInOutCubic），支持防抖与取消
 *
 * 生命周期：
 *   启动 start() -> 每帧 step(delta) 由引擎 update 钩子驱动 -> 完成后调用 onComplete。
 */

import * as THREE from 'three';

/** 缓动函数 */
const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** 角度按最短路径插值 */
function lerpAngle(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

/**
 * 进出店过渡动画。
 */
export class ShopTransition {
  /**
   * @param {import('../core/FirstPersonControls.js').FirstPersonControls} fps
   * @param {Object} [opts]
   * @param {number} [opts.durationMs=900] 动画时长
   */
  constructor(fps, { durationMs = 1000 } = {}) {
    this.fps = fps;
    this.durationMs = durationMs;
    this.running = false;
    this._elapsed = 0;

    /** 起点/终点（位置与朝向） */
    this._from = { pos: null, yaw: 0, pitch: 0 };
    this._to = { pos: null, yaw: 0, pitch: 0 };

    this.onStart = null;
    this.onComplete = null;
  }

  /**
   * 是否正在播放动画。
   * @returns {boolean}
   */
  isRunning() {
    return this.running;
  }

  /**
   * 启动进店/出店动画。
   * @param {Object} to 目标 { position: Vector3, yaw: number, pitch?: number }
   * @param {Object} [opts]
   * @param {number} [opts.durationMs] 覆盖默认时长
   */
  start(to, opts = {}) {
    const cam = this.fps.camera;
    this._from.pos = cam.position.clone();
    this._from.yaw = this.fps.yaw;
    this._from.pitch = this.fps.pitch;
    this._to.pos = to.position.clone();
    this._to.yaw = to.yaw ?? 0;
    this._to.pitch = to.pitch ?? 0;
    this._duration = opts.durationMs ?? this.durationMs;
    this._elapsed = 0;
    this.running = true;
    this.fps.isAnimating = true;
    this.onStart?.();
  }

  /**
   * 每帧推进（由引擎钩子调用）。
   * @param {number} delta 帧间隔（秒）
   * @returns {boolean} 动画是否完成
   */
  step(delta) {
    if (!this.running) return true;
    this._elapsed += delta * 1000;
    let t = Math.min(this._elapsed / this._duration, 1);
    const e = easeInOutCubic(t);

    const cam = this.fps.camera;
    cam.position.lerpVectors(this._from.pos, this._to.pos, e);
    this.fps.yaw = lerpAngle(this._from.yaw, this._to.yaw, e);
    this.fps.pitch = this._from.pitch + (this._to.pitch - this._from.pitch) * e;
    cam.position.y = this.fps.height;

    if (t >= 1) {
      this.running = false;
      this.fps.isAnimating = false;
      this.onComplete?.();
      return true;
    }
    return false;
  }

  /**
   * 立即取消动画（跳转到终点或停在当前位置）。
   * @param {boolean} [snapToEnd=false] true=跳到终点，false=停在当前位置
   */
  cancel(snapToEnd = false) {
    if (!this.running) return;
    if (snapToEnd) {
      const cam = this.fps.camera;
      cam.position.copy(this._to.pos);
      this.fps.yaw = this._to.yaw;
      this.fps.pitch = this._to.pitch;
      cam.position.y = this.fps.height;
    }
    this.running = false;
    this.fps.isAnimating = false;
  }
}
