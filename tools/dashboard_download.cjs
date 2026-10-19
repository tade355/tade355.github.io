// Download the Daily Operations Dashboard as a standalone HTML file.
//   node tools/dashboard_download.cjs 2026-10-18 out.html "EMG-006,EMG-008,D8K Collins"
// The third argument lists the dozers that work tomorrow (fueling request). Omit it
// to keep the ERP's default selection. Needs ERP_PW in the environment.
const { chromium } = require('playwright-core');
const [date, out = `Daily_Dashboard_${date}.html`, active] = process.argv.slice(2);
if (!date || !process.env.ERP_PW) { console.error('usage: ERP_PW=... node dashboard_download.cjs YYYY-MM-DD [out.html] ["EMG-006,EMG-008"]'); process.exit(1); }
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const page = await (await browser.newContext({ acceptDownloads: true, viewport: { width: 1300, height: 900 } })).newPage();
  page.on('pageerror', (e) => console.log('PAGEERR', e.message));
  await page.goto('https://tade355.github.io/erp/#/dailyDashboard', { waitUntil: 'networkidle' });
  await page.fill('input[name=username]', process.env.ERP_USER || 'olumide');
  await page.fill('input[name=password]', process.env.ERP_PW);
  await page.click('button[type=submit]');
  await page.waitForSelector('.dd-body', { timeout: 30000 });
  await page.fill('.filter-bar input[type=date] >> nth=0', date);
  await page.dispatchEvent('.filter-bar input[type=date] >> nth=0', 'change');
  await page.waitForTimeout(1500);
  if (active) {
    const keep = active.split(',').map((s) => s.trim());
    const labels = await page.$$eval('label.dd-kv-row:has(input[type=checkbox])', (ls) => ls.map((l) => l.innerText));
    for (const text of labels) {
      const box = page.locator('label.dd-kv-row', { hasText: text.split('\n')[0].trim() }).locator('input[type=checkbox]').first();
      const wanted = keep.some((k) => text.includes(k));
      if ((await box.isChecked()) !== wanted) await (wanted ? box.check() : box.uncheck());
    }
  }
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('button:has-text("Download HTML")')]);
  await download.saveAs(out);
  console.log('saved', out);
  await browser.close();
})();
