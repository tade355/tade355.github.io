import { store } from './store.js';
import { el, formatDate } from './utils.js';
import { openCustomModal, closeModal } from './ui.js';
import { fleetItems } from './views/fleet.js';
import { ROUTES } from './router.js';
import { canAccess } from './session.js';
import { canDownloadProfitReports } from './access.js';
import { searchCatalogue, quickLinks } from './searchCatalogue.js';

const canUse = (perm) => (perm === 'profitReports' ? canDownloadProfitReports() : false);

// Go to a page and, if the target sits on a tab (or a tab inside a tab), click
// through the tab buttons once the page has drawn them. Tabs are internal view
// state, so this finds each tab button by its visible text rather than needing
// every view to expose a deep link.
const TAB_WAIT_MS = 4000;
export function openLocation(route, tabs = []) {
  const target = `#/${route}`;
  if (window.location.hash === target) window.dispatchEvent(new HashChangeEvent('hashchange'));
  else window.location.hash = target;
  const view = document.getElementById('view');
  const started = Date.now();
  const clickNext = (i) => {
    if (i >= tabs.length || !view) return;
    const tick = () => {
      const btn = [...view.querySelectorAll('.tab-btn')].find((b) => b.textContent.trim() === tabs[i]);
      if (btn) { btn.click(); setTimeout(() => clickNext(i + 1), 60); return; }
      if (Date.now() - started < TAB_WAIT_MS) setTimeout(tick, 80);
    };
    setTimeout(tick, 80);
  };
  clickNext(0);
}

