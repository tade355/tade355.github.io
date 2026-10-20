// Pure helpers behind store.js (kept apart so they can be unit tested without the
// Supabase client).

// Supabase returns at most 1,000 rows per request, so a table is read in pages
// until a short page comes back. Without this a collection would silently stop
// at its first 1,000 rows (reports, diesel and expenses all grow every day).
export const PAGE_SIZE = 1000;
export async function fetchAllPages(fetchPage, pageSize = PAGE_SIZE) {
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    const page = await fetchPage(from, from + pageSize - 1);
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}

// A save is refused when the row changed in the database after this browser
// loaded it (compared by updated_at); a row never stamped, or a table without
// updated_at, is never treated as stale.
export function isStale(loadedStamp, currentStamp) {
  return !!loadedStamp && !!currentStamp && new Date(loadedStamp).getTime() !== new Date(currentStamp).getTime();
}
