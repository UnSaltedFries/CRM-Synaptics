/**
 * CRM SYNAPTICS - CORE LOGIC
 * 
 * ARCHITECTURE :
 * - Granular Firestore Sync : Records (Prospects, Fixes) are saved individually to minimize data transfer and avoid Firestore limits.
 * - Targeted UI Rendering : Specific rows and components are updated individually following a data change, avoiding global 'renderAll' where possible.
 * - Dual Persistence : Immediate state save to localStorage + background debounced sync to Firestore.
 */

// ─── THEME INIT ───
(function initTheme() {
  const saved = localStorage.getItem('synaptic_theme');
  if (saved === 'light') document.documentElement.classList.remove('dark');
  else document.documentElement.classList.add('dark');
})();

// ─── CONFIGURATION & CONSTANTS ───

const firebaseConfig = {
  apiKey: "AIzaSyC0mvY2HG0x5fpKUYWx1Bs9lKwr6K8I6Yg",
  authDomain: "crm-call-synaptics.firebaseapp.com",
  projectId: "crm-call-synaptics",
  storageBucket: "crm-call-synaptics.firebasestorage.app",
  messagingSenderId: "1027104211648",
  appId: "1:1027104211648:web:39099132bf74f39ad66325",
  measurementId: "G-2K53TWX7PN"
};

const statusMap = { appeler: 'À appeler', appele: 'Appelé', repondu: 'Répondu', rdv_planifie: 'RDV planifié', rdv_effectue: 'RDV effectué', signe: 'Signé', perdu: 'Perdu', npai: 'Faux N°/NPAI' };
const badgeCss = {
  appeler: `background:#E6F1FB;color:#185FA5`,
  appele: `background:#EEEDFE;color:#534AB7`,
  repondu: `background:#FAEEDA;color:#854F0B`,
  rdv_planifie: `background:#FFF3CD;color:#856404`,
  rdv_effectue: `background:#EAF3DE;color:#0F6E56`,
  signe: `background:#D4EDDA;color:#27500A`,
  perdu: `background:#FCEBEB;color:#A32D2D`,
  npai: `background:#E6E6E6;color:#5A5A5A;text-decoration:line-through;`,
};

const pipeKeys = ['appeler', 'appele', 'repondu', 'rdv_effectue', 'signe'];
const pipeNames = ['À appeler', 'Appelé', 'Répondu', 'RDV effectué', 'Signé'];
const stageNames = ['À appeler', 'Appelé', 'Répondu', 'RDV effectué', 'Signé']; // Used in pipeline render

var teamMembers = [
  { name: 'Grégory', bg: '#B5D4F4', fg: '#0C447C' },
  { name: 'Édouard', bg: '#C0DD97', fg: '#27500A' },
  { name: 'Maxence', bg: '#CECBF6', fg: '#3C3489' },
];
var businessTypes = ['PME', 'ETI', 'Groupe', 'Garage', 'Avocat', 'Indépendant'];

const teamColors = [
  { bg: '#B5D4F4', fg: '#0C447C' }, { bg: '#C0DD97', fg: '#27500A' }, { bg: '#CECBF6', fg: '#3C3489' },
  { bg: '#FAC775', fg: '#633806' }, { bg: '#9FE1CB', fg: '#0F6E56' }, { bg: '#F7C1C1', fg: '#791F1F' },
];

const pageNames = { dashboard: 'Dashboard', prospects: 'Résumé des Prospects', kanban: 'Pipeline Kanban', fixe: 'Fixes & Améliorations', 'import-export': 'Import / Export', parametres: 'Paramètres' };
const funnelStatuses = ['appeler', 'new', 'appele', 'contact', 'repondu', 'prop', 'rdv_planifie', 'rdv_effectue', 'nego', 'signe', 'gagne'];
const stageIndex = { appeler: 0, new: 0, appele: 1, contact: 1, repondu: 2, prop: 2, rdv_planifie: 3, rdv_effectue: 3, nego: 3, signe: 4, gagne: 4 };

// ─── INITIALIZATION ───
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();

// ─── UTILS ───

function debounce(fn, delay) {
  let timeout = null;
  return function () {
    const args = arguments;
    const context = this;
    clearTimeout(timeout);
    timeout = setTimeout(() => fn.apply(context, args), delay);
  };
}

const debouncedRenderTable = debounce(() => renderTable(), 250);
const debouncedRenderProspectsTable = debounce(() => renderProspectsTable(), 250);

// ─── NOTE MODAL LOGIC ───
let currentNoteProspectId = null;

function openNoteModal(id) {
  currentNoteProspectId = id;
  const p = prospects.find(x => x.id === id);
  if (!p) return;
  document.getElementById('noteProspectName').textContent = p.nom;
  document.getElementById('noteTextarea').value = p.note || '';
  document.getElementById('noteModalBg').classList.add('open');
  document.getElementById('noteTextarea').focus();
}

function closeNoteModal() {
  document.getElementById('noteModalBg').classList.remove('open');
  currentNoteProspectId = null;
}

function saveNoteFromModal() {
  if (!currentNoteProspectId) return;
  const text = document.getElementById('noteTextarea').value;
  const p = prospects.find(x => x.id === currentNoteProspectId);
  if (p) {
    p.note = text;
    showToast('Note enregistrée !', 'success');
    saveProspectDoc(p);
    updateRowInTables(currentNoteProspectId);
  }
  closeNoteModal();
}
function showToast(msg, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  let icon = '🔔';
  if (type === 'success') icon = '✅';
  if (type === 'error') icon = '❌';
  t.innerHTML = `<span>${icon}</span> <span>${msg}</span>`;
  container.appendChild(t);
  setTimeout(() => {
    t.style.animation = 'toastOut 0.3s forwards';
    setTimeout(() => t.remove(), 300);
  }, 3500);
}
function renderHero() {
  const el = document.getElementById('dashboardHero');
  if (!el) return;
  const today = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  const currentHour = new Date().getHours();
  const greeting = currentHour < 18 ? 'Bonjour' : 'Bonsoir';

  const funnelStatuses = ['appeler', 'new', 'appele', 'contact', 'repondu', 'prop', 'rdv_planifie', 'rdv_effectue', 'nego', 'signe', 'gagne'];
  const tousSaufPerdus = prospects.filter(p => p.statut !== 'perdu' && p.statut !== 'npai');
  const totalActive = tousSaufPerdus.filter(p => !['signe', 'gagne'].includes(p.statut) && funnelStatuses.includes(p.statut)).length;
  const caGagne = prospects.filter(p => (p.statut === 'signe' || p.statut === 'gagne')).reduce((s, p) => s + getACV(p), 0);
  const potentielTotal = tousSaufPerdus.reduce((s, p) => s + getACV(p), 0);
  const hotCount = prospects.filter(p => (p.score || 0) >= 80 && !['signe', 'perdu', 'npai'].includes(p.statut) && funnelStatuses.includes(p.statut)).length;

  const userName = localStorage.getItem('synaptic_user_name') || 'Synaptics';
  const showNewUserPrompt = prospects.length === 0;

  el.innerHTML = `
    <div class="hero-welcome">
      <div class="hero-deco"></div>
      <div class="hero-greeting">${greeting}, ${userName} 👋</div>
      <div class="hero-sub">
        ${showNewUserPrompt 
          ? `Bienvenue parmi nous ! Pour commencer, <a href="#" onclick="openModal();return false;" style="color:white;text-decoration:underline">ajoutez votre premier prospect</a> ou importez une base.` 
          : `C'est le ${today}. Vous avez ${totalActive} opportunités actives à gérer aujourd'hui.`}
      </div>
      
      <div class="hero-stats">
        <div class="hero-stat-card">
          <div class="hero-stat-val">${caGagne.toLocaleString('fr-FR')}€</div>
          <div class="hero-stat-lbl">CA Gagné</div>
        </div>
        <div class="hero-stat-card">
          <div class="hero-stat-val">${potentielTotal.toLocaleString('fr-FR')}€</div>
          <div class="hero-stat-lbl">Valeur Totale</div>
        </div>
        <div class="hero-stat-card">
          <div class="hero-stat-val">${tousSaufPerdus.length}</div>
          <div class="hero-stat-lbl">Prospects (Gagnés + Actifs)</div>
        </div>
      </div>
    </div>
  `;
}

// ─── KANBAN ───
function renderKanban() {
  const board = document.getElementById('kanbanBoard');
  if (!board) return;

  const kanbanKeys = ['appeler', 'appele', 'repondu', 'rdv_planifie', 'rdv_effectue', 'signe'];
  const kanbanLabels = ['À appeler', 'Appelé', 'Répondu', 'RDV planifié', 'RDV effectué', 'Signé'];

  board.innerHTML = kanbanKeys.map((key, i) => {
    const colProspects = prospects.filter(p => p.statut === key);
    return `
      <div class="kanban-col" ondragover="allowDrop(event)" ondrop="drop(event, '${key}')">
        <div class="kanban-col-header">
          <span>${kanbanLabels[i]}</span>
          <span class="kanban-col-count">${colProspects.length}</span>
        </div>
        <div class="kanban-cards">
          ${colProspects.map(p => {
      const [bg, fg] = (p.av || '#E6F1FB:#185FA5').split(':');
      return `
              <div class="kanban-card" draggable="true" ondragstart="drag(event, '${p.id}')" onclick="openModal('${p.id}')">
                <div style="display:flex; justify-content:space-between; align-items:flex-start">
                  <div class="kanban-card-name" style="display:flex; align-items:center; gap:6px">
                    <span onclick="togglePriority('${p.id}', event)" style="cursor:pointer; font-size:16px; color:${p.isPriority ? 'var(--orange)' : 'var(--text3)'}; transition:all 0.15s" title="Priorité">
                      ${p.isPriority ? '★' : '☆'}
                    </span>
                    ${p.nom}
                  </div>
                  <div class="av-sm" style="background:${bg};color:${fg};width:20px;height:20px;font-size:9px">${p.initiales || '+'}</div>
                </div>
                <div class="kanban-card-company">${p.entreprise || '—'}</div>
                <div class="kanban-card-footer">
                  <span class="kanban-card-val" title="Total Annuel: ${getACV(p).toLocaleString('fr-FR')}€">
                    ${(Number(p.valeurFixe) || 0).toLocaleString('fr-FR')}€${p.valeurMensuelle > 0 ? ` + ${p.valeurMensuelle}€/m` : ''}
                  </span>
                </div>
              </div>
            `;
    }).join('')}
        </div>
      </div>
    `;
  }).join('');
}

// ─── DRAG & DROP ───
function drag(ev, id) {
  ev.dataTransfer.setData("prospectId", id);
  ev.target.classList.add('dragging');
}

function allowDrop(ev) {
  ev.preventDefault();
  const col = ev.target.closest('.kanban-col');
  if (col) col.classList.add('drag-over');
}

function drop(ev, newStatus) {
  ev.preventDefault();
  const col = ev.target.closest('.kanban-col');
  if (col) col.classList.remove('drag-over');

  const id = ev.dataTransfer.getData("prospectId");
  const p = prospects.find(x => x.id === id);
  if (p && p.statut !== newStatus) {
    p.statut = newStatus;
    saveProspectDoc(p);
    updateRowInTables(id);
  }

  // Cleanup dragging class if any
  document.querySelectorAll('.kanban-card.dragging').forEach(c => c.classList.remove('dragging'));
}

// Remove drag-over class on leave
document.addEventListener('dragleave', e => {
  const col = e.target.closest('.kanban-col');
  if (col && !col.contains(e.relatedTarget)) {
    col.classList.remove('drag-over');
  }
});

// Firebase moved to top

function doLogin() {
  const email = document.getElementById('loginEmail').value.trim();
  const pass = document.getElementById('loginPass').value;
  const errEl = document.getElementById('loginErr');
  errEl.textContent = '';
  errEl.style.display = 'none';

  if (!email || !pass) {
    errEl.textContent = 'Veuillez remplir tous les champs.';
    errEl.style.display = 'block';
    return;
  }

  auth.signInWithEmailAndPassword(email, pass)
    .catch(function (error) {
      const msgs = {
        'auth/user-not-found': 'Aucun compte avec cet email.',
        'auth/wrong-password': 'Mot de passe incorrect.',
        'auth/invalid-email': 'Email invalide.',
        'auth/too-many-requests': 'Trop de tentatives. Réessayez plus tard.',
        'auth/invalid-credential': 'Email ou mot de passe incorrect.',
      };
      errEl.textContent = msgs[error.code] || 'Erreur : ' + error.message;
      errEl.style.display = 'block';
    });
}

function doLogout() {
  auth.signOut();
}

auth.onAuthStateChanged(function (user) {
  if (user) {
    document.getElementById('loginPage').style.display = 'none';
    document.getElementById('appPage').style.display = 'flex';
    if (!dbReady) initRealtimeSync();
    // In case sync is slow, don't keep them on splash forever
    setTimeout(hideSplashScreen, 3000);
  } else {
    document.getElementById('loginPage').style.display = 'flex';
    document.getElementById('appPage').style.display = 'none';
    hideSplashScreen();
  }
});

var prospects = [];
var fixes = [];
var dbReady = false;

// ─── SAVE TO FIRESTORE (Granular & Debounced) ───

/**
 * Saves a single prospect document to Firestore.
 * Using atomic updates to prevent conflicts.
 */
