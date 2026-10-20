// Duplicate check for fund requests. The site manager resends the same request
// from WhatsApp, so before a request is added the ERP looks for an existing one
// with the same description and the same total.
//
// Pure (no store / DOM imports): the callers pass the existing requests in.
//
//   candidate = { id?, date, description, items?: [{ amount }], total? }
//   existing  = the fund request records ({ id, date, description, items, status, ... })
//
// Two strengths of match:
//   'recent'  same description, same total, dates within `days` of each other
//   'earlier' same description and total on a date further away (weaker: the
//             same cost does come round again, e.g. oil for a dozer each week)

const DAY = 86400000;
const toMs = (iso) => {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : null;
};

export const requestTotal = (r) => {
  if (Array.isArray(r?.items) && r.items.length) return r.items.reduce((t, i) => t + (Number(i.amount) || 0), 0);
  return Number(r?.total ?? r?.amount ?? 0) || 0;
};

// Lower case, brackets and punctuation removed, spaces collapsed.
export function normaliseDescription(s) {
  return String(s ?? '').toLowerCase()
    .replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ').trim();
}

const MONTH_WORD = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\b/;
// A request that was paid late has its date moved and the original date added to
// the description, so "oil purchase originally requested 14 oct" is still the
// same request as "oil purchase".
function sameDescription(a, b) {
  const x = normaliseDescription(a); const y = normaliseDescription(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  if (short.length < 8 || !long.startsWith(`${short} `)) return false;
  const rest = long.slice(short.length + 1);
  return /\boriginal(ly)?\b/.test(rest) || /\b\d{1,2} \d{1,2} \d{2,4}\b/.test(rest) || MONTH_WORD.test(rest);
}

// -> 'recent' | 'earlier' | null
export function duplicateKind(candidate, existing, { days = 14 } = {}) {
  if (!candidate || !existing) return null;
  if (candidate.id && existing.id === candidate.id) return null;
  if (!sameDescription(candidate.description, existing.description)) return null;
  if (Math.round(requestTotal(candidate)) !== Math.round(requestTotal(existing))) return null;
  const a = toMs(candidate.date); const b = toMs(existing.date);
  if (a !== null && b !== null && Math.abs(a - b) <= days * DAY) return 'recent';
  return 'earlier';
}

// The existing requests that look like `candidate`, recent matches first (then
// the weaker 'earlier' ones, newest first). An empty array means nothing found.
export function findDuplicateRequests(candidate, existingRequests, { days = 14 } = {}) {
  const hits = [];
  (existingRequests || []).forEach((r) => {
    const kind = duplicateKind(candidate, r, { days });
    if (kind) hits.push({ r, kind });
  });
  const rank = { recent: 0, earlier: 1 };
  hits.sort((x, y) => rank[x.kind] - rank[y.kind] || String(y.r.date || '').localeCompare(String(x.r.date || '')));
  return hits.map((h) => h.r);
}
