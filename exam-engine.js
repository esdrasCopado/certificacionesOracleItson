// exam-engine.js
// Requires EXAM_META and QUESTIONS defined as globals in the host HTML before this script loads.
//
// EXAM_META shape:
//   { code, title, heading, description, passPercent, suggestedMinutes, lang }
//
// QUESTIONS shape:
//   [{ q, options: string[], correct: number, explain }]

(function () {

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
  let state = {
    mode: 'practice',
    currentIdx: 0,
    answers: new Array(QUESTIONS.length).fill(null),
    startTime: null,
    timerInterval: null,
    finished: false
  };

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
      btn.addEventListener('click', () => selectAnswer(parseInt(btn.dataset.idx)));
    });

    updateProgress();
    updateNav();
  }

  function selectAnswer(optionIdx) {
    const idx = state.currentIdx;
    if (state.mode === 'practice' && state.answers[idx] !== null) return;
    state.answers[idx] = optionIdx;
    renderQuestion();
  }

  function updateProgress() {
    const idx = state.currentIdx;
    const total = QUESTIONS.length;
    const answered = state.answers.filter(a => a !== null).length;
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
    const unanswered = state.answers.filter(a => a === null).length;
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

    const correctCount = state.answers.filter((a, i) => a === QUESTIONS[i].correct).length;
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
    grid.innerHTML = QUESTIONS.map((_, i) => {
      const a = state.answers[i];
      let cls = 'review-cell';
      if (a === null) cls += ' skipped';
      else if (a === QUESTIONS[i].correct) cls += ' correct';
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
    state = {
      mode: 'practice',
      currentIdx: 0,
      answers: new Array(QUESTIONS.length).fill(null),
      startTime: null,
      timerInterval: null,
      finished: false
    };
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
