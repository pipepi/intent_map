const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  page.on('pageerror', (e) => console.log('PAGE_ERR:', String(e).slice(0, 200)));
  await page.goto('http://localhost:7100/', { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(4000);

  // 进入业务画布并展开两个节点（端口只在展开态渲染）
  await page.locator('article[data-node-id="current_container"]').first().dblclick({ timeout: 5000 });
  await page.waitForTimeout(1300);
  const expand = async (name) => {
    const loc = page.locator(`.business-node:has-text("${name}")`).first();
    const mode = await loc.getAttribute('data-display-mode');
    if (mode === 'minimized') { await loc.dblclick(); await page.waitForTimeout(600); }
  };
  await expand('核心物流动场景序列与约束');
  await expand('场景匹配的 UI Demo 与流程共识');
  await page.screenshot({ path: 'shots/80-ports-expanded.png' });

  const edgeCount = () => page.evaluate(() => document.querySelectorAll('.business-edge').length);
  console.log('EDGES_BEFORE:', await edgeCount());

  // A. 双击输入端口断开管道（ui_consensus 的 场景规格 输入）
  const inputSel = '[data-port-kind="input"][data-port-node="ui_consensus"][data-port-id="scenario"]';
  const inputBox = await page.locator(inputSel).first().boundingBox();
  console.log('INPUT_BOX:', JSON.stringify(inputBox));
  if (!inputBox) { console.log('INPUT_PORT_NOT_FOUND'); await browser.close(); return; }
  await page.mouse.dblclick(inputBox.x + inputBox.width / 2, inputBox.y + inputBox.height / 2);
  await page.waitForTimeout(900);
  const toastA = await page.evaluate(() => (document.querySelector('[aria-label^="关闭提示"]') || {}).innerText || 'NO_TOAST');
  console.log('A_UNBIND:', JSON.stringify(toastA), 'edges:', await edgeCount());

  // B. 拖拽 scenario_flow 输出 → ui_consensus 输入（重建管道）
  const outputSel = '[data-port-kind="output"][data-port-node="scenario_flow"][data-port-id="scenario_spec"]';
  const outBox = await page.locator(outputSel).first().boundingBox();
  const inBox2 = await page.locator(inputSel).first().boundingBox();
  console.log('OUTPUT_BOX:', JSON.stringify(outBox));
  if (outBox && inBox2) {
    await page.mouse.move(outBox.x + outBox.width / 2, outBox.y + outBox.height / 2);
    await page.mouse.down();
    // 中途截图看临时连线
    await page.mouse.move((outBox.x + inBox2.x) / 2, (outBox.y + inBox2.y) / 2, { steps: 8 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: 'shots/81-dragging.png' });
    await page.mouse.move(inBox2.x + inBox2.width / 2, inBox2.y + inBox2.height / 2, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(1000);
    const toastB = await page.evaluate(() => (document.querySelector('[aria-label^="关闭提示"]') || {}).innerText || 'NO_TOAST');
    console.log('B_CONNECT:', JSON.stringify(toastB), 'edges:', await edgeCount());
  }
  await page.screenshot({ path: 'shots/82-after-connect.png' });
  await browser.close();
})().catch((e) => { console.error('FATAL', String(e).slice(0, 400)); process.exit(1); });
