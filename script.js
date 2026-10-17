// --- Configurazione Firebase ---
const firebaseConfig = {
  apiKey: "AIzaSyAXnqzCo-o8YtCFggD4chRz_MiizIxPWYE",
  authDomain: "presenzesq.firebaseapp.com",
  projectId: "presenzesq",
  storageBucket: "presenzesq.firebasestorage.app",
  messagingSenderId: "659459133175",
  appId: "1:659459133175:web:7f9a6c004af10b2c414df2",
  measurementId: "G-09W3RQCC37"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

let session = null; // { nome, squadriglia, ruolo, codice }
let roster = [];
let storico = [];
let messaggi = [];
let accounts = [];
let codiceAppenaCreato = '';

function showView(id) {
  ['view-welcome','view-login','view-nuovo-codice','view-impostazioni','view-squadrigliero','view-roster','view-presenze','view-output','view-storico','view-calendario','view-promemoria','view-messaggi'].forEach(v => {
    document.getElementById(v).classList.toggle('hidden', v !== id);
  });
}

function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2200);
}

function slug(s) { return s.trim().toLowerCase().replace(/\s+/g, '-'); }
function sqRef(squadriglia) { return db.collection('squadriglie').doc(slug(squadriglia)); }

function generaCodice() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c = '';
  for (let i = 0; i < 6; i++) c += chars[Math.floor(Math.random() * chars.length)];
  return c;
}

function aggiornaHintCodice() {
  const ruolo = document.getElementById('in-ruolo').value;
  const hint = document.getElementById('hint-codice');
  hint.textContent = ruolo === 'capo'
    ? "Se la squadriglia non esiste ancora, lascia vuoto il codice per crearla. Se esiste già, inserisci il codice che ti hanno dato."
    : "Chiedi il codice al tuo capo squadriglia.";
}

// --- Account ricordati (solo sul dispositivo) ---
function loadAccounts() {
  try { accounts = JSON.parse(localStorage.getItem('presenze_accounts') || '[]'); }
  catch (e) { accounts = []; }
}
function saveAccounts() {
  try { localStorage.setItem('presenze_accounts', JSON.stringify(accounts)); } catch (e) {}
}
function upsertAccount(a) {
  accounts = accounts.filter(x => !(slug(x.nome) === slug(a.nome) && slug(x.squadriglia) === slug(a.squadriglia)));
  accounts.unshift(a);
  accounts = accounts.slice(0, 5);
  saveAccounts();
}
function forgetAccount(i, ev) {
  ev.stopPropagation();
  accounts.splice(i, 1);
  saveAccounts();
  renderWelcome();
}

function renderWelcome() {
  const list = document.getElementById('accounts-list');
  list.innerHTML = '';
  if (accounts.length === 0) { showView('view-login'); return; }
  accounts.forEach((a, i) => {
    const row = document.createElement('div');
    row.className = 'account-row';
    const ruoloLbl = a.ruolo === 'capo' ? 'Capo' : 'Squadrigliero';
    row.innerHTML = `<button class="account-btn" onclick="selectAccount(${i})"><b>${escapeHtml(a.nome)}</b><span>Squadriglia ${escapeHtml(a.squadriglia)} · ${ruoloLbl}</span></button><button class="forget-btn" onclick="forgetAccount(${i}, event)">✕</button>`;
    list.appendChild(row);
  });
  showView('view-welcome');
}

async function selectAccount(i) {
  const a = accounts[i];
  await provaAccesso(a.nome, a.squadriglia, a.ruolo, a.codice);
}

// --- Login / creazione squadriglia ---
async function login() {
  const nome = document.getElementById('in-nome').value.trim();
  const squadriglia = document.getElementById('in-squadriglia').value.trim();
  const ruolo = document.getElementById('in-ruolo').value;
  const codice = document.getElementById('in-codice').value.trim().toUpperCase();
  if (!nome || !squadriglia) { toast('Inserisci nome e squadriglia'); return; }
  await provaAccesso(nome, squadriglia, ruolo, codice);
}

