const { chromium } = require('playwright');

const shot = async (page, name) => { await page.waitForTimeout(700); await page.screenshot({ path: `shots/${name}.png` }); console.log('shot:', name); };

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  page.on('pageerror', (e) => console.log('PAGE_ERR:', String(e).slice(0, 300)));
  await page.goto('http://localhost:7100/', { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(3500);

  const expandNode = async (name) => {
    const loc = page.locator(`text=${name}`).first();
    try {
      await loc.dblclick({ timeout: 5000 });
      await page.waitForTimeout(600);
      return true;
    } catch (e) { console.log('expand fail:', name, String(e).slice(0, 120)); return false; }
  };

  // 1. 展开顶栏与全局命令
  await expandNode('顶栏与全局命令');
  await shot(page, '02-toolbar-expanded');
  const btns = await page.evaluate(() => [...document.querySelectorAll('button')]
    .filter((b) => { const r = b.getBoundingClientRect(); return r.width > 0 && r.height > 0; })
    .map((b) => (b.innerText || '').trim().slice(0, 30)).filter(Boolean));
  console.log('BUTTONS:', JSON.stringify(btns));

  // 2. 展开意图结构树并搜索
  await expandNode('意图结构树');
  await shot(page, '03-tree-expanded');
  const search = page.locator('input[placeholder="搜索意图或端口"]');
  if (await search.count()) {
    await search.fill('数据库');
    await page.waitForTimeout(500);
    await shot(page, '04-tree-search');
    await search.fill('');
  } else console.log('search input NOT found');

  // 3. 展开其余面板
  await expandNode('静态校验');
  await expandNode('模块库');
  await shot(page, '05-validation-modules');
  await expandNode('属性编辑器');
  await expandNode('运行追踪');
  await shot(page, '06-properties-runtrace');

  // 4. 点击运行
  const runBtn = page.locator('button:has-text("运行")').first();
  if (await runBtn.count()) {
    await runBtn.click();
    await page.waitForTimeout(2500);
    await shot(page, '07-after-run');
    const trace = await page.evaluate(() => [...document.querySelectorAll('.trace-row')]
      .map((r) => (r.innerText || '').replace(/\n/g, ' | ').slice(0, 120)));
    console.log('TRACE:', JSON.stringify(trace));
  } else console.log('run button NOT found');

  // 5. 导出全文供分析
  const text = await page.evaluate(() => document.body.innerText);
  require('fs').writeFileSync('shots/app-root-text.txt', text);
  console.log('TEXT_LEN:', text.length);
  await browser.close();
})().catch((e) => { console.error('FATAL', String(e).slice(0, 400)); process.exit(1); });
