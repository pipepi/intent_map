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

  // === 属性编辑器：改名 + 绑定 ===
  await enterById(page, 'properties');
  const nameInput = page.locator('input:visible').first();
  await nameInput.fill('核心物流动场景序列与约束（改）');
  await page.waitForTimeout(900);
  await shot(page, '43-renamed');
  const toast = await page.evaluate(() => (document.querySelector('[aria-label^="关闭提示"]') || {}).innerText || 'NO_TOAST');
  console.log('RENAME_TOAST:', JSON.stringify(toast));
  const sel = page.locator('select').first();
  const opts = await sel.locator('option').allInnerTexts();
  console.log('BIND_OPTIONS:', JSON.stringify(opts));
  await sel.selectOption({ index: 2 }).catch((e) => console.log('SELECT_ERR', String(e).slice(0, 100)));
  await page.waitForTimeout(700);
  await shot(page, '44-binding-changed');
  // 创建副本
  console.log('CLICK_DUP:', await jsClick(page, '创建副本'));
  await page.waitForTimeout(900);
  await shot(page, '45-duplicated');
  await esc(page);

  // === 工具条：发布模块 + 撤销 + 泳道布局 ===
  await enterById(page, 'global_toolbar');
  console.log('CLICK_PUBLISH:', await jsClick(page, '发布模块'));
  await page.waitForTimeout(900);
  const toast2 = await page.evaluate(() => (document.querySelector('[aria-label^="关闭提示"]') || {}).innerText || 'NO_TOAST');
  console.log('PUBLISH_TOAST:', JSON.stringify(toast2));
  console.log('CLICK_LAYOUT:', await jsClick(page, '泳道布局'));
  await page.waitForTimeout(900);
  console.log('CLICK_UNDO:', await jsClick(page, '撤销'));
  await page.waitForTimeout(900);
  const undoState = await page.evaluate(() => [...document.querySelectorAll('button')].filter((b) => ['撤销', '重做'].includes(b.innerText.trim())).map((b) => `${b.innerText.trim()}:${b.disabled}`).join(','));
  console.log('UNDO_REDO_AFTER:', undoState);
  await esc(page);
  await shot(page, '46-after-layout');

  // === 模块库：应出现已发布模块，测试插入 ===
  await enterById(page, 'module_library');
  await shot(page, '47-module-library');
  const modText = await page.evaluate(() => (document.querySelector('.module-surface') || {}).innerText || '');
  console.log('MODULES:', JSON.stringify(modText));
  const insertBtn = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('.module-surface button')][0];
    if (btn) { btn.click(); return btn.innerText.slice(0, 40); } return null;
  });
  console.log('INSERT_CLICKED:', JSON.stringify(insertBtn));
  await page.waitForTimeout(900);
  const toast3 = await page.evaluate(() => (document.querySelector('[aria-label^="关闭提示"]') || {}).innerText || 'NO_TOAST');
  console.log('INSERT_TOAST:', JSON.stringify(toast3));
  await esc(page);

  // === 其余面板快速截图 ===
  for (const [id, name] of [['breadcrumb', '48-breadcrumb'], ['validation', '49-validation'], ['canvas_status', '50-canvas-status'], ['command_processor', '51-cmdproc'], ['document_loader', '52-docloader'], ['scope_toolbar', '53-scopetoolbar'], ['app_state', '54-appstate'], ['event_clock', '55-clock'], ['intent_tree', '56-tree']]) {
    try {
      await enterById(page, id);
      await shot(page, name, 500);
      const t = await page.evaluate(() => document.body.innerText.slice(0, 300).replace(/\n/g, ' '));
      console.log(`SURFACE ${id}:`, JSON.stringify(t));
      await esc(page);
    } catch (e) { console.log(`SURFACE_FAIL ${id}:`, String(e).slice(0, 100)); try { await esc(page); } catch {} }
  }
  await browser.close();
})().catch((e) => { console.error('FATAL', String(e).slice(0, 400)); process.exit(1); });