async function provaAccesso(nome, squadriglia, ruolo, codice) {
  const btn = document.getElementById('btn-login');
  if (btn) { btn.disabled = true; btn.textContent = 'Accesso in corso...'; }
  try {
    const ref = sqRef(squadriglia);
    const snap = await ref.get();

    if (!snap.exists) {
      if (ruolo !== 'capo') {
        toast('Squadriglia non trovata. Controlla il nome con il tuo capo.');
        showView('view-login');
        return;
      }
      // Crea nuova squadriglia
      const nuovoCodice = generaCodice();
      await ref.set({ codice: nuovoCodice, roster: [], storico: [], messaggi: [], creataDa: nome, createdAt: Date.now() });
      session = { nome, squadriglia, ruolo, codice: nuovoCodice };
      upsertAccount(session);
      roster = []; storico = []; messaggi = [];
      codiceAppenaCreato = nuovoCodice;
      document.getElementById('codice-generato').textContent = nuovoCodice;
      showView('view-nuovo-codice');
      return;
    }

    const data = snap.data();
    if (!codice || data.codice !== codice) {
      toast('Codice squadriglia errato o mancante.');
      showView('view-login');
      return;
    }
    session = { nome, squadriglia, ruolo, codice };
    upsertAccount(session);
    roster = data.roster || [];
    storico = data.storico || [];
    messaggi = data.messaggi || [];

    if (ruolo === 'squadrigliero' && !roster.some(n => slug(n) === slug(nome))) {
      roster.push(nome);
      await saveField('roster', roster);
    }

    goHome();
  } catch (e) {
    console.error(e);
    toast('Errore di connessione, riprova.');
    showView('view-login');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Entra'; }
  }
}

function goHome() {
  if (session.ruolo === 'capo') goToRoster();
  else goToSquadrigliero();
}

function goToSquadrigliero() {
  document.getElementById('sq-nome-7').textContent = session.squadriglia;
  document.getElementById('user-nome-7').textContent = session.nome;
  showView('view-squadrigliero');
}

function goToImpostazioni() {
  document.getElementById('imp-nome').value = session.nome;
  document.getElementById('imp-ruolo').value = session.ruolo;
  showView('view-impostazioni');
}

async function salvaImpostazioni() {
  const nuovoNome = document.getElementById('imp-nome').value.trim();
  const nuovoRuolo = document.getElementById('imp-ruolo').value;
  if (!nuovoNome) { toast('Inserisci un nome'); return; }
  const vecchioNome = session.nome;

  const idx = roster.findIndex(n => slug(n) === slug(vecchioNome));
  if (idx !== -1) {
    if (slug(nuovoNome) !== slug(vecchioNome)) {
      roster[idx] = nuovoNome;
      await saveField('roster', roster);
    }
  } else if (nuovoRuolo === 'squadrigliero' && !roster.some(n => slug(n) === slug(nuovoNome))) {
    roster.push(nuovoNome);
    await saveField('roster', roster);
  }

  accounts = accounts.filter(a => !(slug(a.nome) === slug(vecchioNome) && slug(a.squadriglia) === slug(session.squadriglia)));
  session = { nome: nuovoNome, squadriglia: session.squadriglia, ruolo: nuovoRuolo, codice: session.codice };
  upsertAccount(session);
  toast('Impostazioni salvate!');
  goHome();
}

async function eliminaAccount() {
  const ok = confirm('Vuoi eliminare definitivamente il tuo account da questa squadriglia? Il tuo nome sarà rimosso dalla lista e da questo dispositivo. Non si può annullare.');
  if (!ok) return;
  const idx = roster.findIndex(n => slug(n) === slug(session.nome));
  if (idx !== -1) {
    roster.splice(idx, 1);
    await saveField('roster', roster);
  }
  accounts = accounts.filter(a => !(slug(a.nome) === slug(session.nome) && slug(a.squadriglia) === slug(session.squadriglia)));
  saveAccounts();
  session = null;
  toast('Account eliminato.');
  renderWelcome();
}

function copiaCodice() {
  navigator.clipboard.writeText(codiceAppenaCreato).then(() => toast('Codice copiato!'))
    .catch(() => toast('Copialo manualmente: ' + codiceAppenaCreato));
}
function continuaDopoCreazione() { goToRoster(); }

function logout() {
  session = null;
  document.getElementById('in-nome').value = '';
  document.getElementById('in-squadriglia').value = '';
  document.getElementById('in-codice').value = '';
  renderWelcome();
}

// --- Sincronizzazione dati condivisi ---
async function refreshData() {
  const snap = await sqRef(session.squadriglia).get();
  if (!snap.exists) { toast('Squadriglia non trovata'); return; }
  const data = snap.data();
  roster = data.roster || [];
  storico = data.storico || [];
  messaggi = data.messaggi || [];
}
async function saveField(field, value) {
  try { await sqRef(session.squadriglia).update({ [field]: value }); }
  catch (e) { console.error(e); toast('Errore nel salvataggio, riprova.'); }
}

