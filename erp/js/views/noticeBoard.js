import { store } from '../store.js';
import { formatDate, el } from '../utils.js';
import { sectionHeader, openModal, openCustomModal, actionButtons, confirmDelete } from '../ui.js';
import { getCurrentTier, getCurrentUserId } from '../session.js';

const CATEGORIES = [
  'Announcement', 'Meeting Notice', 'Agenda', 'Minutes', 'Policy', 'SOP',
  'Template', 'Organogram', 'Advert', 'Flyer', 'Other',
];

function employeeName(id) {
  return store.get('employees').find((e) => e.id === id)?.name || '';
}

function isImageAttachment(att) {
  return att.dataUrl.startsWith('data:image');
}

function fields(record) {
  return [
    { name: 'title', label: 'Title', required: true },
    { name: 'category', label: 'Category', type: 'select', required: true, options: CATEGORIES.map((c) => ({ value: c, label: c })) },
    { name: 'date', label: 'Date', type: 'date', required: true },
    { name: 'body', label: 'Details', type: 'textarea', rows: 4 },
    { name: 'attachments', label: 'Attachments (flyers, policy documents, organogram, etc.)', type: 'attachments' },
    { name: 'pinned', label: 'Pin to top of the board?', type: 'select', options: [
      { value: 'false', label: 'No' },
      { value: 'true', label: 'Yes' },
    ] },
  ];
}

function openLightbox(att) {
  openCustomModal({
    title: att.name,
    wide: true,
    build: (bodyContainer) => {
      bodyContainer.appendChild(el('img', { src: att.dataUrl, class: 'lightbox-image' }));
    },
  });
}

function attachmentChip(att) {
  if (isImageAttachment(att)) {
    const thumb = el('img', { src: att.dataUrl, class: 'notice-attachment-thumb', title: att.name });
    thumb.addEventListener('click', () => openLightbox(att));
    return thumb;
  }
  const link = el('a', { class: 'notice-attachment-file', href: att.dataUrl, target: '_blank', rel: 'noopener' }, `📄 ${att.name}`);
  return link;
}

function noticeCard(post, canManage, refresh) {
  const card = el('div', { class: `notice-card${post.pinned ? ' notice-card-pinned' : ''}` });

  const header = el('div', { class: 'notice-card-header' }, [
    el('span', { class: 'pill pill-neutral' }, post.category),
    post.pinned ? el('span', { class: 'notice-pin', title: 'Pinned' }, '📌') : null,
  ]);
  card.appendChild(header);

  card.appendChild(el('h3', { class: 'notice-card-title' }, post.title));

  const meta = [formatDate(post.date)];
  const postedByName = employeeName(post.postedBy);
  if (postedByName) meta.push(`Posted by ${postedByName}`);
  card.appendChild(el('p', { class: 'notice-card-meta' }, meta.join(' · ')));

  if (post.body) card.appendChild(el('p', { class: 'notice-card-body' }, post.body));

  const attachments = post.attachments || [];
  if (attachments.length) {
    card.appendChild(el('div', { class: 'notice-attachments' }, attachments.map((att) => attachmentChip(att))));
  }

  if (canManage) {
    card.appendChild(actionButtons({
      onEdit: () => openNoticeForm(post, refresh),
      onDelete: async () => {
        if (!confirmDelete(post.title)) return;
        try {
          await store.remove('noticeBoardPosts', post.id);
          refresh();
        } catch (err) {
          window.alert(err.message || 'Could not delete this notice.');
        }
      },
    }));
  }

  return card;
}

function openNoticeForm(record, refresh) {
  openModal({
    title: record ? 'Edit Notice' : 'Post Notice',
    fields: fields(record),
    initial: record
      ? { ...record, pinned: record.pinned ? 'true' : 'false' }
      : { date: new Date().toISOString().slice(0, 10), category: 'Announcement', pinned: 'false' },
    submitLabel: record ? 'Save Changes' : 'Post Notice',
    onSubmit: async (data) => {
      const payload = { ...data, pinned: data.pinned === 'true' };
      if (record) {
        await store.update('noticeBoardPosts', record.id, payload);
      } else {
        await store.add('noticeBoardPosts', { ...payload, postedBy: getCurrentUserId() || '' });
      }
      refresh();
    },
  });
}

export function renderNoticeBoard(container) {
  container.innerHTML = '';

  const canManage = ['Admin', 'Accounts'].includes(getCurrentTier());

  const actionSlot = el('div');
  container.appendChild(sectionHeader('Documents and Notices', 'Announcements, meeting notices, agendas, minutes, policies, SOPs, templates, adverts, flyers, and the organogram — visible to everyone.', actionSlot));
  if (canManage) {
    actionSlot.appendChild(el('button', { class: 'btn btn-primary', onClick: () => openNoticeForm(null, refresh) }, '+ Post Notice'));
  }

  const filterBar = el('div', { class: 'filter-bar' });
  const categorySelect = el('select', {}, [
    el('option', { value: 'all' }, 'All Categories'),
    ...CATEGORIES.map((c) => el('option', { value: c }, c)),
  ]);
  filterBar.appendChild(el('label', { class: 'filter-field' }, [el('span', {}, 'Category'), categorySelect]));
  container.appendChild(filterBar);

  const grid = el('div', { class: 'notice-board-grid' });
  container.appendChild(grid);

  function refresh() {
    let rows = store.get('noticeBoardPosts').slice();
    if (categorySelect.value !== 'all') rows = rows.filter((r) => r.category === categorySelect.value);
    // Pinned notices (organogram, standing policies) always float to the top;
    // everything else is newest-first, matching how a physical board reads.
    rows.sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return a.date < b.date ? 1 : -1;
    });

    grid.innerHTML = '';
    if (!rows.length) {
      grid.appendChild(el('p', { class: 'table-empty' }, 'Nothing posted yet.'));
      return;
    }
    rows.forEach((post) => grid.appendChild(noticeCard(post, canManage, refresh)));
  }

  categorySelect.addEventListener('change', refresh);
  refresh();
}
