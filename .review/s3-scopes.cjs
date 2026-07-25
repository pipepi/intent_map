const { chromium } = require('playwright');
const shot = async (page, name, ms = 800) => { await page.waitForTimeout(ms); await page.screenshot({ path: `shots/${name}.png` }); console.log('shot:', name); };
const enter = async (page, name) => {
  const loc = page.locator(`text=${name}`).first();
  await loc.dblclick({ timeout: 5000 });   // minimized -> expand
  await page.waitForTimeout(500);
  await loc.dblclick({ timeout: 5000 });   // expanded -> enter
  await page.waitForTimeout(900);
};
const esc = async (page) => { await page.keyboard.press('Escape'); await page.waitForTimeout(800); };

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  page.on('pageerror', (e) => console.log('PAGE_ERR:', String(e).slice(0, 300)));
  await page.goto('http://localhost:7100/', { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(3500);

  // === 顶栏与全局命令 ===
  await enter(page, '顶栏与全局命令');
  await shot(page, '10-toolbar-scope');
  const dump = await page.evaluate(() => ({
    buttons: [...document.querySelectorAll('button')].filter((b) => { const r = b.getBoundingClientRect(); return r.width > 0 && r.height > 0; })
      .map((b) => ({ t: (b.innerText || '').trim().slice(0, 20), disabled: b.disabled })),
    breadcrumb: (document.querySelector('[aria-label="当前作用域导航"]') || {}).innerText || '',
  }));
  console.log('TOOLBAR_BTNS:', JSON.stringify(dump));

  // 运行
  const runBtn = page.locator('button:has-text("运行")').first();
  await runBtn.click();
  await page.waitForTimeout(3000);
  await shot(page, '11-toolbar-running', 300);
  const toast1 = await page.evaluate(() => (document.querySelector('[aria-label^="关闭提示"]') || {}).innerText || '');
  console.log('TOAST_AFTER_RUN:', toast1);

  // 导出 v2（捕获下载）
  try {
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 8000 }),
      page.locator('button:has-text("导出 v2")').first().click(),
    ]);
    console.log('EXPORT_V2_DOWNLOAD:', download.suggestedFilename());
  } catch (e) { console.log('EXPORT_V2_FAIL', String(e).slice(0, 120)); }

  // 撤销/重做状态
  const undoState = await page.evaluate(() => [...document.querySelectorAll('button')]
    .filter((b) => ['撤销', '重做'].includes((b.innerText || '').trim()))
    .map((b) => `${b.innerText.trim()}:${b.disabled ? 'disabled' : 'enabled'}`).join(', '));
  console.log('UNDO_REDO:', undoState);
  await esc(page);

  // === 意图结构树 ===
  await enter(page, '意图结构树');
  await shot(page, '12-tree-scope');
  const search = page.locator('input[placeholder="搜索意图或端口"]');
  console.log('SEARCH_VISIBLE:', await search.count());
  if (await search.count()) {
    await search.fill('数据库');
    await page.waitForTimeout(600);
    await shot(page, '13-tree-search');
    const treeText = await page.evaluate(() => (document.querySelector('.tree-surface') || document.body).innerText.slice(0, 500));
    console.log('TREE_SEARCH_TEXT:', JSON.stringify(treeText));
    await search.fill('');
    await page.waitForTimeout(400);
  }
  await esc(page);

  // === 运行追踪 ===
  await enter(page, '运行追踪');
  await shot(page, '14-runtrace-scope');
  const traceText = await page.evaluate(() => document.body.innerText.slice(0, 800));
  console.log('RUNTRACE_TEXT:', JSON.stringify(traceText));
  await esc(page);

  // === 属性编辑器 ===
  await enter(page, '属性编辑器');
  await shot(page, '15-properties-scope');
  const propText = await page.evaluate(() => document.body.innerText.slice(0, 800));
  console.log('PROPS_TEXT:', JSON.stringify(propText));
  await esc(page);

  await browser.close();
})().catch((e) => { console.error('FATAL', String(e).slice(0, 400)); process.exit(1); });
