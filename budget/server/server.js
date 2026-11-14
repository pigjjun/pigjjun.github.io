#!/usr/bin/env node
/**
 * 우리집 가계부 서버 — 맥북에서 돌아가는 작은 저장소.
 *
 * 하는 일은 세 가지뿐이다: PIN 확인(기기 등록), 문서 저장, 바뀐 문서 돌려주기.
 * 어떤 항목이 있는지(지출·예산·할 일…)는 전혀 모른다. 그래서 앱에 기능이 늘어도
 * 이 파일은 다시 설치할 필요가 없다.
 *
 * 데이터: <이 파일 옆>/data/db.json  (매일 data/backups/ 에 하루 한 벌, 60일치)
 * 쓰는 법:
 *   node server.js setup      처음 한 번: PIN 정하기 + 구글 시트 데이터 가져오기
 *   node server.js            서버 실행 (127.0.0.1:8787)
 *   node server.js pin        PIN 바꾸기 (등록된 기기는 모두 다시 PIN을 넣어야 함)
 *   node server.js import     구글 시트에서 다시 가져오기 (비어 있을 때만, --force 로 덮어쓰기)
 * 외부 패키지 없이 Node 18 이상이면 된다.
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const readline = require('readline');

const DIR = process.env.BUDGET_DIR || __dirname;
const DATA = path.join(DIR, 'data');
const DB_FILE = path.join(DATA, 'db.json');
const CONF_FILE = path.join(DATA, 'config.json');
const BACKUPS = path.join(DATA, 'backups');
const APP_DIR = path.join(DIR, 'app');           // 있으면 앱 화면도 같이 내준다 (선택)
const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '127.0.0.1';    // 밖에서는 Tailscale Funnel을 통해서만 들어온다
const LEGACY_SHEET_API = 'https://script.google.com/macros/s/AKfycbwc-r53xhdvGCqANA7Bfp2yG0pN4AIUBVWD6yrEUA5daLWmR3KyN8nwdDGVjhZY9niU/exec';
const DEFAULT_ORIGINS = ['https://pigjjun.github.io'];
const MAX_BODY = 4 * 1024 * 1024;
const MAX_FAILS = 10;                            // 한 시간에 PIN이 이만큼 틀리면 한 시간 잠금
const ID_RE = /^[A-Za-z0-9_.:@+-]{1,80}$/;

/* ---------- 파일 ---------- */
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
function writeJson(f, v) {
  fs.mkdirSync(path.dirname(f), {recursive: true});
  const tmp = f + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(v));
  fs.renameSync(tmp, f);                         // 쓰다 꺼져도 파일이 깨지지 않게
}
const newDb = () => ({epoch: crypto.randomBytes(8).toString('hex'), rev: 0, docs: {}, ops: []});
let db = readJson(DB_FILE, null) || newDb();
let conf = readJson(CONF_FILE, {});              // {pin:{salt,hash}, devices:{tokenHash:{name,created,seen}}, origins:[]}
conf.devices = conf.devices || {};

let saveTimer = null;
function saveDb() {                              // 잦은 저장을 0.2초 단위로 묶는다
  if (saveTimer) return;
  saveTimer = setTimeout(() => { saveTimer = null; writeJson(DB_FILE, db); backupDaily(); }, 200);
}
function saveDbNow() { clearTimeout(saveTimer); saveTimer = null; writeJson(DB_FILE, db); }
const saveConf = () => writeJson(CONF_FILE, conf);
function backupDaily() {
  const d = new Date(), day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const f = path.join(BACKUPS, `db-${day}.json`);
  if (fs.existsSync(f)) return;
  fs.mkdirSync(BACKUPS, {recursive: true});
  fs.copyFileSync(DB_FILE, f);
  const old = fs.readdirSync(BACKUPS).filter(n => /^db-\d{4}-\d\d-\d\d\.json$/.test(n)).sort();
  old.slice(0, Math.max(0, old.length - 60)).forEach(n => fs.unlinkSync(path.join(BACKUPS, n)));
}

/* ---------- 문서 저장소 ----------
   db.docs[col][id] = {r: 바뀐 순번, d: 문서} 또는 {r, x: 1}(삭제 표시) */
function applyOp(op) {
  if (!op || !ID_RE.test(op.col || '') || !ID_RE.test(op.id || '')) return;
  if (op.opId) {                                 // 같은 요청이 두 번 와도 한 번만 반영
    if (db.ops.includes(op.opId)) return;
    db.ops.push(op.opId);
    if (db.ops.length > 3000) db.ops.splice(0, db.ops.length - 3000);
  }
  const col = db.docs[op.col] || (db.docs[op.col] = {});
  const cur = col[op.id];
  const data = op.data && typeof op.data === 'object' && !Array.isArray(op.data) ? op.data : {};
  if (op.mode === 'delete') {
    if (!cur || cur.x) return;
    col[op.id] = {r: ++db.rev, x: 1};
  } else if (op.mode === 'create') {             // 없을 때만 만든다 (지운 것도 다시 만들지 않음)
    if (cur) return;
    col[op.id] = {r: ++db.rev, d: data};
  } else if (op.mode === 'update') {             // 준 칸만 바꾼다
    col[op.id] = {r: ++db.rev, d: {...(cur && cur.d || {}), ...data}};
  } else {
    col[op.id] = {r: ++db.rev, d: data};
  }
}
function changesSince(since) {
  const out = [];
  for (const col of Object.keys(db.docs)) for (const id of Object.keys(db.docs[col])) {
    const e = db.docs[col][id];
    if (e.r > since) out.push(e.x ? {col, id, del: 1} : {col, id, doc: e.d});
  }
  return out;
}

