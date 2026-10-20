// Diesel used against work done, per dozer: litres per hour and litres per hectare,
// compared with what the rules expect (8 hrs x 25 L for 1.3 ha is about 154 L per
// hectare). A dozer burning well above that for the hours it worked is a question
// for the site manager (wrong closing, diesel moved elsewhere, idling, leak).
//
// Pure: pass the operations rows (already limited to the project and period).
import { LITRES_PER_HOUR, TARGET_HOURS, EXPECTED_HA_PER_8HRS } from './rules.js';

export const NORM_LITRES_PER_HA = (TARGET_HOURS * LITRES_PER_HOUR) / EXPECTED_HA_PER_8HRS;
export const HIGH_BURN_RATIO = 1.25; // flagged above this share of the norm
export const MIN_HA_FOR_RATIO = 1; // too little work in the period says nothing about efficiency

const sum = (rows, key) => rows.reduce((s, r) => s + (Number(r[key]) || 0), 0);

export function fuelEfficiency(ops) {
  const byDozer = {};
  ops.forEach((o) => { if (o.equipment) (byDozer[o.equipment] = byDozer[o.equipment] || []).push(o); });
  return Object.entries(byDozer).map(([equipment, rows]) => {
    const hours = sum(rows, 'hoursWorked');
    const ha = sum(rows, 'quantity');
    const litres = sum(rows, 'fuelUsed');
    const lPerHa = ha >= MIN_HA_FOR_RATIO ? litres / ha : null;
    return {
      equipment, hours, ha, litres,
      litresPerHour: hours > 0 ? litres / hours : null,
      litresPerHa: lPerHa,
      vsNorm: lPerHa === null ? null : (lPerHa / NORM_LITRES_PER_HA) * 100,
      high: lPerHa !== null && lPerHa > NORM_LITRES_PER_HA * HIGH_BURN_RATIO,
    };
  }).filter((r) => r.hours > 0 || r.litres > 0).sort((a, b) => (b.vsNorm ?? -1) - (a.vsNorm ?? -1));
}
