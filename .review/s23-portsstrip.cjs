const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  page.on('pageerror', (e) => console.log('PAGE_ERR:', String(e).slice(0, 200)));
  await page.goto('http://localhost:7100/', { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(4000);

  // 展开一个带端口的节点（intent_executor）并放大到退出 LOD
  const ensureExpanded = async (id) => {
    const mode = await page.evaluate(
      (nid) => document.querySelector(`[data-node-id="${nid}"]`)?.getAttribute('data-display-mode'), id);
    if (mode === 'minimized') {
      await page.locator(`[data-node-id="${id}"]`).first().dblclick();
      await page.waitForTimeout(600);
    }
  };
  const ids = () => page.evaluate(() => [...document.querySelectorAll('[data-node-id]')].map((n) => n.getAttribute('data-node-id')).join(','));
  console.log('STEP0:', await ids());
  await ensureExpanded('intent_executor');
  console.log('STEP1:', await ids());
  await ensureExpanded('command_processor');
  console.log('STEP2:', await ids());
  await page.waitForTimeout(500);

  // DOM 顺序断言：titlebar → ports → body
  const order = await page.evaluate(() => {
    const node = document.querySelector('[data-node-id="intent_executor"]');
    if (!node) return 'NODE_MISSING';
    const kids = [...node.children].map((el) => el.className.toString().split(' ')[0]);
    return kids.join(' | ');
  });
  console.log('CHILD_ORDER intent_executor:', order);

  // 端口垂直位置：第一个输入端口中心应 = 节点顶 + 38(标题栏) + 16 + 11
  const geo = await page.evaluate(() => {
    const node = document.querySelector('[data-node-id="intent_executor"]');
    const port = node?.querySelector('.runtime-port-input');
    const body = node?.querySelector('.runtime-node-body');
    const strip = node?.querySelector('.runtime-node-ports');
    if (!node || !port || !body || !strip) return 'MISSING';
    const nr = node.getBoundingClientRect();
    const pr = port.getBoundingClientRect();
    const br = body.getBoundingClientRect();
    const sr = strip.getBoundingClientRect();
    return {
      portCenterOffset: Math.round(pr.top - nr.top + pr.height / 2),
      stripTop: Math.round(sr.top - nr.top),
      stripBottom: Math.round(sr.bottom - nr.top),
      bodyTop: Math.round(br.top - nr.top),
      // 与缩放无关的比例：端口中心/条带顶 ≈ 65/38 ≈ 1.71
      ratio: +(((pr.top - nr.top + pr.height / 2) / (sr.top - nr.top)) || 0).toFixed(2),
    };
  });
  console.log('GEO intent_executor:', JSON.stringify(geo), '(期望 stripTop<portCenter<bodyTop, ratio≈1.71)');

  await page.screenshot({ path: 'shots/94-ports-strip.png' });
  await browser.close();
  console.log('S23_DONE');
})().catch((e) => { console.error('FATAL', String(e).slice(0, 400)); process.exit(1); });
