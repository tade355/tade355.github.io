import { store } from '../store.js';
import { el } from '../utils.js';
import { renderTable, actionButtons, sectionHeader, openModal, confirmDelete } from '../ui.js';

function fields() {
  return [
    { name: 'name', label: 'Program Name', required: true },
    { name: 'description', label: 'Description (shown to staff on the program)', type: 'textarea', rows: 2 },
    { name: 'manual', label: 'Manual', type: 'attachments' },
    { name: 'plan', label: 'Training Plan', type: 'attachments' },
    { name: 'syllabus', label: 'Training Syllabus', type: 'attachments' },
  ];
}

function docCount(record) {
  return ['manual', 'plan', 'syllabus'].filter((k) => (record[k] || []).length > 0).length;
}

export function renderTrainingPrograms(container) {
  container.innerHTML = '';
  container.appendChild(sectionHeader(
    'Training Programs',
    'Each program\'s Manual, Plan, and Syllabus, plus its quizzes. Assign a program to a staff member from their record on the Employees tab — that determines what shows on their own Training tab.',
  ));

  const actionSlot = el('div', { style: 'margin-bottom: 1rem;' });
  actionSlot.appendChild(el('button', { class: 'btn btn-primary', type: 'button', onClick: () => openForm() }, '+ Add Training Program'));
  container.appendChild(actionSlot);

  const tableContainer = el('div');
  container.appendChild(tableContainer);

  function refresh() {
    const rows = store.get('trainingPrograms').slice().sort((a, b) => (a.name < b.name ? -1 : 1));
    renderTable(tableContainer, {
      columns: [
        { key: 'name', label: 'Program' },
        { key: 'description', label: 'Description', render: (r) => r.description || '—' },
        { key: 'docs', label: 'Documents', render: (r) => `${docCount(r)} of 3 uploaded` },
        {
          key: 'actions',
          label: '',
          render: (r) => actionButtons({
            onEdit: () => openForm(r),
            onDelete: async () => {
              if (!confirmDelete(r.name)) return;
              try {
                await store.remove('trainingPrograms', r.id);
                refresh();
              } catch (err) {
                window.alert(err.message || 'Could not delete this program.');
              }
            },
          }),
        },
      ],
      rows,
      emptyText: 'No training programs yet. Add one to start assigning it to staff.',
    });
  }

  function openForm(record) {
    openModal({
      title: record ? 'Edit Training Program' : 'Add Training Program',
      fields: fields(),
      initial: record || {},
      submitLabel: record ? 'Save Changes' : 'Add Program',
      onSubmit: async (data) => {
        if (record) await store.update('trainingPrograms', record.id, data);
        else await store.add('trainingPrograms', data);
        refresh();
      },
    });
  }

  refresh();
}
