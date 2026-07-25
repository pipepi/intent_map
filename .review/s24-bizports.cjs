const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  page.on('pageerror', (e) => console.log('PAGE_ERR:', String(e).slice(0, 200)));
  await page.goto('http://localhost:7100/', { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(4000);

  await page.locator('article[data-node-id="current_container"]').first().dblclick({ timeout: 5000 });
  await page.waitForTimeout(1300);
  const expand = async (name) => {
    const loc = page.locator(`.business-node:has-text("${name}")`).first();
    const mode = await loc.getAttribute('data-display-mode');
    if (mode === 'minimized') { await loc.dblclick(); await page.waitForTimeout(600); }
  };
  await expand('核心物流动场景序列与约束');
  await expand('场景匹配的 UI Demo 与流程共识');

  // 布局断言：名称 → 端口带 → 描述（纵向顺序），端口中心 ≈ 66+12=78
  const layout = await page.evaluate(() => {
    const node = [...document.querySelectorAll('.business-node.expanded')]
      .find((n) => n.textContent.includes('场景匹配的 UI Demo'));
    if (!node) return 'NODE_MISSING';
    const nr = node.getBoundingClientRect();
    const name = node.querySelector('strong')?.getBoundingClientRect();
    const port = node.querySelector('.business-node-ports i.input')?.getBoundingClientRect();
    const stripEl = node.querySelector('.business-node-ports');
    const strip = stripEl?.getBoundingClientRect();
    const desc = node.querySelector('small')?.getBoundingClientRect();
    return {
      nameBottom: Math.round(name.bottom - nr.top),
      stripTop: Math.round(strip.top - nr.top),
      portCenter: Math.round(port.top - nr.top + port.height / 2),
      descTop: Math.round(desc.top - nr.top),
      stripBottom: Math.round(strip.top - nr.top + stripEl.querySelectorAll('i').length * 28),
      height: Math.round(nr.height),
    };
  });
  console.log('BIZ_LAYOUT:', JSON.stringify(layout));
  console.log('EDGES:', await page.evaluate(() => document.querySelectorAll('.business-edge').length));
  await page.screenshot({ path: 'shots/95-biz-ports-strip.png' });
  await browser.close();
  console.log('S24_DONE');
})().catch((e) => { console.error('FATAL', String(e).slice(0, 400)); process.exit(1); });
