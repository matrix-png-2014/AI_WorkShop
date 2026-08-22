/**
 * @file Typewriter —— 打字机效果工具
 * @description 将文本以逐字方式写入 DOM 元素，支持光标、速度配置与中断。
 */

/**
 * 打字机控制器。
 */
export class Typewriter {
  /**
   * @param {HTMLElement} element 目标元素（文本写入其 textContent）
   * @param {Object} [opts]
   * @param {number} [opts.speedMs=18] 每字符间隔（毫秒）
   * @param {boolean} [opts.showCursor=true] 是否显示闪烁光标
   */
  constructor(element, { speedMs = 18, showCursor = true } = {}) {
    this.element = element;
    this.speedMs = speedMs;
    this._timer = 0;
    this._cursor = null;
    if (showCursor) {
      // 用纯 CSS 绘制的光标（2px 蓝色竖条），不依赖任何字体字形，
      // 避免在缺少「▍」之类字形时回退成实心方块（即用户看到的「实心正方体」）。
      this._cursor = document.createElement('span');
      this._cursor.className = 'typewriter-cursor';
      this._cursor.setAttribute('aria-hidden', 'true');
    }
  }

  /**
   * 逐字输出文本。
   * @param {string} text
   * @param {Object} [opts]
   * @param {boolean} [opts.clear=false] 先清空内容
   * @param {AbortSignal} [opts.signal] 中断信号
   * @param {number} [opts.maxMs=null] 输出的最大耗时（毫秒）；超出未完成则直接补全，
   *   防止 setTimeout 在 headless/后台被节流导致打字卡住。
   * @returns {Promise<void>} 全部输出完毕后 resolve
   */
  async type(text, { clear = false, signal = null, maxMs = null } = {}) {
    if (clear) this.clear();
    const chars = Array.from(text);
    const start = performance.now();
    for (const ch of chars) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      this.element.textContent += ch;
      this._appendCursor();
      const elapsed = performance.now() - start;
      if (maxMs && elapsed > maxMs) {
        // 超时：跳过剩余逐字，一次性补全剩余文本
        this.element.textContent = text;
        this._appendCursor();
        return;
      }
      await this._sleep(this.speedMs, signal);
    }
    this._appendCursor();
  }

  /**
   * 立即完成当前未完成文本（跳过延时）。
   * @param {string} text 完整文本
   */
  finish(text) {
    this.stop();
    this.element.textContent = text;
    this._appendCursor();
  }

  /**
   * 停止打字（保留已输出内容）。
   */
  stop() {
    clearTimeout(this._timer);
    this._timer = 0;
  }

  /**
   * 清空内容。
   */
  clear() {
    this.stop();
    this.element.textContent = '';
  }

  /**
   * 移除光标。
   */
  removeCursor() {
    this._cursor?.remove();
    this._cursor = null;
  }

  /**
   * 光标追加到文本尾部。
   * @private
   */
  _appendCursor() {
    if (!this._cursor) return;
    this._cursor.remove();
    this.element.appendChild(this._cursor);
  }

  /**
   * @param {number} ms
   * @param {AbortSignal} [signal]
   * @returns {Promise<void>}
   * @private
   */
  _sleep(ms, signal) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, ms);
      signal?.addEventListener('abort', () => {
        clearTimeout(timer);
        reject(new DOMException('Aborted', 'AbortError'));
      }, { once: true });
    });
  }
}
