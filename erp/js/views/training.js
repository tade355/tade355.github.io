import { store } from '../store.js';
import { supabase } from '../supabaseClient.js';
import { el } from '../utils.js';
import { renderTable, statusPill, sectionHeader, openCustomModal, closeModal, confirmDelete, showToast } from '../ui.js';
import { getCurrentUser, getCurrentUserId, getCurrentTier, filterTrainingSubmissions } from '../session.js';

const DAY1_QUESTIONS = [
  {
    num: 1,
    key: 'a1',
    video: true,
    label: 'Describe Emagrims Company Limited\'s overall structure — who leads the Company, and how is it organized?',
  },
  {
    num: 2,
    key: 'a2',
    video: true,
    label: "Name two of the Company's core expectations for staff conduct (Section 25).",
  },
  {
    num: 3,
    key: 'a3',
    video: true,
    label: 'Scenario: you notice a colleague appears to be falsifying a report.',
    hint: 'Explain what the Whistleblower Policy says you should do, and whether you can be punished for reporting it in good faith even if you turn out to be wrong.',
  },
  {
    num: 4,
    key: 'a4',
    video: true,
    label: 'What is your actual role and title, and who is your direct supervisor during training?',
  },
  { num: 5, key: 'a5', label: 'How long is your initial training period, and what happens at the end of it?' },
  { num: 6, key: 'a6', label: 'Give one example of something you should always get approval for before acting, and one example of something you can take initiative on yourself.' },
  { num: 7, key: 'a7', label: "What's one thing from yesterday's reading you found unclear or would like explained further?" },
  { num: 8, key: 'a8', label: 'In your own words, what does Emagrims Company Limited do, and what industry is it in?' },
  { num: 9, key: 'a9', label: "What is the Company's core service, and what does its dozer fleet get used for?" },
  { num: 10, key: 'a10', label: "Who is the Company's Chief Executive Officer, and what is the CEO's role in the Company?" },
  { num: 11, key: 'a11', label: "Who is the Company's Executive Director?" },
  { num: 12, key: 'a12', label: "Where can you find the Company's official page online?" },
  { num: 13, key: 'a13', label: 'What system does the Company use to run its daily operations, fleet, sales, purchasing, accounting, and HR?' },
  { num: 14, key: 'a14', label: "Where is the Company's registered office located?" },
  { num: 15, key: 'a15', label: 'Name one other functional area within the Company you might get exposure to during training, besides your immediate desk.' },
];

// Built from the Session 1 lesson deck ("Foundations of Executive &
// Management Support") delivered Saturday — same question count and
// video/text mix as Quiz 1 for consistency.
const SESSION1_QUESTIONS = [
  {
    num: 1,
    key: 'a1',
    video: true,
    label: 'In your own words, what is the core purpose of your role as covered in this session — what is it meant to do for the executive?',
  },
  { num: 2, key: 'a2', label: 'Name the three core functions of the role from Part One, and briefly describe one of them.' },
  {
    num: 3,
    key: 'a3',
    video: true,
    label: 'What is "the mindset shift" the session describes, and how should it change the way you handle a task compared to just waiting to be told?',
  },
  { num: 4, key: 'a4', label: 'The session used a meeting-conflict example to illustrate the mindset shift. Describe it — what\'s the less useful response, and what\'s the better one?' },
  {
    num: 5,
    key: 'a5',
    video: true,
    label: 'The session calls one attribute "the single most important trait in this role." Which one, and why?',
  },
  { num: 6, key: 'a6', label: 'Besides that trait, name the other two of "The Big Three" attributes.' },
  { num: 7, key: 'a7', label: 'Name the "Two More That Matter" attributes covered after The Big Three.' },
  { num: 8, key: 'a8', label: 'What is the difference between being busy and being useful, according to this session?' },
  { num: 9, key: 'a9', label: 'Give the example the session used to show "bringing the solution" instead of just flagging a problem.' },
  {
    num: 10,
    key: 'a10',
    video: true,
    label: 'Explain "Ownership, Not Compliance" — what\'s the difference between "I did what I was told" and taking real ownership?',
  },
  { num: 11, key: 'a11', label: 'What does "Confidentiality as Identity" mean, as opposed to just following a policy?' },
  { num: 12, key: 'a12', label: 'Name at least three of the five Soft Skills to Build from this session.' },
  { num: 13, key: 'a13', label: 'Name at least three of the five Hard Skills to Build from this session.' },
  { num: 14, key: 'a14', label: 'Why does the session say early mistakes are expected? What actually matters instead?' },
  { num: 15, key: 'a15', label: "What's the closing message of the session — what should you try to be?" },
];

