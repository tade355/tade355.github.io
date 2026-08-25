import { store } from '../store.js';
import { supabase } from '../supabaseClient.js';
import { el } from '../utils.js';
import { renderTable, statusPill, sectionHeader, openCustomModal, confirmDelete, showToast } from '../ui.js';
import { getCurrentUser, getCurrentTier, filterTrainingSubmissions } from '../session.js';

const QUESTIONS = [
  { num: 1, key: 'a1', label: "Where does the COO's Office sit in Emagrims' structure, and who does the COO report to?" },
  { num: 2, key: 'a2', label: "Name two of the Company's core expectations for staff conduct (Section 25)." },
  {
    num: 3,
    key: null,
    video: true,
    label: 'Scenario: you notice a colleague appears to be falsifying a report.',
    hint: 'Explain out loud what the Whistleblower Policy says you should do, and whether you can be punished for reporting it in good faith even if you turn out to be wrong.',
  },
  { num: 4, key: 'a4', label: 'In your own words: what is your actual role and title, and who is your direct supervisor during training?' },
  { num: 5, key: 'a5', label: 'How long is your initial training period, and what happens at the end of it?' },
  { num: 6, key: 'a6', label: 'Give one example of something you should always get approval for before acting, and one example of something you can take initiative on yourself.' },
  { num: 7, key: 'a7', label: "What's one thing from yesterday's reading you found unclear or would like explained further?" },
];

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

function viewSubmission(record) {
  openCustomModal({
    title: employeeName(record.employeeId),
    wide: true,
    build: (modalContainer) => {
      const when = record.submittedAt ? new Date(record.submittedAt).toLocaleString('en-GB') : '—';
      modalContainer.appendChild(el('p', { class: 'section-subtitle' }, `Submitted ${when}${record.timedOut ? ' · timed out before finishing' : ''}`));
      const answers = record.answers || {};
      QUESTIONS.forEach((q) => {
        const block = el('div', { class: 'quiz-summary-block' }, [el('div', { class: 'field-label' }, `Question ${q.num} — ${q.label}`)]);
        if (q.video) {
          if (record.videoUrl) {
            const video = el('video', { controls: 'controls', style: 'width: 100%; max-width: 420px; border-radius: 6px; margin-top: 0.5rem;' });
            video.src = record.videoUrl;
            block.appendChild(video);
          } else {
            block.appendChild(el('p', { style: 'margin: 0.4rem 0 0;' }, 'Not recorded.'));
          }
        } else {
          block.appendChild(el('p', { style: 'white-space: pre-wrap; margin: 0.4rem 0 0;' }, answers[q.key] || 'No answer provided.'));
        }
        modalContainer.appendChild(block);
      });
    },
  });
}

