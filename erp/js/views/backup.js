import { store } from '../store.js';
import { el, formatDate } from '../utils.js';
import { sectionHeader, statCard } from '../ui.js';

function daysSince(iso) {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

export function renderBackup(container) {
  container.innerHTML = '';
  container.appendChild(sectionHeader('Backup & Data', 'Everything here lives in the shared Emagrims database — export a backup regularly as a safety copy.'));

  const summarySlot = el('div');
  container.appendChild(summarySlot);

  function refreshSummary() {
    const lastBackup = store.getLastBackupAt();
    const days = daysSince(lastBackup);
    summarySlot.innerHTML = '';
    summarySlot.appendChild(el('div', { class: 'stats-grid' }, [
      statCard({
        label: 'Last Backup',
        value: lastBackup ? formatDate(lastBackup.slice(0, 10)) : 'Never',
        hint: lastBackup ? `${days} day(s) ago` : 'Download one now to protect your data',
        tone: (!lastBackup || days > 7) ? 'critical' : (days > 2 ? 'warning' : 'good'),
      }),
    ]));
  }

  container.appendChild(el('div', { class: 'backup-warning' }, [
    el('strong', {}, '⚠ Data now lives in a shared database, not just this browser.'),
    el('p', {}, 'Everyone with access sees and edits the same records in real time. Restoring a backup here replaces data for the whole company, not just this device — export regularly as a safety copy, and only restore one if you know exactly what you\'re doing.'),
  ]));

  const exportCard = el('div', { class: 'backup-card' }, [
    el('h3', {}, 'Export a Backup'),
    el('p', {}, 'Downloads every record in the system as a single JSON file.'),
  ]);
  const exportBtn = el('button', { class: 'btn btn-primary', type: 'button' }, '⬇ Download Backup');
  exportCard.appendChild(exportBtn);
  container.appendChild(exportCard);

  const importCard = el('div', { class: 'backup-card' }, [
    el('h3', {}, 'Restore from a Backup'),
    el('p', {}, 'Replaces every record in the shared database — for everyone, on every device — with the contents of a backup file. This cannot be undone.'),
  ]);
  const fileInput = el('input', { type: 'file', accept: 'application/json' });
  const importBtn = el('button', { class: 'btn btn-ghost', type: 'button' }, 'Restore This File');
  importCard.appendChild(fileInput);
  importCard.appendChild(importBtn);
  container.appendChild(importCard);

  exportBtn.addEventListener('click', () => {
    const json = store.exportSnapshot();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `emagrims-erp-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    refreshSummary();
  });

  importBtn.addEventListener('click', () => {
    const file = fileInput.files[0];
    if (!file) { window.alert('Choose a backup file first.'); return; }
    if (!window.confirm('This will replace EVERY record in the shared database — for the whole company, on every device — with the contents of this file. This cannot be undone. Continue?')) return;
    if (!window.confirm('Are you absolutely sure? Type OK in the next box only if you want to proceed.')) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      importBtn.disabled = true;
      importBtn.textContent = 'Restoring…';
      try {
        await store.importSnapshot(e.target.result);
        window.alert('Backup restored. The page will now reload.');
        window.location.reload();
      } catch (err) {
        window.alert(err.message);
        importBtn.disabled = false;
        importBtn.textContent = 'Restore This File';
      }
    };
    reader.onerror = () => window.alert('Could not read that file.');
    reader.readAsText(file);
  });

  refreshSummary();
}
