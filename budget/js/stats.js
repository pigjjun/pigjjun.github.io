/* ---------- 통계: 달마다 얼마나, 어디에 ---------- */
function renderStats(){
  const el = $('#v-stats');
  if (!loaded.has('tx')){ el.innerHTML = '<div class="panel empty">데이터를 불러오는 중이에요…</div>'; return; }
  const m = UI.month, tx = txOf(m), prev = txOf(addMonth(m, -1));
  const out = sum(outs(tx)), inc = sum(ins(tx)), pOut = sum(outs(prev)), budget = sum(S.monthly);

  // 최근 6개월 추이 (고른 달이 맨 오른쪽)
  const months = Array.from({length: 6}, (_, k) => addMonth(m, k - 5));
  const series = months.map(mo => { const t = txOf(mo); return {m: mo, out: sum(outs(t)), inc: sum(ins(t))}; });
  const top = Math.max(1, budget, ...series.map(s => s.out));
  const trend = `<div class="trend" role="img" aria-label="최근 6개월 지출: ${series.map(s => `${+s.m.slice(5)}월 ${won(s.out)}`).join(', ')}">
      ${budget ? `<i class="tline" style="bottom:${budget / top * 100}%"><em>예산 ${man(budget)}</em></i>` : ''}
      ${series.map(s => `<div class="tcol${s.m === m ? ' cur' : ''}"><span class="tval num">${s.out ? man(s.out) : ''}</span>
        <span class="tbar${budget && s.out > budget ? ' over' : ''}" style="height:${s.out / top * 100}%"></span></div>`).join('')}
    </div>
    <div class="trend-x">${series.map(s => `<span class="${s.m === m ? 'cur' : ''}">${+s.m.slice(5)}월</span>`).join('')}</div>`;

  // 분류별 (지난달과 비교)
  const agg = list => { const o = {}; outs(list).forEach(t => { const k = catName(t.cat) ? t.cat : ''; o[k] = (o[k] || 0) + (t.amount || 0); }); return o; };
  const a = agg(tx), b = agg(prev);
  const rows = Object.keys(a).map(k => ({k, name: k ? catName(k) : '미분류', v: a[k], p: b[k] || 0})).sort((x, y) => y.v - x.v);
  const maxV = Math.max(1, ...rows.map(r => r.v));
  const delta = (v, p) => !p ? (v ? '<small class="hint">지난달 없음</small>' : '') : v === p ? '<small class="hint">지난달과 같음</small>'
    : `<small class="${v > p ? 'up' : 'down'}">지난달보다 ${won(Math.abs(v - p))} ${v > p ? '더' : '덜'}</small>`;

  const byPay = {gj: 0, eh: 0, cash: 0};
  outs(tx).forEach(t => { byPay[PAY[t.pay] ? t.pay : 'cash'] += t.amount || 0; });
  const big = [...outs(tx)].sort((x, y) => y.amount - x.amount).slice(0, 5);

  el.innerHTML = `${monthNav()}
    <div class="kpis">
      <div class="kpi"><span class="eyebrow">쓴 돈</span><b class="num">${kr(out)}</b><span class="sub num">${pOut ? (out === pOut ? '지난달과 같음' : `지난달보다 ${krShort(Math.abs(out - pOut))} ${out > pOut ? '더' : '덜'}`) : won(out)}</span></div>
      <div class="kpi"><span class="eyebrow">들어온 돈</span><b class="num">${kr(inc)}</b><span class="sub num">${won(inc)}</span></div>
      <div class="kpi${inc - out < 0 ? ' loan' : ''}"><span class="eyebrow">남긴 돈</span><b class="num">${inc - out < 0 ? '−' : ''}${kr(Math.abs(inc - out))}</b><span class="sub num">${inc ? `들어온 돈의 ${Math.round((inc - out) / inc * 100)}%` : '수입을 적으면 계산돼요'}</span></div>
    </div>
    <div class="grid2" style="margin-top:14px">
      <div class="stack">
        <div class="panel"><h2>최근 6개월 지출</h2>${series.some(s => s.out) ? trend : '<div class="empty">내역이 쌓이면 달마다 비교해 드려요.</div>'}
          <table class="mtable"><thead><tr><th>달</th><th>쓴 돈</th><th>들어온 돈</th><th>남긴 돈</th></tr></thead>
          <tbody>${[...series].reverse().map(s => `<tr class="${s.m === m ? 'cur' : ''}"><td>${+s.m.slice(5)}월</td><td class="num">${won(s.out)}</td><td class="num">${won(s.inc)}</td><td class="num ${s.inc - s.out < 0 ? 'warn' : ''}">${s.inc - s.out < 0 ? '−' : ''}${won(Math.abs(s.inc - s.out))}</td></tr>`).join('')}</tbody></table>
        </div>
      </div>
      <div class="stack">
        <div class="panel"><h2>분류별 <small>${monthLabel(m)}</small></h2>
          ${rows.length ? `<ul class="statcats">${rows.map(r => `<li><button type="button" data-catgo="${esc(r.k)}">
            <span class="cb-n">${esc(r.name)}</span><span class="cb-a num">${won(r.v)} <small>${Math.round(r.v / out * 100)}%</small></span>
            <span class="bar"><span style="width:${r.v / maxV * 100}%"></span></span>${delta(r.v, r.p)}</button></li>`).join('')}</ul>` : '<div class="empty">이 달에 쓴 내역이 없어요.</div>'}
        </div>
        ${out ? `<div class="panel"><h2>결제수단별</h2>
          <div class="bar stacked paybar">${['gj', 'eh', 'cash'].map(k => byPay[k] ? `<span class="seg-${k === 'cash' ? 'etc' : k}" style="width:${byPay[k] / out * 100}%"></span>` : '').join('')}</div>
          <ul class="paylist">${['gj', 'eh', 'cash'].map(k => `<li><span><i class="cdot c-${k === 'cash' ? 'etc' : k}"></i>${PAY[k]}</span><b class="num">${won(byPay[k])} <small>${Math.round(byPay[k] / out * 100)}%</small></b></li>`).join('')}</ul></div>
        <div class="panel"><h2>크게 쓴 내역</h2><div class="txlist flat">${big.map(t => `<button type="button" class="txrow" data-tx="${esc(t.id)}"><span class="tx-l"><b>${esc(txCat(t))}</b><small>${+t.date.slice(5, 7)}/${+t.date.slice(8)}${t.memo ? ' · ' + esc(t.memo) : ''}</small></span><span class="tx-a num">${won(t.amount)}</span></button>`).join('')}</div></div>` : ''}
      </div>
    </div>`;
}
$('#v-stats').addEventListener('click', e => {
  const c = e.target.closest('[data-catgo]');
  if (!c) return;
  UI.lf = {type: 'out', cat: c.dataset.catgo || 'none', pay: 'all', q: '', day: ''};
  $('#l-q').value = ''; renderLedger(); showTab('ledger'); window.scrollTo(0, 0);
});
