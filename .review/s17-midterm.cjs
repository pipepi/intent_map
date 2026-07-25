const { chromium } = require('playwright');
const enterById = async (page, id) => {
  const card = page.locator(`article[data-node-id="${id}"]`).first();
  await card.dblclick({ timeout: 5000 }); await page.waitForTimeout(450);
  await card.dblclick({ timeout: 5000 }); await page.waitForTimeout(900);
};
const esc = async (page) => { await page.keyboard.press('Escape'); await page.waitForTimeout(650); };

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  page.on('pageerror', (e) => console.log('PAGE_ERR:', String(e).slice(0, 200)));
  await page.goto('http://localhost:7100/', { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(4000);

  // 1. 静态校验分级
  await enterById(page, 'validation');
  const val = await page.evaluate(() => (document.querySelector('.validation-surface') || {}).innerText || '');
  console.log('1_VALIDATION:', JSON.stringify(val.replace(/\n/g, ' ')));
  await page.screenshot({ path: 'shots/70-validation.png' });
  await esc(page);

  // 2. 运行 + 追踪输出数据
  await enterById(page, 'intent_executor');
  await page.locator('button:has-text("执行业务根")').first().click();
  await page.waitForTimeout(2500);
  await esc(page);
  await enterById(page, 'run_trace');
  const traceSample = await page.evaluate(() => [...document.querySelectorAll('.trace-row')].slice(0, 3).map((r) => r.innerText.replace(/\n/g, ' | ').slice(0, 200)));
  console.log('2_TRACE_OUTPUT:', JSON.stringify(traceSample));
  // 3. 根输入类型化
  const editors = await page.evaluate(() => [...document.querySelectorAll('.run-input-grid label')].map((l) => ({
    name: (l.querySelector('span') || {}).innerText || '',
    editor: l.querySelector('textarea') ? 'textarea' : 'input',
  })));
  console.log('3_ROOT_EDITORS:', JSON.stringify(editors));
  // 4. 非法 JSON → 运行失败提示
  const ta = page.locator('.run-input-grid textarea').first();
  await ta.fill('{bad json');
  await page.locator('button:has-text("重新运行")').first().click();
  await page.waitForTimeout(1800);
  const toast = await page.evaluate(() => (document.querySelector('[aria-label^="关闭提示"]') || {}).innerText || 'NO_TOAST');
  const state = await page.evaluate(() => (document.querySelector('.run-state') || {}).innerText.replace(/\n/g, ' ') || '');
  console.log('4_BAD_JSON:', JSON.stringify({ toast, state }));
  await page.screenshot({ path: 'shots/71-runtrace.png' });
  await esc(page);

  // 5. 业务画布内容适配（直进 + 截图）
  await page.locator('article[data-node-id="current_container"]').first().dblclick({ timeout: 5000 });
  await page.waitForTimeout(1300);
  await page.screenshot({ path: 'shots/72-business-fit.png' });
  const zoom = await page.evaluate(() => (document.querySelector('[aria-label="当前作用域导航"] span:last-child') || {}).innerText || '');
  console.log('5_BUSINESS_ZOOM:', zoom);

  await browser.close();
})().catch((e) => { console.error('FATAL', String(e).slice(0, 400)); process.exit(1); });