function saveProspectDoc(p, isNew = false) {
  if (!p || !p.id) return;
  
  // Local cache save
  try {
    const saved = localStorage.getItem('synaptic_prospects');
    let current = saved ? JSON.parse(saved) : [];
    const idx = current.findIndex(x => x.id === p.id);
    if (idx > -1) current[idx] = p; else current.unshift(p);
    localStorage.setItem('synaptic_prospects', JSON.stringify(current));
  } catch (e) { }

  if (!dbReady || !db) return;

  const docRef = db.collection('prospects').doc(p.id);
  const dataToSave = { ...p };
  delete dataToSave.id; // ID is stored in the document name

  if (isNew) {
    // Creation: Full write
    docRef.set({ ...dataToSave, createdAt: firebase.firestore.FieldValue.serverTimestamp() })
      .catch(e => console.warn('Firestore set error:', e));
  } else {
    // Update: Partial write to prevent overwriting fields updated by others
    // We don't want to overwrite 'appels' if we are just editing the basic info
    const updateData = { ...dataToSave };
    // If the data comes from the modal, it might not contain 'appels' in the 'data' sub-object
    // but in saveProspect we merged it. We should be careful.
    docRef.update({ ...updateData, updatedAt: firebase.firestore.FieldValue.serverTimestamp() })
      .catch(e => {
        console.warn('Firestore update error (retrying with set):', e);
        docRef.set(dataToSave, { merge: true });
      });
  }
}

/**
 * Saves a single fix document to Firestore.
 */
function saveFixDoc(f) {
  if (!f || !f.id) return;
  try {
    const saved = localStorage.getItem('synaptic_fixes');
    let current = saved ? JSON.parse(saved) : [];
    const idx = current.findIndex(x => x.id === f.id);
    if (idx > -1) current[idx] = f; else current.unshift(f);
    localStorage.setItem('synaptic_fixes', JSON.stringify(current));
  } catch (e) { }

  db.collection('fixes').doc(f.id).set(f)
    .catch(e => {
      console.error('Error saving fix:', f.id, e);
      showToast('Erreur de sauvegarde Firestore', 'error');
    });
}

var saveTimeout = null;
/**
 * Global fallback for broad config changes (Team, Types).
 * Debounced to prevent excessive writes.
 */
function saveData() {
  // Save all to localStorage
  try {
    localStorage.setItem('synaptic_prospects', JSON.stringify(prospects));
    localStorage.setItem('synaptic_fixes', JSON.stringify(fixes));
    localStorage.setItem('synaptic_team', JSON.stringify(teamMembers));
    localStorage.setItem('synaptic_business_types', JSON.stringify(businessTypes));
  } catch (e) { }

  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(function () {
    // Save Team & Business Types
    db.collection('config').doc('team').set({ data: teamMembers })
      .catch(e => console.warn('Firebase team save error:', e));

    db.collection('config').doc('businessTypes').set({ data: businessTypes })
      .catch(e => console.warn('Firebase businessTypes save error:', e));
  }, 1000);
}

/**
 * Updates specific rows in the UI tables instead of re-rendering everything.
 */
function updateRowInTables(id) {
  const p = prospects.find(x => x.id === id);
  if (!p) return;

  // Dashboard Table
  const dashRow = document.querySelector(`#tableBody tr[data-rid="${id}"]`);
  if (dashRow) dashRow.outerHTML = buildRowHtml(p, 'dashboard');

  // Prospects Page Table
  const proRow = document.querySelector(`#proTableBody tr[data-rid="${id}"]`);
  if (proRow) proRow.outerHTML = buildRowHtml(p, 'full');

  // Update Kanban if visible
  const kanbanPage = document.getElementById('page-kanban');
  if (kanbanPage && kanbanPage.classList.contains('active')) renderKanban();
  
  // Update KPI counters
  renderKPI();
  renderHero();
}

// ─── LOAD FROM FIRESTORE & REALTIME DATA SYNC ───
const SYNC_VERSION = '1.1'; // Increment to force cache clear if needed
const MY_USER_ID = (() => {
  let id = localStorage.getItem('synaptic_user_uid');
  if (!id) {
    id = 'user_' + Math.random().toString(36).substr(2, 9);
    localStorage.setItem('synaptic_user_uid', id);
  }
  return id;
})();

var prospectsListener = null;
var fixesListener = null;
var teamListener = null;
var presenceListener = null;
var eventsListener = null;

var onlineUsers = [];
var activeViewingIds = {}; // userId -> prospectId
var globalEvents = [];

function updatePresence(currentProspectId = null) {
  if (!dbReady || !db) return;
  const name = localStorage.getItem('synaptic_user_name') || 'Anonyme';
  db.collection('presence').doc(MY_USER_ID).set({
    name: name,
    lastSeen: Date.now(),
    viewing: currentProspectId,
    timestamp: firebase.firestore.FieldValue.serverTimestamp()
  }, { merge: true });
}

// Start heartbeat
setInterval(() => updatePresence(window.modalProspectId || null), 45000);

function renderActivityFeed() {
  const el = document.getElementById('activityFeedBody');
  if (!el) return;
  if (globalEvents.length === 0) {
    el.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text3); font-size:13px">En attente d\'activité...</div>';
    return;
  }
  el.innerHTML = globalEvents.map(ev => {
    const time = ev.timestamp ? new Date(ev.timestamp.toMillis()).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : 'Maintenant';
    let icon = '⚡';
    if (ev.type === 'win') icon = '🏆';
    if (ev.type === 'new') icon = '👤';
    
    return `
      <div class="activity-item">
        <div class="activity-icon">${icon}</div>
        <div class="activity-info">
          <div class="activity-user">${ev.userName}</div>
          <div class="activity-msg">${ev.message}</div>
          <div class="activity-time">${time}</div>
        </div>
      </div>
    `;
  }).join('');
}

function initRealtimeSync() {
  // 1. Team Presence (Previous implementation)
  presenceListener = db.collection('presence').onSnapshot(snap => {
    const now = Date.now();
    const users = [];
    const viewing = {};
    snap.forEach(doc => {
      const u = doc.data();
      u.id = doc.id;
      if (u.lastSeen && (now - u.lastSeen) < 120000) {
        users.push(u);
        if (u.viewing && u.id !== MY_USER_ID) {
          viewing[u.viewing] = viewing[u.viewing] || [];
          viewing[u.viewing].push(u.name);
        }
      }
    });
    onlineUsers = users;
    activeViewingIds = viewing;
    renderPresenceWidget();
    renderProspectsTable();
  });

  // 2. Global Events (Sales won, new leads) + Activity Feed
  eventsListener = db.collection('global_events').orderBy('timestamp', 'desc').limit(15).onSnapshot(snap => {
    const events = [];
    snap.forEach(doc => events.push({ id: doc.id, ...doc.data() }));
    globalEvents = events;
    renderActivityFeed();

    // Real-time Toast/Confetti for new events only
    snap.docChanges().forEach(change => {
      if (change.type === 'added') {
        const ev = change.doc.data();
        if (ev.userId !== MY_USER_ID && (Date.now() - (ev.timestamp?.toMillis() || Date.now()) < 10000)) {
          showToast(`🚀 ${ev.userName} : ${ev.message}`, 'success');
          if (ev.type === 'win' && typeof confetti === 'function') confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });
        }
      }
    });
  });

  teamListener = db.collection('config').doc('team').onSnapshot(function (doc) {
    if (doc.exists && doc.data().data) {
      teamMembers = doc.data().data;
      renderSettingsTeam();
      updateRespSelects();
    }
  });

  prospectsListener = db.collection('prospects').onSnapshot(function (snap) {
    const loaded = [];
    snap.forEach(doc => {
      const p = doc.data();
      if (p.valeur !== undefined && p.valeurFixe === undefined) {
        p.valeurFixe = Number(p.valeur) || 0;
        p.valeurMensuelle = 0;
        delete p.valeur;
      }
      loaded.push(p);
    });

    if (loaded.length === 0 && !dbReady) {
      handleMigrationOrDefaults();
      return;
    }

    prospects = loaded;
    dbReady = true;
    onSyncComplete();
  }, function (error) {
    console.warn('Realtime sync error (prospects), falling back to local:', error);
    fallbackToLocal();
  });

  fixesListener = db.collection('fixes').onSnapshot(function (snap) {
    const loaded = [];
    snap.forEach(doc => loaded.push(doc.data()));
    fixes = loaded.sort((a, b) => b.createdAt - a.createdAt);
    renderFixBoard();
  });
}

function handleMigrationOrDefaults() {
  db.collection('config').doc('prospects').get().then(doc => {
    if (doc.exists && doc.data().data) {
      prospects = doc.data().data;
      prospects.forEach(p => db.collection('prospects').doc(p.id).set(p));
    } else {
      try {
        const saved = localStorage.getItem('synaptic_prospects');
        prospects = saved ? JSON.parse(saved) : getDefaultProspects();
      } catch (e) { prospects = getDefaultProspects(); }
      prospects.forEach(p => db.collection('prospects').doc(p.id).set(p));
    }
    dbReady = true;
    onSyncComplete();
  });

  db.collection('config').doc('businessTypes').get().then(doc => {
    if (doc.exists && doc.data().data) {
      businessTypes = doc.data().data;
    } else {
      try {
        const saved = localStorage.getItem('synaptic_business_types');
        businessTypes = saved ? JSON.parse(saved) : ['PME', 'ETI', 'Groupe', 'Garage', 'Avocat', 'Indépendant'];
      } catch (e) { businessTypes = ['PME', 'ETI', 'Groupe', 'Garage', 'Avocat', 'Indépendant']; }
      db.collection('config').doc('businessTypes').set({ data: businessTypes });
    }
  });
}

function fallbackToLocal() {
  try {
    const saved = localStorage.getItem('synaptic_prospects');
    prospects = saved ? JSON.parse(saved) : getDefaultProspects();
  } catch (e) { prospects = getDefaultProspects(); }

  try {
    const saved = localStorage.getItem('synaptic_business_types');
    businessTypes = saved ? JSON.parse(saved) : ['PME', 'ETI', 'Groupe', 'Garage', 'Avocat', 'Indépendant'];
  } catch (e) { businessTypes = ['PME', 'ETI', 'Groupe', 'Garage', 'Avocat', 'Indépendant']; }

  dbReady = true;
  onSyncComplete();
}

function hideSplashScreen() {
  const splash = document.getElementById('appSplash');
  if (splash) splash.classList.add('splash-hidden');
}

function onSyncComplete() {
  updateTypeSelects();
  renderAll();

  if (!window.initialLoadDone) {
    window.initialLoadDone = true;
    
    // Hide splash only when data is ready
    setTimeout(hideSplashScreen, 800);

    const lastP = localStorage.getItem('synaptic_last_page');
    // ... logic for last page ...
    switchPage(lastP || 'dashboard');

    setTimeout(() => {
      document.documentElement.classList.add('loaded');
      
      // ONBOARDING SEQUENCE
      if (!localStorage.getItem('synaptic_user_name')) {
        // Step 1: Welcome Modal (Identity)
        toggleModal('welcomeModalBg', true);
        document.getElementById('welcomeNameInput').focus();
      } else if (!localStorage.getItem('synaptic_tour_completed')) {
        // Step 2: If name already exists but tour not done, start tour
        startTour();
      }
    }, 1200);
  }
}

// Adapt existing switchPage
const originalSwitchPage = typeof switchPage === 'function' ? switchPage : null;
window.switchPage = function (id, btn) {
  // Logic to hide/show pages
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const targetPage = document.getElementById('page-' + id);
  if (targetPage) {
    targetPage.classList.add('active');
    const now = Date.now();
    localStorage.setItem('synaptic_last_page', id);
    localStorage.setItem('synaptic_last_page_time', now);

    if (window.sessionTimeout) clearTimeout(window.sessionTimeout);
    window.sessionTimeout = setTimeout(() => {
      if (id !== 'dashboard') {
        window.switchPage('dashboard');
        showToast('Retour au Dashboard (Inactivité > 30 min)', 'info');
      }
    }, 30 * 60 * 1000);
  }
  
  document.querySelectorAll('.sidebar-item').forEach(b => b.classList.remove('active'));
  // Find button if not provided
  if (!btn) btn = document.getElementById('nav-' + id);
  if (btn) btn.classList.add('active');
  
  const badge = document.getElementById('pageBadge');
  if (badge) badge.textContent = pageNames[id] || id;
  
  closeSidebar();

  if (id === 'dashboard') {
    window.pipeAnimated = false;
    renderAll();
  }
  if (id === 'kanban') renderKanban();
  if (id === 'fixe') renderFixBoard();
  if (id === 'parametres') {
    renderSettingsTeam();
    renderSettingsBusinessTypes();
    const input = document.getElementById('settingUserName');
    if (input) input.value = localStorage.getItem('synaptic_user_name') || 'Synaptics';
  }
  if (id === 'prospects') {
    renderProPersonBtns();
    renderProSegments();
    renderProspectsTable();
  }
};

const stageMap = { 'new': 'Nouveaux', 'contact': 'Contactés', 'prop': 'Proposition', 'nego': 'Négociation', 'gagne': 'Gagnés' };
const subStages = { rdv_effectue: 'rdv_planifie', signe: 'perdu' };
const subNames = { rdv_planifie: 'RDV planifié', perdu: 'Perdu' };
const pColors = [
  { fill: '#A78BFA', stroke: '#A78BFA' },
  { fill: '#8B5CF6', stroke: '#8B5CF6' },
  { fill: '#7C3AED', stroke: '#7C3AED' },
  { fill: '#6D28D9', stroke: '#6D28D9' },
];
var currentData = [];
let selStage = null;

function getDefaultProspects() {
  return [];
}

function getACV(p) {
  const f = Number(p.valeurFixe) || 0;
  const m = Number(p.valeurMensuelle) || 0;
  return f + (m * 12);
}

