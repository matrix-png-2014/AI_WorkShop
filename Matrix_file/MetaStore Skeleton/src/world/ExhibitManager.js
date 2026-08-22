/**
 * @file ExhibitManager —— 街店展陈系统
 * @description
 * 街店架构：
 * - 一条室内步行街（长 44m），两侧 4+4 家店铺门面，中间是 6m 宽走道
 * - 每家店铺 = 一个商品的独立小展厅（约 4m 深），门前有门面与招牌
 * - 店内中央高台陈列商品，可环绕观看
 * - 出店走到街 -> 进入其他店，形成「一个商品一家店、一条街连接所有店」的漫游
 *
 * 导航：
 * - 门面处（door zone）点击/进入 -> 瞬移到店内
 * - 店内门口 zone 点击/进入 -> 瞬移到街上
 *
 * 碰撞：仅街道两侧墙面 + 店铺门面墙 + 店内四壁，无额外"空气墙"。
 */

import * as THREE from 'three';
import { ModelLoader } from '../utils/ModelLoader.js';
import { LayoutStore, PRODUCT_CATALOG, STREET } from './LayoutStore.js';
import { ShopTransition } from './ShopTransition.js';
import { CONFIG } from '../config.js';

/** 可布置对象类型 */
export const ObjType = Object.freeze({
  SPAWN: 'spawn',
  DOOR: 'door',
  TABLE: 'vitrine',
  PRODUCT: 'product',
});

/** 对象类型显示名 */
export const ObjTypeLabel = Object.freeze({
  [ObjType.SPAWN]: '出生点',
  [ObjType.DOOR]: '店门/出口',
  [ObjType.TABLE]: '展台',
  [ObjType.PRODUCT]: '商品',
});

