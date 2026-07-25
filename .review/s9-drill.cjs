const { chromium } = require('playwright');
const shot = async (page, name, ms = 800) => { await page.waitForTimeout(ms); await page.screenshot({ path: `shots/${name}.png` }); console.log('shot:', name); };
const bc = async (page) => (await page.evaluate(() => (document.querySelector('[aria-label="当前作用域导航"]') || {}).innerText || 'ROOT')).replace(/\n/g, ' ');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  page.on('pageerror', (e) => console.log('PAGE_ERR:', String(e).slice(0, 200)));
  await page.goto('http://localhost:7100/', { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(3500);

  // 进入当前容器渲染器 -> 解引用进入业务根
  await page.locator('article[data-node-id="current_container"]').first().dblclick({ timeout: 5000 });
  await page.waitForTimeout(1000);
  await page.locator('article[data-node-id="active_business_scope_ref"]').first().dblclick({ timeout: 5000 });
  await page.waitForTimeout(1200);
  await shot(page, '25-business-canvas');
  console.log('BC_L1:', await bc(page));

  // 业务子节点清单
  const kids = await page.evaluate(() => [...document.querySelectorAll('.business-node, [data-business-id]')]
    .map((el) => (el.innerText || '').split('\n').slice(0, 2).join('/')).slice(0, 12));
  console.log('BIZ_CHILDREN:', JSON.stringify(kids));

  // 下钻第二层
  const drill = async (name, shotName) => {
    try {
      await page.locator(`text=${name}`).first().dblclick({ timeout: 4000 });
      await page.waitForTimeout(1100);
      await shot(page, shotName);
      console.log(`DRILLED ${name}:`, await bc(page));
      return true;
    } catch (e) { console.log(`DRILL_FAIL ${name}`, String(e).slice(0, 100)); return false; }
  };
  await drill('核心物流动场景序列与约束', '26-level2-scenario');
  await drill('参与者与触发条件', '27-level3-participants');
  await drill('识别核心参与者', '28-level4-leaf');

  // 叶子层内容
  const leafText = await page.evaluate(() => document.body.innerText.slice(0, 600));
  console.log('LEAF_TEXT:', JSON.stringify(leafText));

  // 返回到业务根，测试选中节点 -> 属性面板联动
  await page.keyboard.press('Escape'); await page.waitForTimeout(600);
  await page.keyboard.press('Escape'); await page.waitForTimeout(600);
  await page.keyboard.press('Escape'); await page.waitForTimeout(600);
  console.log('BC_BACK:', await bc(page));
  // 单击选中业务节点「业务流程匹配的数据库表结构」
  try {
    await page.locator('text=业务流程匹配的数据库表结构').first().click({ timeout: 4000 });
    await page.waitForTimeout(800);
    await shot(page, '29-node-selected');
  } catch (e) { console.log('SELECT_FAIL', String(e).slice(0, 100)); }

  await browser.close();
})().catch((e) => { console.error('FATAL', String(e).slice(0, 400)); process.exit(1); });
