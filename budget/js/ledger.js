/* ---------- 가계부: 매일 쓰는 돈·들어온 돈 ----------
   tx 문서: {date:'YYYY-MM-DD', type:'out'|'in', amount, cat, memo, pay, by, rule?, at}
   지출 분류(cat)는 예산 항목(monthly)의 id, 수입 분류는 이름 그대로. */
const PAY = {gj: '광준 카드', eh: '은혜 카드', cash: '현금·이체'};
const INCOME_CATS = ['월급', '상여·성과급', '부수입', '기타 수입'];
const pad2 = n => String(n).padStart(2, '0');
const curMonth = () => todayStr().slice(0, 7);
const monthLabel = m => { const [y, mm] = m.split('-'); return `${y}년 ${+mm}월`; };
function addMonth(m, k){ const [y, mm] = m.split('-').map(Number); const d = new Date(y, mm - 1 + k, 1); return d.getFullYear() + '-' + pad2(d.getMonth() + 1); }
const daysIn = m => { const [y, mm] = m.split('-').map(Number); return new Date(y, mm, 0).getDate(); };
const txOf = m => S.tx.filter(t => String(t.date || '').startsWith(m));
const outs = a => a.filter(t => t.type !== 'in');
const ins = a => a.filter(t => t.type === 'in');
const catName = id => S.monthly.find(c => c.id === id)?.name || '';
const txCat = t => t.type === 'in' ? (t.cat || '수입') : (catName(t.cat) || '미분류');
const cats = () => [...S.monthly].sort(byOrder);
const byNewest = (a, b) => String(b.date).localeCompare(String(a.date)) || (b.at || 0) - (a.at || 0);
// 만원 단위 짧은 표기: 32,000 → 3.2만, 1,250,000 → 125만
function man(n){
  n = Math.round(n || 0);
  if (Math.abs(n) < 10000) return n.toLocaleString('ko-KR');
  const v = n / 10000;
  return (Math.abs(v) < 100 ? Math.round(v * 10) / 10 : Math.round(v)).toLocaleString('ko-KR') + '만';
}
UI.month = curMonth();
UI.lf = {type: 'all', cat: 'all', pay: 'all', q: '', day: ''};

function monthNav(){
  const cur = UI.month === curMonth();
  return `<div class="monthnav">
    <button type="button" class="mbtn" data-month="-1" aria-label="이전 달">‹</button>
    <b>${monthLabel(UI.month)}</b>
    <button type="button" class="mbtn" data-month="1" aria-label="다음 달">›</button>
    ${cur ? '' : '<button type="button" class="btn small" data-month="now">이번 달</button>'}
  </div>`;
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-month]');
  if (!b) return;
  UI.month = b.dataset.month === 'now' ? curMonth() : addMonth(UI.month, Number(b.dataset.month));
  UI.lf.day = '';
  renderHome(); renderLedger(); renderStats();
});

function txRow(t){
  const inc = t.type === 'in';
  const sub = [t.memo && t.memo !== txCat(t) ? esc(t.memo) : '', inc ? '' : `<span class="paytag c-${PAY[t.pay] ? (t.pay === 'cash' ? 'etc' : t.pay) : 'none'}">${esc(PAY[t.pay] || '결제수단 미정')}</span>`, t.rule ? '고정' : ''].filter(Boolean).join(' · ');
  return `<button type="button" class="txrow${UI.flash?.id === t.id && Date.now() - UI.flash.at < 900 ? ' flashrow' : ''}" data-tx="${esc(t.id)}">
    <span class="tx-l"><b>${esc(txCat(t))}</b><small>${sub}</small></span>
    <span class="tx-a num ${inc ? 'inc' : ''}">${inc ? '+' : ''}${won(t.amount)}</span>
  </button>`;
}
document.addEventListener('click', e => {
  if (Date.now() - sheetClosedAt < 400) return;
  const b = e.target.closest('[data-tx]');
  if (b) openTx(b.dataset.tx);
});