function computePipelineData() {
  const stageIndex = { appeler: 0, new: 0, appele: 1, contact: 1, repondu: 2, prop: 2, rdv_planifie: 3, rdv_effectue: 3, nego: 3, signe: 4, gagne: 4 };
  currentData = new Array(pipeKeys.length).fill(0);
  prospects.forEach(p => {
    const idx = stageIndex[p.statut];
    if (idx === undefined) return;
    for (let i = 0; i <= idx; i++) currentData[i]++;
  });
}

// ─── LIVE CALL LOGIC ───
let callStartTime = null;
let callInterval = null;

function startCallTimer() {
  if (callInterval) return;
  callStartTime = Date.now();
  callInterval = setInterval(updateCallTimer, 1000);
  document.getElementById('callTimerWrap').innerHTML = `<div class="timer-badge">
    <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" fill="none" stroke-width="2.5"><path d="M12 6v6l4 2"/></svg>
    <span id="callRunningTime">00:00</span>
  </div>`;
}

function updateCallTimer() {
  const elapsed = Math.floor((Date.now() - callStartTime) / 1000);
  const m = Math.floor(elapsed / 60).toString().padStart(2, '0');
  const s = (elapsed % 60).toString().padStart(2, '0');
  const el = document.getElementById('callRunningTime');
  if (el) el.textContent = `${m}:${s}`;
  const dur = document.getElementById('callDuree');
  if (dur) dur.value = Math.ceil(elapsed / 60);
}

function stopCallTimer() {
  clearInterval(callInterval);
  callInterval = null;
  callStartTime = null;
}

function buildRowHtml(p, view = 'full') {
  const isChecked = new Set(getProSelectedIds()).has(p.id) ? 'checked' : '';
  const [bg, fg] = (p.av || '#E6F1FB:#185FA5').split(':');
  const sc = p.score > 70 ? '#639922' : p.score > 40 ? '#BA7517' : '#E24B4A';
  const today = new Date().toISOString().split('T')[0];

  const createdStr = p.date ? new Date(p.date).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';
  const relanceStr = p.dateRelance ? new Date(p.dateRelance).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';
  const isRelanceUrg = p.dateRelance && p.dateRelance <= today && p.statut !== 'signe' && p.statut !== 'perdu';
  const relanceClass = isRelanceUrg ? 'relance-urg' : '';
  const relanceIndicator = isRelanceUrg ? '<span class="status-indicator"></span>' : '';

  if (view === 'dashboard') {
    const notePreview = p.note ? (p.note.length > 25 ? p.note.substring(0, 25) + '...' : p.note) : '—';
    return `<tr data-rid="${p.id}">
      <td>
        <div class="prospect-name">
          <span onclick="togglePriority('${p.id}', event)" style="cursor:pointer; font-size:16px; color:${p.isPriority ? 'var(--orange)' : 'var(--text3)'}; margin-right:4px">
            ${p.isPriority ? '★' : '☆'}
          </span>
          <div class="av-sm" style="background:${bg};color:${fg}">${p.initiales || '+'}</div>
          <span style="font-weight:600">${p.nom || ''}</span>
        </div>
      </td>
      <td><span class="badge-select" style="${badgeCss[p.statut] || ''};pointer-events:none;cursor:default;font-size:10px">${statusMap[p.statut] || p.statut}</span></td>
      <td><div class="score-wrap"><div class="score-track"><div class="score-fill" style="width:${p.score || 0}%;background:${sc}"></div></div><span style="font-size:11px;color:var(--text2);margin-left:8px">${p.score || 0}%</span></div></td>
      <td>${respSelectHtml(p)}</td>
      <td><div class="note-cell" title="${(p.note || 'Pas de note').replace(/"/g, '&quot;')}" onclick="openNoteModal('${p.id}')"><svg class="note-icon"><use href="#icon-edit"/></svg><span>${notePreview}</span></div></td>
      <td style="font-weight:700; color:var(--text); font-size:12px">
        <div style="display:flex; flex-direction:column; align-items:flex-end">
          <div>${(Number(p.valeurFixe) || 0).toLocaleString('fr-FR')}€${p.valeurMensuelle > 0 ? `<span style="font-size:10px; color:var(--text3); font-weight:400"> + ${p.valeurMensuelle}€/m</span>` : ''}</div>
        </div>
      </td>
    </tr>`;
  }

  return `<tr data-rid="${p.id}" class="${p.statut === 'perdu' ? 'row-done' : ''} ${p.statut === 'npai' ? 'row-npai' : ''}">
    <td><input type="checkbox" class="pro-row-cb" value="${p.id}" ${isChecked} onclick="updateProBulkBar()"/></td>
    <td>
      <div class="prospect-name">
        <span onclick="togglePriority('${p.id}', event)" style="cursor:pointer; font-size:16px; color:${p.isPriority ? 'var(--orange)' : 'var(--text3)'}; margin-right:8px; line-height:1">
          ${p.isPriority ? '★' : '☆'}
        </span>
        <div class="av-sm" style="background:${bg};color:${fg}">${p.initiales || '+'}</div>
        <span style="font-weight:600">${p.nom || ''}</span>
        ${(activeViewingIds[p.id] || []).length > 0 ? `
          <div class="view-indicator">
            ${activeViewingIds[p.id].map(name => `<div class="view-avatar" title="${name} consulte ce prospect">${name.charAt(0)}</div>`).join('')}
          </div>
        ` : ''}
      </div>
    </td>
    <td style="font-size:12px;color:var(--text2)">${p.telephone || '—'}</td>
    <td style="font-size:12px;color:var(--text2)">${p.email || '—'}</td>
    <td style="font-size:12px;color:var(--text2)">${p.entreprise || '—'}</td>
    <td style="font-size:12px;color:var(--text2)">
      ${typeEntrepriseSelectHtml(p)} 
      ${p.nbLocations && p.nbLocations > 1 ? `<span style="font-size:10px;background:var(--surface2);padding:1px 4px;border-radius:4px;margin-left:4px" title="Nombre de locations">×${p.nbLocations}</span>` : ''}
    </td>
    <td>${statusSelectHtml(p)}</td>
    <td style="font-weight:600; font-size:12px">
      <div style="display:flex; flex-direction:column">
        <div>${(Number(p.valeurFixe) || 0).toLocaleString('fr-FR')}€</div>
        ${p.valeurMensuelle > 0 ? `<div style="font-size:10px; color:var(--text3); font-weight:400">+ ${p.valeurMensuelle}€/m</div>` : ''}
      </div>
    </td>
    <td><div class="score-wrap"><div class="score-track"><div class="score-fill" style="width:${p.score || 0}%;background:${sc}"></div></div><span style="font-size:11px;margin-left:5px">${p.score || 0}%</span></div></td>
    <td style="font-size:12px;color:var(--text2)">${respSelectHtml(p)}</td>
    <td style="font-size:11px;color:var(--text3)">${createdStr}</td>
    <td class="${relanceClass}" style="font-size:11px;font-weight:${isRelanceUrg ? '600' : '400'}">${relanceIndicator}${relanceStr}</td>
    <td><div class="note-cell-icon" data-tt="${(p.note || 'Pas de note').replace(/"/g, '&quot;')}" onclick="openNoteModal('${p.id}')"><svg><use href="#icon-edit"/></svg></div></td>
    <td><button class="btn-action" onclick="openModal('${p.id}')">Détails</button></td>
  </tr>`;
}

function respSelectHtml(p) {
  const resp = p.resp || '';
  const exists = teamMembers.some(m => m.name === resp);
  const orphanOpt = (resp && !exists) ? `<option value="${resp}" selected>⚠️ ${resp} (ex-membre)</option>` : '';
  const defaultOpt = !resp ? '<option value="" selected disabled>Choisir...</option>' : '';

  return `<select class="ghost-input" onchange="updateInline('${p.id}', 'resp', this.value)" style="font-weight:600;width:auto">
    ${defaultOpt}
    ${orphanOpt}
    ${teamMembers.map(m => `<option value="${m.name}" ${m.name === resp ? 'selected' : ''}>${m.name}</option>`).join('')}
  </select>`;
}

function avatarFromName(name) {
  if (!name) return { initiales: '?', av: '#DDD:#666' };
  const words = name.split(' ');
  const ini = words.map(w => w[0]).join('').substring(0, 2).toUpperCase();
  const hash = name.split('').reduce((acc, char) => char.charCodeAt(0) + ((acc << 5) - acc), 0);
  const colors = [
    '#E6F1FB:#185FA5', '#EEEDFE:#534AB7', '#EAF3DE:#0F6E56',
    '#FAEEDA:#854F0B', '#FFF3CD:#856404', '#FCEBEB:#A32D2D'
  ];
  const av = colors[Math.abs(hash) % colors.length];
  return { initiales: ini, av };
}

function statusSelectHtml(p) {
  const s = p.statut || 'appeler';
  const badge = badgeCss[s] || badgeCss.appeler;
  return `<div class="status-cell">
    <select class="badge-select" style="${badge}" onchange="changeStatus('${p.id}', this.value)">
      ${Object.entries(statusMap).map(([k, v]) =>
    `<option value="${k}" ${k === s ? 'selected' : ''}>${v}</option>`).join('')}
    </select>
  </div>`;
}

function typeEntrepriseSelectHtml(p) {
  const current = p.typeEntreprise || '';
  const exists = businessTypes.includes(current);
  const orphanOpt = (current && !exists) ? `<option value="${current}" selected>⚠️ ${current}</option>` : '';
  return `<select class="ghost-input" onchange="updateInline('${p.id}', 'typeEntreprise', this.value)" style="width:auto; font-weight:500">
    <option value="" ${!current ? 'selected' : ''}>—</option>
    ${orphanOpt}
    ${businessTypes.map(t => `<option value="${t}" ${t === current ? 'selected' : ''}>${t}</option>`).join('')}
  </select>`;
}

function quickCallResult(res, label) {
  const resEl = document.getElementById('callResultat');
  if (resEl) resEl.value = res;
  const noteEl = document.getElementById('callNote');
  if (noteEl) noteEl.value = label + " - " + new Date().toLocaleTimeString();
  addCall();
}

