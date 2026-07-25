const { chromium } = require('playwright');
const shot = async (page, name, ms = 800) => { await page.waitForTimeout(ms); await page.screenshot({ path: `shots/${name}.png` }); console.log('shot:', name); };
const enterById = async (page, id) => {
  const card = page.locator(`article[data-node-id="${id}"]`).first();
  await card.dblclick({ timeout: 5000 }); await page.waitForTimeout(450);
  await card.dblclick({ timeout: 5000 }); await page.waitForTimeout(900);
};
const esc = async (page) => { await page.keyboard.press('Escape'); await page.waitForTimeout(650); };
const jsClick = async (page, text) => page.evaluate((t) => {
  const btn = [...document.querySelectorAll('button')].find((b) => b.innerText.trim() === t);
  if (btn) { btn.click(); return true; } return false;
}, text);

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  page.on('pageerror', (e) => console.log('PAGE_ERR:', String(e).slice(0, 200)));
  await page.goto('http://localhost:7100/', { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(3500);

  // === 意图执行器：执行业务根 ===
  await enterById(page, 'intent_executor');
  console.log('CLICK_RUN:', await jsClick(page, '执行业务根'));
  await page.waitForTimeout(3000);
  await shot(page, '40-executor-ran');
  const execText = await page.evaluate(() => (document.querySelector('.runtime-inspector-surface') || {}).innerText || '');
  console.log('EXECUTOR:', JSON.stringify(execText));
  await esc(page);

  // === 运行追踪 ===
  await enterById(page, 'run_trace');
  await shot(page, '41-runtrace-filled');
  const traceRows = await page.evaluate(() => [...document.querySelectorAll('.trace-row')].map((r) => r.innerText.replace(/\n/g, ' | ').slice(0, 110)));
  console.log('TRACE_ROWS:', JSON.stringify(traceRows));
  const runState = await page.evaluate(() => (document.querySelector('.run-state') || {}).innerText.replace(/\n/g, ' ') || '');
  console.log('RUN_STATE:', JSON.stringify(runState));
  // 根输入编辑框检查
  const inputs = await page.evaluate(() => [...document.querySelectorAll('input,textarea')].map((el) => ({ p: el.placeholder || '', v: (el.value || '').slice(0, 40) })));
  console.log('RUN_INPUTS:', JSON.stringify(inputs));
  await esc(page);

  // === 属性编辑器：改名 + 绑定下拉 ===
  await enterById(page, 'properties');
  await shot(page, '42-properties');
  const nameInput = page.locator('input').first();
  const inputCount = await page.locator('input').count();
  const selectCount = await page.locator('select').count();
  console.log('PROP_INPUTS:', inputCount, 'SELECTS:', selectCount);
  if (inputCount) {
    await nameInput.fill('核心物流动场景序列与约束（改）');
    await page.waitForTimeout(800);
    const toast = await page.evaluate(() => (document.querySelector('[aria-label^="关闭提示"]') || {}).innerText || '');
    console.log('RENAME_TOAST:', JSON.stringify(toast));
    await shot(page, '43-renamed');
  }
  if (selectCount) {
    const sel = page.locator('select').first();
    const opts = await sel.locator('option').allInnerTexts();
    console.log('BIND_OPTIONS:', JSON.stringify(opts.slice(0, 8)));
    await sel.selectOption({ index: 1 }).catch((e) => console.log('SELECT_ERR', String(e).slice(0, 100)));
    await page.waitForTimeout(600);
    await shot(page, '44-binding-changed');
  }
  await esc(page);

  // 面包屑导航 / 静态校验 / 画布状态 / 命令处理器 / 文档加载器 / 当前作用域工具条 依次截图
  for (const [id, name] of [['breadcrumb', '45-breadcrumb'], ['validation', '46-validation'], ['canvas_status', '47-canvas-status'], ['command_processor', '48-command-processor'], ['document_loader', '49-doc-loader'], ['scope_toolbar', '50-scope-toolbar'], ['app_state', '51-app-state'], ['module_library', '52-module-library']]) {
    try {
      await enterById(page, id);
      await shot(page, name);
      const t = await page.evaluate(() => document.body.innerText.slice(0, 350));
      console.log(`SURFACE ${id}:`, JSON.stringify(t));
      await esc(page);
    } catch (e) { console.log(`SURFACE_FAIL ${id}:`, String(e).slice(0, 120)); await esc(page).catch(() => {}); }
  }
  await browser.close();
})().catch((e) => { console.error('FATAL', String(e).slice(0, 400)); process.exit(1); });
