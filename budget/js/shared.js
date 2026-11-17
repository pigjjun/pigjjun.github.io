/* ---------- 상단 이동 바 (현황·지출) ---------- */
const jumpChips = list => list.map(([id, label]) => `<button type="button" class="jchip" data-jump="${id}">${label}</button>`).join('');
// 이동 바가 화면 위에 붙어 있을 때 그 아래쪽 위치 (그만큼 비켜서 스크롤)
function jumpOffset(){
  const bar = document.querySelector(curView() + ' .jumpbar');
  if (!bar) return 12;
  return (parseFloat(getComputedStyle(bar).top) || 0) + bar.offsetHeight + 10;
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-jump]');
  if (!b) return;
  const t = document.getElementById(b.dataset.jump);
  if (!t) return;
  const top = b.dataset.jump === 'j-top' ? 0 : t.getBoundingClientRect().top + scrollY - jumpOffset();
  window.scrollTo({top: Math.max(0, top), behavior: reduceMotionNow() ? 'auto' : 'smooth'});
});
const reduceMotionNow = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
// 스크롤하면 지금 보고 있는 부분의 칩을 표시 (프레임당 한 번만 계산)
let jumpTick = false;
function updateJumpActive(){
  jumpTick = false;
  const bar = document.querySelector(curView() + ' .jumpbar');
  if (!bar) return;
  const chips = [...bar.querySelectorAll('[data-jump]')];
  const off = jumpOffset() + 4;
  let cur = chips[0];
  for (const c of chips){
    const t = document.getElementById(c.dataset.jump);
    if (t && t.getBoundingClientRect().top <= off) cur = c;
  }
  // 맨 아래까지 내렸으면 마지막 칩
  if (window.innerHeight + scrollY >= document.documentElement.scrollHeight - 4) cur = chips[chips.length - 1];
  for (const c of chips) c.setAttribute('aria-current', c === cur ? 'true' : 'false');
  if (cur && bar.dataset.cur !== cur.dataset.jump){
    bar.dataset.cur = cur.dataset.jump;
    bar.scrollTo({left: Math.max(0, cur.offsetLeft - 24), behavior: reduceMotionNow() ? 'auto' : 'smooth'});
  }
}
window.addEventListener('scroll', () => { if (!jumpTick){ jumpTick = true; requestAnimationFrame(updateJumpActive); } }, {passive: true});
// PC에서는 위쪽 탭바 아래에 붙도록 높이를 알려 준다
function setStickTop(){
  const n = document.querySelector('nav.tabs');
  const sticky = getComputedStyle(n).position === 'sticky';
  document.documentElement.style.setProperty('--stick-top', sticky ? n.offsetHeight + 8 + 'px' : '0px');
}
window.addEventListener('resize', setStickTop);

/* ---------- 목록에서 바로 고르는 작은 메뉴 ---------- */
const pop = $('#pop');
let popPick = null;
function openPop(anchor, html, onPick){
  pop.innerHTML = html;
  pop.hidden = false;
  popPick = onPick;
  const r = anchor.getBoundingClientRect(), w = pop.offsetWidth, h = pop.offsetHeight;
  const vw = document.documentElement.clientWidth, vh = window.innerHeight;
  const left = Math.max(8, Math.min(r.left, vw - w - 8));
  const up = r.bottom + 6 + h > vh - 8;
  const top = up ? Math.max(8, r.top - 6 - h) : r.bottom + 6;
  pop.style.left = left + 'px'; pop.style.top = top + 'px';
  pop.style.transformOrigin = `${Math.round(r.left + r.width / 2 - left)}px ${up ? '100%' : '0'}`;
  pop.classList.remove('in'); void pop.offsetWidth; pop.classList.add('in');
  anchor.setAttribute('aria-expanded', 'true');
  closePop.anchor = anchor;
  pop.querySelector('button:not([disabled])')?.focus({preventScroll: true});
}
function closePop(){
  if (pop.hidden) return;
  pop.hidden = true; popPick = null;
  closePop.anchor?.setAttribute('aria-expanded', 'false');
}
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
pop.addEventListener('click', e => {
  const b = e.target.closest('button[data-v]');
  if (!b || !popPick) return;
  const pick = popPick; popPick = null;
  // 고른 항목에 체크를 보여 주고 잠깐 뒤 닫는다 (무엇을 골랐는지 눈으로 확인)
  pop.querySelectorAll('button').forEach(x => { x.classList.remove('picked'); x.querySelector('b')?.remove(); });
  b.classList.add('picked'); b.insertAdjacentHTML('beforeend', '<b>✓</b>');
  setTimeout(() => { closePop(); pick(b.dataset.v); }, reduceMotion ? 0 : 220);
});
// 방금 바뀐 칩을 한 번 반짝이게: 다시 그릴 때 이 표시가 있으면 flash 클래스
function markFlash(id, kind){ UI.flash = {id, kind, at: Date.now()}; }
const flashOf = (id, kind) => UI.flash && UI.flash.id === id && UI.flash.kind === kind && Date.now() - UI.flash.at < 700 ? ' flash' : '';
document.addEventListener('pointerdown', e => { if (!pop.hidden && !pop.contains(e.target) && !e.target.closest('[data-qs],[data-qf],[data-qc]')) closePop(); }, true);
window.addEventListener('scroll', closePop, {passive: true});
window.addEventListener('resize', closePop);
document.addEventListener('keydown', e => { if (e.key === 'Escape') closePop(); });