// One search across the handful of entities people actually look someone
// or something up by name/ID for — before this, finding everything tied to
// one operator or one dozer meant visiting several separate screens,
// because nothing in the app searched across them at once. Each source
// names the ROUTE its results open (a top-level page — some of these
// entities live on a tab inside that page, e.g. Loans inside Accounting,
// which this can't deep-link into without touching every view's internal
// tab state, but landing on the right page is still a real improvement
// over not knowing which page to even open).
function searchSources() {
  const employees = store.get('employees');

  return [
    {
      route: 'hr', kind: 'Employee', tabs: ['Employees'],
      items: () => employees.map((e) => ({
        id: e.id,
        label: e.name,
        meta: [e.role, e.department].filter(Boolean).join(' · '),
        searchText: `${e.id} ${e.name} ${e.role || ''} ${e.department || ''}`,
      })),
    },
    {
      route: 'fleet', kind: 'Equipment', tabs: ['Fleet Roster'],
      items: () => fleetItems().map((i) => ({
        id: i.id,
        label: i.name,
        meta: [i.category, i.ownerName ? `owner: ${i.ownerName}` : null].filter(Boolean).join(' · '),
        searchText: `${i.id} ${i.name} ${i.category || ''} ${i.ownerName || ''}`,
      })),
    },
    {
      route: 'projects', kind: 'Project',
      items: () => store.get('projects').map((p) => ({
        id: p.id,
        label: p.name,
        meta: p.rateUnit || '',
        searchText: `${p.id} ${p.name}`,
      })),
    },
    {
      route: 'operations', kind: 'Operation',
      items: () => store.get('operations').map((o) => ({
        id: o.id,
        label: `${o.equipment || 'Unassigned'} — ${o.date ? formatDate(o.date) : 'no date'}`,
        meta: [o.siteName, employees.find((e) => e.id === o.operatorId)?.name].filter(Boolean).join(' · '),
        searchText: `${o.id} ${o.equipment || ''} ${o.siteName || ''} ${o.date || ''} ${o.operationType || ''}`,
      })),
    },
    {
      route: 'sales', kind: 'Invoice', tabs: ['Invoices'],
      items: () => {
        const customers = store.get('customers');
        return store.get('invoices').map((inv) => ({
          id: inv.id,
          label: inv.id,
          meta: [customers.find((c) => c.id === inv.customerId)?.name, inv.project].filter(Boolean).join(' · '),
          searchText: `${inv.id} ${inv.project || ''} ${customers.find((c) => c.id === inv.customerId)?.name || ''}`,
        }));
      },
    },
    {
      route: 'sales', kind: 'Customer', tabs: ['Customers'],
      items: () => store.get('customers').map((c) => ({
        id: c.id,
        label: c.name,
        meta: c.contact || '',
        searchText: `${c.id} ${c.name} ${c.contact || ''} ${c.phone || ''} ${c.email || ''}`,
      })),
    },
    {
      route: 'purchasing', kind: 'Supplier', tabs: ['Suppliers'],
      items: () => store.get('suppliers').map((s) => ({
        id: s.id,
        label: s.name,
        meta: s.contact || '',
        searchText: `${s.id} ${s.name} ${s.contact || ''} ${s.phone || ''} ${s.email || ''}`,
      })),
    },
    {
      route: 'accounting', kind: 'Expense', tabs: ['Expenses'],
      items: () => store.get('expenses').map((ex) => ({
        id: ex.id,
        label: ex.description || ex.id,
        meta: [ex.category, ex.payee].filter(Boolean).join(' · '),
        searchText: `${ex.id} ${ex.description || ''} ${ex.payee || ''} ${ex.category || ''} ${ex.project || ''}`,
      })),
    },
    {
      route: 'accounting', kind: 'Loan', tabs: ['Loans'],
      items: () => store.get('loans').map((l) => ({
        id: l.id,
        label: l.lender || l.id,
        meta: l.category || '',
        searchText: `${l.id} ${l.lender || ''} ${l.category || ''}`,
      })),
    },
    {
      route: 'fundRequests', kind: 'Fund Request', tabs: ['Requests'],
      items: () => store.get('fundRequests').map((f) => ({
        id: f.id,
        label: f.description || f.id,
        meta: [f.project, f.costHead].filter(Boolean).join(' · '),
        searchText: `${f.id} ${f.description || ''} ${f.project || ''} ${f.costHead || ''}`,
      })),
    },
    {
      route: 'fleet', tabs: ['Inventory & Equipment'], kind: 'Inventory item',
      items: () => store.get('inventory').map((i) => ({
        id: i.id,
        label: i.name,
        meta: [i.category, i.location, i.currentProject].filter(Boolean).join(' · '),
        searchText: `${i.id} ${i.name} ${i.category || ''} ${i.sku || ''} ${i.location || ''} ${i.currentProject || ''}`,
      })),
    },
    {
      route: 'fleet', tabs: ['Maintenance Log'], kind: 'Maintenance',
      items: () => store.get('maintenanceLogs').map((m) => ({
        id: m.id,
        label: `${m.equipment || m.equipmentName || m.id} — ${m.date ? formatDate(m.date) : 'no date'}`,
        meta: [m.type, m.description].filter(Boolean).join(' · '),
        searchText: `${m.id} ${m.equipment || ''} ${m.equipmentName || ''} ${m.description || ''} ${m.type || ''} ${m.date || ''}`,
      })),
    },
    {
      route: 'purchasing', tabs: ['Fuel Credit'], kind: 'Fuel credit',
      items: () => store.get('fuelCreditCollections').map((c) => ({
        id: c.id,
        label: `${c.litres || 0} L ${c.fuelType || ''} — ${c.date ? formatDate(c.date) : 'no date'}`,
        meta: [c.station, c.notes].filter(Boolean).join(' · '),
        searchText: `${c.id} ${c.date || ''} ${c.fuelType || ''} ${c.station || ''} ${c.notes || ''}`,
      })),
    },
  ];
}

const MAX_PER_KIND = 6;

