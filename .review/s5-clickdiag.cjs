const { chromium } = require('playwright');
const enter = async (page, name) => {
  const loc = page.locator(`text=${name}`).first();
  await loc.dblclick({ timeout: 5000 });
  await page.waitForTimeout(500);
  await loc.dblclick({ timeout: 5000 });
  await page.waitForTimeout(900);
};

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  page.on('pageerror', (e) => console.log('PAGE_ERR:', String(e).slice(0, 300)));
  await page.goto('http://localhost:7100/', { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(3500);
  await enter(page, '顶栏与全局命令');

  // A. 鼠标点击「锁定布局」观察文案是否翻转
  const lockBtn = page.locator('button:has-text("锁定布局")').first();
  await lockBtn.click();
  await page.waitForTimeout(1200);
  const lockLabel = await page.evaluate(() => [...document.querySelectorAll('button')].map((b) => b.innerText.trim()).filter((t) => t.includes('布局')).join(','));
  console.log('A_MOUSE_CLICK_LOCK:', lockLabel || 'NO_CHANGE_OR_GONE');

  // B. JS 点击「运行」
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.innerText.trim() === '运行' || b.innerText.trim() === '停止');
    if (btn) btn.click();
  });
  await page.waitForTimeout(2500);
  const runState = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')].map((b) => b.innerText.trim());
    return { hasStop: btns.includes('停止'), hasRun: btns.includes('运行') };
  });
  console.log('B_JS_CLICK_RUN:', JSON.stringify(runState));
  await page.screenshot({ path: 'shots/17-js-click-run.png' });

  // C. 鼠标点击「运行/停止」
  await page.locator('button:has-text("运行")').first().click().catch((e) => console.log('C click err', String(e).slice(0, 100)));
  await page.waitForTimeout(2500);
  const runState2 = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')].map((b) => b.innerText.trim());
    return { hasStop: btns.includes('停止'), hasRun: btns.includes('运行') };
  });
  console.log('C_MOUSE_CLICK_RUN:', JSON.stringify(runState2));

  // D. 检查指针事件：监听 button 上的 click/pointerdown
  const evtLog = await page.evaluate(() => new Promise((resolve) => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.innerText.trim() === '泳道布局');
    if (!btn) return resolve('NO_BTN');
    const log = [];
    for (const t of ['pointerdown', 'pointerup', 'click']) btn.addEventListener(t, () => log.push(t));
    const r = btn.getBoundingClientRect();
    for (const t of ['pointerdown', 'pointerup', 'click']) {
      btn.dispatchEvent(new PointerEvent(t, { bubbles: true, clientX: r.x + 5, clientY: r.y + 5 }));
    }
    setTimeout(() => resolve(log.join(',')), 300);
  }));
  console.log('D_SYNTHETIC_EVENTS:', evtLog);

  await browser.close();
})().catch((e) => { console.error('FATAL', String(e).slice(0, 400)); process.exit(1); });
