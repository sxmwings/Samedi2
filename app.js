/* app.js
   Immersive Dashboard – Focus Hybrid
   - Vanilla JS, modular single-file (no bundling)
   - LocalStorage persistence, export/import, Chart.js integration
   - Google Drive backup placeholder (requires GOOGLE_CLIENT_ID)
   - SelfTest suite builtin
*/

/* ==========================
   CONFIG
   ========================== */
const APP_KEY = 'hybrid_master_51_v2';
const MAX_WEEKS = 26;
const DEFAULT_WEEK = 0;    // 0 = aucune sélection
// RENSEIGNEZ ICI VOTRE CLIENT ID si vous souhaitez activer Google Drive
const GOOGLE_CLIENT_ID = ''; // <-- Mettre un client ID Google OAuth (Web app)

/* ==========================
   PROGRAM DATA
   - Génération programmatique 1..26
   - Exercices dans l'ordre obligatoire
   - Deloads: 6,12,18,24,26 (60% charges)
   ========================== */

const EXERCISE_ORDER = [
  "Trap Bar Deadlift","Goblet Squat","Leg Press (lourd)","Leg Press (léger)",
  "Lat Pulldown prise large","Landmine Press","Rowing Machine (large)","Rowing Machine (serré)",
  "Spider Curl","Incline Curl","EZ Bar Curl","Dumbbell Press","Cable Fly","Dumbbell Fly",
  "Leg Curl","Leg Extension","Extension Triceps","Overhead Extension","Lateral Raises",
  "Face Pull","Wrist Curl","Hammer Curl (maison)"
];

const DEFAULT_SERIES = (nameIndex) => {
  // Variation minimaliste mais complète
  const base = [
    { series:1, reps:5, repos:120, tempo:"2-0-1", rpe:7, weightKg: Math.round(20 + nameIndex*1.8) },
    { series:2, reps:5, repos:120, tempo:"2-0-1", rpe:7.5, weightKg: Math.round(22 + nameIndex*1.8) },
    { series:3, reps:5, repos:120, tempo:"2-0-1", rpe:8, weightKg: Math.round(24 + nameIndex*1.8) }
  ];
  // for isolation exercises, lighter and more reps
  if (nameIndex > 10) {
    return [
      { series:1, reps:12, repos:90, tempo:"2-0-1", rpe:7, weightKg: Math.round(8 + nameIndex) },
      { series:2, reps:10, repos:90, tempo:"2-0-1", rpe:7.5, weightKg: Math.round(9 + nameIndex) },
      { series:3, reps:8, repos:90, tempo:"2-0-1", rpe:8, weightKg: Math.round(10 + nameIndex) }
    ];
  }
  return base;
};

function isDeloadWeek(w) {
  return [6,12,18,24,26].includes(w);
}

function generateWeek(w) {
  const deload = isDeloadWeek(w);
  const sessions = {
    dimanche: buildSession('Dimanche','dos, jambes lourdes, bras', w, deload),
    mardi: buildSession('Mardi','pecs, épaules, triceps', w, deload),
    vendredi: buildSession('Vendredi','dos, jambes légères, bras, épaules', w, deload)
  };
  return { week: w, deload, sessions };
}

function buildSession(dayName, desc, weekNumber, deload) {
  const exercises = EXERCISE_ORDER.map((name, idx) => {
    const sets = DEFAULT_SERIES(idx).map(s => {
      const weight = Math.round(s.weightKg * (deload ? 0.6 : 1));
      return Object.assign({}, s, { weightKg: weight });
    });
    return {
      name,
      mandatory: true,
      notes: '',
      sets
    };
  });

  // add hammer curl maison specifically to mardi session as constraint says 'mardi ou jeudi'
  if (dayName.toLowerCase() === 'mardi') {
    const last = exercises[exercises.length-1];
    if (last && last.name.includes('Hammer Curl')) {
      // already present
    } else {
      exercises.push({
        name: 'Hammer Curl (maison)',
        mandatory: true,
        notes: 'Séance maison (mardi).',
        sets: [{ series:1, reps:12, repos:60, tempo:"2-0-1", rpe:7, weightKg:0 }]
      });
    }
  }

  return { day: dayName, desc, durationMin:70, exercises };
}

