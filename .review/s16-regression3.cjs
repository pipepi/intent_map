const { chromium } = require('playwright');
const bc = async (page) => (await page.evaluate(() => (document.querySelector('[aria-label="当前作用域导航"]') || {}).innerText || 'ROOT')).replace(/\n/g, ' ');
const fresh = async (browser) => {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  page.on('pageerror', (e) => console.log('PAGE_ERR:', String(e).slice(0, 200)));
  await page.goto('http://localhost:7100/', { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(4000);
  return page;
};

(async () => {
  const browser = await chromium.launch();

  // A. 改名 → blur → Ctrl+Z（文档级撤销）
  let page = await fresh(browser);
  let card = page.locator('article[data-node-id="properties"]').first();
  await card.dblclick({ timeout: 5000 }); await page.waitForTimeout(450);
  await card.dblclick({ timeout: 5000 }); await page.waitForTimeout(900);
  await page.locator('input:visible').first().fill('改名验证测试');
  await page.waitForTimeout(700);
  await page.keyboard.press('Tab'); // blur
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(900);
  const nameAfter = await page.locator('input:visible').first().inputValue().catch(() => 'GONE');
  console.log('A_DOC_UNDO:', JSON.stringify(nameAfter), nameAfter === '核心物流动场景序列与约束' ? 'PASS' : 'CHECK');
  await page.close();

  // B. 新建确认对话框（先改文档制造 dirty）
  page = await fresh(browser);
  card = page.locator('article[data-node-id="properties"]').first();
  await card.dblclick({ timeout: 5000 }); await page.waitForTimeout(450);
  await card.dblclick({ timeout: 5000 }); await page.waitForTimeout(900);
  await page.locator('input:visible').first().fill('制造脏状态');
  await page.waitForTimeout(700);
  await page.keyboard.press('Escape'); await page.waitForTimeout(700);
  card = page.locator('article[data-node-id="global_toolbar"]').first();
  await card.dblclick({ timeout: 5000 }); await page.waitForTimeout(450);
  await card.dblclick({ timeout: 5000 }); await page.waitForTimeout(900);
  let dialogSeen = '';
  page.once('dialog', async (d) => { dialogSeen = d.message().slice(0, 40); await d.dismiss(); });
  await page.locator('button:has-text("新建")').first().click();
  await page.waitForTimeout(1200);
  console.log('B_NEW_CONFIRM:', dialogSeen ? `PASS "${dialogSeen}"` : 'FAIL_NO_DIALOG');
  await page.close();

  // C. 双击容器直进业务画布 + 面包屑实名
  page = await fresh(browser);
  await page.locator('article[data-node-id="current_container"]').first().dblclick({ timeout: 5000 });
  await page.waitForTimeout(1300);
  const bc1 = await bc(page);
  console.log('C_DEREF:', bc1, (bc1.includes('Agentic') && !bc1.includes('当前业务容器')) ? 'PASS' : 'FAIL');
  await page.screenshot({ path: 'shots/61-business-direct.png' });
  const drill = page.locator('text=核心物流动场景序列与约束').first();
  await drill.dblclick({ timeout: 5000 }); await page.waitForTimeout(450);
  await drill.dblclick({ timeout: 5000 }); await page.waitForTimeout(1000);
  const bc2 = await bc(page);
  console.log('C_BREADCRUMB:', bc2, !bc2.includes('当前业务容器') ? 'PASS' : 'FAIL');

  // D. 叶子层鼠标点击「＋ 添加子意图」
  const drill2 = page.locator('text=参与者与触发条件').first();
  await drill2.dblclick({ timeout: 5000 }); await page.waitForTimeout(450);
  await drill2.dblclick({ timeout: 5000 }); await page.waitForTimeout(900);
  const drill3 = page.locator('text=识别核心参与者').first();
  await drill3.dblclick({ timeout: 5000 }); await page.waitForTimeout(450);
  await drill3.dblclick({ timeout: 5000 }); await page.waitForTimeout(900);
  await page.locator('button:has-text("添加子意图")').first().click({ timeout: 5000 });
  await page.waitForTimeout(1000);
  const leaf = await page.evaluate(() => document.body.innerText.slice(0, 300));
  console.log('D_ADD_CHILD:', JSON.stringify(leaf));
  await page.screenshot({ path: 'shots/63-after-add.png' });
  await page.close();

  await browser.close();
})().catch((e) => { console.error('FATAL', String(e).slice(0, 400)); process.exit(1); });
