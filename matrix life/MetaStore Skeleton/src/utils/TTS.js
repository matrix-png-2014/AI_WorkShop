/**
 * @file TTS —— 本地语音讲解（Web Speech API）
 * @description
 * 使用浏览器内置的本地语音合成（speechSynthesis，macOS/Windows 系统语音），
 * 零网络请求。用于商品讲解、环境播报等。
 * 注意：speechSynthesis 在部分浏览器需要用户手势后才允许发声，
 * 首次调用前建议先触发一次 silent 预热。
 */

import { CONFIG } from '../config.js';

/**
 * 本地 TTS 讲解器（单例）。
 */
export class TTS {
  /**
   * @returns {TTS} 全局实例
   */
  static get instance() {
    if (!this._instance) this._instance = new TTS();
    return this._instance;
  }

  constructor() {
    this.supported = 'speechSynthesis' in window;
    /** 当前语音 */
    this.voice = null;
    /** 是否静音（跟随音效开关联动由外部控制） */
    this.muted = false;

    if (this.supported) {
      this._loadVoices();
      // 部分浏览器语音列表异步加载
      window.speechSynthesis.onvoiceschanged = () => this._loadVoices();
    }
  }

  /**
   * 选择中文语音（找不到则用任意可用语音）。
   * @private
   */
  _loadVoices() {
    const voices = window.speechSynthesis.getVoices();
    if (!voices.length) return;
    this.voice =
      voices.find((v) => v.lang === CONFIG.tts.lang && v.localService) ||
      voices.find((v) => v.lang.startsWith('zh')) ||
      voices[0];
    if (CONFIG.debug.verbose) console.info('[TTS] 语音:', this.voice?.name, this.voice?.lang);
  }

  /**
   * 朗读文本。
   * @param {string} text
   * @param {Object} [opts]
   * @param {number} [opts.rate] 语速（0.1~10），缺省用配置
   * @param {number} [opts.pitch] 音高（0~2）
   * @param {() => void} [opts.onEnd] 播完回调
   * @returns {boolean} 是否成功发起
   */
  speak(text, { rate = CONFIG.tts.rate, pitch = CONFIG.tts.pitch, onEnd } = {}) {
    if (!this.supported || this.muted || !text) return false;
    this.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = CONFIG.tts.lang;
    u.rate = rate;
    u.pitch = pitch;
    if (this.voice) u.voice = this.voice;
    u.onend = () => onEnd?.();
    u.onerror = () => onEnd?.();
    window.speechSynthesis.speak(u);
    return true;
  }

  /**
   * 商品讲解（预置讲解词模板）。
   * @param {Object} product 商品描述对象 {name, price, desc}
   * @param {Object} [opts]
   * @returns {boolean}
   */
  explain(product, opts = {}) {
    const desc = product.desc || '这款商品采用优质材料精心制作，做工细致，品质可靠。';
    const text = `${product.name}，售价${product.price}。${desc}。您可以在展位前近距离查看实物，如需了解更多，欢迎向 AI 导购提问。`;
    return this.speak(text, opts);
  }

  /**
   * 停止朗读。
   */
  cancel() {
    if (this.supported) window.speechSynthesis.cancel();
  }

  /**
   * 静音开关（与音效开关联动）。
   * @param {boolean} muted
   */
  setMuted(muted) {
    this.muted = muted;
    if (muted) this.cancel();
  }
}
