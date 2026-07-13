import { store } from './store.js';
import { setCurrentUserId } from './session.js';
import { el } from './utils.js';

export function showUserGate(onDone) {
  const overlay = document.getElementById('userGate');
  overlay.innerHTML = '';
  overlay.classList.add('open');

  const employees = store.get('employees')
    .filter((e) => e.status !== 'Disengaged')
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));

  const select = el('select', { name: 'gateUser' }, [
    el('option', { value: '' }, '— Select your name —'),
    ...employees.map((e) => el('option', { value: e.id }, `${e.name} — ${e.role}${e.status === 'Suspended' ? ' (Suspended)' : ''}`)),
  ]);

  const continueBtn = el('button', { type: 'button', class: 'btn btn-primary btn-block' }, 'Continue');
  continueBtn.addEventListener('click', () => {
    if (!select.value) { window.alert('Select your name to continue.'); return; }
    setCurrentUserId(select.value);
    overlay.classList.remove('open');
    onDone();
  });

  const card = el('div', { class: 'gate-card' }, [
    el('img', { src: 'assets/logo.png', alt: 'Emagrims Ltd', class: 'gate-logo' }),
    el('h2', {}, "Who's using this device?"),
    el('p', { class: 'gate-note' }, "This just organizes your menu so you see what's relevant to your role — it is not a secure login, and it doesn't protect data from anyone with access to this browser. Anyone can switch users below at any time."),
    el('label', { class: 'field' }, [el('span', { class: 'field-label' }, 'Your Name'), select]),
    continueBtn,
  ]);
  overlay.appendChild(card);

  const firstFocusable = card.querySelector('select');
  if (firstFocusable) firstFocusable.focus();
}
