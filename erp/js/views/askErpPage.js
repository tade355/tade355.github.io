// "Ask the ERP" as a page of its own (the same assistant is also a panel on the
// Daily Operations Dashboard). See askErp.js — rule-based, answers only from
// the data already loaded in the ERP.
import { el } from '../utils.js';
import { sectionHeader } from '../ui.js';
import { projectNames } from './profitability.js';
import { askCard } from './ddTools.js';

export function renderAskErp(container) {
  container.innerHTML = '';
  const projects = projectNames();
  const site = el('select', {}, projects.map((p) => el('option', { value: p }, p)));
  site.value = projects.find((p) => /kangidi/i.test(p)) || projects[0] || '';

  container.appendChild(sectionHeader('Ask the ERP', 'Ask a question in plain English and get an answer worked out from the data already in the ERP'));
  container.appendChild(el('div', { class: 'filter-bar' }, [el('label', { class: 'filter-field' }, [el('span', {}, 'Site'), site])]));
  const card = askCard(() => site.value);
  card.open = true;
  container.appendChild(card);
  const input = card.querySelector('.dd-ask-input');
  if (input) setTimeout(() => input.focus(), 0);
}
