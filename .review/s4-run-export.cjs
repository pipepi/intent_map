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
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, acceptDownloads: true });
  const page = await ctx.newPage();
  page.on('console', (m) => console.log('CONSOLE:', m.type(), m.text().slice(0, 150)));
  page.on('pageerror', (e) => console.log('PAGE_ERR:', String(e).slice(0, 300)));
  await page.goto('http://localhost:7100/', { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(3500);

  await enter(page, '顶栏与全局命令');

  // 遮挡检测：检查 撤销/重做/兼容v1 按钮中心点被谁覆盖
  const occlusion = await page.evaluate(() => {
    const out = {};
    for (const label of ['兼容 v1', '撤销', '重做', '运行', '导出 v2']) {
      const btn = [...document.querySelectorAll('button')].find((b) => (b.innerText || '').trim() === label);
      if (!btn) { out[label] = 'NOT_FOUND'; continue; }
      const r = btn.getBoundingClientRect();
      const el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      out[label] = el === btn || btn.contains(el) ? 'OK' : `COVERED_BY:${el ? (el.innerText || el.className || el.tagName).slice(0, 30) : 'null'}`;
    }
    return out;
  });
  console.log('OCCLUSION:', JSON.stringify(occlusion));

  // 运行测试：点击后轮询状态
  await page.locator('button:has-text("运行")').first().click();
  for (let i = 0; i < 8; i++) {
    await page.waitForTimeout(500);
    const st = await page.evaluate(() => ({
      saveState: (document.querySelector('.runtime-save-state') || {}).innerText || '',
      toast: (document.querySelector('[aria-label^="关闭提示"]') || {}).innerText || '',
      clock: document.body.innerText.match(/tick (\d+)/)?.[1] || '',
    }));
    console.log(`POLL${i}:`, JSON.stringify(st));
  }
  await page.screenshot({ path: 'shots/16-run-poll.png' });

  // 导出测试
  try {
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 6000 }),
      page.locator('button:has-text("导出 v2")').first().click(),
    ]);
    const path = await download.path();
    const fs = require('fs');
    const content = fs.readFileSync(path, 'utf8');
    console.log('EXPORT_OK:', download.suggestedFilename(), 'bytes:', content.length, 'head:', content.slice(0, 80));
  } catch (e) { console.log('EXPORT_FAIL:', String(e).slice(0, 150)); }

  await browser.close();
})().catch((e) => { console.error('FATAL', String(e).slice(0, 400)); process.exit(1); });