function renderSparkline() {
  const el = document.getElementById('activitySparkline');
  if (!el) return;

  const data = [];
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const ds = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');

    const newPros = prospects.filter(p => (p.date || '').split('T')[0] === ds).length;
    const newCalls = prospects.reduce((s, p) => s + (p.appels || []).filter(a => (a.date || '').split('T')[0] === ds).length, 0);
    data.push(newPros + newCalls);
  }

  const W = el.clientWidth || 200, H = 140;
  const max = Math.max(...data, 1);
  const points = data.map((v, i) => `${(i * W) / (data.length - 1)},${H - (v / max) * H * 0.8 - 10}`).join(' ');

  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="100%" height="100%" preserveAspectRatio="none">
    <defs>
      <linearGradient id="sparkGradient" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="var(--blue)" stop-opacity="0.4" />
        <stop offset="100%" stop-color="var(--blue)" stop-opacity="0" />
      </linearGradient>
    </defs>
    <path d="M 0 ${H} L ${points} L ${W} ${H} Z" fill="url(#sparkGradient)" />
    <polyline points="${points}" fill="none" stroke="var(--blue)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="filter: drop-shadow(0 4px 6px rgba(99, 102, 241, 0.4))" />
    ${data.map((v, i) => {
    const x = (i * W) / (data.length - 1);
    const y = H - (v / max) * H * 0.8 - 10;
    const d = new Date(today);
    d.setDate(d.getDate() - (6 - i));
    const dateStr = d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
    return `<circle cx="${x}" cy="${y}" r="6" fill="var(--blue)" stroke="#1a1a1a" stroke-width="1.5" 
        data-tt="${dateStr} : ${v} activité${v > 1 ? 's' : ''}" style="cursor:pointer" />`;
  }).join('')}
  </svg>`;

  const daysEl = document.getElementById('activityDays');
  if (daysEl) {
    daysEl.innerHTML = data.map((v, i) => {
      const d = new Date(today);
      d.setDate(d.getDate() - (6 - i));
      const dayName = d.toLocaleDateString('fr-FR', { weekday: 'short' }).replace('.', '').toUpperCase();
      return `<span>${dayName}</span>`;
    }).join('');
  }
}

function renderAll() {
  computePipelineData();
  renderHero();
  renderKPI();
  renderPipeline();
  renderConv();
  renderTable();
  renderProspectsTable();
  renderTeamStats();
  renderKanban();
  renderFixBoard();
  renderSparkline();
}

function renderKPI() {
  const today = new Date().toISOString().split('T')[0];
  const tousSaufPerdus = prospects.filter(p => p.statut !== 'perdu' && p.statut !== 'npai' && funnelStatuses.includes(p.statut));
  const activelyHeld = tousSaufPerdus.filter(p => !['signe', 'gagne'].includes(p.statut));

  const valeurTotale = tousSaufPerdus.reduce((s, p) => s + getACV(p), 0);
  const valeurGagne = prospects.filter(p => (p.statut === 'signe' || p.statut === 'gagne')).reduce((s, p) => s + getACV(p), 0);
  const convGlobal = prospects.length > 0 ? Math.round(prospects.filter(p => p.statut === 'signe').length / prospects.length * 100) : 0;
  const enRetard = prospects.filter(p => p.dateRelance && p.dateRelance < today && p.statut !== 'signe' && p.statut !== 'perdu').length;

  const kpis = [
    { label: 'Prospects (Gagnés + Actifs)', val: tousSaufPerdus.length, icon: '<svg><use href="#icon-users"/></svg>', bg: 'var(--blue-l)', fg: 'var(--blue-d)' },
    { label: 'Potentiel Total (Tout)', val: valeurTotale.toLocaleString('fr-FR') + ' €', icon: '<svg><use href="#icon-dollar"/></svg>', bg: 'var(--purple-l)', fg: 'var(--purple-d)' },
    { label: 'Chiffre d\'Affaire (Signé)', val: valeurGagne.toLocaleString('fr-FR') + ' €', icon: '<svg><use href="#icon-check-circle"/></svg>', bg: 'var(--green-l)', fg: 'var(--green-d)' },
    { label: 'Conversion globale', val: convGlobal + '%', icon: '<svg><use href="#icon-activity"/></svg>', bg: 'var(--teal-l)', fg: 'var(--teal-d)', sub: convGlobal >= 20 ? 'c-up' : 'c-dn' },
    { label: 'Relances en retard', val: enRetard, icon: '<svg><use href="#icon-clock"/></svg>', bg: enRetard > 0 ? 'var(--red-l)' : 'var(--green-l)', fg: enRetard > 0 ? 'var(--red-d)' : 'var(--green-d)' },
  ];

  const kpiEl = document.getElementById('kpiRow');
  if (kpiEl) {
    kpiEl.innerHTML = kpis.map(k => `<div class="kpi">
      <div class="kpi-label"><span>${k.label}</span><div class="kpi-icon" style="background:${k.bg};color:${k.fg}">${k.icon}</div></div>
      <div class="kpi-val">${k.val}</div>
    </div>`).join('');
  }
}

// ─── STATUS MULTI-SELECT ───
function toggleStatusDropdown(e) {
  e.stopPropagation();
  document.getElementById('statusOptions').classList.toggle('show');
}
window.addEventListener('click', () => { 
  const el = document.getElementById('statusOptions');
  if (el) el.classList.remove('show'); 
});

function getSelectedStatuses() {
  const cbs = document.querySelectorAll('.status-cb:checked');
  return Array.from(cbs).map(cb => cb.value);
}

function toggleOneStatus(e, val) {
  e.stopPropagation();
  const cb = e.currentTarget.querySelector('input');
  if (e.target.tagName !== 'INPUT') cb.checked = !cb.checked;
  updateStatusLabel();
  renderTable();
}

function toggleAllStatuses(e) {
  e.stopPropagation();
  const master = document.getElementById('checkAllStatus');
  if (e.target.tagName !== 'INPUT') master.checked = !master.checked;
  const cbs = document.querySelectorAll('.status-cb');
  cbs.forEach(cb => {
    if (cb.value !== 'exemple') cb.checked = master.checked;
  });
  updateStatusLabel();
  renderTable();
}

function updateStatusLabel() {
  const st = getSelectedStatuses();
  const label = document.getElementById('statusTriggerLabel');
  const master = document.getElementById('checkAllStatus');
  const realStatusesCount = document.querySelectorAll('.status-cb:not([value="exemple"])').length;
  const selectedRealCount = Array.from(document.querySelectorAll('.status-cb:not([value="exemple"]):checked')).length;

  if (selectedRealCount === realStatusesCount && !document.querySelector('.status-cb[value="exemple"]:checked')) {
    label.innerHTML = 'Tous les statuts';
    master.checked = true;
  } else if (st.length === 0) {
    label.innerHTML = 'Aucun filtrage';
    master.checked = false;
  } else {
    label.innerHTML = `${st.length} statut${st.length > 1 ? 's' : ''}`;
    master.checked = selectedRealCount === realStatusesCount;
  }
}

// ─── SORT ───
var sortCol = null, sortDir = 'asc';
function sortTable(col) {
  if (sortCol === col) { sortDir = sortDir === 'asc' ? 'desc' : 'asc'; }
  else { sortCol = col; sortDir = 'asc'; }
  document.querySelectorAll('.sort-icon').forEach(el => { el.textContent = ''; el.parentElement.classList.remove('sort-active'); });
  const icon = document.getElementById('sort-' + col);
  if (icon) { icon.textContent = sortDir === 'asc' ? '▲' : '▼'; icon.parentElement.classList.add('sort-active'); }
  renderTable();
}

function selectStage(i) {
  selStage = selStage === i ? null : i;
  renderPipeline(); renderKPI();
}

// ─── PIPELINE ───
const ns = 'http://www.w3.org/2000/svg';
function renderPipeline() {
  const svg = document.getElementById('pipeline');
  if (!svg) return;
  svg.innerHTML = '';
  const W = 800, H = 220, mid = H / 2, max = currentData[0] || 1;
  const MIN_H = 6;
  const rawH = currentData.map(v => Math.max(MIN_H, (v / max) * (H * 0.78)));
  const visH = [rawH[0]];
  for (let j = 1; j < rawH.length; j++) { visH[j] = Math.max(MIN_H, Math.min(rawH[j], visH[j - 1] * 0.85)); }

  for (let i = 0; i < currentData.length - 1; i++) {
    const sv = visH[i], ev = visH[i + 1];
    const x1 = i * 200, x2 = (i + 1) * 200;
    const sT = mid - sv / 2, sB = mid + sv / 2, eT = mid - ev / 2, eB = mid + ev / 2;
    const cx = (x1 + x2) / 2;
    const d = `M ${x1} ${sT} C ${cx} ${sT},${cx} ${eT},${x2} ${eT} L ${x2} ${eB} C ${cx} ${eB},${cx} ${sB},${x1} ${sB} Z`;
    const op = selStage === null || selStage === i || selStage === i + 1 ? '0.88' : '0.22';
    const p = document.createElementNS(ns, 'path');
    p.setAttribute('d', d); p.setAttribute('fill', pColors[i].fill);
    p.setAttribute('stroke', pColors[i].stroke); p.setAttribute('stroke-width', '0.5');
    p.setAttribute('cursor', 'pointer');
    p.dataset.baseOpacity = op;

    if (!window.pipeAnimated) {
      p.style.opacity = '0';
      p.style.animation = `pipeReveal 0.25s cubic-bezier(0.25, 0.46, 0.45, 0.94) ${i * 0.25}s forwards`;
      p.addEventListener('animationend', () => {
        p.style.opacity = p.dataset.baseOpacity;
        p.style.animation = 'none';
        if (i === currentData.length - 2) window.pipeAnimated = true;
      });
    } else {
      p.style.opacity = op;
      p.style.animation = 'none';
    }

    p.addEventListener('mouseenter', e => { p.style.opacity = '1'; showTT(e, i); });
    p.addEventListener('mouseleave', e => { p.style.opacity = p.dataset.baseOpacity; hideTT(); });
    p.addEventListener('mousemove', e => moveTT(e));
    p.addEventListener('click', () => selectStage(i));
    svg.appendChild(p);
  }

  for (let i = 0; i < currentData.length - 1; i++) {
    const cx = i * 200 + 100;
    const pct = currentData[i] > 0 ? Math.round(currentData[i + 1] / currentData[i] * 100) : 0;
    const t = document.createElementNS(ns, 'text');
    t.setAttribute('x', cx);
    t.setAttribute('y', mid + 5);
    t.setAttribute('text-anchor', 'middle');
    t.setAttribute('font-size', '12'); t.setAttribute('font-weight', '800');
    t.setAttribute('fill', '#ffffff');
    t.style.pointerEvents = 'none';
    t.style.userSelect = 'none';
    if (!window.pipeAnimated) {
      t.setAttribute('opacity', '0');
      t.style.animation = `fadeIn 0.2s ease ${i * 0.25 + 0.15}s forwards`;
    } else {
      t.setAttribute('opacity', '1');
    }
    t.textContent = pct + '%';
    svg.appendChild(t);
  }

  window.pipeAnimated = true;
  const labDiv = document.getElementById('stageLabels');
  if (labDiv) {
    labDiv.innerHTML = stageNames.map((n, i) => {
      const sVal = prospects.filter(p => stageIndex[p.statut] === i).reduce((s, p) => s + getACV(p), 0);
      return `<div class="sl"><span>${n}</span><strong>${currentData[i]}</strong><div style="font-size:10px;opacity:0.7">${sVal.toLocaleString('fr-FR')}€</div></div>`;
    }).join('');
  }
}

function showTT(e, i) {
  const sv = currentData[i], ev = currentData[i + 1];
  const pct = sv > 0 ? Math.round(ev / sv * 100) : 0, lost = sv - ev;
  const sVal = prospects.filter(p => stageIndex[p.statut] === i).reduce((s, p) => s + getACV(p), 0);

  const tt = document.getElementById('ptt');
  if (tt) {
    tt.innerHTML = `<div class="tt-title">${stageNames[i]} → ${stageNames[i + 1]}</div>
    <div class="tt-row"><span>Entrée</span><span>${sv}</span></div>
    <div class="tt-row"><span>Sortie</span><span>${ev}</span></div>
    <div class="tt-row"><span>Valeur</span><span>${sVal.toLocaleString('fr-FR')}€</span></div>
    <div class="tt-row"><span>Perdus</span><span style="color:#E24B4A">−${lost}</span></div>
    <div class="tt-row"><span>Taux</span><span style="color:#3B6D11">${pct}%</span></div>`;
    tt.style.opacity = '1'; moveTT(e);
  }
}
function moveTT(e) {
  const pipe = document.getElementById('pipeline');
  if (!pipe) return;
  const r = pipe.getBoundingClientRect();
  const tt = document.getElementById('ptt');
  if (tt) {
    tt.style.left = (e.clientX - r.left + 12) + 'px';
    tt.style.top = (e.clientY - r.top - 10) + 'px';
  }
}
function hideTT() { 
  const tt = document.getElementById('ptt');
  if (tt) tt.style.opacity = '0'; 
}

// ─── TEAM STATS ───
function renderTeamStats() {
  const el = document.getElementById('teamStatsBody');
  if (!el) return;
  const funnelStatuses = ['appeler', 'new', 'appele', 'contact', 'repondu', 'prop', 'rdv_planifie', 'rdv_effectue', 'nego', 'signe', 'gagne'];

  el.innerHTML = teamMembers.map(m => {
    const mine = prospects.filter(p => p.resp === m.name);
    const actives = mine.filter(p => funnelStatuses.includes(p.statut) && !['signe', 'gagne', 'perdu', 'npai'].includes(p.statut)).length;
    const wins = mine.filter(p => (p.statut === 'signe' || p.statut === 'gagne')).length;
    const conv = mine.length > 0 ? Math.round((wins / mine.length) * 100) : 0;
    const cls = conv >= 25 ? 'c-up' : conv >= 10 ? 'c-nu' : 'c-dn';

    const today = new Date().toISOString().split('T')[0];
    const callsToday = mine.reduce((s, p) => s + (p.appels || []).filter(a => a.date === today).length, 0);
    const fire = callsToday >= 20 ? ' <span title="En feu ! Plus de 20 appels passés aujourd\'hui" style="font-size:14px;">🔥</span>' : '';

    return `<div class="resp-item"><div class="av" style="background:${m.bg};color:${m.fg}">${m.name[0]}</div><div class="resp-name">${m.name}${fire}</div><div class="resp-stats"><div class="rs"><b>${actives}</b> actifs</div><div class="rs ${cls}"><b>${conv}%</b> conv.</div></div></div>`;
  }).join('');
}

// ─── CONVERSION ───
const convLabels = ['Nouveau → Contacté', 'Contacté → Proposition', 'Proposition → Négociation', 'Négociation → Gagné'];
const convColors = ['#378ADD', '#7F77DD', '#EF9F27', '#1D9E75'];
function renderConv() {
  let html = '';
  for (let i = 0; i < currentData.length - 1; i++) {
    const pct = currentData[i] > 0 ? Math.round(currentData[i + 1] / currentData[i] * 100) : 0;
    html += `<div class="conv-item">
      <div class="conv-lbl">${convLabels[i]}</div>
      <div class="conv-track"><div class="conv-fill" style="width:${pct}%;background:${convColors[i]}"></div></div>
      <div class="conv-pct">${pct}%</div>
    </div>`;
  }
  const g = currentData[0] > 0 ? Math.round(currentData[currentData.length - 1] / currentData[0] * 100) : 0;
  html += `<div class="conv-item global-row">
    <div class="conv-lbl" style="font-weight:600;color:var(--text)">Conversion globale</div>
    <div class="conv-track"><div class="conv-fill" style="width:${g}%;background:#639922"></div></div>
    <div class="conv-pct c-up" style="font-weight:600">${g}%</div>
  </div>`;
  const el = document.getElementById('convList');
  if (el) el.innerHTML = html;
}

// ─── TABLE ───
// Handled globally

let showOnlyToday = false;
function toggleTodayFilter() {
  showOnlyToday = !showOnlyToday;
  const btn = document.getElementById('btnFilterToday');
  if (showOnlyToday) btn.classList.add('active'); else btn.classList.remove('active');
  renderTable();
}

function renderTable() {
  const searchEl = document.getElementById('searchQ');
  const q = searchEl ? searchEl.value : '';
  const qLow = q.toLowerCase();
  const respEl = document.getElementById('filterResp');
  const rs = respEl ? respEl.value : '';

  let rows = prospects.filter(p => {
    if (p.statut === 'perdu' || p.statut === 'npai') return false;
    if (rs && p.resp !== rs) return false;
    if (qLow && !p.nom.toLowerCase().includes(qLow) && !p.entreprise.toLowerCase().includes(qLow)) return false;
    return true;
  });

  rows.sort((a, b) => {
    const d_a = a.date || '0', d_b = b.date || '0';
    return d_b.localeCompare(d_a); 
  });

  const display = rows.slice(0, 10);
  const body = document.getElementById('tableBody');
  if (body) body.innerHTML = display.map(p => buildRowHtml(p, 'dashboard')).join('');

  const tc = document.getElementById('tblCount');
  if (tc) tc.textContent = `${display.length} Dernier${display.length > 1 ? 's' : ''} Prospect${display.length > 1 ? 's' : ''} (Gagné et Actif${display.length > 1 ? 's' : ''})`;
}

function changeStatus(id, newStatus) {
  const p = prospects.find(x => x.id === id);
  if (p) {
    if ((newStatus === 'signe' || newStatus === 'rdv_planifie') && p.statut !== newStatus) {
      if (typeof confetti === 'function') confetti({ particleCount: 150, spread: 80, origin: { y: 0.6 } });
    }
    p.statut = newStatus;
    saveProspectDoc(p);
    updateRowInTables(id);
  }
}

function formatPhone(v) {
  v = v.replace(/\D/g, '');
  if (v.length > 10 && v.startsWith('33')) v = '0' + v.substring(2);
  if (v.length === 10) return v.replace(/(\d{2})(?=\d)/g, '$1 ').trim();
  return v;
}

function togglePriority(id, ev) {
  if (ev) ev.stopPropagation();
  const p = prospects.find(x => x.id === id);
  if (p) {
    p.isPriority = !p.isPriority;
    saveProspectDoc(p);
    updateRowInTables(id);
    showToast(p.isPriority ? 'Favoris : Prospect prioritaire' : 'Priorité retirée', 'success');
  }
}

function updateInline(id, field, value) {
  const p = prospects.find(x => x.id === id);
  if (!p) return;
  if (field === 'valeurFixe' || field === 'valeurMensuelle' || field === 'score') {
    p[field] = Number(value) || 0;
    if (field === 'score') p[field] = Math.min(100, Math.max(0, p[field]));
  } else if (field === 'telephone') {
    p[field] = formatPhone(value);
  } else if (field === 'nom') {
    p.nom = value;
    const { initiales, av } = avatarFromName(value);
    p.initiales = initiales;
    p.av = av;
  } else {
    p[field] = value;
  }
  saveProspectDoc(p);
  updateRowInTables(id);
}

function updateScoreLive(id, value, el) {
  const p = prospects.find(x => x.id === id);
  if (!p) return;
  const v = Math.min(100, Math.max(0, Number(value) || 0));
  p.score = v;
  saveProspectDoc(p);
  updateRowInTables(id);
}

// ─── MODALS UI HANDLERS ───
function toggleModal(id, open) {
  const el = document.getElementById(id);
  if (el) el.classList.toggle('open', open);
}

var modalProspectId = null;
function openModal(id = null) {
  modalProspectId = id;
  const title = document.getElementById('modalTitle');
  const btnDel = document.getElementById('btnDelProspect');
  if (id) {
    if (title) title.textContent = 'Modifier le prospect';
    if (btnDel) btnDel.style.display = 'block';
    const p = prospects.find(x => x.id === id);
    if (p) {
      document.getElementById('mNom').value = p.nom || '';
      document.getElementById('mIsPriority').checked = p.isPriority || false;
      document.getElementById('mTelephone').value = p.telephone || '';
      document.getElementById('mEmail').value = p.email || '';
      document.getElementById('mEntreprise').value = p.entreprise || '';
      updateTypeSelects(p.typeEntreprise); 
      document.getElementById('mNbLocations').value = p.nbLocations || '';
      document.getElementById('mStatut').value = p.statut || 'appeler';
      document.getElementById('mSource').value = p.source || 'LinkedIn';
      document.getElementById('mValeurFixe').value = p.valeurFixe || 0;
      document.getElementById('mValeurMensuelle').value = p.valeurMensuelle || 0;
      document.getElementById('mScore').value = p.score || 0;
      const respEl = document.getElementById('mResp');
      if (respEl) respEl.value = p.resp || (teamMembers[0] ? teamMembers[0].name : '');
      document.getElementById('mDate').value = p.date || '';
      document.getElementById('mRelance').value = p.dateRelance || '';
      document.getElementById('mNote').value = p.note || '';
    }
  } else {
    if (title) title.textContent = 'Nouveau prospect';
    if (btnDel) btnDel.style.display = 'none';
    document.getElementById('mNom').value = '';
    document.getElementById('mIsPriority').checked = false;
    document.getElementById('mTelephone').value = '';
    document.getElementById('mEmail').value = '';
    document.getElementById('mEntreprise').value = '';
    updateTypeSelects(''); 
    document.getElementById('mNbLocations').value = '';
    document.getElementById('mStatut').value = 'appeler';
    document.getElementById('mSource').value = 'LinkedIn';
    document.getElementById('mValeurFixe').value = '';
    document.getElementById('mValeurMensuelle').value = '';
    document.getElementById('mScore').value = '';
    const respEl = document.getElementById('mResp');
    if (respEl) respEl.value = teamMembers[0] ? teamMembers[0].name : '';
    document.getElementById('mDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('mRelance').value = '';
    document.getElementById('mNote').value = '';
  }
  toggleModal('modalBg', true);
}
function closeModal() { 
  toggleModal('modalBg', false);
  const btn = document.querySelector('.btn-save');
  if (btn) {
    btn.disabled = false;
    btn.textContent = 'Enregistrer';
  }
}
const modalBg = document.getElementById('modalBg');
if (modalBg) {
  modalBg.addEventListener('click', e => { if (e.target === e.currentTarget) closeModal(); });
}

document.querySelectorAll('#modalBg input, #modalBg select').forEach(el => {
  el.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      if (e.target.id === 'mNote' && e.shiftKey) return;
      saveProspect();
    }
  });
});

function closeNoteModal() { 
  const bg = document.getElementById('noteModalBg');
  if (bg) bg.classList.remove('open'); 
}

function addFastRow() {
  const newDoc = db.collection('prospects').doc();
  const nextId = newDoc.id;
  const today = new Date().toISOString().split('T')[0];
  const newP = {
    id: nextId, nom: '', isPriority: false, initiales: '+', av: '#E6F1FB:#185FA5',
    telephone: '', email: '', entreprise: '', typeEntreprise: '', nbLocations: '', statut: 'appeler', source: 'Saisie Rapide',
    valeurFixe: 0, valeurMensuelle: 0, score: 0, resp: proFilterResp || teamMembers[0]?.name || 'Grégory', date: today, dateRelance: today, note: '', appels: []
  };
  prospects.unshift(newP);
  saveProspectDoc(newP, true); // true since it's a new doc
  sortCol = null;
  sortDir = 'asc';
  proSortCol = null;
  proSortDir = 'desc';
  renderAll();
}

function saveProspect() {
  const btn = document.querySelector('.btn-save');
  if (btn) {
    if (btn.disabled) return;
    btn.disabled = true;
    btn.textContent = 'Enregistrement...';
  }

  let nomInput = document.getElementById('mNom');
  let nom = nomInput ? nomInput.value.trim() : "";
  if (!nom) nom = "Nouveau Prospect";
  const { initiales, av } = avatarFromName(nom);
  const data = {
    nom, 
    isPriority: document.getElementById('mIsPriority').checked, 
    initiales, av,
    telephone: document.getElementById('mTelephone').value.trim(),
    email: document.getElementById('mEmail').value.trim(),
    entreprise: document.getElementById('mEntreprise').value.trim(),
    typeEntreprise: document.getElementById('mTypeEntreprise').value.trim(),
    nbLocations: Number(document.getElementById('mNbLocations').value) || '',
    statut: document.getElementById('mStatut').value,
    source: document.getElementById('mSource').value,
    valeurFixe: Number(document.getElementById('mValeurFixe').value) || 0,
    valeurMensuelle: Number(document.getElementById('mValeurMensuelle').value) || 0,
    score: Math.min(100, Math.max(0, Number(document.getElementById('mScore').value) || 0)),
    resp: document.getElementById('mResp').value,
    date: document.getElementById('mDate').value,
    dateRelance: document.getElementById('mRelance').value || null,
    note: document.getElementById('mNote').value.trim(),
  };

  let savedP = null;
  const isNew = !modalProspectId;
  const oldStatus = modalProspectId ? prospects.find(p => p.id === modalProspectId)?.statut : null;

  if (modalProspectId) {
    const idx = prospects.findIndex(p => p.id === modalProspectId);
    if (idx > -1) {
      prospects[idx] = { ...prospects[idx], ...data };
      savedP = prospects[idx];
    }
  } else {
    // SECURE ID GENERATION: Use Firestore's native ID instead of Date.now()
    const newDoc = db.collection('prospects').doc();
    savedP = { id: newDoc.id, ...data, appels: [] };
    prospects.unshift(savedP);
  }

  if (savedP) {
    // BROADCAST: Collaboration Events
    if (isNew) {
      broadcastSyncEvent('new', `a ajouté un nouveau prospect : ${savedP.nom} (${savedP.entreprise})`);
    } else if (oldStatus !== 'signe' && savedP.statut === 'signe') {
      broadcastSyncEvent('win', `vient de SIGNER ${savedP.nom} ! 🎉`);
    }

    // ATOMIC SAVE: Distinguish between set and update in saveProspectDoc
    saveProspectDoc(savedP, isNew);
    
    if (modalProspectId) {
      updateRowInTables(modalProspectId);
    } else {
      renderAll();
    }
  }
  closeModal();
}

function deleteProspect(id) {
  const p = prospects.find(x => x.id === id);
  if (!p) return;
  showConfirm(`Supprimer le prospect "${p.nom}" ? Cette action est irréversible.`, () => {
    prospects = prospects.filter(x => x.id !== id);
    db.collection('prospects').doc(id).delete().catch(e => console.warn('Firestore err:', e));
    renderAll();
    saveData();
  });
}

function showConfirm(msg, callback, title = 'Confirmation') {
  const titleEl = document.getElementById('confirmTitle');
  if (titleEl) titleEl.textContent = title;
  const bodyEl = document.getElementById('confirmBody');
  if (bodyEl) bodyEl.textContent = msg;
  const overlay = document.getElementById('confirmOverlay');
  if (overlay) overlay.classList.add('show');
  const yesBtn = document.getElementById('confirmYesBtn');
  if (yesBtn) {
    const newBtn = yesBtn.cloneNode(true);
    yesBtn.parentNode.replaceChild(newBtn, yesBtn);
    newBtn.onclick = () => { closeConfirm(); callback(); };
  }
}

function closeConfirm() { 
  const el = document.getElementById('confirmOverlay');
  if (el) el.classList.remove('show'); 
}
const confirmOverlay = document.getElementById('confirmOverlay');
if (confirmOverlay) {
  confirmOverlay.addEventListener('click', e => { if (e.target === e.currentTarget) closeConfirm(); });
}

// ─── CALL HISTORY ───
var callProspectId = null;
function openCallModal(id) {
  callProspectId = id;
  const p = prospects.find(x => x.id === id);
  const title = document.getElementById('callModalTitle');
  if (title) title.querySelector('span').textContent = 'Appel — ' + (p?.nom || '');
  const dateEl = document.getElementById('callDate');
  if (dateEl) dateEl.value = new Date().toISOString().split('T')[0];
  const durEl = document.getElementById('callDuree');
  if (durEl) durEl.value = '';
  const resEl = document.getElementById('callResultat');
  if (resEl) resEl.value = 'repondu';
  const noteEl = document.getElementById('callNote');
  if (noteEl) noteEl.value = '';
  renderCallHistory();
  toggleModal('callModalBg', true);
}
function closeCallModal() { toggleModal('callModalBg', false); callProspectId = null; }
const callModalBg = document.getElementById('callModalBg');
if (callModalBg) {
  callModalBg.addEventListener('click', e => { if (e.target === e.currentTarget) closeCallModal(); });
}

function addCall() {
  const p = prospects.find(x => x.id === callProspectId);
  if (!p) return;
  if (!p.appels) p.appels = [];
  p.appels.unshift({
    date: document.getElementById('callDate').value,
    duree: Number(document.getElementById('callDuree').value) || 0,
    resultat: document.getElementById('callResultat').value,
    note: document.getElementById('callNote').value.trim()
  });
  p.date = document.getElementById('callDate').value;
  renderCallHistory();
  saveProspectDoc(p);
  updateRowInTables(callProspectId);
}

function deleteCall(idx) {
  const p = prospects.find(x => x.id === callProspectId);
  if (p && p.appels) {
    p.appels.splice(idx, 1);
    renderCallHistory();
    saveProspectDoc(p);
    updateRowInTables(callProspectId);
  }
}

const callResultLabels = { repondu: 'Répondu', messagerie: 'Messagerie', injoignable: 'Injoignable', autre: 'Autre' };

const EMAIL_TEMPLATES = {
  rappel: {
    subject: "Suite à notre échange — Synaptics",
    body: (p) => `Bonjour ${p.nom || 'Madame, Monsieur'},\n\nJe reviens vers vous suite à notre dernier échange pour savoir si vous aviez pu avancer sur votre réflexion concernant nos solutions Synaptics.\n\nJe reste à votre entière disposition pour en discuter de vive voix.\n\nBien cordialement,\n\n${p.resp || 'L\'équipe Synaptics'}`
  },
  brochure: {
    subject: "Brochure Synaptics — Solutions de Gestion CRM",
    body: (p) => `Bonjour ${p.nom || 'Madame, Monsieur'},\n\nComme convenu, je vous prie de trouver ci-dessous le lien pour consulter notre brochure complète présentant nos solutions :\n\nhttps://synaptic.fr/brochure.pdf\n\nNous restons à votre disposition pour toute question complémentaire.\n\nBien cordialement,\n\n${p.resp || 'L\'équipe Synaptics'}`
  }
};