export function renderTraining(container) {
  container.innerHTML = '';

  const actionSlot = el('div');
  container.appendChild(sectionHeader(
    'Day 1 Knowledge Check',
    'Seven short questions on the Manual and your Training Plan — written answers, plus one short recorded answer.',
    actionSlot,
  ));

  const body = el('div');
  container.appendChild(body);

  function showList() {
    actionSlot.innerHTML = '';
    actionSlot.appendChild(el('button', { class: 'btn btn-primary', type: 'button', onClick: () => showQuiz() }, '+ Take the Check'));
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
    renderTable(tableContainer, {
      columns: [
        { key: 'employeeId', label: 'Employee', render: (r) => employeeName(r.employeeId) },
        { key: 'submittedAt', label: 'Submitted', render: (r) => (r.submittedAt ? new Date(r.submittedAt).toLocaleString('en-GB') : '—') },
        { key: 'timedOut', label: 'Status', render: (r) => statusPill(r.timedOut ? 'Timed Out' : 'Completed') },
        { key: 'videoRecorded', label: 'Video (Q3)', render: (r) => statusPill(r.videoRecorded ? 'Recorded' : 'Not Recorded') },
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
      emptyText: (tier === 'Admin' || tier === 'Accounts' || tier === 'Supervisor')
        ? 'No submissions yet.'
        : 'You haven’t taken the check yet — click "Take the Check" above to begin.',
    });
  }

  // ---------------- Quiz-taking flow ----------------

  function showQuiz() {
    const employee = getCurrentUser();
    if (!employee) {
      window.alert('No employee record is linked to this login. Contact an admin before taking the check.');
      return;
    }

    let stream = null;
    let mediaRecorder = null;
    let recordedChunks = [];
    let recording = false;
    let timerInterval = null;
    let recInterval = null;

    const state = {
      step: 'intro',
      answers: { a1: '', a2: '', a4: '', a5: '', a6: '', a7: '' },
      videoBlob: null,
      recSeconds: 0,
      totalSeconds: TOTAL_SECONDS,
      timedOut: false,
    };

    function stopMediaStream() {
      if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; }
    }

    function cleanup() {
      if (timerInterval) clearInterval(timerInterval);
      if (recInterval) clearInterval(recInterval);
      stopMediaStream();
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
      top.appendChild(el('span', { class: 'quiz-progress' }, `Question ${state.step} of 7`));
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
        const q = QUESTIONS.find((qq) => qq.num === state.step);
        screen.appendChild(q.video ? renderVideoQuestion(q) : renderTextQuestion(q));
      }
    }

    function renderIntro() {
      return el('div', {}, [
        el('p', { class: 'section-subtitle' }, `Signed in as ${employee.name}`),
        el('h3', { class: 'subsection-title', style: 'margin-top: 0.75rem;' }, "Let's see what stuck from Day 1."),
        el('p', {}, 'Seven short questions on the Manual and your Training Plan. One of them asks for a short recorded answer instead of typed text. Answer in your own words — this isn’t about perfect phrasing, it’s about whether it makes sense to you.'),
        el('ul', { class: 'quiz-notice' }, [
          el('li', {}, [el('strong', {}, '20 minutes'), ', once you start. The clock keeps running even if you switch tabs.']),
          el('li', {}, [el('strong', {}, 'Question 3'), ' needs your camera and microphone — you’ll be asked for permission when you reach it.']),
          el('li', {}, 'Everything saves automatically when you finish — your written answers and your video.'),
        ]),
        el('button', { class: 'btn btn-primary', type: 'button', onClick: () => { state.step = 1; startTimer(); renderScreen(); } }, 'Begin'),
      ]);
    }

    function renderTextQuestion(q) {
      const textarea = el('textarea', { name: q.key, placeholder: 'Type your answer here…' });
      textarea.value = state.answers[q.key] || '';
      textarea.addEventListener('input', () => { state.answers[q.key] = textarea.value; });

      const isLast = q.num === 7;
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

      const nextBtn = el('button', { class: 'btn btn-primary', type: 'button' }, 'Next');
      if (!state.videoBlob) nextBtn.setAttribute('disabled', 'disabled');
      const backBtn = el('button', { class: 'btn btn-ghost', type: 'button', onClick: () => { state.step = q.num - 1; renderScreen(); } }, 'Back');

      if (state.videoBlob) {
        playbackVideo.src = URL.createObjectURL(state.videoBlob);
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
            state.videoBlob = new Blob(recordedChunks, { type: mimeType });
            playbackVideo.src = URL.createObjectURL(state.videoBlob);
            playbackVideo.style.display = 'block';
            liveVideo.style.display = 'none';
            btnRetake.style.display = 'inline-flex';
            nextBtn.removeAttribute('disabled');
          };
          mediaRecorder.start();
          recording = true;
          state.recSeconds = 0;
          recIndicator.classList.add('on');
          recClock.style.display = 'block';
          btnRecord.textContent = 'Stop recording';
          recInterval = setInterval(() => {
            state.recSeconds++;
            recClock.textContent = fmt(state.recSeconds);
            if (state.recSeconds >= MAX_REC_SECONDS) btnRecord.click();
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
        state.videoBlob = null;
        playbackVideo.style.display = 'none';
        liveVideo.style.display = 'block';
        btnRetake.style.display = 'none';
        btnRecord.style.display = 'inline-flex';
        btnRecord.textContent = 'Start recording';
        nextBtn.setAttribute('disabled', 'disabled');
      });

      nextBtn.addEventListener('click', () => { state.step = q.num + 1; renderScreen(); });

      return el('div', {}, [
        el('p', { class: 'quiz-question' }, q.label),
        el('p', { class: 'quiz-hint' }, q.hint),
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
      QUESTIONS.forEach((q) => {
        const block = el('div', { class: 'quiz-summary-block' }, [el('div', { class: 'field-label' }, `Question ${q.num} — ${q.label}`)]);
        if (q.video) {
          block.appendChild(el('p', { style: 'margin: 0.4rem 0 0;' }, state.videoBlob ? `✓ Video recorded (${state.recSeconds}s)` : 'No video recorded'));
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
        let videoUrl = null;
        if (state.videoBlob) {
          const fileName = `q3_${Date.now()}_${employee.id}.webm`;
          const { error: uploadError } = await supabase.storage.from('trainee-videos').upload(fileName, state.videoBlob, { contentType: state.videoBlob.type });
          if (uploadError) throw new Error(`Could not upload your video (${uploadError.message}).`);
          const { data: publicUrlData } = supabase.storage.from('trainee-videos').getPublicUrl(fileName);
          videoUrl = publicUrlData.publicUrl;
        }
        await store.add('trainingSubmissions', {
          employeeId: employee.id,
          name: employee.name,
          submittedAt: new Date().toISOString(),
          timedOut: !!state.timedOut,
          videoRecorded: !!state.videoBlob,
          videoDurationSeconds: state.recSeconds,
          videoUrl,
          answers: { ...state.answers },
        });
        showToast('Knowledge check submitted.', 'good');
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
