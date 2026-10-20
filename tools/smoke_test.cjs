// Offline smoke test: serves the repo, replaces Supabase with a small fake, signs in as an Admin and opens every
// page (and every tab on it) at desktop and phone width. Fails on any script error or sideways page scroll.
//   node tools/smoke_test.cjs                 # built-in tiny dataset
//   FIXTURE=rows.json node tools/smoke_test.cjs   # {"table_name": [snake_case rows]} to test with real-shaped data
// No password or network is needed. Chromium: set CHROMIUM_PATH if it is not found.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');

const ROOT = path.resolve(__dirname, '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.xlsx': 'application/octet-stream' };
const UID = '00000000-0000-0000-0000-000000000001';
const T = (iso, d) => { const x = new Date(iso + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + d); return x.toISOString().slice(0, 10); };
const today = new Date().toISOString().slice(0, 10);

function builtIn() {
  const ops = [0, 1, 2].map((i) => ({ id: `OP-${i}`, date: T(today, -i), site_name: 'REX Forestry Project - Kangidi', operation_type: 'Phase 1', equipment: 'EMG-004', operator_id: 'EMP-11', supervisor_id: 'EMP-1', hours_worked: 8, quantity: 1.2, fuel_used: 200, closing_diesel: 50, time_resumed: '07:00', time_closed: '15:00' }));
  return {
    employees: [
      { id: 'EMP-26', name: 'Olumide Davidson', role: 'Chief Operations Officer', department: 'Administration', status: 'Active', access_tier: 'Admin', auth_user_id: UID, is_owner: true },
      { id: 'EMP-1', name: 'Oki Christopher', role: 'General Manager/Site Manager', department: 'Administration', status: 'Active', access_tier: 'Supervisor' },
      { id: 'EMP-11', name: 'Adebayo Tope', role: 'Operator/EMG004', department: 'Operations', status: 'Active', access_tier: 'Staff' },
    ],
    projects: [{ id: 'PRJ-1', name: 'REX Forestry Project - Kangidi', status: 'Active', client: 'Rex' }],
    inventory: [{ id: 'INV-1', name: 'EMG-004', category: 'Heavy Equipment', ownership: 'Company', fleet_status: 'Active', current_project: 'REX Forestry Project - Kangidi', quantity: 1, reorder_level: 0 }],
    operations: ops,
    fund_requests: [{ id: 'FR-1', date: today, description: 'Oil for Tope', status: 'Pending', cost_head: 'Maintenance', submitted_by: 'EMP-1', project: 'REX Forestry Project - Kangidi', fund_request_items: [{ description: 'Engine oil', amount: 100000, sort_order: 0 }] }],
    diesel_site_distributions: [{ id: 'DSD-1', date: T(today, -1), equipment: 'EMG-004', litres: 250, project: 'REX Forestry Project - Kangidi' }],
    fuel_credit_collections: [{ id: 'FCC-1', date: T(today, -1), station: 'Midejab Ltd', fuel_type: 'Diesel', litres: 500, unit_price: 1900, notes: '' }],
    diesel_stock_counts: [{ id: 'DSC-1', date: T(today, -1), counted_litres: 120 }],
  };
}


// Elements that stick out past the screen and are not inside something that scrolls on its own.
const offenders = (page) => page.evaluate(() => {
  const scrolls = (e) => { for (let n = e.parentElement; n && n !== document.body; n = n.parentElement) { const o = getComputedStyle(n).overflowX; if (o === 'auto' || o === 'scroll') return true; } return false; };
  const out = [];
  document.querySelectorAll('main.view *').forEach((e) => {
    const r = e.getBoundingClientRect();
    if (r.width && r.right > window.innerWidth + 4 && !scrolls(e)) out.push(`${e.tagName.toLowerCase()}.${String(e.className).split(' ')[0] || '-'} (${Math.round(r.right)}px)`);
  });
  return [...new Set(out)].slice(0, 3).join(', ');
});

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let p = decodeURIComponent(req.url.split('?')[0]);
      if (p.endsWith('/')) p += 'index.html';
      const file = path.join(ROOT, p);
      if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('not found'); return; }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    }).listen(0, '127.0.0.1', () => resolve(server));
  });
}