function renderCallHistory() {
  const p = prospects.find(x => x.id === callProspectId);
  const el = document.getElementById('callHistory');
  if (!el) return;
  if (!p || !p.appels || p.appels.length === 0) {
    el.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text3);font-size:13px">Aucun appel enregistré</div>';
    return;
  }
  el.innerHTML = p.appels.map((a, i) => {
    const dateStr = a.date ? new Date(a.date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
    const resultCls = 'call-result call-result-' + (a.resultat || 'autre');
    return `<div class="call-entry">
      <div style="flex:1">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
          <span style="font-size:12px;font-weight:600;color:var(--text)">${dateStr}</span>
          <span class="${resultCls}">${callResultLabels[a.resultat] || 'Autre'}</span>
          ${a.duree ? '<span style="font-size:11px;color:var(--text3)">' + a.duree + ' min</span>' : ''}
        </div>
        ${a.note ? '<div style="font-size:12px;color:var(--text2)">' + a.note + '</div>' : ''}
      </div>
      <button class="act-btn" onclick="deleteCall(${i})" style="font-size:10px;padding:2px 6px">×</button>
    </div>`;
  }).join('');
}

function renderPresenceWidget() {
  const el = document.getElementById('presenceWidget');
  if (!el) return;
  if (onlineUsers.length <= 1) {
    el.innerHTML = `
      <div class="presence-bar">
        <div class="presence-title">Équipe en ligne</div>
        <div class="presence-status" style="padding:10px 15px; font-size:12px; color:var(--text3); font-style:italic">
          Vous êtes actuellement seul en ligne
        </div>
      </div>
    `;
    return;
  }
  const others = onlineUsers.filter(u => u.id !== MY_USER_ID);
  el.innerHTML = `
    <div class="presence-bar">
      <div class="presence-title">Équipe en ligne</div>
      <div class="presence-list">
        ${others.map(u => `<div class="presence-user" title="${u.name} (Online)">
          <div class="presence-dot"></div>
          <span>${u.name}</span>
        </div>`).join('')}
      </div>
    </div>
  `;
}

