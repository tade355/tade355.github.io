// AGO planner: how much diesel (AGO) the site must be supplied so that every
// active dozer starts its next working day with the target opening diesel —
// plus the supply message sent to the filling station and the fueling vouchers
// that go with it.
//
// Pure (no store / DOM imports); `ctx` comes from reportContext.js.
import { buildDailyDashboard } from './dailyDashboardData.js';
import { DASHBOARD_BASIS_FROM } from './dashboardBasis.js';
import { addDays } from './dateUtils.js';

export const DEFAULTS = { targetHours: 8, litresPerHour: 25, afterHoursRate: 20, reserve: 50, kegLitres: 30 };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dmy = (iso) => { const [y, m, d] = iso.split('-').map(Number); return `${d} ${MONTHS[m - 1]} ${y}`; };
const fmt = (n, dp = 0) => Number(n).toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
const sum = (arr, fn) => arr.reduce((s, x) => s + (fn(x) || 0), 0);
const round1 = (n) => Math.round(n * 10) / 10;
const n1 = (n) => Number(n).toLocaleString('en-US', { maximumFractionDigits: 1 });

// Opening diesel that covers the target hours plus the reserve left in the tank:
// 8 hrs x 25 L + 50 L reserve = 250 L.
export function targetOpeningFor({ targetHours = DEFAULTS.targetHours, litresPerHour = DEFAULTS.litresPerHour, afterHoursRate = DEFAULTS.afterHoursRate, reserve = DEFAULTS.reserve } = {}) {
  const first = Math.min(targetHours, 8);
  const rest = Math.max(0, targetHours - 8);
  return round1(first * litresPerHour + rest * afterHoursRate + reserve);
}

// Everything the planner needs for one site, as at the end of `closingDate`.
export function planDefaults(ctx, project, closingDate, since = DASHBOARD_BASIS_FROM) {
  const dash = buildDailyDashboard({ ...ctx, project, date: closingDate, since: since > closingDate ? closingDate : since });
  const rowBy = new Map(dash.diesel.rows.map((r) => [r.equipment, r]));
  const activeDefault = new Set(dash.diesel.fuelingRequest.map((r) => r.equipment));
  const siteOps = ctx.operations.filter((o) => o.siteName === project);
  const names = [...new Set([
    ...ctx.inventory.filter((i) => i.category === 'Heavy Equipment' && i.currentProject === project).map((i) => i.name),
    ...siteOps.map((o) => o.equipment).filter(Boolean),
    ...dash.diesel.fuelingRequest.map((r) => r.equipment),
  ])].filter((n) => ctx.inventory.some((i) => i.name === n && i.category === 'Heavy Equipment')).sort();
  const operatorOf = (name) => {
    const last = siteOps.filter((o) => o.equipment === name && o.operatorId).sort((a, b) => (a.date < b.date ? 1 : -1))[0];
    return last ? ctx.employees.find((e) => e.id === last.operatorId)?.name || null : null;
  };
  const dozers = names.map((name) => {
    const r = rowBy.get(name);
    return {
      name, operator: operatorOf(name),
      distributed: r ? r.distributed : 0,
      closing: r ? Math.max(0, round1(r.closing)) : 0,
      active: activeDefault.has(name),
    };
  });
  const supervisorId = siteOps.filter((o) => o.supervisorId && o.date <= closingDate).sort((a, b) => (a.date < b.date ? 1 : -1))[0]?.supervisorId;
  const pmsLast = [...(ctx.fuelCreditCollections || [])].filter((c) => c.fuelType === 'PMS').sort((a, b) => (a.date < b.date ? 1 : -1))[0];
  return {
    dozers,
    onGround: dash.diesel.onGround === null ? 0 : dash.diesel.onGround,
    onGroundNote: dash.diesel.onGroundDate ? `Stock count of ${dmy(dash.diesel.onGroundDate)}${dash.diesel.onGroundIn || dash.diesel.onGroundOut ? ` + ${fmt(dash.diesel.onGroundIn)} L collected − ${fmt(dash.diesel.onGroundOut)} L distributed since` : ''}` : 'No stock count logged',
    recipient: supervisorId ? ctx.employees.find((e) => e.id === supervisorId)?.name || '' : '',
    dieselPrice: ctx.dieselRateAsOf ? ctx.dieselRateAsOf(addDays(closingDate, 1)) : 1900,
    pmsPrice: pmsLast ? pmsLast.unitPrice : 1385,
  };
}

