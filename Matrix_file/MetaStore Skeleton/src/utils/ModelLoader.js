/**
 * @file ModelLoader —— 3D 模型统一加载器（Asset Pipeline）
 * @description
 * 封装 GLTFLoader + DRACOLoader：
 * - Draco 解码路径由 config.assets.dracoDecoderPath 指定（public/draco，postinstall 自动拷贝）
 * - 基于 LoadingManager 提供全局与单模型加载进度
 * - 预留：阴影投射开关、材质遍历钩子、KTX2 纹理扩展位
 *
 * 加载策略（占位系统）：
 * 1. 调用方在模型预定坐标渲染占位符（GridHelper / Box3Helper）
 * 2. 本类负责加载，通过 onProgress 回报进度，通过 onLoaded/onError 通知占位符状态迁移
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { CONFIG } from '../config.js';

/**
 * 模型加载结果。
 * @typedef {Object} LoadedModel
 * @property {THREE.Group} scene 模型根节点（可直接挂入场景）
 * @property {Object|null} gltf 原始 GLTF 数据（动画/骨骼等扩展入口）
 * @property {Array<THREE.Mesh>} meshes 遍历到的网格列表（供阴影/材质批处理）
 */

/**
 * 统一的模型加载器（持有全局 LoadingManager）。
 */
export class ModelLoader {
  /**
   * @param {Object} [opts]
   * @param {string} [opts.dracoDecoderPath] Draco WASM 解码器路径
   * @param {Object} [opts.manager] 外部 LoadingManager（复用进度聚合）
   */
  constructor({ dracoDecoderPath = CONFIG.assets.dracoDecoderPath, manager } = {}) {
    /** 全局 LoadingManager：聚合所有资源加载进度 */
    this.manager = manager ?? new THREE.LoadingManager();

    /** GLTF 加载器 */
    this.gltfLoader = new GLTFLoader(this.manager);

    /** Draco 解码器（WASM） */
    this.dracoLoader = new DRACOLoader(this.manager);
    this.dracoLoader.setDecoderPath(dracoDecoderPath);
    this.dracoLoader.setDecoderConfig({ type: 'wasm' });
    this.dracoLoader.preload(); // 提前预取解码器，降低首个模型的加载延迟
    this.gltfLoader.setDRACOLoader(this.dracoLoader);

    /** 已加载模型的缓存（URL -> LoadedModel） */
    this.cache = new Map();
  }

  /**
   * 加载 glTF/GLB 模型。
   * @param {string} url 模型地址（相对 public/ 根）
   * @param {Object} [opts]
   * @param {(progress: {loaded: number, total: number, percent: number}) => void} [opts.onProgress]
   * @param {(model: LoadedModel) => void} [opts.onLoaded]
   * @param {(err: Error) => void} [opts.onError]
   * @param {boolean} [opts.cache=true] 是否使用内存缓存
   * @returns {Promise<LoadedModel>}
   */
  load(url, opts = {}) {
    const { onProgress, onLoaded, onError, cache = true } = opts;
    const fullUrl = this._resolve(url);

    if (cache && this.cache.has(fullUrl)) {
      const hit = this.cache.get(fullUrl);
      onLoaded?.(hit);
      return Promise.resolve(hit);
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`[ModelLoader] 加载超时: ${fullUrl}`));
      }, CONFIG.assets.loadTimeoutMs);

      this.gltfLoader.load(
        fullUrl,
        (gltf) => {
          clearTimeout(timer);
          const model = this._finalize(gltf);
          if (cache) this.cache.set(fullUrl, model);
          onProgress?.({ loaded: 1, total: 1, percent: 100 });
          onLoaded?.(model);
          resolve(model);
        },
        (evt) => {
          const percent = evt.total > 0 ? (evt.loaded / evt.total) * 100 : 0;
          onProgress?.({ loaded: evt.loaded, total: evt.total, percent });
        },
        (err) => {
          clearTimeout(timer);
          onError?.(err);
          reject(err);
        }
      );
    });
  }

  /**
   * 预加载（不挂载，仅填充缓存），用于场景切换前的资源预热。
   * @param {string} url
   * @returns {Promise<LoadedModel>}
   */
  preload(url) {
    return this.load(url, { cache: true });
  }

  /**
   * 解析相对路径到 public 根。
   * @param {string} url
   * @returns {string}
   * @private
   */
  _resolve(url) {
    if (/^(https?:)?\/\//.test(url) || url.startsWith('data:')) return url;
    const root = CONFIG.assets.modelRoot;
    if (url.startsWith(root) || url.startsWith('/')) return url;
    return `${root}${url}`;
  }

  /**
   * 模型后处理：遍历网格、预留阴影开关与材质钩子。
   * @param {Object} gltf
   * @returns {LoadedModel}
   * @private
   */
  _finalize(gltf) {
    const meshes = [];
    gltf.scene.traverse((obj) => {
      if (obj.isMesh) {
        meshes.push(obj);
        // 阴影管线预留：默认开启投射/接收（renderer.shadowMap.enabled 总为 true，
        // 是否真实渲染由场景灯光 castShadow 决定，见 Engine/SceneManager）
        obj.castShadow = true;
        obj.receiveShadow = true;
        // KTX2/材质扩展预留位：可在未来版本在此注入材质后处理
      }
    });
    return { scene: gltf.scene, gltf, meshes };
  }

  /**
   * 释放 Draco 解码器资源。
   */
  dispose() {
    this.dracoLoader.dispose();
    this.cache.clear();
  }
}
