// Extracted from Pangasüsteem.html

// ═══════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════
const state = {
  clients: [],
  accounts: [],
  transactions: [],
  loans: [],
  loanSchedules: {},
  nextClientID: 1,
  nextAccountID: 1,
  nextTxnID: 1,
  nextLoanID: 1,
  sqlLog: []
};

// ═══════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════
function genKontoNr() {
  const n = Math.floor(Math.random() * 1e16).toString().padStart(16, '0');
  return 'EE38' + n.substring(0, 16);
}
function fmt(n) { return Number(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ' '); }
function now() { return new Date().toLocaleString('et-EE'); }
function txnTypeLabel(t) {
  const m = {KREDIT:'Sissemaks',DEEBET:'Väljavõtt',ÜLEKAN_SISSE:'Ülekan sisse',ÜLEKAN_VÄLJA:'Ülekan välja',LAEN_VÄLJA:'Laen välja',LAEN_TAGASI:'Laenu maks',INTRESS:'Intress'};
  return m[t] || t;
}
function txnBadgeClass(t) {
  if (['KREDIT','ÜLEKAN_SISSE','LAEN_VÄLJA'].includes(t)) return 'badge-green';
  if (['DEEBET','ÜLEKAN_VÄLJA'].includes(t)) return 'badge-red';
  if (t === 'LAEN_TAGASI') return 'badge-blue';
  return 'badge-warn';
}

function showPage(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('page-' + id).classList.add('active');
  document.querySelectorAll('.nav-btn').forEach(b => {
    if (b.getAttribute('onclick')?.includes("'" + id + "'")) b.classList.add('active');
  });
  if (id === 'dashboard') renderDashboard();
  if (id === 'clients') renderClients();
  if (id === 'accounts') renderAccounts();
  if (id === 'transfer' || id === 'deposit' || id === 'withdraw') populateAccountSelects();
  if (id === 'history') { populateHistoryFilters(); renderHistory(); }
  if (id === 'loans') renderLoans();
  if (id === 'new-loan') populateClientSelects('nl-klient');
  if (id === 'loan-payment') { populateLoanSelects(); populateAccountSelects('lp-konto','ARVELDUS'); }
  if (id === 'add-account') populateClientSelects('aa-klient');
}

function toast(msg, type='success') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'show ' + type;
  setTimeout(() => t.className = '', 3000);
}

function logSQL(label, sql) {
  state.sqlLog.unshift({ label, sql, time: now() });
  if (document.getElementById('page-sql-view').classList.contains('active')) {
    renderSQLLog();
  }
}

function hlSQL(sql) {
  const kws = ['EXEC','BEGIN','COMMIT','ROLLBACK','INSERT','INTO','VALUES','UPDATE','SET','WHERE','SELECT','FROM','DECLARE','IF','NOT','EXISTS','THROW','OUTPUT','TRANSACTION'];
  let s = sql.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  kws.forEach(k => { s = s.replace(new RegExp('\\b' + k + '\\b', 'g'), `<span class="sql-kw">${k}</span>`); });
  s = s.replace(/'([^']*)'/g, `<span class="sql-str">'$1'</span>`);
  s = s.replace(/\b(\d+\.?\d*)\b/g, `<span class="sql-num">$1</span>`);
  return s;
}

