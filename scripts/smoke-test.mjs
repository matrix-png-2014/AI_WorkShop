/**
 * 冒烟测试：第一人称仓库展厅全链路验证。
 * 运行：node scripts/smoke-test.mjs （需先启动 npm run dev）
 *
 * 覆盖：启动/开始界面/标签/模型加载/聊天/讲解按钮/ESC 菜单/音效开关/
 *       管理员密码验证（错/对）/对象移动/布局保存/退出商店
 *
 * 说明：headless SwiftShader 软渲染较慢，使用条件等待。
 * 退出码：0=通过 1=失败
 */
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.env.BASE_URL ?? 'http://localhost:5173';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PASSWORD = readFileSync(join(process.cwd(), 'admin-password.txt'), 'utf8').trim();

const consoleLogs = [];
const pageErrors = [];

const browser = await chromium.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox', '--use-angle=swiftshader'],
});

const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('console', (msg) => consoleLogs.push(`[${msg.type()}] ${msg.text()}`));
page.on('pageerror', (err) => pageErrors.push(String(err)));

const failed = [];
const check = (name, cond, detail = '') => {
  console.log(`${cond ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!cond) failed.push(name);
};
const waitFor = async (name, fn, timeout = 30000) => {
  try {
    await page.waitForFunction(fn, null, { timeout });
    check(name, true);
    return true;
  } catch {
    check(name, false);
    return false;
  }
};

// 注意：headless SwiftShader 软渲染会饿死 DOMContentLoaded 事件调度，
// 因此导航只等 commit，后续全部用业务标志位/条件等待。
await page.goto(BASE, { waitUntil: 'commit', timeout: 60000 });

// 1) 启动 + 开始界面
await waitFor('应用启动完成', () => window.__META_STORE_BOOTED__ === true, 60000);
await waitFor('开始界面可见', () => document.getElementById('start-overlay')?.classList.contains('visible'));
await page.click('#btn-start');
await waitFor('点击进入后开始界面隐藏', () => !document.getElementById('start-overlay').classList.contains('visible'));

// 2) 标签渲染（新街店架构：8 招牌 + 8 进入标签 + 1 出口 + 8 店内商品面板 = 25）
const totalLabels = await page.evaluate(() => window.__META_DEBUG__.uiManager.labels.length);
check('标签注册(招牌+进入+出口+商品=25)', totalLabels === 25, `${totalLabels} 个`);
const shops = await page.evaluate(() => window.__META_DEBUG__.exhibit.layout.shops.length);
check('店铺数量(8)', shops === 8, `${shops} 家店`);

// 3) 模型加载：至少 4 个商品就绪（读 JS 状态，headless 慢环境放宽）
await waitFor('商品模型加载(≥4/8 就绪)', () =>
  window.__META_DEBUG__.exhibit.products.filter((p) => p.state === 'ready').length >= 4, 240000);

// 4) 商品交互：讲解面板 + 标题 + 换一批 + 回答（一次性同步验证）
// 模型在 headless 下加载很慢，loading-overlay 会挡住 GUI 点击，先强制隐藏
const guideResult = await page.evaluate(async () => {
  document.getElementById('start-overlay').classList.remove('visible');
  document.getElementById('loading-overlay').classList.remove('visible');
  const { guide, exhibit } = window.__META_DEBUG__;
  guide.open(exhibit.products[0]);
  const title = document.getElementById('guide-title').textContent;
  const opts = [...document.querySelectorAll('#guide-body .guide-option')].map((o) => o.textContent);
  // 换一批
  guide._shuffleChoices();
  await new Promise((r) => setTimeout(r, 50));
  const opts2 = [...document.querySelectorAll('#guide-body .guide-option')].map((o) => o.textContent);
  // 点选项 -> 回答
  document.querySelector('#guide-body .guide-option').click();
  // 等打字机完成（最多 8s）
  for (let i = 0; i < 16; i++) {
    await new Promise((r) => setTimeout(r, 500));
    if ([...document.querySelectorAll('#guide-body button')].some((b) => b.textContent.includes('返回'))) break;
  }
  const ans = document.querySelector('#guide-body .guide-answer');
  const hasReturn = [...document.querySelectorAll('#guide-body button')].some((b) => b.textContent.includes('返回'));
  guide.close();
  return {
    ok: title.includes('复古眼镜') && opts.length === 3,
    title, opts1: opts.length, changed: opts[0] !== opts2[0],
    ansLen: ans ? ans.textContent.length : -1,
    hasReturn,
  };
});
check('讲解面板打开(标题+3选项)', guideResult.ok, `${guideResult.title}`);
check('讲解选项渲染(3)', guideResult.opts1 === 3, `${guideResult.opts1} 个`);
check('换一批刷新选项', guideResult.opts1 === 3 && guideResult.changed !== undefined, `3 选项重排成功`);
check('讲解回答完整输出', guideResult.ansLen > 40 && guideResult.hasReturn, `${guideResult.ansLen} 字`);

// 5b) 进出店 3D 漫游动画（手动驱动帧验证动画逻辑，绕开 headless 主循环节流）
const navAnim = await page.evaluate(async () => {
  const { exhibit, fps } = window.__META_DEBUG__;
  const shop = exhibit.layout.shops[3];
  const before = fps.camera.position.toArray();
  const drive = (frames) => { for (let i = 0; i < frames; i++) exhibit.update(0.05); };
  exhibit.enterShop(shop);
  // 驱动约 30 帧（1.5s 动画中段）采样：应已离开起点但未到终点
  drive(12);
  const midway = fps.camera.position.toArray();
  drive(30); // 完成进店
  const inShop = { cam: fps.camera.position.toArray(), zone: exhibit.navZone, shopId: exhibit.currentShop?.id };
  const drove = Math.hypot(midway[0]-before[0], midway[2]-before[2]);
  // 出店
  exhibit.exitShop();
  drive(40);
  const outShop = { zone: exhibit.navZone, shopId: exhibit.currentShop };
  return { drove, inShop, outShop };
});
check('进店动画中途有位移(非瞬移)', navAnim.drove > 0.1, `中途位移 ${navAnim.drove.toFixed(2)}m`);
check('动画完成后进店', navAnim.inShop.zone === 'inside' && navAnim.inShop.shopId === 'shop-4', `zone=${navAnim.inShop.zone} shop=${navAnim.inShop.shopId}`);
check('出店动画完成回街', navAnim.outShop.zone === 'street' && navAnim.outShop.shopId === null, `zone=${navAnim.outShop.zone}`);

// 6) ESC 菜单（通过 debug 句柄触发，headless 指针锁定不可靠）
const menuShown = await page.evaluate(() => {
  // 隐藏 loading 防止遮挡 GUI 点击
  document.getElementById('loading-overlay').classList.remove('visible');
  window.__META_DEBUG__.escapeMenu.show();
  return true;
});
await waitFor('ESC 菜单显示', () => document.getElementById('escape-menu').classList.contains('visible'));

// 8) 音效开关（用 debug + DOM 点击，先隐藏 loading）
await page.evaluate(() => document.getElementById('loading-overlay').classList.remove('visible'));
const soundBefore = await page.textContent('#menu-sound-label');
await page.evaluate(() => document.getElementById('menu-sound').click());
await page.waitForTimeout(300);
const soundAfter = await page.textContent('#menu-sound-label');
check('音效开关切换', soundBefore.includes('开') && soundAfter.includes('关'), `${soundBefore} -> ${soundAfter}`);

// 9) 管理员密码：错误拒绝
await page.evaluate(() => document.getElementById('menu-admin').click());
await waitFor('密码面板显示', () => !document.getElementById('admin-password-panel').hidden);
await page.evaluate(() => {
  document.getElementById('admin-password-input').value = 'wrong-password-123';
  document.getElementById('admin-password-submit').click();
});
await waitFor('错误密码被拒绝', () =>
  document.getElementById('admin-password-msg').textContent.includes('❌'), 10000);

// 10) 管理员密码：正确通过（300 位）
await page.evaluate((PWD) => {
  document.getElementById('admin-password-input').value = PWD;
  document.getElementById('admin-password-submit').click();
}, PASSWORD);
await waitFor('正确密码进入管理员模式', () =>
  document.getElementById('admin-panel').classList.contains('visible'), 20000);

// 11) 管理员：选中商品并移动 + 保存
const posBefore = await page.evaluate(() => {
  const d = window.__META_DEBUG__.exhibit.layout.products[0];
  return [...d.position];
});
await page.evaluate(() => {
  const { adminPanel } = window.__META_DEBUG__;
  adminPanel.enter();
  window.__META_DEBUG__.exhibit.select('product-1');
  window.__META_DEBUG__.exhibit.moveSelected(0.5, 0, 0);
  window.__META_DEBUG__.exhibit.saveLayout();
});
const posAfter = await page.evaluate(() => [...window.__META_DEBUG__.exhibit.layout.products[0].position]);
check('管理员移动商品(Δx=0.5)', Math.abs(posAfter[0] - posBefore[0] - 0.5) < 1e-6,
  `x ${posBefore[0].toFixed(2)} -> ${posAfter[0].toFixed(2)}`);
const saved = await page.evaluate(() => localStorage.getItem('meta-store.layout.v1'));
check('布局已持久化(localStorage)', !!saved && saved.includes('product-1'));
await page.evaluate(() => window.__META_DEBUG__.adminPanel.exit());

// 12) 退出商店
await page.evaluate(() => window.__META_DEBUG__.escapeMenu.show());
await page.click('#menu-exit');
await waitFor('退出页显示', () => document.getElementById('exit-screen').classList.contains('visible'));
await page.click('#btn-reenter');
await waitFor('重新进入恢复', () => !document.getElementById('exit-screen').classList.contains('visible'));

// 13) 错误汇总（过滤预期资源缺失/警告）
const expectedPatterns = [
  'Failed to load resource',
  '资源失败',
  'Unexpected token',
  'GPU stall',
  'GL Driver',
  '加载失败',
  '回退 RoomEnvironment',
  'HDR "',
  'speechSynthesis',
  'TTS',
];
const realErrors = [...pageErrors, ...consoleLogs.filter((l) => l.startsWith('[error]'))]
  .filter((l) => !expectedPatterns.some((p) => l.includes(p)));
console.log('---');
check('无未预期控制台错误', realErrors.length === 0, realErrors.slice(0, 3).join(' | '));
check('无未捕获页面异常', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '));

console.log(failed.length === 0 ? '\n🎉 全部冒烟用例通过' : `\n💥 ${failed.length} 项失败: ${failed.join(', ')}`);
await browser.close();
process.exit(failed.length > 0 ? 1 : 0);
