/**
 * @file LayoutStore —— 街店布局模型 & 持久化
 * @description
 * 街店架构：
 * - 一条室内步行街（Street），左右两排店铺门面，中间是走道
 * - 每个商品 = 一家独立店铺（Shop），店内中央高台陈列商品
 * - 走出店铺 -> 回到街 -> 可进入任意其他店铺
 *
 * 布局数据（position 均为世界坐标）：
 * {
 *   street: { length, halfWidth, origin },   // 街道几何
 *   shops: [{
 *     id, name, productId,
 *     facade: { position, rotation },        // 门面（朝街）
 *     door:   { position, rotation },        // 店门（进出点）
 *     interior: { position },                // 店内空腔参考点
 *     vitrine:{ position },                  // 店内展台（商品陈列）
 *     product:{ rotation }                   // 商品朝向
 *   }],
 *   spawn:  { position, yaw },               // 街上的出生点
 * }
 */

import { CONFIG } from '../config.js';

/**
 * 商品预置数据（名称/价格/讲解，三选一题库）。
 * @type {Object<string, {name, price, desc, category, choices}>}
 */
export const PRODUCT_CATALOG = {
  'product-1': {
    name: 'VR眼镜', model: 'VR眼镜.glb', poster: 'VR眼镜_preview.jpg', price: '¥2,999', category: '数码',
    desc: '沉浸式 VR 头显，双目高清屏，六自由度空间定位。',
    choices: [
      { label: '🔊 讲解这个 VR 眼镜', answer: '这是一款沉浸式 VR 头显，内置双目高清屏与菲涅尔透镜，支持六自由度空间定位与手柄追踪。戴上它即可进入虚拟世界，观影、游戏、逛虚拟商店都很流畅。' },
      { label: '🗺 VR 的历史', answer: 'VR 概念源于 1960 年代的「达摩克利斯之剑」头戴显示器，2012 年 Oculus Rift 掀起消费级浪潮，如今一体机让 VR 走进千家万户。' },
      { label: '🛠 看 3D 内部构造', answer: '3D 拆解即将上线：展示显示屏、透镜组、定位摄像头与主板的内部布局。' },
      { label: '🤔 冷知识', answer: '「虚拟现实之父」Jaron Lanier 在 1980 年代推广了 VR 一词。' },
    ],
  },
  'product-2': {
    name: '灭霸', model: '灭霸.glb', poster: '灭霸_preview.jpg', price: '¥1,299', category: '手办',
    desc: '灭霸角色手办，肌肉与装甲细节拉满，气场十足。',
    choices: [
      { label: '🔊 讲解这个手办', answer: '这是一款灭霸主题手办，肌肉线条与装甲纹理刻画细致，配有标志性无限手套。无论摆放在桌面还是展示柜，都极具存在感。' },
      { label: '🗺 角色的来历', answer: '灭霸（Thanos）是漫威漫画中的经典反派，因《复仇者联盟》系列电影而广为人知，「响指」成为流行文化符号。' },
      { label: '🛠 看 3D 细节', answer: '3D 细节展示即将上线：可 360° 查看手办的装甲与手套细节。' },
      { label: '🤔 冷知识', answer: '灭霸的名字源自希腊神话中的死神「塔纳托斯（Thanatos）」。' },
    ],
  },
  'product-3': {
    name: '水壶', model: '水壶.glb', poster: '水壶_preview.jpg', price: '¥199', category: '生活',
    desc: '大容量电热水壶，快速沸腾，自动断电。',
    choices: [
      { label: '🔊 讲解这个水壶', answer: '这是一款大容量电热水壶，食品级内胆，大功率底盘加热，几分钟即可沸腾，水开自动断电，安全省心。' },
      { label: '🗺 水壶的历史', answer: '从炭火铜壶到电热水壶，烧水工具的变迁见证了电力进入日常生活的过程。' },
      { label: '🛠 看 3D 内部', answer: '3D 拆解即将上线：展示加热底盘、温控器与蒸汽开关的工作原理。' },
      { label: '🤔 冷知识', answer: '电热水壶的「自动断电」靠的是蒸汽驱动双金属片温控器。' },
    ],
  },
  'product-4': {
    name: '燃气坚果', model: '燃气坚果.glb', poster: '燃气坚果_preview.jpg', price: '¥89', category: '潮玩',
    desc: '创意「燃气坚果」造型 3D 模型，脑洞大开的桌搭小物。',
    choices: [
      { label: '🔊 讲解这个模型', answer: '这是一个脑洞大开的创意 3D 模型，把「燃气」与「坚果」元素巧妙结合，造型独特，是很吸睛的桌搭小摆件。' },
      { label: '🗺 创作灵感', answer: '这类创意模型常来自设计师的随手灵感，把毫不相关的元素组合出幽默感。' },
      { label: '🛠 看 3D 细节', answer: '3D 细节展示即将上线：可 360° 查看它的造型与质感。' },
      { label: '🤔 冷知识', answer: '「反差组合」是潮玩设计里常用的创意手法，越不搭越有趣。' },
    ],
  },
  'product-5': {
    name: '大卫袋老湿', model: '大卫袋老湿.glb', poster: '大卫袋老湿_preview.jpg', price: '¥259', category: '雕塑',
    desc: '创意「大卫」主题 3D 雕塑，古典与玩味的碰撞。',
    choices: [
      { label: '🔊 讲解这个雕塑', answer: '这是一件以经典「大卫」为灵感的创意 3D 雕塑，在古典造型的基础上加入玩味细节，是一件很有话题性的摆件。' },
      { label: '🗺 大卫的来历', answer: '米开朗基罗的《大卫》创作于 1501-1504 年，是文艺复兴雕塑的巅峰之作，现藏于佛罗伦萨美术学院。' },
      { label: '🛠 看 3D 细节', answer: '3D 细节展示即将上线：可 360° 欣赏雕塑的每一处线条。' },
      { label: '🤔 冷知识', answer: '《大卫》高 5.17 米，由一整块大理石雕成，最初计划放在教堂屋顶。' },
    ],
  },
  'product-6': {
    name: '老师的咖啡壶', model: '老师的咖啡壶.glb', poster: '老师的咖啡壶_preview.jpg', price: '¥159', category: '生活',
    desc: '复古手冲咖啡壶，细长壶嘴，控水稳定。',
    choices: [
      { label: '🔊 讲解这个咖啡壶', answer: '这是一款复古手冲咖啡壶，细长鹅颈壶嘴让水流更稳定，适合慢慢注水、萃取出咖啡豆的层次感，是手冲爱好者的心头好。' },
      { label: '🗺 咖啡的历史', answer: '咖啡起源于埃塞俄比亚，经阿拉伯传入欧洲，手冲文化则在日本被发扬光大，讲究水温与注水节奏。' },
      { label: '🛠 看 3D 细节', answer: '3D 细节展示即将上线：可查看壶嘴曲线与壶身做工。' },
      { label: '🤔 冷知识', answer: '「鹅颈壶嘴」的设计是为了让水流细而稳，避免冲散咖啡粉层。' },
    ],
  },
  'product-7': {
    name: '超薄脆的遥控器', model: '超薄脆的遥控器.glb', poster: '超薄脆的遥控器_preview.jpg', price: '¥129', category: '数码',
    desc: '超薄机身遥控器，按键清脆，手感利落。',
    choices: [
      { label: '🔊 讲解这个遥控器', answer: '这是一款超薄机身遥控器，厚度仅几毫米，按键回弹清脆，握持轻便。极简设计，放在客厅也很有质感。' },
      { label: '🗺 遥控器的历史', answer: '最早的遥控器诞生于 1950 年代，从有线到红外再到蓝牙语音，遥控器越来越薄、越来越聪明。' },
      { label: '🛠 看 3D 内部', answer: '3D 拆解即将上线：展示按键结构、主板与电池仓布局。' },
      { label: '🤔 冷知识', answer: '早期超声波遥控器靠金属片发声，人耳听不到却能控制电视。' },
    ],
  },
  'product-8': {
    name: '轻粘土版边牧', model: '轻粘土版边牧.glb', poster: '轻粘土版边牧_preview.jpg', price: '¥99', category: '手办',
    desc: '轻粘土风边境牧羊犬，软萌治愈，手工质感。',
    choices: [
      { label: '🔊 讲解这只边牧', answer: '这是一只轻粘土风格的边境牧羊犬模型，软萌的造型加上手工质感，看起来治愈又可爱，适合摆在书桌或床头。' },
      { label: '🗺 边牧的故事', answer: '边境牧羊犬原产于苏格兰与英格兰边界，以聪明著称，常被称为「最聪明的犬种」。' },
      { label: '🛠 看 3D 细节', answer: '3D 细节展示即将上线：可 360° 查看它的毛发与神态。' },
      { label: '🤔 冷知识', answer: '边牧能记住上百个指令词汇，著名边牧「Chaser」认得 1000 多个玩具的名字。' },
    ],
  },
};

