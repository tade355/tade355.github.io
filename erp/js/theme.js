const STORAGE_KEY = 'emagrims_theme';

function currentChoice() {
  const saved = localStorage.getItem(STORAGE_KEY);
  return saved === 'light' || saved === 'dark' ? saved : 'system';
}

function applyChoice(choice) {
  if (choice === 'system') {
    localStorage.removeItem(STORAGE_KEY);
    document.documentElement.removeAttribute('data-theme');
  } else {
    localStorage.setItem(STORAGE_KEY, choice);
    document.documentElement.setAttribute('data-theme', choice);
  }
}

export function initThemeSwitch() {
  const container = document.getElementById('themeSwitch');
  const buttons = [...container.querySelectorAll('[data-theme-choice]')];

  function refreshActiveButton() {
    const choice = currentChoice();
    buttons.forEach((btn) => btn.classList.toggle('active', btn.dataset.themeChoice === choice));
  }

  buttons.forEach((btn) => {
    btn.addEventListener('click', () => {
      applyChoice(btn.dataset.themeChoice);
      refreshActiveButton();
    });
  });

  refreshActiveButton();
}
