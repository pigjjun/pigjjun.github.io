/* ---------- 현황 ---------- */
function renderSummary(){
  const el = $('#v-summary');
  if (!loaded.has('items') || !loaded.has('funds')){
    el.innerHTML = `<div class="panel empty">${renderSummary.failed ? '저장소에 연결하지 못했어요. 페이지를 다시 열어 주세요.' : '데이터를 불러오는 중이에요…'}</div>`;
    return;
  }
  const items = S.items, move = items.filter(i => i.group === 'move'), baby = items.filter(i => i.group === 'baby');
  const total = sum(items), fundTotal = sum(assetFunds()), need = total - fundTotal;
  const loanTotal = sum(loanFunds()), gap = need - loanTotal;

  // 카드 출금 대기 (월별)
  const card = items.filter(i => i.status === 'card').sort(byOrder);
  const months = [...new Set(card.map(i => billKey(i.billMonth)))].sort((a, b) => billRank(a).localeCompare(billRank(b)));
  const billBlocks = months.map(m => {
    const rows = card.filter(i => billKey(i.billMonth) === m);
    // 카드(통장)별로: 그 통장에 넣어야 할 돈과, 그 돈을 어느 자금에서 가져올지
    const byCard = {};
    rows.forEach(i => {
      const k = CARDS[i.cardBy] ? i.cardBy : '';
      const d = byCard[k] || (byCard[k] = {total: 0, src: {}});
      d.total += i.amount || 0;
      parseSources(i).forEach(p => { d.src[p.fund] = (d.src[p.fund] || 0) + p.amount; });
      const r = unassignedOf(i); if (r) d.src[''] = (d.src[''] || 0) + r;
    });
    const deposit = ['gj', 'eh', ''].filter(k => byCard[k]).map(k => {
      const d = byCard[k];
      const src = Object.entries(d.src).sort((a, b) => (a[0] === '') - (b[0] === '') || b[1] - a[1])
        .map(([f, v]) => f ? `${esc(fundName(f) || '삭제된 자금')}에서 ${won(v)}` : `<span class="warn">출처 미정 ${won(v)}</span>`).join(' · ');
      return `<div class="dep${k ? '' : ' unset'}">
        <div class="dep-top"><span class="cardtag c-${k || 'none'}">${k ? cardName(k) + ' 통장' : '카드 미지정'}</span><b class="num">${won(d.total)}</b></div>
        <div class="dep-src">${src}</div>
      </div>`;
    }).join('');
    return `<div class="panel" id="j-bill-${months.indexOf(m)}">
      <h2>${esc(billLabel(m) || '출금월 미정')} 카드 출금 예정 <small>${rows.length}건</small></h2>
      <div class="bill-total num">${won(sum(rows))}</div>
      <div class="hint">카드로 이미 결제한 금액이에요. 통장마다 이만큼 넣어 두면 돼요.</div>
      <div class="deposits">${deposit}</div>
      <ul class="bill-list">${rows.map(i => `
        <li><span class="nm">${esc(i.name)}</span>
          <span class="amt num">${won(i.amount)}</span>
          <span class="sels">${cardSelect(i)}${sourceSelect(i)}</span></li>`).join('')}</ul>
      <div class="row-actions">
        <button type="button" class="btn" data-settle="${esc(m)}">출금 끝남 → 모두 정산 완료로</button>
      </div>
    </div>`;
  }).join('');

  // 자금별 계획
  let anyCard = false;
  const fundRows = [...S.funds].sort(byOrder).map(f => {
    const by = {gj: 0, eh: 0, etc: 0};
    items.filter(i => i.status !== 'gift').forEach(i => {
      const amt = sum(parseSources(i).filter(p => p.fund === f.id));
      if (amt) by[CARDS[i.cardBy] ? i.cardBy : 'etc'] += amt;
    });
    const used = by.gj + by.eh + by.etc;
    const den = f.amount ? Math.max(f.amount, used) : (used || 1);
    const left = (f.amount || 0) - used;
    const loanNoAmt = isLoan(f) && !f.amount;
    const seg = k => by[k] ? `<span class="seg-${k}" style="width:${by[k] / den * 100}%"></span>` : '';
    const cardTxt = ['gj', 'eh'].filter(k => by[k]).map(k => `<span class="cdot c-${k}"></span>${cardName(k)} ${won(by[k])}`).join(' · ');
    if (by.gj || by.eh) anyCard = true;
    return `<li class="${f.excluded ? 'excl' : ''}${isLoan(f) ? ' loanf' : ''}">
      <div class="top"><b>${esc(f.name)}${f.excluded ? ' · 예산 제외' : ''}${isLoan(f) && !/대출/.test(f.name) ? ' · 대출' : ''}</b><span class="num">${loanNoAmt ? '금액 미정' : won(f.amount)}</span></div>
      <div class="bar stacked${left < 0 && !loanNoAmt ? ' over' : ''}">${seg('gj')}${seg('eh')}${seg('etc')}</div>
      <div class="meta num">쓸 곳 정함 ${won(used)} · ${loanNoAmt ? '대출 받을 금액을 자금 탭에서 입력하세요' : left < 0 ? '<b style="color:var(--danger)">' + won(-left) + ' 부족</b>' : '남음 ' + won(left)}</div>
      ${cardTxt ? `<div class="meta num cardsplit">${cardTxt}</div>` : ''}
    </li>`;
  }).join('');
  const unassigned = items.filter(i => unassignedOf(i) > 0);
  const unassignedSum = sum(unassigned, unassignedOf);

  // 상태별
  const cnt = st => { const r = items.filter(i => i.status === st); return {n: r.length, amt: sum(r), gift: sum(r, x => x.gift)}; };
  const c = {plan: cnt('plan'), card: cnt('card'), settled: cnt('settled'), gift: cnt('gift')};

  const jumps = [['j-top', '요약'], ['j-funds', '자금 계획'], ['j-progress', '진행 상황'],
    ...months.map((m, k) => ['j-bill-' + k, (billLabel(m) || '미정') + ' 카드'])];
  el.innerHTML = `
    <nav class="jumpbar" aria-label="현황 바로가기">${jumpChips(jumps)}</nav>
    <div id="j-top">
      <div class="kpis">
        <div class="kpi"><span class="eyebrow">총 지출 예정</span><b class="num" title="${won(total)}">${kr(total)}</b><span class="sub num">${won(total)}</span></div>
        <div class="kpi"><span class="eyebrow">마련된 자금<small>대출 제외</small></span><b class="num" title="${won(fundTotal)}">${kr(fundTotal)}</b><span class="sub num">${won(fundTotal)}</span></div>
        <div class="kpi loan"><span class="eyebrow">${need >= 0 ? '대출 필요' : '여유 자금'}</span><b class="num">${kr(Math.abs(need))}</b><span class="sub num">${!loanTotal ? won(Math.abs(need)) : gap > 0 ? `대출 ${krShort(loanTotal)} 예정 · ${krShort(gap)} 더 필요` : `대출 ${krShort(loanTotal)} 예정`}</span></div>
      </div>
    </div>
    <div class="grid2">
      <div class="stack">
        <div class="panel" id="j-funds">
          <h2>자금별 사용 계획 <small>지출에 출처를 정하면 여기서 빠져요</small></h2>
          ${anyCard ? `<div class="cardlegend"><span><i class="c-gj"></i>${cardName('gj')}</span><span><i class="c-eh"></i>${cardName('eh')}</span><span><i class="c-etc"></i>그 외</span></div>` : ''}
          <ul class="funds">${fundRows}</ul>
          ${unassigned.length ? `<button type="button" class="linkrow" data-goto="nosrc">출처 아직 안 정한 지출 <b class="num">${unassigned.length}건 · ${won(unassignedSum)}</b><i aria-hidden="true">›</i></button>` : '<div class="hint" style="margin-top:12px">모든 지출의 출처를 정했어요.</div>'}
        </div>
      </div>
      <div class="stack">
        <div class="panel" id="j-progress">
          <h2>진행 상황</h2>
          <div class="counts">
            <button type="button" data-goto="plan"><span class="pill s-plan">구매 예정</span><b class="num">${c.plan.n}건</b><span class="hint num">${won(c.plan.amt)}</span><i aria-hidden="true">›</i></button>
            <button type="button" data-goto="card"><span class="pill s-card">카드결제</span><b class="num">${c.card.n}건</b><span class="hint num">${won(c.card.amt)}</span><i aria-hidden="true">›</i></button>
            <button type="button" data-goto="settled"><span class="pill s-settled">정산 완료</span><b class="num">${c.settled.n}건</b><span class="hint num">${won(c.settled.amt)}</span><i aria-hidden="true">›</i></button>
            <button type="button" data-goto="gift"><span class="pill s-gift">선물 받음</span><b class="num">${c.gift.n}건</b><span class="hint num">가액 ${won(c.gift.gift)}</span><i aria-hidden="true">›</i></button>
          </div>
        </div>
      </div>
    </div>
    ${billBlocks ? `<div class="grid2 bills">${billBlocks}</div>` : ''}`;

  el.querySelectorAll('[data-goto]').forEach(b => b.addEventListener('click', () => {
    UI.status = b.dataset.goto; UI.group = 'all'; UI.q = ''; $('#f-q').value = '';
    renderFilters(); renderItems(); showProject('items'); window.scrollTo(0, 0);
  }));
  el.querySelectorAll('select[data-src]').forEach(s => s.addEventListener('change', async () => {
    const v = await pickFund(s.value);
    if (await write('items', s.dataset.src, {source: v}, 'update')) toast('출처를 바꿨어요');
  }));
  el.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => openEditor(b.dataset.edit)));
  el.querySelectorAll('select[data-cardsel]').forEach(s => s.addEventListener('change', () => setCard(s.dataset.cardsel, s.value)));
  el.querySelectorAll('[data-settle]').forEach(b => b.addEventListener('click', async () => {
    if (!b.classList.contains('armed')){
      b.classList.add('armed', 'btn', 'danger'); b.textContent = '한 번 더 누르면 정산 완료로 바꿔요';
      setTimeout(() => { if (b.isConnected){ b.classList.remove('armed', 'danger'); b.textContent = '출금 끝남 → 모두 정산 완료로'; } }, 4000);
      return;
    }
    b.disabled = true;
    const m = b.dataset.settle;
    const rows = S.items.filter(i => i.status === 'card' && billKey(i.billMonth) === m);
    if (await writeMany('items', rows.map(i => ({id: i.id, data: {status: 'settled'}})))) toast(`${rows.length}건을 정산 완료로 바꿨어요`);
  }));
}
function cardSelect(i){
  const k = CARDS[i.cardBy] ? i.cardBy : '';
  return `<select data-cardsel="${esc(i.id)}" class="${k ? 'c-sel-' + k : 'unset'}" aria-label="${esc(i.name)} 결제 카드"><option value="">카드 미지정</option>${Object.keys(CARDS).map(c => `<option value="${c}"${c === k ? ' selected' : ''}>${cardName(c)}</option>`).join('')}</select>`;
}
function fundOptions(selected){
  const opts = [...S.funds].sort(byOrder).map(f => `<option value="${esc(f.id)}"${f.id === selected ? ' selected' : ''}>${esc(f.name)}</option>`).join('');
  return opts + (S.funds.some(isLoan) ? '' : '<option value="__newloan">대출 (새로 추가)</option>');
}
// 대출 자금이 없으면 '대출'을 만들고 그 id를 돌려준다
async function pickFund(v){
  if (v !== '__newloan') return v;
  if (!S.funds.some(f => f.id === 'loan')) write('funds', 'loan', {name: '대출', amount: 0, excluded: false, order: 99}); // 화면엔 바로 생김
  return 'loan';
}
// 출처 한 곳(또는 미정)이면 고르는 칸, 여러 곳이면 눌러서 편집
function sourceSelect(i){
  const parts = parseSources(i);
  if (parts.length > 1 || (parts.length === 1 && unassignedOf(i))) return `<button type="button" class="srcbtn" data-edit="${esc(i.id)}">${sourceText(i)}</button>`;
  const cur = parts[0]?.fund || '';
  return `<select data-src="${esc(i.id)}" class="${cur ? '' : 'unset'}" aria-label="${esc(i.name)} 출처"><option value="">출처 미정</option>${fundOptions(cur)}</select>`;
}

