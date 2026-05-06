// exam-engine.js
// Requires EXAM_META and QUESTIONS defined as globals in the host HTML before this script loads.
//
// EXAM_META shape:
//   { code, title, heading, description, passPercent, suggestedMinutes, lang }
//
// QUESTIONS shape (single-select):
//   [{ q, options: string[], correct: number, explain }]
//
// QUESTIONS shape (multi-select):
//   [{ q, options: string[], correct: number[], explain }]

(function () {

  // ============ HELPERS ============
  const isMulti = q => Array.isArray(q.correct);

  function answerIsCorrect(answer, correct) {
    if (Array.isArray(correct)) {
      if (!Array.isArray(answer) || answer.length !== correct.length) return false;
      return answer.every((v, i) => v === correct[i]);
    }
    return answer === correct;
  }

  function isAnswered(idx) {
    const q = QUESTIONS[idx];
    if (isMulti(q)) return state.confirmed[idx];
    return state.answers[idx] !== null;
  }

  // ============ THEME ============
  // The anti-flicker attribute is set by the inline <script> in <head>.
  // Here we wire up the toggle button.
  const themeBtn = document.getElementById('theme-btn');
  function applyTheme(light) {
    if (light) {
      document.documentElement.setAttribute('data-theme', 'light');
      localStorage.setItem('oci-theme', 'light');
      themeBtn.textContent = '☀️';
    } else {
      document.documentElement.removeAttribute('data-theme');
      localStorage.setItem('oci-theme', 'dark');
      themeBtn.textContent = '🌙';
    }
  }
  const savedTheme = localStorage.getItem('oci-theme') || 'dark';
  themeBtn.textContent = savedTheme === 'light' ? '☀️' : '🌙';
  themeBtn.addEventListener('click', () => {
    applyTheme(document.documentElement.getAttribute('data-theme') !== 'light');
  });

  // ============ POPULATE META ============
  document.title = `Examen ${EXAM_META.code} — ${EXAM_META.title}`;
  document.getElementById('exam-code').textContent = `Oracle Certification // ${EXAM_META.code}`;
  document.getElementById('exam-title').textContent = EXAM_META.title;
  document.getElementById('exam-heading').innerHTML = EXAM_META.heading;
  document.getElementById('exam-description').textContent = EXAM_META.description;
  document.getElementById('stat-questions').textContent = QUESTIONS.length;
  document.getElementById('stat-minutes').textContent = EXAM_META.suggestedMinutes;
  document.getElementById('stat-pass').textContent = `${EXAM_META.passPercent}%`;
  document.getElementById('stat-lang').textContent = EXAM_META.lang;

  // ============ STATE ============
  function makeInitialState() {
    return {
      mode: 'practice',
      currentIdx: 0,
      answers: new Array(QUESTIONS.length).fill(null),    // null | number | number[]
      pending: QUESTIONS.map(() => new Set()),             // multi-select in-progress selections
      confirmed: new Array(QUESTIONS.length).fill(false), // multi-select confirmed flag
      startTime: null,
      timerInterval: null,
      finished: false
    };
  }
  let state = makeInitialState();

  // ============ ELEMENTS ============
  const $ = id => document.getElementById(id);
  const startScreen    = $('start-screen');
  const quizScreen     = $('quiz-screen');
  const resultsScreen  = $('results-screen');
  const questionContainer = $('question-container');
  const timerBox       = $('timer-box');

  // ============ MODE TOGGLE ============
  document.querySelectorAll('.mode-toggle button').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.mode-toggle button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.mode = btn.dataset.mode;
      $('mode-desc').textContent = state.mode === 'practice'
        ? 'Modo Práctica: muestra la respuesta correcta después de cada pregunta.'
        : 'Modo Examen: las respuestas se revelan solo al finalizar.';
    });
  });

  // ============ START ============
  $('start-btn').addEventListener('click', () => {
    startScreen.classList.add('hidden');
    quizScreen.classList.remove('hidden');
    timerBox.classList.remove('hidden');
    state.startTime = Date.now();
    state.timerInterval = setInterval(updateTimer, 1000);
    renderQuestion();
  });

  function updateTimer() {
    const elapsed = Math.floor((Date.now() - state.startTime) / 1000);
    const m = String(Math.floor(elapsed / 60)).padStart(2, '0');
    const s = String(elapsed % 60).padStart(2, '0');
    $('timer').textContent = `${m}:${s}`;
  }

  // ============ RENDER ============
  function renderQuestion() {
    const idx = state.currentIdx;
    const q = QUESTIONS[idx];
    if (isMulti(q)) {
      renderMultiQuestion(idx, q);
    } else {
      renderSingleQuestion(idx, q);
    }
    updateProgress();
    updateNav();
  }

  function renderSingleQuestion(idx, q) {
    const userAnswer = state.answers[idx];
    const showFeedback = state.mode === 'practice' && userAnswer !== null;

    questionContainer.innerHTML = `
      <article class="question-card">
        <div class="q-num">Pregunta ${String(idx + 1).padStart(2, '0')}</div>
        <h2 class="q-text">${q.q}</h2>
        <div class="options" role="radiogroup">
          ${q.options.map((opt, i) => {
            let cls = 'option';
            if (userAnswer === i) cls += ' selected';
            if (showFeedback) {
              cls += ' locked';
              if (i === q.correct) cls += ' correct';
              else if (userAnswer === i) cls += ' wrong';
            }
            const letter = String.fromCharCode(65 + i);
            return `<button class="${cls}" data-idx="${i}" ${showFeedback ? 'disabled' : ''}>
              <span class="option-letter">${letter}</span>
              <span>${opt}</span>
            </button>`;
          }).join('')}
        </div>
        <div class="feedback ${showFeedback ? 'show' : ''}">
          <strong>${userAnswer === q.correct ? '✓ Correcto.' : '✗ Incorrecto.'}</strong> ${q.explain}
        </div>
      </article>
    `;

    questionContainer.querySelectorAll('.option').forEach(btn => {
      btn.addEventListener('click', () => selectSingle(idx, parseInt(btn.dataset.idx)));
    });
  }

  function renderMultiQuestion(idx, q) {
    const confirmed = state.confirmed[idx];
    const pending = state.pending[idx];
    const answer = state.answers[idx];
    const numCorrect = q.correct.length;
    const showFeedback = state.mode === 'practice' && confirmed;
    const selectedSet = confirmed ? new Set(answer) : pending;

    questionContainer.innerHTML = `
      <article class="question-card">
        <div class="q-num">Pregunta ${String(idx + 1).padStart(2, '0')}</div>
        <h2 class="q-text">${q.q}</h2>
        <p class="multi-hint">Selecciona <strong>${numCorrect}</strong> opciones correctas</p>
        <div class="options" role="group">
          ${q.options.map((opt, i) => {
            const sel = selectedSet.has(i);
            let cls = 'option option-check';
            if (sel) cls += ' selected';
            if (confirmed) {
              cls += ' locked';
              if (q.correct.includes(i)) cls += ' correct';
              else if (sel) cls += ' wrong';
            }
            const letter = String.fromCharCode(65 + i);
            return `<button class="${cls}" data-idx="${i}" ${confirmed ? 'disabled' : ''}>
              <span class="option-letter">${sel && !confirmed ? '✓' : letter}</span>
              <span>${opt}</span>
            </button>`;
          }).join('')}
        </div>
        ${!confirmed ? `
        <div style="margin-top:16px;text-align:center;">
          <button class="btn btn-primary" id="confirm-multi-btn" ${pending.size < numCorrect ? 'disabled' : ''}>
            Confirmar selección (${pending.size} / ${numCorrect})
          </button>
        </div>` : ''}
        <div class="feedback ${showFeedback ? 'show' : ''}">
          <strong>${answerIsCorrect(answer, q.correct) ? '✓ Correcto.' : '✗ Incorrecto.'}</strong> ${q.explain}
        </div>
      </article>
    `;

    if (!confirmed) {
      questionContainer.querySelectorAll('.option-check').forEach(btn => {
        btn.addEventListener('click', () => toggleMulti(idx, parseInt(btn.dataset.idx), numCorrect));
      });
      const confirmBtn = $('confirm-multi-btn');
      if (confirmBtn) {
        confirmBtn.addEventListener('click', () => confirmMulti(idx));
      }
    }
  }

  function selectSingle(idx, optionIdx) {
    if (state.mode === 'practice' && state.answers[idx] !== null) return;
    state.answers[idx] = optionIdx;
    renderQuestion();
  }

  function toggleMulti(idx, optionIdx, numCorrect) {
    const pending = state.pending[idx];
    if (pending.has(optionIdx)) {
      pending.delete(optionIdx);
    } else if (pending.size < numCorrect) {
      pending.add(optionIdx);
    }
    renderMultiQuestion(idx, QUESTIONS[idx]);
    updateProgress();
  }

  function confirmMulti(idx) {
    const q = QUESTIONS[idx];
    const pending = state.pending[idx];
    if (pending.size < q.correct.length) return;
    state.answers[idx] = [...pending].sort((a, b) => a - b);
    state.confirmed[idx] = true;
    renderQuestion();
  }

  function updateProgress() {
    const idx = state.currentIdx;
    const total = QUESTIONS.length;
    const answered = QUESTIONS.reduce((count, q, i) => count + (isAnswered(i) ? 1 : 0), 0);
    $('progress-text').textContent = `${String(idx + 1).padStart(2, '0')} / ${total}`;
    $('answered-count').textContent = `${answered} respondidas`;
    $('progress-fill').style.right = `${100 - ((idx + 1) / total * 100)}%`;
  }

  function updateNav() {
    $('prev-btn').disabled = state.currentIdx === 0;
    const isLast = state.currentIdx === QUESTIONS.length - 1;
    $('next-btn').textContent = isLast ? 'Finalizar →' : 'Siguiente →';
  }

  // ============ NAV ============
  $('prev-btn').addEventListener('click', () => {
    if (state.currentIdx > 0) {
      state.currentIdx--;
      renderQuestion();
    }
  });

  $('next-btn').addEventListener('click', () => {
    if (state.currentIdx < QUESTIONS.length - 1) {
      state.currentIdx++;
      renderQuestion();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      finishExam();
    }
  });

  $('finish-btn').addEventListener('click', () => {
    if (state.finished) {
      quizScreen.classList.add('hidden');
      resultsScreen.classList.remove('hidden');
      $('finish-btn').textContent = 'Finalizar examen';
      return;
    }
    const unanswered = QUESTIONS.reduce((count, q, i) => count + (isAnswered(i) ? 0 : 1), 0);
    if (unanswered > 0) {
      if (!confirm(`Tienes ${unanswered} preguntas sin responder. ¿Finalizar de todos modos?`)) return;
    }
    finishExam();
  });

  // ============ FINISH ============
  function finishExam() {
    state.finished = true;
    clearInterval(state.timerInterval);
    quizScreen.classList.add('hidden');
    resultsScreen.classList.remove('hidden');
    $('finish-btn').textContent = 'Finalizar examen';

    const correctCount = QUESTIONS.reduce((count, q, i) => {
      return count + (answerIsCorrect(state.answers[i], q.correct) ? 1 : 0);
    }, 0);
    const percent = Math.round((correctCount / QUESTIONS.length) * 100);

    $('score-percent').textContent = `${percent}%`;
    $('score-fraction').textContent = `${correctCount} / ${QUESTIONS.length} correctas`;

    const verdictEl = $('verdict');
    if (percent >= EXAM_META.passPercent) {
      verdictEl.textContent = '— Aprobado —';
      verdictEl.className = 'score-verdict verdict-pass';
    } else {
      verdictEl.textContent = '— Sigue practicando —';
      verdictEl.className = 'score-verdict verdict-fail';
    }

    const grid = $('review-grid');
    grid.innerHTML = QUESTIONS.map((q, i) => {
      let cls = 'review-cell';
      if (!isAnswered(i)) cls += ' skipped';
      else if (answerIsCorrect(state.answers[i], q.correct)) cls += ' correct';
      else cls += ' wrong';
      return `<div class="${cls}" data-idx="${i}">${i + 1}</div>`;
    }).join('');

    grid.querySelectorAll('.review-cell').forEach(cell => {
      cell.addEventListener('click', () => {
        state.currentIdx = parseInt(cell.dataset.idx);
        state.mode = 'practice';
        resultsScreen.classList.add('hidden');
        quizScreen.classList.remove('hidden');
        renderQuestion();
        $('finish-btn').textContent = '← Resultados';
      });
    });

    timerBox.classList.add('hidden');
  }

  $('review-btn').addEventListener('click', () => {
    state.currentIdx = 0;
    state.mode = 'practice';
    resultsScreen.classList.add('hidden');
    quizScreen.classList.remove('hidden');
    renderQuestion();
    $('finish-btn').textContent = '← Resultados';
  });

  $('restart-btn').addEventListener('click', () => {
    if (!confirm('¿Reiniciar el examen? Se perderán todas las respuestas actuales.')) return;
    clearInterval(state.timerInterval);
    state = makeInitialState();
    document.querySelectorAll('.mode-toggle button').forEach(b => b.classList.remove('active'));
    document.querySelector('.mode-toggle button[data-mode="practice"]').classList.add('active');
    $('mode-desc').textContent = 'Modo Práctica: muestra la respuesta correcta después de cada pregunta.';
    resultsScreen.classList.add('hidden');
    quizScreen.classList.add('hidden');
    startScreen.classList.remove('hidden');
    timerBox.classList.add('hidden');
    $('finish-btn').textContent = 'Finalizar examen';
  });

})();
