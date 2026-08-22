/**
 * @file GuidePanel —— 展区讲解面板（三选一 + 换一批）
 * @description
 * 屏幕空间讲解面板：
 * - 打开时关联商品，从商品 catalog 的 choices[]（固定题库）中随机抽取 3 项作为选项展示
 * - 点击「换一批」重新随机抽取（轮换固定答案）
 * - 点击选项后展示对应固定回答（打字机输出）
 *
 * 本阶段不做 AI，所有答案均为 PPRODUCT_CATALOG 中的固定文案。
 */

import { Typewriter } from '../utils/Typewriter.js';

/**
 * 展区讲解面板。
 */
export class GuidePanel {
  /**
   * @param {Object} [opts]
   * @param {import('../core/FirstPersonControls.js').FirstPersonControls} [opts.fps]
   */
  constructor({ fps } = {}) {
    this.root = document.getElementById('guide-panel');
    this.titleEl = document.getElementById('guide-title');
    this.body = document.getElementById('guide-body');
    this.btnShuffle = document.getElementById('guide-shuffle');
    this.btnClose = document.getElementById('guide-close');
    this.fps = fps ?? null;

    /** 当前关联商品 */
    this.currentProduct = null;

    /** 当前展示的 3 个选项（含 answer） */
    this.currentChoices = [];

    /** 打字机 */
    this._typewriter = null;

    this._bind();
  }

  /**
   * 打开讲解面板并关联商品。
   * @param {import('../world/ExhibitManager.js').ExhibitProduct} product
   */
  open(product) {
    this.currentProduct = product;
    this.titleEl.textContent = `🗺 ${product.descriptor.name} · 展区讲解`;
    this.root.classList.add('visible');
    // 解锁鼠标便于操作面板（关闭时恢复锁定）
    this._wasLocked = this.fps?.locked ?? false;
    this.fps?.unlock();
    this._shuffleChoices();
  }

  /**
   * 关闭面板。
   */
  close() {
    this.root.classList.remove('visible');
    this.currentProduct = null;
    if (this._wasLocked) {
      this.fps?.lock();
      this._wasLocked = false;
    }
  }

  /**
   * 面板是否打开（main.js 据此抑制 ESC 菜单）。
   * @returns {boolean}
   */
  isOpen() {
    return this.root.classList.contains('visible');
  }

  /* ------------------------------------------------------------------ */
  /* 内部                                                               */
  /* ------------------------------------------------------------------ */

  /**
   * 抽选 3 个选项并渲染。
   * @private
   */
  _shuffleChoices() {
    if (!this.currentProduct) return;
    const pool = this.currentProduct.descriptor.choices;
    if (!pool?.length) {
      this.body.innerHTML = '<div class="guide-empty">该商品暂无讲解内容。</div>';
      this.currentChoices = [];
      return;
    }
    // 洗牌后取前 3（或全部）
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    this.currentChoices = shuffled.slice(0, Math.min(3, pool.length));
    this._renderChoices();
  }

  /**
   * 渲染 3 选项按钮。
   * @private
   */
  _renderChoices() {
    this.body.innerHTML = '';
    const askLine = document.createElement('div');
    askLine.className = 'guide-ask';
    askLine.textContent = '你想了解哪一方面？';
    this.body.appendChild(askLine);

    for (const choice of this.currentChoices) {
      const btn = document.createElement('button');
      btn.className = 'menu-btn guide-option';
      btn.textContent = choice.label;
      btn.type = 'button';
      btn.addEventListener('click', () => this._showAnswer(choice));
      this.body.appendChild(btn);
    }

    const hint = document.createElement('div');
    hint.className = 'guide-hint';
    hint.textContent = '💡 点「换一批」可更换一组问题';
    this.body.appendChild(hint);
  }

  /**
   * 展示所选选项的回答（打字机）。
   * @param {Object} choice
   * @private
   */
  async _showAnswer(choice) {
    // 移除选项按钮，仅保留回答区
    this.body.innerHTML = '';
    const qLine = document.createElement('div');
    qLine.className = 'guide-q';
    qLine.textContent = choice.label.replace(/^\S+\s/, ''); // 去掉 emoji 前缀
    this.body.appendChild(qLine);

    const answer = document.createElement('div');
    answer.className = 'guide-answer';
    this.body.appendChild(answer);

    this._typewriter?.removeCursor();
    this._typewriter = new Typewriter(answer, { speedMs: 22 });
    // maxMs=6000：6 秒内未打完则直接补全，防止 headless/后台 setTimeout 节流卡住
    await this._typewriter.type(choice.answer, { maxMs: 6000 });

    // 完成后提供「返回选项 / 换一批」
    const back = document.createElement('button');
    back.className = 'menu-btn guide-option';
    back.textContent = '◀ 返回选项';
    back.type = 'button';
    back.addEventListener('click', () => this._shuffleChoices());
    this.body.appendChild(back);
  }

  /**
   * 绑定事件。
   * @private
   */
  _bind() {
    this.btnClose.addEventListener('click', () => this.close());
    this.btnShuffle.addEventListener('click', () => this._shuffleChoices());
  }
}