function statusMenu(anchor){
  if (closePop.anchor === anchor && !pop.hidden) return closePop();
  const i = S.items.find(x => x.id === anchor.dataset.qs);
  if (!i) return;
  const cur = i.status in STATUS ? i.status : 'plan';
  const curBill = billKey(i.billMonth);
  const curKey = cur === 'card' ? 'card:' + curBill : cur;
  // 카드결제는 출금월별로 따로 고를 수 있게 (이번 달·다음 달·다다음 달 + 지금 값). 더 먼 달은 편집 창에서
  const months = billMonths().slice(1, 4);
  if (cur === 'card' && curBill && !months.includes(curBill)) months.unshift(curBill);
  const opts = [['plan', STATUS.plan.label, 'plan'],
    ...months.map(m => ['card:' + m, `카드결제 · ${billLabel(m)} 출금`, 'card']),
    ['settled', STATUS.settled.label, 'settled'], ['gift', STATUS.gift.label, 'gift']];
  openPop(anchor, `<div class="pop-h">${esc(i.name)}</div>` + opts.map(([k, label, dot]) =>
    `<button type="button" role="menuitemradio" aria-checked="${k === curKey}" data-v="${esc(k)}"><span class="dot s-${dot}"></span>${esc(label)}${k === curKey ? '<b>✓</b>' : ''}</button>`).join(''),
    async v => {
      if (v === curKey) return;
      markFlash(i.id, 'qs');
      const [st, month] = v.split(':');
      const data = {status: st};
      if (st === 'card'){ data.billMonth = month; if (!CARDS[i.cardBy] && lastCard() && cardSupported()) data.cardBy = lastCard(); }
      if (await write('items', i.id, data, 'update')) toast(st === 'card' ? `카드결제 · ${billLabel(month)} 출금으로 바꿨어요` : `${STATUS[st].label}(으)로 바꿨어요`);
    });
}
async function setCard(id, k){
  if (!cardSupported()){ toast('카드 구분은 구글 시트 쪽 코드(Code.gs)를 업데이트한 뒤 저장돼요'); renderAll(); return; }
  rememberCard(k);
  if (await write('items', id, {cardBy: k}, 'update')) toast(k ? `${cardName(k)}로 정했어요` : '카드를 비웠어요');
}
function cardMenu(anchor){
  if (closePop.anchor === anchor && !pop.hidden) return closePop();
  const i = S.items.find(x => x.id === anchor.dataset.qc);
  if (!i) return;
  const cur = CARDS[i.cardBy] ? i.cardBy : '';
  openPop(anchor, `<div class="pop-h">${esc(i.name)} · 어느 카드로 결제?</div>`
    + Object.keys(CARDS).map(k => `<button type="button" role="menuitemradio" aria-checked="${k === cur}" data-v="${k}"><span class="dot c-${k}"></span>${cardName(k)}${k === cur ? '<b>✓</b>' : ''}</button>`).join('')
    + `<hr><button type="button" data-v="">지정 안 함${!cur ? '<b>✓</b>' : ''}</button>`,
    v => { if (v === cur) return; markFlash(i.id, 'qc'); setCard(i.id, v); });
}
function sourceMenu(anchor){
  if (closePop.anchor === anchor && !pop.hidden) return closePop();
  const i = S.items.find(x => x.id === anchor.dataset.qf);
  if (!i) return;
  const parts = parseSources(i), rem = unassignedOf(i);
  const partial = parts.length && rem > 0;           // 일부만 정함 → 고른 자금이 나머지를 낸다
  const single = parts.length === 1 && !rem ? parts[0].fund : '';
  const head = partial ? `남은 ${won(rem)}을 낼 곳`
    : parts.length > 1 ? '고르면 전액을 한 곳에서 내요' : `${won(i.amount)}을 낼 곳`;
  const funds = [...S.funds].sort(byOrder).map(f =>
    `<button type="button" role="menuitemradio" aria-checked="${f.id === single}" data-v="${esc(f.id)}">${esc(f.name)}${isLoan(f) && !/대출/.test(f.name) ? ' (대출)' : ''}${f.id === single ? '<b>✓</b>' : ''}</button>`).join('');
  openPop(anchor, `<div class="pop-h">${head}</div>${funds}`
    + (S.funds.some(isLoan) ? '' : '<button type="button" data-v="__newloan">대출 (새로 추가)</button>')
    + '<hr>'
    + '<button type="button" data-v="__split">여러 곳으로 나누기…</button>'
    + (parts.length ? '<button type="button" data-v="">출처 미정으로</button>' : ''),
    async v => {
      if (v === '__split') return openEditor(i.id);
      markFlash(i.id, 'qf');
      const fund = await pickFund(v);
      const source = !fund ? '' : partial ? withRemainder(i, fund) : fund;
      if (await write('items', i.id, {source}, 'update')) toast(fund ? `${fundName(fund) || '대출'}에서 내기로 했어요` : '출처를 비웠어요');
    });
}

