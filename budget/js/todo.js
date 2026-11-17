/* ---------- 할 일 ---------- */
// 입력칸은 고정 마크업이고 목록만 다시 그린다 (입력 중인 글자가 지워지지 않게)
// 기한(due)은 'YYYY-MM-DD' 글자. 비어 있으면 기한 없음.
const dueSupported = () => true;
const todayStr = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
function dueBadge(due){
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due || '')) return '';
  const [y, m, d] = due.split('-').map(Number), [ty, tm, td] = todayStr().split('-').map(Number);
  const diff = Math.round((Date.UTC(y, m - 1, d) - Date.UTC(ty, tm - 1, td)) / 864e5);
  const label = diff === 0 ? '오늘' : diff > 0 ? 'D-' + diff : 'D+' + (-diff);
  const cls = diff < 0 ? 'over' : diff <= 3 ? 'soon' : 'later';
  return `<span class="due ${cls}" title="기한 ${y}년 ${m}월 ${d}일">${m}/${d} · ${label}</span>`;
}
function renderTodo(){
  const el = $('#todo-list');
  if (!loaded.has('todos')){ el.innerHTML = '<div class="empty">데이터를 불러오는 중이에요…</div>'; return; }
  // 고치는 중이면 다시 그리지 않음 (20초마다 오는 동기화가 입력을 지우지 않게)
  if (UI.todoEdit && el.querySelector('li.editing')?.contains(document.activeElement)) return;
  if (drag) return;
  const list = [...S.todos].sort((a, b) => (a.done - b.done) || byOrder(a, b));
  $('#todo-count').textContent = `${S.todos.filter(t => !t.done).length}개 남음`;
  $('#new-due').disabled = !dueSupported();
  $('#new-due-hint').textContent = dueSupported() ? '선택 안 하면 기한 없음' : '기한은 Code.gs 업데이트 후 쓸 수 있어요';
  el.innerHTML = list.length ? `<ul class="todos todo-edit">${list.map(t => t.id === UI.todoEdit ? `
    <li class="editing" data-id="${esc(t.id)}">
      <form class="todo-form" data-todo-form="${esc(t.id)}">
        <input type="text" class="te-text" value="${esc(t.text)}" aria-label="할 일 내용" enterkeyhint="done" autocomplete="off">
        <div class="due-row">
          <label class="duefield"><span>기한</span><input type="date" class="te-due" value="${esc(t.due || '')}" aria-label="기한"${dueSupported() ? '' : ' disabled'}></label>
          <button type="button" class="btn small ghost" data-due-clear>기한 없음</button>
        </div>
        <div class="row-actions">
          <button type="submit" class="btn primary small">저장</button>
          <button type="button" class="btn small" data-edit-cancel>취소</button>
        </div>
      </form>
    </li>` : `
    <li class="${t.done ? 'done' : 'undone'}" data-id="${esc(t.id)}">
      ${t.done ? '<span class="handle-sp"></span>' : `<button type="button" class="handle" data-handle aria-label="${esc(t.text)} 순서 바꾸기 (끌어서 옮기기)"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg></button>`}
      <input type="checkbox" data-done="${esc(t.id)}" ${t.done ? 'checked' : ''} aria-label="${esc(t.text)} 완료">
      <button type="button" class="tx-btn" data-edit-todo="${esc(t.id)}"><span class="tx">${esc(t.text)}</span>${t.done ? '' : dueBadge(t.due)}</button>
      <button type="button" class="x" data-del="${esc(t.id)}" aria-label="${esc(t.text)} 삭제">×</button>
    </li>`).join('')}</ul>`
    : '<div class="empty">할 일이 없어요. 위 칸에 적고 추가를 누르세요.</div>';
  const te = el.querySelector('.te-text');
  if (te && !el.querySelector('li.editing').contains(document.activeElement)){ te.focus(); te.setSelectionRange(te.value.length, te.value.length); }
}
$('#todo-list').addEventListener('change', e => {
  const c = e.target.closest('[data-done]');
  if (c) write('todos', c.dataset.done, {done: c.checked}, 'update');
});
$('#todo-list').addEventListener('click', e => {
  const del = e.target.closest('[data-del]');
  if (del){
    if (!del.classList.contains('armed')){ del.classList.add('armed'); del.textContent = '삭제?'; return; }
    return write('todos', del.dataset.del, null, 'delete');
  }
  const ed = e.target.closest('[data-edit-todo]');
  if (ed){ UI.todoEdit = ed.dataset.editTodo; return renderTodo(); }
  if (e.target.closest('[data-edit-cancel]')){ UI.todoEdit = null; document.activeElement?.blur(); return renderTodo(); }
  const clr = e.target.closest('[data-due-clear]');
  if (clr){ clr.closest('form').querySelector('.te-due').value = ''; }
});
$('#todo-list').addEventListener('submit', e => {
  const f = e.target.closest('[data-todo-form]');
  if (!f) return;
  e.preventDefault();
  const id = f.dataset.todoForm, text = f.querySelector('.te-text').value.trim();
  if (!text){ f.querySelector('.te-text').focus(); return; }
  const data = {text};
  if (dueSupported()) data.due = f.querySelector('.te-due').value || '';
  UI.todoEdit = null;
  document.activeElement?.blur();
  write('todos', id, data, 'update'); // 화면엔 바로 반영
  renderTodo();
  toast('고쳤어요');
});
$('#todo-form').addEventListener('submit', async e => {
  e.preventDefault();
  const inp = $('#new-todo'), text = inp.value.trim(), due = $('#new-due').value;
  if (!text) return;
  inp.value = ''; $('#new-due').value = ''; $('#new-due-clear').hidden = true; // 바로 비워서 이어서 적을 수 있게
  const data = {text, done: false, order: Date.now()};
  if (due && dueSupported()) data.due = due;
  if (!await write('todos', newId('t'), data)){ inp.value = text; $('#new-due').value = due; }
});
$('#new-due').addEventListener('change', () => { $('#new-due-clear').hidden = !$('#new-due').value; });
$('#new-due-clear').addEventListener('click', () => { $('#new-due').value = ''; $('#new-due-clear').hidden = true; });