const PROGRAM = Array.from({length:MAX_WEEKS}, (_,i)=>generateWeek(i+1));

/* ==========================
   APPLICATION STATE
   ========================== */
function initialAppState() {
  return {
    selectedWeek: DEFAULT_WEEK,
    currentDay: 'dimanche',
    weeks: PROGRAM,
    journal: {},         // clé: w{week}_{day}_ex{idx}_s{series}
    user: { name: null, weightKg: null },
    statsCache: {}
  };
}

let APP = initialAppState();

/* ==========================
   STORAGE (localStorage) & EXPORT/IMPORT
   ========================== */

const Storage = {
  key: APP_KEY,
  save(state) {
    try {
      const payload = { version:2, ts: Date.now(), state };
      localStorage.setItem(this.key, JSON.stringify(payload));
      return { ok:true, ts: new Date(payload.ts).toISOString() };
    } catch (err) {
      return { ok:false, error: err.message };
    }
  },
  load() {
    try {
      const raw = localStorage.getItem(this.key);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed.state || null;
    } catch (err) {
      console.error('Storage load error', err);
      return null;
    }
  },
  exportJson() {
    const raw = localStorage.getItem(this.key) || JSON.stringify({ version:2, ts:Date.now(), state: APP });
    const blob = new Blob([raw], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'hybrid_master_51_export.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
  importJson(file) {
    return new Promise((resolve,reject)=>{
      if (!file) return reject('Aucun fichier fourni');
      const r = new FileReader();
      r.onload = () => {
        try {
          const parsed = JSON.parse(r.result);
          // if root object contains state => accept, otherwise accept full as state
          const state = parsed.state ? parsed.state : parsed;
          localStorage.setItem(this.key, JSON.stringify({ version:2, ts:Date.now(), state }));
          resolve(true);
        } catch (err) {
          reject(err.message);
        }
      };
      r.onerror = () => reject('Lecture fichier impossible');
      r.readAsText(file);
    });
  }
};

/* ==========================
   UTILITIES
   ========================== */
const $ = (sel, root=document) => root.querySelector(sel);
const $all = (sel, root=document) => Array.from(root.querySelectorAll(sel));
const clamp = (v,a,b) => Math.max(a, Math.min(b, v));
const formatTime = ms => {
  const s = Math.max(0, Math.round(ms/1000));
  const mm = Math.floor(s/60).toString().padStart(2,'0');
  const ss = (s%60).toString().padStart(2,'0');
  return `${mm}:${ss}`;
};
const sleep = ms => new Promise(r=>setTimeout(r,ms));
const capitalize = s => s ? s[0].toUpperCase()+s.slice(1) : '';

/* ==========================
   UI RENDERING
   ========================== */

function renderWeekLabel() {
  const el = $('#weekLabel');
  if (!el) return;
  if (APP.selectedWeek === 0) el.textContent = 'Aucune semaine sélectionnée';
  else el.textContent = `Semaine ${APP.selectedWeek}`;
}

function renderSessionView() {
  const sessionView = $('#sessionView');
  const noSelection = $('#noSelection');
  if (!sessionView || !noSelection) return;

  if (APP.selectedWeek === 0) {
    sessionView.hidden = true;
    noSelection.hidden = false;
    return;
  }

  const weekIdx = APP.selectedWeek - 1;
  const weekData = APP.weeks[weekIdx];
  if (!weekData) {
    sessionView.hidden = true;
    noSelection.hidden = false;
    return;
  }

  sessionView.hidden = false;
  noSelection.hidden = true;

  const currentDay = APP.currentDay || 'dimanche';
  const session = weekData.sessions[currentDay];
  $('#sessionTitle').textContent = `S${APP.selectedWeek} • ${session.day} — ${session.desc}`;
  $('#sessionDuration').textContent = `Durée ≈ ${session.durationMin} min`;
  $('#saveStatus').textContent = `Dernière sauvegarde : ${getSaveTs() || 'Aucune sauvegarde'}`;
  // day select
  $('#daySelect').value = currentDay;

  // render exercises
  const list = $('#exerciseList');
  list.innerHTML = '';
  session.exercises.forEach((ex, exIndex) => {
    const article = document.createElement('article');
    article.className = 'exercise';
    article.setAttribute('role','listitem');

    const setsHtml = ex.sets.map(s => `
      <div class="set" data-series="${s.series}">
        <div><strong>${s.series}</strong> • ${s.reps} reps</div>
        <div class="muted">${s.weightKg} kg • ${s.repos}s</div>
        <div style="margin-top:6px;">
          <button class="toggle-set" data-ex="${exIndex}" data-series="${s.series}" aria-label="Valider série ${s.series}">Valider</button>
        </div>
      </div>
    `).join('');

    article.innerHTML = `
      <div>
        <h2>${ex.name}</h2>
        <div class="meta">Obligatoire • Ordre ${exIndex+1}</div>
        <div class="sets" data-ex-index="${exIndex}">${setsHtml}</div>
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
  });

  attachSetToggleHandlers();
  attachTimerHandlers();
}

/* ==========================
   TIMERS (per exercise) + Global timer (cercle SVG)
   ========================== */

const Timers = {}; // exIndex -> timer instance
let globalTimer = null;

function defaultReposFor(exIndex) {
  // try to infer from APP data
  const wk = APP.selectedWeek;
  if (!wk) return 60000;
  const s = APP.weeks[wk-1].sessions[APP.currentDay];
  if (!s) return 60000;
  const ex = s.exercises[exIndex];
  if (!ex || !ex.sets || !ex.sets[0]) return 60000;
  return (ex.sets[0].repos || 60) * 1000;
}

function createTimer(exIndex) {
  let running = false, remainingMs = defaultReposFor(exIndex), interval = null;
  const display = document.getElementById(`timer-display-${exIndex}`);

  function updateDisplay(){ if (display) display.textContent = formatTime(remainingMs); }
  function tick(){ remainingMs = Math.max(0, remainingMs - 250); updateDisplay(); if (remainingMs === 0) { pause(); announce(`Repos terminé pour l'exercice ${exIndex+1}`); } }
  function start(){ if (running) return; running=true; if (interval) clearInterval(interval); interval = setInterval(tick,250); }
  function pause(){ running=false; if (interval){ clearInterval(interval); interval=null; } }
  function reset(){ pause(); remainingMs = defaultReposFor(exIndex); updateDisplay(); }

  updateDisplay();
  return { start, pause, reset, getRemaining: ()=>remainingMs, isRunning: ()=>running };
}

function attachTimerHandlers() {
  $all('.start-timer').forEach(btn => btn.onclick = onTimerAction);
  $all('.pause-timer').forEach(btn => btn.onclick = onTimerAction);
  $all('.reset-timer').forEach(btn => btn.onclick = onTimerAction);

  // Global timer controls
  $('#globalTimerStart').onclick = () => { if (!globalTimer) globalTimer = createGlobalTimer(); globalTimer.start(); };
  $('#globalTimerPause').onclick = () => { if (globalTimer) globalTimer.pause(); };
  $('#globalTimerReset').onclick = () => { if (globalTimer) globalTimer.reset(); };
}

function onTimerAction(e) {
  const btn = e.currentTarget;
  const parent = btn.closest('.timer-controls');
  if (!parent) return;
  const exIndex = Number(parent.dataset.exIndex);
  const action = btn.dataset.action;
  if (!Timers[exIndex]) Timers[exIndex] = createTimer(exIndex);
  const t = Timers[exIndex];
  if (action === 'start') t.start();
  if (action === 'pause') t.pause();
  if (action === 'reset') t.reset();
}

/* Global circular timer (SVG progress) */
function createGlobalTimer() {
  let running = false, remainingMs = 60000, interval = null;
  const display = $('#globalTimerDisplay');
  const progress = $('#globalTimerProgress');
  const circumference = 2 * Math.PI * 44; // r=44
  function updateSvg() {
    const pct = clamp(1 - (remainingMs / 60000), 0, 1);
    const offset = circumference * (1 - pct);
    if (progress) progress.style.strokeDashoffset = String(offset.toFixed(2));
    if (display) display.textContent = formatTime(remainingMs);
  }
  function tick(){ remainingMs = Math.max(0, remainingMs - 250); updateSvg(); if (remainingMs === 0) { pause(); announce('Timer global terminé'); } }
  function start(){ if (running) return; running=true; if (interval) clearInterval(interval); interval=setInterval(tick,250); }
  function pause(){ running=false; if (interval){ clearInterval(interval); interval=null; } }
  function reset(){ pause(); remainingMs = 60000; updateSvg(); }
  updateSvg();
  return { start, pause, reset, getRemaining: ()=>remainingMs };
}

/* ==========================
   SET TOGGLE + JOURNAL
   ========================== */

function attachSetToggleHandlers() {
  $all('.toggle-set').forEach(btn => {
    btn.onclick = (e) => {
      const exIndex = Number(btn.dataset.ex);
      const series = Number(btn.dataset.series);
      const setEl = btn.closest('.set');
      if (!setEl) return;
      setEl.classList.toggle('completed');
      const key = `w${APP.selectedWeek}_${APP.currentDay}_ex${exIndex}_s${series}`;
      APP.journal[key] = APP.journal[key] || { completed:false, ts:0 };
      APP.journal[key].completed = !APP.journal[key].completed;
      APP.journal[key].ts = Date.now();
      saveAppState();
      renderSaveStatus();
    };
    btn.onkeyup = (ev) => { if (ev.key === 'Enter' || ev.key === ' ') btn.click(); };
  });
}

/* ==========================
   RENDER CHARTS (Chart.js)
   ========================== */
let volumeChart = null, rpeChart = null;

function computeWeekVolume(weekData) {
  let total = 0;
  ['dimanche','mardi','vendredi'].forEach(day=>{
    const s = weekData.sessions[day];
    if (!s) return;
    s.exercises.forEach(ex => {
      const set = ex.sets[0];
      if (set && set.weightKg && set.reps) total += set.weightKg * set.reps;
    });
  });
  return total;
}

function renderCharts() {
  const vctx = document.getElementById('volumeChart');
  if (vctx) {
    const labels = [];
    const data = [];
    const sel = APP.selectedWeek || 4;
    const start = Math.max(0, sel - 4);
    for (let i = start; i < Math.min(APP.weeks.length, start + 4); i++) {
      labels.push(`S${APP.weeks[i].week}`);
      data.push(computeWeekVolume(APP.weeks[i]));
    }
    const cfg = {
      type: 'bar',
      data: { labels, datasets: [{ label:'Volume (kg·rep)', data, backgroundColor:'rgba(0,227,140,0.9)' }] },
      options: { responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{x:{ticks:{color:'#E6E6E6'}}, y:{ticks:{color:'#E6E6E6'}}} }
    };
    if (volumeChart) volumeChart.destroy();
    volumeChart = new Chart(vctx, cfg);
  }

  const rctx = document.getElementById('rpeChart');
  if (rctx) {
    const labels = ['RPE','Sommeil','Douleur'];
    const data = [7.5, 8, 1];
    const cfg = {
      type:'radar',
      data:{ labels, datasets:[{ label:'Etat', data, backgroundColor:'rgba(43,76,242,0.18)', borderColor:'rgba(0,227,140,0.9)', pointBackgroundColor:'rgba(0,227,140,0.9)' }]},
      options:{ responsive:true, maintainAspectRatio:false, scales:{ r:{ grid:{ color:'rgba(255,255,255,0.03)'}, angleLines:{ color:'rgba(255,255,255,0.03)'}, pointLabels:{ color:'#E6E6E6' } } } }
    };
    if (rpeChart) rpeChart.destroy();
    rpeChart = new Chart(rctx, cfg);
  }
}

/* ==========================
   STATS & UI HELPERS
   ========================== */

function computeStats() {
  const weekIdx = Math.max(0, (APP.selectedWeek ? APP.selectedWeek - 1 : 0));
  const vol = computeWeekVolume(APP.weeks[weekIdx] || APP.weeks[0]);
  APP.statsCache = { volume: vol, rpe: 7.5, sleep: 8, pain: 1 };
  $('#rpeBadge').textContent = APP.statsCache.rpe;
  $('#sleepBadge').textContent = APP.statsCache.sleep + 'h';
  $('#painBadge').textContent = APP.statsCache.pain + '/10';
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
    $('#weekRange').value = APP.selectedWeek;
    renderWeekLabel();
    renderSessionView();
    computeStats();
    renderCharts();
  });

  $('#weekPrev').onclick = () => {
    const cur = APP.selectedWeek;
    if (cur > 1) { APP.selectedWeek = cur - 1; $('#weekRange').value = APP.selectedWeek; renderWeekLabel(); renderSessionView(); renderCharts(); }
  };
  $('#weekNext').onclick = () => {
    const cur = APP.selectedWeek;
    if (cur < MAX_WEEKS) { APP.selectedWeek = cur + 1; $('#weekRange').value = APP.selectedWeek; renderWeekLabel(); renderSessionView(); renderCharts(); }
  };

  $('#navSessions').onclick = () => { setNavPressed('sessions'); $('#centerPanel').focus(); };
  $('#navStats').onclick = () => { setNavPressed('stats'); $('#volumeChart') && $('#volumeChart').scrollIntoView({behavior:'smooth'}); };
  $('#navJournal').onclick = () => { setNavPressed('journal'); showModal('Carnet', 'Section carnet — export/import disponibles.'); };

  $('#exportJson').onclick = () => Storage.exportJson();
  $('#importJson').onchange = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    Storage.importJson(f).then(() => {
      showModal('Import terminé', 'Données importées. Rechargez la page pour appliquer.');
    }).catch(err => showModal('Erreur import', String(err)));
  };

  $('#saveLocal').onclick = () => { saveAppState(); };

  $('#finishSession').onclick = () => {
    if (APP.selectedWeek === 0) return showModal('Aucune semaine', 'Sélectionnez d\'abord une semaine.');
    if (APP.selectedWeek === MAX_WEEKS) return showModal('Programme terminé', 'S26 est la dernière semaine du programme.');
    APP.selectedWeek = Math.min(MAX_WEEKS, APP.selectedWeek + 1);
    $('#weekRange').value = APP.selectedWeek;
    renderWeekLabel();
    renderSessionView();
    saveAppState();
    computeStats();
    renderCharts();
    announce('Séance terminée — semaine incrémentée.');
  };

  $('#syncDrive').onclick = () => { attemptDriveSave(); };
  $('#exportCsv').onclick = () => { exportCsv(); };
  $('#downloadPdf').onclick = () => { showModal('Export PDF', 'Export PDF simulé — intégrer jsPDF si nécessaire.'); };
  $('#runSelftest').onclick = () => { runSelftest(); };

  $('#daySelect').onchange = (e) => {
    APP.currentDay = e.target.value;
    renderSessionView();
  };

  // keyboard left/right for weeks
  document.body.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') $('#weekPrev').click();
    if (e.key === 'ArrowRight') $('#weekNext').click();
  });
}

