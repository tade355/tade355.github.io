// Run an Excel upload through the ERP Data Import page.
//   node tools/import_upload.cjs file.xlsx        -> preview only (nothing saved)
//   node tools/import_upload.cjs file.xlsx go     -> import it
// Template: erp/templates/Emagrims_ERP_Upload_Template.xlsx. Rows with errors are skipped, so
// fix names (use staff IDs such as EMP-1 for ambiguous people) before importing.
const { chromium } = require('playwright-core');
const [file, mode] = process.argv.slice(2);
if (!file || !process.env.ERP_PW) { console.error('usage: ERP_PW=... node import_upload.cjs file.xlsx [go]'); process.exit(1); }
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const page = await (await browser.newContext({ viewport: { width: 1400, height: 1000 } })).newPage();
  await page.goto('https://tade355.github.io/erp/#/dataImport', { waitUntil: 'networkidle' });
  await page.fill('input[name=username]', process.env.ERP_USER || 'olumide');
  await page.fill('input[name=password]', process.env.ERP_PW);
  await page.click('button[type=submit]');
  await page.waitForSelector('.imp-file', { timeout: 60000 });
  await page.setInputFiles('.imp-file', file);
  await page.waitForSelector('.stats-grid', { timeout: 20000 });
  console.log((await page.innerText('.stats-grid')).replace(/\n+/g, ' | '));
  for (const block of await page.$$eval('details.dd-tool', (ds) => ds.map((d) => d.innerText.replace(/\n+/g, ' | ').slice(0, 1200)))) console.log('\n#', block);
  if (mode === 'go') {
    const skip = await page.$('.dd-check:has-text("skip the")'); if (skip) await skip.click();
    await page.click('button:has-text("Import ")');
    await page.waitForSelector('.dd-import-done', { timeout: 60000 });
    console.log('\nRESULT', await page.innerText('.dd-import-done'));
  }
  await browser.close();
})();
