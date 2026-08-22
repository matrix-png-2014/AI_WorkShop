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
import { TTS } from '../utils/TTS.js';
import { ProcessAnim, PrinterSim } from './ProcessAnim.js';

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

    /** 当前过程动画（ProcessAnim 或 PrinterSim 实例），无则 null */
    this._anim = null;

    /** 交互式打印的键盘监听句柄，无则 null */
    this._simKeyHandler = null;

    this._bind();
  }

  /**
   * 打开讲解面板并关联商品（同时触发 TTS 朗读开场白）。
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
    // 立即朗读开场白（让 TTS 在用户点「讲解」那一刻就出声）
    const d = product.descriptor;
    TTS.instance.speak(
      `这是${d.name}，售价${d.price}。${d.desc || ''}点下面的问题，我来为你详细讲解。`
    );
  }

  /**
   * 关闭面板（同时停掉 TTS 朗读）。
   */
  close() {
    TTS.instance.cancel();
    this._stopAnim();
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
    this._stopAnim();
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
   * 展示所选选项的回答（打字机 + TTS 朗读）。
   * @param {Object} choice
   * @private
   */
  async _showAnswer(choice) {
    // 移除选项按钮，仅保留回答区
    this.body.innerHTML = '';
    this._stopAnim();
    const qLine = document.createElement('div');
    qLine.className = 'guide-q';
    qLine.textContent = choice.label.replace(/^\S+\s/, ''); // 去掉 emoji 前缀
    this.body.appendChild(qLine);

    // 交互式 3D 打印：玩家亲手逐层打（choice.interactive + animation==='print3d'）
    const isInteractivePrint = choice.interactive === true && choice.animation === 'print3d';
    // 未显式指定动画的讲解，按品类自动补一个默认动效，保证「每条都讲解动画」
    const animKind = choice.animation || this._defaultAnim(choice);

    let canvas = null;
    if (animKind) {
      const wrap = document.createElement('div');
      wrap.className = 'guide-anim-wrap';
      canvas = document.createElement('canvas');
      canvas.className = 'guide-anim';
      wrap.appendChild(canvas);
      this.body.appendChild(wrap);

      if (isInteractivePrint) {
        const cap = document.createElement('div');
        cap.className = 'guide-anim-cap';
        cap.textContent = '▸ 亲手打一层：点「打印下一层」（或敲空格 / 点画布）';
        wrap.appendChild(cap);

        const bar = document.createElement('div');
        bar.className = 'guide-sim-bar';
        const btn = document.createElement('button');
        btn.className = 'menu-btn guide-sim-btn';
        btn.type = 'button';
        btn.textContent = '▶ 打印下一层';
        const prog = document.createElement('span');
        prog.className = 'guide-sim-prog';
        prog.textContent = '已打印 0 / 14 层';
        bar.appendChild(btn);
        bar.appendChild(prog);
        wrap.appendChild(bar);

        const msg = document.createElement('div');
        msg.className = 'guide-sim-msg';
        wrap.appendChild(msg);

        const LAYERS = 14;
        const sim = new PrinterSim(canvas, {
          layers: LAYERS,
          onProgress: (n) => {
            prog.textContent = `已打印 ${n} / ${LAYERS} 层`;
            if (n < LAYERS) btn.disabled = false;
          },
          onDone: () => {
            btn.disabled = true;
            btn.textContent = '✅ 已成型';
            msg.textContent = '🎉 出炉！一个歪歪扭扭的小东西——俗称「垃圾」，但它是你一层层亲手打出来的，快乐！';
            TTS.instance.speak('出炉啦！一个歪歪扭扭的小东西，俗称垃圾，但它是你一层层亲手打出来的，快乐！');
          },
        });
        this._anim = sim;

        const doPrint = () => {
          if (!sim.done && !sim._anim) {
            sim.printNextLayer();
            btn.disabled = true; // 动画播放中禁点，播完 onProgress 再解禁
          }
        };
        btn.addEventListener('click', doPrint);
        canvas.addEventListener('click', doPrint);
        this._simKeyHandler = (e) => {
          if (this.isOpen() && (e.code === 'Space' || e.code === 'Enter')) {
            e.preventDefault();
            doPrint();
          }
        };
        window.addEventListener('keydown', this._simKeyHandler);

        // 开场提示（此时不朗读长答案，把「亲手打」的戏让出来）
        TTS.instance.cancel();
        TTS.instance.speak('来，你自己一层一层把它打出来，点下面的打印下一层，打完看看能成个啥。');
      } else {
        const cap = document.createElement('div');
        cap.className = 'guide-anim-cap';
        cap.textContent = choice.animCaption || '▸ 过程演示';
        wrap.appendChild(cap);
        this._anim = new ProcessAnim(canvas, animKind, choice.animOpts || {});
        requestAnimationFrame(() => this._anim?.start());
        // 正常朗读完整答案
        TTS.instance.cancel();
        TTS.instance.speak(choice.answer);
      }
    } else {
      // 极端兜底：既无动画也无默认（理论上不会到这）
      TTS.instance.cancel();
      TTS.instance.speak(choice.answer);
    }

    // 回答文字区（打字机输出，所有分支共用）
    const answer = document.createElement('div');
    answer.className = 'guide-answer';
    this.body.appendChild(answer);
    this._typeAnswer(answer, choice.answer);

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

  /**
   * 停止并销毁当前过程动画（含交互式打印的键盘监听）。
   * @private
   */
  _stopAnim() {
    if (this._anim) {
      this._anim.stop();
      this._anim = null;
    }
    if (this._simKeyHandler) {
      window.removeEventListener('keydown', this._simKeyHandler);
      this._simKeyHandler = null;
    }
  }

  /**
   * 打字机输出回答文字（各分支复用）。
   * @private
   */
  _typeAnswer(el, text) {
    this._typewriter?.removeCursor();
    this._typewriter = new Typewriter(el, { speedMs: 22 });
    // maxMs=6000：6 秒内未打完则直接补全，防止 headless/后台 setTimeout 节流卡住
    this._typewriter.type(text, { maxMs: 6000 });
  }

  /**
   * 当讲解未显式指定 animation 时，按品类 + 序号给一个默认动效，
   * 确保「每条讲解都有动画」，且同商品不同讲解尽量不重样。
   * @private
   */
  _defaultAnim(choice) {
    const cat = this.currentProduct?.descriptor?.category || '';
    const pool = {
      '数码': ['charge', 'scan', 'assemble', 'wave'],
      '生活': ['brew', 'spin', 'assemble', 'wave'],
      '手办': ['bounce', 'spin', 'scan', 'wave'],
      '潮玩': ['bounce', 'float', 'scan', 'wave'],
      '工具': ['scan', 'assemble', 'spin', 'float'],
    }[cat] || ['spin', 'float', 'scan', 'wave'];
    const idx = this.currentProduct?.descriptor?.choices?.indexOf(choice) ?? 0;
    return pool[((idx % pool.length) + pool.length) % pool.length];
  }
}