const QUIZZES = [
  {
    id: 'day1',
    name: 'Quiz 1',
    intro: "Let's see what stuck from Day 1.",
    description: 'On the Company, the Manual, and your Training Plan.',
    questions: DAY1_QUESTIONS,
  },
  {
    id: 'session1',
    name: 'Quiz 2',
    intro: "Let's see what stuck from Saturday's session.",
    description: 'On the role, attributes, and skills covered in the Session 1 lesson.',
    questions: SESSION1_QUESTIONS,
  },
];

function quizById(id) {
  return QUIZZES.find((q) => q.id === id) || QUIZZES[0];
}

const TOTAL_SECONDS = 20 * 60;
const MAX_REC_SECONDS = 180;

function fmt(sec) {
  const m = Math.floor(sec / 60).toString().padStart(2, '0');
  const s = Math.floor(sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function employeeName(id) {
  return store.get('employees').find((e) => e.id === id)?.name || 'Unknown';
}

function recordedVideoCount(record, questions) {
  const answers = record.answers || {};
  return questions.filter((q) => q.video && answers[q.key]?.videoUrl).length;
}

function viewSubmission(record, refresh) {
  const quiz = quizById(record.quizId);
  const questions = quiz.questions;
  const videoQuestionCount = questions.filter((q) => q.video).length;
  const tier = getCurrentTier();
  const canGrade = tier === 'Admin' || tier === 'Accounts' || tier === 'Supervisor';
  openCustomModal({
    title: `${employeeName(record.employeeId)} — ${quiz.name}`,
    wide: true,
    build: (modalContainer) => {
      const when = record.submittedAt ? new Date(record.submittedAt).toLocaleString('en-GB') : '—';
      modalContainer.appendChild(el('p', { class: 'section-subtitle' }, `Submitted ${when}${record.timedOut ? ' · timed out before finishing' : ''} · ${recordedVideoCount(record, questions)}/${videoQuestionCount} video answers recorded`));
      if (record.tabSwitchCount) {
        modalContainer.appendChild(el('p', { class: 'section-subtitle', style: 'color: var(--warning);' }, `⚠ Left the tab ${record.tabSwitchCount} time${record.tabSwitchCount === 1 ? '' : 's'} during the quiz (${record.tabAwaySeconds || 0}s away total). Not proof of anything on its own — worth a look alongside the answers.`));
      }
      if (record.score != null || record.outcome) {
        modalContainer.appendChild(el('div', { class: 'quiz-summary-block' }, [
          el('div', { class: 'field-label' }, 'Score'),
          el('div', { style: 'margin-top: 0.4rem; display: flex; align-items: center; gap: 0.5rem;' }, [
            record.score != null ? el('strong', {}, `${record.score}/${questions.length}`) : null,
            record.outcome ? statusPill(record.outcome) : null,
          ]),
        ]));
      }
      const answers = record.answers || {};
      questions.forEach((q) => {
        const block = el('div', { class: 'quiz-summary-block' }, [el('div', { class: 'field-label' }, `Question ${q.num} — ${q.label}`)]);
        if (q.video) {
          const videoUrl = answers[q.key]?.videoUrl;
          if (videoUrl) {
            const video = el('video', { controls: 'controls', style: 'width: 100%; max-width: 420px; border-radius: 6px; margin-top: 0.5rem;' });
            video.src = videoUrl;
            block.appendChild(video);
          } else {
            block.appendChild(el('p', { style: 'margin: 0.4rem 0 0;' }, 'Not recorded.'));
          }
        } else {
          block.appendChild(el('p', { style: 'white-space: pre-wrap; margin: 0.4rem 0 0;' }, answers[q.key] || 'No answer provided.'));
        }
        modalContainer.appendChild(block);
      });

      if (!canGrade) return;

      modalContainer.appendChild(el('h3', { class: 'subsection-title' }, 'Grade this submission'));
      if (record.gradedAt) {
        modalContainer.appendChild(el('p', { class: 'section-subtitle' }, `Last graded ${new Date(record.gradedAt).toLocaleString('en-GB')}${record.gradedBy ? ` by ${employeeName(record.gradedBy)}` : ''}`));
      }

      const scoreInput = el('input', { type: 'number', min: '0', max: String(questions.length), style: 'width: 6rem;' });
      scoreInput.value = record.score ?? '';
      const outcomeSelect = el('select', {}, [
        el('option', { value: '' }, '— Not set —'),
        el('option', { value: 'Pass' }, 'Pass'),
        el('option', { value: 'Needs Review' }, 'Needs Review'),
        el('option', { value: 'Fail' }, 'Fail'),
      ]);
      outcomeSelect.value = record.outcome || '';
      const notesTextarea = el('textarea', { rows: '3', placeholder: 'Optional notes…' });
      notesTextarea.value = record.graderNotes || '';

      const saveBtn = el('button', { class: 'btn btn-primary', type: 'button' }, 'Save Grade');
      saveBtn.addEventListener('click', async () => {
        saveBtn.setAttribute('disabled', 'disabled');
        saveBtn.textContent = 'Saving…';
        try {
          await store.update('trainingSubmissions', record.id, {
            score: scoreInput.value === '' ? null : Number(scoreInput.value),
            outcome: outcomeSelect.value || null,
            graderNotes: notesTextarea.value,
            gradedAt: new Date().toISOString(),
            gradedBy: getCurrentUserId(),
          });
          showToast('Grade saved.', 'good');
          closeModal();
          if (refresh) refresh();
        } catch (err) {
          window.alert(err.message || 'Could not save the grade.');
          saveBtn.removeAttribute('disabled');
          saveBtn.textContent = 'Save Grade';
        }
      });

      modalContainer.appendChild(el('div', { class: 'form-grid-2', style: 'margin-top: 0.5rem;' }, [
        el('label', { class: 'field' }, [el('span', { class: 'field-label' }, `Score (out of ${questions.length})`), scoreInput]),
        el('label', { class: 'field' }, [el('span', { class: 'field-label' }, 'Outcome'), outcomeSelect]),
      ]));
      modalContainer.appendChild(el('label', { class: 'field', style: 'margin-top: 0.5rem;' }, [el('span', { class: 'field-label' }, 'Notes'), notesTextarea]));
      modalContainer.appendChild(el('div', { style: 'margin-top: 0.75rem;' }, [saveBtn]));
    },
  });
}

export function renderTraining(container) {
  container.innerHTML = '';

  const actionSlot = el('div');
  container.appendChild(sectionHeader(
    'Training',
    'Your assigned training program\'s materials, and its quizzes.',
    actionSlot,
  ));

  const programPanel = el('div');
  container.appendChild(programPanel);

  const body = el('div');
  container.appendChild(body);

  function currentProgram() {
    const employee = getCurrentUser();
    if (!employee || !employee.trainingProgramId) return null;
    return store.get('trainingPrograms').find((p) => p.id === employee.trainingProgramId) || null;
  }

  function docBlock(label, attachments) {
    const list = attachments || [];
    const block = el('div', { class: 'quiz-summary-block' }, [el('div', { class: 'field-label' }, label)]);
    if (!list.length) {
      block.appendChild(el('p', { style: 'margin: 0.3rem 0 0; color: var(--text-muted);' }, 'Not yet uploaded.'));
    } else {
      block.appendChild(el('div', { style: 'margin-top: 0.3rem; display: flex; flex-wrap: wrap; gap: 0.5rem;' }, list.map((att) => el('a', {
        class: 'notice-attachment-file', href: att.dataUrl, target: '_blank', rel: 'noopener',
      }, `📄 ${att.name}`))));
    }
    return block;
  }

  function renderProgramPanel() {
    programPanel.innerHTML = '';
    const program = currentProgram();
    if (!program) {
      programPanel.appendChild(el('p', { class: 'section-subtitle' }, 'No training program is currently assigned to you.'));
      return;
    }
    programPanel.appendChild(el('h3', { class: 'subsection-title', style: 'margin-top: 0;' }, program.name));
    if (program.description) programPanel.appendChild(el('p', { class: 'section-subtitle' }, program.description));
    programPanel.appendChild(docBlock('Manual', program.manual));
    programPanel.appendChild(docBlock('Training Plan', program.plan));
    programPanel.appendChild(docBlock('Training Syllabus', program.syllabus));

    programPanel.appendChild(el('h3', { class: 'subsection-title' }, 'Quizzes'));
    QUIZZES.forEach((quiz) => {
      programPanel.appendChild(el('div', {
        class: 'quiz-summary-block',
        style: 'display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap;',
      }, [
        el('div', {}, [
          el('div', { class: 'field-label' }, quiz.name),
          quiz.description ? el('p', { style: 'margin: 0.3rem 0 0; color: var(--text-secondary); font-size: 0.85rem;' }, quiz.description) : null,
        ]),
        el('button', { class: 'btn btn-primary', type: 'button', onClick: () => showQuiz(quiz.id) }, 'Take the Quiz'),
      ]));
    });
  }

  function showList() {
    renderProgramPanel();
    actionSlot.innerHTML = '';
    renderListBody();
  }

  async function renderListBody() {
    body.innerHTML = '';
    body.appendChild(el('p', { class: 'table-empty' }, 'Loading…'));
    try {
      await store.refreshCollection('trainingSubmissions');
    } catch (err) {
      body.innerHTML = '';
      body.appendChild(el('p', { class: 'table-empty' }, `Couldn't load submissions (${err.message}).`));
      return;
    }

    body.innerHTML = '';
    const rows = filterTrainingSubmissions(store.get('trainingSubmissions'))
      .slice()
      .sort((a, b) => (a.submittedAt < b.submittedAt ? 1 : -1));

    const tableContainer = el('div');
    body.appendChild(tableContainer);
    const tier = getCurrentTier();
    const canGrade = tier === 'Admin' || tier === 'Accounts' || tier === 'Supervisor';
    renderTable(tableContainer, {
      columns: [
        { key: 'employeeId', label: 'Employee', render: (r) => employeeName(r.employeeId) },
        { key: 'quizId', label: 'Quiz', render: (r) => quizById(r.quizId).name },
        { key: 'submittedAt', label: 'Submitted', render: (r) => (r.submittedAt ? new Date(r.submittedAt).toLocaleString('en-GB') : '—') },
        { key: 'timedOut', label: 'Status', render: (r) => statusPill(r.timedOut ? 'Timed Out' : 'Completed') },
        {
          key: 'videos',
          label: 'Videos',
          render: (r) => {
            const questions = quizById(r.quizId).questions;
            const total = questions.filter((q) => q.video).length;
            const n = recordedVideoCount(r, questions);
            if (n === total) return statusPill('Recorded');
            if (n === 0) return statusPill('Not Recorded');
            return statusPill(`${n}/${total}`);
          },
        },
        { key: 'tabSwitchCount', label: 'Left Tab', render: (r) => (r.tabSwitchCount ? `⚠ ${r.tabSwitchCount}×` : '—') },
        {
          key: 'score',
          label: 'Score',
          render: (r) => (r.score == null && !r.outcome ? '—' : el('span', { style: 'display: inline-flex; align-items: center; gap: 0.4rem;' }, [
            r.score != null ? `${r.score}/${quizById(r.quizId).questions.length}` : null,
            r.outcome ? statusPill(r.outcome) : null,
          ])),
        },
        {
          key: 'actions',
          label: '',
          render: (r) => el('div', { class: 'row-actions' }, [
            el('button', { class: 'icon-btn', type: 'button', title: 'View answers', onClick: () => viewSubmission(r, renderListBody) }, '👁'),
            el('button', {
              class: 'icon-btn icon-btn-danger',
              type: 'button',
              title: 'Delete',
              onClick: async () => {
                if (!confirmDelete(`${employeeName(r.employeeId)}'s submission`)) return;
                try {
                  await store.remove('trainingSubmissions', r.id);
                  renderListBody();
                } catch (err) {
                  window.alert(err.message || 'Could not delete this submission.');
                }
              },
            }, '🗑'),
          ]),
        },
      ],
      rows,
      emptyText: canGrade
        ? 'No submissions yet.'
        : (currentProgram() ? 'You haven’t taken a quiz yet — pick one above to begin.' : 'Nothing to show yet.'),
    });
  }

  // ---------------- Quiz-taking flow ----------------

  function showQuiz(quizId) {
    const quiz = quizById(quizId);
    const questions = quiz.questions;
    const employee = getCurrentUser();
    if (!employee) {
      window.alert('No employee record is linked to this login. Contact an admin before taking the quiz.');
      return;
    }

    let stream = null;
    let mediaRecorder = null;
    let recordedChunks = [];
    let recording = false;
    let timerInterval = null;
    let recInterval = null;
    let awayStartTime = null;

    const state = {
      step: 'intro',
      answers: Object.fromEntries(questions.filter((q) => !q.video).map((q) => [q.key, ''])),
      videoBlobs: {},
      videoSeconds: {},
      totalSeconds: TOTAL_SECONDS,
      timedOut: false,
      tabSwitchCount: 0,
      tabAwaySeconds: 0,
    };

    function stopMediaStream() {
      if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; }
    }

    // Logged for review, not enforced — this app has no way to lock down
    // another tab/device or detect AI use. Leaving the tab is a real
    // (if imperfect) signal a reviewer can weigh alongside the answers
    // themselves, particularly the unscripted video answers.
    function onVisibilityChange() {
      if (document.visibilityState === 'hidden') {
        state.tabSwitchCount++;
        awayStartTime = Date.now();
      } else if (document.visibilityState === 'visible' && awayStartTime) {
        state.tabAwaySeconds += Math.round((Date.now() - awayStartTime) / 1000);
        awayStartTime = null;
      }
    }

    function stopTabTracking() {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      awayStartTime = null;
    }

    function cleanup() {
      if (timerInterval) clearInterval(timerInterval);
      if (recInterval) clearInterval(recInterval);
      stopMediaStream();
      stopTabTracking();
    }

    actionSlot.innerHTML = '';
    actionSlot.appendChild(el('button', { class: 'btn btn-ghost', type: 'button', onClick: () => { cleanup(); showList(); } }, 'Cancel'));

    const top = el('div', { class: 'quiz-top' });
    const screen = el('div');
    body.innerHTML = '';
    body.appendChild(top);
    body.appendChild(screen);

    function updateTop() {
      top.innerHTML = '';
      if (state.step === 'intro' || state.step === 'summary') return;
      top.appendChild(el('span', { class: 'quiz-progress' }, `Question ${state.step} of ${questions.length}`));
      top.appendChild(el('span', { class: `quiz-timer${state.totalSeconds <= 180 ? ' warn' : ''}` }, fmt(state.totalSeconds)));
    }

    function startTimer() {
      timerInterval = setInterval(() => {
        state.totalSeconds--;
        const timerEl = top.querySelector('.quiz-timer');
        if (timerEl) {
          timerEl.textContent = fmt(state.totalSeconds);
          timerEl.classList.toggle('warn', state.totalSeconds <= 180);
        }
        if (state.totalSeconds <= 0) {
          clearInterval(timerInterval);
          goToSummary(true);
        }
      }, 1000);
    }

    function goToSummary(timedOut) {
      if (timerInterval) clearInterval(timerInterval);
      if (recInterval) clearInterval(recInterval);
      const finalize = () => {
        stopMediaStream();
        stopTabTracking();
        state.timedOut = !!timedOut;
        state.step = 'summary';
        renderScreen();
      };
      if (recording && mediaRecorder) {
        mediaRecorder.addEventListener('stop', finalize, { once: true });
        mediaRecorder.stop();
        recording = false;
      } else {
        finalize();
      }
    }

    function renderScreen() {
      updateTop();
      screen.innerHTML = '';
      if (state.step === 'intro') screen.appendChild(renderIntro());
      else if (state.step === 'summary') screen.appendChild(renderSummary());
      else {
        const q = questions.find((qq) => qq.num === state.step);
        screen.appendChild(q.video ? renderVideoQuestion(q) : renderTextQuestion(q));
      }
    }

    function renderIntro() {
      const videoCount = questions.filter((q) => q.video).length;
      const textCount = questions.length - videoCount;

      const agreeCheckbox = el('input', { type: 'checkbox', id: 'quiz-agree' });
      const beginBtn = el('button', { class: 'btn btn-primary', type: 'button', disabled: 'disabled' }, 'Begin');
      agreeCheckbox.addEventListener('change', () => {
        if (agreeCheckbox.checked) beginBtn.removeAttribute('disabled');
        else beginBtn.setAttribute('disabled', 'disabled');
      });
      beginBtn.addEventListener('click', () => {
        state.step = 1;
        startTimer();
        document.addEventListener('visibilitychange', onVisibilityChange);
        renderScreen();
      });

      return el('div', {}, [
        el('p', { class: 'section-subtitle' }, `Signed in as ${employee.name}`),
        el('h3', { class: 'subsection-title', style: 'margin-top: 0.75rem;' }, quiz.intro),
        el('p', {}, `${questions.length} short questions${quiz.description ? ` — ${quiz.description}` : ''} — ${textCount} written, ${videoCount} recorded on camera.`),

        el('h4', { style: 'margin: 1.25rem 0 0.4rem; font-size: 0.95rem;' }, 'Format'),
        el('ul', { class: 'quiz-notice' }, [
          el('li', {}, [el('strong', {}, `${videoCount} questions`), ' need your camera and microphone — you\'ll be asked for permission the first time you reach one.']),
          el('li', {}, [el('strong', {}, `${textCount} questions`), ' are typed answers.']),
          el('li', {}, [el('strong', {}, '20 minutes'), ' total, once you start. The clock keeps running even if you switch tabs.']),
          el('li', {}, 'Everything saves automatically when you finish — written answers and video together.'),
        ]),

        el('h4', { style: 'margin: 1.25rem 0 0.4rem; font-size: 0.95rem;' }, 'Please read before you start'),
        el('ul', { class: 'quiz-notice', style: 'border-left-color: var(--critical);' }, [
          el('li', {}, 'Answer in your own words. This is checking whether what you read actually made sense to you, not how well you can search for it or ask someone else.'),
          el('li', {}, 'For the recorded questions, speak naturally — don\'t read from a script or from the Manual on another screen.'),
          el('li', {}, 'Leaving this browser tab during the quiz is logged — how many times, and for how long — and is visible to whoever reviews your answers.'),
          el('li', {}, 'If you\'re not sure about something, say so honestly. A partial answer told straight is worth more than a confident one copied from somewhere.'),
        ]),

        el('label', { class: 'field', style: 'flex-direction: row; align-items: center; gap: 0.5rem; margin-top: 1.25rem;' }, [
          agreeCheckbox,
          el('span', {}, 'I\'ve read the above and will complete this honestly, in my own words.'),
        ]),

        el('div', { style: 'margin-top: 1rem;' }, [beginBtn]),
      ]);
    }

    function renderTextQuestion(q) {
      const textarea = el('textarea', { name: q.key, placeholder: 'Type your answer here…' });
      textarea.value = state.answers[q.key] || '';
      textarea.addEventListener('input', () => { state.answers[q.key] = textarea.value; });

      const isLast = q.num === questions.length;
      const nextBtn = el('button', {
        class: 'btn btn-primary',
        type: 'button',
        onClick: () => { if (isLast) goToSummary(false); else { state.step = q.num + 1; renderScreen(); } },
      }, isLast ? 'Finish & Review' : 'Next');
      const backBtn = q.num > 1
        ? el('button', { class: 'btn btn-ghost', type: 'button', onClick: () => { state.step = q.num - 1; renderScreen(); } }, 'Back')
        : null;

      return el('div', {}, [
        el('p', { class: 'quiz-question' }, q.label),
        el('label', { class: 'field' }, [textarea]),
        el('div', { class: 'navrow', style: 'margin-top: 1.25rem; display: flex; gap: 0.6rem;' }, [backBtn, nextBtn]),
      ]);
    }

    function renderVideoQuestion(q) {
      const liveVideo = el('video', { autoplay: 'autoplay', muted: 'muted', playsinline: 'playsinline', style: 'display: none;' });
      const playbackVideo = el('video', { controls: 'controls', playsinline: 'playsinline', style: 'display: none;' });
      const placeholder = el('div', { class: 'quiz-video-placeholder' }, 'Camera preview will appear here. Click "Enable camera" to begin.');
      const recIndicator = el('div', { class: 'quiz-rec-indicator' }, [el('span', { class: 'quiz-rec-dot' }), 'REC']);
      const recClock = el('div', { class: 'quiz-rec-clock', style: 'display: none;' }, '00:00');
      const stage = el('div', { class: 'quiz-video-stage' }, [liveVideo, playbackVideo, placeholder, recIndicator, recClock]);

      const btnEnable = el('button', { class: 'btn btn-ghost', type: 'button' }, 'Enable camera');
      const btnRecord = el('button', { class: 'btn btn-primary', type: 'button', style: 'display: none;' }, 'Start recording');
      const btnRetake = el('button', { class: 'btn btn-ghost', type: 'button', style: 'display: none;' }, 'Re-record');
      const controls = el('div', { class: 'quiz-controls' }, [btnEnable, btnRecord, btnRetake]);

      const isLast = q.num === questions.length;
      const nextBtn = el('button', { class: 'btn btn-primary', type: 'button' }, isLast ? 'Finish & Review' : 'Next');
      if (!state.videoBlobs[q.num]) nextBtn.setAttribute('disabled', 'disabled');
      const backBtn = q.num > 1
        ? el('button', { class: 'btn btn-ghost', type: 'button', onClick: () => { state.step = q.num - 1; renderScreen(); } }, 'Back')
        : null;

      if (state.videoBlobs[q.num]) {
        playbackVideo.src = URL.createObjectURL(state.videoBlobs[q.num]);
        playbackVideo.style.display = 'block';
        placeholder.style.display = 'none';
        btnEnable.style.display = 'none';
        btnRetake.style.display = 'inline-flex';
      } else if (stream) {
        liveVideo.srcObject = stream;
        liveVideo.style.display = 'block';
        placeholder.style.display = 'none';
        btnEnable.style.display = 'none';
        btnRecord.style.display = 'inline-flex';
      }

      btnEnable.addEventListener('click', async () => {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
          liveVideo.srcObject = stream;
          liveVideo.style.display = 'block';
          placeholder.style.display = 'none';
          btnEnable.style.display = 'none';
          btnRecord.style.display = 'inline-flex';
        } catch (err) {
          placeholder.innerHTML = 'Camera/microphone access was blocked or unavailable.<br>Please allow access in your browser and try again.';
        }
      });

      btnRecord.addEventListener('click', () => {
        if (!recording) {
          recordedChunks = [];
          let mimeType = 'video/webm';
          if (MediaRecorder.isTypeSupported('video/mp4')) mimeType = 'video/mp4';
          mediaRecorder = new MediaRecorder(stream, { mimeType });
          mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) recordedChunks.push(e.data); };
          mediaRecorder.onstop = () => {
            state.videoBlobs[q.num] = new Blob(recordedChunks, { type: mimeType });
            playbackVideo.src = URL.createObjectURL(state.videoBlobs[q.num]);
            playbackVideo.style.display = 'block';
            liveVideo.style.display = 'none';
            btnRetake.style.display = 'inline-flex';
            nextBtn.removeAttribute('disabled');
          };
          mediaRecorder.start();
          recording = true;
          state.videoSeconds[q.num] = 0;
          recIndicator.classList.add('on');
          recClock.style.display = 'block';
          btnRecord.textContent = 'Stop recording';
          recInterval = setInterval(() => {
            state.videoSeconds[q.num] = (state.videoSeconds[q.num] || 0) + 1;
            recClock.textContent = fmt(state.videoSeconds[q.num]);
            if (state.videoSeconds[q.num] >= MAX_REC_SECONDS) btnRecord.click();
          }, 1000);
        } else {
          mediaRecorder.stop();
          recording = false;
          clearInterval(recInterval);
          recIndicator.classList.remove('on');
          recClock.style.display = 'none';
          btnRecord.style.display = 'none';
        }
      });

      btnRetake.addEventListener('click', () => {
        state.videoBlobs[q.num] = null;
        playbackVideo.style.display = 'none';
        liveVideo.style.display = 'block';
        btnRetake.style.display = 'none';
        btnRecord.style.display = 'inline-flex';
        btnRecord.textContent = 'Start recording';
        nextBtn.setAttribute('disabled', 'disabled');
      });

      nextBtn.addEventListener('click', () => { if (isLast) goToSummary(false); else { state.step = q.num + 1; renderScreen(); } });

      return el('div', {}, [
        el('p', { class: 'quiz-question' }, q.label),
        q.hint ? el('p', { class: 'quiz-hint' }, q.hint) : null,
        stage,
        controls,
        el('div', { class: 'navrow', style: 'margin-top: 0.5rem; display: flex; gap: 0.6rem;' }, [backBtn, nextBtn]),
      ]);
    }

    function renderSummary() {
      const wrap = el('div', {});
      if (state.timedOut) {
        wrap.appendChild(el('div', { class: 'quiz-notice', style: 'border-left-color: var(--critical);' }, 'Time ran out — this is what was captured before the clock hit zero.'));
      }
      questions.forEach((q) => {
        const block = el('div', { class: 'quiz-summary-block' }, [el('div', { class: 'field-label' }, `Question ${q.num} — ${q.label}`)]);
        if (q.video) {
          const seconds = state.videoSeconds[q.num] || 0;
          block.appendChild(el('p', { style: 'margin: 0.4rem 0 0;' }, state.videoBlobs[q.num] ? `✓ Video recorded (${seconds}s)` : 'No video recorded'));
        } else {
          const val = (state.answers[q.key] || '').trim();
          block.appendChild(el('p', { style: 'white-space: pre-wrap; margin: 0.4rem 0 0;' }, val || 'No answer provided'));
        }
        wrap.appendChild(block);
      });

      const submitBtn = el('button', { class: 'btn btn-primary', type: 'button' }, 'Submit');
      submitBtn.addEventListener('click', () => submit(submitBtn));
      wrap.appendChild(el('div', { style: 'margin-top: 1.25rem;' }, [submitBtn]));
      return wrap;
    }

    async function submit(submitBtn) {
      submitBtn.setAttribute('disabled', 'disabled');
      submitBtn.textContent = 'Submitting…';
      try {
        const answers = { ...state.answers };
        const videoQuestions = questions.filter((q) => q.video);
        for (const q of videoQuestions) {
          const blob = state.videoBlobs[q.num];
          if (blob) {
            const fileName = `${quiz.id}_q${q.num}_${Date.now()}_${employee.id}.webm`;
            // eslint-disable-next-line no-await-in-loop
            const { error: uploadError } = await supabase.storage.from('trainee-videos').upload(fileName, blob, { contentType: blob.type });
            if (uploadError) throw new Error(`Could not upload your video for Question ${q.num} (${uploadError.message}).`);
            const { data: publicUrlData } = supabase.storage.from('trainee-videos').getPublicUrl(fileName);
            answers[q.key] = { videoUrl: publicUrlData.publicUrl, durationSeconds: state.videoSeconds[q.num] || 0 };
          } else {
            answers[q.key] = { videoUrl: null, durationSeconds: 0 };
          }
        }
        await store.add('trainingSubmissions', {
          employeeId: employee.id,
          name: employee.name,
          quizId: quiz.id,
          submittedAt: new Date().toISOString(),
          timedOut: !!state.timedOut,
          tabSwitchCount: state.tabSwitchCount,
          tabAwaySeconds: state.tabAwaySeconds,
          answers,
        });
        showToast('Quiz submitted.', 'good');
        showList();
      } catch (err) {
        window.alert(err.message || 'Could not save your submission. Please try again.');
        submitBtn.removeAttribute('disabled');
        submitBtn.textContent = 'Submit';
      }
    }

    renderScreen();
  }

  showList();
}
