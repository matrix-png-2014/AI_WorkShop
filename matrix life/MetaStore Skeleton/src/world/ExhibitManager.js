/**
 * @file ExhibitManager —— 单屋展厅系统
 * @description
 * 单屋架构（取代旧版「街道 + 8 独立店面 + 进店瞬移」）：
 * - 一个矩形大厅（HALL），四面墙 + 地板 + 屋顶
 * - 大厅内放 8 个展台（vitrine），按 2×4 排布
 * - 玩家在大厅内自由走动，靠近展台点击商品 -> 打开讲解面板 + TTS 朗读
 * - 没有「进店 / 出店 / 瞬移 / 边界切换」，从根上消除卡墙类 bug
 *
 * 碰撞：仅大厅四面墙 + 屋顶 + 地板，玩家 bounds = 大厅内部。
 */

import * as THREE from 'three';
import { ModelLoader } from '../utils/ModelLoader.js';
import { LayoutStore, PRODUCT_CATALOG, HALL } from './LayoutStore.js';
import { CONFIG } from '../config.js';

/** 可布置对象类型 */
export const ObjType = Object.freeze({
  SPAWN: 'spawn',
  TABLE: 'vitrine',
  PRODUCT: 'product',
});

/** 对象类型显示名 */
export const ObjTypeLabel = Object.freeze({
  [ObjType.SPAWN]: '出生点',
  [ObjType.TABLE]: '展台',
  [ObjType.PRODUCT]: '商品',
});

/**
 * 街店展陈管理器。
 */
export class ExhibitManager {
  /**
   * @param {import('../core/Engine.js').Engine} engine
   * @param {import('../core/FirstPersonControls.js').FirstPersonControls} fpsControls
   * @param {ModelLoader} [modelLoader]
   */
  constructor(engine, fpsControls, modelLoader) {
    this.engine = engine;
    this.fps = fpsControls;
    this.modelLoader = modelLoader ?? new ModelLoader();

    this.layout = LayoutStore.load();
    this.scene = engine.scene;

    /** 所有商品 */
    this.products = [];

    /** 碰撞体（大厅四面墙） */
    this.colliders = [];

    /** 可移动边界（大厅内部） */
    this.bounds = null;

    /** 商品自转动画句柄 */
    this._spinTargets = [];

    /** 选中高亮（管理员） */
    this.selected = null;
    this._highlight = null;
  }

  /* ------------------------------------------------------------------ */
  /* 构建                                                               */
  /* ------------------------------------------------------------------ */

  /**
   * 构建单屋展厅空间。
   * @returns {Promise<void>}
   */
  async load() {
    this._buildHall();

    // 构建所有展台（含商品）
    for (const exhibit of this.layout.exhibits) {
      this._buildExhibit(exhibit);
    }

    // 出生点
    const s = this.layout.spawn;
    this.fps.setColliders(this.colliders, this.bounds);
    this.fps.teleport(new THREE.Vector3(...s.position), s.yaw ?? 0);

    return this;
  }

