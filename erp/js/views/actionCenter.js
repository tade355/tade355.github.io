import { store } from '../store.js';
import { getCurrentTier, getCurrentUserId } from '../session.js';
import { todayISOString } from '../dateUtils.js';
import { formatDate, el, ico } from '../utils.js';
import { sectionHeader, openModal, openCustomModal, statusPill } from '../ui.js';
import { extractMeetingActions } from '../meetingActionExtractor.js';

const MANAGERS = ['Admin', 'Accounts', 'Supervisor'];

function activeStaff() {
  return store.get('employees')
    .filter((employee) => employee.status === 'Active' && !employee.archivedAt)
    .sort((a, b) => a.name.localeCompare(b.name));
}

function staffName(id) {
  return store.find('employees', id)?.name || 'Former or unavailable staff member';
}

function taskTitle(task) {
  return task.title || 'Untitled action';
}

function openTaskForm(task, onSaved) {
  const manager = MANAGERS.includes(getCurrentTier());
  if (!manager) return;
  const staff = activeStaff();
  const fields = [
    { name: 'title', label: 'Action', required: true },
    { name: 'description', label: 'Details', type: 'textarea', rows: 3 },
    { name: 'assigneeId', label: 'Assign to', type: 'select', required: true, options: staff.map((employee) => ({ value: employee.id, label: employee.name })) },
    { name: 'dueDate', label: 'Due date', type: 'date' },
    { name: 'priority', label: 'Priority', type: 'select', options: [
      { value: 'Normal', label: 'Normal' }, { value: 'High', label: 'High' },
    ] },
  ];
  if (task) fields.push({ name: 'status', label: 'Status', type: 'select', options: [
    { value: 'Open', label: 'Open' }, { value: 'In Progress', label: 'In Progress' },
    { value: 'Completed', label: 'Completed' }, { value: 'Cancelled', label: 'Cancelled' },
  ] });

  openModal({
    title: task ? 'Edit Action' : 'Assign Action', fields,
    initial: task || { assigneeId: staff[0]?.id || '', dueDate: '', priority: 'Normal', status: 'Open' },
    submitLabel: task ? 'Save Changes' : 'Assign Action',
    onSubmit: async (data) => {
      const now = new Date().toISOString();
      const status = data.status || 'Open';
      const payload = {
        title: data.title.trim(), description: data.description || '', assigneeId: data.assigneeId,
        dueDate: data.dueDate || '', priority: data.priority || 'Normal', status,
        createdBy: task?.createdBy || getCurrentUserId(), sourceNoticeId: task?.sourceNoticeId || '',
        sourceTitle: task?.sourceTitle || '', viewedAt: task && task.assigneeId === data.assigneeId ? task.viewedAt || '' : '',
        completedAt: status === 'Completed' ? task?.completedAt || now : '',
      };
      if (task) await store.update('staffActionItems', task.id, payload);
      else await store.add('staffActionItems', payload);
      if (!task || task.assigneeId !== data.assigneeId) window.dispatchEvent(new CustomEvent('erp-action-assigned'));
      onSaved();
    },
  });
}

async function setTaskStatus(task, status, refresh) {
  const now = new Date().toISOString();
  try {
    await store.update('staffActionItems', task.id, {
      status,
      completedAt: status === 'Completed' ? task.completedAt || now : '',
      viewedAt: task.viewedAt || now,
    });
    refresh();
  } catch (error) {
    window.alert(error.message || 'Could not update this action.');
  }
}

function actionCard(task, refresh) {
  const currentId = getCurrentUserId();
  const manager = MANAGERS.includes(getCurrentTier());
  const card = el('article', { class: 'action-card' });
  const due = task.dueDate ? formatDate(task.dueDate) : 'No due date';
  const overdue = task.dueDate && task.dueDate < todayISOString() && !['Completed', 'Cancelled'].includes(task.status);
  card.appendChild(el('div', { class: 'action-card-head' }, [
    el('h3', {}, taskTitle(task)),
    statusPill(task.status || 'Open'),
  ]));
  card.appendChild(el('p', { class: 'action-card-details' }, task.description || task.sourceTitle || 'No additional details.'));
  const meta = [
    'Assigned to ' + staffName(task.assigneeId),
    'Due ' + due,
    'Assigned by ' + staffName(task.createdBy),
  ];
  if (task.sourceTitle) meta.push('From meeting: ' + task.sourceTitle);
  card.appendChild(el('p', { class: 'action-card-meta' + (overdue ? ' action-card-overdue' : '') }, meta.join(' · ')));
  if (task.priority === 'High') card.appendChild(el('span', { class: 'pill pill-warning' }, 'High priority'));
  if (task.assigneeId === currentId && !task.viewedAt) card.appendChild(el('span', { class: 'pill pill-warning' }, 'New'));

  const actions = el('div', { class: 'action-card-buttons' });
  if (manager) actions.appendChild(el('button', { type: 'button', class: 'btn btn-ghost btn-sm', onClick: () => openTaskForm(task, refresh) }, [ico('edit'), 'Edit']));
  if (task.assigneeId === currentId && task.status === 'Open') actions.appendChild(el('button', {
    type: 'button', class: 'btn btn-secondary btn-sm', onClick: () => setTaskStatus(task, 'In Progress', refresh),
  }, 'Start'));
  if (task.assigneeId === currentId && task.status === 'In Progress') actions.appendChild(el('button', {
    type: 'button', class: 'btn btn-primary btn-sm', onClick: () => setTaskStatus(task, 'Completed', refresh),
  }, 'Mark complete'));
  if (actions.childNodes.length) card.appendChild(actions);
  return card;
}

