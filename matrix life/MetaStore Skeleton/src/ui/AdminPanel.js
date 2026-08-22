/**
 * @file AdminPanel —— 管理员模式（展陈布置）
 * @description
 * 通过 ESC 菜单 + 密码验证进入。功能：
 * - 对象类型筛选 + 列表选择（出生点/出口门/桌子/灯/展板/商品）
 * - 方向键/WASD 移动（世界轴）、Q/E 旋转、R/F 升降、Shift 大步长
 * - 商品重命名 / 改价 / 改讲解词
 * - 保存布局（localStorage）/ 恢复默认
 *
 * 操作说明（面板内置）：
 *   方向键/ADWS 移动 · Q/E 旋转 · R/F 升降 · Shift 加速 · X 保存 · Esc 退出
 */

import { ObjType, ObjTypeLabel } from '../world/ExhibitManager.js';
import { AudioManager } from '../utils/AudioManager.js';
import { CONFIG } from '../config.js';

/**
 * 管理员布置面板。
 */
export class AdminPanel {
  /**
   * @param {import('../world/ExhibitManager.js').ExhibitManager} exhibit
   * @param {Object} [opts]
   * @param {import('./EscapeMenu.js').EscapeMenu} [opts.escapeMenu] 联动：管理员模式期间抑制菜单自动弹出
   */
  constructor(exhibit, { escapeMenu } = {}) {
    this.exhibit = exhibit;
    this.escapeMenu = escapeMenu ?? null;

    this.root = document.getElementById('admin-panel');
    this.typeFilter = document.getElementById('admin-type-filter');
    this.objList = document.getElementById('admin-obj-list');
    this.info = document.getElementById('admin-selected-info');
    this.nameInput = document.getElementById('admin-name-input');
    this.priceInput = document.getElementById('admin-price-input');
    this.descInput = document.getElementById('admin-desc-input');
    this.btnSave = document.getElementById('admin-save');
    this.btnReset = document.getElementById('admin-reset');
    this.btnClose = document.getElementById('admin-close');
    this.hint = document.getElementById('admin-hint');

    /** 当前类型筛选 */
    this.filter = ObjType.PRODUCT;

    /** 按键状态（方向键移动） */
    this._keys = new Set();

    /** 是否激活 */
    this.active = false;

    this._bind();
    this._syncTypes();
  }

  /* ------------------------------------------------------------------ */
  /* 生命周期                                                           */
  /* ------------------------------------------------------------------ */

  /**
   * 进入管理员模式。
   */
  enter() {
    this.active = true;
    this.root.classList.add('visible');
    this._syncTypes();
    this._refreshList();
    // 释放鼠标锁定，便于面板操作；抑制 ESC 菜单自动弹出
    this.exhibit.fps.unlock();
    if (this.escapeMenu) this.escapeMenu.suppressAuto = true;
    AudioManager.instance.playUI(true);
  }

  /**
   * 退出管理员模式（保留布局，不自动保存）。
   */
  exit() {
    this.active = false;
    this.root.classList.remove('visible');
    this.exhibit.select(null);
    if (this.escapeMenu) this.escapeMenu.suppressAuto = false;
    AudioManager.instance.playUI(false);
    this.exhibit.fps.lock();
  }

  /* ------------------------------------------------------------------ */
  /* 事件                                                               */
  /* ------------------------------------------------------------------ */

