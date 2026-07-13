import { login } from './auth.js';
import { el } from './utils.js';

export function showLoginForm(onDone) {
  const overlay = document.getElementById('userGate');
  overlay.innerHTML = '';
  overlay.classList.add('open');

  const usernameInput = el('input', { type: 'text', name: 'username', autocomplete: 'username', required: 'required' });
  const passwordInput = el('input', { type: 'password', name: 'password', autocomplete: 'current-password', required: 'required' });
  const errorNote = el('p', { class: 'gate-error' });

  const form = el('form', { class: 'modal-form' }, [
    el('label', { class: 'field' }, [el('span', { class: 'field-label' }, 'Username'), usernameInput]),
    el('label', { class: 'field' }, [el('span', { class: 'field-label' }, 'Password'), passwordInput]),
    errorNote,
    el('button', { type: 'submit', class: 'btn btn-primary btn-block' }, 'Log In'),
  ]);

  form.addEventListener('submit', async (evt) => {
    evt.preventDefault();
    const submitBtn = form.querySelector('button[type="submit"]');
    errorNote.textContent = '';
    try {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Logging in…';
      await login(usernameInput.value, passwordInput.value);
      overlay.classList.remove('open');
      onDone();
    } catch (err) {
      errorNote.textContent = err.message || 'Could not log in. Please try again.';
      submitBtn.disabled = false;
      submitBtn.textContent = 'Log In';
    }
  });

  const card = el('div', { class: 'gate-card' }, [
    el('img', { src: 'assets/logo.png', alt: 'Emagrims Ltd', class: 'gate-logo' }),
    el('h2', {}, 'Sign in to Emagrims ERP'),
    el('p', { class: 'gate-note' }, "Use the username and password given to you by an admin. If you've forgotten yours, ask an admin to reset it."),
    form,
  ]);
  overlay.appendChild(card);

  usernameInput.focus();
}