// 순서 바꾸기: ⋮⋮ 손잡이를 끌면 그 줄이 손가락을 따라오고, 놓은 자리로 순서를 저장한다 (안 끝난 할 일끼리)
let drag = null;
$('#todo-list').addEventListener('pointerdown', e => {
  const h = e.target.closest('[data-handle]');
  if (!h) return;
  e.preventDefault();
  const li = h.closest('li'), rows = [...li.parentElement.querySelectorAll('li.undone')];
  drag = {li, rows, idx: rows.indexOf(li), y0: e.clientY, to: rows.indexOf(li),
          tops: rows.map(r => r.getBoundingClientRect().top), h: li.getBoundingClientRect().height};
  li.classList.add('dragging');
  h.setPointerCapture(e.pointerId);
});
$('#todo-list').addEventListener('pointermove', e => {
  if (!drag) return;
  const {li, rows, idx, tops, h} = drag;
  const dy = e.clientY - drag.y0;
  li.style.transform = `translateY(${dy}px)`;
  // 끄는 줄의 가운데가 어느 줄 위치에 있는지로 새 자리 계산
  const mid = tops[idx] + h / 2 + dy;
  let to = 0;
  tops.forEach((t, k) => { if (mid > t + (k === idx ? 0 : 0)) to = k; });
  to = Math.max(0, Math.min(rows.length - 1, to));
  drag.to = to;
  rows.forEach((r, k) => {
    if (k === idx) return;
    const shift = k > idx && k <= to ? -h : (k < idx && k >= to ? h : 0);
    r.style.transform = shift ? `translateY(${shift}px)` : '';
  });
});
function endDrag(){
  if (!drag) return;
  const {li, rows, idx, to} = drag;
  rows.forEach(r => { r.style.transform = ''; });
  li.classList.remove('dragging');
  drag = null;
  if (to === idx) return renderTodo();
  const ids = rows.map(r => r.dataset.id);
  ids.splice(to, 0, ids.splice(idx, 1)[0]);
  const updates = ids.map((id, k) => ({id, data: {order: (k + 1) * 10}}))
    .filter(u => (S.todos.find(t => t.id === u.id)?.order) !== u.data.order);
  writeMany('todos', updates);
  toast('순서를 바꿨어요');
}
$('#todo-list').addEventListener('pointerup', endDrag);
$('#todo-list').addEventListener('pointercancel', endDrag);

