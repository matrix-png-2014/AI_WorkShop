/**
 * @file UIManager —— 空间 UI（CSS2D 标签系统）
 * @description
 * 基于 CSS2DRenderer 构建零性能损耗的 3D 标签系统：
 * - 商品悬浮面板：名称 + 价格 + 状态 + 「讲解 / 详情 / 提问」按钮
 *   · 讲解：打开 GuidePanel（三选一 + 换一批固定讲解）
 *   · 详情：聊天窗口展示商品演示图与描述
 *   · 提问：聊天窗口（当前复用详情的固定简答，预留 LLM 接口）
 * - 出口门铭牌
 */

import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';

/**
 * 空间 UI 管理器。
 */
export class UIManager {
  /**
   * @param {import('../core/Engine.js').Engine} engine
   * @param {import('./ChatWindow.js').ChatWindow} chat 屏幕空间聊天窗口
   * @param {import('./GuidePanel.js').GuidePanel} guide 讲解面板
   */
  constructor(engine, chat, guide) {
    this.engine = engine;
    this.scene = engine.scene;
    this.chat = chat;
    this.guide = guide;

    /** 全部标签（CSS2DObject 列表） */
    this.labels = [];

    /** 商品标签 DOM 映射（id -> 元素引用） */
    this.productLabelMap = new Map();

    /** 店铺招牌标签（id -> CSS2DObject） */
    this._shopSigns = new Map();

    /** 店铺进入标签（id -> CSS2DObject） */
    this._enterLabels = new Map();
  }

  /**
   * 为街店展陈系统重建全部标签：
   * - 每家店门面一块招牌（CSS2D，显示店名，朝街可见）
   * - 每家店门口一个「进入」标签
   * - 每个商品挂讲解面板（店内可见）
   * @param {import('../world/ExhibitManager.js').ExhibitManager} exhibit
   */
  rebuild(exhibit) {
    this.clear();
    if (!exhibit) return;

    // 商店门面招牌 + 进入标签
    for (const shop of exhibit.layout.shops) {
      // 招牌（门楣上方）
      const sign = this._createShopSign(shop);
      if (shop.facade) {
        // 挂到门面坐标：招牌板在门面偏上
        const obj = new CSS2DObject(sign.element);
        obj.name = `shop-sign:${shop.id}`;
        obj.position.set(shop.facade.position[0], 3.4, shop.facade.position[2]);
        obj.rotation.set(0, shop.facade.rotation[1], 0);
        this.scene.add(obj);
        this.labels.push(obj);
        this._shopSigns.set(shop.id, obj);

        // 进入标签（门洞上方）
        const enter = this._createEnterLabel(shop);
        const enterObj = new CSS2DObject(enter.element);
        enterObj.name = `shop-enter:${shop.id}`;
        enterObj.position.set(shop.door.position[0], 2.0, shop.door.position[2]);
        enterObj.rotation.set(0, shop.facade.rotation[1], 0);
        this.scene.add(enterObj);
        this.labels.push(enterObj);
        this._enterLabels.set(shop.id, enterObj);
      }
    }

    // 街口出口标签
    const exitEl = this._createExitLabel();
    const exitObj = new CSS2DObject(exitEl.element);
    exitObj.name = 'street-exit';
    exitObj.position.set(0, 2.6, exhibit.layout.door.position[2] - 0.5);
    this.scene.add(exitObj);
    this.labels.push(exitObj);

    // 商品面板（挂在商品上）
    for (const product of exhibit.products) {
      const label = this._createProductLabel(product);
      product.root.add(label);
      this.labels.push(label);
      this.productLabelMap.set(product.id, {
        el: label.element,
        stateEl: label.element.querySelector('.p-state'),
        barEl: label.element.querySelector('.p-progress-bar'),
      });
      product.onStateChange = (state) => this._onProductState(product, state);
      product.onProgress = (pct) => this._onProductProgress(product, pct);
      this._onProductState(product, product.state);
    }
  }

  /**
   * 清除全部标签。
   */
  clear() {
    for (const label of this.labels) {
      label.removeFromParent();
      label.element.remove();
    }
    this.labels = [];
    this.productLabelMap.clear();
  }

