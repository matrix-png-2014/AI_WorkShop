/**
 * @file EscapeMenu —— ESC 暂停菜单
 * @description
 * 桌面端按 ESC 退出鼠标锁定后自动弹出（pointerlockchange）；
 * 移动端提供屏幕上的菜单按钮。
 *
 * 菜单项：
 * - 继续游戏（重新锁定鼠标）
 * - 音效开关（AudioManager 主增益）
 * - 管理员模式（密码验证 -> AdminPanel）
 * - 退出商店（全屏结束页）
 */

import { AudioManager } from '../utils/AudioManager.js';
import { CONFIG } from '../config.js';

/**
 * ESC 暂停菜单。
 */
export class EscapeMenu {
  /**
   * @param {import('../core/FirstPersonControls.js').FirstPersonControls} fps
   * @param {Object} [opts]
   * @param {() => void} [opts.onAdminRequest] 请求进入管理员模式
   * @param {() => void} [opts.onExit] 退出商店回调
   */
  constructor(fps, { onAdminRequest, onExit } = {}) {
    this.fps = fps;
    this.onAdminRequest = onAdminRequest;
    this.onExit = onExit;

    this.root = document.getElementById('escape-menu');
    this.btnResume = document.getElementById('menu-resume');
    this.btnSound = document.getElementById('menu-sound');
    this.btnAdmin = document.getElementById('menu-admin');
    this.btnExit = document.getElementById('menu-exit');
    this.soundLabel = document.getElementById('menu-sound-label');
    this.pwdPanel = document.getElementById('admin-password-panel');
    this.pwdInput = document.getElementById('admin-password-input');
    this.pwdPaste = document.getElementById('admin-password-paste');
    this.pwdSubmit = document.getElementById('admin-password-submit');
    this.pwdCancel = document.getElementById('admin-password-cancel');
    this.pwdMsg = document.getElementById('admin-password-msg');

    /** 菜单是否可见 */
    this.visible = false;

    /** 抑制自动弹出（管理员模式期间置 true） */
    this.suppressAuto = false;

    this._bind();
    this._syncSoundLabel();
  }

  /**
   * 事件绑定。
   * @private
   */
  _bind() {
    // 注意：fps.onLockChange 由 main.js 统一挂载（多模块共享），
    // 本类不再自行赋值，避免互相覆盖。
    this.btnResume.addEventListener('click', () => {
      AudioManager.instance.playUI(true);
      this.hide();
      this.fps.lock();
    });
    this.btnSound.addEventListener('click', () => {
      const audio = AudioManager.instance;
      audio.setEnabled(!audio.isEnabled());
      audio.playUI(true);
      this._syncSoundLabel();
    });
    this.btnAdmin.addEventListener('click', () => {
      AudioManager.instance.playUI(true);
      this.pwdPanel.hidden = false;
      this.pwdInput.focus();
    });
    this.btnExit.addEventListener('click', () => {
      AudioManager.instance.playPortal();
      this.hide();
      this.onExit?.();
    });

    // 密码面板
    this.pwdCancel.addEventListener('click', () => {
      this.pwdPanel.hidden = true;
      this.pwdMsg.textContent = '';
    });
    this.pwdPaste.addEventListener('click', async () => {
      try {
        this.pwdInput.value = await navigator.clipboard.readText();
      } catch {
        this.pwdMsg.textContent = '⚠️ 剪贴板不可用，请手动粘贴';
      }
    });
    this.pwdSubmit.addEventListener('click', () => this._verifyPassword());
    this.pwdInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this._verifyPassword();
    });

    // 移动端菜单按钮
    document.getElementById('btn-mobile-menu')?.addEventListener('click', () => this.show());
  }

  /**
   * 显示菜单。
   */
  show() {
    if (this.visible) return;
    this.visible = true;
    this.root.classList.add('visible');
    this.fps.unlock();
    AudioManager.instance.playUI(true);
  }

  /**
   * 隐藏菜单。
   */
  hide() {
    this.visible = false;
    this.root.classList.remove('visible');
    this.pwdPanel.hidden = true;
    this.pwdMsg.textContent = '';
  }

  /**
   * 音效按钮文案同步。
   * @private
   */
  _syncSoundLabel() {
    this.soundLabel.textContent = AudioManager.instance.isEnabled() ? '音效：开' : '音效：关';
  }

  /**
   * 校验管理员密码（SHA-256 比对，300 位，忽略空白字符）。
   * @private
   */
  async _verifyPassword() {
    const raw = this.pwdInput.value.replace(/\s+/g, '');
    if (!raw) {
      this.pwdMsg.textContent = '⚠️ 请输入管理员密码（见工作空间 admin-password.txt）';
      return;
    }
    try {
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
      const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
      if (hex === CONFIG.admin.passwordHash) {
        this.pwdMsg.textContent = '✅ 验证通过';
        AudioManager.instance.playPickup();
        setTimeout(() => {
          this.hide();
          this.onAdminRequest?.();
        }, 300);
      } else {
        this.pwdMsg.textContent = '❌ 密码错误';
        AudioManager.instance.playUI(false);
      }
    } catch (err) {
      this.pwdMsg.textContent = `⚠️ 校验失败: ${err.message}`;
    }
  }
}