// ═══════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════
function renderDashboard() {
  document.getElementById('stat-clients').textContent = state.clients.filter(c=>c.active).length;
  document.getElementById('stat-accounts').textContent = state.accounts.filter(a=>a.active).length;
  document.getElementById('stat-txns').textContent = state.transactions.length;
  document.getElementById('stat-loans').textContent = state.loans.filter(l=>l.status==='AKTIIVNE').length;

  const tbody = document.getElementById('recent-txns-body');
  const recent = [...state.transactions].reverse().slice(0, 8);
  if (!recent.length) { tbody.innerHTML = '<tr><td colspan="4" class="empty">Tehinguid pole</td></tr>'; return; }
  tbody.innerHTML = recent.map(t => {
    const acc = state.accounts.find(a => a.id === t.accountID);
    return `<tr>
      <td>${acc ? acc.nr.substring(0,12)+'…' : '—'}</td>
      <td><span class="badge ${txnBadgeClass(t.type)}">${txnTypeLabel(t.type)}</span></td>
      <td>${t.type.includes('VÄLJA') || t.type==='DEEBET' ? '-' : '+'}${fmt(t.amount)} €</td>
      <td style="color:var(--muted);font-size:0.7rem">${t.date}</td>
    </tr>`;
  }).join('');

  const mini = document.getElementById('account-cards-mini');
  const accs = state.accounts.filter(a=>a.active).slice(0,4);
  if (!accs.length) { mini.innerHTML = '<div class="empty"><div class="empty-icon">🏦</div>Kontosid pole</div>'; return; }
  mini.innerHTML = accs.map(a => {
    const cl = state.clients.find(c=>c.id===a.clientID);
    return `<div class="account-card" style="margin-bottom:12px">
      <div class="account-nr">${a.nr}</div>
      <div class="account-name">${cl ? cl.name : '—'}</div>
      <div class="account-balance">${fmt(a.balance)} ${a.currency}</div>
      <div class="account-type">${a.type}</div>
    </div>`;
  }).join('');
}

// ═══════════════════════════════════════════════
// CLIENTS
// ═══════════════════════════════════════════════
function addClient() {
  const e = v => document.getElementById(v).value.trim();
  const fn=e('ac-eesnimi'), ln=e('ac-perenimi'), ic=e('ac-isikukood'), em=e('ac-email'), ph=e('ac-telefon'), addr=e('ac-aadress');
  if (!fn||!ln||!ic||!em) { toast('Täida kohustuslikud väljad','error'); return; }
  if (state.clients.find(c=>c.isikukood===ic)) { toast('Selle isikukoodiga klient on juba olemas','error'); return; }
  const id = state.nextClientID++;
  const c = { id, name: fn+' '+ln, firstName: fn, lastName: ln, isikukood: ic, email: em, phone: ph, address: addr, created: now(), active: true };
  state.clients.push(c);
  const sql = `DECLARE @KlientID INT;\nEXEC dbo.sp_LisaKlient\n  @Eesnimi   = '${fn}',\n  @Perenimi  = '${ln}',\n  @Isikukood = '${ic}',\n  @Email     = '${em}',\n  @Telefon   = '${ph||'NULL'}',\n  @Aadress   = '${addr||'NULL'}',\n  @KlientID  = @KlientID OUTPUT;\nSELECT @KlientID AS UusKlientID; -- => ${id}`;
  document.getElementById('add-client-sql-code').innerHTML = hlSQL(sql);
  logSQL('Lisa klient: ' + c.name, sql);
  toast('Klient ' + c.name + ' lisatud!');
  ['ac-eesnimi','ac-perenimi','ac-isikukood','ac-email','ac-telefon','ac-aadress'].forEach(id=>document.getElementById(id).value='');
}

function renderClients() {
  const tbody = document.getElementById('clients-table-body');
  if (!state.clients.length) { tbody.innerHTML = '<tr><td colspan="6" class="empty">Kliente pole</td></tr>'; return; }
  tbody.innerHTML = state.clients.map(c => {
    const accs = state.accounts.filter(a=>a.clientID===c.id);
    return `<tr>
      <td style="color:var(--muted)">#${c.id}</td>
      <td><b>${c.name}</b></td>
      <td style="color:var(--muted)">${c.isikukood}</td>
      <td>${c.email}</td>
      <td>${c.phone||'—'}</td>
      <td>${accs.length ? accs.map(a=>`<span class="badge badge-blue">${a.type}</span>`).join(' ') : '—'}</td>
    </tr>`;
  }).join('');
}

