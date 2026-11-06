// Local-only browser test. All Supabase requests use fictional fixtures.
const { chromium } = require('playwright-core');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const uid = '00000000-0000-0000-0000-000000000001';
const portal = { employee: { id: 'EMP-TEST', name: 'Operator A' }, assignmentStatus: 'Ready', project: 'Project A',
  dozer: { name: 'TEST-008', status: 'Not Active', lastServiceDate: '2026-09-18', hoursSinceService: 158, serviceIntervalHours: 150 },
  reports: [{ id: 'one', date: '2026-11-05', milestone: 'Phase 1', quantity: 1.2, hours: 8, started: '08:10', stopped: '16:20', supervisor: 'Site Manager' },
    { id: 'two', date: '2026-11-04', milestone: 'Phase 1', quantity: 1, hours: 8, started: '08:00', stopped: '16:00', supervisor: 'Site Manager' }],
  issues: [{ id: 'one', createdAt: '2026-11-05T18:00:00Z', priority: 'Urgent', status: 'Open', description: 'Service is overdue for this dozer.' }],
  maintenance: [{ id: 'one', date: '2026-11-05', type: 'Service', status: 'Scheduled' }],
};
(async () => {
  const server = http.createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const file = path.resolve(root, '.' + (pathname.endsWith('/') ? pathname + 'index.html' : pathname));
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
    const mime = { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' }); fs.createReadStream(file).pipe(res);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
  try {
    for (const width of [1400, 400]) {
      let unassigned = false; const issuesSaved = []; const errors = [];
      const context = await browser.newContext({ viewport: { width, height: 900 }, timezoneId: 'Africa/Lagos' });
      await context.route('**/*.supabase.co/**', async route => {
        const req = route.request(); const url = new URL(req.url());
        const json = (status, body) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
        if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
        if (url.pathname.startsWith('/auth/v1/token')) return json(200, { access_token: 'x.y.z', refresh_token: 'test-refresh', token_type: 'bearer', expires_in: 3600, user: { id: uid, aud: 'authenticated', email: 'operator@test.invalid' } });
        if (url.pathname.startsWith('/auth/v1/')) return json(200, {});
        if (url.pathname.endsWith('/rpc/erp_operator_portal')) return json(200, unassigned ? { ...portal, assignmentStatus: 'Unassigned', reports: [], issues: [], maintenance: [] } : portal);
        if (url.pathname.startsWith('/rest/v1/rpc/')) return json(404, { code: 'PGRST202', message: 'Not available in test fixture' });
        if (url.pathname.startsWith('/rest/v1/')) {
          const table = url.pathname.split('/').pop();
          if (req.method() === 'POST' && table === 'dozer_issues') { issuesSaved.push(req.postDataJSON()); return route.fulfill({ status: 201, body: '' }); }
          const employee = { id: 'EMP-TEST', name: 'Operator A', role: 'Operator/TEST008', department: 'Operations', status: 'Active', access_tier: 'Staff', assigned_project: 'Project A', assigned_dozer: 'TEST-008', auth_user_id: uid };
          const rows = ['employees','employee_directory'].includes(table) ? [employee] : [];
          return json(200, /vnd.pgrst.object/.test(req.headers().accept || '') ? rows[0] || null : rows);
        }
        return json(404, {});
      });
      const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
      await page.clock.install({ time: new Date('2026-11-06T10:00:00Z') });
      await page.goto(`http://127.0.0.1:${server.address().port}/erp/#/dailyDashboard`);
      await page.locator('input[name=username]').fill('operator-test'); await page.locator('input[name=password]').fill('fictional-test-password');
      await page.locator('button[type=submit]').click();
      await page.getByRole('heading', { name: 'My Work & Dozer', exact: true }).waitFor();
      await page.getByRole('button', { name: 'All recorded dates', exact: true }).click();
      await page.getByText('16 hrs', { exact: true }).waitFor();
      const text = await page.locator('main.view').innerText();
      assert.ok(text.includes('TEST-008') && text.includes('Project A') && text.includes('8:10 AM') && text.includes('4:20 PM'));
      assert.ok(!text.includes('₦') && !text.includes('Hourly rate') && !text.includes('Total Cost'));
      await page.getByLabel('My work from', { exact: true }).fill('2026-11-05');
      await page.getByLabel('My work to', { exact: true }).fill('2026-11-05');
      await page.getByText('8 hrs', { exact: true }).waitFor();
      assert.ok(!(await page.locator('main.view').innerText()).includes('04 Nov 2026'));
      await page.getByLabel('Dozer concern', { exact: true }).fill('Please inspect the engine before the next shift.');
      await page.getByRole('button', { name: 'Report issue', exact: true }).click();
      await page.getByRole('button', { name: 'Report issue', exact: true }).waitFor();
      assert.equal(issuesSaved.length, 1); assert.equal(issuesSaved[0].equipment, 'TEST-008');
      assert.equal(issuesSaved[0].project, 'Project A'); assert.equal(issuesSaved[0].reported_by, 'EMP-TEST');
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 8), 'page must fit the screen');
      if (process.env.SHOT_DIR) { fs.mkdirSync(process.env.SHOT_DIR, { recursive: true }); await page.screenshot({ path: path.join(process.env.SHOT_DIR, `operator-portal-${width}.png`), fullPage: true }); }
      unassigned = true;
      await page.goto(`http://127.0.0.1:${server.address().port}/erp/#/dozerIssues`);
      await page.getByText('Ask your administrator to assign both your project and your dozer in your employee record. Your records will appear here after assignment.', { exact: true }).waitFor();
      assert.equal(await page.getByRole('button', { name: 'Report issue', exact: true }).count(), 0);
      assert.deepEqual(errors, []);
      await context.close();
      console.log(`Operator portal ${width}px: own work, AM/PM, filters, issue submission, assignment and privacy checks passed.`);
    }
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exit(1); });