async function loadPdfJs() {
  if (window.pdfjsLib) return window.pdfjsLib;
  await new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'vendor/pdf.min.js';
    script.onload = resolve;
    script.onerror = () => reject(new Error('The PDF reader could not be loaded.'));
    document.head.appendChild(script);
  });
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js';
  return window.pdfjsLib;
}

async function pdfAttachmentText(attachment) {
  const pdfjs = await loadPdfJs();
  const base64 = attachment.dataUrl.split(',')[1] || '';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  const pdf = await pdfjs.getDocument({ data: bytes }).promise;
  const pages = [];
  for (let number = 1; number <= pdf.numPages; number += 1) {
    const page = await pdf.getPage(number);
    const content = await page.getTextContent();
    pages.push(content.items.map((item) => item.str).join(' '));
  }
  return pages.join('\n');
}

function openMinutesExtractor(refresh) {
  const minutes = store.get('noticeBoardPosts').filter((post) => post.category === 'Minutes')
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  openCustomModal({ title: 'Create actions from meeting minutes', wide: true, build(body, close) {
    const message = el('p', { class: 'action-extract-help' }, 'Choose a Minutes post. The ERP will suggest action lines and assign only when a staff name is clearly written before the action. Check every suggestion and assignee before creating tasks.');
    body.appendChild(message);
    if (!minutes.length) {
      body.appendChild(el('p', { class: 'backup-warning' }, 'There are no Minutes posts yet. Upload the meeting minutes in Documents and Notices under the Minutes category, then return here.'));
      return;
    }
    const select = el('select', { class: 'field-control' }, minutes.map((post) => el('option', { value: post.id }, (post.date ? formatDate(post.date) + ' · ' : '') + post.title)));
    const text = el('textarea', { rows: 7, class: 'field-control', placeholder: 'Meeting text appears here. You can paste text if the uploaded file is a scan or a Word document.' });
    const status = el('p', { role: 'status', class: 'action-extract-status' });
    const candidateList = el('div', { class: 'action-extract-list' });
    let candidates = [];
    function loadNoticeText() {
      const post = store.find('noticeBoardPosts', select.value);
      text.value = post?.body || '';
    }
    select.addEventListener('change', loadNoticeText);
    loadNoticeText();
    body.append(el('label', { class: 'field' }, [el('span', { class: 'field-label' }, 'Meeting minutes'), select]));
    body.append(el('label', { class: 'field' }, [el('span', { class: 'field-label' }, 'Review or add minutes text'), text]));
    const parseButton = el('button', { type: 'button', class: 'btn btn-secondary', onClick: async () => {
      parseButton.disabled = true;
      status.textContent = 'Reading the minutes…';
      try {
        const post = store.find('noticeBoardPosts', select.value);
        let fullText = text.value.trim();
        const pdfs = (post?.attachments || []).filter((attachment) => /\.pdf$/i.test(attachment.name || '') || (attachment.dataUrl || '').startsWith('data:application/pdf'));
        for (const pdf of pdfs) fullText += '\n' + await pdfAttachmentText(pdf);
        candidates = extractMeetingActions(fullText, activeStaff());
        candidateList.replaceChildren();
        if (!candidates.length) {
          status.textContent = 'No action lines were detected. For scanned PDFs or Word documents, paste the minutes text above and try again.';
          return;
        }
        status.textContent = candidates.length + ' suggestions found. Confirm the assignee for each action before saving.';
        const staffOptions = [el('option', { value: '' }, 'Select staff member'), ...activeStaff().map((employee) => el('option', { value: employee.id }, employee.name))];
        candidates.forEach((candidate, index) => {
          const include = el('input', { type: 'checkbox', checked: 'checked', 'aria-label': 'Include this action' });
          const owner = el('select', { class: 'field-control' }, staffOptions.map((option) => option.cloneNode(true)));
          owner.value = candidate.assigneeId;
          const due = el('input', { type: 'date', class: 'field-control', 'aria-label': 'Due date (optional)' });
          candidateList.appendChild(el('div', { class: 'action-extract-row', 'data-index': String(index) }, [
            include,
            el('div', { class: 'action-extract-candidate' }, [el('strong', {}, candidate.title), el('span', {}, candidate.sourceLine)]),
            el('label', { class: 'action-extract-assignee' }, [el('span', {}, 'Assign to'), owner]),
            el('label', { class: 'action-extract-assignee' }, [el('span', {}, 'Due'), due]),
          ]));
        });
      } catch (error) {
        status.textContent = error.message || 'Could not read the meeting file. Paste the minutes text above and try again.';
      } finally {
        parseButton.disabled = false;
      }
    } }, 'Find action items');
    const saveButton = el('button', { type: 'button', class: 'btn btn-primary', onClick: async () => {
      const post = store.find('noticeBoardPosts', select.value);
      const rows = [...candidateList.querySelectorAll('.action-extract-row')].filter((row) => row.querySelector('input[type="checkbox"]').checked);
      if (!rows.length) { status.textContent = 'Select at least one action item.'; return; }
      const unassigned = rows.find((row) => !row.querySelector('select').value);
      if (unassigned) { status.textContent = 'Choose a staff member for each selected action.'; return; }
      saveButton.disabled = true;
      let saved = 0;
      try {
        for (const row of rows) {
          const candidate = candidates[Number(row.dataset.index)];
          const selects = row.querySelectorAll('select');
          const assigneeId = selects[0].value;
          const dueDate = selects[1].value;
          const duplicate = store.get('staffActionItems').some((task) => task.sourceNoticeId === post.id && task.assigneeId === assigneeId && task.title.toLowerCase() === candidate.title.toLowerCase() && task.status !== 'Cancelled');
          if (duplicate) continue;
          await store.add('staffActionItems', {
            title: candidate.title, description: candidate.description, assigneeId, createdBy: getCurrentUserId(),
            dueDate, priority: 'Normal', status: 'Open', sourceNoticeId: post.id, sourceTitle: post.title, viewedAt: '', completedAt: '',
          });
          saved += 1;
        }
        if (saved) window.dispatchEvent(new CustomEvent('erp-action-assigned'));
        status.textContent = saved ? saved + ' action(s) assigned. Duplicate suggestions were skipped.' : 'These actions are already recorded for the selected staff.';
        if (saved) { close(); refresh(); }
      } catch (error) {
        status.textContent = (saved ? saved + ' action(s) were saved. ' : '') + (error.message || 'Could not save the actions.');
        saveButton.disabled = false;
      }
    } }, 'Assign selected actions');
    body.append(parseButton, status, candidateList, el('div', { class: 'modal-actions' }, [saveButton]));
  } });
}