/* ---------- 금액 입력칸 ---------- */
// 숫자 키패드, 입력하는 동안 쉼표, 아래에 "1억 2,000만원" 식으로 읽어 준다
function krFull(n){
  n = Math.round(n || 0);
  if (!n) return '';
  const eok = Math.floor(n / 1e8), man = Math.floor(n % 1e8 / 1e4), rest = n % 1e4, p = [];
  if (eok) p.push(eok.toLocaleString('ko-KR') + '억');
  if (man) p.push(man.toLocaleString('ko-KR') + '만');
  if (rest) p.push(rest.toLocaleString('ko-KR'));
  return p.join(' ') + '원';
}
function formatMoney(el){
  const n = toNum(el.value);
  el.value = n ? n.toLocaleString('ko-KR') : '';
  const read = el.dataset.read && document.getElementById(el.dataset.read);
  if (read) read.textContent = n >= 10000 ? krFull(n) : '';
}
document.addEventListener('input', e => { if (e.target.matches?.('input.money')) formatMoney(e.target); });

/* ---------- 폰 키보드가 올라오면 아래 탭바·추가 버튼 숨기기 ---------- */
// 글자 칸에 커서가 있고 '실제로 키보드가 화면을 가리고 있을 때만' 숨긴다.
// (아이폰은 키보드를 내려도 커서가 칸에 남아 있어서, 커서만 보고 숨기면 탭바가 안 돌아왔다)
const isTypingField = el => el && (el.tagName === 'TEXTAREA' ||
  (el.tagName === 'INPUT' && !['checkbox', 'radio', 'button', 'submit', 'range', 'color', 'file'].includes(el.type)));
let fullH = window.innerHeight;
function updateTyping(){
  fullH = Math.max(fullH, window.innerHeight);
  const vv = window.visualViewport;
  const keyboard = (vv ? window.innerHeight - vv.height > 120 : false) || window.innerHeight < fullH - 120;
  document.body.classList.toggle('typing', keyboard && isTypingField(document.activeElement));
}
document.addEventListener('focusin', () => setTimeout(updateTyping, 300));   // 키보드가 다 올라온 뒤 판단
document.addEventListener('focusout', () => setTimeout(updateTyping, 50));
window.visualViewport?.addEventListener('resize', updateTyping);
window.addEventListener('resize', updateTyping);
window.addEventListener('orientationchange', () => { fullH = 0; setTimeout(updateTyping, 400); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') updateTyping(); });

