import { supabase } from '../supabaseClient.js';
import { el } from '../utils.js';
import { renderTable, statusPill, openCustomModal, confirmDelete, showToast } from '../ui.js';

// Not part of the ERP's regular tables (see store.js) — trainees filling out
// the quiz have no ERP login, so `submissions` lives in its own table with
// its own RLS policies scoped to the anon key (erp/supabase/0034_day1_
// knowledge_check.sql), queried directly here rather than through store.js's
// generic camelCase collection system.
const QUESTIONS = [
  { key: 'a1', num: 1, label: "Where does the COO's Office sit, and who does the COO report to?" },
  { key: 'a2', num: 2, label: 'Two core expectations for staff conduct (Section 25).' },
  { key: null, num: 3, label: 'Whistleblower scenario — recorded answer.', video: true },
  { key: 'a4', num: 4, label: 'Your actual role, title, and supervisor during training.' },
  { key: 'a5', num: 5, label: 'Length of initial training period, and what happens at the end.' },
  { key: 'a6', num: 6, label: 'Example of something needing approval, and something for initiative.' },
  { key: 'a7', num: 7, label: "One thing from yesterday's reading that was unclear." },
];

function quizLink() {
  return new URL('../day1-knowledge-check.html', window.location.href).href;
}

function viewSubmission(record) {
  openCustomModal({
    title: record.name || 'Submission',
    wide: true,
    build: (container) => {
      const when = record.submitted_at ? new Date(record.submitted_at).toLocaleString('en-GB') : '—';
      container.appendChild(el('p', { class: 'section-subtitle' }, `Submitted ${when}${record.timed_out ? ' · timed out before finishing' : ''}`));

      const answers = record.answers || {};
      QUESTIONS.forEach((q) => {
        const block = el('div', { class: 'field', style: 'margin-bottom: 1.1rem;' }, [
          el('span', { class: 'field-label' }, `Question ${q.num} — ${q.label}`),
        ]);
        if (q.video) {
          if (record.video_url) {
            const video = el('video', { controls: 'controls', style: 'width: 100%; max-width: 420px; border-radius: 6px; margin-top: 0.4rem;' });
            video.src = record.video_url;
            block.appendChild(video);
          } else {
            block.appendChild(el('p', { style: 'margin: 0.3rem 0 0;' }, 'Not recorded.'));
          }
        } else {
          block.appendChild(el('p', { style: 'white-space: pre-wrap; margin: 0.3rem 0 0;' }, answers[q.key] || 'No answer provided.'));
        }
        container.appendChild(block);
      });
    },
  });
}

export function renderKnowledgeCheck(container) {
  container.innerHTML = '';

  container.appendChild(el('p', { class: 'section-subtitle' }, 'Written and recorded answers from the Day 1 onboarding quiz, submitted by trainees on their own device.'));

  const link = quizLink();
  const linkInput = el('input', { type: 'text', readonly: 'readonly', value: link, style: 'flex: 1;' });
  linkInput.addEventListener('click', () => linkInput.select());
  const copyBtn = el('button', {
    type: 'button',
    class: 'btn btn-ghost',
    onClick: async () => {
      try {
        await navigator.clipboard.writeText(link);
        showToast('Link copied.', 'good');
      } catch {
        window.alert(link);
      }
    },
  }, 'Copy Link');
  container.appendChild(el('label', { class: 'field', style: 'margin-bottom: 1rem;' }, [
    el('span', { class: 'field-label' }, 'Link to send a new trainee'),
    el('div', { style: 'display: flex; gap: 0.5rem; align-items: center;' }, [linkInput, copyBtn]),
  ]));

  const tableContainer = el('div');
  container.appendChild(tableContainer);

  async function refresh() {
    tableContainer.innerHTML = '';
    tableContainer.appendChild(el('p', { class: 'table-empty' }, 'Loading…'));

    const { data, error } = await supabase
      .from('submissions')
      .select('*')
      .order('submitted_at', { ascending: false });

    tableContainer.innerHTML = '';
    if (error) {
      tableContainer.appendChild(el('p', { class: 'table-empty' }, `Couldn't load submissions (${error.message}).`));
      return;
    }

    renderTable(tableContainer, {
      columns: [
        { key: 'name', label: 'Trainee' },
        { key: 'submitted_at', label: 'Submitted', render: (r) => (r.submitted_at ? new Date(r.submitted_at).toLocaleString('en-GB') : '—') },
        { key: 'timed_out', label: 'Status', render: (r) => statusPill(r.timed_out ? 'Timed Out' : 'Completed') },
        { key: 'video_recorded', label: 'Video (Q3)', render: (r) => statusPill(r.video_recorded ? 'Recorded' : 'Not Recorded') },
        {
          key: 'actions',
          label: '',
          render: (r) => el('div', { class: 'row-actions' }, [
            el('button', { class: 'icon-btn', type: 'button', title: 'View answers', onClick: () => viewSubmission(r) }, '👁'),
            el('button', {
              class: 'icon-btn icon-btn-danger',
              type: 'button',
              title: 'Delete',
              onClick: async () => {
                if (!confirmDelete(r.name)) return;
                const { error: deleteError } = await supabase.from('submissions').delete().eq('id', r.id);
                if (deleteError) { window.alert(deleteError.message || 'Could not delete this submission.'); return; }
                refresh();
              },
            }, '🗑'),
          ]),
        },
      ],
      rows: data || [],
      emptyText: 'No submissions yet. Share the link above with a new trainee to get started.',
    });
  }

  refresh();
}
