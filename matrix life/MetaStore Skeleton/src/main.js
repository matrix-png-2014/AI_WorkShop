/**
 * @file main —— 应用入口（第一人称仓库展厅版）
 * @description
 * 装配顺序：
 * 1. Engine（渲染器/场景/相机/循环）
 * 2. FirstPersonControls（第一人称：Pointer Lock + WASD + 碰撞）
 * 3. InputManager（桌面 pointer / 移动端陀螺仪增量融合）
 * 4. ExhibitManager（仓库点云 + 桌子/灯/展板/门/商品 + 布局）
 * 5. UI（CSS2D 标签 / 聊天 / ESC 菜单 / 管理员面板 / HUD）
 * 6. 音效（Web Audio 电音合成）+ TTS（本地语音讲解）
 */

import * as THREE from 'three';
import { Engine } from './core/Engine.js';
import { FirstPersonControls } from './core/FirstPersonControls.js';
import { InputManager, ControlMode } from './core/InputManager.js';
import { ExhibitManager } from './world/ExhibitManager.js';
import { ModelLoader } from './utils/ModelLoader.js';
import { AudioManager } from './utils/AudioManager.js';
import { TTS } from './utils/TTS.js';
import { UIManager } from './ui/UIManager.js';
import { ChatWindow } from './ui/ChatWindow.js';
import { GuidePanel } from './ui/GuidePanel.js';
import { HUD } from './ui/HUD.js';
import { EscapeMenu } from './ui/EscapeMenu.js';
import { AdminPanel } from './ui/AdminPanel.js';
import { CONFIG } from './config.js';

