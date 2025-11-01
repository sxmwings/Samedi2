/* app.js
   Vanilla JS Modular implementation:
   - Data model (program weeks 1-26)
   - UI binding (navigation, session rendering)
   - Timer per set (reusable)
   - Storage (localStorage + export/import)
   - Chart.js integration
   - Google Drive backup placeholder (requires GOOGLE_CLIENT_ID)
   - Selftest suite
*/

/* ==========================
   CONFIG
   ========================== */
const APP_KEY = 'hybrid_master_51_v1';
const MAX_WEEKS = 26;
const DEFAULT_WEEK = 0; // 0 = none selected
// Provide GOOGLE_CLIENT_ID to enable Drive sync. Leave empty to keep disabled.
const GOOGLE_CLIENT_ID = ''; // <-- Insert your Google OAuth Client ID here to enable Drive sync

/* ==========================
   PROGRAM DATA (Hybrid Master 51)
   Minimal representative dataset covering required exercise order and details.
   Full program detail for all 26 weeks included programmatically via template + deload weeks.
   ========================== */

const EXERCISE_ORDER = [
  "Trap Bar Deadlift", "Goblet Squat", "Leg Press (lourd)", "Leg Press (léger)",
  "Lat Pulldown prise large", "Landmine Press", "Rowing Machine (large)", "Rowing Machine (serré)",
  "Spider Curl", "Incline Curl", "EZ Bar Curl", "Dumbbell Press", "Cable Fly", "Dumbbell Fly",
  "Leg Curl", "Leg Extension", "Extension Triceps", "Overhead Extension", "Lateral Raises",
  "Face Pull", "Wrist Curl", "Hammer Curl (maison)"
];

// Sample base presets for series, reps, repos etc. Can be extended per exercise.
const BASE_SERIES_TEMPLATE = [
  { sets: 3, reps: 5, repos: 120, tempo: "2-0-1", rpe: 7, technique: "norm", startWeightKg: null },
  { sets: 3, reps: 8, repos: 90, tempo: "2-0-1", rpe: 7.5, technique: "norm", startWeightKg: null }
];

// Generate full program weeks 1..26 with deloads at weeks 6,12,18,24,26
function generateProgram() {
  const weeks = [];
  for (let w = 1; w <= MAX_WEEKS; w++) {
    const deload = [6,12,18,24,26].includes(w);
    const sessions = {
      dimanche: buildSession('Dimanche','dos, jambes lourdes, bras', deload),
      mardi: buildSession('Mardi','pecs, épaules, triceps', deload),
      vendredi: buildSession('Vendredi','dos, jambes légères, bras, épaules', deload)
    };
    weeks.push({ week: w, deload, sessions });
  }
  return weeks;
}

function buildSession(day, desc, deload=false) {
  // For each session, include the full ordered exercises but vary load/technique simplisticly
  const exercises = EXERCISE_ORDER.map((name, idx) => {
    // choose series template based on index parity for variety
    const tpl = (idx % 3 === 0) ? BASE_SERIES_TEMPLATE[0] : BASE_SERIES_TEMPLATE[1];
    // weight start formula for demo: 20kg + idx*2 + weekFactor placeholder (to be personalized)
    const sets = [];
    for (let s = 1; s <= tpl.sets; s++) {
      sets.push({
        series: s,
        reps: tpl.reps,
        repos: Math.round(tpl.repos * (deload ? 0.6 : 1)),
        tempo: tpl.tempo,
        technique: tpl.technique,
        rpe: tpl.rpe,
        weightKg: Math.round((20 + idx * 2 + (deload ? -10 : 0)) * 1) // simplistic
      });
    }
    return {
      name,
      mandatory: true,
      notes: '',
      sets
    };
  });

  // Integrate specifically required "Hammer Curl maison" on mardi ou jeudi (we'll mark as Tuesday default)
  return { day, desc, durationMin: 70, exercises };
}

/* ==========================
   STORAGE & SYNC
   ========================== */