/* ---------- 홈: 이번 달 한눈에 ---------- */
function todoPanelHtml(){
  const todos = S.todos.filter(t => !t.done).sort(byOrder);
  return `<div class="panel" id="j-todo">
    <h2>남은 할 일 <small>${todos.length}개</small></h2>
    ${todos.length ? `<ul class="todos sumtodos">${todos.map((t, k) => `<li${k >= 4 && !UI.todoMore ? ' hidden' : ''}>
        <label><input type="checkbox" data-sumdone="${esc(t.id)}" aria-label="${esc(t.text)} 완료"><span class="tx">${esc(t.text)}</span>${dueBadge(t.due)}</label></li>`).join('')}</ul>
      <div class="row-actions">
        ${todos.length > 4 ? `<button type="button" class="btn small" data-todomore>${UI.todoMore ? '접기' : `${todos.length - 4}개 더 보기`}</button>` : ''}
        <button type="button" class="btn small ghost" data-gotab="todo">할 일 탭 ›</button>
      </div>` : '<div class="empty">다 했어요. <button type="button" class="btn small ghost" data-gotab="todo">할 일 추가 ›</button></div>'}
  </div>`;
}
function renderHome(){
  const el = $('#v-home');
  if (!loaded.has('tx')){ el.innerHTML = `<div class="panel empty">${token ? '맥북에서 데이터를 불러오는 중이에요…' : 'PIN을 입력하면 시작해요.'}</div>`; return; }
  const m = UI.month, tx = txOf(m), out = sum(outs(tx)), inc = sum(ins(tx)), budget = sum(S.monthly);
  const isCur = m === curMonth(), dim = daysIn(m), day = isCur ? Number(todayStr().slice(8)) : dim;
  const left = budget - out, daysLeft = dim - day + 1;
  const pct = budget ? Math.min(100, out / budget * 100) : 0;
  const pace = budget ? budget * day / dim : 0;               // 오늘까지 고르게 썼다면 이만큼

  let msg = '';
  if (!budget) msg = '설정에서 월 예산을 정하면 남은 돈을 알려 드려요.';
  else if (left < 0) msg = `예산을 <b class="warn">${won(-left)}</b> 넘었어요.`;
  else if (isCur) msg = `남은 ${daysLeft}일 동안 하루 <b>${won(Math.floor(left / daysLeft / 100) * 100)}</b>씩 쓸 수 있어요.`
    + (out > pace * 1.05 ? ` 고르게 쓸 때보다 ${won(out - pace)} 빨라요.` : '');
  else msg = `예산에서 <b>${won(left)}</b> 남겼어요.`;

  const spent = {};
  outs(tx).forEach(t => { const k = catName(t.cat) ? t.cat : ''; spent[k] = (spent[k] || 0) + (t.amount || 0); });
  const catRows = [...cats().map(c => ({id: c.id, name: c.name, budget: c.amount || 0, used: spent[c.id] || 0})),
    ...(spent[''] ? [{id: '', name: '미분류', budget: 0, used: spent['']}] : [])];
  const byPay = {gj: 0, eh: 0, cash: 0};
  outs(tx).forEach(t => { byPay[PAY[t.pay] ? t.pay : 'cash'] += t.amount || 0; });

  // 이번 달에 아직 안 나간 고정지출
  const upcoming = isCur ? S.rules.filter(r => r.active !== false && !cache.docs.tx?.['r_' + r.id + '_' + m.replace('-', '')] && !cache.dels['tx/r_' + r.id + '_' + m.replace('-', '')])
    .sort((a, b) => (a.day || 1) - (b.day || 1)) : [];
  const proj = S.items.length ? (() => {
    const total = sum(S.items), need = total - sum(assetFunds()), card = sum(S.items.filter(i => i.status === 'card'));
    return `<button type="button" class="panel projcard" data-gotab="project">
      <span class="eyebrow">이사·출산 준비</span>
      <span class="pc-row"><span>총 지출 예정 <b class="num">${krShort(total)}</b></span><span>${need >= 0 ? '대출 필요' : '여유'} <b class="num">${krShort(Math.abs(need))}</b></span>${card ? `<span>카드 출금 예정 <b class="num">${krShort(card)}</b></span>` : ''}</span>
      <i aria-hidden="true">›</i></button>`;
  })() : '';

  el.innerHTML = `
    ${monthNav()}
    ${UI.emptyServer && legacyData() ? `<div class="panel suggest"><h2>이 폰에 있던 예산 데이터를 맥북으로 옮길까요?</h2>
      <p class="hint">맥북 서버가 비어 있어요. 지금까지 쓰던 지출·자금·할 일 ${legacyData().items.length + (legacyData().funds || []).length + (legacyData().todos || []).length}건을 올려요.</p>
      <div class="row-actions"><button type="button" class="btn primary" id="legacy-up">옮기기</button></div></div>` : ''}
    <div class="panel hero">
      <span class="eyebrow">${+m.slice(5)}월에 쓴 돈</span>
      <b class="big num">${won(out)}</b>
      ${budget ? `<div class="bar big${left < 0 ? ' over' : ''}"><span style="width:${pct}%"></span>${isCur ? `<i class="pace" style="left:${Math.min(100, day / dim * 100)}%" title="오늘"></i>` : ''}</div>
      <div class="hero-row"><span>예산 ${krShort(budget)}의 <b>${Math.round(out / budget * 100)}%</b></span><span>${left >= 0 ? '남은 예산' : '초과'} <b class="num ${left < 0 ? 'warn' : ''}">${won(Math.abs(left))}</b></span></div>` : ''}
      <p class="hero-msg">${msg}</p>
      <div class="hero-sub"><span>들어온 돈 <b class="num inc">${won(inc)}</b></span><span>들어온 돈 − 쓴 돈 <b class="num ${inc - out < 0 ? 'warn' : ''}">${inc - out < 0 ? '−' : ''}${won(Math.abs(inc - out))}</b></span></div>
    </div>
    <div class="grid2">
      <div class="stack">
        <div class="panel">
          <h2>분류별 예산 <small>누르면 내역을 보여 줘요</small></h2>
          ${catRows.length ? `<ul class="catbud">${catRows.map(c => {
            const over = c.budget && c.used > c.budget, p = c.budget ? Math.min(100, c.used / c.budget * 100) : (c.used ? 100 : 0);
            return `<li><button type="button" data-catgo="${esc(c.id)}">
              <span class="cb-n">${esc(c.name)}</span>
              <span class="cb-a num">${won(c.used)}${c.budget ? ` <small>/ ${man(c.budget)}</small>` : ''}</span>
              <span class="bar${over ? ' over' : ''}${c.budget ? '' : ' nobud'}"><span style="width:${p}%"></span></span>
              <small class="cb-m num">${!c.budget ? '예산 없음' : over ? `<b class="warn">${won(c.used - c.budget)} 초과</b>` : `${won(c.budget - c.used)} 남음`}</small>
            </button></li>`; }).join('')}</ul>` : '<div class="empty">설정(오른쪽 위 톱니)에서 분류와 예산을 만들어 주세요.</div>'}
        </div>
        ${out ? `<div class="panel">
          <h2>결제수단별 <small>${esc(billLabel(addMonth(m, 1)))}에 빠질 카드값</small></h2>
          <div class="bar stacked paybar">${['gj', 'eh', 'cash'].map(k => byPay[k] ? `<span class="seg-${k === 'cash' ? 'etc' : k}" style="width:${byPay[k] / out * 100}%"></span>` : '').join('')}</div>
          <ul class="paylist">${['gj', 'eh', 'cash'].map(k => `<li><button type="button" data-paygo="${k}"><span><i class="cdot c-${k === 'cash' ? 'etc' : k}"></i>${PAY[k]}</span><b class="num">${won(byPay[k])}</b></button></li>`).join('')}</ul>
        </div>` : ''}
      </div>
      <div class="stack">
        <div class="panel">
          <h2>최근 내역 <small>${tx.length}건</small></h2>
          ${tx.length ? `<div class="txlist flat">${[...tx].sort(byNewest).slice(0, 5).map(txRow).join('')}</div>
            <div class="row-actions"><button type="button" class="btn small ghost" data-gotab="ledger">전체 보기 ›</button></div>`
            : `<div class="empty">아직 ${+m.slice(5)}월 내역이 없어요. 아래 <b>+</b> 버튼으로 적어 보세요.</div>`}
        </div>
        ${upcoming.length ? `<div class="panel"><h2>이번 달 남은 고정 내역 <small>날짜가 되면 자동으로 기록돼요</small></h2>
          <ul class="uplist">${upcoming.map(r => `<li><span><b>${Math.min(r.day || 1, dim)}일</b> ${esc(r.name)}</span><span class="num ${r.type === 'in' ? 'inc' : ''}">${r.type === 'in' ? '+' : ''}${won(r.amount)}</span></li>`).join('')}</ul></div>` : ''}
        ${todoPanelHtml()}
        ${proj}
      </div>
    </div>`;
}
$('#v-home').addEventListener('click', e => {
  if (e.target.closest('#legacy-up')) return uploadLegacy();
  if (e.target.closest('[data-todomore]')){ UI.todoMore = !UI.todoMore; return renderHome(); }
  const c = e.target.closest('[data-catgo]'), p = e.target.closest('[data-paygo]');
  if (c || p){
    UI.lf = {type: 'out', cat: c ? (c.dataset.catgo || 'none') : 'all', pay: p ? p.dataset.paygo : 'all', q: '', day: ''};
    $('#l-q').value = '';
    renderLedger(); showTab('ledger'); window.scrollTo(0, 0);
  }
});
// 할 일 체크: 줄이 그어진 걸 잠깐 보여 준 뒤 완료로 저장
$('#v-home').addEventListener('change', e => {
  const c = e.target.closest('[data-sumdone]');
  if (!c) return;
  c.closest('li').classList.toggle('done', c.checked);
  if (!c.checked) return clearTimeout(c._t);
  c._t = setTimeout(() => { write('todos', c.dataset.sumdone, {done: true}, 'update'); toast('완료했어요'); }, reduceMotionNow() ? 0 : 600);
});

