/**
 * @file ProcessAnim —— 讲解面板里的「过程动画」引擎（纯 Canvas2D，零依赖）
 * @description
 * 用户要求「讲解得要有动画」：比如 3D 打印要一圈一圈地打、茶壶要先煮再过滤再萃取。
 * 这个模块在讲解面板的回答上方渲染一段循环播放的 2D 过程动画，配合打字机文字 + TTS 朗读，
 * 让讲解从「纯文字」变成「图文 + 动效」。
 *
 * 设计要点：
 * - DPR 自适应，保证高分屏不糊
 * - requestAnimationFrame 驱动，start/stop 可控（关闭面板时 stop，避免后台空转）
 * - 每个 kind 是一个纯绘制函数 draw(ctx, t, w, h, opts)，t 为秒
 * - 深色 + 霓虹（青/紫）配色，和整体 UI 一致
 */

const CYAN = '#5ad1ff';
const PURPLE = '#b56bff';
const AMBER = '#ffb454';
const GREEN = '#5dffa0';
const PINK = '#ff6ec7';

/** 公共背景：深色舞台 + 轻微网格 */
function drawBg(ctx, w, h) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#0c1226');
  g.addColorStop(1, '#070b18');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(90,209,255,0.06)';
  ctx.lineWidth = 1;
  const step = 22;
  for (let x = step; x < w; x += step) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
  }
  for (let y = step; y < h; y += step) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
  }
}