/** 街的几何参数 */
export const STREET = Object.freeze({
  length: 44,       // 街长（z 方向）
  halfWidth: 4.2,   // 街半宽（x 方向，实际街道宽约 x[-4,4]，中轴 ±3.6 为走道）
  buildDepth: 5.5,  // 店铺纵深（从门面往内的房间深度）
  wallHeight: 4.2,  // 墙高
});

/**
 * 街店布局存储。
 */
export class LayoutStore {
  /**
   * 读取布局（无存档返回默认）。
   * 若存的是旧格式（含 tables/products 而非 shops），视为无效并返回默认街店布局。
   * @returns {Object}
   */
  static load() {
    try {
      const raw = localStorage.getItem(CONFIG.admin.layoutStorageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        // 校验是否为街店格式
        if (Array.isArray(parsed.shops) && parsed.shops.length > 0 && parsed.street) {
          return parsed;
        }
        console.warn('[LayoutStore] 检测到旧格式布局，已忽略并使用默认街店布局');
        localStorage.removeItem(CONFIG.admin.layoutStorageKey);
      }
    } catch (err) {
      console.warn('[LayoutStore] 读取布局失败:', err);
    }
    return this.defaultLayout();
  }

  /**
   * 保存布局。
   * @param {Object} layout
   */
  static save(layout) {
    try {
      localStorage.setItem(CONFIG.admin.layoutStorageKey, JSON.stringify(layout));
    } catch (err) {
      console.warn('[LayoutStore] 保存布局失败:', err);
    }
  }

