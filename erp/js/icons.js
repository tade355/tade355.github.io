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
};
