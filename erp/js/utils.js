export function formatCurrency(value) {
  const n = Number(value) || 0;
  return '₦' + n.toLocaleString('en-NG', { maximumFractionDigits: 0 });
}

export function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function monthKey(iso) {
  return iso.slice(0, 7);
}

export function monthLabel(key) {
  const [y, m] = key.split('-');
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleDateString('en-GB', { month: 'short' });
}

export function formatMonthLong(key) {
  if (!key) return '—';
  const [y, m] = key.split('-');
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

export function invoiceTotal(invoice) {
  return invoice.items.reduce((sum, it) => sum + it.qty * it.price, 0);
}

export function poTotal(po) {
  return po.items.reduce((sum, it) => sum + it.qty * it.price, 0);
}

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([key, value]) => {
    if (key === 'class') node.className = value;
    else if (key === 'html') node.innerHTML = value;
    else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (value !== undefined && value !== null) {
      node.setAttribute(key, value);
    }
  });
  (Array.isArray(children) ? children : [children]).forEach((child) => {
    if (child === null || child === undefined) return;
    node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
  });
  return node;
}

export function statusPillClass(status) {
  const map = {
    Paid: 'pill-good', Received: 'pill-good', Completed: 'pill-good', Active: 'pill-good', Company: 'pill-good', Approved: 'pill-good', Fulfilled: 'pill-good', Income: 'pill-good',
    Unpaid: 'pill-critical', Halted: 'pill-critical', Disengaged: 'pill-critical', Down: 'pill-critical', Rejected: 'pill-critical', Expenditure: 'pill-critical',
    Pending: 'pill-warning', Ongoing: 'pill-warning', 'On Leave': 'pill-warning', Suspended: 'pill-warning',
    'Under Maintenance': 'pill-warning', Scheduled: 'pill-warning', 'In Progress': 'pill-warning', Partnership: 'pill-warning', Rented: 'pill-warning', 'Pending Approval': 'pill-warning', Business: 'pill-warning',
    Office: 'pill-good',
    'Fully Settled': 'pill-good', 'Partially Settled': 'pill-warning', Outstanding: 'pill-critical',
    Commendation: 'pill-good', Query: 'pill-warning', Deployed: 'pill-good', Returned: 'pill-neutral', Damaged: 'pill-warning', Lost: 'pill-critical',
    OK: 'pill-good', Variance: 'pill-critical', 'Minor Variance': 'pill-warning',
    'Partially Paid': 'pill-warning', 'No Invoice Yet': 'pill-neutral',
    Repaid: 'pill-good', 'Partially Repaid': 'pill-warning', Restructured: 'pill-warning', Defaulted: 'pill-critical', 'Written Off': 'pill-neutral',
  };
  return map[status] || 'pill-neutral';
}

export function uid() {
  return Math.random().toString(36).slice(2, 9);
}

// Animated count-up for a KPI value, ease-out cubic from `from` to `to`.
// Respects prefers-reduced-motion by jumping straight to the final value.
export function animateNumber(element, to, { from = 0, duration = 700, formatFn = (n) => Math.round(n).toLocaleString() } = {}) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    element.textContent = formatFn(to);
    return;
  }
  const start = performance.now();
  function tick(now) {
    const progress = Math.min(1, (now - start) / duration);
    const eased = 1 - (1 - progress) ** 3;
    element.textContent = formatFn(from + (to - from) * eased);
    if (progress < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

export function dateInRange(iso, from, to) {
  if (!iso) return false;
  if (from && iso < from) return false;
  if (to && iso > to) return false;
  return true;
}
