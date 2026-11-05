// Stored times stay in HH:MM for calculations; display and entry use AM/PM.
export function formatClock(value) {
  const match = String(value || '').match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match) return value || '—';
  const h = Number(match[1]); const m = Number(match[2]);
  if (h > 23 || m > 59) return value;
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

export function clockToStorage(hour, minute, period) {
  const h = Number(hour); const m = Number(minute);
  if (!hour || !Number.isInteger(h) || h < 1 || h > 12 || !Number.isInteger(m) || m < 0 || m > 59 || !['AM', 'PM'].includes(period)) return '';
  return `${String(h % 12 + (period === 'PM' ? 12 : 0)).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return `${date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}, ${date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`;
}