/* ---------- 내역: 달력 + 날짜별 목록 ---------- */
function renderLedger(){
  if (!loaded.has('tx')){ $('#tx-list').innerHTML = '<div class="panel empty">데이터를 불러오는 중이에요…</div>'; return; }
  const f = UI.lf, m = UI.month, all = txOf(m);
  $('#l-month').innerHTML = monthNav();
  const chip = (group, k, label) => `<button type="button" class="chip" data-lf="${group}:${esc(k)}" aria-pressed="${f[group] === k}">${esc(label)}</button>`;
  $('#l-type').innerHTML = chip('type', 'all', '전체') + chip('type', 'out', '지출') + chip('type', 'in', '수입')
    + '<span class="chip-sep"></span>' + chip('pay', 'all', '모든 결제') + Object.entries(PAY).map(([k, v]) => chip('pay', k, v)).join('');
  $('#l-cat').innerHTML = chip('cat', 'all', '모든 분류') + cats().map(c => chip('cat', c.id, c.name)).join('') + chip('cat', 'none', '미분류');

  // 달력: 날짜마다 쓴 돈
  const [y, mm] = m.split('-').map(Number), first = new Date(y, mm - 1, 1).getDay(), dim = daysIn(m), today = todayStr();
  const dayOut = {}, dayIn = {};
  all.forEach(t => { const d = Number(String(t.date).slice(8)); (t.type === 'in' ? dayIn : dayOut)[d] = ((t.type === 'in' ? dayIn : dayOut)[d] || 0) + (t.amount || 0); });
  $('#tx-cal').innerHTML = `<div class="cal-h">${['일', '월', '화', '수', '목', '금', '토'].map(d => `<span>${d}</span>`).join('')}</div>
    <div class="cal-g">${'<span></span>'.repeat(first)}${Array.from({length: dim}, (_, k) => {
      const d = k + 1, ds = `${m}-${pad2(d)}`;
      return `<button type="button" class="cal-d${ds === today ? ' today' : ''}" data-day="${ds}" aria-pressed="${f.day === ds}" aria-label="${d}일${dayOut[d] ? ' 지출 ' + won(dayOut[d]) : ''}">
        <b>${d}</b>${dayOut[d] ? `<small class="num">${man(dayOut[d])}</small>` : ''}${dayIn[d] ? `<small class="num inc">+${man(dayIn[d])}</small>` : ''}</button>`;
    }).join('')}</div>`;

  const q = f.q.toLowerCase();
  const rows = all.filter(t =>
    (f.type === 'all' || (f.type === 'in') === (t.type === 'in')) &&
    (f.pay === 'all' || (t.type !== 'in' && (PAY[t.pay] ? t.pay : 'cash') === f.pay)) &&
    (f.cat === 'all' || (t.type !== 'in' && (f.cat === 'none' ? !catName(t.cat) : t.cat === f.cat))) &&
    (!f.day || t.date === f.day) &&
    (!q || [txCat(t), t.memo, PAY[t.pay]].join(' ').toLowerCase().includes(q))).sort(byNewest);
  const el = $('#tx-list');
  const filtered = f.type !== 'all' || f.pay !== 'all' || f.cat !== 'all' || f.day || q;
  if (!rows.length){
    el.innerHTML = `<div class="panel empty">${all.length ? '조건에 맞는 내역이 없어요.' : `${monthLabel(m)} 내역이 아직 없어요. 아래 <b>+</b> 버튼으로 적어 보세요.`}
      ${filtered ? '<div class="row-actions"><button type="button" class="btn small" data-lfclear>조건 지우기</button></div>' : ''}</div>`;
    return;
  }
  const days = [];
  rows.forEach(t => { let g = days[days.length - 1]; if (!g || g.date !== t.date) days.push(g = {date: t.date, rows: []}); g.rows.push(t); });
  const wd = ['일', '월', '화', '수', '목', '금', '토'];
  el.innerHTML = `<div class="hint lsum">${rows.length}건 · 쓴 돈 <b class="num">${won(sum(outs(rows)))}</b>${ins(rows).length ? ` · 들어온 돈 <b class="num inc">${won(sum(ins(rows)))}</b>` : ''}
      ${filtered ? '<button type="button" class="btn small ghost" data-lfclear>조건 지우기</button>' : ''}</div>`
    + days.map(g => { const [gy, gm, gd] = g.date.split('-').map(Number), o = sum(outs(g.rows)), i = sum(ins(g.rows));
      return `<div class="sec"><div class="sec-h dayh"><span>${gm}월 ${gd}일 (${wd[new Date(gy, gm - 1, gd).getDay()]})${g.date === today ? ' · 오늘' : ''}</span>
        <span class="num">${i ? `<span class="inc">+${won(i)}</span> ` : ''}${o ? won(o) : ''}</span></div>
        <div class="list txlist">${g.rows.map(txRow).join('')}</div></div>`; }).join('');
}
$('#v-ledger').addEventListener('click', e => {
  const c = e.target.closest('[data-lf]');
  if (c){ const [g, k] = c.dataset.lf.split(':'); UI.lf[g] = k; return renderLedger(); }
  const d = e.target.closest('[data-day]');
  if (d){ UI.lf.day = UI.lf.day === d.dataset.day ? '' : d.dataset.day; return renderLedger(); }
  if (e.target.closest('[data-lfclear]')){ UI.lf = {type: 'all', cat: 'all', pay: 'all', q: '', day: ''}; $('#l-q').value = ''; return renderLedger(); }
  if (e.target.closest('#cal-toggle')){
    const on = $('#tx-cal').hidden; $('#tx-cal').hidden = !on;
    e.target.closest('#cal-toggle').setAttribute('aria-pressed', String(on)); store.set('hb-cal', on ? '1' : '0');
  }
});
$('#l-q').addEventListener('input', e => { UI.lf.q = e.target.value.trim(); renderLedger(); });

