// Application exports are data copies, not database/Auth/Storage backups.
export function validateSnapshot(parsed, collections) {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Invalid backup object.');
  if (parsed._backup && parsed._backup.version !== 1) throw new Error('Unsupported backup version.');
  const missing = collections.filter((key) => !Array.isArray(parsed[key]));
  if (missing.length) throw new Error(`Incomplete backup: missing collections ${missing.join(', ')}. No data was changed.`);
  for (const key of collections) {
    const ids = new Set();
    for (const row of parsed[key]) {
      if (!row || typeof row.id !== 'string' || !row.id || ids.has(row.id)) throw new Error(`Invalid or duplicate record id in ${key}.`);
      ids.add(row.id);
    }
    if (parsed._backup && parsed._backup.counts?.[key] !== parsed[key].length) throw new Error(`Backup count mismatch in ${key}.`);
  }
  return collections.map((key) => ({ collection: key, records: parsed[key].length }));
}

export function applyRefreshResults(previous, results) {
  const state = { ...previous };
  const health = {};
  for (const { key, data, error } of results) {
    health[key] = { ok: !error, checkedAt: new Date().toISOString(), error: error ? error.message : null };
    // A failed query must not erase the last successfully loaded collection.
    if (!error) state[key] = data;
  }
  return { state, health };
}
