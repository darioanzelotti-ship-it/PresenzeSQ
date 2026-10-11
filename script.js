let session = null;
let roster = [];
let storico = [];
let accounts = [];

const STATI = {
  assente: 'Assente',
  presente: 'Presente',
  uscito_prima: 'Uscito prima',
  arrivato_dopo: 'Arrivato dopo'
};

function showView(id) {
  ['view-welcome','view-login','view-roster','view-presenze','view-output','view-storico','view-calendario'].forEach(v => {
    document.getElementById(v).classList.toggle('hidden', v !== id);
  });
}

function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 1600);
}

function slug(s) { return s.trim().toLowerCase(); }
function rosterKey(sq) { return 'presenze_roster_' + slug(sq); }
function storicoKey(sq) { return 'presenze_storico_' + slug(sq); }

function loadAccounts() {
  try { accounts = JSON.parse(localStorage.getItem('presenze_accounts') || '[]'); }
  catch (e) { accounts = []; }
}
function saveAccounts() {
  try { localStorage.setItem('presenze_accounts', JSON.stringify(accounts)); } catch (e) {}
}
function upsertAccount(nome, squadriglia) {
  accounts = accounts.filter(a => !(slug(a.nome) === slug(nome) && slug(a.squadriglia) === slug(squadriglia)));
  accounts.unshift({ nome, squadriglia });
  accounts = accounts.slice(0, 5);
  saveAccounts();
}
function forgetAccount(i, ev) {
  ev.stopPropagation();
  accounts.splice(i, 1);
  saveAccounts();
  renderWelcome();
}

function loadRoster() {
  try { roster = JSON.parse(localStorage.getItem(rosterKey(session.squadriglia)) || '[]'); }
  catch (e) { roster = []; }
}
function saveRoster() {
  try { localStorage.setItem(rosterKey(session.squadriglia), JSON.stringify(roster)); } catch (e) {}
}

function loadStorico() {
  try { storico = JSON.parse(localStorage.getItem(storicoKey(session.squadriglia)) || '[]'); }
  catch (e) { storico = []; }
}
function saveStorico() {
  try { localStorage.setItem(storicoKey(session.squadriglia), JSON.stringify(storico)); } catch (e) {}
}

function renderWelcome() {
  const list = document.getElementById('accounts-list');
  list.innerHTML = '';
  if (accounts.length === 0) { showView('view-login'); return; }
  accounts.forEach((a, i) => {
    const row = document.createElement('div');
    row.className = 'account-row';
    row.innerHTML = `<button class="account-btn" onclick="selectAccount(${i})"><b>${escapeHtml(a.nome)}</b><span>Squadriglia ${escapeHtml(a.squadriglia)}</span></button><button class="forget-btn" onclick="forgetAccount(${i}, event)">✕</button>`;
    list.appendChild(row);
  });
  showView('view-welcome');
}

function selectAccount(i) {
  const a = accounts[i];
  session = { nome: a.nome, squadriglia: a.squadriglia };
  upsertAccount(a.nome, a.squadriglia);
  loadRoster();
  goToRoster();
}

function login() {
  const nome = document.getElementById('in-nome').value.trim();
  const squadriglia = document.getElementById('in-squadriglia').value.trim();
  if (!nome || !squadriglia) { toast('Inserisci nome e squadriglia'); return; }
  session = { nome, squadriglia };
  upsertAccount(nome, squadriglia);
  loadRoster();
  goToRoster();
}

function logout() {
  session = null;
  document.getElementById('in-nome').value = '';
  document.getElementById('in-squadriglia').value = '';
  renderWelcome();
}

function goToRoster() {
  document.getElementById('sq-nome-1').textContent = session.squadriglia;
  document.getElementById('user-nome-1').textContent = session.nome;
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

function addMember() {
  const input = document.getElementById('in-membro');
  const nome = input.value.trim();
  if (!nome) return;
  roster.push(nome);
  saveRoster();
  input.value = '';
  renderRoster();
}
function removeMember(i) { roster.splice(i, 1); saveRoster(); renderRoster(); }

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

function generaOutput() {
  const data = document.getElementById('in-data').value || new Date().toISOString().slice(0, 10);
  const selects = document.querySelectorAll('#presenze-list select');
  const voci = [];
  selects.forEach((sel, i) => {
    const stato = sel.value;
    const orarioEl = document.getElementById('orario-' + i);
    voci.push({ nome: sel.dataset.nome, stato, orario: (orarioEl && !orarioEl.classList.contains('hidden')) ? orarioEl.value.trim() : '' });
  });

  loadStorico();
  storico = storico.filter(r => r.data !== data);
  storico.push({ data, voci });
  storico.sort((a, b) => b.data.localeCompare(a.data));
  saveStorico();

  document.getElementById('sq-nome-3').textContent = session.squadriglia;
  document.getElementById('output-text').value = buildOutputText(data, voci);
  const backBtn = document.getElementById('output-back-btn');
  backBtn.textContent = '← Modifica';
  backBtn.onclick = goToPresenze;
  showView('view-output');
}

function goToCalendario() {
  showView('view-calendario');
}

function goToStorico() {
  loadStorico();
  document.getElementById('sq-nome-4').textContent = session.squadriglia;
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
  backBtn.textContent = '← Storico';
  backBtn.onclick = goToStorico;
  showView('view-output');
}

function deleteStoricoEntry(i, ev) {
  ev.stopPropagation();
  storico.splice(i, 1);
  saveStorico();
  goToStorico();
}

async function copyOutput() {
  const ta = document.getElementById('output-text');
  try { await navigator.clipboard.writeText(ta.value); toast('Copiato negli appunti!'); }
  catch (e) { ta.select(); toast('Seleziona e copia manualmente'); }
}

function escapeHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

(function init() {
  loadAccounts();
  if (accounts.length > 0) renderWelcome();
  else showView('view-login');
})();
