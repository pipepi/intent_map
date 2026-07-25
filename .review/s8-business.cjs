const { chromium } = require('playwright');
const shot = async (page, name, ms = 800) => { await page.waitForTimeout(ms); await page.screenshot({ path: `shots/${name}.png` }); console.log('shot:', name); };

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  page.on('pageerror', (e) => console.log('PAGE_ERR:', String(e).slice(0, 200)));
  await page.goto('http://localhost:7100/', { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(3500);

  // 进入 当前容器渲染器（业务画布）
  const card = page.locator('article[data-node-id="current_container"]').first();
  await card.dblclick({ timeout: 5000 }); // 可能已展开 -> 直接进入
  await page.waitForTimeout(1200);
  await shot(page, '20-business-root');
  const bc0 = await page.evaluate(() => (document.querySelector('[aria-label="当前作用域导航"]') || {}).innerText || 'NO_BREADCRUMB');
  console.log('BC0:', JSON.stringify(bc0));

  // 业务节点清单
  const nodes0 = await page.evaluate(() => [...document.querySelectorAll('[data-business-node], .business-node, article')]
    .map((el) => `${el.getAttribute('data-node-id') || ''}:${(el.innerText || '').split('\n')[0]}`).slice(0, 20));
  console.log('NODES0:', JSON.stringify(nodes0));

  // 双击业务节点下钻（核心物流动场景序列与约束）
  const step1 = page.locator('text=核心物流动场景序列与约束').first();
  try {
    await step1.dblclick({ timeout: 5000 });
    await page.waitForTimeout(1200);
    await shot(page, '21-business-level2');
    const bc1 = await page.evaluate(() => (document.querySelector('[aria-label="当前作用域导航"]') || {}).innerText || '');
    console.log('BC1:', JSON.stringify(bc1));
  } catch (e) { console.log('DRILL1_FAIL', String(e).slice(0, 150)); }

  // 继续下钻（参与者与触发条件）
  try {
    await page.locator('text=参与者与触发条件').first().dblclick({ timeout: 5000 });
    await page.waitForTimeout(1200);
    await shot(page, '22-business-level3');
    const bc2 = await page.evaluate(() => (document.querySelector('[aria-label="当前作用域导航"]') || {}).innerText || '');
    console.log('BC2:', JSON.stringify(bc2));
  } catch (e) { console.log('DRILL2_FAIL', String(e).slice(0, 150)); }

  // 继续下钻到叶子（识别核心参与者）
  try {
    await page.locator('text=识别核心参与者').first().dblclick({ timeout: 5000 });
    await page.waitForTimeout(1200);
    await shot(page, '23-business-level4');
    const bc3 = await page.evaluate(() => (document.querySelector('[aria-label="当前作用域导航"]') || {}).innerText || '');
    console.log('BC3:', JSON.stringify(bc3));
  } catch (e) { console.log('DRILL3_FAIL', String(e).slice(0, 150)); }

  // 逐层 Escape 返回并记录面包屑
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(700);
    const bc = await page.evaluate(() => (document.querySelector('[aria-label="当前作用域导航"]') || {}).innerText || 'ROOT?');
    console.log(`ESC${i}:`, JSON.stringify(bc.replace(/\n/g, ' ')));
  }
  await shot(page, '24-back-at-root');

  await browser.close();
})().catch((e) => { console.error('FATAL', String(e).slice(0, 400)); process.exit(1); });