// --- Roster ---
async function goToRoster() {
  document.getElementById('sq-nome-1').textContent = session.squadriglia;
  document.getElementById('user-nome-1').textContent = session.nome;
  document.getElementById('btn-promemoria').classList.toggle('hidden', session.ruolo !== 'capo');
  await refreshData();
  renderRoster();
  showView('view-roster');
}

function renderRoster() {
  const list = document.getElementById('roster-list');
  list.innerHTML = '';
  if (roster.length === 0) { list.innerHTML = '<div class="empty">Nessuna persona ancora. Aggiungine una qui sopra.</div>'; return; }
  roster.forEach((nome, i) => {
    const row = document.createElement('div');
    row.className = 'member-row';
    row.innerHTML = `<span>${escapeHtml(nome)}</span><button class="x" onclick="removeMember(${i})">rimuovi</button>`;
    list.appendChild(row);
  });
}

async function addMember() {
  const input = document.getElementById('in-membro');
  const nome = input.value.trim();
  if (!nome) return;
  roster.push(nome);
  input.value = '';
  renderRoster();
  await saveField('roster', roster);
}
async function removeMember(i) {
  roster.splice(i, 1);
  renderRoster();
  await saveField('roster', roster);
}

// --- Presenze ---
function goToPresenze() {
  if (roster.length === 0) { toast('Aggiungi prima qualche persona'); return; }
  document.getElementById('sq-nome-2').textContent = session.squadriglia;
  const dataInput = document.getElementById('in-data');
  if (!dataInput.value) dataInput.value = new Date().toISOString().slice(0, 10);

  const list = document.getElementById('presenze-list');
  list.innerHTML = '';
  roster.forEach((nome, i) => {
    const row = document.createElement('div');
    row.className = 'presenza-row';
    row.innerHTML = `
      <div class="presenza-nome">${escapeHtml(nome)}</div>
      <div class="presenza-controls">
        <select id="stato-${i}" data-nome="${escapeHtml(nome)}" onchange="toggleOrario(${i})">
          <option value="assente">Assente</option>
          <option value="presente">Presente</option>
          <option value="uscito_prima">Uscito prima</option>
          <option value="arrivato_dopo">Arrivato dopo</option>
        </select>
        <input type="text" id="orario-${i}" class="hidden" placeholder="orario es. 21:30">
      </div>`;
    list.appendChild(row);
  });
  showView('view-presenze');
}

function toggleOrario(i) {
  const stato = document.getElementById('stato-' + i).value;
  const orarioInput = document.getElementById('orario-' + i);
  orarioInput.classList.toggle('hidden', stato !== 'uscito_prima' && stato !== 'arrivato_dopo');
}

function formatDataIt(dataStr) {
  try {
    const d = new Date(dataStr + 'T12:00:00');
    return d.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  } catch (e) { return dataStr; }
}

function buildOutputText(data, voci) {
  const righe = voci.filter(v => v.stato !== 'assente').map(v => {
    if (v.stato === 'presente') return `${v.nome} - presente`;
    const lbl = v.stato === 'uscito_prima' ? 'uscito prima' : 'arrivato dopo';
    const ora = v.orario ? ` (ore ${v.orario})` : '';
    return `${v.nome} - ${lbl}${ora}`;
  });
  const intestazione = `Presenze squadriglia ${session.squadriglia} - ${formatDataIt(data)}:`;
  return righe.length ? intestazione + '\n' + righe.join('\n') : intestazione + '\nNessuna persona presente.';
}

async function generaOutput() {
  const data = document.getElementById('in-data').value || new Date().toISOString().slice(0, 10);
  const selects = document.querySelectorAll('#presenze-list select');
  const voci = [];
  selects.forEach((sel, i) => {
    const stato = sel.value;
    const orarioEl = document.getElementById('orario-' + i);
    voci.push({ nome: sel.dataset.nome, stato, orario: (orarioEl && !orarioEl.classList.contains('hidden')) ? orarioEl.value.trim() : '' });
  });

  storico = storico.filter(r => r.data !== data);
  storico.push({ data, voci });
  storico.sort((a, b) => b.data.localeCompare(a.data));
  await saveField('storico', storico);

  document.getElementById('sq-nome-3').textContent = session.squadriglia;
  document.getElementById('output-text').value = buildOutputText(data, voci);
  const backBtn = document.getElementById('output-back-btn');
  backBtn.textContent = '← Modifica';
  backBtn.onclick = goToPresenze;
  showView('view-output');
}

async function inviaOutputComeMessaggio() {
  const testo = document.getElementById('output-text').value;
  if (!testo) return;
  messaggi.unshift({ autore: session.nome, testo, data: Date.now() });
  await saveField('messaggi', messaggi);
  toast('Messaggio inviato alla squadriglia!');
  goToMessaggi();
}