  /**
   * 构建单屋大厅：地板 + 4 面墙 + 屋顶 + 基础照明。
   * 同时设置 this.colliders（4 面墙）和 this.bounds（玩家可移动范围）。
   * @private
   */
  _buildHall() {
    const W = HALL.width;
    const D = HALL.depth;
    const H = HALL.height;
    const T = HALL.wallThickness;
    const halfW = W / 2;
    const halfD = D / 2;

    const floorMat = new THREE.MeshStandardMaterial({ color: 0x8f8a82, roughness: 0.95, metalness: 0 });
    const wallMat = new THREE.MeshStandardMaterial({ color: 0xcbc5b9, roughness: 0.9 });
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x5e5953, roughness: 0.85, metalness: 0.1 });
    const columnMat = new THREE.MeshStandardMaterial({ color: 0x6e675f, roughness: 0.8, metalness: 0.1 });

    // 地板
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, 0);
    floor.receiveShadow = true;
    this.scene.add(floor);

    // 4 面墙（厚度 T）
    // 北墙 z = -halfD，南墙 z = +halfD，西墙 x = -halfW，东墙 x = +halfW
    const makeWall = (sx, sy, sz, x, y, z) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), wallMat);
      m.position.set(x, y, z);
      m.receiveShadow = true;
      this.scene.add(m);
      return m;
    };
    makeWall(W, H, T, 0, H / 2, -halfD + T / 2);                 // 北墙
    makeWall(W, H, T, 0, H / 2, halfD - T / 2);                  // 南墙
    makeWall(T, H, D, -halfW + T / 2, H / 2, 0);                 // 西墙
    makeWall(T, H, D, halfW - T / 2, H / 2, 0);                  // 东墙

    // 墙碰撞（Box3，向大厅外侧推 1cm 避免与墙体重合闪烁）
    const e = 0.01;
    this.colliders.push(new THREE.Box3(
      new THREE.Vector3(-halfW, 0, -halfD - e),
      new THREE.Vector3(halfW, H, -halfD + T + e)              // 北
    ));
    this.colliders.push(new THREE.Box3(
      new THREE.Vector3(-halfW, 0, halfD - T - e),
      new THREE.Vector3(halfW, H, halfD + e)                    // 南
    ));
    this.colliders.push(new THREE.Box3(
      new THREE.Vector3(-halfW - e, 0, -halfD + T),
      new THREE.Vector3(-halfW + T + e, H, halfD - T)           // 西
    ));
    this.colliders.push(new THREE.Box3(
      new THREE.Vector3(halfW - T - e, 0, -halfD + T),
      new THREE.Vector3(halfW + e, H, halfD - T)                // 东
    ));

    // 屋顶
    const roof = new THREE.Mesh(new THREE.BoxGeometry(W, 0.3, D), roofMat);
    roof.position.set(0, H, 0);
    this.scene.add(roof);

    // 4 根角柱（视觉结构，无碰撞）
    const colGeo = new THREE.BoxGeometry(0.5, H, 0.5);
    for (const [cx, cz] of [
      [-halfW + 0.5, -halfD + 0.5],
      [halfW - 0.5, -halfD + 0.5],
      [-halfW + 0.5, halfD - 0.5],
      [halfW - 0.5, halfD - 0.5],
    ]) {
      const col = new THREE.Mesh(colGeo, columnMat);
      col.position.set(cx, H / 2, cz);
      this.scene.add(col);
    }

    // 基础照明：环境光 + 半球光 + 3 盏吊灯（沿 z 轴等距）
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.35));
    this.scene.add(new THREE.HemisphereLight(0xfff4d6, 0x4a3f2e, 0.55));
    for (const z of [-6, 0, 6]) {
      const lamp = new THREE.PointLight(0xffd9a0, 22, 14, 1.4);
      lamp.position.set(0, H - 0.6, z);
      this.scene.add(lamp);
      // 吊灯罩（小几何，仅视觉）
      const shade = new THREE.Mesh(
        new THREE.ConeGeometry(0.6, 0.5, 12, 1, true),
        new THREE.MeshStandardMaterial({ color: 0x1a1a1a, side: THREE.DoubleSide, roughness: 0.6 })
      );
      shade.position.set(0, H - 0.3, z);
      this.scene.add(shade);
    }

    // 玩家可移动边界：大厅内部内缩一点
    const m = HALL.spawnMargin + T;
    this.bounds = new THREE.Box3(
      new THREE.Vector3(-halfW + m, -50, -halfD + m),
      new THREE.Vector3(halfW - m, 100, halfD - m)
    );
  }

  /**
   * 构建一个展台（展台商品 + 局部聚光）。
   * 单屋架构：不再有门面/门洞/独立房间，所有展台共用同一间大厅。
   * @param {Object} exhibit 展台布局
   * @private
   */
  _buildExhibit(exhibit) {
    this._buildVitrineProduct(exhibit);

    // 展台正上方一盏聚光，凸显商品
    const x = exhibit.vitrine.position[0];
    const z = exhibit.vitrine.position[2];
    const spot = new THREE.SpotLight(0xfff0d0, 14, 5.5, Math.PI / 5, 0.45, 1.2);
    spot.position.set(x, HALL.height - 0.4, z);
    spot.target.position.set(x, 0, z);
    this.scene.add(spot);
    this.scene.add(spot.target);
  }

  /**
   * 展台商品（中央高台 + 商品模型）。
   * 单屋架构：展台/商品位置直接取自 exhibit.vitrine.position，
   * 不再依赖 facade/side/roomBounds。
   * @param {Object} exhibit 展台布局
   * @private
   */
  _buildVitrineProduct(exhibit) {
    const catalog = PRODUCT_CATALOG[exhibit.productId];
    const x = exhibit.vitrine.position[0];
    const z = exhibit.vitrine.position[2];

    // 展台（高台）：底座 + 展柱 + 托盘
    const vitrine = new THREE.Group();
    vitrine.name = `vitrine:${exhibit.id}`;
    const baseMat = new THREE.MeshStandardMaterial({ color: 0x6a5a46, roughness: 0.5 });
    const edgeMat = new THREE.MeshStandardMaterial({ color: 0x8a8060, roughness: 0.4, metalness: 0.2 });

    const base = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.3, 1.4), baseMat);
    base.position.y = 0.15;
    vitrine.add(base);

    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, 0.8, 12), edgeMat);
    pillar.position.y = 0.7;
    vitrine.add(pillar);

    const tray = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.08, 16), baseMat);
    tray.position.y = 1.14;
    vitrine.add(tray);

    vitrine.position.set(x, 0, z);
    this.scene.add(vitrine);

    // 商品
    const product = new ExhibitProduct(
      {
        id: exhibit.productId,
        name: catalog?.name ?? `商品`,
        price: catalog?.price ?? '¥999',
        desc: catalog?.desc ?? '',
        category: catalog?.category ?? '',
        model: `${CONFIG.assets.productRoot}${catalog.model ?? exhibit.productId + '.glb'}`,
        poster: `${CONFIG.assets.posterRoot}${catalog.poster ?? exhibit.productId + '.jpg'}`,
        choices: catalog?.choices ?? [],
      },
      this.modelLoader,
      this.scene
    );
    const trayTop = 1.18;
    const vitrineX = exhibit.vitrine.position[0];
    const vitrineZ = exhibit.vitrine.position[2];
    // 商品先摆到托盘中心
    product.root.position.set(vitrineX, trayTop, vitrineZ);
    product.root.rotation.set(0, 0, 0);
    product.mount();

    // 直立化 + 自适应缩放 + 底部对齐（模型加载后）
    product.onModelLoaded = (box3, size) => {
      // 若模型明显"躺倒"（高度 < 宽度×0.6 且高度 < 深度×0.6），绕 X 轴扶正
      if (size && size.y < size.x * 0.6 && size.y < size.z * 0.6) {
        product.modelGroup.rotation.x = -Math.PI / 2;
        box3 = new THREE.Box3().setFromObject(product.modelGroup);
        size = box3.getSize(new THREE.Vector3());
      }
      // 自适应缩放：让模型高度不超过展台高度（约 1.3m），宽度/深度不超过展台 1.0m
      const MAX_H = 1.25, MAX_W = 1.0;
      const s = Math.min(1, MAX_H / size.y, MAX_W / size.x, MAX_W / size.z);
      if (s < 1) {
        product.modelGroup.scale.setScalar(s);
        box3 = new THREE.Box3().setFromObject(product.modelGroup);
      }
      // modelGroup 局部包围盒 minY = 商品底部相对 root 的高度（不含 root 偏移）
      // 底部落到托盘顶（trayTop=1.18）
      product.modelGroup.updateMatrixWorld(true);
      const localMinY = new THREE.Box3().setFromObject(product.modelGroup).min.y;
      product.root.position.x = vitrineX;
      product.root.position.z = vitrineZ;
      product.root.position.y = trayTop - localMinY;
      this._spinTargets.push(product);
    };
    this.products.push(product);

    // 商品命中区（放在托盘到模型顶端的盒子）
    product._vitrineBox = new THREE.Box3(
      new THREE.Vector3(vitrineX - 1, 1.0, vitrineZ - 1),
      new THREE.Vector3(vitrineX + 1, 2.6, vitrineZ + 1)
    );

    // 记录到 exhibit
    exhibit.product = product;
    exhibit.vitrineGroup = vitrine;
  }

  /* ------------------------------------------------------------------ */
  /* 每帧                                                               */
  /* ------------------------------------------------------------------ */

  /**
   * 更新商品自转。
   * @param {number} delta
   */
  update(delta) {
    for (const p of this._spinTargets) {
      if (p.modelGroup) p.modelGroup.rotation.y += delta * 0.2;
    }
    this._highlight?.updateMatrixWorld();
  }

  /**
   * 射线命中：单屋架构下只检测 8 个展台商品（哪一个被准星照中）。
   * @param {THREE.Ray} ray
   * @returns {{type: string, target: any}|null}
   */
  hitTest(ray) {
    const hitPoint = new THREE.Vector3();
    // 离玩家最近者命中
    let best = null;
    let bestDist = Infinity;
    for (const product of this.products) {
      if (!product._vitrineBox) continue;
      if (ray.intersectBox(product._vitrineBox, hitPoint)) {
        const d = ray.origin.distanceTo(hitPoint);
        if (d < bestDist) {
          bestDist = d;
          best = product;
        }
      }
    }
    return best ? { type: ObjType.PRODUCT, target: best } : null;
  }

  /**
   * 获取可布置对象列表（管理员）。
   * @returns {Array}
   */
  getObjectList() {
    return this.layout.exhibits.map((s) => ({
      type: ObjType.PRODUCT,
      id: s.productId,
      label: s.name,
      position: [...s.vitrine.position],
    }));
  }

  /**
   * 卸载。
   */
  dispose() {
    for (const p of this.products) {
      this.scene.remove(p.root);
      p.root.traverse((o) => {
        o.geometry?.dispose?.();
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose?.());
      });
    }
    this.products = [];
    this._highlight?.geo?.dispose?.();
    this._highlight?.material?.dispose?.();
  }
}

