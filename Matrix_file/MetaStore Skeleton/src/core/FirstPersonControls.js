/**
 * @file FirstPersonControls —— 第一人称视角控制器
 * @description
 * 玩家 = 纯视角（无身体模型）：
 * - 桌面端：Pointer Lock 鼠标转向 + WASD/方向键移动 + Shift 奔跑
 * - 移动端：触摸摇杆（屏幕左侧拖动）移动 + 拖拽/陀螺仪转向（由 InputManager 切换）
 * - 碰撞：与场景 colliders（Box3 列表）做水平圆柱碰撞，垂直方向自由
 * - 步进：移动累计距离达到 stepDistance 触发电音脚步声（AudioManager）
 *
 * 事件：
 * - onLockChange(locked)  鼠标锁定状态变化（ESC 退出锁定 -> 弹出菜单）
 * - onStep()              每步触发（音频由 AudioManager 播放）
 */

import { CONFIG } from '../config.js';

/**
 * 第一人称控制器。
 */
export class FirstPersonControls {
  /**
   * @param {import('three').Camera} camera
   * @param {HTMLElement} domElement 指针锁定目标（canvas）
   * @param {Object} [opts]
   * @param {number} [opts.height] 视角高度
   * @param {number} [opts.radius] 碰撞半径
   */
  constructor(camera, domElement, { height = CONFIG.player.height, radius = CONFIG.player.radius } = {}) {
    this.camera = camera;
    this.domElement = domElement;

    this.height = height;
    this.radius = radius;

    /** 欧拉角（YXZ：yaw 水平 / pitch 俯仰） */
    this.yaw = 0;
    this.pitch = 0;

    /** 碰撞体列表（Box3，世界坐标） */
    this.colliders = [];

    /** 可移动边界（Box3，缺省无边界） */
    this.bounds = null;

    /** 按键状态 */
    this.keys = new Set();

    /** 触摸摇杆状态 */
    this.joystick = { active: false, x: 0, y: 0 };

    /** 累计步进距离 */
    this._stepAccum = 0;

    /** 是否处于鼠标锁定（桌面） */
    this.locked = false;

    /** 临时向量 */
    this._tmp = { x: 0, z: 0 };

    this._bindEvents();
  }

  /* ------------------------------------------------------------------ */
  /* 事件绑定                                                           */
  /* ------------------------------------------------------------------ */