/* ---------- 지출 ---------- */
function renderFilters(){
  const g = [['all','전체'],['move','이사'],['baby','육아']];
  $('#f-group').innerHTML = g.map(([k, l]) => `<button type="button" class="chip" data-g="${k}" aria-pressed="${UI.group === k}">${l}</button>`).join('');
  const st = [['all','모든 상태'], ...Object.entries(STATUS).map(([k, v]) => [k, v.label]), ['nosrc','출처 미정']];
  $('#f-status').innerHTML = st.map(([k, l]) => `<button type="button" class="chip" data-s="${k}" aria-pressed="${UI.status === k}">${l}</button>`).join('');
}
$('#f-group').addEventListener('click', e => { const b = e.target.closest('[data-g]'); if (b){ UI.group = b.dataset.g; renderFilters(); renderItems(); } });
$('#f-status').addEventListener('click', e => { const b = e.target.closest('[data-s]'); if (b){ UI.status = b.dataset.s; renderFilters(); renderItems(); } });
$('#f-q').addEventListener('input', e => { UI.q = e.target.value.trim(); renderItems(); });

function renderItems(){
  const el = $('#items-list');
  if (!loaded.has('items')){ el.innerHTML = '<div class="panel empty">데이터를 불러오는 중이에요…</div>'; return; }
  const q = UI.q.toLowerCase();
  const rows = S.items.filter(i =>
    (UI.group === 'all' || i.group === UI.group) &&
    (UI.status === 'all' || (UI.status === 'nosrc' ? unassignedOf(i) > 0 : i.status === UI.status)) &&
    (!q || [i.name, i.note, i.section, i.when].join(' ').toLowerCase().includes(q))
  ).sort(byOrder);
  if (!rows.length){
    el.innerHTML = `<div class="panel empty">${S.items.length ? '조건에 맞는 지출이 없어요.' : '아직 지출이 없어요. 아래 “+ 지출 추가”로 첫 항목을 넣어 보세요.'}</div>`;
    return;
  }
  const secs = [];
  for (const i of rows){
    const key = i.group + '|' + (i.section || '기타');
    let s = secs.find(x => x.key === key);
    if (!s) secs.push(s = {key, group: i.group, name: i.section || '기타', rows: []});
    s.rows.push(i);
  }
  secs.sort((a, b) => (a.group === 'move' ? 0 : 1) - (b.group === 'move' ? 0 : 1));
  el.innerHTML = `<nav class="jumpbar" aria-label="분류 바로가기">${jumpChips(secs.map((s, k) => ['j-sec-' + k, `<i class="gdot g-${s.group}"></i>${esc(s.name)}`]))}</nav>
    <div class="hint" style="padding:0 4px">${rows.length}건 · 합계 <b class="num">${won(sum(rows))}</b></div>` +
    secs.map((s, k) => `<div class="sec" id="j-sec-${k}">
      <div class="sec-h"><span><span class="g-${s.group}">${GROUP[s.group] || ''}</span> · ${esc(s.name)}</span><span class="num">${won(sum(s.rows))}</span></div>
      <div class="list">${s.rows.map(itemRow).join('')}</div></div>`).join('');
}
function itemRow(i){
  const st = STATUS[i.status] || STATUS.plan;
  const pill = i.status === 'card' ? `카드 · ${esc(billLabel(billKey(i.billMonth)) || '출금월?')} 출금` : st.label;
  const meta = [];
  if (i.when) meta.push(esc(i.when));
  if (i.status === 'gift' && i.gift) meta.push('가액 ' + won(i.gift));
  if (i.note && !/^https?:/.test(i.note)) meta.push(esc(i.note.length > 40 ? i.note.slice(0, 40) + '…' : i.note));
  const stKey = i.status in STATUS ? i.status : 'plan';
  return `<div class="item${UI.flash?.id === i.id && Date.now() - UI.flash.at < 900 ? ' flashrow' : ''}" data-id="${esc(i.id)}">
    <button type="button" class="item-main" data-open="${esc(i.id)}">
      <span class="nm">${esc(i.name)}</span>
      <span class="amt num ${i.amount ? '' : 'zero'}">${i.amount ? won(i.amount) : (i.status === 'gift' ? '0원' : '금액 미정')}</span>
      ${meta.length ? `<span class="meta">${meta.join(' · ')}</span>` : ''}
    </button>
    <div class="qrow">
      <button type="button" class="qchip pill s-${stKey}${flashOf(i.id, 'qs')}" data-qs="${esc(i.id)}" aria-haspopup="menu">${pill}<i aria-hidden="true">▾</i></button>
      ${i.status === 'gift' ? '' : srcChip(i)}
      ${i.status === 'card' || i.status === 'settled' || CARDS[i.cardBy] ? `<button type="button" class="qchip cardchip c-${CARDS[i.cardBy] ? i.cardBy : (i.status === 'settled' ? 'muted' : 'none')}${flashOf(i.id, 'qc')}" data-qc="${esc(i.id)}" aria-haspopup="menu">${CARDS[i.cardBy] ? cardName(i.cardBy) : '카드 미지정'}<i aria-hidden="true">▾</i></button>` : ''}
    </div>
  </div>`;
}
function srcChip(i){
  const parts = parseSources(i), rem = unassignedOf(i);
  let label, cls = '';
  if (!parts.length){ label = '출처 미정'; cls = 'unset'; }
  else {
    label = parts.map(p => esc(fundName(p.fund) || '삭제된 자금') + (parts.length > 1 || rem ? ' ' + kr(p.amount) : '')).join(' + ');
    if (rem){ label += ` · 미정 ${kr(rem)}`; cls = 'unset'; }
  }
  return `<button type="button" class="qchip src ${cls}${flashOf(i.id, 'qf')}" data-qf="${esc(i.id)}" aria-haspopup="menu"><span>← ${label}</span><i aria-hidden="true">▾</i></button>`;
}
$('#items-list').addEventListener('click', e => {
  if (Date.now() - sheetClosedAt < 400) return; // 편집 창을 닫은 그 터치가 목록까지 눌리는 것 방지
  const open = e.target.closest('[data-open]');
  if (open) return openEditor(open.dataset.open);
  const qs = e.target.closest('[data-qs]');
  if (qs) return statusMenu(qs);
  const qf = e.target.closest('[data-qf]');
  if (qf) return sourceMenu(qf);
  const qc = e.target.closest('[data-qc]');
  if (qc) return cardMenu(qc);
});

