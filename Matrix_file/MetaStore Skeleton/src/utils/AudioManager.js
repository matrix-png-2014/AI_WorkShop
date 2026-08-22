/**
 * @file AudioManager —— Web Audio 电音合成音效（单例）
 * @description
 * 全部音效由 Web Audio API 实时合成（零外部音频资源）：
 * - playStep()   电音脚步声：方波低频 + 噪声爆破 + 低通扫频 + 反馈延迟
 * - playPickup() 拾取音：锯齿波上扫琶音（经典电音 blip）
 * - playUI()     菜单开关音
 * - playPortal() 传送/出口音：下降滑音 + 混响感
 *
 * 遵守浏览器自动播放策略：首次用户手势时调用 unlock() 初始化 AudioContext。
 * 音效开关 = 主增益归零（不销毁上下文）。
 */

import { CONFIG } from '../config.js';

/** @type {AudioManager|null} */
let _instance = null;

/**
 * 电音合成音效管理器（单例）。
 */
export class AudioManager {
  /**
   * 获取全局实例（惰性创建）。
   * @returns {AudioManager}
   */
  static get instance() {
    if (!_instance) _instance = new AudioManager();
    return _instance;
  }

  constructor() {
    /** @type {AudioContext|null} */
    this.ctx = null;

    /** 主增益节点 */
    this.master = null;

    /** 反馈延迟（电音回声） */
    this._delay = null;

    /** 音效开关状态 */
    this.enabled = CONFIG.audio.enabledByDefault;
  }

  /**
   * 初始化音频上下文（必须在用户手势中调用）。
   * @returns {boolean} 是否成功
   */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return true;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) {
      console.warn('[AudioManager] 当前浏览器不支持 Web Audio');
      return false;
    }
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.enabled ? CONFIG.audio.masterVolume : 0;
    this.master.connect(this.ctx.destination);

    // 电音反馈延迟总线（step/pickup 共用）
    this._delay = this.ctx.createDelay(0.5);
    this._delay.delayTime.value = 0.16;
    const fb = this.ctx.createGain();
    fb.gain.value = 0.22;
    const damp = this.ctx.createBiquadFilter();
    damp.type = 'lowpass';
    damp.frequency.value = 1800;
    this._delay.connect(fb);
    fb.connect(damp);
    damp.connect(this._delay);
    this._delay.connect(this.master);
    return true;
  }

  /**
   * 全局音效开关。
   * @param {boolean} on
   */
  setEnabled(on) {
    this.enabled = on;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(on ? CONFIG.audio.masterVolume : 0, this.ctx.currentTime, 0.03);
    }
  }

  /**
   * 当前开关状态。
   * @returns {boolean}
   */
  isEnabled() {
    return this.enabled;
  }

  /* ------------------------------------------------------------------ */
  /* 音效                                                               */
  /* ------------------------------------------------------------------ */

  /**
   * 电音脚步声。
   * @param {number} [intensity=1] 强度 0~1（奔跑更强）
   */
  playStep(intensity = 1) {
    if (!this._ready()) return;
    const t = this.ctx.currentTime;

    // 低频方波"咚"
    const osc = this.ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(72 + 18 * intensity, t);
    osc.frequency.exponentialRampToValueAtTime(46, t + 0.09);
    const og = this.ctx.createGain();
    og.gain.setValueAtTime(CONFIG.audio.stepVolume * (0.5 + 0.5 * intensity), t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.11);

    // 噪声爆破（脚掌触地质感）
    const noise = this._noiseBuffer(0.05);
    const src = this.ctx.createBufferSource();
    src.buffer = noise;
    const ng = this.ctx.createGain();
    ng.gain.setValueAtTime(CONFIG.audio.stepVolume * 0.5, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(900, t);
    lp.frequency.exponentialRampToValueAtTime(200, t + 0.06);

    osc.connect(og);
    og.connect(this.master);
    og.connect(this._delay);
    src.connect(lp);
    lp.connect(ng);
    ng.connect(this.master);
    ng.connect(this._delay);
    osc.start(t);
    osc.stop(t + 0.12);
    src.start(t);
    src.stop(t + 0.06);
  }

  /**
   * 拾取音（电音 blip：上扫琶音）。
   */
  playPickup() {
    if (!this._ready()) return;
    const t = this.ctx.currentTime;
    const notes = [330, 440, 587, 880];
    notes.forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = freq;
      const g = this.ctx.createGain();
      const at = t + i * 0.045;
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(CONFIG.audio.pickupVolume, at + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.12);
      const hp = this.ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 200;
      osc.connect(hp);
      hp.connect(g);
      g.connect(this.master);
      g.connect(this._delay);
      osc.start(at);
      osc.stop(at + 0.14);
    });
  }

  /**
   * UI 菜单音。
   * @param {boolean} [open=true] 打开/关闭
   */
  playUI(open = true) {
    if (!this._ready()) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(open ? 440 : 330, t);
    osc.frequency.exponentialRampToValueAtTime(open ? 660 : 220, t + 0.08);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(CONFIG.audio.uiVolume, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + 0.12);
  }

  /**
   * 传送/出口音（下滑滑音 + 噪声尾）。
   */
  playPortal() {
    if (!this._ready()) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(880, t);
    osc.frequency.exponentialRampToValueAtTime(110, t + 0.7);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(CONFIG.audio.portalVolume, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
    osc.connect(g);
    g.connect(this.master);
    g.connect(this._delay);
    osc.start(t);
    osc.stop(t + 0.85);
  }

  /* ------------------------------------------------------------------ */
  /* 内部                                                               */
  /* ------------------------------------------------------------------ */

  /**
   * 是否可发声（上下文就绪且开关打开）。
   * @returns {boolean}
   * @private
   */
  _ready() {
    return !!(this.ctx && this.master && this.enabled && this.ctx.state === 'running');
  }

  /**
   * 生成白噪声 Buffer（缓存复用）。
   * @param {number} seconds
   * @returns {AudioBuffer}
   * @private
   */
  _noiseBuffer(seconds) {
    const len = Math.floor(this.ctx.sampleRate * seconds);
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }
}