function updateAddClientSQL() {
  const e = v => document.getElementById(v).value.trim()||'?';
  const sql = `EXEC dbo.sp_LisaKlient\n  @Eesnimi   = '${e('ac-eesnimi')}',\n  @Perenimi  = '${e('ac-perenimi')}',\n  @Isikukood = '${e('ac-isikukood')}',\n  @Email     = '${e('ac-email')}',\n  @KlientID  = @out OUTPUT;`;
  document.getElementById('add-client-sql-code').innerHTML = hlSQL(sql);
}
['ac-eesnimi','ac-perenimi','ac-isikukood','ac-email'].forEach(id => {
  setTimeout(()=>{ const el=document.getElementById(id); if(el) el.addEventListener('input', updateAddClientSQL); },100);
});

// ═══════════════════════════════════════════════
// ACCOUNTS
// ═══════════════════════════════════════════════
function addAccount() {
  const clientID = parseInt(document.getElementById('aa-klient').value);
  const type = document.getElementById('aa-type').value;
  const currency = document.getElementById('aa-currency').value;
  if (!clientID) { toast('Vali klient','error'); return; }
  const cl = state.clients.find(c=>c.id===clientID);
  const id = state.nextAccountID++;
  const nr = genKontoNr();
  const acc = { id, nr, clientID, type, currency, balance: 0, created: now(), active: true };
  state.accounts.push(acc);
  const sql = `DECLARE @KontoID INT;\nEXEC dbo.sp_AvaKonto\n  @KlientID  = ${clientID},\n  @KontoTüüp = '${type}',\n  @Valuuta   = '${currency}',\n  @KontoID   = @KontoID OUTPUT;\nSELECT @KontoID AS UusKontoID; -- => ${id}`;
  document.getElementById('add-account-sql-code').innerHTML = hlSQL(sql);
  logSQL('Ava konto: ' + cl.name, sql);
  toast('Konto avatud! ' + nr);
}

function renderAccounts() {
  const grid = document.getElementById('accounts-grid');
  if (!state.accounts.filter(a=>a.active).length) {
    grid.innerHTML = '<div class="empty" style="grid-column:1/-1"><div class="empty-icon">🏦</div>Kontosid pole</div>';
    return;
  }
  grid.innerHTML = state.accounts.filter(a=>a.active).map(a => {
    const cl = state.clients.find(c=>c.id===a.clientID);
    return `<div class="account-card">
      <div class="account-nr">${a.nr}</div>
      <div class="account-name">${cl ? cl.name : '—'}</div>
      <div class="account-balance">${fmt(a.balance)} ${a.currency}</div>
      <div class="account-type">${a.type}</div>
    </div>`;
  }).join('');
}

function populateClientSelects(id='nl-klient') {
  const sel = document.getElementById(id);
  sel.innerHTML = state.clients.filter(c=>c.active).map(c => `<option value="${c.id}">${c.name} (#${c.id})</option>`).join('');
  if (!sel.innerHTML) sel.innerHTML = '<option value="">— Pole kliente —</option>';
}

function populateAccountSelects(id=null, filterType=null) {
  const ids = id ? [id] : ['tr-from','tr-to','dep-konto','wd-konto'];
  ids.forEach(selId => {
    const sel = document.getElementById(selId);
    if (!sel) return;
    const accs = state.accounts.filter(a => a.active && (!filterType || a.type === filterType));
    sel.innerHTML = accs.map(a => {
      const cl = state.clients.find(c=>c.id===a.clientID);
      return `<option value="${a.id}">${a.nr.substring(0,10)}… — ${cl?cl.name:'?'} (${fmt(a.balance)} €)</option>`;
    }).join('');
    if (!sel.innerHTML) sel.innerHTML = '<option value="">— Pole kontosid —</option>';
  });
}

// ═══════════════════════════════════════════════
// TRANSACTIONS
// ═══════════════════════════════════════════════
function addTxn(accountID, type, amount, desc, linkedID=null) {
  const acc = state.accounts.find(a=>a.id===accountID);
  const balAfter = acc.balance;
  const txn = { id: state.nextTxnID++, accountID, type, amount, balanceAfter: balAfter, desc, linkedID, date: now() };
  state.transactions.push(txn);
  return txn;
}

