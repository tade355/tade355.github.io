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
    Paid: 'pill-good', Received: 'pill-good', Completed: 'pill-good', Active: 'pill-good', Company: 'pill-good',
    Unpaid: 'pill-critical', Halted: 'pill-critical', Disengaged: 'pill-critical', Down: 'pill-critical',
    Pending: 'pill-warning', Ongoing: 'pill-warning', 'On Leave': 'pill-warning', Suspended: 'pill-warning',
    'Under Maintenance': 'pill-warning', Scheduled: 'pill-warning', 'In Progress': 'pill-warning', '3rd Party': 'pill-warning',
  };
  return map[status] || 'pill-neutral';
}

export function uid() {
  return Math.random().toString(36).slice(2, 9);
}

export function dateInRange(iso, from, to) {
  if (!iso) return false;
  if (from && iso < from) return false;
  if (to && iso > to) return false;
  return true;
}
