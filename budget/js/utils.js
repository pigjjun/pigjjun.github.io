const STATUS = {
  plan:    {label:'구매 예정', short:'예정'},
  card:    {label:'카드결제', short:'카드'},
  settled: {label:'정산 완료', short:'정산'},
  gift:    {label:'선물 받음', short:'선물'},
};
const GROUP = {move:'이사', baby:'육아'};
const COLS = ['items','funds','monthly','todos','tx','rules'];

const S = {items:[], funds:[], monthly:[], todos:[], tx:[], rules:[]};
const UI = {tab:'home', ptab:'summary', group:'all', status:'all', q:'', editing:null};

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const won = n => Math.round(n || 0).toLocaleString('ko-KR') + '원';
const toNum = s => Number(String(s ?? '').replace(/[^\d-]/g, '')) || 0;
// 큰 금액은 억/만 단위로 (만 미만 버림, 정확한 값은 sub에)
function kr(n){
  n = Math.round(n || 0); const neg = n < 0; n = Math.abs(n);
  if (n < 10000) return (neg ? '-' : '') + n.toLocaleString('ko-KR') + '원';
  const eok = Math.floor(n / 1e8), man = Math.floor(n % 1e8 / 1e4), p = [];
  if (eok) p.push(eok.toLocaleString('ko-KR') + '억');
  if (man) p.push(man.toLocaleString('ko-KR') + '만');
  return (neg ? '-' : '') + p.join(' ') + '원';
}
// 짧게 읽기: 150,000,000 → "1억 5천만원", 147,337,570 → "1억 4,733만원"
function krShort(n){
  n = Math.round(n || 0);
  if (n < 10000) return n.toLocaleString('ko-KR') + '원';
  const eok = Math.floor(n / 1e8), man = Math.floor(n % 1e8 / 1e4), p = [];
  if (eok) p.push(eok.toLocaleString('ko-KR') + '억');
  if (man) p.push(man % 1000 === 0 ? man / 1000 + '천만' : man.toLocaleString('ko-KR') + '만');
  return p.join(' ') + '원';
}
// 카드 출금월은 'YYYY-MM'으로 저장한다 (해가 바뀌어도 순서가 꼬이지 않게).
// 예전에 저장된 '11월' 같은 값은 지금 기준 가장 가까운 해(-6~+5개월)로 읽는다.
function billKey(v){
  v = String(v || '').trim();
  if (/^\d{4}-\d{2}$/.test(v)) return v;
  const m = /^(\d{1,2})월$/.exec(v);
  if (!m || +m[1] < 1 || +m[1] > 12) return '';
  const now = new Date(), cur = now.getFullYear() * 12 + now.getMonth(), mo = +m[1] - 1;
  const y = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].find(yy => { const d = yy * 12 + mo - cur; return d >= -6 && d <= 5; });
  return y + '-' + String(mo + 1).padStart(2, '0');
}
// 올해면 '3월', 다른 해면 '27년 3월'
function billLabel(k){
  if (!/^\d{4}-\d{2}$/.test(k || '')) return '';
  const [y, m] = k.split('-').map(Number);
  return (y === new Date().getFullYear() ? '' : (y % 100) + '년 ') + m + '월';
}
// 고를 수 있는 출금월: 지난달 ~ 6달 뒤. 기본은 다음 달 (이번 달에 쓴 카드값은 보통 다음 달에 빠짐)
function billMonths(){
  const now = new Date();
  return [-1, 0, 1, 2, 3, 4, 5, 6].map(k => { const d = new Date(now.getFullYear(), now.getMonth() + k, 1); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); });
}
const defaultBill = () => billMonths()[2];
// 출금월 순서: 이른 달부터, 출금월 없는 것은 맨 뒤
const billRank = k => k ? k : '9999';
const sum = (arr, f = x => x.amount) => arr.reduce((a, x) => a + (Number(f(x)) || 0), 0);
const byOrder = (a, b) => (a.order ?? 0) - (b.order ?? 0) || String(a.name || a.text).localeCompare(String(b.name || b.text), 'ko');
const fundName = id => S.funds.find(f => f.id === id)?.name;
const activeFunds = () => S.funds.filter(f => !f.excluded);
// 이름에 '대출'이 들어가거나 id가 loan으로 시작하면 대출로 따로 계산한다
const isLoan = f => !!f && (/^loan/.test(f.id) || String(f.name || '').includes('대출'));
const assetFunds = () => S.funds.filter(f => !f.excluded && !isLoan(f));
const loanFunds = () => S.funds.filter(f => !f.excluded && isLoan(f));
/* 출처는 source 한 칸에 저장한다.
   "jeonse" = 전액 전세금, "jeonse,loan:15000000" = 대출 1,500만원 + 나머지 전세금,
   "loan:15000000" = 대출 1,500만원만 정하고 나머지는 미정. 금액 없는 칸이 '나머지'다. */
function parseSources(i){
  const parts = String(i.source || '').split(',').map(s => s.trim()).filter(Boolean).map(s => {
    const [fund, amt] = s.split(':');
    return {fund, amount: amt === undefined ? null : toNum(amt)};
  });
  const fixed = parts.reduce((a, p) => a + (p.amount ?? 0), 0);
  const free = parts.filter(p => p.amount === null);
  free.forEach(p => { p.amount = Math.max(0, (i.amount || 0) - fixed) / free.length; p.rest = true; });
  return parts;
}
// 결제 카드 명의. 카드값은 각자 카드 통장으로 빠지니, 통장마다 얼마 넣을지 계산할 때 쓴다
const CARDS = {gj: '광준', eh: '은혜'};
const cardName = k => CARDS[k] ? CARDS[k] + ' 카드' : '';
const CARD_PREF = 'budget-card'; // 이 기기에서 마지막으로 고른 카드 (아내 폰이면 아내 카드가 기본)
const lastCard = () => { try { return localStorage.getItem(CARD_PREF) || ''; } catch { return ''; } };
const rememberCard = k => { try { if (k) localStorage.setItem(CARD_PREF, k); } catch {} };
const cardSupported = () => true;
const unassignedOf = i => i.status === 'gift' ? 0 : Math.max(0, (i.amount || 0) - sum(parseSources(i)));
// 남은 금액을 이 자금에서 내도록 추가 (기존에 정한 몫은 그대로)
function withRemainder(i, fund){
  const fixed = parseSources(i).filter(p => !p.rest).map(p => p.fund + ':' + Math.round(p.amount));
  return [fund, ...fixed].join(',');
}
function sourceText(i){
  const parts = parseSources(i);
  if (!parts.length) return '';
  const rem = unassignedOf(i);
  const txt = parts.map(p => esc(fundName(p.fund) || '삭제된 자금') + (parts.length > 1 || rem ? ' ' + kr(p.amount) : '')).join(' + ');
  return '← ' + txt + (rem ? ` · <span class="warn">미정 ${kr(rem)}</span>` : '');
}

function toast(msg){
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  t.classList.remove('in'); void t.offsetWidth; t.classList.add('in');
  clearTimeout(toast.h); toast.h = setTimeout(() => t.hidden = true, 2200);
}
function setSync(state, text){ const el = $('#sync'); el.className = 'sync ' + state; el.querySelector('span').textContent = text; }