/* ---------- 편집 시트 ---------- */
const dlg = $('#dlg');
/* 분류·구매 시기: 휴대폰 기본 고르기 창(아이폰 휠, 안드로이드 목록)으로 고르고,
   맨 아래 '직접 입력…'을 고르면 입력칸이 열린다. (datalist는 아이폰에서 목록이 안 떠서 바꿈) */
const COMBO_NEW = '__new';
function setCombo(sel, inp, values, current, emptyLabel){
  const list = [...new Set(values.filter(Boolean))];
  if (current && !list.includes(current)) list.unshift(current);
  sel.innerHTML = `<option value="">${emptyLabel}</option>`
    + list.map(v => `<option value="${esc(v)}">${esc(v)}</option>`).join('')
    + `<option value="${COMBO_NEW}">직접 입력…</option>`;
  sel.value = current || '';
  inp.value = ''; inp.hidden = true;
}
const comboValue = (sel, inp) => sel.value === COMBO_NEW ? inp.value.trim() : sel.value;
function bindCombo(sel, inp){
  sel.addEventListener('change', () => {
    const isNew = sel.value === COMBO_NEW;
    inp.hidden = !isNew;
    if (isNew) setTimeout(() => inp.focus(), 50);
  });
}
bindCombo($('#e-section-sel'), $('#e-section'));
bindCombo($('#e-when-sel'), $('#e-when'));
// 분류는 고른 구분(이사/육아)의 분류만 보여 준다
const sectionsOf = g => S.items.filter(i => i.group === g).sort(byOrder).map(i => i.section);
function fillSectionCombo(current){
  setCombo($('#e-section-sel'), $('#e-section'), sectionsOf($('#e-group').value), current, '분류 없음');
}
$('#e-group').addEventListener('change', () => {
  const cur = comboValue($('#e-section-sel'), $('#e-section'));
  fillSectionCombo(sectionsOf($('#e-group').value).includes(cur) ? cur : '');
});
function syncStatusFields(){
  const st = dlg.querySelector('input[name=st]:checked')?.value;
  $('#e-bill-wrap').hidden = st !== 'card';
  $('#e-card-wrap').hidden = st === 'gift';
  // 카드결제로 바꿨는데 카드가 비어 있으면 이 기기에서 마지막으로 쓴 카드를 미리 골라 둔다
  if (st === 'card' && !dlg.querySelector('input[name=cb]:checked')?.value && lastCard()){
    const r = dlg.querySelector(`input[name=cb][value="${lastCard()}"]`); if (r) r.checked = true;
  }
  $('#e-gift-wrap').hidden = st !== 'gift';
}
dlg.querySelectorAll('input[name=st]').forEach(r => r.addEventListener('change', () => {
  if (r.value === 'card' && !$('#e-bill').value) $('#e-bill').value = defaultBill();
  syncStatusFields();
}));
function openEditor(id){
  const i = id ? S.items.find(x => x.id === id) : null;
  UI.editing = id || null;
  $('#dlg-title').textContent = i ? '지출 편집' : '지출 추가';
  $('#e-name').value = i?.name || '';
  $('#e-group').value = i?.group || (UI.group === 'baby' ? 'baby' : UI.group === 'move' ? 'move' : 'baby');
  fillSectionCombo(i?.section || '');
  $('#e-amount').value = i?.amount || '';
  setCombo($('#e-when-sel'), $('#e-when'), [...S.items].sort(byOrder).map(x => x.when), i?.when || '', '정하지 않음');
  const bm = billMonths(), curBill = billKey(i?.billMonth);
  $('#e-bill').innerHTML = (curBill && !bm.includes(curBill) ? [curBill, ...bm].sort() : bm)
    .map(m => `<option value="${esc(m)}">${esc(billLabel(m))} 출금</option>`).join('');
  $('#e-bill').value = curBill || defaultBill();
  $('#e-gift').value = i?.gift || '';
  formatMoney($('#e-amount')); formatMoney($('#e-gift'));
  $('#e-note').value = i?.note || '';
  // 첫 줄은 '나머지'(금액 자동), 둘째 줄부터는 금액을 정한다
  const parts = i ? parseSources(i) : [];
  const rest = parts.find(p => p.rest);
  const rows = [{fund: rest ? rest.fund : ''}, ...parts.filter(p => !p.rest).map(p => ({fund: p.fund, amount: p.amount}))];
  renderSrcRows(rows);
  dlg.querySelector(`input[name=cb][value="${CARDS[i?.cardBy] ? i.cardBy : ''}"]`).checked = true;
  $('#e-card-warn').hidden = cardSupported();
  (dlg.querySelector(`input[name=st][value="${i?.status || 'plan'}"]`) || dlg.querySelector('input[name=st][value=plan]')).checked = true;
  syncStatusFields();
  const del = $('#e-del'); del.hidden = !i; del.classList.remove('armed'); del.textContent = '삭제';
  closePop();
  dlg.showModal();
  if (i) $('#dlg-title').focus({preventScroll: true}); // 기존 항목은 키보드가 올라오지 않게
  else $('#e-name').focus();
}
$('#e-cancel').addEventListener('click', () => dlg.close());
$('#item-form').addEventListener('submit', async e => {
  e.preventDefault();
  const name = $('#e-name').value.trim();
  if (!name){ $('#e-name').focus(); return; }
  const prev = UI.editing ? S.items.find(x => x.id === UI.editing) : null;
  const status = dlg.querySelector('input[name=st]:checked')?.value || 'plan';
  const data = {
    name, group: $('#e-group').value, section: comboValue($('#e-section-sel'), $('#e-section')),
    amount: toNum($('#e-amount').value), when: comboValue($('#e-when-sel'), $('#e-when')), status,
    source: await readSrcRows(), billMonth: status === 'card' ? ($('#e-bill').value || defaultBill()) : (prev?.billMonth || ''),
    gift: toNum($('#e-gift').value), note: $('#e-note').value.trim(),
    order: prev?.order ?? Date.now(),
    cardBy: status === 'gift' ? '' : (dlg.querySelector('input[name=cb]:checked')?.value || ''),
  };
  if (data.cardBy) rememberCard(data.cardBy);
  const srcRows = srcRowsNow();
  if (srcRows.slice(1).reduce((a, r) => a + (r.fund ? r.amount : 0), 0) > data.amount){ toast('나눈 금액 합이 지출 금액보다 커요'); return; }
  // 서버 응답(구글 2~4초)을 기다리지 않는다: write가 화면에 먼저 반영하므로 바로 닫고,
  // 실패하면 write 쪽에서 알려 주고 서버 상태로 되돌린다
  const id = UI.editing || newId('i');
  markFlash(id, 'row');
  dlg.close();
  toast(prev ? '저장했어요' : '추가했어요');
  write('items', id, data);
});
$('#e-del').addEventListener('click', async e => {
  const b = e.currentTarget;
  if (!b.classList.contains('armed')){ b.classList.add('armed'); b.textContent = '정말 삭제'; return; }
  const id = UI.editing;
  dlg.close(); toast('삭제했어요');
  write('items', id, null, 'delete');
});

