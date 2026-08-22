/**
 * @file ChatWindow —— 屏幕空间（Screen Space）商品详情/引言窗口
 * @description
 * 固定在屏幕空间的对话窗口：
 * - 打开时关联当前商品，展示商品演示图、描述与固定简介
 * - 输入问题当前返回固定的默认介绍（本阶段不做 AI，三选一讲解在 GuidePanel）
 * - 预留真实 LLM 服务接口（CONFIG.llm.endpoint）
 */

import { CONFIG } from '../config.js';
import { Typewriter } from '../utils/Typewriter.js';

/**
 * 屏幕空间聊天窗口。
 */
export class ChatWindow {
  /**
   * @param {Object} [opts]
   * @param {HTMLElement} [opts.root] 容器（缺省 #chat-root）
   * @param {import('../core/FirstPersonControls.js').FirstPersonControls} [opts.fps]
   *   第一人称控制器：打开聊天时自动解锁鼠标（可交互），关闭时恢复锁定
   */
  constructor({ root, fps } = {}) {
    this.root = root ?? document.getElementById('chat-root');
    this.fps = fps ?? null;
    this.body = document.getElementById('chat-body');
    this.form = document.getElementById('chat-form');
    this.input = document.getElementById('chat-input');
    this.title = document.getElementById('chat-title');
    this.closeBtn = document.getElementById('chat-close');
    this.sendBtn = document.getElementById('chat-send');

    /** 当前关联商品 */
    this.currentProduct = null;

    /** 当前打字机实例 */
    this._typewriter = null;

    /** 当前请求 AbortController */
    this._abort = null;

    this._bind();
  }

  /**
   * 打开聊天窗口并关联商品。
   * @param {import('../world/ExhibitManager.js').ExhibitProduct} product
   * @param {string} [presetQuestion] 预设问题（点击「详情」时）
   * @param {boolean} [showPoster=false] 是否先展示商品演示图（详情模式）
   */
  open(product, presetQuestion, showPoster = false) {
    this.currentProduct = product;
    this.title.textContent = `AI 导购 · ${product.descriptor.name}`;
    this.root.hidden = false;
    // 解锁鼠标以便操作聊天窗（关闭时恢复锁定）
    this._wasLocked = this.fps?.locked ?? false;
    this.fps?.unlock();
    this._appendMessage('assistant', `你好，我是「${product.descriptor.name}」的 AI 导购，想了解它的工艺、材质或价格，随时问我～`);
    if (showPoster) this._appendPoster(product.descriptor);
    if (presetQuestion) {
      this.ask(presetQuestion);
    } else {
      this.input.value = '';
      this.input.focus();
    }
  }

  /**
   * 聊天窗是否打开（供 main.js 判定是否抑制 ESC 菜单）。
   * @returns {boolean}
   */
  isOpen() {
    return !this.root.hidden;
  }

  /**
   * 追加商品演示图消息（详情模式）。
   * @param {Object} descriptor
   * @private
   */
  _appendPoster(descriptor) {
    if (!descriptor.poster) return;
    const row = document.createElement('div');
    row.className = 'chat-msg chat-assistant';
    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble chat-bubble-poster';
    const img = document.createElement('img');
    img.src = descriptor.poster;
    img.alt = descriptor.name;
    img.className = 'chat-poster-img';
    const desc = document.createElement('div');
    desc.className = 'chat-poster-desc';
    desc.textContent = descriptor.desc ?? '';
    bubble.appendChild(img);
    bubble.appendChild(desc);
    row.appendChild(bubble);
    this.body.appendChild(row);
    this._scrollBottom();
  }

  /**
   * 关闭窗口（中断未完成的回答，必要时恢复鼠标锁定）。
   */
  close() {
    this._abort?.abort();
    this.root.hidden = true;
    this.currentProduct = null;
    if (this._wasLocked) {
      this.fps?.lock();
      this._wasLocked = false;
    }
  }

  /**
   * 发起简单问答（固定简答；本阶段不做 AI）。
   * @param {string} question
   * @returns {Promise<void>}
   */
  async ask(question) {
    if (!this.currentProduct) return;
    const q = question.trim();
    if (!q) return;

    this._appendMessage('user', q);

    const d = this.currentProduct.descriptor;
    const bubble = this._appendMessage('assistant', '');
    const answer = `${d.name}：${d.desc}${d.category ? ` 分类：${d.category}。` : ''}如需深入了解，请点击该商品上方的「讲解」按钮，查看三种可选讲解。`;

    this._typewriter?.removeCursor();
    this._typewriter = new Typewriter(bubble, { speedMs: 14 });
    await this._typewriter.type(answer);
    this._typewriter?.removeCursor();
    this._scrollBottom();
  }

  /* ------------------------------------------------------------------ */
  /* 内部                                                                */
  /* ------------------------------------------------------------------ */

  /**
   * 绑定事件。
   * @private
   */
  _bind() {
    this.form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.ask(this.input.value);
    });
    this.closeBtn.addEventListener('click', () => this.close());
  }

  /**
   * 追加一条消息气泡。
   * @param {'user'|'assistant'} role
   * @param {string} text
   * @returns {HTMLElement} 气泡元素
   * @private
   */
  _appendMessage(role, text) {
    const row = document.createElement('div');
    row.className = `chat-msg chat-${role}`;
    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble';
    bubble.textContent = text;
    row.appendChild(bubble);
    this.body.appendChild(row);
    this._scrollBottom();
    return bubble;
  }

  /**
   * 滚动到底部。
   * @private
   */
  _scrollBottom() {
    this.body.scrollTop = this.body.scrollHeight;
  }
}