  /**
   * @private
   */
  _bindEvents() {
    // 键盘
    window.addEventListener('keydown', (e) => {
      if (e.code.startsWith('Key') || e.code.startsWith('Arrow') || e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
        this.keys.add(e.code);
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));

    // 鼠标锁定（桌面）
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.domElement;
      this.onLockChange?.(this.locked);
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.yaw -= e.movementX * CONFIG.player.mouseSensitivity;
      this.pitch -= e.movementY * CONFIG.player.mouseSensitivity;
      this.pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, this.pitch));
    });

    // 触摸摇杆（移动端）：屏幕左侧拖动 = 移动向量
    this.domElement.addEventListener('touchstart', (e) => {
      const t = e.changedTouches[0];
      if (t.clientX < window.innerWidth / 2) {
        this.joystick.active = true;
        this.joystick.x = 0;
        this.joystick.y = 0;
        this._joyBase = { x: t.clientX, y: t.clientY };
      }
    }, { passive: true });
    this.domElement.addEventListener('touchmove', (e) => {
      if (!this.joystick.active) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - this._joyBase.x;
      const dy = t.clientY - this._joyBase.y;
      const len = Math.hypot(dx, dy);
      const max = 70;
      const clamp = Math.min(len, max) / max;
      this.joystick.x = (dx / (len || 1)) * clamp;
      this.joystick.y = (dy / (len || 1)) * clamp;
      // 同时做视角拖拽
      this.yaw -= dx * CONFIG.player.touchSensitivity;
      this.pitch -= dy * CONFIG.player.touchSensitivity * 0.5;
      this.pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, this.pitch));
      e.preventDefault();
    }, { passive: false });
    window.addEventListener('touchend', () => {
      this.joystick.active = false;
      this.joystick.x = 0;
      this.joystick.y = 0;
    });
  }

  /* ------------------------------------------------------------------ */
  /* 公共 API                                                           */
  /* ------------------------------------------------------------------ */

  /**
   * 请求鼠标锁定（桌面端进入游戏）。
   * @returns {boolean}
   */
  lock() {
    if (!this.domElement.requestPointerLock) return false;
    try {
      this.domElement.requestPointerLock();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 退出鼠标锁定（ESC 由浏览器自动触发）。
   */
  unlock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  /**
   * 设置碰撞体集合与边界。
   * @param {import('three').Box3[]} colliders
   * @param {import('three').Box3|null} [bounds]
   */
  setColliders(colliders, bounds = null) {
    this.colliders = colliders;
    this.bounds = bounds;
  }

  /**
   * 重置到出生点并清空视角角。
   * @param {import('three').Vector3} position
   * @param {number} [yawRad]
   */
  teleport(position, yawRad = 0) {
    this.camera.position.copy(position);
    this.yaw = yawRad;
    this.pitch = 0;
  }

  /**
   * 动画期间是否暂停玩家输入（由进出店自动漫游动画控制）。
   * @type {boolean}
   */
  isAnimating = false;

  /**
   * 每帧更新（由引擎钩子调用）。
   * @param {number} delta 帧间隔（秒）
   */
  update(delta) {
    if (delta > 0.1) delta = 0.1; // 防大帧跳变

    // 动画期间：仅同步朝向（由动画驱动 yaw/pitch/位置），跳过玩家移动输入
    if (this.isAnimating) {
      this.camera.rotation.order = 'YXZ';
      this.camera.rotation.y = this.yaw;
      this.camera.rotation.x = this.pitch;
      this.camera.rotation.z = 0;
      this.camera.position.y = this.height;
      return;
    }

    // 1) 朝向
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;
    this.camera.rotation.z = 0;

    // 2) 移动输入
    const fwd = (this.keys.has('KeyW') || this.keys.has('ArrowUp') ? 1 : 0)
      - (this.keys.has('KeyS') || this.keys.has('ArrowDown') ? 1 : 0);
    const strafe = (this.keys.has('KeyD') || this.keys.has('ArrowRight') ? 1 : 0)
      - (this.keys.has('KeyA') || this.keys.has('ArrowLeft') ? 1 : 0);

    let mx = this.joystick.x;
    let my = this.joystick.y;
    const joyLen = Math.hypot(mx, my);

    let moveX = 0;
    let moveZ = 0;
    if (fwd || strafe || joyLen > 0.08) {
      const speed = (this.keys.has('ShiftLeft') || this.keys.has('ShiftRight'))
        ? CONFIG.player.walkSpeed * CONFIG.player.runFactor
        : CONFIG.player.walkSpeed;
      const sin = Math.sin(this.yaw);
      const cos = Math.cos(this.yaw);
      // 键盘移动（世界坐标系，仅水平）
      if (fwd || strafe) {
        const len = Math.hypot(fwd, strafe) || 1;
        const fx = (fwd * -sin + strafe * cos) / len;
        const fz = (fwd * -cos - strafe * sin) / len;
        moveX += fx * speed;
        moveZ += fz * speed;
      }
      // 摇杆移动（摇杆 y 为前后，x 为左右，屏幕坐标 -> 世界）
      if (joyLen > 0.08) {
        const jx = my * -sin + mx * cos;
        const jz = my * -cos - mx * sin;
        moveX += jx * speed * joyLen;
        moveZ += jz * speed * joyLen;
      }

      // 3) 位移 + 碰撞
      const step = speed * delta;
      this._moveAxis('x', moveX * delta, step);
      this._moveAxis('z', moveZ * delta, step);

      // 4) 步进音效
      const dist = Math.hypot(moveX * delta, moveZ * delta);
      this._stepAccum += dist;
      if (this._stepAccum >= CONFIG.player.stepDistance) {
        this._stepAccum = 0;
        this.onStep?.(this.keys.has('ShiftLeft') ? 1.25 : 1);
      }
    }

    // 5) 视角高度固定
    this.camera.position.y = this.height;
  }

  /**
   * 单轴移动 + 碰撞解析（先碰撞后移动）。
   * @param {'x'|'z'} axis
   * @param {number} delta
   * @param {number} maxStep
   * @private
   */
  _moveAxis(axis, delta, maxStep) {
    if (delta === 0) return;
    const sign = Math.sign(delta);
    const amount = Math.min(Math.abs(delta), maxStep);
    this.camera.position[axis] += sign * amount;

    // 边界
    if (this.bounds) {
      const p = this.camera.position;
      const r = this.radius;
      if (p.x < this.bounds.min.x + r) p.x = this.bounds.min.x + r;
      if (p.x > this.bounds.max.x - r) p.x = this.bounds.max.x - r;
      if (p.z < this.bounds.min.z + r) p.z = this.bounds.min.z + r;
      if (p.z > this.bounds.max.z - r) p.z = this.bounds.max.z - r;
    }

    // 碰撞体（水平圆柱 vs AABB）
    const r = this.radius;
    for (const box of this.colliders) {
      if (this.camera.position.y < box.min.y - 0.2 || this.camera.position.y > box.max.y + 0.2) continue;
      const cx = this.camera.position.x;
      const cz = this.camera.position.z;
      const nx = Math.max(box.min.x, Math.min(cx, box.max.x));
      const nz = Math.max(box.min.z, Math.min(cz, box.max.z));
      const dx = cx - nx;
      const dz = cz - nz;
      const d2 = dx * dx + dz * dz;
      if (d2 < r * r) {
        // 推出碰撞体
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2);
          const push = (r - d) / d;
          this.camera.position.x += dx * push;
          this.camera.position.z += dz * push;
        } else {
          // 在内部：沿移动方向推出
          this.camera.position[axis] -= sign * (r + 0.01);
        }
      }
    }
  }

  /**
   * 释放资源。
   */
  dispose() {
    this.unlock();
    window.removeEventListener('keydown', this._onKeyDown);
  }
}