function doDeposit() {
  const accID = parseInt(document.getElementById('dep-konto').value);
  const amount = parseFloat(document.getElementById('dep-summa').value);
  const desc = document.getElementById('dep-kirjeldus').value || 'Sissemaks';
  if (!accID || !amount || amount <= 0) { toast('Vali konto ja sisesta summa','error'); return; }
  const acc = state.accounts.find(a=>a.id===accID);
  acc.balance = Math.round((acc.balance + amount) * 100) / 100;
  addTxn(accID, 'KREDIT', amount, desc);
  const sql = `EXEC dbo.sp_Sissemaks\n  @KontoID   = ${accID},\n  @Summa     = ${amount.toFixed(2)},\n  @Kirjeldus = '${desc}';`;
  document.getElementById('deposit-sql-code').innerHTML = hlSQL(sql);
  logSQL('Sissemaks ' + fmt(amount) + ' €', sql);
  toast('+' + fmt(amount) + ' € lisatud!');
  populateAccountSelects();
}

function doWithdraw() {
  const accID = parseInt(document.getElementById('wd-konto').value);
  const amount = parseFloat(document.getElementById('wd-summa').value);
  const desc = document.getElementById('wd-kirjeldus').value || 'Väljavõtt';
  if (!accID || !amount || amount <= 0) { toast('Vali konto ja sisesta summa','error'); return; }
  const acc = state.accounts.find(a=>a.id===accID);
  if (acc.balance < amount) { toast('Ebapiisav saldo! (' + fmt(acc.balance) + ' €)','error'); return; }
  acc.balance = Math.round((acc.balance - amount) * 100) / 100;
  addTxn(accID, 'DEEBET', amount, desc);
  const sql = `EXEC dbo.sp_Väljavõtt\n  @KontoID   = ${accID},\n  @Summa     = ${amount.toFixed(2)},\n  @Kirjeldus = '${desc}';`;
  document.getElementById('withdraw-sql-code').innerHTML = hlSQL(sql);
  logSQL('Väljavõtt ' + fmt(amount) + ' €', sql);
  toast('-' + fmt(amount) + ' € võetud!');
  populateAccountSelects();
}

function doTransfer() {
  const fromID = parseInt(document.getElementById('tr-from').value);
  const toID = parseInt(document.getElementById('tr-to').value);
  const amount = parseFloat(document.getElementById('tr-summa').value);
  const desc = document.getElementById('tr-selgitus').value || 'Ülekan';
  if (!fromID || !toID || !amount || amount <= 0) { toast('Täida kõik väljad','error'); return; }
  if (fromID === toID) { toast('Saatja ja saaja ei saa olla sama konto','error'); return; }
  const from = state.accounts.find(a=>a.id===fromID);
  const to = state.accounts.find(a=>a.id===toID);
  if (from.balance < amount) { toast('Ebapiisav saldo! (' + fmt(from.balance) + ' €)','error'); return; }
  from.balance = Math.round((from.balance - amount) * 100) / 100;
  to.balance = Math.round((to.balance + amount) * 100) / 100;
  const t1 = addTxn(fromID, 'ÜLEKAN_VÄLJA', amount, desc);
  const t2 = addTxn(toID, 'ÜLEKAN_SISSE', amount, desc);
  t1.linkedID = t2.id; t2.linkedID = t1.id;
  const sql = `DECLARE @ÜlekanneID INT;\nEXEC dbo.sp_TeostÜlekan\n  @SaatjaKontoID = ${fromID},\n  @SaajaKontoID  = ${toID},\n  @Summa         = ${amount.toFixed(2)},\n  @Selgitus      = '${desc}';`;
  document.getElementById('transfer-sql-code').innerHTML = hlSQL(sql);
  logSQL('Ülekan ' + fmt(amount) + ' €', sql);
  toast('Ülekan ' + fmt(amount) + ' € teostatud!');
  populateAccountSelects();
}