/**
 * 商品展位（模型 + 占位 + 命中）。
 */
class ExhibitProduct {
  constructor(descriptor, loader, scene) {
    this.descriptor = descriptor;
    this.id = descriptor.id;
    this.loader = loader;
    this.scene = scene;

    this.root = new THREE.Group();
    this.root.name = `product:${descriptor.id}`;
    this.scene.add(this.root);

    this.state = 'loading';
    this.progress = 0;
    this._hitPoint = new THREE.Vector3();
    this._buildPlaceholder();
  }

  _buildPlaceholder() {
    this.placeholder = new THREE.Group();
    const grid = new THREE.GridHelper(0.9, 8, 0x3ecf8e, 0x1f3d34);
    grid.rotation.x = -Math.PI / 2;
    grid.position.y = 0.9;
    this.placeholder.add(grid);
    this.boxHelper = new THREE.Box3Helper(
      new THREE.Box3(new THREE.Vector3(-0.5, 0.9, -0.5), new THREE.Vector3(0.5, 2.2, 0.5)), 0x3ecf8e
    );
    this.placeholder.add(this.boxHelper);
    this.root.add(this.placeholder);
  }

  mount() {
    this.loader
      .load(this.descriptor.model, {
        onProgress: ({ percent }) => {
          this.progress = percent;
          this.onProgress?.(percent);
        },
      })
      .then((model) => {
        this.modelGroup = model.scene;
        this.root.add(model.scene);
        // 直立化：算出包围盒，若明显"躺倒"（宽>高），绕X轴扶正
        const box = new THREE.Box3().setFromObject(model.scene);
        const size = box.getSize(new THREE.Vector3());
        this.placeholder.visible = false;
        this.state = 'ready';
        this.onModelLoaded?.(box, size);
        this.onStateChange?.('ready');
      })
      .catch((err) => {
        console.warn(`[Exhibit] 商品 "${this.descriptor.name}" 加载失败:`, err?.message ?? err);
        this.state = 'error';
        this.onStateChange?.('error');
      });
  }

  /**
   * 命中检测（_vitrineBox 由 build 预置）。
   */
  hitTest(ray, outPoint) {
    if (this._vitrineBox) {
      if (outPoint && ray.intersectBox(this._vitrineBox, outPoint)) return true;
      if (ray.intersectBox(this._vitrineBox, this._hitPoint)) return true;
    }
    return false;
  }
}
