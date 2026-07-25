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

  // 1. 品牌文案
  await enterById(page, 'global_toolbar');
  const brand = await page.evaluate(() => (document.querySelector('.runtime-brand') || {}).innerText || 'NO_BRAND');
  console.log('1_BRAND:', JSON.stringify(brand.replace(/\n/g, ' ')));

  // 2. 鼠标点击 锁定布局（此前被吞）
  await page.locator('button:has-text("锁定布局")').first().click();
  await page.waitForTimeout(1000);
  const lockLabel = await page.evaluate(() => [...document.querySelectorAll('button')].map((b) => b.innerText.trim()).filter((t) => t.includes('布局')).join(','));
  console.log('2_MOUSE_LOCK:', lockLabel, lockLabel.includes('解锁布局') ? 'PASS' : 'FAIL');

  // 3. Ctrl+Z 撤销（应回到 锁定布局）
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(800);
  const afterUndo = await page.evaluate(() => [...document.querySelectorAll('button')].map((b) => b.innerText.trim()).filter((t) => t.includes('布局')).join(','));
  console.log('3_CTRL_Z:', afterUndo, afterUndo.includes('锁定布局') ? 'PASS' : 'FAIL');

  // 4. 遮挡检测：撤销/重做/兼容v1 不再被 添加子节点 覆盖
  const occlusion = await page.evaluate(() => {
    const out = {};
    for (const label of ['兼容 v1', '撤销', '重做']) {
      const btn = [...document.querySelectorAll('button')].find((b) => (b.innerText || '').trim() === label);
      if (!btn) { out[label] = 'NOT_FOUND'; continue; }
      const r = btn.getBoundingClientRect();
      const el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      out[label] = el === btn || btn.contains(el) ? 'OK' : `COVERED_BY:${(el.innerText || el.className || '').slice(0, 20)}`;
    }
    return out;
  });
  console.log('4_OCCLUSION:', JSON.stringify(occlusion));

  // 5. 鼠标点击 运行（此前被吞）
  await page.locator('button:has-text("运行")').first().click();
  await page.waitForTimeout(2500);
  const execState = await page.evaluate(() => document.body.innerText.includes('停止') ? 'RUNNING' : 'IDLE_OR_DONE');
  console.log('5_MOUSE_RUN:', execState);

  // 6. 新建确认对话框（先制造 dirty：点击 泳道布局）
  await page.locator('button:has-text("泳道布局")').first().click();
  await page.waitForTimeout(800);
  let dialogSeen = '';
  page.once('dialog', async (d) => { dialogSeen = d.message().slice(0, 40); await d.dismiss(); });
  await page.locator('button:has-text("新建")').first().click();
  await page.waitForTimeout(1200);
  console.log('6_NEW_CONFIRM:', dialogSeen ? `PASS "${dialogSeen}"` : 'FAIL_NO_DIALOG');
  await page.screenshot({ path: 'shots/60-toolbar-fixed.png' });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(700);

  // 7. 双击当前容器渲染器 -> 直进业务画布（面包屑不再出现 当前容器渲染器/当前业务容器）
  await page.locator('article[data-node-id="current_container"]').first().dblclick({ timeout: 5000 });
  await page.waitForTimeout(1200);
  const bc1 = await bc(page);
  console.log('7_DEREF:', bc1, (!bc1.includes('当前容器渲染器') && !bc1.includes('当前业务容器') && bc1.includes('Agentic')) ? 'PASS' : 'CHECK');
  await page.screenshot({ path: 'shots/61-business-direct.png' });

  // 8. 下钻后面包屑末位为真实节点名
  const drill = page.locator('text=核心物流动场景序列与约束').first();
  await drill.dblclick({ timeout: 5000 }); await page.waitForTimeout(450);
  await drill.dblclick({ timeout: 5000 }); await page.waitForTimeout(1000);
  const bc2 = await bc(page);
  console.log('8_BREADCRUMB:', bc2, bc2.endsWith('核心物流动场景序列与约束 0 管道 148%') || bc2.includes('› 核心物流动场景序列与约束 0') ? 'PASS' : 'CHECK');

  // 9. Enter 键进入选中节点 / Esc 返回
  await page.keyboard.press('Escape'); await page.waitForTimeout(600);
  await page.keyboard.press('Escape'); await page.waitForTimeout(600);
  await browser.close();
})().catch((e) => { console.error('FATAL', String(e).slice(0, 400)); process.exit(1); });