function updateTransferSQL() {
  const from = document.getElementById('tr-from').value;
  const to = document.getElementById('tr-to').value;
  const amt = document.getElementById('tr-summa').value || '?';
  const desc = document.getElementById('tr-selgitus').value || 'Ülekan';
  const sql = `EXEC dbo.sp_TeostÜlekan\n  @SaatjaKontoID = ${from||'?'},\n  @SaajaKontoID  = ${to||'?'},\n  @Summa         = ${parseFloat(amt)||'?'},\n  @Selgitus      = '${desc}';`;
  document.getElementById('transfer-sql-code').innerHTML = hlSQL(sql);
}
function updateDepositSQL() {
  const k = document.getElementById('dep-konto').value;
  const s = document.getElementById('dep-summa').value||'?';
  const d = document.getElementById('dep-kirjeldus').value||'Sissemaks';
  document.getElementById('deposit-sql-code').innerHTML = hlSQL(`EXEC dbo.sp_Sissemaks\n  @KontoID   = ${k||'?'},\n  @Summa     = ${s},\n  @Kirjeldus = '${d}';`);
}
function updateWithdrawSQL() {
  const k = document.getElementById('wd-konto').value;
  const s = document.getElementById('wd-summa').value||'?';
  const d = document.getElementById('wd-kirjeldus').value||'Väljavõtt';
  document.getElementById('withdraw-sql-code').innerHTML = hlSQL(`EXEC dbo.sp_Väljavõtt\n  @KontoID   = ${k||'?'},\n  @Summa     = ${s},\n  @Kirjeldus = '${d}';`);
}

// ═══════════════════════════════════════════════
// HISTORY
// ═══════════════════════════════════════════════
function populateHistoryFilters() {
  const sel = document.getElementById('hist-konto-filter');
  const cur = sel.value;
  sel.innerHTML = '<option value="">Kõik kontod</option>' + state.accounts.map(a => {
    const cl = state.clients.find(c=>c.id===a.clientID);
    return `<option value="${a.id}">${a.nr.substring(0,10)}… (${cl?cl.name:'?'})</option>`;
  }).join('');
  sel.value = cur;
}
function renderHistory() {
  const tbody = document.getElementById('history-table-body');
  const kFilter = document.getElementById('hist-konto-filter').value;
  const tFilter = document.getElementById('hist-type-filter').value;
  let txns = [...state.transactions].reverse();
  if (kFilter) txns = txns.filter(t=>t.accountID===parseInt(kFilter));
  if (tFilter) txns = txns.filter(t=>t.type===tFilter);
  if (!txns.length) { tbody.innerHTML = '<tr><td colspan="7" class="empty">Tehinguid pole</td></tr>'; return; }
  tbody.innerHTML = txns.map(t => {
    const acc = state.accounts.find(a=>a.id===t.accountID);
    const isOut = t.type.includes('VÄLJA') || t.type === 'DEEBET';
    return `<tr>
      <td style="color:var(--muted)">#${t.id}</td>
      <td style="font-size:0.7rem">${acc?acc.nr.substring(0,12)+'…':'—'}</td>
      <td><span class="badge ${txnBadgeClass(t.type)}">${txnTypeLabel(t.type)}</span></td>
      <td style="color:${isOut?'var(--danger)':'var(--accent)'}">${isOut?'-':'+'}${fmt(t.amount)} €</td>
      <td>${fmt(t.balanceAfter)} €</td>
      <td style="color:var(--muted)">${t.desc||'—'}</td>
      <td style="color:var(--muted);font-size:0.7rem">${t.date}</td>
    </tr>`;
  }).join('');
}

// ═══════════════════════════════════════════════
// LOANS
// ═══════════════════════════════════════════════
function calcAnnuity(P, rateYear, n) {
  if (!P || !n) return 0;
  const r = rateYear / 100 / 12;
  if (r === 0) return P / n;
  return P * r / (1 - Math.pow(1 + r, -n));
}