function renderSrcRows(rows){
  const box = $('#e-sources');
  box.innerHTML = rows.map((r, k) => `<div class="srcrow">
      <select class="src-fund" aria-label="출처 ${k + 1}"><option value="">${k ? '고르세요' : '출처 미정'}</option>${fundOptions(r.fund)}</select>
      ${k ? `<input type="text" class="src-amt money" inputmode="numeric" pattern="[0-9,]*" autocomplete="off" placeholder="금액" aria-label="출처 ${k + 1} 금액" value="${r.amount ? Number(r.amount).toLocaleString('ko-KR') : ''}">
             <button type="button" class="x" data-rm="${k}" aria-label="이 출처 빼기">×</button>`
           : `<span class="src-rest num" id="e-src-rest"></span>`}
    </div>`).join('');
  updateSrcLeft();
}
function srcRowsNow(){
  return [...$('#e-sources').querySelectorAll('.srcrow')].map((el, k) => ({
    fund: el.querySelector('.src-fund').value, amount: k ? toNum(el.querySelector('.src-amt').value) : null,
  }));
}
function updateSrcLeft(){
  const rows = srcRowsNow(), total = toNum($('#e-amount').value);
  const fixed = rows.slice(1).reduce((a, r) => a + (r.fund ? r.amount : 0), 0);
  const rest = total - fixed;
  const restEl = $('#e-src-rest');
  if (restEl) restEl.textContent = rows.length > 1 ? (rest >= 0 ? '나머지 ' + won(rest) : '') : '전액';
  $('#e-src-left').innerHTML = rest < 0 ? `<span class="warn">나눈 금액이 ${won(-rest)} 많아요</span>`
    : rows.length > 1 && !rows[0].fund && rest > 0 ? `${won(rest)} 아직 미정` : '';
}
$('#e-sources').addEventListener('input', updateSrcLeft);
$('#e-sources').addEventListener('change', updateSrcLeft);
$('#e-amount').addEventListener('input', updateSrcLeft);
$('#e-sources').addEventListener('click', e => {
  const b = e.target.closest('[data-rm]');
  if (!b) return;
  const rows = srcRowsNow(); rows.splice(Number(b.dataset.rm), 1); renderSrcRows(rows);
});
$('#e-src-add').addEventListener('click', () => {
  const rows = srcRowsNow(); rows.push({fund: '', amount: 0}); renderSrcRows(rows);
  $('#e-sources').querySelectorAll('.src-fund')[rows.length - 1].focus();
});
// 화면의 출처 줄들을 저장용 문자열로: "나머지자금,자금:금액,..."
async function readSrcRows(){
  const rows = srcRowsNow();
  for (const r of rows) r.fund = await pickFund(r.fund);
  const fixed = rows.slice(1).filter(r => r.fund && r.amount > 0).map(r => r.fund + ':' + r.amount);
  return [rows[0].fund, ...fixed].filter(Boolean).join(',');
}

