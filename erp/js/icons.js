// Minimal line-icon set for the sidebar nav (replaces emoji). All icons
// share one visual language — 24x24 viewBox, 1.6 stroke, round joins/caps,
// no fill — so they read as a single system rather than mismatched emoji,
// and stroke="currentColor" means they automatically pick up the nav
// link's own text color (including hover/active states) for free.
const WRAP_OPEN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">';
const WRAP_CLOSE = '</svg>';

function icon(inner) {
  return WRAP_OPEN + inner + WRAP_CLOSE;
}

export const ICONS = {
  dashboard: icon('<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>'),
  documents: icon('<path d="M6 2h9l5 5v15H6z"/><path d="M15 2v5h5"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="15" y2="16"/>'),
  folder: icon('<path d="M3 6.5a1.5 1.5 0 0 1 1.5-1.5h5l2 2h8a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5v-11Z"/>'),
  checkCircle: icon('<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.5 2.5 5.5-6"/>'),
  activity: icon('<path d="M3 12h4l2 8 4-16 2 8h6"/>'),
  wrench: icon('<path d="M14.5 6.5a4 4 0 0 0-5.4 5.1L3 17.7V21h3.3l6-6.1a4 4 0 0 0 5.1-5.4l-2.7 2.7-2-2 2.8-2.7Z"/>'),
  receipt: icon('<path d="M6 2h12v20l-2-1.3-2 1.3-2-1.3-2 1.3-2-1.3-2 1.3Z"/><line x1="8.5" y1="7" x2="15.5" y2="7"/><line x1="8.5" y1="11" x2="15.5" y2="11"/>'),
  bag: icon('<path d="M5 8h14l-1.2 12H6.2Z"/><path d="M9 8a3 3 0 0 1 6 0"/>'),
  users: icon('<circle cx="9" cy="8" r="3.2"/><path d="M3 19a6 6 0 0 1 12 0"/><circle cx="17" cy="8.5" r="2.4"/><path d="M15.5 19a5 5 0 0 1 5.5-5"/>'),
  calculator: icon('<rect x="6" y="2.5" width="12" height="19" rx="2"/><line x1="8.5" y1="6.5" x2="15.5" y2="6.5"/><line x1="8.5" y1="11" x2="8.5" y2="11"/><line x1="12" y1="11" x2="12" y2="11"/><line x1="15.5" y1="11" x2="15.5" y2="11"/><line x1="8.5" y1="15" x2="8.5" y2="15"/><line x1="12" y1="15" x2="12" y2="15"/><line x1="15.5" y1="15" x2="15.5" y2="15"/><line x1="8.5" y1="19" x2="8.5" y2="19"/><line x1="12" y1="19" x2="12" y2="19"/><line x1="15.5" y1="19" x2="15.5" y2="19"/>'),
  banknote: icon('<rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="3"/><line x1="6" y1="9" x2="6" y2="9"/><line x1="18" y1="15" x2="18" y2="15"/>'),
  barChart: icon('<line x1="4" y1="21" x2="4" y2="10"/><line x1="12" y1="21" x2="12" y2="4"/><line x1="20" y1="21" x2="20" y2="14"/><line x1="2" y1="21" x2="22" y2="21"/>'),
  clock: icon('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>'),
  wallet: icon('<path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h13A1.5 1.5 0 0 1 19 7.5V9h1.5A1.5 1.5 0 0 1 22 10.5v7A1.5 1.5 0 0 1 20.5 19h-16A1.5 1.5 0 0 1 3 17.5v-10Z"/><circle cx="17.5" cy="14" r="1.2" fill="currentColor" stroke="none"/>'),
  nairaPaper: icon('<path d="M6 2h9l5 5v15H6z"/><path d="M15 2v5h5"/><text x="13" y="18" font-size="9.5" font-weight="700" text-anchor="middle" fill="currentColor" stroke="none" font-family="Inter, system-ui, sans-serif">₦</text>'),
  database: icon('<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>'),
  fuelCan: icon('<rect x="9" y="3" width="6" height="4" rx="1"/><rect x="4" y="7" width="16" height="14" rx="2"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/>'),
  chat: icon('<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/><line x1="9" y1="10" x2="15" y2="10"/><line x1="9" y1="14" x2="13" y2="14"/>'),
  search: icon('<circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.5" y2="16.5"/>'),
  trash: icon('<path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 13h10l1-13"/><path d="M10 11v6"/><path d="M14 11v6"/>'),
  edit: icon('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>'),
  paperclip: icon('<path d="M20 11l-8 8a5 5 0 0 1-7-7l8.5-8.5a3.5 3.5 0 0 1 5 5L10 17a2 2 0 0 1-3-3l7-7"/>'),
  file: icon('<path d="M6 2h9l5 5v15H6z"/><path d="M15 2v5h5"/>'),
  pin: icon('<path d="M12 17v5"/><path d="M8 3h8l-1 6 3 4H6l3-4z"/>'),
  eye: icon('<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
  alert: icon('<path d="M12 3 2 20h20z"/><line x1="12" y1="10" x2="12" y2="14"/><line x1="12" y1="17" x2="12" y2="17.1"/>'),
  refresh: icon('<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>'),
  gauge: icon('<path d="M4 18a8 8 0 1 1 16 0"/><path d="M12 18l4-6"/>'),
  trendUp: icon('<polyline points="3 17 9 11 13 15 21 7"/><polyline points="15 7 21 7 21 13"/>'),
  percent: icon('<line x1="19" y1="5" x2="5" y2="19"/><circle cx="7" cy="7" r="2"/><circle cx="17" cy="17" r="2"/>'),
  leaf: icon('<path d="M5 19c0-8 5-14 15-14 0 10-6 15-14 15"/><path d="M5 19c3-5 6-8 10-10"/>'),
  clipboard: icon('<rect x="6" y="4" width="12" height="17" rx="2"/><rect x="9" y="2" width="6" height="4" rx="1"/><line x1="9" y1="11" x2="15" y2="11"/><line x1="9" y1="15" x2="15" y2="15"/>'),
  bank: icon('<path d="M3 10l9-6 9 6"/><line x1="5" y1="10" x2="5" y2="18"/><line x1="10" y1="10" x2="10" y2="18"/><line x1="14" y1="10" x2="14" y2="18"/><line x1="19" y1="10" x2="19" y2="18"/><line x1="3" y1="21" x2="21" y2="21"/>'),
  play: icon('<path d="M8 5l11 7-11 7z"/>'),
  stop: icon('<rect x="6" y="6" width="12" height="12" rx="1.5"/>'),
  sun: icon('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5"/>'),
  moon: icon('<path d="M20 14A8 8 0 1 1 10 4a6.5 6.5 0 0 0 10 10z"/>'),
  monitor: icon('<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 21h8M12 16v5"/>'),
  check: icon('<path d="M5 12.5 10 17.5 19 7"/>'),
  mapPin: icon('<path d="M12 21s7-6 7-11a7 7 0 0 0-14 0c0 5 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>'),
  truck: icon('<rect x="2" y="7" width="12" height="9" rx="1"/><path d="M14 10h4l3 3v3h-7z"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>'),
  upload: icon('<path d="M12 15V4"/><path d="M7.5 8.5 12 4l4.5 4.5"/><path d="M5 19h14"/>'),
  download: icon('<path d="M12 4v11"/><path d="M7.5 10.5 12 15l4.5-4.5"/><path d="M5 19h14"/>'),
  printer: icon('<path d="M7 9V3h10v6"/><rect x="4" y="9" width="16" height="8" rx="2"/><rect x="7" y="14" width="10" height="7" rx="1"/>'),
  chevronLeft: icon('<path d="M14.5 6 8.5 12l6 6"/>'),
  chevronRight: icon('<path d="M9.5 6l6 6-6 6"/>'),
  calendar: icon('<rect x="3" y="4.5" width="18" height="16" rx="2"/><line x1="3" y1="9.5" x2="21" y2="9.5"/><line x1="8" y1="2.5" x2="8" y2="6.5"/><line x1="16" y1="2.5" x2="16" y2="6.5"/><line x1="7" y1="13.5" x2="7" y2="13.5"/><line x1="12" y1="13.5" x2="12" y2="13.5"/><line x1="17" y1="13.5" x2="17" y2="13.5"/><line x1="7" y1="17.5" x2="7" y2="17.5"/><line x1="12" y1="17.5" x2="12" y2="17.5"/>'),
};
