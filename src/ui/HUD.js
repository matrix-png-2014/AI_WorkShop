/**
 * @file HUD —— 平视显示界面（模式切换 / 场景信息 / 加载遮罩）
 */

import { ControlMode } from '../core/InputManager.js';

/**
 * HUD 控制器。
 */
export class HUD {
  /**
   * @param {import('../core/InputManager.js').InputManager} input
   * @param {(mode: string) => void} onModeChange
   */
  constructor(input, onModeChange) {
    this.input = input;
    this.fps = input.fps;
    this.onModeChange = onModeChange;

    this.sceneNameEl = document.getElementById('scene-name');
    this.sceneHintEl = document.getElementById('scene-hint');
    this.toggleBtn = document.getElementById('btn-toggle-mode');
    this.gyroBtn = document.getElementById('btn-request-gyro');
    this.crosshair = document.getElementById('crosshair');
    this.loadingOverlay = document.getElementById('loading-overlay');
    this.loadingBar = document.getElementById('loading-bar');
    this.loadingText = document.getElementById('loading-text');

    this._bind();
    this._syncToggleLabel();
    this._syncCrosshair();
  }

  /**
   * @private
   */
  _bind() {
    this.toggleBtn.addEventListener('click', () => {
      const mode = this.input.toggleMode();
      this.onModeChange?.(mode);
      this._syncToggleLabel();
      this._syncCrosshair();
    });

    this.gyroBtn.addEventListener('click', async () => {
      const ok = await this.input.requestGyroPermission();
      this.gyroBtn.hidden = true;
      if (ok) {
        this._syncToggleLabel();
        this._syncCrosshair();
      }
    });
    const D = window.DeviceOrientationEvent;
    if (D && typeof D.requestPermission === 'function') {
      this.gyroBtn.hidden = false;
    }
  }

  /**
   * 指针锁定状态变化（由 main.js 统一回调，避免多个模块互相覆盖）。
   * @param {boolean} locked
   */
  onFpsLockChange(locked) {
    this._syncCrosshair();
  }

  /**
   * @private
   */
  _syncToggleLabel() {
    const map = { [ControlMode.POINTER]: '鼠标', [ControlMode.GYRO]: '陀螺仪' };
    const cur = map[this.input.activeMode] ?? '鼠标';
    this.toggleBtn.textContent = this.input.mode === ControlMode.AUTO
      ? `控制：自动（${cur}）`
      : `控制：${cur}`;
  }

  /**
   * @private
   */
  _syncCrosshair() {
    // 准星：指针锁定（桌面瞄准拾取）或陀螺仪（移动端注视）时显示
    const show = this.input.activeMode === ControlMode.GYRO || this.fps.locked;
    this.crosshair.classList.toggle('visible', show);
  }

  /**
   * 场景信息。
   * @param {Object} info
   */
  setSceneInfo(info) {
    this.sceneNameEl.textContent = info.name;
    this.sceneHintEl.textContent = info.description ?? '';
  }

  /**
   * 全局加载遮罩。
   * @param {number} [percent]
   */
  showLoading(percent = 0) {
    this.loadingOverlay.classList.add('visible');
    this.setLoadingProgress(percent);
  }

  /**
   * @param {number} percent 0~100
   */
  setLoadingProgress(percent) {
    const p = Math.min(100, Math.max(0, percent));
    this.loadingBar.style.width = `${p}%`;
    this.loadingText.textContent = `${Math.round(p)}%`;
  }

  /**
   * 隐藏加载遮罩。
   */
  hideLoading() {
    this.loadingOverlay.classList.remove('visible');
  }
}