export function renderActionCenter(container) {
  container.innerHTML = '';
  const manager = MANAGERS.includes(getCurrentTier());
  const actionSlot = el('div', { class: 'action-center-controls' });
  container.appendChild(sectionHeader('Action Center', 'Your assigned actions and follow-ups, including tasks taken from meeting minutes.', actionSlot));

  const health = store.getHealth().staffActionItems;
  if (health?.optionalUnavailable) {
    container.appendChild(el('p', { role: 'status', class: 'backup-warning' }, 'The Action Center database setup has not been applied yet. An administrator needs to run the action-center migration before tasks can be saved.'));
    return;
  }
  actionSlot.appendChild(el('button', { type: 'button', class: 'btn btn-primary', onClick: () => openTaskForm(null, refresh) }, '+ Assign Action'));
  if (manager) actionSlot.appendChild(el('button', { type: 'button', class: 'btn btn-secondary', onClick: () => openMinutesExtractor(refresh) }, 'Create from Meeting Minutes'));

  const filter = el('select', { class: 'field-control' }, [
    el('option', { value: 'mine' }, 'Assigned to me'),
    ...(manager ? [el('option', { value: 'created' }, 'Assigned by me'), el('option', { value: 'all' }, 'All team actions')] : []),
  ]);
  const filterBar = el('div', { class: 'filter-bar' }, [el('label', { class: 'filter-field' }, [el('span', {}, 'Show'), filter])]);
  const feedback = el('p', { class: 'action-center-feedback', role: 'status' });
  const list = el('div', { class: 'action-center-list' });
  container.append(filterBar, feedback, list);

  function refresh() {
    let tasks = store.get('staffActionItems').slice();
    if (filter.value === 'mine') tasks = tasks.filter((task) => task.assigneeId === getCurrentUserId());
    else if (filter.value === 'created') tasks = tasks.filter((task) => task.createdBy === getCurrentUserId());
    tasks.sort((a, b) => {
      const aDone = ['Completed', 'Cancelled'].includes(a.status);
      const bDone = ['Completed', 'Cancelled'].includes(b.status);
      if (aDone !== bDone) return aDone ? 1 : -1;
      if (a.dueDate && b.dueDate && a.dueDate !== b.dueDate) return a.dueDate.localeCompare(b.dueDate);
      if (a.dueDate !== b.dueDate) return a.dueDate ? -1 : 1;
      return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
    });
    list.replaceChildren();
    if (!tasks.length) list.appendChild(el('p', { class: 'table-empty' }, filter.value === 'mine' ? 'No actions are assigned to you.' : 'No matching actions.'));
    else tasks.forEach((task) => list.appendChild(actionCard(task, refresh)));
  }
  filter.addEventListener('change', refresh);
  refresh();
}