function calcLoan() {
  const P = parseFloat(document.getElementById('nl-summa').value);
  const rate = parseFloat(document.getElementById('nl-intress').value);
  const n = parseInt(document.getElementById('nl-tahtaeg').value);
  if (!P || isNaN(rate) || !n) return;
  const M = calcAnnuity(P, rate, n);
  document.getElementById('loan-monthly').textContent = fmt(M) + ' €';
  document.getElementById('loan-preview').style.display = '';
  // Schedule preview (first 5 + last)
  const tbody = document.getElementById('loan-schedule-preview');
  const r = rate / 100 / 12;
  let bal = P; let rows = '';
  for (let i = 1; i <= n; i++) {
    const interest = Math.round(bal * r * 100) / 100;
    const principal = Math.round((M - interest) * 100) / 100;
    if (i <= 5 || i === n) {
      if (i === n && n > 6) rows += `<tr><td colspan="5" style="color:var(--muted);text-align:center;padding:6px">… ${n-6} rida …</td></tr>`;
      rows += `<tr><td>${i}</td><td>${fmt(principal)}</td><td>${fmt(interest)}</td><td>${fmt(M)}</td><td>${fmt(Math.max(0,bal-principal))}</td></tr>`;
    }
    bal = Math.max(0, bal - principal);
  }
  tbody.innerHTML = rows;
  const sql = `DECLARE @LaenID INT;\nEXEC dbo.sp_VäljastLaen\n  @KlientID      = ${document.getElementById('nl-klient').value||'?'},\n  @Summa         = ${P.toFixed(2)},\n  @IntressimäärA = ${(rate/100).toFixed(4)},\n  @TähtaegKuudes = ${n},\n  @LaenID        = @LaenID OUTPUT;\n-- Kuumaks: ${fmt(M)} €`;
  document.getElementById('new-loan-sql').innerHTML = hlSQL(sql);
}

function doNewLoan() {
  const clientID = parseInt(document.getElementById('nl-klient').value);
  const P = parseFloat(document.getElementById('nl-summa').value);
  const rate = parseFloat(document.getElementById('nl-intress').value);
  const n = parseInt(document.getElementById('nl-tahtaeg').value);
  if (!clientID || !P || isNaN(rate) || !n) { toast('Täida kõik väljad','error'); return; }
  const cl = state.clients.find(c=>c.id===clientID);
  // Loo laenukonto
  const accID = state.nextAccountID++;
  const nr = genKontoNr();
  state.accounts.push({ id: accID, nr, clientID, type: 'LAEN', currency: 'EUR', balance: P, created: now(), active: true });
  const M = Math.round(calcAnnuity(P, rate, n) * 100) / 100;
  // Loo maksegraafik
  const r = rate / 100 / 12;
  let bal = P;
  const schedule = [];
  for (let i = 1; i <= n; i++) {
    const interest = Math.round(bal * r * 100) / 100;
    const principal = i === n ? bal : Math.round((M - interest) * 100) / 100;
    schedule.push({ nr: i, principal, interest, total: principal + interest, balance: Math.max(0, bal - principal), paid: false });
    bal = Math.max(0, bal - principal);
  }
  const loanID = state.nextLoanID++;
  state.loans.push({ id: loanID, clientID, accountID: accID, amount: P, remaining: P, rate, months: n, monthly: M, status: 'AKTIIVNE', created: now() });
  state.loanSchedules[loanID] = schedule;
  addTxn(accID, 'LAEN_VÄLJA', P, 'Laen #' + loanID);
  const sql = `DECLARE @LaenID INT;\nEXEC dbo.sp_VäljastLaen\n  @KlientID      = ${clientID},\n  @Summa         = ${P.toFixed(2)},\n  @IntressimäärA = ${(rate/100).toFixed(4)},\n  @TähtaegKuudes = ${n},\n  @LaenID        = @LaenID OUTPUT;\n-- Laen #${loanID} väljastatud ${cl.name} | Kuumaks: ${fmt(M)} €`;
  document.getElementById('new-loan-sql').innerHTML = hlSQL(sql);
  logSQL('Uus laen #' + loanID + ' — ' + cl.name, sql);
  toast('Laen ' + fmt(P) + ' € väljastatud ' + cl.name + '!');
}