/** 导航焦点（玩家当前所在） */
export const NavZone = Object.freeze({
  STREET: 'street',
  INSIDE: 'inside',
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

    /** 碰撞体 */
    this.colliders = [];

    /** 可移动边界（街道范围） */
    this.bounds = null;

    /** 当前所在区域 */
    this.navZone = NavZone.STREET;

    /** 当前所在店铺（null = 在街上），供进出导航 */
    this.currentShop = null;

    /** 店内商品（避免重建） */
    this._shopCache = new Map();

    /** 商品自转动画句柄 */
    this._spinTargets = [];

    /** 选中高亮（管理员） */
    this.selected = null;
    this._highlight = null;

    /** 进出店 3D 漫游动画 */
    this._transition = new ShopTransition(fpsControls);
    this._pendingNav = null;
  }

  /* ------------------------------------------------------------------ */
  /* 构建                                                               */
  /* ------------------------------------------------------------------ */

  /**
   * 构建街店空间。
   * @returns {Promise<void>}
   */
  async load() {
    this._buildStreet();

    // 预构建所有店铺（含商品），并注册导航区
    for (const shop of this.layout.shops) {
      this._buildShop(shop);
    }

    // 街道出生点
    const s = this.layout.spawn;
    this.fps.setColliders(this.colliders, this.bounds);
    this.streetBounds = this.bounds; // 进店时切到 shop.roomBounds，出店再切回
    this.fps.teleport(new THREE.Vector3(...s.position), s.yaw ?? 0);

    return this;
  }

  /**
   * 构建街道本体（地面/墙/天花板/支撑柱）与店铺门面。
   * @private
   */
  _buildStreet() {
    const L = STREET.length;
    const HW = STREET.halfWidth; // 街半宽
    const H = STREET.wallHeight;
    const zMid = 0;

    const floorMat = new THREE.MeshStandardMaterial({ color: 0x8f8a82, roughness: 0.95, metalness: 0 });
    const wallMat = new THREE.MeshStandardMaterial({ color: 0xcbc5b9, roughness: 0.9 });
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x5e5953, roughness: 0.85, metalness: 0.1 });
    const columnMat = new THREE.MeshStandardMaterial({ color: 0x6e675f, roughness: 0.8, metalness: 0.1 });

    // 地面（整条街 + 店内地板）
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(L, HW * 2 + 1), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, zMid);
    floor.receiveShadow = true;
    this.scene.add(floor);

    // 街墙体范围：x[-HW,HW]，z[-L/2,L/2]
    // 左右墙（内侧贴店铺门面所在位置）——用矮墙/门面墙
    const wallBox = new THREE.Mesh(new THREE.BoxGeometry(0.4, H, L), wallMat);
    wallBox.position.set(-HW + 0.2, H / 2, zMid);
    wallBox.name = 'street-left-wall';
    this.scene.add(wallBox);
    const wallBox2 = wallBox.clone();
    wallBox2.position.x = HW - 0.2;
    this.scene.add(wallBox2);
    // 碰撞（左右墙）
    this.colliders.push(new THREE.Box3(
      new THREE.Vector3(-HW, 0, -L / 2),
      new THREE.Vector3(-HW + 0.5, H, L / 2)
    ));
    this.colliders.push(new THREE.Box3(
      new THREE.Vector3(HW - 0.5, 0, -L / 2),
      new THREE.Vector3(HW, H, L / 2)
    ));

    // 南北两端墙（留出街道两端出口）
    const endN = new THREE.Mesh(new THREE.BoxGeometry(HW * 2, H, 0.4), wallMat);
    endN.position.set(0, H / 2, L / 2);
    this.scene.add(endN);
    const endS = endN.clone();
    endS.position.z = -L / 2;
    this.scene.add(endS);
    // 南北墙碰撞（南端留门洞）
    this.colliders.push(new THREE.Box3(
      new THREE.Vector3(-HW, 0, L / 2 - 0.3),
      new THREE.Vector3(HW, H, L / 2 + 0.3)
    ));
    this.colliders.push(new THREE.Box3(
      new THREE.Vector3(-HW, 0, -L / 2 - 0.3),
      new THREE.Vector3(HW, H, -L / 2 + 0.3)
    ));

    // 天花板
    const roof = new THREE.Mesh(new THREE.BoxGeometry(L, 0.3, HW * 2 + 1), roofMat);
    roof.position.set(0, H, zMid);
    this.scene.add(roof);

    // 支撑柱（街两侧）
    const colGeo = new THREE.BoxGeometry(0.5, H, 0.5);
    const positions = [];
    for (let cz = -L / 2 + 2; cz <= L / 2 - 2; cz += 5) {
      positions.push([-HW + 1.2, H / 2, cz], [HW - 1.2, H / 2, cz]);
    }
    for (const [cx, cy, cz] of positions) {
      const col = new THREE.Mesh(colGeo, columnMat);
      col.position.set(cx, cy, cz);
      this.scene.add(col);
    }

    // 可移动边界：街道范围（含店门）
    this.bounds = new THREE.Box3(
      new THREE.Vector3(-HW + 0.9, -50, -L / 2 + 0.9),
      new THREE.Vector3(HW - 0.9, 100, L / 2 - 0.9)
    );
  }

  /**
   * 构建一家店铺（门面 + 店内 + 展台商品）。
   * @param {Object} shop 店铺布局
   * @private
   */
  _buildShop(shop) {
    const catalog = PRODUCT_CATALOG[shop.productId];
    const left = shop.side === 'left';
    const H = STREET.wallHeight;
    const facadeX = shop.facade.position[0];
    const z = shop.facade.position[2];

    const wallMat = new THREE.MeshStandardMaterial({ color: 0xd6d0c4, roughness: 0.9 });
    const doorMat = new THREE.MeshStandardMaterial({ color: 0x7a5a3a, roughness: 0.5 });

    // ---- 门面墙（朝街），门面宽 6m（每店占街长区间） ----
    const shopGroup = new THREE.Group();
    shopGroup.name = `shop-face:${shop.id}`;
    shopGroup.position.set(facadeX, 0, z);
    this.scene.add(shopGroup);

    // 门面立面（含门框开口）：用两块侧墙 + 顶楣构成门框
    const doorW = 2.0, doorH = 2.6;
    const faceTotal = 6.0;
    const sideGap = (faceTotal - doorW) / 2;
    // 门楣（上方）
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(faceTotal, H - doorH, 0.35), wallMat);
    lintel.position.set(0, doorH + (H - doorH) / 2, 0);
    lintel.rotation.y = left ? 0 : Math.PI;
    shopGroup.add(lintel);
    // 左侧墙板
    const sideL = new THREE.Mesh(new THREE.BoxGeometry(sideGap, doorH, 0.35), wallMat);
    sideL.position.set(-(sideGap + doorW / 2) / 2 + 0 + (sideGap / 2), doorH / 2, 0);
    shopGroup.add(sideL);
    // 右侧墙板
    const sideR = new THREE.Mesh(new THREE.BoxGeometry(sideGap, doorH, 0.35), wallMat);
    sideR.position.set(sideGap / 2 + (sideGap + doorW / 2) / 2 - (sideGap + doorW) / 2, doorH / 2, 0);
    shopGroup.add(sideR);

    // 招牌（门楣上方）
    const signPlate = new THREE.Mesh(
      new THREE.BoxGeometry(faceTotal, 0.7, 0.1),
      new THREE.MeshStandardMaterial({ color: 0x3a2f22, roughness: 0.6 })
    );
    signPlate.position.set(0, doorH + 0.5, 0.18);
    signPlate.rotation.y = left ? 0 : Math.PI;
    shopGroup.add(signPlate);
    // CSS2D 招牌文字（由 UIManager 挂）

    // 店内房间（门面往里 buildDepth 深）
    const depth = STREET.buildDepth;
    const roomW = 6.0, roomD = depth, roomH = H;
    const roomX = (left ? -1 : 1); // 店内方向（左店向 -x，右店向 +x）
    const roomCenterX = facadeX + roomX * (depth / 2 + 0.2);
    // 商品展台放在房间中央（不是门面），进店后才看得到商品
    shop.vitrine.position[0] = roomCenterX;
    // 记录房间可行走边界：进店后把玩家边界切到此处，避免被街道边界弹回墙外
    shop.roomBounds = new THREE.Box3(
      new THREE.Vector3(roomCenterX - roomW / 2 + 0.5, -50, z - roomD / 2 + 0.5),
      new THREE.Vector3(roomCenterX + roomW / 2 - 0.5, 100, z + roomD / 2 - 0.5)
    );
    const roomGroup = new THREE.Group();
    roomGroup.name = `shop-room:${shop.id}`;
    this.scene.add(roomGroup);

    // 店内三面墙 + 顶 + 底（不用门面那面）
    // roomW/roomD/roomH 已前置声明
    // 后墙（对面）
    const backWall = new THREE.Mesh(new THREE.BoxGeometry(roomW, roomH, 0.3), wallMat);
    backWall.position.set(roomCenterX + roomX * (roomD / 2), roomH / 2, z);
    this.scene.add(backWall);
    // 左右墙
    for (const sx of [-roomW / 2 + 0.15, roomW / 2 - 0.15]) {
      const sideWall = new THREE.Mesh(new THREE.BoxGeometry(0.3, roomH, roomD), wallMat);
      sideWall.position.set(roomCenterX + sx, roomH / 2, z);
      this.scene.add(sideWall);
      // 店内左右墙碰撞
      this.colliders.push(new THREE.Box3(
        new THREE.Vector3(roomCenterX + sx - 0.2, 0, z - roomD / 2),
        new THREE.Vector3(roomCenterX + sx + 0.2, roomH, z + roomD / 2)
      ));
    }
    // 后墙碰撞
    this.colliders.push(new THREE.Box3(
      new THREE.Vector3(roomCenterX + roomX * (roomD / 2) - (roomX * 0.2), 0, z - roomW / 2),
      new THREE.Vector3(roomCenterX + roomX * (roomD / 2) + (roomX * 0.2), roomH, z + roomW / 2)
    ));

    // 店门（门洞口）：做成一个"门洞标记"，点击进入店内
    const doorZone = new THREE.Box3(
      new THREE.Vector3(facadeX - 1.1, 0, z - 1.0),
      new THREE.Vector3(facadeX + 1.1, 2.8, z + 1.0)
    );
    shop.doorZone = doorZone;

    // 展台商品：店内中央
    this._buildVitrineProduct(shop);

    // 装饰：店内一盏灯
    const lamp = new THREE.PointLight(0xffd9a0, 30, 6, 1.2);
    lamp.position.set(roomCenterX, roomH - 0.4, z);
    this.scene.add(lamp);
  }

  /**
   * 店内展台商品（中央高台 + 商品模型）。
   * @param {Object} shop
   * @private
   */
  _buildVitrineProduct(shop) {
    const catalog = PRODUCT_CATALOG[shop.productId];
    const left = shop.side === 'left';
    // 展台底座与商品同处店内中央(roomCenterX)，不再嵌进门面墙
    const x = shop.vitrine.position[0];
    const z = shop.facade.position[2];

    // 展台（高台）：底座 + 展柱 + 托盘
    const vitrine = new THREE.Group();
    vitrine.name = `vitrine:${shop.id}`;
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
        id: shop.productId,
        name: catalog?.name ?? `商品`,
        price: catalog?.price ?? '¥999',
        desc: catalog?.desc ?? '',
        category: catalog?.category ?? '',
        model: `${CONFIG.assets.productRoot}${catalog.model ?? shop.productId + '.glb'}`,
        poster: `${CONFIG.assets.posterRoot}${catalog.poster ?? shop.productId + '.jpg'}`,
        choices: catalog?.choices ?? [],
      },
      this.modelLoader,
      this.scene
    );
    const trayTop = 1.18;
    const vitrineX = shop.vitrine.position[0];
    const vitrineZ = shop.vitrine.position[2];
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
      // 自适应缩放：让模型高度不超过展台北高度（约 1.3m），宽度/深度不超过展台 1.0m
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

    // 商品命中区
    product._vitrineBox = new THREE.Box3(
      new THREE.Vector3(vitrineX - 1, 1.0, vitrineZ - 1),
      new THREE.Vector3(vitrineX + 1, 2.5, vitrineZ + 1)
    );

    // 记录到 shop
    shop.product = product;
    shop.vitrineGroup = vitrine;
  }

  /* ------------------------------------------------------------------ */
  /* 导航 API（进出店，3D 漫游动画）                                       */
  /* ------------------------------------------------------------------ */

  /**
   * 进入店铺：从当前位置平滑移动到店内展台旁。
   * @param {Object} shop 店铺
   * @returns {boolean} 是否成功启动
   */
  enterShop(shop) {
    if (this.navZone === NavZone.INSIDE || this._transition.isRunning()) return false;
    const left = shop.side === 'left';
    const z = shop.door.position[2];
    const rc = shop.roomBounds ?? this.streetBounds ?? this.bounds;
    // 进店落点：房间内、靠近门的一侧（门在街道侧，房间向街道反方向延伸）
    // 左店房间在 -x 侧，门在 +x 端；右店反之。
    const x = left
      ? rc.max.x - this.fps.radius - 0.6
      : rc.min.x + this.fps.radius + 0.6;
    const target = new THREE.Vector3(shop.vitrine.position[0], 0, z); // 商品（房间中央）
    const toYaw = Math.atan2(-(target.x - x), -(target.z - z)); // 落定后正对商品
    const dist = this.fps.camera.position.distanceTo(new THREE.Vector3(x, 0, z));
    const durationMs = Math.min(1800, Math.max(700, dist * 900)); // 距离自适应时长
    // 切换玩家边界到房间，动画结束后才不会被街道边界弹回墙外
    this.fps.bounds = rc;
    this._transition.start(
      { position: new THREE.Vector3(x, this.fps.height, z), yaw: toYaw, pitch: 0 },
      { durationMs }
    );
    this._transition.onComplete = () => {
      this.navZone = NavZone.INSIDE;
      this.currentShop = shop;
      this.fps.bounds = rc;
      this.onNavChange?.(this.navZone, shop);
    };
    return true;
  }

  /**
   * 离开店铺回到街上：从店内平滑移动到门外街面。
   */
  exitShop() {
    if (this.navZone !== NavZone.INSIDE || !this.currentShop || this._transition.isRunning()) return;
    const shop = this.currentShop;
    const z = shop.door.position[2];
    const leftd = shop.side === 'left';
    // 店外站位：回到街道走道、贴着店门（门外约 0.6m），仍在门区内可再次进店
    const x = shop.door.position[0] + (leftd ? 0.6 : -0.6);
    const toYaw = leftd ? 0 : Math.PI;
    const dist = this.fps.camera.position.distanceTo(new THREE.Vector3(x, 0, z));
    const durationMs = Math.min(1400, Math.max(600, dist * 800));
    // 切回街道边界（动画期间 isAnimating 跳过边界，结束后用街道边界约束）
    this.fps.bounds = this.streetBounds ?? this.bounds;
    this._transition.start(
      { position: new THREE.Vector3(x, this.fps.height, z), yaw: toYaw, pitch: 0 },
      { durationMs }
    );
    this._transition.onComplete = () => {
      this.navZone = NavZone.STREET;
      this.currentShop = null;
      this.fps.bounds = this.streetBounds ?? this.bounds;
      this.onNavChange?.(this.navZone, shop);
    };
  }

  /* ------------------------------------------------------------------ */
  /* 每帧                                                               */
  /* ------------------------------------------------------------------ */

  /**
   * 更新商品自转 + 进出店动画推进。
   * @param {number} delta
   */
  update(delta) {
    for (const p of this._spinTargets) {
      if (p.modelGroup) p.modelGroup.rotation.y += delta * 0.2;
    }
    this._transition.step(delta);
    this._highlight?.updateMatrixWorld();
  }

  /**
   * 射线命中：店内判定商品/出店，街上判定店门/出口/商品。
   * @param {THREE.Ray} ray
   * @returns {{type: string, target: any}|null}
   */
  hitTest(ray) {
    const hitPoint = new THREE.Vector3();

    if (this.navZone === NavZone.INSIDE && this.currentShop) {
      // 店内：检测出店门（背后门洞）或商品
      const prod = this.currentShop.product;
      if (prod && prod._vitrineBox && ray.intersectBox(prod._vitrineBox, hitPoint)) {
        return { type: ObjType.PRODUCT, target: prod };
      }
      // 出店门
      const exitZone = this.currentShop.doorZone;
      if (exitZone && ray.intersectBox(exitZone, hitPoint)) {
        return { type: 'exit-shop', target: this.currentShop };
      }
      return null;
    }

    // 街上：检测各店门 + 街口出口 + 商品（从门面看进去）
    // 商品（店内可见）不检测（有墙体遮挡），只检测店门（进入）
    for (const shop of this.layout.shops) {
      if (shop.doorZone && ray.intersectBox(shop.doorZone, hitPoint)) {
        return { type: ObjType.DOOR, target: shop };
      }
    }
    // 街北端出口
    if (this.layout.door && ray.intersectBox(
      new THREE.Box3(
        new THREE.Vector3(-2, 0, STREET.length / 2),
        new THREE.Vector3(2, 3, STREET.length / 2 + 1)
      ), hitPoint)) {
      return { type: 'exit-street', target: this.layout.door };
    }
    return null;
  }

  /**
   * 获取可布置对象列表（管理员）。
   * @returns {Array}
   */
  getObjectList() {
    return this.layout.shops.map((s) => ({
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
