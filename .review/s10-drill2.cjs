const { chromium } = require('playwright');
const shot = async (page, name, ms = 800) => { await page.waitForTimeout(ms); await page.screenshot({ path: `shots/${name}.png` }); console.log('shot:', name); };
const bc = async (page) => (await page.evaluate(() => (document.querySelector('[aria-label="当前作用域导航"]') || {}).innerText || 'ROOT')).replace(/\n/g, ' ');
const drill2 = async (page, name, shotName) => {
  const loc = page.locator(`text=${name}`).first();
  await loc.dblclick({ timeout: 5000 }); await page.waitForTimeout(500);
  await loc.dblclick({ timeout: 5000 }); await page.waitForTimeout(1100);
  await shot(page, shotName);
  console.log(`ENTERED ${name}:`, await bc(page));
};

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  page.on('pageerror', (e) => console.log('PAGE_ERR:', String(e).slice(0, 200)));
  await page.goto('http://localhost:7100/', { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(3500);

  await page.locator('article[data-node-id="current_container"]').first().dblclick({ timeout: 5000 });
  await page.waitForTimeout(900);
  await page.locator('article[data-node-id="active_business_scope_ref"]').first().dblclick({ timeout: 5000 });
  await page.waitForTimeout(1000);

  await drill2(page, '核心物流动场景序列与约束', '30-l2');
  await drill2(page, '参与者与触发条件', '31-l3');
  await drill2(page, '识别核心参与者', '32-l4-leaf');
  const leaf = await page.evaluate(() => document.body.innerText.slice(0, 700));
  console.log('LEAF:', JSON.stringify(leaf));

  // 叶子层的“添加子意图”按钮：鼠标点击 vs JS 点击对比
  const addBtn = page.locator('button:has-text("添加子意图"), button:has-text("添加子节点")').first();
  const count = await addBtn.count();
  console.log('ADD_BTN_COUNT:', count);
  if (count) {
    await addBtn.click().catch((e) => console.log('MOUSE_ADD_ERR', String(e).slice(0, 120)));
    await page.waitForTimeout(1000);
    const after = await page.evaluate(() => document.body.innerText.match(/添加子意图|未命名|新建|子意图 \d|新意图/g));
    console.log('AFTER_MOUSE_ADD:', JSON.stringify(after));
    await shot(page, '33-after-add');
  }

  // Escape 逐层返回，记录面包屑
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(650);
    console.log(`ESC${i}:`, await bc(page));
  }
  await browser.close();
})().catch((e) => { console.error('FATAL', String(e).slice(0, 400)); process.exit(1); });
