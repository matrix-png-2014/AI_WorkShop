/**
 * @file EnvironmentLoader —— HDR 环境光照加载器
 * @description
 * 以 EquirectangularReflectionMapping 加载 .hdr 环境贴图：
 * 1. `scene.environment` <- PMREM 处理后的贴图（PBR 光照来源）
 * 2. `scene.background`  <- 原始 equirect 贴图（可见天空背景）
 *
 * 回退策略：HDR 文件缺失 / 加载失败时，使用 RoomEnvironment 程序化环境，
 * 保证骨架在无资产环境下开箱即用；接入真实 HDR 仅需替换文件路径。
 */

import * as THREE from 'three';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

/**
 * 环境光照加载器（静态工具类）。
 */
export class EnvironmentLoader {
  /**
   * 加载 HDR 环境贴图并应用到场景。
   * @param {import('./Engine.js').Engine} engine 引擎实例（需要 renderer/scene）
   * @param {string} [hdrUrl] equirect HDR 贴图 URL；省略或加载失败则回退 RoomEnvironment
   * @param {Object} [opts]
   * @param {boolean} [opts.asBackground=true] 是否同时作为场景背景
   * @returns {Promise<THREE.Texture>} 解析为环境纹理（PMREM 或 equirect）
   */
  static async load(engine, hdrUrl = '', opts = {}) {
    const { asBackground = true } = opts;
    const { renderer, scene } = engine;
    const pmrem = new THREE.PMREMGenerator(renderer);

    if (hdrUrl && (await this._probe(hdrUrl))) {
      try {
        const equirect = await new RGBELoader().loadAsync(hdrUrl);
        // 关键：EquirectangularReflectionMapping 映射模式
        equirect.mapping = THREE.EquirectangularReflectionMapping;
        equirect.colorSpace = THREE.LinearSRGBColorSpace;

        const envMap = pmrem.fromEquirectangular(equirect).texture;
        scene.environment = envMap;
        if (asBackground) scene.background = equirect;
        console.info(`[EnvironmentLoader] HDR 环境已加载: ${hdrUrl}`);
        return envMap;
      } catch (err) {
        console.warn(`[EnvironmentLoader] HDR "${hdrUrl}" 加载失败（${err?.message ?? err}），回退 RoomEnvironment`);
      }
    } else if (hdrUrl) {
      console.warn(`[EnvironmentLoader] HDR "${hdrUrl}" 不存在（或为 HTML 回退页），回退 RoomEnvironment`);
    }

    // ---- 回退：程序化房间环境（同样走 PMREM，PBR 渲染路径完全一致） ----
    const envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envMap;
    if (asBackground && scene.background instanceof THREE.Color) {
      scene.background = new THREE.Color(0x0b0d12); // 保留暗色背景
    }
    console.info('[EnvironmentLoader] 已回退 RoomEnvironment 程序化环境光照');
    return envMap;
  }

  /**
   * 探测 HDR 文件是否存在且为真实图像资源。
   * 规避：dev 服务器对缺失文件返回 SPA 回退 HTML（200），
   * 且 three DataTextureLoader 对解析失败会残留未捕获异常。
   * @param {string} url
   * @returns {Promise<boolean>}
   * @private
   */
  static async _probe(url) {
    try {
      const res = await fetch(url, { method: 'HEAD' });
      if (!res.ok) return false;
      const ct = res.headers.get('content-type') ?? '';
      return !ct.includes('text/html') && !ct.includes('application/json');
    } catch {
      return false;
    }
  }
}