/** 文字标签（带发光） */
function label(ctx, text, x, y, color = CYAN, size = 13, align = 'center') {
  ctx.save();
  ctx.font = `600 ${size}px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.shadowColor = color;
  ctx.shadowBlur = 8;
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/* ====================================================================== */
/* 各 kind 的绘制函数                                                       */
/* ====================================================================== */

/** 通用：转台旋转（默认动画，用于「看看外观」） */
function spin(ctx, t, w, h, opts = {}) {
  const cx = w / 2, cy = h / 2 + 10;
  const col = opts.color || CYAN;
  // 转台椭圆
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.ellipse(cx, cy + 46, 70, 16, 0, 0, Math.PI * 2); ctx.stroke();
  // 旋转的产品（用一个带高光的圆角块表示）
  const ang = t * 1.1;
  ctx.translate(cx, cy);
  ctx.rotate(Math.sin(ang) * 0.18);
  const grad = ctx.createLinearGradient(-34, -50, 34, 50);
  grad.addColorStop(0, col);
  grad.addColorStop(1, 'rgba(255,255,255,0.15)');
  ctx.fillStyle = grad;
  ctx.shadowColor = col; ctx.shadowBlur = 18;
  roundRect(ctx, -34, -50, 68, 96, 16); ctx.fill();
  // 高光条（随旋转闪）
  ctx.shadowBlur = 0;
  ctx.fillStyle = `rgba(255,255,255,${0.25 + 0.2 * Math.abs(Math.sin(ang * 2))})`;
  roundRect(ctx, -26, -42, 10, 80, 5); ctx.fill();
  ctx.restore();
  label(ctx, opts.name ? `▶ ${opts.name}` : '▶ 旋转展示', cx, 22, col, 14);
}

/** 3D 打印：一圈一圈地堆叠成型 */
function print3d(ctx, t, w, h) {
  const cx = w / 2;
  const baseY = h - 36;          // 打印台
  const maxLayers = 24;
  const layerH = (baseY - 60) / maxLayers;
  // 循环：每 4.5 秒打完一层，整体约 maxLayers*0.19s 一层 -> 约 4.6s 打完整件后重来
  const cycle = 5.0;
  const prog = (t % cycle) / cycle;
  const printed = Math.min(maxLayers, Math.floor(prog * maxLayers + 0.0001));

  // 打印机框架（龙门）
  ctx.save();
  ctx.strokeStyle = 'rgba(180,200,255,0.35)';
  ctx.lineWidth = 3;
  ctx.strokeRect(cx - 80, 50, 160, baseY - 50);
  // 顶部横梁
  ctx.beginPath(); ctx.moveTo(cx - 80, 56); ctx.lineTo(cx + 80, 56); ctx.stroke();
  ctx.restore();

  // 已打印的层（从下往上堆）
  for (let i = 0; i < printed; i++) {
    const y = baseY - (i + 1) * layerH;
    //  vase 造型：中间细两头粗
    const r = 46 - 20 * Math.sin((i / maxLayers) * Math.PI);
    const shade = 0.35 + 0.5 * (i / maxLayers);
    ctx.fillStyle = `rgba(90,209,255,${shade})`;
    ctx.shadowColor = CYAN; ctx.shadowBlur = i === printed - 1 ? 14 : 0;
    roundRect(ctx, cx - r, y, r * 2, layerH + 1, 2); ctx.fill();
  }
  ctx.shadowBlur = 0;

  // 当前正在打印的喷嘴（左右扫）
  if (printed < maxLayers) {
    const y = baseY - (printed + 1) * layerH;
    const r = 46 - 20 * Math.sin((printed / maxLayers) * Math.PI);
    const sweep = (Math.sin(t * 6) * 0.5 + 0.5);
    const nx = cx - r + sweep * r * 2;
    // 喷头
    ctx.fillStyle = AMBER;
    ctx.shadowColor = AMBER; ctx.shadowBlur = 12;
    ctx.beginPath(); ctx.moveTo(nx, y - 14); ctx.lineTo(nx - 6, y - 4); ctx.lineTo(nx + 6, y - 4); ctx.closePath(); ctx.fill();
    // 挤出的细丝
    ctx.strokeStyle = 'rgba(255,180,84,0.8)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(nx, y - 4); ctx.lineTo(nx, y); ctx.stroke();
    ctx.shadowBlur = 0;
    // 落点高亮
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(nx, y, 2.5, 0, Math.PI * 2); ctx.fill();
  }

  label(ctx, `3D 打印中… 第 ${printed + 1}/${maxLayers} 层`, cx, 28, CYAN, 14);
  // 进度条
  ctx.fillStyle = 'rgba(255,255,255,0.1)';
  ctx.fillRect(cx - 70, h - 18, 140, 5);
  ctx.fillStyle = CYAN;
  ctx.fillRect(cx - 70, h - 18, 140 * (printed / maxLayers), 5);
}

/** 茶壶/咖啡：注水 → 煮沸 → 过滤 → 萃取 */
function brew(ctx, t, w, h) {
  const stages = ['注水', '煮沸', '收尾'];
  const sub = ['① 注水浸润', '② 煮沸萃取', '③ 过滤出汤'];
  const cycle = 6.0;
  const prog = (t % cycle) / cycle;
  const si = Math.min(2, Math.floor(prog * 3));
  const local = (prog * 3) - si; // 0..1 在当前阶段内

  const potX = w / 2 - 70, potY = h / 2 + 6;
  const cupX = w / 2 + 70, cupY = h / 2 + 20;

  // 壶
  ctx.save();
  ctx.fillStyle = 'rgba(120,140,180,0.9)';
  ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 2;
  roundRect(ctx, potX - 30, potY - 24, 60, 48, 10); ctx.fill(); ctx.stroke();
  // 壶嘴
  ctx.beginPath(); ctx.moveTo(potX - 30, potY - 10); ctx.lineTo(potX - 48, potY - 22); ctx.lineTo(potX - 44, potY - 14); ctx.lineTo(potX - 28, potY - 4); ctx.closePath(); ctx.fill();
  // 把手
  ctx.beginPath(); ctx.arc(potX + 30, potY, 14, -1.2, 1.2); ctx.stroke();

  // 注水阶段：从壶嘴出水到杯
  if (si === 0) {
    ctx.strokeStyle = CYAN; ctx.lineWidth = 3; ctx.shadowColor = CYAN; ctx.shadowBlur = 8;
    ctx.beginPath(); ctx.moveTo(potX - 46, potY - 18); ctx.lineTo(cupX - 18, cupY - 10 - (1 - local) * 30); ctx.stroke();
    ctx.shadowBlur = 0;
  }
  // 煮沸：壶内冒泡
  if (si >= 1) {
    for (let i = 0; i < 5; i++) {
      const by = potY - 16 - ((t * 30 + i * 13) % 30);
      ctx.fillStyle = `rgba(93,255,160,${0.6 * (1 - (potY - 16 - by) / 30)})`;
      ctx.beginPath(); ctx.arc(potX - 10 + i * 5, by, 2.5, 0, Math.PI * 2); ctx.fill();
    }
  }
  // 壶内液体
  ctx.fillStyle = si >= 1 ? 'rgba(196,120,60,0.85)' : 'rgba(120,170,220,0.7)';
  roundRect(ctx, potX - 26, potY + 6, 52, 14, 4); ctx.fill();
  ctx.restore();

  // 杯子（萃取结果）
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(cupX - 18, cupY - 18); ctx.lineTo(cupX - 18, cupY + 16); ctx.arc(cupX, cupY + 16, 18, Math.PI, 0, true); ctx.lineTo(cupX + 18, cupY - 18); ctx.stroke();
  // 茶汤逐渐填满
  const fill = si >= 2 ? local : (si === 1 ? 0.5 + 0.5 * local : 0);
  if (fill > 0) {
    ctx.fillStyle = `rgba(196,120,60,${0.5 + 0.4 * fill})`;
    const fh = 30 * fill;
    roundRect(ctx, cupX - 16, cupY + 16 - fh, 32, fh, 3); ctx.fill();
  }
  ctx.restore();

  // 阶段标签 + 进度点
  label(ctx, sub[si], w / 2, 22, [CYAN, GREEN, AMBER][si], 14);
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = i <= si ? [CYAN, GREEN, AMBER][i] : 'rgba(255,255,255,0.18)';
    ctx.beginPath(); ctx.arc(w / 2 - 24 + i * 24, h - 18, 5, 0, Math.PI * 2); ctx.fill();
  }
}

/** 3D 扫描仪：激光扫过，点云逐渐成型 */
function scan(ctx, t, w, h) {
  const cx = w / 2, cy = h / 2 + 6;
  const cycle = 5.0;
  const prog = (t % cycle) / cycle;
  // 物体轮廓（一个头像/方碑的简单轮廓）
  const pts = [];
  const N = 60;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const rx = 42 + 6 * Math.sin(a * 3);
    const ry = 54 + 6 * Math.cos(a * 2);
    pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry * 0.8]);
  }
  // 已扫描到的点（按角度推进）
  const shown = Math.floor(prog * N);
  ctx.save();
  ctx.fillStyle = 'rgba(90,209,255,0.9)';
  ctx.shadowColor = CYAN; ctx.shadowBlur = 6;
  for (let i = 0; i < shown; i++) {
    ctx.beginPath(); ctx.arc(pts[i][0], pts[i][1], 2, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
  // 扫描激光线（自上而下扫）
  const ly = cy - 60 + prog * 120;
  ctx.strokeStyle = PINK; ctx.lineWidth = 2; ctx.shadowColor = PINK; ctx.shadowBlur = 10;
  ctx.beginPath(); ctx.moveTo(cx - 80, ly); ctx.lineTo(cx + 80, ly); ctx.stroke();
  ctx.shadowBlur = 0;
  label(ctx, `三维扫描建模 ${Math.round(prog * 100)}%`, cx, 22, PINK, 14);
}

/** 手表：齿轮组装 + 转动 */
function assemble(ctx, t, w, h) {
  const cx = w / 2, cy = h / 2 + 4;
  const cycle = 6.0;
  const prog = (t % cycle) / cycle;
  const gears = [
    { x: cx, y: cy, r: 34, c: CYAN, dir: 1 },
    { x: cx + 46, y: cy + 18, r: 22, c: AMBER, dir: -1.6 },
    { x: cx - 44, y: cy + 14, r: 18, c: GREEN, dir: 2 },
  ];
  gears.forEach((g, gi) => {
    const appear = Math.min(1, Math.max(0, prog * 3 - gi * 0.3));
    ctx.save();
    ctx.globalAlpha = appear;
    ctx.translate(g.x, g.y);
    const rot = t * g.dir;
    ctx.rotate(rot);
    ctx.strokeStyle = g.c; ctx.lineWidth = 3; ctx.shadowColor = g.c; ctx.shadowBlur = 8;
    // 齿
    const teeth = 12;
    for (let i = 0; i < teeth; i++) {
      const a = (i / teeth) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * g.r, Math.sin(a) * g.r);
      ctx.lineTo(Math.cos(a) * (g.r + 6), Math.sin(a) * (g.r + 6));
      ctx.stroke();
    }
    ctx.beginPath(); ctx.arc(0, 0, g.r, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, g.r * 0.4, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  });
  label(ctx, '机芯组装中…', cx, 22, CYAN, 14);
}

/** 智能眼镜：镜片 HUD 点亮 */
function charge(ctx, t, w, h) {
  const cx = w / 2, cy = h / 2 + 4;
  const pulse = (Math.sin(t * 2) * 0.5 + 0.5);
  // 镜框
  ctx.save();
  ctx.strokeStyle = 'rgba(200,210,230,0.7)'; ctx.lineWidth = 4;
  roundRect(ctx, cx - 70, cy - 18, 60, 36, 10); ctx.stroke();
  roundRect(ctx, cx + 10, cy - 18, 60, 36, 10); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx - 10, cy - 10); ctx.lineTo(cx + 10, cy - 10); ctx.stroke();
  // 左镜片 HUD
  ctx.fillStyle = `rgba(90,209,255,${0.15 + 0.25 * pulse})`;
  roundRect(ctx, cx - 66, cy - 14, 52, 28, 8); ctx.fill();
  // HUD 内容（扫描线 + 文字条）
  ctx.strokeStyle = CYAN; ctx.lineWidth = 1.5; ctx.shadowColor = CYAN; ctx.shadowBlur = 8;
  ctx.beginPath(); ctx.moveTo(cx - 60, cy - 6 + pulse * 14); ctx.lineTo(cx - 20, cy - 6 + pulse * 14); ctx.stroke();
  ctx.fillStyle = CYAN;
  for (let i = 0; i < 3; i++) ctx.fillRect(cx - 60, cy - 12 + i * 8, 30 - i * 6, 3);
  // 右镜片信息流
  ctx.fillStyle = `rgba(181,107,255,${0.4 + 0.4 * pulse})`;
  for (let i = 0; i < 4; i++) {
    const bw = 8 + ((i + Math.floor(t * 3)) % 5) * 6;
    ctx.fillRect(cx + 16 + i * 12, cy - 10 + (i % 2) * 12, bw, 4);
  }
  ctx.restore();
  label(ctx, 'AR 显示已激活', cx, 22, PURPLE, 14);
}

/** 音响：声波辐射 */
function wave(ctx, t, w, h) {
  const cx = w / 2, cy = h / 2 + 6;
  // 音箱（锥形）
  ctx.save();
  ctx.fillStyle = 'rgba(40,46,70,0.95)';
  ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 2;
  roundRect(ctx, cx - 26, cy - 34, 52, 68, 12); ctx.fill(); ctx.stroke();
  ctx.fillStyle = CYAN; ctx.beginPath(); ctx.arc(cx, cy, 12, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.beginPath(); ctx.arc(cx, cy, 5, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  // 声波（左右各一圈圈）
  for (let i = 0; i < 4; i++) {
    const rr = ((t * 40 + i * 22) % 92);
    const a = 0.5 * (1 - rr / 92);
    ctx.strokeStyle = `rgba(93,255,160,${a})`;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx - 30, cy, rr, -0.6, 0.6); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx + 30, cy, rr, Math.PI - 0.6, Math.PI + 0.6); ctx.stroke();
  }
  label(ctx, '♪ 声波动效', cx, 22, GREEN, 14);
}

/** 桌面宠物：弹跳 + 挤压 */
function bounce(ctx, t, w, h) {
  const cx = w / 2;
  const cycle = 1.4;
  const ph = (t % cycle) / cycle;
  // 抛物线弹跳
  const yoff = -Math.abs(Math.sin(ph * Math.PI)) * 70;
  const squash = 1 - 0.18 * Math.cos(ph * Math.PI * 2);
  const cy = h / 2 + 30 + yoff;
  // 地面影
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath(); ctx.ellipse(cx, h / 2 + 70, 28 - yoff * 0.1, 7, 0, 0, Math.PI * 2); ctx.fill();
  // 身体
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(1 / squash, squash);
  ctx.fillStyle = AMBER; ctx.shadowColor = AMBER; ctx.shadowBlur = 14;
  ctx.beginPath(); ctx.arc(0, 0, 26, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0;
  // 耳朵
  ctx.fillStyle = 'rgba(255,180,84,0.85)';
  ctx.beginPath(); ctx.arc(-14, -22, 9, 0, Math.PI * 2); ctx.arc(14, -22, 9, 0, Math.PI * 2); ctx.fill();
  // 眼睛
  ctx.fillStyle = '#1a1a2a';
  ctx.beginPath(); ctx.arc(-9, -2, 3.5, 0, Math.PI * 2); ctx.arc(9, -2, 3.5, 0, Math.PI * 2); ctx.fill();
  // 嘴
  ctx.strokeStyle = '#1a1a2a'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(0, 6, 7, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
  ctx.restore();
  label(ctx, '桌面宠物待机中 ~', cx, 22, AMBER, 14);
}

/** 电脑/数码：开机点亮 */
function boot(ctx, t, w, h) {
  const cx = w / 2, cy = h / 2 + 4;
  const cycle = 4.0;
  const prog = (t % cycle) / cycle;
  // 显示器
  ctx.save();
  ctx.fillStyle = 'rgba(20,24,40,0.95)';
  ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 2;
  roundRect(ctx, cx - 60, cy - 40, 120, 78, 8); ctx.fill(); ctx.stroke();
  // 屏幕内容随开机进度
  const screenA = Math.min(1, prog * 2);
  ctx.fillStyle = `rgba(90,209,255,${0.1 + 0.6 * screenA})`;
  roundRect(ctx, cx - 54, cy - 34, 108, 66, 5); ctx.fill();
  // 扫描线
  if (prog > 0.1) {
    const sy = cy - 34 + ((t * 60) % 66);
    ctx.strokeStyle = `rgba(255,255,255,${0.25 * screenA})`; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(cx - 54, sy); ctx.lineTo(cx + 54, sy); ctx.stroke();
  }
  // logo
  if (prog > 0.5) {
    ctx.fillStyle = `rgba(93,255,160,${screenA})`;
    ctx.font = '700 20px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('⌘', cx, cy);
  }
  // 支架
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.fillRect(cx - 8, cy + 38, 16, 10);
  ctx.fillRect(cx - 26, cy + 48, 52, 6);
  ctx.restore();
  label(ctx, prog < 0.5 ? '开机中…' : '系统就绪', cx, 22, prog < 0.5 ? AMBER : GREEN, 14);
}

/** kind 注册表 */
const KINDS = { spin, print3d, brew, scan, assemble, charge, wave, bounce, boot };

/**
 * 过程动画控制器。
 */
export class ProcessAnim {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {string} kind
   * @param {Object} [opts] 额外参数（如 spin 的 name/color）
   */
  constructor(canvas, kind, opts = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.kind = KINDS[kind] ? kind : 'spin';
    this.opts = opts;
    this.t = 0;
    this.raf = 0;
    this._last = 0;
    this._running = false;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this._resize();
  }

  _resize() {
    const r = this.canvas.getBoundingClientRect();
    const w = Math.max(220, Math.round(r.width || 320));
    const h = Math.max(140, Math.round(r.height || 190));
    this.canvas.width = w * this.dpr;
    this.canvas.height = h * this.dpr;
    this.w = w;
    this.h = h;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  start() {
    if (this._running) return;
    this._running = true;
    this._last = performance.now();
    const loop = (now) => {
      if (!this._running) return;
      const dt = Math.min(50, now - this._last) / 1000;
      this._last = now;
      this.t += dt;
      this._draw();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() {
    this._running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  _draw() {
    const { ctx, w, h } = this;
    ctx.clearRect(0, 0, w, h);
    drawBg(ctx, w, h);
    const fn = KINDS[this.kind];
    fn(ctx, this.t, w, h, this.opts);
  }
}

export default ProcessAnim;
