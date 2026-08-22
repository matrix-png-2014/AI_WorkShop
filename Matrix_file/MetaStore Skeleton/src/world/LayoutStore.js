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
    name: '桌面宠物', model: '桌面宠物.glb', poster: '桌面宠物.jpg', price: '¥1,299', category: '数码',
    desc: '复古金属框眼镜，轻盈钛材镜架，可搭配多种镜片。',
    choices: [
      { label: '🔊 讲解这个眼镜', answer: '这是一副复古金属框眼镜。镜架采用超轻钛合金一体成型，重量仅约 18 克，佩戴几乎无感。铰链经过 2 万次开合测试，镜腿内置弹性记忆金属，贴合不同脸型。镜片支持平光、近视、防蓝光三种方案。' },
      { label: '🗺 眼镜的历史', answer: '眼镜的历史可追溯到 13 世纪的意大利，最初是固定在书本上的「阅读石」。16 世纪出现第一副佩戴式夹鼻眼镜，18 世纪末有了镜腿式眼镜。如今眼镜早已从矫正工具演变为时尚单品。' },
      { label: '🛠 看 3D 演示拆解', answer: '3D 拆解即将上线：我们将逐层分解这副眼镜的镜架、铰链、镜片与鼻托，展示每个精密部件如何组合。请稍后在展区交互查看。' },
      { label: '🤔 冷知识', answer: '眼镜最初是贵族的象征，19 世纪约瑟夫·斯宾塞量产了第一副现代意义的眼镜，如今已是人人可用的日常工具。' },
    ],
  },
  'product-2': {
    name: '智能眼镜', model: '智能眼镜.glb', poster: '智能眼镜.jpg', price: '¥8,999', category: '数码',
    desc: '高性能轻薄笔记本，航空铝机身，散热出色。',
    choices: [
      { label: '🔊 讲解这台电脑', answer: '这是一台高性能轻薄笔记本电脑。机身采用航空级铝合金 CNC 加工，厚度仅 14.9 毫米。搭载高性能处理器与独立显卡，配合均热板散热系统，满载也能稳定发挥。96Wh 大电池支持全天续航。' },
      { label: '🗺 电脑的发展史', answer: '计算机的历史从 1946 年的 ENIAC 开始——那是一座占据整个房间的庞然大物。此后经历晶体管、集成电路、微处理器三次革命，体积缩小了百万倍。今天的笔记本，算力是当年巨型机的数十亿倍。' },
      { label: '🛠 看 3D 内部构造', answer: '3D 内部拆解即将上线：我们将展示主板、CPU、散热模组、电池与键盘的内部布局，直观理解一台笔记本是如何运转的。' },
      { label: '🤔 冷知识', answer: '世界第一台电子计算机 ENIAC 重达 27 吨，而今天这台笔记本的性能是它的数千倍。' },
    ],
  },
  'product-3': {
    name: '马客龙', model: '马客龙.glb', poster: '马客龙.jpg', price: '¥2,599', category: '潮玩',
    desc: '桌面级 FDM 3D 打印机，支持多种耗材，精度可达 0.1mm。',
    choices: [
      { label: '🔊 讲解 3D 打印', answer: '这是一台 FDM 桌面级 3D 打印机。原理是通过加热喷嘴将塑料丝熔化，像挤牙膏一样逐层堆叠出立体模型。它支持 PLA、ABS、PETG 等耗材，层高精度可达 0.1 毫米。打印喷头温度 190-230°C，热床 60-80°C。' },
      { label: '🗺 3D 打印的历史', answer: '3D 打印技术诞生于 1983 年，查克·赫尔发明了光固化（SLA）技术。1990 年代 FDM 技术专利化，开始用于工业样件。近十年 3D 打印从工业走进家庭，成为创客和设计师的标配工具。' },
      { label: '🛠 看 3D 打印过程', answer: '3D 打印过程演示即将上线：我们将以 3D 演示展示喷头如何逐层移动、挤出、堆叠，最终形成完整立体模型的全过程。' },
      { label: '🤔 冷知识', answer: '3D 打印的「堆积成型」灵感源自喷墨打印——把墨水换成塑料，层层叠加出立体作品。' },
    ],
  },
  'product-4': {
    name: '手表', model: '手表.glb', poster: '手表.jpg', price: '¥3,499', category: '腕表',
    desc: '便携 3D 扫描仪，高精度重建物体模型。',
    choices: [
      { label: '🔊 讲解这台扫描仪', answer: '这是一台手持 3D 建模扫描仪。它通过发射结构光并捕捉物体的表面反射，实时重建出高精度的三维模型。扫描精度可达 0.1 毫米，配合内置的建模算法，几秒钟就能把现实物体「数字化」。' },
      { label: '🗺 3D 扫描的历史', answer: '3D 扫描技术源于计算机视觉与摄影测量。早期使用激光三角测量，受限于精度和速度。如今结构光与深度相机技术让扫描变得便携快速，是 3D 建模、文物保护与工业检测的核心工具。' },
      { label: '🛠 看 3D 扫描演示', answer: '3D 扫描演示即将上线：我们将以 3D 演示展示扫描仪如何从各个角度捕捉光线并重建物体的立体模型。' },
      { label: '🤔 冷知识', answer: '3D 扫描常用于文物保护：许多珍贵文物正是靠它实现了高精度数字化存档。' },
    ],
  },
  'product-5': {
    name: '3D打印机', model: '3D打印机.glb', poster: '3D打印机.jpg', price: '¥68', category: '3D打印',
    desc: '手工马卡龙，酥脆外壳夹松软内馅。',
    choices: [
      { label: '🔊 讲讲这颗马卡龙', answer: '这是一颗经典法式马卡龙。外壳由杏仁粉、糖粉与蛋白打发烤制而成，形成酥脆轻盈的「裙边」。内馅是顺滑的黄油奶油或果酱夹心。入口先是外壳微酥，随后内馅化开，甜而不腻。' },
      { label: '🗺 马卡龙的历史', answer: '马卡龙据说起源于意大利修道院，16 世纪随美第奇家族传入法国。最初是朴素的小圆饼，直到 20 世纪巴黎的甜品师「皮埃尔·艾尔梅」改良出带夹心的双层马卡龙，才成为我们今天熟知的高级甜品。' },
      { label: '🛠 看 3D 剖面', answer: '3D 剖面展示即将上线：我们将切开这颗马卡龙，展示酥脆外壳与夹心内馅的层次结构。' },
      { label: '🤔 冷知识', answer: '一颗正宗马卡龙的「裙边」是烤制时面糊受热膨胀形成的焦化边缘。' },
    ],
  },
  'product-6': {
    name: '3D建模扫描仪', model: '3D建模扫描仪.glb', poster: '3D建模扫描仪.jpg', price: '¥1,899', category: '扫描设备',
    desc: '高保真便携蓝牙音箱，澎湃低音。',
    choices: [
      { label: '🔊 讲解音箱', answer: '这是一台高保真便携蓝牙音箱。内置双全频单元加被动低音振膜，带来澎湃的低音表现。支持 AAC 与 aptX 无损音频传输，蓝牙 5.3 连接稳定。IPX7 防水，适合户外使用，一次充电可播放 24 小时。' },
      { label: '🗺 音箱的历史', answer: '音箱的历史始于 1925 年，切斯特·莱斯和爱德华·凯洛格发明了电动式扬声器。从最初收音机的单声道喇叭，到立体声、环绕声，再到今天随身的智能音箱，声音技术走过了近百年。' },
      { label: '🛠 看 3D 内部', answer: '3D 内部结构即将上线：我们将分解扬声器单元、被动振膜、音腔与电路板，看看好声音是如何产生的。' },
      { label: '🤔 冷知识', answer: '扬声器的雏形是电话听筒，一个铁芯线圈+振膜就能发声。' },
    ],
  },
  'product-7': {
    name: '董哥的电脑', model: '董哥的电脑.glb', poster: '董哥的电脑.jpg', price: '¥6,499', category: '电脑',
    desc: '瑞士自动机械腕表，精密机芯。',
    choices: [
      { label: '🔊 讲解这块手表', answer: '这是一块瑞士自动机械腕表。它无需电池，依靠佩戴者手腕摆动产生的动能驱动机芯运转。内部搭载 25 枚宝石轴承与精密摆轮，走时误差控制在每日 ±5 秒内。80 小时动力储存，即使脱下两天也能持续走时。' },
      { label: '🗺 手表的历史', answer: '手表的历史可追溯至 16 世纪的纽伦堡「怀表」。一战期间飞行员开始把怀表绑在手腕上，催生了现代腕表。从机械到石英，再到今天的智能手表，计时工具不断进化，机械腕表却始终是工艺与美学的象征。' },
      { label: '🛠 看 3D 机芯', answer: '3D 机芯拆解即将上线：我们将展示摆轮、齿轮系、发条盒与宝石轴承如何协同运转，呈现机械计的精密之美。' },
      { label: '🤔 冷知识', answer: '机械表「陀飞轮」为抵消地心引力影响而发明，1801 年由宝玑申请专利。' },
    ],
  },
  'product-8': {
    name: '音响', model: '音响.glb', poster: '音响.jpg', price: '¥4,299', category: '音频',
    desc: '旁轴复古胶片相机，手动对焦。',
    choices: [
      { label: '🔊 讲解这台相机', answer: '这是一台旁轴复古胶片相机。采用全金属机身与手动联动测距对焦，拨动镜头上的对焦环，取景器中的重影会重合对准。它使用 35mm 胶片，快门速度 1/1000 秒，是一台值得慢慢品味的机械相机。' },
      { label: '🗺 相机的历史', answer: '相机的历史从 1826 年尼埃普斯拍摄第一张照片开始。此后历经银版、干版、胶片与数码的革命。旁轴相机的黄金时代在上世纪 50-70 年代，徕卡、蔡司等品牌让它成为纪实摄影的经典。' },
      { label: '🛠 看 3D 内部', answer: '3D 拆解即将上线：我们将展示镜头、光圈、快门帘与胶片仓的结构，看光线如何汇成影像。' },
      { label: '🤔 冷知识', answer: '「旁轴相机」因取景光路与摄影光路平行得名，徕卡 M 系列是巅峰图腾。' },
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
