const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  page.on('pageerror', (e) => console.log('PAGE_ERR:', String(e).slice(0, 200)));
  await page.goto('http://localhost:7100/', { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(4000);
  await page.locator('article[data-node-id="current_container"]').first().dblclick({ timeout: 5000 });
  await page.waitForTimeout(1400);
  await page.screenshot({ path: 'shots/74-business-fit2.png' });
  console.log('done');
  await browser.close();
})().catch((e) => { console.error('FATAL', String(e).slice(0, 300)); process.exit(1); });