function broadcastSyncEvent(type, message) {
  if (!dbReady || !db) return;
  const name = localStorage.getItem('synaptic_user_name') || 'Anonyme';
  db.collection('global_events').add({
    type: type,
    userId: MY_USER_ID,
    userName: name,
    message: message,
    timestamp: firebase.firestore.FieldValue.serverTimestamp()
  });
}

function sendProspectEmail(id, templateType) {
  const p = prospects.find(x => x.id === id);
  if (!p) {
    showToast('Prospect introuvable', 'error');
    return;
  }
  if (!p.email) {
    showToast('Aucun email renseigné pour ce prospect', 'error');
    return;
  }

  const template = EMAIL_TEMPLATES[templateType];
  if (!template) return;

  const subject = encodeURIComponent(template.subject);
  const body = encodeURIComponent(template.body(p));
  
  const mailtoLink = `mailto:${p.email}?subject=${subject}&body=${body}`;
  window.location.href = mailtoLink;
  
  showToast(`E-mail (${templateType}) prêt à être envoyé`, 'success');
}

// ─── MULTI-SELECT & BULK ACTIONS ───
function toggleAllChecks(checked, isPro = false) {
  const cls = isPro ? '.pro-row-cb' : '.row-check';
  document.querySelectorAll(cls).forEach(cb => cb.checked = checked);
  isPro ? updateProBulkBar() : updateBulkBar();
}
function getSelectedIds(isPro = false) {
  const cls = isPro ? '.pro-row-cb' : '.row-check';
  return Array.from(document.querySelectorAll(cls + ':checked')).map(cb => isPro ? cb.value : cb.dataset.id);
}

function updateBulkBar(isPro = false) {
  const ids = getSelectedIds(isPro);
  const barId = isPro ? 'proBulkBar' : 'bulkBar';
  const bar = document.getElementById(barId);
  if (!bar) return;
  if (ids.length === 0) {
    bar.innerHTML = '';
    bar.classList.remove('active');
    return;
  }
  bar.classList.add('active');
  const statusOptions = Object.keys(statusMap).map(k => `<option value="${k}">${statusMap[k]}</option>`).join('');
  const respOptions = teamMembers.map(m => `<option value="${m.name}">${m.name}</option>`).join('');

  if (isPro) {
    bar.innerHTML = `<div class="bulk-bar" style="border-radius:24px;padding:10px 20px">
      <span style="font-size:13px;font-weight:700;margin-right:20px;color:var(--text1)">${ids.length} sélectionné${ids.length > 1 ? 's' : ''}</span>
      <select id="bulkProStatus" class="badge-select" onchange="bulkProChangeStatus()" style="background:var(--surface2);color:var(--text);border:0.5px solid var(--border2);height:38px;padding:0 15px;border-radius:12px;font-size:13px;font-weight:600;cursor:pointer;outline:none">
        <option value="" disabled selected>Changer statut...</option>
        ${statusOptions}
      </select>
      <button class="btn-action" onclick="bulkProDelete()" style="background:rgba(224,60,60,0.1);color:#ff5f5f;border:1px solid rgba(224,60,60,0.2);height:38px;padding:0 20px;border-radius:12px;font-size:13px;font-weight:600;margin-left:auto;display:flex;align-items:center;justify-content:center;transition:all 0.2s" title="Supprimer">
        Supprimer
      </button>
      <button class="bulk-close" onclick="toggleAllProChecks(false)" style="background:none;border:none;cursor:pointer;color:var(--text3);font-size:24px;padding:0 10px;margin-left:5px">&times;</button>
    </div>`;
  } else {
    bar.innerHTML = `<div class="bulk-bar">
      <span><b>${ids.length}</b> sélectionné${ids.length > 1 ? 's' : ''}</span>
      <select id="bulkStatus">${statusOptions}</select>
      <button onclick="bulkChangeStatus(false, document.getElementById('bulkStatus').value)">St.</button>
      <select id="bulkResp">${respOptions}</select>
      <button onclick="bulkAssign(false, document.getElementById('bulkResp').value)">As.</button>
      <button onclick="bulkDelete(false)" style="background:rgba(224,60,60,0.5)">Sup.</button>
      <button class="bulk-close" onclick="toggleAllChecks(false, false)">×</button>
    </div>`;
  }
}

function bulkChangeStatus(isPro, newStatus) {
  if (!newStatus) return;
  const ids = getSelectedIds(isPro);
  ids.forEach(id => { const p = prospects.find(x => x.id === id); if (p) p.statut = newStatus; });
  saveData();
  renderAll();
}
function bulkAssign(isPro, newResp) {
  const ids = getSelectedIds(isPro);
  ids.forEach(id => { const p = prospects.find(x => x.id === id); if (p) p.resp = newResp; });
  saveData();
  renderAll();
}
function bulkDelete(isPro) {
  const ids = getSelectedIds(isPro);
  if (ids.length === 0) return;
  showConfirm(`Supprimer ${ids.length} prospect(s) ? Cette action est irréversible.`, () => {
    prospects = prospects.filter(p => !ids.includes(p.id));
    ids.forEach(id => db.collection('prospects').doc(id).delete().catch(e => console.warn('Bulk erase err:', e)));
    renderAll();
    saveData();
  });
}

function toggleAllProChecks(c) { toggleAllChecks(c, true); }
function getProSelectedIds() { return getSelectedIds(true); }
function updateProBulkBar() { updateBulkBar(true); }
function bulkProChangeStatus() { bulkChangeStatus(true, document.getElementById('bulkProStatus').value); }
function bulkProDelete() { bulkDelete(true); }

function toggleSidebar() {
  const sb = document.getElementById('sidebar');
  const ov = document.getElementById('sidebarOverlay');
  sb.classList.toggle('open');
  const isOpen = sb.classList.contains('open');
  ov.classList.toggle('active', isOpen);
  document.documentElement.classList.toggle('sidebar-open', isOpen);
}
function closeSidebar() {
  const sb = document.getElementById('sidebar');
  if (sb) sb.classList.remove('open');
  const ov = document.getElementById('sidebarOverlay');
  if (ov) ov.classList.remove('active');
  document.documentElement.classList.remove('sidebar-open');
}

// pageNames moved to top

// Global activity timer reset
function resetSessionTimer() {
  const lastP = localStorage.getItem('synaptic_last_page');
  if (lastP && lastP !== 'dashboard') {
    if (window.sessionTimeout) clearTimeout(window.sessionTimeout);
    window.sessionTimeout = setTimeout(() => {
      window.switchPage('dashboard');
      showToast('Retour au Dashboard (Inactivité > 30 min)', 'info');
    }, 30 * 60 * 1000);
  }
}
['mousedown', 'keydown', 'scroll', 'touchstart'].forEach(name => {
  document.addEventListener(name, resetSessionTimer, { passive: true });
});

// ─── FIX BOARD LOGIC ───
function renderFixBoard() {
  const board = document.getElementById('fixBoard');
  if (!board) return;

  const cols = [
    { key: 'todo', label: 'À fixer', cls: 'kanban-col-todo' },
    { key: 'done', label: 'Fixé', cls: 'kanban-col-done' }
  ];

  board.innerHTML = cols.map(col => {
    const items = fixes.filter(f => f.status === col.key);
    return `
      <div class="kanban-col ${col.cls}" ondragover="allowFixDrop(event)" ondrop="dropFix(event, '${col.key}')">
        <div class="kanban-col-header">
          <span>${col.label}</span>
          <span class="kanban-col-count">${items.length}</span>
        </div>
        <div class="kanban-cards">
          ${items.sort((a, b) => b.createdAt - a.createdAt).map(f => `
            <div class="fix-card" draggable="true" ondragstart="dragFix(event, '${f.id}')">
              <div style="font-weight:500; color:var(--text); margin-bottom:12px; word-break:break-word">${f.text}</div>
              <div style="display:flex; justify-content:space-between; align-items:center; margin-top:auto">
                <div class="fix-card-date" style="margin-top:0">${f.createdAt ? new Date(f.createdAt).toLocaleDateString('fr-FR') : new Date().toLocaleDateString('fr-FR')}</div>
                <div style="display:flex; gap:6px">
                  <button onclick="openFixModal('${f.id}')" style="background:var(--surface2); border:0.5px solid var(--border); color:var(--text2); cursor:pointer; font-size:14px; padding:6px; border-radius:8px; display:flex; align-items:center; justify-content:center; transition:all 0.15s" onmouseover="this.style.background='var(--surface)';this.style.color='var(--blue)'" onmouseout="this.style.background='var(--surface2)';this.style.color='var(--text2)'" title="Modifier">
                    <svg viewBox="0 0 24 24" style="width:14px; height:14px; stroke:currentColor; fill:none; stroke-width:2.5"><use href="#icon-edit"/></svg>
                  </button>
                  <button onclick="deleteFixItem('${f.id}')" style="background:var(--red-l); border:0.5px solid var(--red-d); color:var(--red-d); cursor:pointer; font-size:14px; padding:6px; border-radius:8px; display:flex; align-items:center; justify-content:center; opacity:0.8; transition:all 0.15s" onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.8'" title="Supprimer">
                    <svg viewBox="0 0 24 24" style="width:14px; height:14px; stroke:currentColor; fill:none; stroke-width:2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                  </button>
                </div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }).join('');
}

var currentFixId = null;
function openFixModal(id = null) {
  currentFixId = id;
  const bg = document.getElementById('fixModalBg');
  const title = bg.querySelector('.modal-title');
  const textInput = document.getElementById('fText');

  if (id) {
    const f = fixes.find(x => x.id === id);
    if (f) {
      textInput.value = f.text;
      if (title) title.textContent = 'Modifier la note';
    }
  } else {
    textInput.value = '';
    if (title) title.textContent = 'Nouveau Fix / Amélioration';
  }

  toggleModal('fixModalBg', true);
  textInput.focus();
}

function closeFixModal() {
  toggleModal('fixModalBg', false);
  const el = document.getElementById('fText');
  if (el) el.value = '';
  currentFixId = null;
}

function saveFixItem() {
  const textEl = document.getElementById('fText');
  const text = textEl ? textEl.value.trim() : "";
  if (!text) return;

  let f = null;
  if (currentFixId) {
    f = fixes.find(x => x.id === currentFixId);
    if (f) f.text = text;
    showToast('Note mise à jour');
  } else {
    f = {
      id: 'f' + Date.now(),
      text: text,
      status: 'todo',
      createdAt: Date.now()
    };
    fixes.unshift(f);
    showToast('Note ajoutée au journal');
  }

  if (f) {
    saveFixDoc(f);
    renderFixBoard();
  }
  closeFixModal();
}

function deleteFixItem(id) {
  showConfirm('Supprimer cette note ? Cette action est irréversible.', () => {
    fixes = fixes.filter(f => f.id !== id);
    db.collection('fixes').doc(id).delete().catch(e => console.warn('Err delete fix:', e));
    renderFixBoard();
    saveData();
  });
}

function dragFix(ev, id) {
  ev.dataTransfer.setData("fixId", id);
}
function allowFixDrop(ev) {
  ev.preventDefault();
  const col = ev.target.closest('.kanban-col');
  if (col) col.classList.add('drag-over');
}
function dropFix(ev, newStatus) {
  ev.preventDefault();
  const col = ev.target.closest('.kanban-col');
  if (col) col.classList.remove('drag-over');

  const id = ev.dataTransfer.getData("fixId");
  const f = fixes.find(x => x.id === id);
  if (f && f.status !== newStatus) {
    f.status = newStatus;
    saveFixDoc(f);
    renderFixBoard();
  }
}

// Definitions moved to top