function renderLoans() {
  const container = document.getElementById('loans-list');
  if (!state.loans.length) {
    container.innerHTML = '<div class="empty"><div class="empty-icon">💰</div>Laene pole</div>';
    return;
  }
  container.innerHTML = state.loans.map(l => {
    const cl = state.clients.find(c=>c.id===l.clientID);
    const schedule = state.loanSchedules[l.id] || [];
    const paid = schedule.filter(s=>s.paid).length;
    const pct = schedule.length ? Math.round(paid / schedule.length * 100) : 0;
    const nextPayment = schedule.find(s=>!s.paid);
    return `<div class="card">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px">
        <div>
          <div style="font-family:'Syne',sans-serif;font-weight:700;font-size:1.1rem">Laen #${l.id}</div>
          <div style="color:var(--muted);font-size:0.78rem">${cl?cl.name:'?'} · ${l.rate}% aastas · ${l.months} kuud</div>
        </div>
        <span class="badge ${l.status==='AKTIIVNE'?'badge-blue':l.status==='SULETUD'?'badge-green':'badge-red'}">${l.status}</span>
      </div>
      <div class="grid-3" style="margin-top:16px">
        <div class="stat-card"><div class="stat-label">Põhisumma</div><div class="stat-value" style="font-size:1.2rem">${fmt(l.amount)} €</div></div>
        <div class="stat-card"><div class="stat-label">Jäänuk</div><div class="stat-value warn" style="font-size:1.2rem">${fmt(l.remaining)} €</div></div>
        <div class="stat-card"><div class="stat-label">Kuumaks</div><div class="stat-value blue" style="font-size:1.2rem">${fmt(l.monthly)} €</div></div>
      </div>
      <div style="margin-top:16px">
        <div style="display:flex;justify-content:space-between;font-size:0.72rem;color:var(--muted);margin-bottom:4px">
          <span>Makstud maksed</span><span>${paid}/${schedule.length} (${pct}%)</span>
        </div>
        <div class="loan-progress"><div class="loan-progress-fill" style="width:${pct}%"></div></div>
      </div>
      ${nextPayment ? `<div style="margin-top:12px;font-size:0.78rem;color:var(--muted)">Järgmine maks: <b style="color:var(--text)">${fmt(nextPayment.total)} €</b> (põhiosa ${fmt(nextPayment.principal)} + intress ${fmt(nextPayment.interest)})</div>` : ''}
    </div>`;
  }).join('');
}

function populateLoanSelects() {
  const sel = document.getElementById('lp-laen');
  const activeLoans = state.loans.filter(l=>l.status==='AKTIIVNE');
  sel.innerHTML = activeLoans.map(l => {
    const cl = state.clients.find(c=>c.id===l.clientID);
    return `<option value="${l.id}">Laen #${l.id} — ${cl?cl.name:'?'} (${fmt(l.remaining)} €)</option>`;
  }).join('');
  if (!sel.innerHTML) sel.innerHTML = '<option value="">— Pole aktiivseid laene —</option>';
  updateLoanPaySQL();
}

function updateLoanPaySQL() {
  const loanID = document.getElementById('lp-laen').value;
  const accID = document.getElementById('lp-konto').value;
  const loan = state.loans.find(l=>l.id===parseInt(loanID));
  const next = loan ? (state.loanSchedules[loan.id]||[]).find(s=>!s.paid) : null;
  if (next) {
    document.getElementById('lp-info').innerHTML = `Järgmine maks nr ${next.nr}: põhiosa <b>${fmt(next.principal)} €</b> + intress <b>${fmt(next.interest)} €</b> = <b style="color:var(--accent)">${fmt(next.total)} €</b>`;
  }
  const sql = `EXEC dbo.sp_MaksaLaenMaks\n  @LaenID         = ${loanID||'?'},\n  @ArvelduKontoID = ${accID||'?'};`;
  document.getElementById('loan-pay-sql').innerHTML = hlSQL(sql);
}

