let userScope = 'anonymous';
export function setNavigationUser(id) { userScope = id || 'anonymous'; }
export function preferenceKey(kind, key) { return `erp-navigation-v1:${userScope}:${kind}:${key}`; }
export function readPreference(kind, key) {
  try { return JSON.parse(sessionStorage.getItem(preferenceKey(kind, key)) || 'null'); } catch { return null; }
}
export function writePreference(kind, key, value) {
  try { sessionStorage.setItem(preferenceKey(kind, key), JSON.stringify(value)); } catch { /* Navigation still works when storage is unavailable. */ }
}

// Enhance only tabs the current view actually rendered: hidden/unauthorized
// controls are never constructed from a remembered state or a URL.
export function enhanceViewNavigation(view, route) {
  const wired = new WeakSet();
  const fields = new WeakSet();
  const requested = new URLSearchParams(location.hash.split('?')[1] || '').getAll('tab');
  const remembered = readPreference('tabs', route) || [];
  const targets = requested.length ? requested : remembered;
  let restoring = true;
  let stopped = false;
  function bars() { return [...view.querySelectorAll('.tab-bar')]; }
  function labels() { return bars().map(bar => bar.querySelector('.tab-btn.active')?.dataset.tabLabel).filter(Boolean); }
  function syncURL(push = false) {
    const current = labels();
    writePreference('tabs', route, current);
    const params = new URLSearchParams();
    current.forEach(label => params.append('tab', label));
    const next = `#/${route}${current.length ? '?' + params : ''}`;
    if (location.hash !== next) history[push ? 'pushState' : 'replaceState'](null, '', next);
  }
  function selected(bar) {
    const buttons = [...bar.querySelectorAll(':scope > .tab-btn')];
    buttons.forEach(button => {
      const active = button.classList.contains('active');
      button.setAttribute('aria-selected', String(active));
      button.tabIndex = active ? 0 : -1;
      const panel = document.getElementById(button.getAttribute('aria-controls'));
      if (active && panel) panel.setAttribute('aria-labelledby', button.id);
    });
  }
  function wire() {
    if (stopped) return;
    bars().forEach((bar, level) => {
      if (!view.contains(bar)) return;
      if (wired.has(bar)) { selected(bar); return; }
      wired.add(bar);
      bar.setAttribute('role', 'tablist');
      bar.setAttribute('aria-label', level ? 'Section views' : 'Module sections');
      if (level) bar.classList.add('tab-bar-secondary');
      const buttons = [...bar.querySelectorAll(':scope > .tab-btn')];
      const panel = document.createElement('div');
      panel.id = `tab-panel-${route}-${level}`;
      panel.setAttribute('role','tabpanel');
      while (bar.nextSibling) panel.appendChild(bar.nextSibling);
      bar.after(panel);
      buttons.forEach((button, i) => {
        button.dataset.tabLabel ||= button.getAttribute('data-tab-label') || button.textContent.trim();
        button.id ||= `tab-${route}-${level}-${i}`;
        button.setAttribute('role', 'tab');
        if (panel) button.setAttribute('aria-controls',panel.id);
      });
      bar.addEventListener('click', event => {
        if (!event.target.closest('.tab-btn')) return;
        queueMicrotask(() => { wire(); selected(bar); if (!restoring) syncURL(true); });
      });
      bar.addEventListener('keydown', event => {
        const index = buttons.indexOf(document.activeElement);
        if (index < 0 || !['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
        event.preventDefault();
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length-1 : (index+(event.key==='ArrowRight'?1:-1)+buttons.length)%buttons.length;
        buttons[next].focus(); buttons[next].click();
      });
      const target = buttons.find(button => button.dataset.tabLabel === targets[level]);
      if (target && !target.classList.contains('active')) target.click();
      selected(bar);
    });
    // Store filters only, never editable record forms, passwords or modal data.
    view.querySelectorAll('.filter-bar input, .filter-bar select, .search-bar input, .search-bar select, .filter-field input, .filter-field select').forEach((field,index) => {
      if (fields.has(field) || field.closest('form, .modal-dialog') || !['search','text','date','month','select-one'].includes(field.type)) return;
      fields.add(field);
      const key = `${route}:${labels().join('/')} :${field.name || field.id || index}`;
      const saved = readPreference('filter',key);
      if (typeof saved === 'string' && field.value !== saved) {
        field.value = saved;
        if (field.value === saved) { field.dispatchEvent(new Event('input',{bubbles:true})); field.dispatchEvent(new Event('change',{bubbles:true})); }
      }
      const save=()=>writePreference('filter',key,field.value);
      field.addEventListener('input',save); field.addEventListener('change',save);
    });
  }
  const observer = new MutationObserver(() => { wire(); });
  wire();
  restoring = false;
  syncURL();
  observer.observe(view,{childList:true,subtree:true});
  return () => { stopped = true; observer.disconnect(); };
}