function renderSettingsTeam() {
  const el = document.getElementById('settingsTeam');
  if (!el) return;
  let html = teamMembers.map((m, i) => {
    const count = prospects.filter(p => p.resp === m.name).length;
    return `<div class="resp-item" style="justify-content:space-between" id="teamRow${i}">
      <div style="display:flex;align-items:center;gap:10px;flex:1">
        <div class="av" style="background:${m.bg};color:${m.fg}">${m.name[0]}</div>
        <div class="resp-name" id="teamName${i}">${m.name}</div>
        <div class="rs" style="font-size:11px;color:var(--text3)"><b>${count}</b> prospect${count > 1 ? 's' : ''}</div>
      </div>
      <div style="display:flex;align-items:center;gap:2px">
        <button onclick="startEditTeamMember(${i})" style="background:none;border:none;cursor:pointer;color:var(--text3);font-size:14px;padding:4px 8px;border-radius:6px;transition:all 0.12s" onmouseover="this.style.color='var(--blue)';this.style.background='rgba(99,145,255,0.1)'" onmouseout="this.style.color='var(--text3)';this.style.background='none'" title="Modifier le nom">
          <svg viewBox="0 0 24 24" style="width:15px;height:15px;stroke:currentColor;fill:none;stroke-width:2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        <button onclick="removeTeamMember(${i})" style="background:none;border:none;cursor:pointer;color:var(--text3);font-size:18px;padding:4px 8px;border-radius:6px;transition:all 0.12s" onmouseover="this.style.color='#E24B4A';this.style.background='rgba(226,75,74,0.1)'" onmouseout="this.style.color='var(--text3)';this.style.background='none'" title="Supprimer">&times;</button>
      </div>
    </div>`;
  }).join('');

  html += `<div style="display:flex;gap:8px;margin-top:12px;align-items:center">
    <input type="text" id="newMemberName" placeholder="Nom du membre" style="flex:1;padding:8px 12px;border:0.5px solid var(--border2);border-radius:var(--radius);background:var(--surface2);color:var(--text);font-size:13px;font-family:inherit;outline:none" onkeydown="if(event.key==='Enter')addTeamMember()"/>
    <button class="btn-save" onclick="addTeamMember()" style="font-size:13px;white-space:nowrap">+ Ajouter</button>
  </div>`;

  el.innerHTML = html;
  updateRespSelects();
}

function startEditTeamMember(i) {
  const nameEl = document.getElementById('teamName' + i);
  if (!nameEl) return;
  const currentName = teamMembers[i].name;
  nameEl.innerHTML = `<div style="display:flex;align-items:center;gap:6px">
    <input type="text" id="editMemberInput${i}" value="${currentName}" style="width:120px;padding:4px 8px;border:1px solid var(--blue);border-radius:6px;background:var(--surface2);color:var(--text);font-size:13px;font-family:inherit;outline:none" onkeydown="if(event.key==='Enter')confirmEditTeamMember(${i});if(event.key==='Escape')renderSettingsTeam()"/>
    <button onclick="confirmEditTeamMember(${i})" style="background:var(--blue);border:none;cursor:pointer;color:#fff;font-size:12px;padding:4px 8px;border-radius:6px;font-family:inherit">OK</button>
    <button onclick="renderSettingsTeam()" style="background:none;border:0.5px solid var(--border2);cursor:pointer;color:var(--text3);font-size:12px;padding:4px 8px;border-radius:6px;font-family:inherit">✕</button>
  </div>`;
  const input = document.getElementById('editMemberInput' + i);
  if (input) { input.focus(); input.select(); }
}

function confirmEditTeamMember(i) {
  const input = document.getElementById('editMemberInput' + i);
  if (!input) return;
  const newName = input.value.trim();
  if (!newName) return;
  const oldName = teamMembers[i].name;
  if (newName === oldName) { renderSettingsTeam(); return; }
  prospects.forEach(p => { if (p.resp === oldName) p.resp = newName; });
  teamMembers[i].name = newName;
  saveData();
  renderSettingsTeam();
  renderAll();
}

function addTeamMember() {
  const input = document.getElementById('newMemberName');
  const name = input ? input.value.trim() : "";
  if (!name) return;
  const c = teamColors[teamMembers.length % teamColors.length];
  teamMembers.push({ name, bg: c.bg, fg: c.fg });
  renderSettingsTeam();
  saveData();
}

function removeTeamMember(i) {
  const name = teamMembers[i].name;
  if (!confirm(`Supprimer ${name} de l'équipe ?`)) return;
  teamMembers.splice(i, 1);
  renderSettingsTeam();
  saveData();
  renderTable();
}

function updateRespSelects() {
  const selects = [document.getElementById('mResp'), document.getElementById('filterResp'), document.getElementById('bulkResp')];
  selects.forEach(sel => {
    if (!sel) return;
    const current = sel.value;
    if (sel.id === 'filterResp') {
      sel.innerHTML = '<option value="">Tous les commerciaux</option>' + teamMembers.map(m => `<option value="${m.name}" ${m.name === current ? ' selected' : ''}>${m.name}</option>`).join('');
    } else {
      sel.innerHTML = teamMembers.map(m => `<option value="${m.name}" ${m.name === current ? ' selected' : ''}>${m.name}</option>`).join('');
    }
  });
}

function updateTypeSelects(selectedValue = null) {
  const selects = [document.getElementById('mTypeEntreprise'), document.getElementById('proFilterType')];
  selects.forEach(sel => {
    if (!sel) return;
    const isFilter = sel.id === 'proFilterType';
    const current = selectedValue || sel.value;
    const exists = businessTypes.includes(current);
    const orphanOpt = (current && !exists && !isFilter) ? `<option value="${current}" selected>⚠️ ${current}</option>` : '';
    const defaultOpt = isFilter ? '<option value="">Tous les types</option>' : '<option value="">Choisir un type...</option>';
    sel.innerHTML = defaultOpt + orphanOpt + businessTypes.map(t => `<option value="${t}" ${t === current ? ' selected' : ''}>${t}</option>`).join('');
  });
}

function renderSettingsBusinessTypes() {
  const el = document.getElementById('settingsBusinessTypes');
  if (!el) return;
  let html = businessTypes.map((t, i) => {
    return `<div class="resp-item" style="justify-content:space-between" id="typeRow${i}">
      <div style="display:flex;align-items:center;gap:10px;flex:1">
        <div class="status-badge-preview" style="background:var(--blue-l);color:var(--blue-d);padding:4px 12px;border-radius:20px;font-size:12px;font-weight:600">${t}</div>
        <div class="resp-name" id="typeName${i}" style="display:none">${t}</div>
      </div>
      <div style="display:flex;align-items:center;gap:2px">
        <button onclick="startEditBusinessType(${i})" style="background:none;border:none;cursor:pointer;color:var(--text3);font-size:14px;padding:4px 8px;border-radius:6px;transition:all 0.12s" onmouseover="this.style.color='var(--blue)';this.style.background='rgba(99,145,255,0.1)'" onmouseout="this.style.color='var(--text3)';this.style.background='none'" title="Modifier">
          <svg viewBox="0 0 24 24" style="width:15px;height:15px;stroke:currentColor;fill:none;stroke-width:2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        <button onclick="removeBusinessType(${i})" style="background:none;border:none;cursor:pointer;color:var(--text3);font-size:18px;padding:4px 8px;border-radius:6px;transition:all 0.12s" onmouseover="this.style.color='#E24B4A';this.style.background='rgba(226,75,74,0.1)'" onmouseout="this.style.color='var(--text3)';this.style.background='none'" title="Supprimer">&times;</button>
      </div>
    </div>`;
  }).join('');

  html += `<div style="display:flex;gap:8px;margin-top:12px;align-items:center">
    <input type="text" id="newBusinessTypeName" placeholder="Nouveau type (ex: Garage)" style="flex:1;padding:8px 12px;border:0.5px solid var(--border2);border-radius:var(--radius);background:var(--surface2);color:var(--text);font-size:13px;font-family:inherit;outline:none" onkeydown="if(event.key==='Enter')addBusinessType()"/>
    <button class="btn-save" onclick="addBusinessType()" style="font-size:13px;white-space:nowrap">+ Ajouter</button>
  </div>`;

  el.innerHTML = html;
  updateTypeSelects();
}

function addBusinessType(manualName = null) {
  const input = document.getElementById('newBusinessTypeName');
  const name = manualName || (input ? input.value.trim() : "");
  if (!name) return;
  if (businessTypes.includes(name)) {
    showToast('Ce type existe déjà', 'info');
    return;
  }
  businessTypes.push(name);
  saveData();
  renderSettingsBusinessTypes();
  renderProSegments();
  updateTypeSelects();
  if (input) input.value = '';
  showToast(`Catégorie "${name}" ajoutée`, 'success');
}

function promptAddSegment() {
  const name = prompt("Nom de la nouvelle catégorie (ex: Agence, Hôtel...) :");
  if (name && name.trim()) {
    addBusinessType(name.trim());
  }
}

function removeBusinessType(i) {
  const name = businessTypes[i];
  if (!confirm(`Supprimer le type "${name}" ?`)) return;
  businessTypes.splice(i, 1);
  renderSettingsBusinessTypes();
  saveData();
}

function startEditBusinessType(i) {
  const rowEl = document.querySelector(`#typeRow${i} div:first-child`);
  if (!rowEl) return;
  const currentName = businessTypes[i];
  rowEl.innerHTML = `<div style="display:flex;align-items:center;gap:6px">
    <input type="text" id="editTypeInput${i}" value="${currentName}" style="width:150px;padding:4px 8px;border:1px solid var(--blue);border-radius:6px;background:var(--surface2);color:var(--text);font-size:13px;font-family:inherit;outline:none" onkeydown="if(event.key==='Enter')confirmEditBusinessType(${i});if(event.key==='Escape')renderSettingsBusinessTypes()"/>
    <button onclick="confirmEditBusinessType(${i})" style="background:var(--blue);border:none;cursor:pointer;color:#fff;font-size:12px;padding:4px 8px;border-radius:6px;font-family:inherit">OK</button>
    <button onclick="renderSettingsBusinessTypes()" style="background:none;border:0.5px solid var(--border2);cursor:pointer;color:var(--text3);font-size:12px;padding:4px 8px;border-radius:6px;font-family:inherit">✕</button>
  </div>`;
  const input = document.getElementById('editTypeInput' + i);
  if (input) { input.focus(); input.select(); }
}

function confirmEditBusinessType(i) {
  const input = document.getElementById('editTypeInput' + i);
  if (!input) return;
  const newName = input.value.trim();
  if (!newName) return;
  const oldName = businessTypes[i];
  if (newName === oldName) { renderSettingsBusinessTypes(); return; }
  prospects.forEach(p => { if (p.typeEntreprise === oldName) p.typeEntreprise = newName; });
  businessTypes[i] = newName;
  saveData();
  renderSettingsBusinessTypes();
  renderAll();
}

// ─── IMPORT / EXPORT ───
function exportCSV() {
  const headers = ['id', 'nom', 'email', 'telephone', 'entreprise', 'typeEntreprise', 'statut', 'source', 'valeurFixe', 'valeurMensuelle', 'score', 'resp', 'date', 'dateRelance', 'note'];
  let csv = headers.join(';') + '\n';
  prospects.forEach(p => {
    const row = [
      p.id || '',
      p.nom || '',
      p.email || '',
      p.telephone || '',
      p.entreprise || '',
      p.typeEntreprise || '',
      p.statut || '',
      p.source || '',
      p.valeurFixe || 0,
      p.valeurMensuelle || 0,
      p.score || 0,
      p.resp || '',
      p.date || '',
      p.dateRelance || '',
      (p.note || '').replace(/;/g, ',').replace(/\n/g, ' ')
    ];
    csv += row.join(';') + '\n';
  });
  downloadBlob(csv, 'prospects_synaptic.csv', 'text/csv');
}