  /**
   * 重置布局。
   */
  static reset() {
    localStorage.removeItem(CONFIG.admin.layoutStorageKey);
  }

  /**
   * 默认街店布局。
   *
   * 街沿 +z 方向延伸（z 从 -20 到 +20），两侧各 4 家店。
   * 每家店：
   *  - facade 门面位于街道内侧墙面
   *  - door 店门位置（进出瞬移触发点）
   *  - interior 店内场景的参考原点
   *  - vitrine 店内展台落点（商品陈列于此）
   *
   * @returns {Object}
   */
  static defaultLayout() {
    const cats = ['product-1', 'product-2', 'product-3', 'product-4', 'product-5', 'product-6', 'product-7', 'product-8'];
    const shops = [];
    const L = STREET.length;

    // 左侧店：x = -3.6，门面朝 +x（面向街道）；右侧店：x = +3.6，门面朝 -x
    const side = (i, index) => {
      const left = index < 4; // 前 4 家在左侧
      // 每侧 4 家，间距 10m，全部落在街道内(z∈[-22,22])，且错开支撑柱(每隔 5m)
      const z = -16 + (index % 4) * 10;
      const x = left ? -3.6 : 3.6;
      const facing = left ? 0 : Math.PI; // 门面旋转（朝街）
      const productId = cats[i];
      return {
        id: `shop-${i + 1}`,
        name: PRODUCT_CATALOG[productId]?.name ?? `店铺 ${i + 1}`,
        productId,
        side: left ? 'left' : 'right',
        facade: { position: [x, 0, z], rotation: [0, facing, 0] },
        door: { position: [x, 0, z], rotation: [0, facing, 0] },
        // 店内：朝内 3m（从门面往店里）
        interior: { position: [left ? x + 3 : x - 3, 0, z] },
        vitrine: { position: [x + (left ? 3 : -3) * 0.0, 1.9, z], rotation: [0, 0, 0] },
        product: {},
        occupied: true,
      };
    };

    for (let i = 0; i < 8; i++) shops.push(side(i, i));

    return {
      street: { length: L, halfWidth: STREET.halfWidth },
      shops,
      spawn: { position: [0, 1.6, L / 2 - 3], yaw: 0 }, // 街北端，面朝街内
      door: { position: [0, 0, L / 2 + 0.5] },           // 街北端出口（离开整条街）
    };
  }
}