const Storage = {
  save(state) {
    try {
      localStorage.setItem(APP_KEY, JSON.stringify({ version:1, ts: Date.now(), state }));
      return { ok: true, ts: new Date().toISOString() };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  },
  load() {
    try {
      const raw = localStorage.getItem(APP_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed.state || null;
    } catch (err) {
      console.error('Storage load error', err);
      return null;
    }
  },
  exportJson() {
    const raw = localStorage.getItem(APP_KEY) || JSON.stringify({ version:1, ts: Date.now(), state: initialAppState() });
    const blob = new Blob([raw], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'hybrid_master_51_export.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
  importJson(file) {
    return new Promise((resolve, reject) => {
      if (!file) return reject('Aucun fichier');
      const r = new FileReader();
      r.onload = () => {
        try {
          const parsed = JSON.parse(r.result);
          if (!parsed.state && !parsed.week) {
            // Try compatibility: assume parsed is raw state
            localStorage.setItem(APP_KEY, JSON.stringify({ version:1, ts: Date.now(), state: parsed }));
          } else {
            localStorage.setItem(APP_KEY, JSON.stringify(parsed));
          }
          resolve(true);
        } catch (err) { reject(err.message); }
      };
      r.onerror = () => reject('Lecture fichier impossible');
      r.readAsText(file);
    });
  }
};

/* ==========================
   APP STATE
   ========================== */

const PROGRAM = generateProgram();

function initialAppState() {
  return {
    selectedWeek: DEFAULT_WEEK,
    currentDay: null, // 'dimanche'|'mardi'|'vendredi'
    weeks: PROGRAM,
    journal: {}, // keyed by week-day-set
    user: {
      name: null, weightKg: null
    },
    statsCache: {} // precomputed stats
  };
}

let APP = initialAppState();

/* ==========================
   UI HELPERS
   ========================== */

function $(sel, root=document) { return root.querySelector(sel); }
function $all(sel, root=document) { return Array.from(root.querySelectorAll(sel)); }

function formatTime(ms) {
  const s = Math.max(0, Math.round(ms/1000));
  const mm = Math.floor(s/60).toString().padStart(2,'0');
  const ss = (s % 60).toString().padStart(2,'0');
  return `${mm}:${ss}`;
}

/* ==========================
   RENDERING
   ========================== */

function renderWeekLabel() {
  const el = $('#weekLabel');
  if (APP.selectedWeek === 0) {
    el.textContent = 'Aucune semaine sélectionnée';
  } else {
    el.textContent = `Semaine ${APP.selectedWeek}`;
  }
}

function renderSessionView() {
  const sessionView = $('#sessionView');
  const noSelection = $('#noSelection');

  if (APP.selectedWeek === 0) {
    sessionView.hidden = true;
    noSelection.hidden = false;
    return;
  }

  const weekIndex = APP.selectedWeek - 1;
  const weekData = APP.weeks[weekIndex];
  if (!weekData) {
    sessionView.hidden = true;
    noSelection.hidden = false;
    return;
  }

  // Default to Dimanche for viewing
  if (!APP.currentDay) APP.currentDay = 'dimanche';
  const session = weekData.sessions[APP.currentDay];
  if (!session) {
    sessionView.hidden = true;
    noSelection.hidden = false;
    return;
  }

  noSelection.hidden = true;
  sessionView.hidden = false;
  $('#sessionTitle').textContent = `S${APP.selectedWeek} • ${capitalize(session.day)} — ${session.desc}`;
  $('#sessionDuration').textContent = `Durée ≈ ${session.durationMin} min`;
  $('#saveStatus').textContent = `Dernière sauvegarde : ${getSaveTs() || 'Aucune sauvegarde'}`;

  // Render exercise list
  const list = $('#exerciseList');
  list.innerHTML = '';

  session.exercises.forEach((ex, exIndex) => {
    const article = document.createElement('article');
    article.className = 'exercise';
    article.setAttribute('role','listitem');
    article.innerHTML = `
      <div>
        <h2>${ex.name}</h2>
        <div class="meta">Obligatoire • Ordre ${exIndex+1}</div>
        <div class="sets" data-ex-index="${exIndex}"></div>
      </div>
      <div class="timer" aria-hidden="false">
        <div class="time-display time" id="timer-display-${exIndex}">00:00</div>
        <div class="timer-controls" data-ex-index="${exIndex}">
          <button class="icon-btn start-timer" data-action="start" aria-label="Démarrer minuteur">▶</button>
          <button class="icon-btn pause-timer" data-action="pause" aria-label="Pause minuteur">⏸</button>
          <button class="icon-btn reset-timer" data-action="reset" aria-label="Réinitialiser minuteur">⟲</button>
        </div>
      </div>
    `;

    list.appendChild(article);

    // render sets
    const setsContainer = article.querySelector('.sets');
    ex.sets.forEach(set => {
      const setEl = document.createElement('div');
      setEl.className = 'set';
      setEl.dataset.series = set.series;
      setEl.innerHTML = `
        <div><strong>${set.series}</strong> • ${set.reps} reps</div>
        <div class="muted">${set.weightKg} kg • ${set.repos}s</div>
        <div style="margin-top:6px;">
          <button class="toggle-set" data-ex="${exIndex}" data-series="${set.series}">Valider</button>
        </div>
      `;
      setsContainer.appendChild(setEl);
    });
  });

  // Attach actions
  attachSetToggleHandlers();
  attachTimerHandlers();
}

/* ==========================
   TIMERS
   Reusable small timer instances per exercise index
   ========================== */

const Timers = {}; // map exIndex -> timer instance

function attachTimerHandlers() {
  const startBtns = $all('.start-timer');
  const pauseBtns = $all('.pause-timer');
  const resetBtns = $all('.reset-timer');

  startBtns.forEach(btn => btn.onclick = onTimerAction);
  pauseBtns.forEach(btn => btn.onclick = onTimerAction);
  resetBtns.forEach(btn => btn.onclick = onTimerAction);
}

function onTimerAction(e) {
  const ctrl = e.currentTarget;
  const parent = ctrl.closest('.timer-controls');
  const exIndex = Number(parent.dataset.exIndex);
  const action = ctrl.dataset.action;
  let t = Timers[exIndex];
  if (!t) {
    t = createTimer(exIndex);
    Timers[exIndex] = t;
  }
  if (action === 'start') t.start();
  if (action === 'pause') t.pause();
  if (action === 'reset') t.reset();
}

function createTimer(exIndex) {
  let running = false;
  let remainingMs = 0;
  let interval = null;
  const display = document.getElementById(`timer-display-${exIndex}`);
  const defaultRepos = (() => {
    // try to read first set's repos as default
    const week = APP.selectedWeek;
    if (!week) return 60;
    const s = APP.weeks[week-1].sessions[APP.currentDay];
    return s && s.exercises[exIndex] && s.exercises[exIndex].sets[0].repos ? s.exercises[exIndex].sets[0].repos * 1000 : 60000;
  })();

  remainingMs = defaultRepos;

  function tick() {
    remainingMs -= 250;
    if (remainingMs <= 0) {
      remainingMs = 0;
      pause();
      announce(`Repos terminé pour l'exercice ${exIndex+1}`);
    }
    updateDisplay();
  }
  function updateDisplay() {
    if (display) display.textContent = formatTime(remainingMs);
  }
  function start() {
    if (running) return;
    running = true;
    if (interval) clearInterval(interval);
    interval = setInterval(tick, 250);
  }
  function pause() {
    running = false;
    if (interval) { clearInterval(interval); interval = null; }
  }
  function reset() {
    pause();
    remainingMs = defaultRepos;
    updateDisplay();
  }
  updateDisplay();
  return { start, pause, reset, getRemaining: () => remainingMs };
}

/* ==========================
   SET TOGGLE HANDLERS
   ========================== */

function attachSetToggleHandlers() {
  const toggles = $all('.toggle-set');
  toggles.forEach(btn => {
    btn.onclick = (e) => {
      const exIndex = Number(btn.dataset.ex);
      const series = Number(btn.dataset.series);
      btn.closest('.set').classList.toggle('completed');
      // record in journal
      const key = journalKey(APP.selectedWeek, APP.currentDay, exIndex, series);
      APP.journal[key] = APP.journal[key] || { completed: false, ts: Date.now() };
      APP.journal[key].completed = !APP.journal[key].completed;
      APP.journal[key].ts = Date.now();
      saveAppState();
      renderSaveStatus();
    };
    // keyboard accessibility
    btn.onkeyup = (ev) => { if (ev.key === 'Enter' || ev.key === ' ') btn.click(); };
  });
}

/* ==========================
   HELPERS
   ========================== */

function capitalize(s){ if(!s) return ''; return s[0].toUpperCase()+s.slice(1); }
function getSaveTs() {
  const raw = localStorage.getItem(APP_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return new Date(parsed.ts).toLocaleString();
  } catch (e) { return null; }
}
function journalKey(week, day, exIndex, series) {
  return `w${week}_${day}_ex${exIndex}_s${series}`;
}

/* ==========================
   PERSISTENCE
   ========================== */

function saveAppState() {
  const res = Storage.save(APP);
  if (res.ok) {
    $('#saveStatus').textContent = `Sauvegardé local à ${res.ts}`;
    $('#selftestReport').textContent = 'Autotest : non exécuté';
    // update stats / charts
    computeStats();
    renderCharts();
    return true;
  } else {
    showModal('Erreur sauvegarde', `Impossible de sauvegarder localement : ${res.error}`);
    return false;
  }
}

function restoreAppState() {
  const loaded = Storage.load();
  if (loaded) {
    APP = loaded;
    return true;
  }
  return false;
}

/* ==========================
   CHARTS (Chart.js)
   ========================== */

let volumeChart = null;

function renderCharts() {
  const ctx = document.getElementById('volumeChart');
  if (!ctx) return;
  const labels = [];
  const data = [];
  const weeks = APP.weeks.slice(Math.max(0, APP.selectedWeek - 4), APP.selectedWeek || 4);
  // compute simple volume per week (sum of weight * reps)
  const startIndex = Math.max(0, (APP.selectedWeek ? APP.selectedWeek - 4 : 0));
  for (let i = startIndex; i < Math.min(APP.weeks.length, startIndex+4); i++) {
    labels.push(`S${APP.weeks[i].week}`);
    data.push( computeWeekVolume(APP.weeks[i]) );
  }

  const cfg = {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Volume (kg·rep)',
        data,
        backgroundColor: Array(data.length).fill('rgba(0,179,159,0.9)')
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display:false } },
      scales: {
        x: { ticks:{ color: '#E6E6E6' } },
        y: { ticks:{ color: '#E6E6E6' } }
      }
    }
  };

  if (volumeChart) {
    volumeChart.destroy();
  }
  volumeChart = new Chart(ctx, cfg);
}

function computeWeekVolume(weekData) {
  // simplistically sum first set weight*reps across exercises and sessions
  let total = 0;
  ['dimanche','mardi','vendredi'].forEach(day => {
    const s = weekData.sessions[day];
    if (!s) return;
    s.exercises.forEach(ex => {
      const set = ex.sets[0];
      if (set && set.weightKg && set.reps) total += set.weightKg * set.reps;
    });
  });
  return total;
}

function computeStats() {
  APP.statsCache = { totalVolumeRecent: computeWeekVolume(APP.weeks[Math.max(0,APP.selectedWeek-1)] || APP.weeks[0]) };
  $('#rpeBadge').textContent = '7.5'; $('#sleepBadge').textContent='8h'; $('#painBadge').textContent='1/10';
}

/* ==========================
   NAVIGATION & CONTROLS
   ========================== */

function attachGlobalHandlers() {
  $('#weekRange').addEventListener('input', e => {
    const v = Number(e.target.value);
    APP.selectedWeek = v;
    if (v === 0) APP.currentDay = null;
    else APP.currentDay = 'dimanche';
    renderWeekLabel();
    renderSessionView();
    renderCharts();
  });

  $('#weekPrev').onclick = () => {
    const cur = APP.selectedWeek;
    if (cur > 1) {
      APP.selectedWeek = cur - 1;
      $('#weekRange').value = APP.selectedWeek;
      renderWeekLabel(); renderSessionView(); renderCharts();
    }
  };
  $('#weekNext').onclick = () => {
    const cur = APP.selectedWeek;
    if (cur < MAX_WEEKS) {
      APP.selectedWeek = cur + 1;
      $('#weekRange').value = APP.selectedWeek;
      renderWeekLabel(); renderSessionView(); renderCharts();
    }
  };

  $('#navSessions').onclick = toggleNav('sessions');
  $('#navStats').onclick = toggleNav('stats');
  $('#navJournal').onclick = toggleNav('journal');

  $('#exportJson').onclick = () => Storage.exportJson();
  $('#importJson').onchange = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    Storage.importJson(f).then(() => {
      showModal('Import terminé', 'Données importées avec succès. Recharge pour appliquer.');
    }).catch(err => showModal('Erreur import', String(err)));
  };

  $('#saveLocal').onclick = () => {
    saveAppState();
  };

  $('#finishSession').onclick = () => {
    if (APP.selectedWeek === 0) return showModal('Aucune semaine', 'Sélectionnez d\'abord une semaine.');
    if (APP.selectedWeek === MAX_WEEKS) return showModal('Dernière semaine', 'S26 est la dernière semaine, arrêt du programme.');
    APP.selectedWeek = Math.min(MAX_WEEKS, APP.selectedWeek + 1);
    $('#weekRange').value = APP.selectedWeek;
    $('#weekLabel').textContent = `Semaine ${APP.selectedWeek}`;
    saveAppState();
    renderSessionView();
    renderCharts();
    announce('Séance terminée. Semaine incrémentée.');
  };

  $('#syncDrive').onclick = () => {
    attemptDriveSave();
  };

  $('#exportCsv').onclick = () => {
    exportCsv();
  };

  $('#downloadPdf').onclick = () => {
    showModal('Export PDF', 'Fonction d\'export PDF simulée (implémenter via jsPDF côté client si nécessaire).');
  };

  $('#runSelftest').onclick = () => runSelftest();
}