function downloadBlob(content, filename, type) {
  const blob = new Blob(['\uFEFF' + content], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

function exportJSON() {
  downloadBlob(JSON.stringify(prospects, null, 2), `synaptic_export_${new Date().toISOString().split('T')[0]}.json`, 'application/json');
  showToast('Export JSON réussi !', 'success');
}

function handleImportFile(file) {
  if (!file) return;
  const status = document.getElementById('importStatus');
  if (status) status.textContent = "Traitement de " + file.name + "...";
  const reader = new FileReader();

  reader.onload = function (e) {
    try {
      const content = e.target.result;
      if (file.name.endsWith('.json')) {
        const data = JSON.parse(content);
        if (Array.isArray(data)) {
          prospects = data;
          saveData();
          renderAll();
          showToast('Import JSON réussi ! (' + data.length + ' prospects)', 'success');
        }
      } else {
        const lines = content.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        if (lines.length < 2) throw "Fichier trop court";
        const sep = lines[0].includes(';') ? ';' : ',';
        const headers = lines[0].split(sep).map(h => h.trim().replace(/"/g, ''));
        const newOnes = [];
        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split(sep).map(c => c.trim().replace(/"/g, ''));
          const p = { id: Date.now().toString() + i, appels: [] };
          headers.forEach((h, idx) => {
            let val = cols[idx] || '';
            if (h === 'valeur' && !headers.includes('valeurFixe')) {
              p.valeurFixe = Number(val) || 0;
            } else if (h === 'valeurFixe' || h === 'valeurMensuelle' || h === 'score') {
              p[h] = Number(val) || 0;
            } else { p[h] = val; }
          });
          if (!p.nom && !p.entreprise) return;
          p.valeurFixe = p.valeurFixe || 0;
          p.valeurMensuelle = p.valeurMensuelle || 0;
          newOnes.push(p);
        }
        if (newOnes.length > 0) {
          if (confirm(`Importer ${newOnes.length} prospects ? Cela remplacera votre liste actuelle.`)) {
            prospects = newOnes;
            saveData();
            renderAll();
            showToast('Import CSV réussi !', 'success');
          }
        }
      }
    } catch (err) {
      console.error(err);
      showToast("Erreur d'import : " + err, "error");
    }
    if (status) status.textContent = "";
  };
  reader.readAsText(file);
}

var proSortCol = null, proSortDir = 'asc';
var proFilterResp = '';
var proActiveSegment = 'all';

function renderProSegments() {
  const container = document.getElementById('proSegmentBar');
  if (!container) return;

  const counts = {};
  counts['all'] = prospects.length;
  businessTypes.forEach(t => {
    counts[t] = prospects.filter(p => p.typeEntreprise === t).length;
  });

  let html = `<div class="segment-pill ${proActiveSegment === 'all' ? 'active' : ''}" onclick="setProSegment('all')">
    <span>Tous</span>
    <span class="segment-count">${counts['all']}</span>
  </div>`;

  businessTypes.forEach(t => {
    html += `
      <div class="segment-pill ${proActiveSegment === t ? 'active' : ''}" onclick="setProSegment('${t}')">
        <span>${t}</span>
        <span class="segment-count">${counts[t] || 0}</span>
      </div>
    `;
  });

  // Add "+" button
  html += `
    <div class="segment-pill" onclick="promptAddSegment()" style="border-style:dashed; border-color:var(--border2); opacity:0.8; background:none" onmouseover="this.style.opacity=1;this.style.borderColor='var(--blue)'" onmouseout="this.style.opacity=0.8;this.style.borderColor='var(--border2)'">
      <span style="font-size:18px; line-height:1">+</span>
    </div>
  `;

  container.innerHTML = html;
}

function setProSegment(seg) {
  proActiveSegment = seg;
  renderProSegments();
  renderProspectsTable();
}

function getProSelectedStatuses() {
  return Array.from(document.querySelectorAll('.pro-status-cb:checked')).map(cb => cb.value);
}

function toggleProStatusDropdown(e) {
  e.stopPropagation();
  const el = document.getElementById('proStatusOptions');
  if (el) el.classList.toggle('show');
}
window.addEventListener('click', () => { 
  const el = document.getElementById('proStatusOptions'); 
  if (el) el.classList.remove('show'); 
});

function toggleProOneStatus(e, val) {
  e.stopPropagation();
  const cb = e.currentTarget.querySelector('input');
  if (e.target.tagName !== 'INPUT') cb.checked = !cb.checked;
  updateProStatusLabel();
  renderProspectsTable();
}

function toggleProAllStatuses(e) {
  e.stopPropagation();
  const master = document.getElementById('proCheckAllStatus');
  if (e.target.tagName !== 'INPUT') master.checked = !master.checked;
  document.querySelectorAll('.pro-status-cb').forEach(cb => cb.checked = master.checked);
  updateProStatusLabel();
  renderProspectsTable();
}

function updateProStatusLabel() {
  const all = document.querySelectorAll('.pro-status-cb');
  const checked = document.querySelectorAll('.pro-status-cb:checked');
  const label = document.getElementById('proStatusTriggerLabel');
  const master = document.getElementById('proCheckAllStatus');
  if (!label) return;
  if (checked.length === 0 || checked.length === all.length) {
    label.textContent = 'Tous les statuts';
    if (master) master.checked = checked.length === all.length;
  } else if (checked.length === 1) {
    label.textContent = statusMap[checked[0].value] || checked[0].value;
    if (master) master.checked = false;
  } else {
    label.textContent = checked.length + ' statuts';
    if (master) master.checked = false;
  }
}

function saveInitialName() {
  const nameInput = document.getElementById('welcomeNameInput');
  const name = nameInput ? nameInput.value.trim() || 'Synaptics' : 'Synaptics';
  localStorage.setItem('synaptic_user_name', name);
  toggleModal('welcomeModalBg', false);
  renderHero();
  showToast(`C'est parti, ${name} !`, 'success');
  
  // Start tour after a short delay to let the modal close
  setTimeout(startTour, 600);
}

function startTour() {
  if (typeof driver === 'undefined') return;
  
  const driverObj = driver.js.driver({
    showProgress: true,
    allowClose: false,
    overlayClickable: false,
    steps: [
      { element: '#sidebar', popover: { title: 'Navigation', description: 'Accédez ici à vos prospects, au Kanban et à vos paramètres.', side: "right", align: 'start' }},
      { element: '#dashboardHero', popover: { title: 'Tableau de Bord', description: 'Suivez vos KPIs et votre activité quotidienne en un coup d\'œil.', side: "bottom", align: 'start' }},
      { element: '#activityFeedCard', popover: { title: 'Collaboration Live', description: 'Voyez ce que vos collègues font en temps réel sur ce flux.', side: "top", align: 'center' }},
      { element: '#presenceWidget', popover: { title: 'Équipe en ligne', description: 'Identifiez instantanément qui est connecté parmi vos collaborateurs.', side: "right", align: 'end' }},
      { element: '#nav-prospects', popover: { title: 'Gestion Prospects', description: 'C\'est ici que vous gérerez votre base de données et passerez vos appels.', side: "right", align: 'start' }},
    ],
    onDeselected: () => {
      localStorage.setItem('synaptic_tour_completed', 'true');
      showToast("Visite terminée. À vous de jouer !", "success");
    }
  });

  driverObj.drive();
}

function toggleTheme() {
  document.documentElement.classList.add('theme-switching');
  const isDark = document.documentElement.classList.toggle('dark');
  localStorage.setItem('synaptic_theme', isDark ? 'dark' : 'light');
  setTimeout(() => {
    document.documentElement.classList.remove('theme-switching');
  }, 300);
}

function saveSettingName() {
  const input = document.getElementById('settingUserName');
  if (!input) return;
  const name = input.value.trim() || 'Synaptics';
  localStorage.setItem('synaptic_user_name', name);
  renderHero();
  showToast('Nom mis à jour !', 'success');
}

let proFilterType = 'all';

function filterProList(type, el) {
  if (proFilterType === type) {
    proFilterType = 'all';
    if (el) el.classList.remove('active');
    showToast('Filtre retiré : Affichage de tous les prospects', 'info');
  } else {
    proFilterType = type;
    document.querySelectorAll('.btn-today').forEach(b => b.classList.remove('active'));
    if (el) el.classList.add('active');
    showToast('Filtre : ' + (type === 'prioritaires' ? 'Prioritaires' : 'Ma liste du jour'), 'success');
  }
  renderProspectsTable();
}

function sortProTable(col) {
  if (proSortCol === col) proSortDir = proSortDir === 'asc' ? 'desc' : 'asc';
  else { proSortCol = col; proSortDir = 'asc'; }
  document.querySelectorAll('#page-prospects .sort-icon').forEach(el => {
    el.textContent = '';
    el.parentElement.classList.remove('sort-active');
  });
  const icon = document.getElementById('pro-sort-' + col);
  if (icon) {
    icon.textContent = proSortDir === 'asc' ? '▲' : '▼';
    icon.parentElement.classList.add('sort-active');
  }
  renderProspectsTable();
}

function renderProPersonBtns() {
  const sel = document.getElementById('proPersonSelect');
  if (!sel) return;
  sel.innerHTML = `<option value="">Équipe (Tous)</option>` + teamMembers.map(m => `<option value="${m.name}" ${proFilterResp === m.name ? 'selected' : ''}>${m.name}</option>`).join('');
}

function setProResp(name) {
  proFilterResp = name;
  renderProspectsTable();
}

function renderProspectsTable() {
  const body = document.getElementById('proTableBody');
  if (!body) return;
  const currentSelectedIds = new Set(getProSelectedIds());
  const searchEl = document.getElementById('proSearchQ');
  const q = searchEl ? searchEl.value : '';
  const qLow = q.toLowerCase();
  const st = getProSelectedStatuses();
  const today = new Date().toISOString().split('T')[0];
  
  // Advanced filters
  const fDateEl = document.getElementById('proFilterDate');
  const fDate = fDateEl ? fDateEl.value : '';
  const fTypeEl = document.getElementById('proFilterType');
  const fType = fTypeEl ? fTypeEl.value : '';
  const fSourceEl = document.getElementById('proFilterSource');
  const fSource = fSourceEl ? fSourceEl.value : '';
  const fValueEl = document.getElementById('proFilterValue');
  const fValue = fValueEl ? fValueEl.value : '';

  let rows = prospects.filter(p => {
    // Basic Search & Resp
    if (st.length > 0 && !st.includes(p.statut)) return false;
    if (proFilterResp && p.resp !== proFilterResp) return false;
    if (qLow && !p.nom.toLowerCase().includes(qLow) && !p.entreprise.toLowerCase().includes(qLow) && !p.email.toLowerCase().includes(qLow)) return false;
    
    // Priority / Today filters (Sidebar/Fixed buttons)
    if (proFilterType === 'prioritaires') {
      const isHot = ['rdv_planifie', 'rdv_effectue', 'signe'].includes(p.statut);
      if (!p.isPriority && !isHot && (p.score || 0) < 80) return false;
    } else if (proFilterType === 'aujourdhui') {
      if (!p.dateRelance || p.dateRelance !== today) return false;
    }
    
    // Advanced: Date Filter (Dropdown)
    if (fDate) {
      const pDateStr = p.date || '';
      if (!pDateStr && fDate !== 'dormant') return false;
      const pDate = new Date(pDateStr);
      const now = new Date();
      if (fDate === 'today') {
        if (pDateStr !== today) return false;
      } else if (fDate === 'week') {
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        if (pDate < weekAgo) return false;
      } else if (fDate === 'month') {
        const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        if (pDate < monthAgo) return false;
      } else if (fDate === 'dormant') {
        const last7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const isClosed = ['signe', 'perdu', 'npai'].includes(p.statut);
        if (isClosed) return false;
        if (pDateStr && pDate > last7) return false;
      }
    }
    
    // Advanced: Type & Source
    if (proActiveSegment !== 'all' && p.typeEntreprise !== proActiveSegment) return false;
    if (fType && p.typeEntreprise !== fType) return false;
    if (fSource && p.source !== fSource) return false;
    
    // Advanced: Value (CA)
    if (fValue) {
      const acv = getACV(p);
      if (fValue === 'small' && acv >= 1000) return false;
      if (fValue === 'medium' && (acv < 1000 || acv > 10000)) return false;
      if (fValue === 'large' && acv <= 10000) return false;
    }

    return true;
  });

  if (proSortCol) {
    rows.sort((a, b) => {
      let va = a[proSortCol], vb = b[proSortCol];
      if (proSortCol === 'valeur') { va = getACV(a); vb = getACV(b); }
      if (va === undefined || va === null) va = '';
      if (vb === undefined || vb === null) vb = '';
      
      // Numerical sort if both are numbers or numeric strings
      const na = parseFloat(va), nb = parseFloat(vb);
      if (!isNaN(na) && !isNaN(nb) && isFinite(va) && isFinite(vb)) {
        return proSortDir === 'asc' ? na - nb : nb - na;
      }
      
      // String sort
      va = va.toString().toLowerCase();
      vb = vb.toString().toLowerCase();
      if (va < vb) return proSortDir === 'asc' ? -1 : 1;
      if (va > vb) return proSortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }

  // Update count
  const countEl = document.getElementById('proTblCount');
  if (countEl) countEl.textContent = `${rows.length} prospect${rows.length > 1 ? 's' : ''}`;

  if (rows.length === 0) {
    let msg = 'Aucun prospect trouvé.';
    if (proFilterType === 'prioritaires') msg = 'Aucun prospect prioritaire trouvé.';
    else if (proFilterType === 'aujourdhui') msg = 'Rien de prévu pour aujourd\'hui.';
    body.innerHTML = `<tr><td colspan="14" style="text-align:center;padding:40px;color:var(--text3)">${msg}</td></tr>`;
    return;
  }
  body.innerHTML = rows.map(p => buildRowHtml(p, 'full')).join('');
  updateProBulkBar();
}

/**
 * Clear all filters for the prospects table.
 */
function clearAllProFilters() {
  const selects = ['proFilterDate', 'proFilterType', 'proFilterSource', 'proFilterValue', 'proPersonSelect'];
  selects.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  
  const search = document.getElementById('proSearchQ');
  if (search) search.value = '';
  
  const master = document.getElementById('proCheckAllStatus');
  if (master) master.checked = true;
  document.querySelectorAll('.pro-status-cb').forEach(cb => cb.checked = true);
  
  proFilterType = 'all';
  proFilterResp = '';
  document.querySelectorAll('.btn-today').forEach(b => b.classList.remove('active'));
  
  updateProStatusLabel();
  renderProspectsTable();
  if (typeof showToast === 'function') showToast('Filtres réinitialisés', 'info');
}

(function initTooltips() {
  const tt = document.getElementById('synaptic-tooltip');
  if (!tt) return;
  function showTip(e) {
    const text = e.currentTarget.getAttribute('data-tt');
    if (!text) return;
    if (e.currentTarget.classList.contains('sidebar-item')) {
      const sb = document.getElementById('sidebar');
      if (sb && sb.classList.contains('open')) return;
    }
    tt.textContent = text;
    tt.classList.add('show');
    moveTip(e);
  }
  function moveTip(e) {
    const padding = 15;
    let left = e.clientX + padding;
    let top = e.clientY - 10;
    const w = tt.offsetWidth;
    const h = tt.offsetHeight;
    if (left + w > window.innerWidth) left = e.clientX - w - padding;
    if (left < 5) left = 5;
    if (top + h > window.innerHeight) top = e.clientY - h - padding;
    if (top < 5) top = 5;
    tt.style.left = left + 'px';
    tt.style.top = top + 'px';
  }
  function hideTip() { tt.classList.remove('show'); }

  document.addEventListener('mouseover', e => {
    const el = e.target.closest('[data-tt]');
    if (el) {
      el.removeEventListener('mouseenter', showTip);
      el.removeEventListener('mousemove', moveTip);
      el.removeEventListener('mouseleave', hideTip);
      el.addEventListener('mouseenter', showTip);
      el.addEventListener('mousemove', moveTip);
      el.addEventListener('mouseleave', hideTip);
      showTip(e);
    }
  });
})();
