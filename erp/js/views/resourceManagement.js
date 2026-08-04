import { el } from '../utils.js';
import { sectionHeader } from '../ui.js';
import { renderDieselManagement } from './dieselManagement.js';
import { renderDozerParts } from './dozerParts.js';
import { renderDozerRentPayments } from './dozerRentPayments.js';
import { renderConsumables } from './consumables.js';

export function renderResourceManagement(container) {
  container.innerHTML = '';

  let tab = 'diesel';

  const tabBar = el('div', { class: 'tab-bar' });
  const dieselTabBtn = el('button', { class: 'tab-btn', type: 'button', onClick: () => setTab('diesel') }, 'Diesel Management');
  const partsTabBtn = el('button', { class: 'tab-btn', type: 'button', onClick: () => setTab('parts') }, 'Bulldozer Parts & Supplies');
  const rentTabBtn = el('button', { class: 'tab-btn', type: 'button', onClick: () => setTab('rent') }, 'Dozer Rent Payments');
  const consumablesTabBtn = el('button', { class: 'tab-btn', type: 'button', onClick: () => setTab('consumables') }, 'Lubricants & Consumables');
  tabBar.appendChild(dieselTabBtn);
  tabBar.appendChild(partsTabBtn);
  tabBar.appendChild(rentTabBtn);
  tabBar.appendChild(consumablesTabBtn);

  container.appendChild(sectionHeader('Resource Management', 'Diesel accountability from station to dozer, dozer parts, rent payments, and lubricants & consumables'));
  container.appendChild(tabBar);

  const body = el('div');
  container.appendChild(body);

  function setTab(next) {
    tab = next;
    dieselTabBtn.classList.toggle('active', tab === 'diesel');
    partsTabBtn.classList.toggle('active', tab === 'parts');
    rentTabBtn.classList.toggle('active', tab === 'rent');
    consumablesTabBtn.classList.toggle('active', tab === 'consumables');
    body.innerHTML = '';
    if (tab === 'diesel') renderDieselManagement(body);
    else if (tab === 'parts') renderDozerParts(body);
    else if (tab === 'rent') renderDozerRentPayments(body);
    else renderConsumables(body);
  }

  setTab('diesel');
}
