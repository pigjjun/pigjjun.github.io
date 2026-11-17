/* ---------- 시작 ---------- */
function renderAll(){
  renderHome(); renderLedger(); renderStats();
  renderSuggest(); renderSummary(); renderFilters(); renderItems(); renderFunds(); renderTodo();
  requestAnimationFrame(updateJumpActive);
}
function afterSync(){ runRules(); }
document.querySelectorAll('dialog').forEach(setupSheet);
$('#fab').addEventListener('click', () => UI.tab === 'project' ? openEditor(null) : openTx(null));
$('#sync').addEventListener('click', () => { if (!token) return askPin(); sync(); });
document.querySelectorAll('#who [data-who]').forEach(b => b.addEventListener('click', () => {
  store.set(K.me, b.dataset.who); rememberCard(b.dataset.who); $('#who').hidden = true;
}));
if (store.get('hb-cal') === '0'){ $('#tx-cal').hidden = true; $('#cal-toggle').setAttribute('aria-pressed', 'false'); }

let hashTab = 'home';
try { hashTab = (location.hash || '').slice(1) || 'home'; } catch {}
setStickTop();
showProject('summary');
showTab(hashTab);
rebuild();
renderAll();
setupBack();
startStore();