/* ---------- 자금 · 생활비 ---------- */
function renderFunds(){
  const el = $('#v-funds');
  if (!loaded.has('funds')){ el.innerHTML = '<div class="panel empty">데이터를 불러오는 중이에요…</div>'; return; }
  if (el.contains(document.activeElement) && document.activeElement.matches('input[type=text]')) return; // 입력 중엔 다시 그리지 않음
  const funds = [...S.funds].sort(byOrder);
  el.innerHTML = `
    <div class="panel">
      <h2>자금 <small>금액을 고치면 바로 저장돼요</small></h2>
      <table class="edit-table"><tbody>${funds.map(f => `<tr>
        <td><input type="text" data-col="funds" data-id="${esc(f.id)}" data-k="name" value="${esc(f.name)}" aria-label="자금 이름"></td>
        <td class="r"><input type="text" class="amt-in num money" inputmode="numeric" pattern="[0-9,]*" enterkeyhint="done" autocomplete="off" size="11" data-col="funds" data-id="${esc(f.id)}" data-k="amount" value="${Number(f.amount || 0).toLocaleString('ko-KR')}" aria-label="${esc(f.name)} 금액"></td>
        <td class="r">${isLoan(f) ? '<span class="pill s-card">대출</span>' : `<label class="tog"><input type="checkbox" data-excl="${esc(f.id)}" ${f.excluded ? 'checked' : ''}>제외</label>`}</td>
        <td class="r"><button type="button" class="x" data-del="funds" data-id="${esc(f.id)}" aria-label="${esc(f.name)} 삭제">×</button></td>
      </tr>`).join('')}</tbody>
      <tfoot><tr><td>가진 돈 합계</td><td class="r num">${won(sum(assetFunds()))}</td><td></td><td></td></tr>
        ${loanFunds().length ? `<tr class="sub"><td>대출 합계</td><td class="r num">${won(sum(loanFunds()))}</td><td></td><td></td></tr>` : ''}</tfoot></table>
      <div class="addline"><input type="text" id="new-fund" placeholder="새 자금 (예: 적금, 신용대출)"><button type="button" class="btn" id="add-fund">추가</button></div>
      <p class="hint">이름에 ‘대출’이 들어간 자금은 대출로 따로 계산해요. 대출 받을 금액을 적어 두면 현황에서 얼마나 더 필요한지 보여 줘요.</p>
    </div>`;
  el.querySelectorAll('input[data-k]').forEach(inp => inp.addEventListener('change', async () => {
    const isAmt = inp.dataset.k === 'amount';
    const v = isAmt ? toNum(inp.value) : inp.value.trim();
    inp.blur();
    if (await write(inp.dataset.col, inp.dataset.id, {[inp.dataset.k]: v}, 'update')) toast('저장했어요');
    renderAll();
  }));
  // 키보드의 완료/엔터로 바로 저장
  el.querySelectorAll('input[data-k]').forEach(inp => inp.addEventListener('keydown', e => { if (e.key === 'Enter'){ e.preventDefault(); inp.blur(); } }));
  el.querySelectorAll('[data-excl]').forEach(c => c.addEventListener('change', () => write('funds', c.dataset.excl, {excluded: c.checked}, 'update')));
  el.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', async () => {
    if (!b.classList.contains('armed')){ b.classList.add('armed'); b.textContent = '삭제?'; b.style.color = 'var(--danger)'; return; }
    await write(b.dataset.del, b.dataset.id, null, 'delete');
  }));
  const add = (col, inputId, prefix) => async () => {
    const name = $(inputId).value.trim(); if (!name) return;
    if (await write(col, newId(prefix), col === 'funds' ? {name, amount: 0, excluded: false, order: Date.now()} : {name, amount: 0, order: Date.now()})) toast('추가했어요. 금액을 입력하세요');
  };
  $('#add-fund').addEventListener('click', add('funds', '#new-fund', 'f'));
}