async function copyOutput() {
  const ta = document.getElementById('output-text');
  try { await navigator.clipboard.writeText(ta.value); toast('Copiato negli appunti!'); }
  catch (e) { ta.select(); toast('Seleziona e copia manualmente'); }
}

// --- Promemoria (solo capi) ---
function goToPromemoria() {
  document.getElementById('sq-nome-5').textContent = session.squadriglia;
  const dataInput = document.getElementById('pr-data');
  if (!dataInput.value) dataInput.value = new Date().toISOString().slice(0, 10);
  showView('view-promemoria');
}

function generaPromemoria() {
  const data = document.getElementById('pr-data').value;
  const ora = document.getElementById('pr-ora').value.trim();
  const luogo = document.getElementById('pr-luogo').value.trim();
  const note = document.getElementById('pr-note').value.trim();
  if (!data) { toast('Inserisci la data'); return; }

  let testo = `📣 Promemoria riunione squadriglia ${session.squadriglia}\n📅 ${formatDataIt(data)}`;
  if (ora) testo += `\n🕒 ${ora}`;
  if (luogo) testo += `\n📍 ${luogo}`;
  if (note) testo += `\n\n${note}`;

  document.getElementById('sq-nome-3').textContent = session.squadriglia;
  document.getElementById('output-text').value = testo;
  const backBtn = document.getElementById('output-back-btn');
  backBtn.textContent = '← Modifica';
  backBtn.onclick = goToPromemoria;
  showView('view-output');
}

// --- Storico ---
async function goToStorico() {
  document.getElementById('sq-nome-4').textContent = session.squadriglia;
  await refreshData();
  const list = document.getElementById('storico-list');
  list.innerHTML = '';
  if (storico.length === 0) { list.innerHTML = '<div class="empty">Nessuna riunione salvata ancora.</div>'; showView('view-storico'); return; }
  storico.forEach((r, i) => {
    const presenti = r.voci.filter(v => v.stato !== 'assente').length;
    const row = document.createElement('div');
    row.className = 'storico-item';
    row.onclick = () => viewStoricoEntry(i);
    row.innerHTML = `<div><div class="d">${formatDataIt(r.data)}</div><div class="s">${presenti} presenti/parziali su ${r.voci.length}</div></div><button class="del" onclick="deleteStoricoEntry(${i}, event)">elimina</button>`;
    list.appendChild(row);
  });
  showView('view-storico');
}

function viewStoricoEntry(i) {
  const r = storico[i];
  document.getElementById('sq-nome-3').textContent = session.squadriglia;
  document.getElementById('output-text').value = buildOutputText(r.data, r.voci);
  const backBtn = document.getElementById('output-back-btn');
  backBtn.textContent = '← Cronologia';
  backBtn.onclick = goToStorico;
  showView('view-output');
}

async function deleteStoricoEntry(i, ev) {
  ev.stopPropagation();
  storico.splice(i, 1);
  await saveField('storico', storico);
  goToStorico();
}

// --- Calendario ---
function goToCalendario() { showView('view-calendario'); }

// --- Messaggi ---
async function goToMessaggi() {
  document.getElementById('sq-nome-6').textContent = session.squadriglia;
  document.getElementById('msg-invio-card').classList.toggle('hidden', session.ruolo !== 'capo');
  await refreshData();
  renderMessaggi();
  showView('view-messaggi');
}

function renderMessaggi() {
  const list = document.getElementById('messaggi-list');
  list.innerHTML = '';
  if (messaggi.length === 0) { list.innerHTML = '<div class="empty">Nessun messaggio ancora.</div>'; return; }
  messaggi.forEach(m => {
    const dataStr = new Date(m.data).toLocaleString('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    const row = document.createElement('div');
    row.className = 'msg-item';
    row.innerHTML = `<span class="data">${dataStr}</span><div class="autore">${escapeHtml(m.autore)}</div><div class="testo">${escapeHtml(m.testo)}</div>`;
    list.appendChild(row);
  });
}

async function inviaMessaggio() {
  const el = document.getElementById('msg-testo');
  const testo = el.value.trim();
  if (!testo) return;
  messaggi.unshift({ autore: session.nome, testo, data: Date.now() });
  el.value = '';
  renderMessaggi();
  await saveField('messaggi', messaggi);
}

function escapeHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

(function init() {
  aggiornaHintCodice();
  loadAccounts();
  if (accounts.length > 0) renderWelcome();
  else showView('view-login');
})();
