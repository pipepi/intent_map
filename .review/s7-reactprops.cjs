const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  page.on('pageerror', (e) => console.log('PAGE_ERR:', String(e).slice(0, 200)));
  await page.goto('http://localhost:7100/', { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(3500);

  // 用 data-node-id 精确定位并进入顶栏节点
  const enterById = async (id) => {
    const card = page.locator(`article[data-node-id="${id}"]`).first();
    await card.dblclick({ timeout: 5000 });
    await page.waitForTimeout(400);
    await card.dblclick({ timeout: 5000 });
    await page.waitForTimeout(900);
  };
  await enterById('global_toolbar');

  // 1. 检查按钮的 React props
  const reactProps = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.innerText.trim() === '锁定布局');
    if (!btn) return 'BTN_NOT_FOUND';
    const key = Object.keys(btn).find((k) => k.startsWith('__reactProps'));
    if (!key) return 'NO_REACT_PROPS';
    const props = btn[key];
    return Object.keys(props).map((k) => `${k}:${typeof props[k]}`).join(',');
  });
  console.log('REACT_PROPS:', reactProps);

  // 2. JS 点击后立刻轮询 tick（通过事件时钟无法同屏看，改为观察 DOM 中 tick 文本：这里直接读 React 状态不可行，
  //    改为观察 layoutLocked 视觉信号：锁定后 resize handle 消失、按钮文案变化）
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.innerText.trim() === '锁定布局');
    btn.click();
  });
  for (let i = 0; i < 5; i++) {
    await page.waitForTimeout(400);
    const st = await page.evaluate(() => ({
      labels: [...document.querySelectorAll('button')].map((b) => b.innerText.trim()).filter((t) => t.includes('布局')),
      handles: document.querySelectorAll('.resize-handle').length,
    }));
    console.log('POLL', i, JSON.stringify(st));
  }
  await browser.close();
})().catch((e) => { console.error('FATAL', String(e).slice(0, 400)); process.exit(1); });
