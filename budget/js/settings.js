/* ---------- 설정: 예산·분류, 고정 내역, 이 기기 ---------- */
const setDlg = $('#set-dlg');
function openSettings(){ UI.ruleEdit = null; renderSettings(); openSheet(setDlg); }
$('#open-set').addEventListener('click', openSettings);
function renderSettings(){
  const cs = cats(), rules = [...S.rules].sort((a, b) => (a.day || 1) - (b.day || 1));
  const ruleForm = r => `<form class="ruleform" data-ruleform="${esc(r?.id || '')}">
      <div class="two"><label class="field"><span>이름</span><input type="text" name="name" value="${esc(r?.name || '')}" placeholder="예: 관리비" required autocomplete="off"></label>
        <label class="field"><span>금액 (원)</span><input type="text" name="amount" class="money" inputmode="numeric" pattern="[0-9,]*" value="${r?.amount ? Number(r.amount).toLocaleString('ko-KR') : ''}" required autocomplete="off"></label></div>
      <div class="two"><label class="field"><span>종류</span><select name="type"><option value="out">나가는 돈</option><option value="in"${r?.type === 'in' ? ' selected' : ''}>들어오는 돈</option></select></label>
        <label class="field"><span>매달 며칠</span><select name="day">${Array.from({length: 31}, (_, k) => `<option value="${k + 1}"${(r?.day || 1) === k + 1 ? ' selected' : ''}>${k + 1}일</option>`).join('')}</select></label></div>
      <div class="two"><label class="field"><span>분류</span><select name="cat"><option value="">미분류</option>${(r?.type === 'in' ? INCOME_CATS.map(n => [n, n]) : cs.map(c => [c.id, c.name])).map(([id, n]) => `<option value="${esc(id)}"${r?.cat === id ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select></label>
        <label class="field"><span>결제수단</span><select name="pay">${Object.entries(PAY).map(([k, v]) => `<option value="${k}"${(r?.pay || 'cash') === k ? ' selected' : ''}>${v}</option>`).join('')}</select></label></div>
      <div class="row-actions"><button type="submit" class="btn primary small">${r ? '저장' : '등록'}</button><button type="button" class="btn small" data-rulecancel>취소</button>
        ${r ? `<button type="button" class="btn small danger" data-ruledel="${esc(r.id)}">삭제</button>` : ''}</div>
    </form>`;
  $('#set-body').innerHTML = `
    <section><h4>월 예산과 분류 <small>합계 ${won(sum(cs))}</small></h4>
      <p class="hint">지출을 적을 때 고르는 분류예요. 금액은 한 달 예산이고, 0이면 예산 없이 분류만 써요.</p>
      <table class="edit-table"><tbody>${cs.map(c => `<tr>
        <td><input type="text" data-setk="name" data-id="${esc(c.id)}" value="${esc(c.name)}" aria-label="분류 이름" autocomplete="off"></td>
        <td class="r"><input type="text" class="amt-in num money" inputmode="numeric" pattern="[0-9,]*" enterkeyhint="done" autocomplete="off" data-setk="amount" data-id="${esc(c.id)}" value="${Number(c.amount || 0).toLocaleString('ko-KR')}" aria-label="${esc(c.name)} 한 달 예산"></td>
        <td class="r"><button type="button" class="x" data-catdel="${esc(c.id)}" aria-label="${esc(c.name)} 삭제">×</button></td></tr>`).join('')}</tbody></table>
      <form class="addline" id="cat-add"><input type="text" id="new-cat" placeholder="새 분류 (예: 육아용품, 외식)" autocomplete="off"><button type="submit" class="btn">추가</button></form>
    </section>
    <section><h4>고정 내역 <small>매달 자동으로 적어요</small></h4>
      ${rules.length ? `<ul class="rulelist">${rules.map(r => UI.ruleEdit === r.id ? `<li class="editing">${ruleForm(r)}</li>` : `<li><button type="button" data-ruleedit="${esc(r.id)}">
        <span><b>${esc(r.name)}</b><small>매달 ${r.day || 1}일 · ${r.type === 'in' ? (r.cat || '수입') : (catName(r.cat) || '미분류') + ' · ' + (PAY[r.pay] || PAY.cash)}</small></span>
        <span class="num ${r.type === 'in' ? 'inc' : ''}">${r.type === 'in' ? '+' : ''}${won(r.amount)}</span></button></li>`).join('')}</ul>` : '<p class="empty">관리비·보험료·용돈·월급처럼 매달 같은 날 오가는 돈을 등록해 두면 직접 적지 않아도 돼요.</p>'}
      ${UI.ruleEdit === 'new' ? ruleForm(null) : '<button type="button" class="btn small" data-rulenew>+ 고정 내역 등록</button>'}
    </section>
    <section><h4>이 기기</h4>
      <div class="field"><span>이 폰을 쓰는 사람 <em class="hint">내역 적을 때 기본 카드</em></span>
        <div class="seg seg2">${Object.entries(CARDS).map(([k, v]) => `<label><input type="radio" name="setme" value="${k}"${me() === k ? ' checked' : ''}>${v}</label>`).join('')}</div></div>
      <p class="hint" id="set-net">${net.online === false ? '지금 맥북에 연결되지 않아요. 적은 내용은 이 폰에 저장되어 있다가 연결되면 올라가요.' : '맥북에 연결되어 있어요.'}
        ${outbox.length ? ` 올릴 내용 ${outbox.length}건이 기다리고 있어요.` : ''} 데이터는 맥북에 저장되고 매일 백업돼요.</p>
      <div class="row-actions"><button type="button" class="btn small" id="set-export">백업 파일 내려받기</button><button type="button" class="btn small" id="set-logout">이 기기 잠그기</button></div>
      <p class="hint">${window.APP_VERSION ? '버전 ' + esc(window.APP_VERSION) : ''}</p>
    </section>`;
}
setDlg.addEventListener('change', e => {
  const t = e.target;
  if (t.dataset.setk){
    const v = t.dataset.setk === 'amount' ? toNum(t.value) : t.value.trim();
    if (t.dataset.setk === 'name' && !v){ renderSettings(); return; }
    write('monthly', t.dataset.id, {[t.dataset.setk]: v}, 'update'); toast('저장했어요');
    $('#set-body h4 small').textContent = '합계 ' + won(sum(S.monthly));
  }
  if (t.name === 'setme'){ store.set(K.me, t.value); rememberCard(t.value); store.set('hb-pay', t.value); toast(CARDS[t.value] + ' 폰으로 정했어요'); }
  if (t.name === 'type' && t.closest('.ruleform')){   // 종류가 바뀌면 분류 목록도 바꾼다
    const sel = t.closest('.ruleform').querySelector('[name=cat]');
    sel.innerHTML = '<option value="">미분류</option>' + (t.value === 'in' ? INCOME_CATS.map(n => [n, n]) : cats().map(c => [c.id, c.name])).map(([id, n]) => `<option value="${esc(id)}">${esc(n)}</option>`).join('');
  }
});
setDlg.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.dataset.setk){ e.preventDefault(); e.target.blur(); } });
setDlg.addEventListener('click', async e => {
  const q = s => e.target.closest(s);
  let b;
  if ((b = q('[data-catdel]'))){
    if (!b.classList.contains('armed')){ b.classList.add('armed'); b.textContent = '삭제?'; return; }
    await write('monthly', b.dataset.catdel, null, 'delete'); toast('분류를 지웠어요. 그 분류의 내역은 미분류로 보여요'); return renderSettings();
  }
  if (q('[data-rulenew]')){ UI.ruleEdit = 'new'; return renderSettings(); }
  if ((b = q('[data-ruleedit]'))){ UI.ruleEdit = b.dataset.ruleedit; return renderSettings(); }
  if (q('[data-rulecancel]')){ UI.ruleEdit = null; return renderSettings(); }
  if ((b = q('[data-ruledel]'))){
    if (!b.classList.contains('armed')){ b.classList.add('armed'); b.textContent = '정말 삭제'; return; }
    await write('rules', b.dataset.ruledel, null, 'delete'); UI.ruleEdit = null; toast('지웠어요. 이미 적힌 내역은 그대로 둬요'); return renderSettings();
  }
  if (q('#set-logout')){ token = ''; store.del(K.token); store.del('budget-pin'); setDlg.close(); return askPin(); }
  if (q('#set-export')){
    try {
      const j = await call('/api/export', null, 'GET');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([JSON.stringify(j, null, 1)], {type: 'application/json'}));
      a.download = `가계부-백업-${todayStr()}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    } catch { toast('맥북에 연결되어야 내려받을 수 있어요'); }
  }
});
setDlg.addEventListener('submit', async e => {
  e.preventDefault();
  if (e.target.id === 'cat-add'){
    const name = $('#new-cat').value.trim(); if (!name) return;
    await write('monthly', newId('m'), {name, amount: 0, order: Date.now()}); toast('추가했어요. 예산을 적어 주세요'); return renderSettings();
  }
  const f = e.target.closest('[data-ruleform]');
  if (f){
    const v = Object.fromEntries(new FormData(f)), amount = toNum(v.amount);
    if (!v.name.trim() || amount <= 0){ toast('이름과 금액을 적어 주세요'); return; }
    const id = f.dataset.ruleform || newId('r'), prev = S.rules.find(r => r.id === id);
    await write('rules', id, {name: v.name.trim(), amount, type: v.type, day: Number(v.day), cat: v.cat, pay: v.pay, active: true, start: prev?.start || curMonth()});
    UI.ruleEdit = null; renderSettings(); runRules(); toast(prev ? '고쳤어요' : '등록했어요');
  }
});