  /* ------------------------------------------------------------------ */
  /* 标签构建                                                           */
  /* ------------------------------------------------------------------ */

  /**
   * 商品空间面板。
   * @param {Object} product ExhibitProduct
   * @returns {CSS2DObject}
   * @private
   */
  _createProductLabel(product) {
    const d = product.descriptor;
    const el = document.createElement('div');
    el.className = 'spatial-panel product-panel';
    el.innerHTML = `
      <div class="p-head">
        <span class="p-name">${d.name}</span>
        <span class="p-state"></span>
      </div>
      <div class="p-price">${d.price}</div>
      <div class="p-progress"><div class="p-progress-bar"></div></div>
      <div class="p-actions">
        <button class="p-btn p-btn-tts" data-act="tts" type="button">🔊 讲解</button>
        <button class="p-btn" data-act="detail" type="button">详情</button>
        <button class="p-btn p-btn-primary" data-act="ask" type="button">提问</button>
      </div>
    `;

    // 讲解：打开三选一讲解面板
    el.querySelector('[data-act="tts"]').addEventListener('click', (e) => {
      e.stopPropagation();
      this.guide.open(product);
    });
    // 详情：聊天窗（附演示图）
    el.querySelector('[data-act="detail"]').addEventListener('click', (e) => {
      e.stopPropagation();
      this.chat.open(product, null, true);
    });
    // 提问：聊天窗
    el.querySelector('[data-act="ask"]').addEventListener('click', (e) => {
      e.stopPropagation();
      this.chat.open(product);
    });

    const label = new CSS2DObject(el);
    label.position.set(0, 1.55, 0);
    label.name = `label:${d.id}`;
    return label;
  }

  /**
   * 街口出口标签。
   * @returns {{element: HTMLElement}}
   * @private
   */
  _createExitLabel() {
    const el = document.createElement('div');
    el.className = 'spatial-panel portal-panel door-panel';
    el.innerHTML = `
      <div class="portal-name">🚪 出口</div>
      <div class="portal-hint">点击离开商店</div>
    `;
    return { element: el };
  }

  /**
   * 店铺门面招牌（店名 + 主打商品简称）。
   * @param {Object} shop 店铺布局
   * @returns {{element: HTMLElement}}
   * @private
   */
  _createShopSign(shop) {
    const el = document.createElement('div');
    el.className = 'shop-sign';
    el.innerHTML = `
      <div class="shop-sign-name">🏪 ${shop.name}</div>
    `;
    return { element: el };
  }

  /**
   * 店铺门口「进入」标签。
   * @param {Object} shop
   * @returns {{element: HTMLElement}}
   * @private
   */
  _createEnterLabel(shop) {
    const el = document.createElement('div');
    el.className = 'spatial-panel enter-panel';
    el.innerHTML = `
      <div class="enter-hint">➡ 进入 ${shop.name}</div>
    `;
    return { element: el };
  }

  /* ------------------------------------------------------------------ */
  /* 商品状态/进度回显                                                    */
  /* ------------------------------------------------------------------ */

  /**
   * @param {Object} product
   * @param {string} state
   * @private
   */
  _onProductState(product, state) {
    const ui = this.productLabelMap.get(product.id);
    if (!ui) return;
    const map = {
      loading: ['加载中', 'p-state-loading'],
      ready: ['就绪', 'p-state-ready'],
      error: ['模型缺失', 'p-state-error'],
    };
    const [text, cls] = map[state] ?? ['', ''];
    ui.stateEl.textContent = text;
    ui.stateEl.className = `p-state ${cls}`;
    ui.el.classList.toggle('panel-error', state === 'error');
    ui.el.classList.toggle('panel-ready', state === 'ready');
  }

  /**
   * @param {Object} product
   * @param {number} pct
   * @private
   */
  _onProductProgress(product, pct) {
    const ui = this.productLabelMap.get(product.id);
    if (!ui) return;
    ui.barEl.style.width = `${Math.round(pct)}%`;
  }
}
