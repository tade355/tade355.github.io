import { store } from '../store.js';
import { el, formatDate } from '../utils.js';
import { sectionHeader, statCard } from '../ui.js';

function daysSince(iso) {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

export function renderBackup(container) {
  container.innerHTML = '';
  container.appendChild(sectionHeader('Backup & Data', "Everything here lives only in this browser's local storage — back up regularly so nothing is lost."));

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
    el('strong', {}, '⚠ Backups are not automatic.'),
    el('p', {}, "Invoices, payroll, fund requests, operations logs — everything — lives only in this browser. It is not synced to any server. Clearing your browser data, switching devices, or reinstalling the browser erases it permanently. Download a backup regularly and keep it somewhere safe (email it to yourself, save it to cloud storage)."),
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
    el('p', {}, 'Replaces everything currently in this browser with the contents of a backup file. This cannot be undone.'),
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
    if (!window.confirm('This will replace ALL current data in this browser with the contents of this file. This cannot be undone. Continue?')) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        store.importSnapshot(e.target.result);
        window.alert('Backup restored. The page will now reload.');
        window.location.reload();
      } catch (err) {
        window.alert(err.message);
      }
    };
    reader.onerror = () => window.alert('Could not read that file.');
    reader.readAsText(file);
  });

  refreshSummary();
}
