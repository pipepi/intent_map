const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  page.on('pageerror', (e) => console.log('PAGE_ERR:', String(e).slice(0, 200)));
  await page.goto('http://localhost:7100/', { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(4000);

  // 进业务画布选中节点
  await page.locator('article[data-node-id="current_container"]').first().dblclick({ timeout: 5000 });
  await page.waitForTimeout(1300);
  await page.locator('.business-node:has-text("场景匹配的 UI Demo 与流程共识")').first().click();
  await page.waitForTimeout(500);
  console.log('IN_BIZ properties-surface count:', await page.evaluate(() => document.querySelectorAll('.properties-surface').length));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(900);
  const mode = await page.evaluate(() => document.querySelector('[data-node-id="properties"]')?.getAttribute('data-display-mode'));
  console.log('AFTER_ESC properties mode:', mode);
  if (mode === 'minimized') {
    await page.locator('[data-node-id="properties"]').first().dblclick();
    await page.waitForTimeout(700);
  }
  const info = await page.evaluate(() => {
    const n = document.querySelector('[data-node-id="properties"]');
    const s = document.querySelector('.properties-surface');
    return {
      nodeExists: !!n,
      mode: n?.getAttribute('data-display-mode'),
      surfaceCount: document.querySelectorAll('.properties-surface').length,
      surfaceHTML: s ? s.innerHTML.slice(0, 400) : null,
      nodeHTMLHead: n ? n.innerHTML.slice(0, 300) : null,
    };
  });
  console.log(JSON.stringify(info, null, 2));
  await page.screenshot({ path: 'shots/93-props-diag.png' });
  await browser.close();
})().catch((e) => { console.error('FATAL', String(e).slice(0, 400)); process.exit(1); });
