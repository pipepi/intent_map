const { chromium } = require('playwright');
const enter = async (page, name) => {
  const loc = page.locator(`text=${name}`).first();
  await loc.dblclick({ timeout: 5000 });
  await page.waitForTimeout(400);
  await loc.dblclick({ timeout: 5000 });
  await page.waitForTimeout(800);
};
const esc = async (page) => { await page.keyboard.press('Escape'); await page.waitForTimeout(700); };

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  page.on('pageerror', (e) => console.log('PAGE_ERR:', String(e).slice(0, 200)));
  await page.goto('http://localhost:7100/', { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(3500);

  // 基线：事件时钟状态
  await enter(page, '事件时钟');
  const clock0 = await page.evaluate(() => (document.querySelector('.runtime-inspector-surface') || {}).innerText || document.body.innerText.slice(0, 300));
  console.log('CLOCK_BEFORE:', JSON.stringify(clock0));
  await esc(page);

  // JS 点击 锁定布局 + 运行
  await enter(page, '顶栏与全局命令');
  await page.evaluate(() => {
    const lock = [...document.querySelectorAll('button')].find((b) => b.innerText.trim() === '锁定布局');
    if (lock) lock.click();
    const run = [...document.querySelectorAll('button')].find((b) => b.innerText.trim() === '运行');
    if (run) run.click();
  });
  await page.waitForTimeout(2000);
  await esc(page);

  // 检查 应用状态 + 事件时钟
  await enter(page, '应用状态');
  const appState = await page.evaluate(() => (document.querySelector('.runtime-inspector-surface') || {}).innerText || '');
  console.log('APP_STATE:', JSON.stringify(appState));
  await esc(page);
  await enter(page, '事件时钟');
  const clock1 = await page.evaluate(() => (document.querySelector('.runtime-inspector-surface') || {}).innerText || '');
  console.log('CLOCK_AFTER:', JSON.stringify(clock1));
  await esc(page);

  // 检查 运行追踪 状态
  await enter(page, '运行追踪');
  const trace = await page.evaluate(() => (document.querySelector('.run-state') || {}).innerText || '');
  console.log('RUN_STATE:', JSON.stringify(trace));
  await browser.close();
})().catch((e) => { console.error('FATAL', String(e).slice(0, 400)); process.exit(1); });