(async () => {
  const data = process.env.FIXTURE ? JSON.parse(fs.readFileSync(process.env.FIXTURE, 'utf8')) : builtIn();
  const writes = [];
  const server = await startServer();
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const problems = [];
  const routes = [...fs.readFileSync(path.join(ROOT, 'erp/js/router.js'), 'utf8').matchAll(/path: '([A-Za-z]+)'/g)].map((m) => m[1]);

  for (const width of (process.env.WIDTHS||'1400,400').split(',').map(Number)) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 } });
    await ctx.route('**/*.supabase.co/**', async (route) => {
      const req = route.request();
      const url = new URL(req.url());
      const json = (status, body) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
      if (url.pathname.startsWith('/auth/v1/token')) return json(200, { access_token: 'x.y.z', token_type: 'bearer', expires_in: 3600, refresh_token: 'r', user: { id: UID, aud: 'authenticated', email: 'olumide@emagrims-erp.app' } });
      if (url.pathname.startsWith('/auth/v1/')) return json(200, {});
      if (url.pathname.startsWith('/rest/v1/rpc/')) {
        const name = url.pathname.split('/').pop();
        if (name === 'next_record_id') return json(200, 'NEW-1');
        return json(404, { code: 'PGRST202', message: 'Could not find the function public.' + name });
      }
      if (url.pathname.startsWith('/rest/v1/')) {
        const table = url.pathname.split('/').pop();
        if (req.method() !== 'GET') { writes.push(`${req.method()} ${table}`); return json(201, []); }
        const rows = data[table] || [];
        const offset = +(url.searchParams.get('offset') || 0);
        const limit = +(url.searchParams.get('limit') || rows.length || 1);
        const single = /vnd.pgrst.object/.test(req.headers().accept || '');
        const page = rows.slice(offset, offset + limit);
        return json(200, single ? (page[0] || null) : page);
      }
      return json(404, {});
    });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|favicon|net::ERR/.test(m.text())) errors.push('console: ' + m.text()); });
    await page.goto(`${base}/erp/`, { waitUntil: 'networkidle' });
    await page.fill('input[name=username]', 'olumide');
    await page.fill('input[name=password]', 'test-password');
    await page.click('button[type=submit]');
    await page.waitForSelector('main.view', { timeout: 20000 });
    if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT, fullPage: true });
    for (const route of routes) {
      const before = errors.length;
      await page.goto(`${base}/erp/#/${route}`, { waitUntil: 'load' });
      await page.waitForSelector('main.view', { timeout: 15000 }).catch(() => {});
      await page.waitForFunction(() => (document.querySelector('main.view')?.innerText || '').trim().length > 20, null, { timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(500);
      const tabs = await page.$$eval('main.view .tab-btn', (b) => b.map((x) => x.textContent.trim()));
      const check = async (label) => {
        const info = await page.evaluate(() => {
          const v = document.querySelector('main.view');
          return { text: (v?.innerText || '').trim().length, over: document.documentElement.scrollWidth - document.documentElement.clientWidth };
        });
        if (info.text < 20) problems.push(`[${width}] ${label}: page is empty`);
        if (width <= 480 && info.over > 8) problems.push(`[${width}] ${label}: scrolls sideways by ${info.over}px; wide: ${await offenders(page)}`);
        if (errors.length > before) problems.push(`[${width}] ${label}: ${errors.slice(before).join(' | ')}`);
      };
      await check(route);
      for (const tab of tabs) {
        const b = errors.length;
        await page.click(`main.view .tab-btn:has-text("${tab.replace(/"/g, '')}")`, { timeout: 3000 }).catch(() => {});
        await page.waitForTimeout(350);
        const info = await page.evaluate(() => ({ text: (document.querySelector('main.view')?.innerText || '').trim().length, over: document.documentElement.scrollWidth - document.documentElement.clientWidth }));
        if (info.text < 20) problems.push(`[${width}] ${route} > ${tab}: empty`);
        if (width <= 480 && info.over > 8) problems.push(`[${width}] ${route} > ${tab}: scrolls sideways by ${info.over}px; wide: ${await offenders(page)}`);
        if (errors.length > b) problems.push(`[${width}] ${route} > ${tab}: ${errors.slice(b).join(' | ')}`);
      }
    }
    await ctx.close();
  }
  await browser.close();
  server.close();
  console.log(`${routes.length} pages opened at 2 widths.`);
  if (problems.length) { console.log('PROBLEMS:\n' + [...new Set(problems)].join('\n')); process.exit(1); }
  console.log('No script errors, no empty pages, no sideways scroll on a phone.');
})().catch((e) => { console.error(e); process.exit(1); });