// dozers: [{ name, operator, distributed, closing, active }]
export function buildPlan({ dozers, target, onGround = 0, kegLitres = DEFAULTS.kegLitres, dieselPrice = 0, pmsLitres = 0, pmsPrice = 0 }) {
  const rows = dozers.map((d) => ({ ...d, need: d.active ? Math.max(0, round1(target - (d.closing || 0))) : null }));
  const totalNeed = round1(sum(rows.filter((r) => r.active), (r) => r.need));
  const additional = Math.max(0, round1(totalNeed - (onGround || 0)));
  const agoCost = additional * dieselPrice;
  const pmsCost = (pmsLitres || 0) * pmsPrice;
  return {
    rows, target, activeCount: rows.filter((r) => r.active).length,
    totalDistributed: sum(rows, (r) => r.distributed), totalClosing: sum(rows, (r) => r.closing),
    totalNeed, onGround: onGround || 0, additional, kegs: kegLitres > 0 ? additional / kegLitres : 0, kegLitres,
    dieselPrice, agoCost, pmsLitres: pmsLitres || 0, pmsPrice, pmsCost, grandCost: agoCost + pmsCost,
  };
}

const when = (date, today) => {
  if (!today) return dmy(date);
  if (date === today) return `today - ${dmy(date)}`;
  if (date === addDays(today, 1)) return `tomorrow - ${dmy(date)}`;
  return `on ${dmy(date)}`;
};

// The kind of message sent in the Midejab group: "*No 1.* Please supply
// Christopher with 1,690 liters Diesel today - 16 Oct 2026. Thank you."
export function supplyMessage({ recipient, diesel, pms = 0, date, today, number = 1 }) {
  const items = [diesel > 0 ? `${fmt(diesel, diesel % 1 ? 1 : 0)} liters Diesel` : null, pms > 0 ? `${fmt(pms, pms % 1 ? 1 : 0)} liters PMS` : null].filter(Boolean);
  if (!items.length) return '';
  return `*No ${number}.*\n\nPlease supply ${recipient || 'the site'} with ${items.join(' and ')} ${when(date, today)}.\n\nThank you.`;
}

// Fueling vouchers for the supply: one for diesel (AGO) and one for PMS, each
// for the whole site (the per-dozer split goes in the notes).
export function voucherDrafts({ plan, station, date, project, requestedBy, message, today }) {
  const breakdown = plan.rows.filter((r) => r.active && r.need > 0).map((r) => `${r.name}${r.operator ? ` (${r.operator})` : ''} ${n1(r.need)} L`).join('; ');
  const base = { date, station, project: project || null, requestedBy, status: 'Pending Approval', attachments: [] };
  const out = [];
  if (plan.additional > 0) {
    out.push({ ...base, equipment: 'Site supply (AGO)', litresRequested: plan.additional, estimatedCost: Math.round(plan.agoCost), notes: `AGO planner, supply ${when(date, today)}. Target opening ${n1(plan.target)} L for ${plan.activeCount} dozer(s): ${breakdown}. Less ${n1(plan.onGround)} L on ground.${message ? `\n\n${message}` : ''}` });
  }
  if (plan.pmsLitres > 0) {
    out.push({ ...base, equipment: 'Site supply (PMS)', litresRequested: plan.pmsLitres, estimatedCost: Math.round(plan.pmsCost), notes: `PMS for site vehicles and bikes, supply ${when(date, today)}.${message ? `\n\n${message}` : ''}` });
  }
  return out;
}