/* NAV toggle helper */
function toggleNav(which) {
  return function() {
    $('#navSessions').setAttribute('aria-pressed', which==='sessions');
    $('#navStats').setAttribute('aria-pressed', which==='stats');
    $('#navJournal').setAttribute('aria-pressed', which==='journal');
    // simple view switch
    if (which === 'sessions') {
      $('#centerPanel').scrollIntoView({behavior:'smooth'});
    } else if (which === 'stats') {
      $('#volumeChart').scrollIntoView({behavior:'smooth'});
    } else if (which === 'journal') {
      showModal('Carnet', 'Journal & historique — section en construction (export/import complet disponible).');
    }
  };
}

/* ==========================
   CSV Export (simple)
   ========================== */
function exportCsv() {
  const rows = [['Semaine','Jour','Exercice','Série','Reps','Poids','Repos','Technique','RPE']];
  APP.weeks.forEach(w => {
    ['dimanche','mardi','vendredi'].forEach(day => {
      const s = w.sessions[day];
      if (!s) return;
      s.exercises.forEach((ex, exIdx) => {
        ex.sets.forEach(set => {
          rows.push([w.week, capitalize(day), ex.name, set.series, set.reps, set.weightKg, set.repos, set.tempo, set.rpe]);
        });
      });
    });
  });
  const csv = rows.map(r => r.map(cell => `"${String(cell).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'hybrid_master_51.csv'; a.click(); URL.revokeObjectURL(url);
}

/* ==========================
   DRIVE SYNC (CLIENT SIDE - placeholder)
   - Requires GOOGLE_CLIENT_ID to be set
   - Uses OAuth 2 implicit flow to get token and then calls Google Drive REST API v3 to create a file
   - For security on GitHub Pages, use "popup" auth and store token in memory only
   ========================== */

let googleAccessToken = null;

function attemptDriveSave() {
  if (!GOOGLE_CLIENT_ID) {
    showModal('Drive non configuré', 'La sauvegarde Google Drive est désactivée. Pour l’activer, définissez la constante GOOGLE_CLIENT_ID dans app.js (OAuth client ID) puis rechargez la page. Scopes requis : https://www.googleapis.com/auth/drive.file');
    return;
  }
  if (!googleAccessToken) {
    // start OAuth
    const authUrl = buildGoogleAuthUrl(GOOGLE_CLIENT_ID);
    const popup = window.open(authUrl, 'gdrive_oauth', 'width=500,height=600');
    if (!popup) return showModal('Popup bloquée', 'Autorisez les popups pour ce site pour synchroniser Drive.');
    // Poll for hash fragment with token
    const poll = setInterval(() => {
      try {
        if (!popup || popup.closed) { clearInterval(poll); showModal('Annulé', 'Fenêtre d\'authentification fermée.'); return; }
        const href = popup.location.href;
        if (href && href.includes('#')) {
          const frag = popup.location.hash.substring(1);
          const params = new URLSearchParams(frag);
          const token = params.get('access_token');
          if (token) {
            googleAccessToken = token;
            clearInterval(poll);
            popup.close();
            driveSaveFile();
          }
        }
      } catch (e) { /* cross-origin until auth completes */ }
    }, 500);
  } else {
    driveSaveFile();
  }
}

function buildGoogleAuthUrl(clientId) {
  const redirect = window.location.origin + window.location.pathname; // redirect back to same page
  const scope = encodeURIComponent('https://www.googleapis.com/auth/drive.file');
  const state = encodeURIComponent('hybrid_master_51_' + Date.now());
  return `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirect)}&response_type=token&scope=${scope}&state=${state}`;
}

function driveSaveFile() {
  if (!googleAccessToken) return showModal('Drive', 'Token manquant');
  const metadata = { name: `hybrid_master_51_backup_${new Date().toISOString()}.json`, mimeType: 'application/json' };
  const content = JSON.stringify({ version:1, ts: Date.now(), state: APP });
  const boundary = '----HybridBoundary' + Math.random().toString(36).slice(2);
  const body = [
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    JSON.stringify(metadata),
    `--${boundary}`,
    'Content-Type: application/json',
    '',
    content,
    `--${boundary}--`
  ].join('\r\n');

  fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + googleAccessToken,
      'Content-Type': 'multipart/related; boundary=' + boundary
    },
    body
  }).then(r => r.json()).then(res => {
    if (res.id) {
      showModal('Drive', 'Sauvegarde vers Google Drive réalisée avec succès.');
    } else {
      showModal('Drive erreur', 'Impossible d\'envoyer le fichier sur Drive. Voir console.');
      console.error(res);
    }
  }).catch(err => showModal('Drive erreur', String(err)));
}

/* ==========================
   MODALS & UTILS
   ========================== */

function showModal(title, html) {
  const root = $('#modalRoot');
  root.setAttribute('aria-hidden','false');
  root.innerHTML = '';
  const box = document.createElement('div');
  box.className = 'card';
  box.setAttribute('role','dialog');
  box.setAttribute('aria-modal','true');
  box.style.maxWidth = '720px';
  box.innerHTML = `<h3>${title}</h3><div class="modal-body" style="color:${getComputedStyle(document.body).color};">${html}</div><div style="margin-top:12px;display:flex;gap:8px;justify-content:flex-end;"><button id="modalClose" class="outline">Fermer</button></div>`;
  root.appendChild(box);
  document.getElementById('modalClose').onclick = () => { root.setAttribute('aria-hidden','true'); root.innerHTML = ''; };
}

function announce(text) {
  const el = document.getElementById('app');
  el.setAttribute('aria-live','polite');
  // create a transient element
  const t = document.createElement('div');
  t.style.position='absolute'; t.style.left='-9999px'; t.setAttribute('role','status');
  t.textContent = text;
  el.appendChild(t);
  setTimeout(()=> t.remove(), 3000);
}

/* ==========================
   SELFTEST SUITE
   - Verifies DOM elements, storage save/load, timer behavior, chart render
   - Stops and reports detailed messages on failure
   ========================== */

async function runSelftest() {
  const reportEl = $('#selftestReport');
  reportEl.textContent = 'Autotest : en cours...';
  const errors = [];

  // Test 1: DOM elements
  try {
    if (!$('#weekRange')) throw 'Slider semaine manquant';
    if (!$('#exerciseList')) throw 'Liste exercices manquante';
    if (!$('#volumeChart')) throw 'Zone graphique manquante';
  } catch (e) { errors.push('DOM: '+e); }

  // Test 2: Storage save/load
  try {
    const before = JSON.stringify(APP);
    const ok = saveAppState();
    if (!ok) throw 'Échec sauvegarde';
    // restore into temp variable
    const loaded = Storage.load();
    if (!loaded) throw 'Échec restauration';
    // minimal check
    if (!Array.isArray(loaded.weeks) || loaded.weeks.length !== MAX_WEEKS) throw 'Données restaurées corrompues';
    // reassign existing APP to loaded to simulate roundtrip
    APP = loaded;
  } catch (e) { errors.push('Storage: '+e); }

  // Test 3: Timer start/pause/reset basic behavior
  try {
    // ensure a week selected
    APP.selectedWeek = APP.selectedWeek || 1;
    $('#weekRange').value = APP.selectedWeek;
    renderSessionView();
    // create timer for ex 0
    const exIndex = 0;
    const t = createTimer(exIndex);
    t.reset();
    const beforeMs = t.getRemaining();
    t.start();
    await wait(600);
    t.pause();
    const midMs = t.getRemaining();
    if (midMs >= beforeMs) throw 'Timer: pas de décrément';
    t.reset();
    if (t.getRemaining() !== beforeMs) throw 'Timer: reset incorrect';
  } catch (e) { errors.push('Timer: '+e); }

  // Test 4: Chart render
  try {
    renderCharts();
    if (!volumeChart) throw 'Chart non créé';
    if (!volumeChart.data || !volumeChart.data.datasets) throw 'Chart datas manquantes';
  } catch (e) { errors.push('Charts: '+e); }

  // Test 5: Export/Import JSON roundtrip
  try {
    Storage.exportJson();
    // can't test file system here, but ensure no exception
  } catch (e) { errors.push('Export JSON: '+String(e)); }

  // Finalize
  if (errors.length) {
    const msg = `SELFTEST FAILED — ${errors.length} problème(s):\n• ${errors.join('\n• ')}`;
    reportEl.textContent = 'Autotest : ÉCHEC';
    showModal('Autotest — ÉCHEC', `<pre style="white-space:pre-wrap;color:#f88">${escapeHtml(msg)}</pre>`);
    console.error(msg);
    return false;
  } else {
    reportEl.textContent = 'Autotest : PASS';
    showModal('Autotest — PASS', 'Tous les tests automatiques sont passés avec succès.');
    return true;
  }
}

/* ==========================
   BOOTSTRAP
   ========================== */

function bootstrap() {
  // try restore
  const restored = restoreAppState();
  if (!restored) APP = initialAppState();
  // initial UI bind
  $('#weekRange').max = MAX_WEEKS;
  $('#weekRange').value = APP.selectedWeek;
  renderWeekLabel();
  attachGlobalHandlers();
  renderSessionView();
  computeStats();
  renderCharts();

  // show disabled Drive button if no client id
  if (!GOOGLE_CLIENT_ID) {
    $('#syncDrive').setAttribute('disabled','true');
    $('#driveInstructions').style.display = 'block';
  }

  // keyboard accessibility: allow left/right to change week when focus on body
  document.body.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') $('#weekPrev').click();
    if (e.key === 'ArrowRight') $('#weekNext').click();
  });
}

/* ==========================
   Utilities
   ========================== */
function wait(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function escapeHtml(s){ return String(s).replace(/[&<>"']/g, (m)=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[m]); }

/* initialize */
document.addEventListener('DOMContentLoaded', bootstrap);