/* ---------- 내역 적기 창 ---------- */
const txDlg = $('#tx-dlg');
const PAY_PREF = 'hb-pay';
function fillTxCats(type, current){
  const list = type === 'in' ? INCOME_CATS.map(n => [n, n]) : cats().map(c => [c.id, c.name]);
  $('#t-cats').innerHTML = list.map(([id, n]) => `<button type="button" class="chip" data-tcat="${esc(id)}" aria-pressed="${id === current}">${esc(n)}</button>`).join('')
    || '<span class="hint">설정에서 분류를 만들면 여기서 고를 수 있어요.</span>';
  $('#t-pay-wrap').hidden = type === 'in';
}
const txType = () => txDlg.querySelector('input[name=tt]:checked')?.value || 'out';
function openTx(id){
  const t = id ? S.tx.find(x => x.id === id) : null;
  UI.txEdit = id || null;
  $('#tx-title').textContent = t ? '내역 고치기' : '내역 적기';
  txDlg.querySelector(`input[name=tt][value="${t?.type === 'in' ? 'in' : 'out'}"]`).checked = true;
  $('#t-amount').value = t?.amount || ''; formatMoney($('#t-amount'));
  $('#t-date').value = t?.date || UI.lf.day || (UI.month === curMonth() ? todayStr() : UI.month + '-01');
  const pay = t ? (PAY[t.pay] ? t.pay : 'cash') : (store.get(PAY_PREF) || me() || 'cash');
  (txDlg.querySelector(`input[name=tp][value="${pay}"]`) || txDlg.querySelector('input[name=tp][value=cash]')).checked = true;
  $('#t-memo').value = t?.memo || '';
  fillTxCats(txType(), t?.cat || '');
  $('#t-del').hidden = !t; $('#t-del').classList.remove('armed'); $('#t-del').textContent = '삭제';
  $('#t-rule-note').hidden = !t?.rule;
  syncDateChips();
  openSheet(txDlg, t ? null : $('#t-amount'));
}
function syncDateChips(){
  const v = $('#t-date').value, today = todayStr();
  const d = new Date(); d.setDate(d.getDate() - 1);
  const yest = d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  txDlg.querySelector('[data-tdate=today]').setAttribute('aria-pressed', String(v === today));
  txDlg.querySelector('[data-tdate=yest]').setAttribute('aria-pressed', String(v === yest));
  txDlg.querySelector('[data-tdate=yest]').dataset.v = yest;
}
txDlg.addEventListener('change', e => {
  if (e.target.name === 'tt') fillTxCats(txType(), '');
  if (e.target.id === 't-date') syncDateChips();
});
txDlg.addEventListener('click', e => {
  const c = e.target.closest('[data-tcat]');
  if (c){ const was = c.getAttribute('aria-pressed') === 'true';
    $('#t-cats').querySelectorAll('[data-tcat]').forEach(x => x.setAttribute('aria-pressed', 'false'));
    c.setAttribute('aria-pressed', String(!was)); return; }
  const d = e.target.closest('[data-tdate]');
  if (d){ $('#t-date').value = d.dataset.tdate === 'today' ? todayStr() : d.dataset.v; syncDateChips(); }
});
$('#tx-form').addEventListener('submit', e => {
  e.preventDefault();
  const amount = toNum($('#t-amount').value), type = txType(), date = $('#t-date').value || todayStr();
  if (amount <= 0){ toast('금액을 적어 주세요'); $('#t-amount').focus(); return; }
  const prev = UI.txEdit ? S.tx.find(x => x.id === UI.txEdit) : null;
  const pay = txDlg.querySelector('input[name=tp]:checked')?.value || 'cash';
  const data = {date, type, amount, cat: $('#t-cats').querySelector('[aria-pressed=true]')?.dataset.tcat || '',
    memo: $('#t-memo').value.trim(), pay: type === 'in' ? '' : pay, by: prev?.by || me(), at: prev?.at || Date.now()};
  if (prev?.rule) data.rule = prev.rule;
  if (type !== 'in') store.set(PAY_PREF, pay);
  const id = UI.txEdit || newId('x');
  markFlash(id, 'row');
  txDlg.close();
  if (!date.startsWith(UI.month)) UI.month = date.slice(0, 7);
  UI.lf.day = '';
  write('tx', id, data);
  toast(prev ? '고쳤어요' : `${type === 'in' ? '수입' : '지출'} ${won(amount)} 적었어요`);
});
$('#t-del').addEventListener('click', e => {
  const b = e.currentTarget;
  if (!b.classList.contains('armed')){ b.classList.add('armed'); b.textContent = '정말 삭제'; return; }
  const id = UI.txEdit; txDlg.close(); write('tx', id, null, 'delete'); toast('삭제했어요');
});

/* ---------- 고정 내역: 날짜가 되면 자동으로 적는다 ----------
   rules 문서: {name, type, amount, cat, pay, day, start:'YYYY-MM', active}
   만들 내역의 id가 '규칙+달'로 정해져 있어서 두 폰이 동시에 만들어도 한 건만 생기고,
   지운 달은 다시 만들지 않는다. */
function runRules(){
  if (!net.synced) return;
  const today = todayStr(), cur = curMonth();
  for (const r of S.rules){
    if (r.active === false || !(r.amount > 0)) continue;
    let m = r.start && r.start > addMonth(cur, -2) ? r.start : addMonth(cur, -2);
    for (; m <= cur; m = addMonth(m, 1)){
      const date = `${m}-${pad2(Math.min(r.day || 1, daysIn(m)))}`;
      if (date > today) continue;
      createIfAbsent('tx', `r_${r.id}_${m.replace('-', '')}`, {date, type: r.type === 'in' ? 'in' : 'out', amount: r.amount,
        cat: r.cat || '', memo: r.name || '', pay: r.type === 'in' ? '' : (r.pay || 'cash'), rule: r.id, at: Date.now()});
    }
  }
}
