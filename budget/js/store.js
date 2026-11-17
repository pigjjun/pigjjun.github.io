/* ---------- 저장 · 동기화 ----------
   폰에 먼저 저장하고(화면 즉시 반영), 맥북 서버에는 뒤에서 올린다.
   맥북이 꺼져 있거나 인터넷이 없으면 '보낼 것'(outbox)에 쌓아 두었다가 연결되면 자동으로 올린다. */
const API = (window.BUDGET_API == null ? '' : String(window.BUDGET_API)).replace(/\/+$/, ''); // '' = 같은 주소(맥북이 앱도 내줄 때)
const K = {cache: 'hb-cache', outbox: 'hb-outbox', token: 'hb-token', me: 'hb-me'};
const store = {
  get(k){ try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v){ try { localStorage.setItem(k, v); } catch {} },
  del(k){ try { localStorage.removeItem(k); } catch {} },
  json(k, d){ try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
};
const loaded = new Set();
let cache = store.json(K.cache, null) || {epoch: '', rev: 0, docs: {}, dels: {}};
cache.dels = cache.dels || {};
let outbox = store.json(K.outbox, []);
let token = store.get(K.token) || '';
const net = {online: null, syncing: false, last: 0, synced: false};
const newId = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

function applyOpLocal(op){
  const col = cache.docs[op.col] || (cache.docs[op.col] = {}), key = op.col + '/' + op.id;
  if (op.mode === 'delete'){ delete col[op.id]; cache.dels[key] = 1; }
  else if (op.mode === 'create'){ if (!col[op.id] && !cache.dels[key]) col[op.id] = {...op.data}; }
  else if (op.mode === 'update'){ if (col[op.id]) col[op.id] = {...col[op.id], ...op.data}; }
  else { col[op.id] = {...op.data}; delete cache.dels[key]; }
}
function rebuild(){
  for (const c of COLS) S[c] = Object.entries(cache.docs[c] || {}).map(([id, d]) => ({...d, id}));
}
let persistT = 0;
function persistSoon(){
  clearTimeout(persistT);
  persistT = setTimeout(() => { store.set(K.cache, JSON.stringify(cache)); store.set(K.outbox, JSON.stringify(outbox)); }, 150);
}
function queue(ops){
  for (const op of ops){ op.opId = newId('o'); applyOpLocal(op); outbox.push(op); }
  rebuild(); persistSoon(); renderAll(); updateSyncUI();
  setTimeout(sync, 0);
}
// 예전 코드와 같은 모양: 화면에 바로 반영되고 항상 true (실패해도 보낼 것에 남아 다시 시도)
async function write(col, id, data, mode = 'set'){ queue([{col, id, mode, data: data || {}}]); return true; }
async function writeMany(col, updates){ if (updates.length) queue(updates.map(u => ({col, id: u.id, mode: 'update', data: u.data}))); return true; }
function createIfAbsent(col, id, data){
  if (cache.docs[col]?.[id] || cache.dels[col + '/' + id]) return false;
  queue([{col, id, mode: 'create', data}]); return true;
}

async function call(path, body, method = 'POST'){
  const r = await fetch(API + path, {method, credentials: 'omit', cache: 'no-store',
    headers: {...(body ? {'Content-Type': 'application/json'} : {}), ...(token ? {Authorization: 'Bearer ' + token} : {})},
    body: body ? JSON.stringify(body) : undefined});
  let j = null; try { j = await r.json(); } catch {}
  if (!r.ok){ const e = new Error(j?.error || 'HTTP_' + r.status); e.status = r.status; throw e; }
  return j;
}
async function sync(){
  if (net.syncing || !token) return;
  net.syncing = true; updateSyncUI();
  const sent = outbox.slice();
  try {
    const j = await call('/api/sync', {epoch: cache.epoch, since: cache.rev, ops: sent});
    if (j.full){ cache.docs = {}; cache.dels = {}; }
    for (const c of j.changes){
      const col = cache.docs[c.col] || (cache.docs[c.col] = {}), key = c.col + '/' + c.id;
      if (c.del){ delete col[c.id]; cache.dels[key] = 1; } else { col[c.id] = c.doc; delete cache.dels[key]; }
    }
    cache.epoch = j.epoch; cache.rev = j.rev;
    outbox = outbox.filter(o => !sent.includes(o));
    outbox.forEach(applyOpLocal);            // 기다리는 동안 새로 한 수정은 그 위에 다시 얹는다
    const first = !net.synced;
    net.online = true; net.last = Date.now(); net.synced = true;
    COLS.forEach(c => loaded.add(c));
    persistSoon();
    if (j.changes.length || j.full || first){ rebuild(); renderAll(); }
    if (j.full && j.rev === 0) UI.emptyServer = true;
    afterSync();
  } catch (e){
    if (e.status === 401){ token = ''; store.del(K.token); askPin(e.message === 'AUTH' ? '다시 PIN을 입력해 주세요' : ''); }
    net.online = false;
  } finally {
    net.syncing = false; updateSyncUI();
    if (net.online && outbox.length) setTimeout(sync, 50);
  }
}
const clock = t => new Date(t).toLocaleTimeString('ko-KR', {hour: 'numeric', minute: '2-digit'});
function updateSyncUI(){
  const n = outbox.length;
  if (!token) return setSync('', '잠김');
  if (net.syncing && net.online === null) return setSync('', '연결 중…');
  if (net.online === false) return setSync('bad', n ? `저장 대기 ${n}건 · 맥북 연결 안 됨` : '맥북 연결 안 됨 · 저장된 내용 표시');
  if (n) return setSync('', `올리는 중 ${n}건`);
  setSync('ok', net.last ? clock(net.last) + ' 동기화' : '동기화됨');
}

/* ---------- PIN · 기기 ---------- */
const me = () => store.get(K.me) || '';
function askPin(msg){
  $('#lock-msg').textContent = msg || '';
  $('#lock').hidden = false;
  $('#lock-pin').value = '';
  const who = me() || store.get('budget-card') || '';
  document.querySelectorAll('#lock-who input').forEach(r => { r.checked = r.value === who; });
  setTimeout(() => $('#lock-pin').focus(), 50);
}
async function login(pin, who){
  const j = await call('/api/login', {pin, device: (CARDS[who] || '누군가') + ' 폰'});
  token = j.token; store.set(K.token, token);
  if (who) store.set(K.me, who);
}
$('#lock-form').addEventListener('submit', async e => {
  e.preventDefault();
  const pin = $('#lock-pin').value.trim(), who = document.querySelector('#lock-who input:checked')?.value || '';
  if (!pin) return;
  if (!who){ $('#lock-msg').textContent = '누구 폰인지 골라 주세요'; return; }
  const btn = $('#lock-form button[type=submit]'); btn.disabled = true; $('#lock-msg').textContent = '확인 중…';
  try {
    await login(pin, who);
    $('#lock').hidden = true;
    rememberCard(who);
    sync();
  } catch (err){
    $('#lock-msg').textContent = err.message === 'PIN_WRONG' ? 'PIN이 맞지 않아요'
      : err.message === 'LOCKED' ? '여러 번 틀려서 잠겼어요. 한 시간 뒤 다시 해 주세요'
      : '맥북에 연결되지 않아요. 맥북이 켜져 있는지 확인해 주세요';
  }
  btn.disabled = false;
});

// 예전(구글 시트) 앱이 이 폰에 남겨 둔 데이터 — 서버가 비어 있을 때만 올리자고 제안한다
function legacyData(){
  const j = store.json('budget-cache', null);
  return j && Array.isArray(j.items) && j.items.length ? j : null;
}
function uploadLegacy(){
  const j = legacyData(); if (!j) return;
  const ops = [];
  for (const col of ['items', 'funds', 'monthly', 'todos']) for (const d of j[col] || []){
    const {id, ...data} = d; if (id) ops.push({col, id: String(id), mode: 'create', data});
  }
  UI.emptyServer = false;
  queue(ops);
  toast(`${ops.length}건을 맥북으로 올렸어요`);
}

async function startStore(){
  rebuild();
  if (Object.keys(cache.docs).length) { COLS.forEach(c => loaded.add(c)); renderAll(); }   // 저장된 내용 먼저 보여 준다
  if (!token){
    const oldPin = store.get('budget-pin');                                // 예전 앱의 PIN이 있으면 조용히 등록
    if (oldPin){ try { await login(oldPin, me() || store.get('budget-card') || ''); } catch {} }
  }
  if (!token) return askPin();
  if (!me()) $('#who').hidden = false;
  sync();
}
setInterval(() => { if (document.visibilityState === 'visible') sync(); }, 20000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') sync(); });
window.addEventListener('online', sync);
window.addEventListener('pagehide', () => { store.set(K.cache, JSON.stringify(cache)); store.set(K.outbox, JSON.stringify(outbox)); });