/* ---------- PIN · 기기 ---------- */
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
function hashPin(pin, salt = crypto.randomBytes(16).toString('hex')) {
  return {salt, hash: crypto.scryptSync(String(pin), salt, 32).toString('hex')};
}
function pinOk(pin) {
  if (!conf.pin) return false;
  const h = hashPin(pin, conf.pin.salt).hash;
  return crypto.timingSafeEqual(Buffer.from(h, 'hex'), Buffer.from(conf.pin.hash, 'hex'));
}
let fails = [];                                  // 틀린 시각들 (최근 한 시간)
const locked = () => { const t = Date.now() - 3600e3; fails = fails.filter(x => x > t); return fails.length >= MAX_FAILS; };
function deviceOf(req) {
  const m = /^Bearer ([a-f0-9]{64})$/.exec(req.headers.authorization || '');
  const d = m && conf.devices[sha(m[1])];
  if (d && Date.now() - (d.seen || 0) > 3600e3) { d.seen = Date.now(); saveConf(); }
  return d || null;
}

/* ---------- HTTP ---------- */
const origins = () => conf.origins && conf.origins.length ? conf.origins : DEFAULT_ORIGINS;
function send(res, code, body, extra = {}) {
  const buf = Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
  res.writeHead(code, {'Content-Type': 'application/json; charset=utf-8', 'Content-Length': buf.length, 'Cache-Control': 'no-store', ...extra});
  res.end(buf);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let n = 0; const chunks = [];
    req.on('data', c => { n += c.length; if (n > MAX_BODY) { reject(new Error('too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}
const MIME = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.txt': 'text/plain; charset=utf-8'};
function serveStatic(req, res, urlPath) {
  let rel = decodeURIComponent(urlPath).replace(/^\/+/, '');
  if (!rel || rel.endsWith('/')) rel += 'index.html';
  const file = path.join(APP_DIR, rel);
  if (!file.startsWith(APP_DIR + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return send(res, 404, {error: 'NOT_FOUND'});
  res.writeHead(200, {'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache'});
  fs.createReadStream(file).pipe(res);
}

async function handle(req, res) {
  const url = new URL(req.url, 'http://x');
  const origin = req.headers.origin;
  const cors = origin && origins().includes(origin)
    ? {'Access-Control-Allow-Origin': origin, 'Vary': 'Origin', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Max-Age': '86400'}
    : {};
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  if (!url.pathname.startsWith('/api/')) return req.method === 'GET' ? serveStatic(req, res, url.pathname) : send(res, 405, {error: 'METHOD'});

  if (url.pathname === '/api/ping') return send(res, 200, {ok: true, name: 'budget', ready: !!conf.pin}, cors);

  if (url.pathname === '/api/login' && req.method === 'POST') {
    if (locked()) return send(res, 429, {error: 'LOCKED'}, cors);
    const b = await readBody(req);
    if (!pinOk(b.pin)) { fails.push(Date.now()); await new Promise(r => setTimeout(r, 800)); return send(res, 401, {error: 'PIN_WRONG'}, cors); }
    const token = crypto.randomBytes(32).toString('hex');
    conf.devices[sha(token)] = {name: String(b.device || '기기').slice(0, 40), created: Date.now(), seen: Date.now()};
    saveConf();
    return send(res, 200, {token}, cors);
  }

  const dev = deviceOf(req);
  if (!dev) return send(res, 401, {error: 'AUTH'}, cors);

  if (url.pathname === '/api/sync' && req.method === 'POST') {
    const b = await readBody(req);
    const before = db.rev;
    (Array.isArray(b.ops) ? b.ops : []).slice(0, 5000).forEach(applyOp);
    if (db.rev !== before) saveDb();
    // 다른 저장소였거나(epoch 다름) 처음이면 전부, 아니면 그 뒤로 바뀐 것만
    const since = b.epoch === db.epoch && Number.isInteger(b.since) && b.since <= db.rev ? b.since : 0;
    return send(res, 200, {epoch: db.epoch, rev: db.rev, full: since === 0, changes: changesSince(since)}, cors);
  }
  if (url.pathname === '/api/export' && req.method === 'GET') {
    const out = {exported: new Date().toISOString(), docs: {}};
    for (const col of Object.keys(db.docs)) {
      out.docs[col] = {};
      for (const id of Object.keys(db.docs[col])) if (!db.docs[col][id].x) out.docs[col][id] = db.docs[col][id].d;
    }
    return send(res, 200, out, cors);
  }
  if (url.pathname === '/api/devices' && req.method === 'GET') {
    return send(res, 200, {devices: Object.values(conf.devices).map(d => ({name: d.name, created: d.created, seen: d.seen}))}, cors);
  }
  send(res, 404, {error: 'NOT_FOUND'}, cors);
}

function serve() {
  if (!conf.pin) { console.error('아직 PIN이 없어요. 먼저 실행하세요:  node server.js setup'); process.exit(1); }
  const srv = http.createServer((req, res) => {
    handle(req, res).catch(e => { try { send(res, 400, {error: 'BAD_REQUEST', message: String(e.message || e)}); } catch {} });
  });
  srv.listen(PORT, HOST, () => console.log(`가계부 서버가 켜졌어요: http://${HOST}:${PORT}  (데이터: ${DB_FILE})`));
  const stop = () => { try { if (saveTimer) saveDbNow(); } finally { process.exit(0); } };
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
  return srv;
}

/* ---------- 처음 설정 · 가져오기 ---------- */
function ask(q) {
  const input = process.stdin.isTTY ? process.stdin : fs.createReadStream('/dev/tty');
  const rl = readline.createInterface({input, output: process.stdout});
  return new Promise(r => rl.question(q, a => { rl.close(); if (input !== process.stdin) input.destroy(); r(a.trim()); }));
}
const docCount = () => Object.values(db.docs).reduce((a, c) => a + Object.values(c).filter(e => !e.x).length, 0);

// 구글 시트(예전 저장소)에서 지출·자금·생활비·할 일을 그대로 가져온다
async function importSheet(pin) {
  const r = await fetch(LEGACY_SHEET_API, {method: 'POST', redirect: 'follow', headers: {'Content-Type': 'text/plain;charset=utf-8'}, body: JSON.stringify({action: 'getAll', pin})});
  const j = await r.json();
  if (!j.ok) throw new Error(j.error === 'PIN_WRONG' ? 'PIN이 맞지 않아요' : j.error === 'LOCKED' ? '구글 시트가 잠겨 있어요. 한 시간 뒤 다시 해 주세요' : String(j.error));
  let n = 0;
  for (const col of Object.keys(j.data)) for (const doc of j.data[col] || []) {
    const {id, ...data} = doc;
    if (!ID_RE.test(String(id))) continue;
    applyOp({col, id: String(id), mode: 'set', data}); n++;
  }
  saveDbNow();
  return n;
}
async function setup() {
  console.log('\n우리집 가계부 서버 설정\n');
  if (conf.pin && docCount()) {
    console.log(`이미 설정되어 있어요 (문서 ${docCount()}개). 그대로 둘게요.\nPIN을 바꾸려면: node server.js pin`);
    return;
  }
  if (!docCount()) {
    const a = (await ask('지금 쓰는 구글 시트 데이터를 가져올까요? [Y/n] ')).toLowerCase();
    if (a !== 'n') {
      for (let k = 0; k < 3; k++) {
        const pin = await ask('지금 앱에서 쓰는 PIN: ');
        try {
          const n = await importSheet(pin);
          console.log(`가져왔어요: ${n}개 (지출·자금·생활비·할 일)`);
          conf.pin = hashPin(pin); saveConf();
          console.log('PIN은 지금 쓰던 것 그대로예요. 두 분 폰에서 다시 입력할 필요가 없어요.');
          return;
        } catch (e) { console.log('가져오지 못했어요: ' + e.message); }
      }
      console.log('가져오기를 건너뛸게요. 나중에: node server.js import');
    }
  }
  if (!conf.pin) await setPin();
}
async function setPin() {
  for (;;) {
    const pin = await ask('새 PIN (숫자 6자리 이상): ');
    if (!/^\d{6,12}$/.test(pin)) { console.log('숫자 6~12자리로 해 주세요.'); continue; }
    conf.pin = hashPin(pin); conf.devices = {}; saveConf();
    console.log('PIN을 정했어요.');
    return;
  }
}

const cmd = process.argv[2];
if (require.main === module) {
  (async () => {
    if (cmd === 'setup') await setup();
    else if (cmd === 'pin') await setPin();
    else if (cmd === 'import') {
      // --force: 구글 시트의 지출·자금·생활비·할 일로 같은 항목을 덮어쓴다 (가계부 내역은 건드리지 않음)
      if (docCount() && process.argv[3] !== '--force') { console.log(`이미 데이터가 있어요 (${docCount()}개). 구글 시트 내용으로 다시 덮어쓰려면: node server.js import --force`); return; }
      console.log(`가져왔어요: ${await importSheet(await ask('구글 시트 앱의 PIN: '))}개`);
    } else serve();
  })().catch(e => { console.error(e.message || e); process.exit(1); });
}
module.exports = {serve, applyOp, changesSince, hashPin, importSheet, _state: () => ({db, conf})};
