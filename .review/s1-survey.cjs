const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE_ERR:', m.text().slice(0, 200)); });
  page.on('pageerror', (e) => console.log('PAGE_ERR:', String(e).slice(0, 300)));
  await page.goto('http://localhost:7100/', { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(4000);
  await page.screenshot({ path: 'shots/01-app-root.png' });

  const survey = await page.evaluate(() => {
    const vis = (el) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
    };
    const buttons = [...document.querySelectorAll('button')].filter(vis).map((b, i) => ({
      i, text: (b.innerText || '').trim().slice(0, 40), title: b.getAttribute('title') || '', aria: b.getAttribute('aria-label') || '',
      rect: (() => { const r = b.getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y)]; })(),
    }));
    const inputs = [...document.querySelectorAll('input,textarea')].filter(vis).map((el) => ({
      tag: el.tagName, type: el.type || '', placeholder: el.placeholder || '', value: (el.value || '').slice(0, 60),
    }));
    const headings = [...document.querySelectorAll('h1,h2,h3,[role="heading"]')].filter(vis).map((h) => (h.innerText || '').trim().slice(0, 60)).filter(Boolean);
    return { url: location.href, title: document.title, buttons, inputs, headings };
  });
  console.log(JSON.stringify(survey));
  await browser.close();
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