/* ---------- 육아 분류 나누기 제안 ----------
   '육아용품' 한 분류에 몰려 있는 항목을 이름으로 알아보고 세부 분류로 나누자고 제안한다.
   누르기 전에는 아무것도 바꾸지 않는다. */
const BABY_CATS = {
  '외출·이동': ['휴대용 유모차', '레카로 카시트', '아기띠'],
  '수유': ['보르르 분유포트', '폴레드 소독기', '젖병', '나리몽 휴대용 분유포트', '젖병 거치대', '마더케이 젖병솔', '수유등'],
  '목욕·위생': ['자이티 아기비데', '멸균티슈, 치약, 칫솔', '오버나이트', '로션', '스탠딩 욕조..?', '슬로운 샤워기', '손톱트리머', '버틀러 아기물티슈', '비판텐', '프랭클린 힙세정제(리필포함)', '프랭클린 바디&핸드워시', '해피달링 수전, 필터'],
  '세탁·세제': ['마더케이 세탁세제', '마더케이 지퍼백', '마더케이 무형광 세탁망', '프랭클린 주방세제', '프랭클린 섬유유연제'],
  '건강·안전': ['아기 비타민D, 유산균', '노시부', '해열제', '브라운 체온계', '온습도계', '가습기', '홈캠', '백색 소음기'],
  '수면·침구': ['원목침대', '라라스 옆잠베개', '두상베개', '담요', '수면조끼', '엔젤앤비 역방쿠', 'pvc매트', '기저귀갈이대'],
  '의류·놀이': ['배냇저고리', '베베룬 손수건(거즈, 엠보)', '애착인형', '타이니 모빌'],
  '산모용품': ['산후복대(마문느,리맘드)', '무압박 양말', '손목보호대', '맘스안심팬티', '생리대 대형', '압박스타킹', '수유패드'],
  '생활가전': ['음식물처리기', '트롤리'],
};
const normName = n => String(n || '').replace(/\s+/g, '');
const BABY_CAT_OF = Object.fromEntries(Object.entries(BABY_CATS).flatMap(([c, ns]) => ns.map(n => [normName(n), c])));
const SUGGEST_KEY = 'budget-babycat-dismiss';
function babyCatPlan(){
  return S.items.filter(i => i.group === 'baby' && i.section === '육아용품' && BABY_CAT_OF[normName(i.name)])
    .map(i => ({id: i.id, name: i.name, cat: BABY_CAT_OF[normName(i.name)]}));
}
function renderSuggest(){
  const el = $('#suggest');
  const plan = loaded.has('items') ? babyCatPlan() : [];
  if (plan.length < 3 || store.get(SUGGEST_KEY)){ el.innerHTML = ''; return; }
  const groups = {};
  plan.forEach(p => (groups[p.cat] = groups[p.cat] || []).push(p.name));
  const cats = Object.entries(groups).sort((a, b) => b[1].length - a[1].length);
  el.innerHTML = `<div class="panel suggest">
    <h2>육아용품 ${plan.length}건을 ${cats.length}개 분류로 나눌까요?</h2>
    <p class="hint">이름을 보고 나눠 봤어요. 나눈 뒤에도 항목마다 분류를 고칠 수 있어요.</p>
    <details><summary>${cats.map(([c, ns]) => `${esc(c)} ${ns.length}`).join(' · ')}</summary>
      <ul class="sugg-list">${cats.map(([c, ns]) => `<li><b>${esc(c)}</b><span>${ns.map(esc).join(', ')}</span></li>`).join('')}</ul>
    </details>
    <div class="row-actions"><button type="button" class="btn primary" id="sugg-apply">이대로 나누기</button><button type="button" class="btn" id="sugg-no">괜찮아요</button></div>
  </div>`;
  $('#sugg-apply').addEventListener('click', async () => {
    const p = babyCatPlan();
    if (await writeMany('items', p.map(x => ({id: x.id, data: {section: x.cat}})))) toast(`${p.length}건을 나눴어요`);
  });
  $('#sugg-no').addEventListener('click', () => { store.set(SUGGEST_KEY, '1'); renderSuggest(); });
}

