const { chromium } = require('playwright');
const enterById = async (page, id) => {
  const card = page.locator(`article[data-node-id="${id}"]`).first();
  await card.dblclick({ timeout: 5000 }); await page.waitForTimeout(450);
  await card.dblclick({ timeout: 5000 }); await page.waitForTimeout(900);
};
const bc = async (page) => (await page.evaluate(() => (document.querySelector('[aria-label="当前作用域导航"]') || {}).innerText || 'ROOT')).replace(/\n/g, ' ');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  page.on('pageerror', (e) => console.log('PAGE_ERR:', String(e).slice(0, 200)));
  await page.goto('http://localhost:7100/', { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(4000);

  // 1. 遮挡检测（在工具条作用域内，按钮应无遮挡）
  await enterById(page, 'global_toolbar');
  const occlusion = await page.evaluate(() => {
    const out = {};
    for (const label of ['兼容 v1', '撤销', '重做', '运行']) {
      const btn = [...document.querySelectorAll('button')].find((b) => (b.innerText || '').trim() === label);
      if (!btn) { out[label] = 'NOT_FOUND'; continue; }
      const r = btn.getBoundingClientRect();
      const el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      out[label] = el === btn || btn.contains(el) ? 'OK' : `COVERED_BY:${((el && el.innerText) || '').slice(0, 15)}`;
    }
    return out;
  });
  console.log('1_OCCLUSION:', JSON.stringify(occlusion));

  // 2. 鼠标点击 运行 → 执行器状态
  await page.locator('button:has-text("运行")').first().click();
  await page.waitForTimeout(2500);
  await page.keyboard.press('Escape'); await page.waitForTimeout(700);
  await enterById(page, 'intent_executor');
  const execState = await page.evaluate(() => (document.querySelector('.runtime-inspector-surface') || {}).innerText.replace(/\n/g, ' ') || '');
  console.log('2_EXECUTOR:', JSON.stringify(execState), execState.includes('SUCCESS') ? 'PASS' : 'FAIL');
  await page.keyboard.press('Escape'); await page.waitForTimeout(700);

  // 3. 属性编辑器改名 → Ctrl+Z 撤销 → 名称恢复
  await enterById(page, 'properties');
  const nameInput = page.locator('input:visible').first();
  const original = await nameInput.inputValue();
  await nameInput.fill('改名验证测试');
  await page.waitForTimeout(700);
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(900);
  const restored = await page.locator('input:visible').first().inputValue().catch(() => 'INPUT_GONE');
  console.log('3_UNDO_RENAME:', JSON.stringify({ original, restored }), restored === original ? 'PASS' : (restored === 'INPUT_GONE' ? 'PARTIAL(撤销的是视图提交)' : 'FAIL'));

  // 4. 新建确认对话框
  let dialogSeen = '';
  page.once('dialog', async (d) => { dialogSeen = d.message().slice(0, 40); await d.dismiss(); });
  await page.keyboard.press('Escape'); await page.waitForTimeout(700);
  await enterById(page, 'global_toolbar');
  await page.locator('button:has-text("新建")').first().click();
  await page.waitForTimeout(1200);
  console.log('4_NEW_CONFIRM:', dialogSeen ? `PASS "${dialogSeen}"` : 'FAIL_NO_DIALOG(dirty=false?)');
  await page.keyboard.press('Escape'); await page.waitForTimeout(700);

  // 5. 双击当前容器渲染器 → 直进业务画布
  await page.locator('article[data-node-id="current_container"]').first().dblclick({ timeout: 5000 });
  await page.waitForTimeout(1200);
  const bc1 = await bc(page);
  console.log('5_DEREF:', bc1, (bc1.includes('Agentic') && !bc1.includes('当前业务容器')) ? 'PASS' : 'CHECK');
  await page.screenshot({ path: 'shots/61-business-direct.png' });

  // 6. 下钻：面包屑末位 = 真实节点名
  const drill = page.locator('text=核心物流动场景序列与约束').first();
  await drill.dblclick({ timeout: 5000 }); await page.waitForTimeout(450);
  await drill.dblclick({ timeout: 5000 }); await page.waitForTimeout(1000);
  const bc2 = await bc(page);
  console.log('6_BREADCRUMB:', bc2, !bc2.includes('当前业务容器') ? 'PASS' : 'FAIL');
  await page.screenshot({ path: 'shots-62-drill-breadcrumb.png'.replace('shots-', 'shots/') });

  // 7. 业务画布鼠标点击「＋ 添加子意图」（此前被吞）—— 先在叶子层
  const drill2 = page.locator('text=参与者与触发条件').first();
  await drill2.dblclick({ timeout: 5000 }); await page.waitForTimeout(450);
  await drill2.dblclick({ timeout: 5000 }); await page.waitForTimeout(1000);
  const drill3 = page.locator('text=识别核心参与者').first();
  await drill3.dblclick({ timeout: 5000 }); await page.waitForTimeout(450);
  await drill3.dblclick({ timeout: 5000 }); await page.waitForTimeout(1000);
  const addBtn = page.locator('button:has-text("添加子意图")').first();
  await addBtn.click({ timeout: 5000 }).catch((e) => console.log('ADD_CLICK_ERR', String(e).slice(0, 100)));
  await page.waitForTimeout(1000);
  const added = await page.evaluate(() => document.body.innerText.includes('新意图') || document.body.innerText.match(/未命名|新建意图/) ? 'ADDED?' : document.body.innerText.slice(0, 200));
  console.log('7_MOUSE_ADD_CHILD:', JSON.stringify(added).slice(0, 220));
  await page.screenshot({ path: 'shots/63-after-add.png' });

  await browser.close();
})().catch((e) => { console.error('FATAL', String(e).slice(0, 400)); process.exit(1); });