async function bootstrap() {
  // ============ 1. 引擎 ============
  const engine = Engine.init();

  // ============ 2. 第一人称控制 ============
  const fps = new FirstPersonControls(engine.camera, engine.renderer.domElement);

  // ============ 3. 输入（pointer / gyro） ============
  const input = InputManager.init({ fps, mode: CONFIG.input.initialMode });

  // ============ 4. 展陈空间 ============
  const modelLoader = new ModelLoader();
  const exhibit = new ExhibitManager(engine, fps, modelLoader);

  // ============ 5. UI ============
  const audio = AudioManager.instance;
  const tts = TTS.instance;
  const chat = new ChatWindow({ fps });
  const guide = new GuidePanel({ fps });
  const uiManager = new UIManager(engine, chat, guide);
  const hud = new HUD(input, (mode) => console.info('[HUD] 输入模式:', mode));

  // 步声音效（电音）
  fps.onStep = (intensity) => audio.playStep(intensity);

  // 指针锁定状态统一回调：准星同步 + ESC 菜单自动弹出（聊天/讲解打开时不弹）
  fps.onLockChange = (locked) => {
    hud.onFpsLockChange(locked);
    if (!locked && !escapeMenu.visible && !escapeMenu.suppressAuto && !chat.isOpen() && !guide.isOpen()) {
      escapeMenu.show();
    }
  };

  const escapeMenu = new EscapeMenu(fps, {
    onAdminRequest: () => adminPanel.enter(),
    onExit: () => showExitScreen(),
  });
  const adminPanel = new AdminPanel(exhibit, { escapeMenu });

  // ============ 6. 加载展陈并构建标签 ============
  const loadingManager = modelLoader.manager;
  loadingManager.onProgress = (_url, loaded, total) => {
    hud.showLoading((loaded / Math.max(total, 1)) * 100);
  };
  loadingManager.onLoad = () => hud.hideLoading();
  loadingManager.onError = (url) => console.warn('[LoadingManager] 资源失败:', url);

  hud.showLoading(4);
  await exhibit.load();
  hud.setSceneInfo({ name: 'MetaStore · 仓库展厅', description: '第一人称漫游 · 点击商品查看详情 · ESC 打开菜单' });
  uiManager.rebuild(exhibit);
  hud.hideLoading();

  // ============ 7. 交互拾取 ============
  let downPos = null;
  const isDrag = (x, y) => downPos && Math.hypot(x - downPos.x, y - downPos.y) > 6;

  engine.renderer.domElement.addEventListener('pointerdown', (e) => {
    downPos = { x: e.clientX, y: e.clientY };
  });
  engine.renderer.domElement.addEventListener('pointerup', (e) => {
    if (!downPos) return;
    const drag = isDrag(e.clientX, e.clientY);
    downPos = null;
    if (drag) return;

    // 指针锁定（游戏进行中）时鼠标坐标不可用：一律用屏幕中心准星射线拾取；
    // 非锁定（如管理员模式）用点击坐标。
    let ndc;
    if (fps.locked) {
      ndc = { x: 0, y: 0 };
    } else {
      const rect = engine.renderer.domElement.getBoundingClientRect();
      ndc = {
        x: ((e.clientX - rect.left) / rect.width) * 2 - 1,
        y: -((e.clientY - rect.top) / rect.height) * 2 + 1,
      };
    }
    const hit = exhibit.hitTest(input.createRaycaster(ndc.x, ndc.y).ray);
    if (!hit) return;

    // 单屋架构：准星照中商品 -> 打开讲解面板（含 TTS 朗读）
    if (hit.type === 'product') {
      audio.playPickup();
      guide.open(hit.target);
    }
  });

  // ============ 8. 主循环钩子 ============
  let gazeAccum = 0;
  engine.addUpdateHook((delta) => {
    input.update(delta);
    adminPanel.update(delta);
    exhibit.update(delta);

    // 陀螺仪模式：Gaze 注视商品 -> 讲解；注视门 -> 退出
    if (input.activeMode === ControlMode.GYRO) {
      gazeAccum += delta * 1000;
      if (gazeAccum >= CONFIG.input.gazeIntervalMs) {
        gazeAccum = 0;
        const targets = buildGazeTargets();
        input.updateGaze(targets, delta);
      }
    }
  });

  /**
   * Gaze 目标（陀螺仪移动端）：单屋架构下注视任意商品即讲解。
   * @returns {Array<{hitTest: Function, onGaze?: Function}>}
   */
  function buildGazeTargets() {
    const targets = [];
    for (const p of exhibit.products) {
      targets.push({
        hitTest: (ray) => p?.hitTest(ray) ?? false,
        onGaze: () => { audio.playPickup(); guide.open(p); },
      });
    }
    return targets;
  }

  // ============ 9. 开始界面 ============
  const startOverlay = document.getElementById('start-overlay');
  const startBtn = document.getElementById('btn-start');
  const exitScreen = document.getElementById('exit-screen');
  const btnReenter = document.getElementById('btn-reenter');

  startBtn.addEventListener('click', () => {
    audio.unlock();
    startOverlay.classList.remove('visible');
    fps.lock();
    audio.playUI(true);
  });

  /**
   * 显示退出结束页。
   */
  function showExitScreen() {
    fps.unlock();
    chat.close();
    exitScreen.classList.add('visible');
  }

  btnReenter.addEventListener('click', () => {
    audio.playUI(true);
    exitScreen.classList.remove('visible');
    const s = exhibit.layout.spawn;
    fps.teleport(new THREE.Vector3(...s.position), s.yaw ?? 0);
    fps.lock();
  });

  // ============ 10. 启动 ============
  engine.start();
  window.__META_STORE_BOOTED__ = true; // 冒烟测试钩子
  window.__META_DEBUG__ = { engine, fps, input, exhibit, uiManager, escapeMenu, adminPanel, audio, tts, guide, THREE };
  console.info('[MetaStore] 第一人称仓库展厅启动完成 🚀 模式:', input.activeMode);
}

bootstrap().catch((err) => {
  console.error('[MetaStore] 启动失败:', err);
  document.getElementById('loading-text').textContent = `启动失败: ${err.message}`;
});