  /**
   * @private
   */
  _bind() {
    // 类型筛选
    this.typeFilter.addEventListener('change', () => {
      this.filter = this.typeFilter.value;
      this._refreshList();
    });

    // 对象列表
    this.objList.addEventListener('change', () => {
      const id = this.objList.value;
      this.exhibit.select(id);
      this._refreshInfo();
    });

    // 元数据编辑（商品）
    this.nameInput.addEventListener('change', () => this._applyMeta());
    this.priceInput.addEventListener('change', () => this._applyMeta());
    this.descInput.addEventListener('change', () => this._applyMeta());

    // 操作按钮
    this.btnSave.addEventListener('click', () => {
      this.exhibit.saveLayout();
      AudioManager.instance.playPickup();
      this.hint.textContent = '✅ 布局已保存（localStorage）';
      setTimeout(() => { this.hint.textContent = ''; }, 2000);
    });
    this.btnReset.addEventListener('click', async () => {
      if (!confirm('恢复默认布局？当前布局将被清除。')) return;
      await this.exhibit.resetLayout();
      this._refreshList();
      this.hint.textContent = '✅ 已恢复默认布局';
    });
    this.btnClose.addEventListener('click', () => this.exit());

    // 键盘：移动/旋转/升降/保存
    window.addEventListener('keydown', (e) => {
      if (!this.active) return;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'KeyR', 'KeyF'].includes(e.code)) {
        this._keys.add(e.code);
        e.preventDefault();
      }
      if (e.code === 'KeyX') {
        this.exhibit.saveLayout();
        this.hint.textContent = '✅ 布局已保存';
        setTimeout(() => { this.hint.textContent = ''; }, 1500);
      }
      if (e.code === 'Escape') this.exit();
    });
    window.addEventListener('keyup', (e) => this._keys.delete(e.code));

    // 每帧处理移动（由引擎钩子驱动）
    this.exhibit.onSelectionChange = (desc) => this._onSelection(desc);
  }

  /**
   * 每帧更新（引擎钩子调用）。
   * @param {number} delta
   */
  update(delta) {
    if (!this.active) return;
    const fast = this._keys.has('ShiftLeft') || this._keys.has('ShiftRight');
    const step = fast ? CONFIG.admin.moveStepFast : CONFIG.admin.moveStep;
    const rate = Math.min(delta * 8, 1);
    let dx = 0, dy = 0, dz = 0;

    if (this._keys.has('ArrowLeft') || this._keys.has('KeyA')) dx -= step;
    if (this._keys.has('ArrowRight') || this._keys.has('KeyD')) dx += step;
    if (this._keys.has('ArrowUp') || this._keys.has('KeyW')) dz -= step;
    if (this._keys.has('ArrowDown') || this._keys.has('KeyS')) dz += step;
    if (this._keys.has('KeyR')) dy += step;
    if (this._keys.has('KeyF')) dy -= step;

    if (dx || dy || dz) this.exhibit.moveSelected(dx * rate, dy * rate, dz * rate);

    if (this._keys.has('KeyQ')) this.exhibit.rotateSelected(-CONFIG.admin.rotateStep * rate);
    if (this._keys.has('KeyE')) this.exhibit.rotateSelected(CONFIG.admin.rotateStep * rate);
  }

  /* ------------------------------------------------------------------ */
  /* 内部                                                               */
  /* ------------------------------------------------------------------ */

  /**
   * 类型选项同步。
   * @private
   */
  _syncTypes() {
    this.typeFilter.innerHTML = '';
    for (const [type, label] of Object.entries(ObjTypeLabel)) {
      const opt = document.createElement('option');
      opt.value = type;
      opt.textContent = label;
      this.typeFilter.appendChild(opt);
    }
    this.typeFilter.value = this.filter;
  }

  /**
   * 刷新对象列表。
   * @private
   */
  _refreshList() {
    this.objList.innerHTML = '';
    const objects = this.exhibit.getObjectList().filter((o) => o.type === this.filter);
    for (const o of objects) {
      const opt = document.createElement('option');
      opt.value = o.id;
      opt.textContent = o.label;
      this.objList.appendChild(opt);
    }
    if (objects.length) {
      this.objList.value = objects[0].id;
      this.exhibit.select(objects[0].id);
    } else {
      this.exhibit.select(null);
    }
    this._refreshInfo();
  }

  /**
   * 选中对象详情展示。
   * @param {Object|null} desc
   * @private
   */
  _onSelection(desc) {
    if (!this.active) return;
    this._refreshInfo(desc);
  }

  /**
   * 信息区刷新。
   * @param {Object} [desc]
   * @private
   */
  _refreshInfo(desc) {
    const d = desc ?? (this.exhibit.selected ? this._describeFromSelected() : null);
    if (!d) {
      this.info.textContent = '未选中对象';
      this.nameInput.disabled = this.priceInput.disabled = this.descInput.disabled = true;
      this.nameInput.value = this.priceInput.value = this.descInput.value = '';
      return;
    }
    const pos = d.position.map((v) => v.toFixed(2)).join(', ');
    this.info.textContent = `${d.label}  [${pos}]${d.height ? ` 高 ${d.height.toFixed(2)}m` : ''}`;
    const isProduct = d.type === ObjType.PRODUCT;
    this.nameInput.disabled = this.priceInput.disabled = this.descInput.disabled = !isProduct;
    if (isProduct) {
      this.nameInput.value = d.product?.name ?? '';
      this.priceInput.value = d.product?.price ?? '';
      this.descInput.value = d.product?.desc ?? '';
    }
  }

  /**
   * 从选中对象生成描述（供信息区）。
   * @returns {Object|null}
   * @private
   */
  _describeFromSelected() {
    const s = this.exhibit.selected;
    if (!s) return null;
    return {
      id: s.id,
      type: s.type,
      label: s.label,
      position: [...s.data.position],
      height: s.data.height ?? null,
      product: s.product
        ? { name: s.product.descriptor.name, price: s.product.descriptor.price, desc: s.product.descriptor.desc }
        : null,
    };
  }

  /**
   * 应用商品元数据编辑。
   * @private
   */
  _applyMeta() {
    if (this.exhibit.selected?.type !== ObjType.PRODUCT) return;
    this.exhibit.updateProductMeta(
      this.nameInput.value.trim(),
      this.priceInput.value.trim(),
      this.descInput.value.trim()
    );
    this._refreshList();
  }
}