function doLoanPayment() {
  const loanID = parseInt(document.getElementById('lp-laen').value);
  const accID = parseInt(document.getElementById('lp-konto').value);
  if (!loanID || !accID) { toast('Vali laen ja konto','error'); return; }
  const loan = state.loans.find(l=>l.id===loanID);
  const schedule = state.loanSchedules[loanID] || [];
  const next = schedule.find(s=>!s.paid);
  if (!next) { toast('Kõik maksed on tasutud!'); return; }
  const acc = state.accounts.find(a=>a.id===accID);
  if (acc.balance < next.total) { toast('Ebapiisav saldo! (' + fmt(acc.balance) + ' €)','error'); return; }
  // Teosta maks
  acc.balance = Math.round((acc.balance - next.total) * 100) / 100;
  loan.remaining = Math.round((loan.remaining - next.principal) * 100) / 100;
  next.paid = true;
  addTxn(accID, 'LAEN_TAGASI', next.total, 'Laen #' + loanID + ' maks #' + next.nr);
  if (!schedule.find(s=>!s.paid)) loan.status = 'SULETUD';
  const sql = `EXEC dbo.sp_MaksaLaenMaks\n  @LaenID         = ${loanID},\n  @ArvelduKontoID = ${accID};\n-- Maks #${next.nr}: ${fmt(next.total)} € (põhiosa ${fmt(next.principal)} + intress ${fmt(next.interest)})`;
  document.getElementById('loan-pay-sql').innerHTML = hlSQL(sql);
  logSQL('Laenu maks #' + next.nr + ' — ' + fmt(next.total) + ' €', sql);
  toast('Laenu maks ' + fmt(next.total) + ' € teostatud!');
  populateLoanSelects();
  populateAccountSelects();
}

// ═══════════════════════════════════════════════
// SQL LOG
// ═══════════════════════════════════════════════
function renderSQLLog() {
  const list = document.getElementById('sql-log-list');
  document.getElementById('sql-log-count').textContent = state.sqlLog.length + ' lauset';
  if (!state.sqlLog.length) { list.innerHTML = '<div class="empty">SQL logi on tühi</div>'; return; }
  list.innerHTML = state.sqlLog.map((entry, i) => `
    <div class="sql-panel" style="margin-bottom:14px">
      <div class="sql-header">
        <span>${entry.label}</span>
        <span style="color:var(--muted)">${entry.time}</span>
      </div>
      <div class="sql-code">${hlSQL(entry.sql)}</div>
    </div>`).join('');
}
function clearSQLLog() { state.sqlLog = []; renderSQLLog(); toast('SQL logi tühjendatud'); }

// ═══════════════════════════════════════════════
// SEED DATA — näidisandmed
// ═══════════════════════════════════════════════
(function seedDemo() {
  // 2 klienti
  state.clients.push({ id:1, name:'Aleks Rohtla', firstName:'Aleks', lastName:'Rohtla', isikukood:'49001011234', email:'aleks@email.ee', phone:'+372 5000 0001', address:'Tallinn', created:now(), active:true });
  state.clients.push({ id:2, name:'Jorgen Siimsoo', firstName:'Jorgen', lastName:'Siimsoo', isikukood:'38505050505', email:'jorgen@email.ee', phone:'+372 5000 0002', address:'Tartu', created:now(), active:true });
  state.nextClientID = 3;

  // Kontod
  state.accounts.push({ id:1, nr:'EE382200221020145685', clientID:1, type:'ARVELDUS', currency:'EUR', balance:4500, created:now(), active:true });
  state.accounts.push({ id:2, nr:'EE382200221030267891', clientID:2, type:'ARVELDUS', currency:'EUR', balance:3500, created:now(), active:true });
  state.nextAccountID = 3;

  // Tehingud
  state.transactions.push({ id:1, accountID:1, type:'KREDIT', amount:5000, balanceAfter:5000, desc:'Esialgne sissemaks', date:now() });
  state.transactions.push({ id:2, accountID:2, type:'KREDIT', amount:3000, balanceAfter:3000, desc:'Esialgne sissemaks', date:now() });
  state.transactions.push({ id:3, accountID:1, type:'ÜLEKAN_VÄLJA', amount:500, balanceAfter:4500, desc:'Laen sõbrale', date:now() });
  state.transactions.push({ id:4, accountID:2, type:'ÜLEKAN_SISSE', amount:500, balanceAfter:3500, desc:'Laen sõbrale', date:now() });
  state.nextTxnID = 5;
})();

// Init
renderDashboard();