function runSearch(query) {
  const q = query.trim().toLowerCase();
  if (q.length < 1) return [];

  // Pages, tabs and features first — they answer "where is X?".
  const results = searchCatalogue(q, { routes: ROUTES, canAccess, canUse }).map((e) => ({
    ...e, isLocation: true, meta: e.kind === 'Page' ? '' : `in ${e.routeLabel}${e.tabs && e.tabs.length > 1 ? ` › ${e.tabs.slice(0, -1).join(' › ')}` : ''}`,
  }));
  if (q.length < 2) return results;

  searchSources().forEach((source) => {
    const route = ROUTES.find((r) => r.path === source.route);
    if (route && (!canAccess(route.tiers) || (route.guard && !route.guard()))) return;
    const matches = source.items().filter((item) => item.searchText.toLowerCase().includes(q));
    matches.slice(0, MAX_PER_KIND).forEach((item) => results.push({ ...item, kind: source.kind, route: source.route, tabs: source.tabs }));
    if (matches.length > MAX_PER_KIND) {
      results.push({
        kind: source.kind, route: source.route, tabs: source.tabs, isOverflow: true,
        label: `+${matches.length - MAX_PER_KIND} more ${source.kind.toLowerCase()} match${matches.length - MAX_PER_KIND === 1 ? '' : 'es'} — open ${route?.label || source.route} to see all`,
      });
    }
  });
  return results;
}

export function openGlobalSearch() {
  openCustomModal({
    title: 'Search',
    wide: true,
    build: (body) => {
      const input = el('input', { type: 'text', class: 'global-search-input', placeholder: 'Search pages, tabs, features, people, dozers, invoices…' });
      const resultsEl = el('div', { class: 'global-search-results' });
      const hint = el('p', { class: 'section-subtitle' }, 'Find any page, tab or feature (try "fuel credit", "ask", "profitability", "download"), or look up a person, dozer, project, invoice or record. Picking a result takes you straight to it.');
      body.appendChild(input);
      body.appendChild(hint);
      body.appendChild(resultsEl);

      let selected = 0;
      let current = [];

      function go(result) {
        closeModal();
        openLocation(result.route, result.tabs || []);
      }

      function renderResults() {
        resultsEl.innerHTML = '';
        if (!current.length && !input.value.trim()) {
          resultsEl.appendChild(el('p', { class: 'dd-muted' }, 'Quick links'));
          current = quickLinks({ routes: ROUTES, canAccess, canUse }).map((e) => ({ ...e, isLocation: true, meta: '' }));
        }
        if (!current.length) {
          const q = input.value.trim();
          resultsEl.appendChild(el('p', { class: 'table-empty' }, `No matches for "${q}".`));
          return;
        }
        current.forEach((r, i) => {
          const row = el('button', {
            type: 'button',
            class: `global-search-result${i === selected ? ' global-search-result-active' : ''}${r.isOverflow ? ' global-search-result-overflow' : ''}`,
            onClick: () => go(r),
          }, r.isOverflow ? [el('span', {}, r.label)] : [
            el('span', { class: 'global-search-kind' }, r.kind),
            el('span', { class: 'global-search-label', title: r.label }, r.label.length > 90 ? `${r.label.slice(0, 87)}…` : r.label),
            r.meta ? el('span', { class: 'global-search-meta' }, r.meta) : null,
          ]);
          resultsEl.appendChild(row);
        });
      }

      input.addEventListener('input', () => {
        current = input.value.trim() ? runSearch(input.value) : [];
        selected = 0;
        renderResults();
      });

      input.addEventListener('keydown', (evt) => {
        if (evt.key === 'Escape') { closeModal(); return; }
        if (!current.length) return;
        if (evt.key === 'ArrowDown') {
          evt.preventDefault();
          selected = Math.min(selected + 1, current.length - 1);
          renderResults();
        } else if (evt.key === 'ArrowUp') {
          evt.preventDefault();
          selected = Math.max(selected - 1, 0);
          renderResults();
        } else if (evt.key === 'Enter') {
          evt.preventDefault();
          go(current[selected]);
        }
      });

      renderResults();
      setTimeout(() => input.focus(), 0);
    },
  });
}

// Press "/" anywhere outside a text field to open search — mirrors the
// convention most people already know from GitHub/Slack/etc. Typing "/"
// into an actual input/textarea/select (or a contenteditable field) is
// left alone, so it can't hijack normal typing.
export function initGlobalSearchShortcut() {
  document.addEventListener('keydown', (evt) => {
    if (evt.key !== '/' || evt.metaKey || evt.ctrlKey || evt.altKey) return;
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || document.activeElement?.isContentEditable) return;
    evt.preventDefault();
    openGlobalSearch();
  });
}
