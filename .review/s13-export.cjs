const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, acceptDownloads: true });
  const page = await ctx.newPage();
  await page.goto('http://localhost:7100/', { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(3500);
  const card = page.locator('article[data-node-id="global_toolbar"]').first();
  await card.dblclick({ timeout: 5000 }); await page.waitForTimeout(450);
  await card.dblclick({ timeout: 5000 }); await page.waitForTimeout(900);
  for (const label of ['导出 v2', '兼容 v1']) {
    try {
      const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 6000 }),
        page.evaluate((t) => { [...document.querySelectorAll('button')].find((b) => b.innerText.trim() === t)?.click(); }, label),
      ]);
      const p = await download.path();
      const c = require('fs').readFileSync(p, 'utf8');
      console.log('EXPORT_OK:', label, download.suggestedFilename(), c.length, 'bytes, version=', JSON.parse(c).version);
    } catch (e) { console.log('EXPORT_FAIL:', label, String(e).slice(0, 100)); }
  }
  // 新建（确认对话框？）
  page.once('dialog', (d) => { console.log('DIALOG:', d.message().slice(0, 60)); d.dismiss(); });
  await page.evaluate(() => { [...document.querySelectorAll('button')].find((b) => b.innerText.trim() === '新建')?.click(); });
  await page.waitForTimeout(1500);
  const afterNew = await page.evaluate(() => document.body.innerText.includes('Agentic') ? 'DOC_INTACT_OR_RESET' : 'DOC_CHANGED');
  console.log('AFTER_NEW:', afterNew);
  await browser.close();
})().catch((e) => { console.error('FATAL', String(e).slice(0, 300)); process.exit(1); });
