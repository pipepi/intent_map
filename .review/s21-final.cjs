const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  page.on('pageerror', (e) => console.log('PAGE_ERR:', String(e).slice(0, 200)));
  await page.goto('http://localhost:7100/', { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(4000);
  await page.screenshot({ path: 'shots/90-first-screen.png' });

  const modeOf = (id) => page.evaluate(
    (nid) => document.querySelector(`[data-node-id="${nid}"]`)?.getAttribute('data-display-mode') ?? 'MISSING', id);
  const ensureExpanded = async (id) => {
    if (await modeOf(id) === 'minimized') {
      await page.locator(`[data-node-id="${id}"]`).first().dblclick();
      await page.waitForTimeout(600);
    }
  };

  // 1. 首屏密度
  for (const id of ['global_toolbar', 'intent_tree', 'current_container', 'module_library']) {
    console.log('DEFAULT_MODE', id, '=', await modeOf(id));
  }

  // 2. 视图操作（展开）+ 单击节点 不应产生撤销历史
  await page.locator('[data-node-id="module_library"]').first().dblclick();
  await page.waitForTimeout(700);
  console.log('AFTER_EXPAND module_library =', await modeOf('module_library'));
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(700);
  console.log('AFTER_CTRLZ module_library =', await modeOf('module_library'), '(期望 expanded)');

  // Ctrl+滚轮放大，直到 properties 节点退出 LOD 摘要（scale >= 0.55）
  const zoomUntilLive = async () => {
    await page.mouse.move(800, 500);
    await page.keyboard.down('Control');
    for (let i = 0; i < 10; i++) {
      const lod = await page.evaluate(() => !!document.querySelector('[data-node-id="properties"] .runtime-lod-summary'));
      if (!lod) break;
      await page.mouse.wheel(0, -240);
      await page.waitForTimeout(350);
    }
    await page.keyboard.up('Control');
    await page.waitForTimeout(300);
  };

  // 3. 真实编辑仍可撤销：业务画布选中节点 → 回应用画布在 properties 面板改名 → Ctrl+Z 还原
  await page.locator('article[data-node-id="current_container"]').first().dblclick({ timeout: 5000 });
  await page.waitForTimeout(1300);
  const node = page.locator('.business-node:has-text("场景匹配的 UI Demo 与流程共识")').first();
  await node.click();
  await page.waitForTimeout(500);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(900);
  await ensureExpanded('properties');
  await zoomUntilLive();
  const nameInput = page.locator('.properties-surface input').first();
  const nameBefore = await nameInput.inputValue();
  await nameInput.click();
  await nameInput.pressSequentially('ZZ', { delay: 60 });
  await page.waitForTimeout(400);
  const nameAfterType = await nameInput.inputValue();
  await page.evaluate(() => document.activeElement && document.activeElement.blur());
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(400);
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(400);
  const nameAfterUndo = await nameInput.inputValue().catch(() => 'INPUT_GONE');
  console.log('RENAME:', JSON.stringify(nameBefore), '→ TYPED:', JSON.stringify(nameAfterType), '→ UNDO:', JSON.stringify(nameAfterUndo));

  // 4. 边高亮（业务画布）：重新进入并选中节点
  await page.locator('article[data-node-id="current_container"]').first().dblclick({ timeout: 5000 });
  await page.waitForTimeout(1300);
  await node.click().catch(() => {});
  await page.waitForTimeout(500);
  const bizHL = await page.evaluate(() => ({
    connected: document.querySelectorAll('.business-edge.edge-connected').length,
    dim: document.querySelectorAll('.business-edge.edge-dim').length,
    total: document.querySelectorAll('.business-edge').length,
  }));
  console.log('BIZ_EDGE_HL:', JSON.stringify(bizHL));
  await page.screenshot({ path: 'shots/91-biz-edge-highlight.png' });

  // 5. 边高亮（应用画布）
  await page.keyboard.press('Escape');
  await page.waitForTimeout(900);
  const clicked = await page.evaluate(() => {
    const el = document.querySelector('[data-node-id="intent_executor"]') || document.querySelector('[data-node-id="command_processor"]');
    if (!el) return false;
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    return true;
  });
  console.log('APP_NODE_CLICKED:', clicked);
  await page.waitForTimeout(600);
  const appHL = await page.evaluate(() => ({
    connected: document.querySelectorAll('.runtime-edge.edge-connected').length,
    dim: document.querySelectorAll('.runtime-edge.edge-dim').length,
    total: document.querySelectorAll('.runtime-edge').length,
  }));
  console.log('APP_EDGE_HL:', JSON.stringify(appHL));
  await page.screenshot({ path: 'shots/92-app-edge-highlight.png' });

  await browser.close();
  console.log('S21_DONE');
})().catch((e) => { console.error('FATAL', String(e).slice(0, 400)); process.exit(1); });
