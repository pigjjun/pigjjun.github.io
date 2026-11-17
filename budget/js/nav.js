/* ---------- 탭 ---------- */
const TABS = ['home', 'ledger', 'stats', 'project', 'todo'];
const PTABS = ['summary', 'items', 'funds'];
const curView = () => UI.tab === 'project' ? '#v-' + UI.ptab : '#v-' + UI.tab;
function fadeIn(sec, show){
  if (show && sec.hidden){ sec.classList.remove('enter'); void sec.offsetWidth; sec.classList.add('enter'); }
  sec.hidden = !show;
}
function showTab(t){
  if (!TABS.includes(t)) t = 'home';
  UI.tab = t;
  document.querySelectorAll('nav.tabs button').forEach(b => b.setAttribute('aria-current', b.dataset.tab === t ? 'page' : 'false'));
  for (const v of TABS) fadeIn($('#v-' + v), v === t);
  const fab = $('#fab');
  fab.hidden = false;
  fab.setAttribute('aria-label', t === 'project' ? '이사·출산 지출 추가' : '내역 추가');
  fab.querySelector('span').textContent = t === 'project' ? '지출 추가' : '내역 추가';
  try { history.replaceState(history.state, '', '#' + t); } catch {}
  requestAnimationFrame(updateJumpActive);
}
function showProject(p){
  if (!PTABS.includes(p)) p = 'summary';
  UI.ptab = p;
  document.querySelectorAll('#ptabs button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.ptab === p)));
  for (const v of PTABS) fadeIn($('#v-' + v), v === p);
  if (UI.tab !== 'project') showTab('project');
  requestAnimationFrame(updateJumpActive);
}
document.querySelectorAll('nav.tabs button').forEach(b => b.addEventListener('click', () => { showTab(b.dataset.tab); window.scrollTo(0, 0); }));
document.querySelectorAll('#ptabs button').forEach(b => b.addEventListener('click', () => { showProject(b.dataset.ptab); window.scrollTo(0, 0); }));
document.addEventListener('click', e => {
  const g = e.target.closest('[data-gotab]');
  if (g){ showTab(g.dataset.gotab); window.scrollTo(0, 0); }
});

/* ---------- 아래에서 올라오는 창(시트) 공통 동작 ----------
   바깥을 누르면 닫히고, 위쪽 손잡이를 끌어내리면 창 전체가 따라 내려오다 닫힌다. */
let sheetClosedAt = 0;
function setupSheet(d){
  const body = d.querySelector('.sheet');
  d.addEventListener('click', e => {
    if (e.target !== d) return;
    const r = body.getBoundingClientRect();
    if (e.clientY < r.top || e.clientY > r.bottom || e.clientX < r.left || e.clientX > r.right){ e.preventDefault(); d.close(); }
  });
  let y0 = null, dy = 0;
  const reset = () => { d.style.transition = ''; d.style.transform = ''; d.style.removeProperty('--drag'); };
  d.addEventListener('touchstart', e => {
    if (!e.target.closest('.sheet-top')) return;
    y0 = e.touches[0].clientY; dy = 0; d.style.transition = 'none';
  }, {passive: true});
  d.addEventListener('touchmove', e => {
    if (y0 === null) return;
    dy = Math.max(0, e.touches[0].clientY - y0);
    d.style.transform = `translateY(${dy}px)`;
    d.style.setProperty('--drag', Math.min(1, dy / d.offsetHeight).toFixed(3));
  }, {passive: true});
  d.addEventListener('touchend', () => {
    if (y0 === null) return;
    y0 = null;
    d.style.transition = 'transform .22s cubic-bezier(.2,.8,.2,1)';
    if (dy > 80){
      d.style.transform = 'translateY(100%)'; d.style.setProperty('--drag', '1');
      setTimeout(() => { d.close(); reset(); }, reduceMotionNow() ? 0 : 200);
    } else { d.style.transform = ''; d.style.setProperty('--drag', '0'); setTimeout(reset, 230); }
  });
  d.addEventListener('close', () => { reset(); sheetClosedAt = Date.now(); });
  d.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => d.close()));
}
function openSheet(d, focusEl){
  closePop();
  d.showModal();
  (focusEl || d.querySelector('.sheet-title'))?.focus({preventScroll: true});
}

/* ---------- 뒤로가기 (설치한 앱) ----------
   열린 메뉴·창 닫기 → 프로젝트 안쪽 화면이면 프로젝트 현황 → 다른 탭이면 홈 → 홈 맨 위면 종료 안내. */
function setupBack(){
  const arm = () => { try { history.pushState({guard: 1}, '', location.hash); } catch {} };
  const bar = $('#exitbar');
  let hideTimer = 0;
  const hideExit = rearm => { bar.hidden = true; clearTimeout(hideTimer); if (rearm) arm(); };
  try { history.replaceState({root: 1}, '', location.hash); } catch {}
  arm();
  window.addEventListener('popstate', () => {
    if (!pop.hidden){ closePop(); return arm(); }
    const open = document.querySelector('dialog[open]');
    if (open){ open.close(); return arm(); }
    if (!bar.hidden) return; // 안내 중에 한 번 더 누르면 실제로 닫힌다
    if (UI.tab === 'project' && UI.ptab !== 'summary'){ showProject('summary'); window.scrollTo(0, 0); return arm(); }
    if (UI.tab !== 'home'){ showTab('home'); window.scrollTo(0, 0); return arm(); }
    if (scrollY > 200){ window.scrollTo({top: 0, behavior: 'smooth'}); return arm(); }
    bar.hidden = false;
    bar.classList.remove('in'); void bar.offsetWidth; bar.classList.add('in');
    hideTimer = setTimeout(() => hideExit(true), 4000);
  });
  $('#exit-stay').addEventListener('click', () => hideExit(true));
}