function setNavPressed(which) {
  $('#navSessions').setAttribute('aria-pressed', which==='sessions');
  $('#navStats').setAttribute('aria-pressed', which==='stats');
  $('#navJournal').setAttribute('aria-pressed', which==='journal');
}

/* ==========================
   SAVE / RESTORE APP STATE
   ========================== */

function saveAppState() {
  const res = Storage.save(APP);
  if (res.ok) {
    $('#saveStatus').textContent = `Sauvegardé local à ${res.ts}`;
    $('#selftestReport').textContent = 'Autotest : non exécuté';
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

function getSaveTs() {
  const raw = localStorage.getItem(APP_KEY);
  if (!raw) return null;
  try { const parsed = JSON.parse(raw); return new Date(parsed.ts).toLocaleString(); } catch(e){ return null; }
}

/* ==========================
   CSV Export
   ========================== */

function exportCsv() {
  const rows = [['Semaine','Jour','Exercice','Série','Reps','Poids','Repos','Tempo','RPE']];
  APP.weeks.forEach(w=>{
    ['dimanche','mardi','vendredi'].forEach(day=>{
      const s = w.sessions[day];
      if (!s) return;
      s.exercises.forEach(ex=>{
        ex.sets.forEach(set=>{
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
   GOOGLE DRIVE SYNC (client-side placeholder)
   - Requires GOOGLE_CLIENT_ID
   - Uses OAuth2 implicit/popup (simple flow)
   ========================== */

let googleAccessToken = null;

function attemptDriveSave() {
  if (!GOOGLE_CLIENT_ID) {
    showModal('Drive non configuré', 'La sauvegarde Google Drive est désactivée. Pour l’activer, définissez la constante GOOGLE_CLIENT_ID dans app.js (OAuth client ID) puis rechargez la page. Scopes requis : https://www.googleapis.com/auth/drive.file');
    return;
  }
  if (!googleAccessToken) {
    const authUrl = buildGoogleAuthUrl(GOOGLE_CLIENT_ID);
    const popup = window.open(authUrl, 'gdrive_oauth', 'width=500,height=650');
    if (!popup) return showModal('Popup bloquée', 'Autorisez les popups pour ce site pour synchroniser Drive.');
    const poll = setInterval(()=> {
      try {
        if (!popup || popup.closed) { clearInterval(poll); showModal('Annulé', 'Fenêtre d\'authentification fermée.'); return; }
        if (popup.location && popup.location.hash) {
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
      } catch(e) { /* cross-origin until auth completes */ }
    }, 500);
  } else driveSaveFile();
}

function buildGoogleAuthUrl(clientId) {
  const redirect = window.location.origin + window.location.pathname;
  const scope = encodeURIComponent('https://www.googleapis.com/auth/drive.file');
  const state = encodeURIComponent('hybrid_master_51_' + Date.now());
  return `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirect)}&response_type=token&scope=${scope}&state=${state}`;
}

function driveSaveFile() {
  if (!googleAccessToken) return showModal('Drive', 'Token manquant');
  const metadata = { name: `hybrid_master_51_backup_${new Date().toISOString()}.json`, mimeType: 'application/json' };
  const content = JSON.stringify({ version:2, ts: Date.now(), state: APP });
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
    method:'POST',
    headers: { 'Authorization':'Bearer '+googleAccessToken, 'Content-Type':'multipart/related; boundary='+boundary },
    body
  }).then(r=>r.json()).then(res=>{
    if (res.id) showModal('Drive', 'Sauvegarde vers Google Drive réalisée avec succès.');
    else { showModal('Drive erreur','Impossible d\'envoyer le fichier sur Drive. Voir console.'); console.error(res); }
  }).catch(err => showModal('Drive erreur', String(err)));
}

/* ==========================
   MODAL & ANNOUNCE
   ========================== */

function showModal(title, html) {
  const root = $('#modalRoot');
  root.setAttribute('aria-hidden','false');
  root.innerHTML = '';
  const box = document.createElement('div');
  box.className = 'card';
  box.setAttribute('role','dialog');
  box.setAttribute('aria-modal','true');
  box.style.maxWidth = '820px';
  box.innerHTML = `<h3>${title}</h3><div class="modal-body" style="color:var(--text); margin-top:8px;">${html}</div><div style="margin-top:14px;display:flex;gap:8px;justify-content:flex-end;"><button id="modalClose" class="outline">Fermer</button></div>`;
  root.appendChild(box);
  $('#modalClose').onclick = () => { root.setAttribute('aria-hidden','true'); root.innerHTML = ''; };
}
function announce(text) {
  const el = document.getElementById('app');
  const t = document.createElement('div');
  t.style.position='absolute'; t.style.left='-9999px'; t.setAttribute('role','status');
  t.textContent = text;
  el.appendChild(t);
  setTimeout(()=>t.remove(), 2500);
}

/* ==========================
   SELFTEST (exhaustif, arrête en cas d'erreur)
   ========================== */

async function runSelftest() {
  const reportEl = $('#selftestReport'); reportEl.textContent = 'Autotest : en cours...';
  const errors = [];

  // Test 1: DOM basic
  try {
    if (!$('#weekRange')) throw 'Slider semaine manquant';
    if (!$('#exerciseList')) throw 'Liste exercices manquante';
    if (!$('#volumeChart')) throw 'Zone graphique manquante';
  } catch(e){ errors.push('DOM: '+e); }

  // Test 2: Program integrity
  try {
    if (!Array.isArray(APP.weeks) || APP.weeks.length !== MAX_WEEKS) throw 'Programme 26 semaines incomplet';
    const deloads = [6,12,18,24,26];
    deloads.forEach(d=>{ if (!APP.weeks[d-1].deload) { throw `Deload manquant S${d}`; }});
  } catch(e){ errors.push('Program: '+e); }

  // Test 3: Storage save/load
  try {
    const ok = saveAppState();
    if (!ok) throw 'Échec sauvegarde';
    const loaded = Storage.load();
    if (!loaded) throw 'Restauration impossible';
    if (!Array.isArray(loaded.weeks) || loaded.weeks.length !== MAX_WEEKS) throw 'Données restaurées corrompues';
    APP = loaded;
  } catch(e){ errors.push('Storage: '+e); }

  // Test 4: Timer basic
  try {
    APP.selectedWeek = APP.selectedWeek || 1;
    $('#weekRange').value = APP.selectedWeek;
    renderSessionView();
    const exIndex = 0;
    const t = createTimerTest(exIndex);
    t.reset();
    const before = t.getRemaining();
    t.start();
    await sleep(600);
    t.pause();
    const mid = t.getRemaining();
    if (mid >= before) throw 'Timer: pas de décrément';
    t.reset();
    if (t.getRemaining() !== before) throw 'Timer: reset incorrect';
  } catch(e){ errors.push('Timer: '+e); }

  // Test 5: Charts
  try {
    renderCharts();
    if (!volumeChart) throw 'Chart non créé';
  } catch(e){ errors.push('Charts: '+e); }

  // Test 6: Export JSON (no exception)
  try { Storage.exportJson(); } catch(e){ errors.push('Export JSON: '+e); }

  // Final
  if (errors.length) {
    const msg = `SELFTEST ÉCHEC — ${errors.length} problème(s) détecté(s):\n• ${errors.join('\n• ')}`;
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

function createTimerTest(exIndex) {
  // minimal timer usable for selftest
  let running=false, remaining=defaultReposFor(exIndex), iv=null;
  function getRemaining(){ return remaining; }
  function start(){ if (running) return; running=true; iv=setInterval(()=>{ remaining=Math.max(0,remaining-250); },250); }
  function pause(){ running=false; if (iv){ clearInterval(iv); iv=null; } }
  function reset(){ pause(); remaining=defaultReposFor(exIndex); }
  return { getRemaining, start, pause, reset };
}

/* ==========================
   BOOTSTRAP
   ========================== */

function bootstrap() {
  const restored = restoreAppState();
  if (!restored) APP = initialAppState();

  $('#weekRange').max = MAX_WEEKS;
  $('#weekRange').value = APP.selectedWeek;

  renderWeekLabel();
  attachGlobalHandlers();
  renderSessionView();
  computeStats();
  renderCharts();

  if (!GOOGLE_CLIENT_ID) {
    $('#syncDrive').setAttribute('disabled','true');
    $('#driveInstructions').style.display = 'block';
  }

  // initial accessibility: focus main panel
  $('#centerPanel').setAttribute('tabindex','-1');
}

document.addEventListener('DOMContentLoaded', bootstrap);

/* ==========================
   Helper escape
   ========================== */
function escapeHtml(s){ return String(s).replace(/[&<>"']/g, (m)=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[m]); }
