import test from 'node:test';
import assert from 'node:assert/strict';
import { CATALOGUE, searchCatalogue, quickLinks } from './searchCatalogue.js';

const routes = [
  { path: 'dashboard', label: 'Dashboard', tiers: ['Admin', 'Accounts'] },
  { path: 'dailyDashboard', label: 'Daily Operations Dashboard', tiers: ['Admin', 'Accounts', 'Supervisor'] },
  { path: 'askErp', label: 'Ask the ERP', tiers: ['Admin', 'Accounts', 'Supervisor'] },
  { path: 'purchasing', label: 'Purchasing & Suppliers', tiers: ['Admin', 'Accounts'] },
  { path: 'accounting', label: 'Accounting & Expenses', tiers: ['Admin', 'Accounts'] },
  { path: 'resourceManagement', label: 'Resource Management', tiers: ['Admin', 'Accounts', 'Supervisor'] },
  { path: 'hr', label: 'HR & Employees', tiers: ['Admin'] },
];
const admin = { routes, canAccess: () => true };
const supervisor = { routes, canAccess: (tiers) => tiers.includes('Supervisor') };

test('"ask" finds the Ask the ERP page first', () => {
  const r = searchCatalogue('ask', admin);
  assert.equal(r[0].route, 'askErp');
  assert.equal(r[0].kind, 'Page');
});

test('a tab is found with the page and tab chain to open', () => {
  const r = searchCatalogue('fuel credit', admin);
  const tab = r.find((x) => x.kind === 'Tab');
  assert.equal(tab.route, 'purchasing');
  assert.deepEqual(tab.tabs, ['Fuel Credit']);
});

test('nested tabs carry the whole chain', () => {
  const r = searchCatalogue('station ledger', admin);
  assert.deepEqual(r[0].tabs, ['Diesel Management', 'Station Ledger']);
  assert.equal(r[0].route, 'resourceManagement');
});

test('features are searchable by their keywords', () => {
  const r = searchCatalogue('download html', admin);
  assert.ok(r.some((x) => x.route === 'dailyDashboard' && x.kind === 'Feature'));
});

test('results the user cannot open are hidden', () => {
  assert.equal(searchCatalogue('payroll', supervisor).length, 0);
  assert.equal(searchCatalogue('fuel credit', supervisor).length, 0);
  assert.ok(searchCatalogue('ask', supervisor).length > 0);
});

test('the profitability report builder only appears for permitted users', () => {
  assert.ok(!searchCatalogue('report builder', { ...admin, canUse: () => false }).some((x) => x.perm));
  assert.ok(searchCatalogue('report builder', { ...admin, canUse: (p) => p === 'profitReports' }).some((x) => x.perm === 'profitReports'));
});

test('every word must match, and empty queries return nothing', () => {
  assert.equal(searchCatalogue('', admin).length, 0);
  assert.equal(searchCatalogue('zzzz qqqq', admin).length, 0);
  assert.equal(searchCatalogue('operator allowance', admin)[0].tabs[0], 'Operator Allowance');
});

test('quick links list the key pages the user can open', () => {
  const q = quickLinks(supervisor);
  assert.ok(q.some((x) => x.route === 'askErp'));
  assert.ok(!q.some((x) => x.route === 'dashboard'));
});

test('catalogue entries have a label and route', () => {
  CATALOGUE.forEach((e) => { assert.ok(e.label && e.route && e.kind); });
});

test('Data Import is found only where the route guard allows it', () => {
  const r = [...routes, { path: 'dataImport', label: 'Data Import', tiers: ['Admin'], guard: () => false }];
  assert.equal(searchCatalogue('upload excel', { routes: r, canAccess: () => true }).length, 0);
  const open = [...routes, { path: 'dataImport', label: 'Data Import', tiers: ['Admin'], guard: () => true }];
  assert.equal(searchCatalogue('upload excel', { routes: open, canAccess: () => true })[0].route, 'dataImport');
});

test('Person History is found as an HR tab and as a feature, for Admin only', () => {
  const r = searchCatalogue('person history', admin);
  assert.ok(r.some((x) => x.kind === 'Tab' && x.route === 'hr' && x.tabs[0] === 'Person History'));
  assert.ok(searchCatalogue('mechanic jobs', admin).some((x) => x.kind === 'Feature' && x.route === 'hr' && x.tabs[0] === 'Person History'));
  assert.equal(searchCatalogue('person history', supervisor).length, 0);
});
