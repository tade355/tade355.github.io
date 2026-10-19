// Full-page screenshot of an ERP page. Table columns can be cut off at narrow widths, so widen it.
//   node tools/screenshot_page.cjs "#/dashboard" out.png [width=1500] [tab label]
//   node tools/screenshot_page.cjs "#/fleet" fleet.png 1750 "Maintenance Log"
const { chromium } = require('playwright-core');
const [hash, out, width = '1500', tab] = process.argv.slice(2);
if (!hash || !out || !process.env.ERP_PW) { console.error('usage: ERP_PW=... node screenshot_page.cjs "#/route" out.png [width] [tab]'); process.exit(1); }
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const page = await (await browser.newContext({ viewport: { width: +width, height: 1000 }, deviceScaleFactor: 1.5 })).newPage();
  await page.goto('https://tade355.github.io/erp/' + hash, { waitUntil: 'networkidle' });
  await page.fill('input[name=username]', process.env.ERP_USER || 'olumide');
  await page.fill('input[name=password]', process.env.ERP_PW);
  await page.click('button[type=submit]');
  await page.waitForSelector('main.view', { timeout: 60000 });
  if (tab) await page.click(`.tab-btn:has-text("${tab}")`);
  await page.waitForTimeout(3000);
  const height = await page.evaluate(() => document.querySelector('main.view').scrollHeight);
  await page.setViewportSize({ width: +width, height: Math.min(height + 40, 7000) });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: out, animations: 'disabled' });
  console.log('saved', out);
  await browser.close();
})();
