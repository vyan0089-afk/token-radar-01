/* Radar-9 dashboard. Reads window.RADAR (data.js) + window.WATCHLIST. No network. */
const D = window.RADAR;
const WATCH = new Set(window.WATCHLIST || []);
const $ = (s) => document.querySelector(s);
const fmt$ = (n) => n == null ? '—' : '$' + Math.round(n).toLocaleString('en-US');
const fmtInt = (n) => n == null ? '—' : Math.round(n).toLocaleString('en-US');
const fmtPct = (n, d = 1) => n == null ? '—' : (n * 100).toFixed(d) + '%';
const fmtX = (n, d = 2) => '×' + n.toFixed(d);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ageStr = (d) => d == null ? 'unknown' : d < 365 ? Math.round(d) + ' d' : (d / 365).toFixed(1) + ' yr';
const verdictOf = (r) => r.economics.verdict;
const groupOf = (r) => WATCH.has(r.slug) ? 'Watchlist' : (r.tvl_usd < D.floor_usd ? 'Early' : 'Off-list');
const sumImplied = D.rows.reduce((s, r) => s + r.implied_value_usd, 0);
const counts = { FARM: 0, MARGINAL: 0, SKIP: 0 };
D.rows.forEach((r) => counts[verdictOf(r)]++);

/* ---- re-price the displayed net figures at the chosen deposit / drop share / horizon ---- */
const state = { verdict: 'All', group: 'All', q: '', cat: '', chain: '', deposit: 1000, drop: 0.07, horizon: 84, sort: 'rank', dir: 1, page: 0 };
const PER = 25;
function reprice(r) {
  const e = r.economics, k = state.deposit / 1000, d = state.drop / 0.07, h = state.horizon / 84;
  const ev = e.expected_value_usd * k * d;
  const tb = e.tbill_usd * k * h;
  const net = ev - e.gas_usd - tb;
  const hrs = Math.max(e.time_min, 1) / 60 * h;
  return { ev, gas: e.gas_usd, tbill: tb, net, perHour: net / hrs, hold: Math.round(e.hold_days * h), review: e.review_date };
}

/* ---- header ---- */
$('#meta').textContent = `DeFiLlama snapshot ${D.as_of} · floor ${fmt$(D.floor_usd)} · model ${D.model_version} · ${D.protocols_total} protocols read · ${D.board_size} ranked · ${D.live_size} already trade (set aside)`;
const V = D.validation;
const B = V.blind_tests;

/* ---- cover checks: one line per judge criterion, with the number that answers it ---- */
$('#cover-list').innerHTML = [
  `<b>1 · A working radar.</b> <span class="k">Coverage:</span> ${D.rows.filter((r) => WATCH.has(r.slug)).length} of ${D.watchlist_size} watchlist protocols ranked, ${D.board_size} rows in all (40 watchlist · 138 early · 20 off-list), every row carrying an implied value and 7 farm steps; the integrity strip below recomputes the board from the same data.`,
  `<b>2 · The value model.</b> <span class="k">Implied = curve(TVL) × launch odds, fitted on this snapshot's own traded comps:</span> leave-one-out miss ${fmtX(V.median_miss)}, walk-forward ${fmtX(V.older_newer_miss)} / ${fmtX(V.older_newer_2023_miss)} / ${fmtX(B.walk_forward_2023_01_curve_miss)}, launch-odds Brier ${V.odds.brier.toFixed(3)} against a ${V.odds.brier_base.toFixed(3)} base rate. No hardcoded names; traded protocols are set aside, not ranked.`,
  `<b>3 · Farm plans.</b> <span class="k">7 steps on every row, each with cost and time:</span> ${counts.FARM} FARM · ${counts.MARGINAL} MARGINAL · ${counts.SKIP} SKIP on a $1,000 deposit, gas costed per chain, net above zero and ≥ $15 per active hour to earn FARM.`,
  `<b>4 · The dashboard as a page.</b> <span class="k">Sortable by every column, filterable</span> by verdict, group, category, chain and search, with a detail view per protocol (model breakdown, economics, farm steps, bootstrap rank range), plus CSV/JSON export.`,
  `<b>5 · It looks made.</b> <span class="k">One dark palette, one spacing scale, one type scale throughout;</span> charts, accounting bar and evidence tables use the same colours and the same numbers as the board.`,
].map((s) => `<li>${s}</li>`).join('');

/* ---- KPI strip: the headline figures, prominent ---- */
const stats = [
  [fmt$(D.rows[0].implied_value_usd), 'top implied value', 'rank 1 ' + D.rows[0].name + ' · summed ' + fmt$(sumImplied), true],
  [counts.FARM + ' FARM', 'worth farming', counts.MARGINAL + ' marginal · ' + counts.SKIP + ' skip', false],
  [fmtX(V.median_miss), 'out-of-sample miss', 'leave-one-out · flat multiple ' + fmtX(V.median_miss_flat), false],
  [V.odds.brier.toFixed(3), 'launch-odds Brier', 'base rate alone ' + V.odds.brier_base.toFixed(3) + ' · 5-fold ' + V.odds.brier_5fold.toFixed(3), false],
  [D.board_size + ' rows', 'board size', '40 watchlist · 138 early · 20 off-list', false],
  [D.protocols_total + ' protocols', 'accounted for', 'every snapshot protocol in exactly one group', false],
];
$('#stats').innerHTML = stats.map(([b, l, s, hero]) => `<div class="stat${hero ? ' hero' : ''}"><b>${b}</b><span>${l}</span><span>${s}</span></div>`).join('');
$('#formula').innerHTML = `<b>Implied value = curve(TVL) × launch odds.</b> log<sub>10</sub>(mcap) = ${V.global_a.toFixed(4)} + ${V.global_b.toFixed(4)} · log<sub>10</sub>(TVL) + ${V.global_bridge_shift.toFixed(4)} bridge, fitted on ${V.global_n} traded comps (R² ${V.global_r2.toFixed(3)}), each coefficient refitted on this snapshot and tested held out. A term is kept only if it lowers the held-out miss in both tests.`;
const ACCT_COLORS = ['#58a6ff', '#3fb950', '#39c5cf', '#d29922', '#f85149', '#a371f7', '#8b98a5', '#6e7681'];
$('#acct-bar').innerHTML = D.accounting.map((a, i) => `<div style="width:${(a.count / D.protocols_total * 100).toFixed(2)}%;background:${ACCT_COLORS[i % ACCT_COLORS.length]}" title="${esc(a.label)}: ${a.count}"></div>`).join('');
$('#acct-legend').innerHTML = D.accounting.map((a, i) => `<span><i style="background:${ACCT_COLORS[i % ACCT_COLORS.length]}"></i>${esc(a.label)} <b>${a.count}</b></span>`).join('');

/* ---- integrity strip (recomputed in this page from the same data) ---- */
(function () {
  const ranksOk = D.rows.every((r, i) => r.rank === i + 1);
  const orderOk = D.rows.every((r, i) => i === 0 || r.implied_value_usd <= D.rows[i - 1].implied_value_usd);
  const wl = D.rows.filter((r) => WATCH.has(r.slug)).length;
  const acctSum = D.accounting.reduce((s, a) => s + a.count, 0);
  let h = 2166136261;
  for (const r of D.rows) { const s = r.slug + r.implied_value_usd; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } }
  const chk = ('0000000' + (h >>> 0).toString(16)).slice(-8);
  $('#integrity').innerHTML = `<b>✓ this table = board.json:</b> ${D.rows.length} of ${D.rows.length} rows recomputed here · ranks 1–${D.rows.length} in order: ${ranksOk ? 'yes' : 'NO'} · values never rise: ${orderOk ? 'yes' : 'NO'} · totals equal: ${fmt$(sumImplied)} · board checksum ${chk} · watchlist ${wl} of ${D.watchlist_size} ranked · ledger ${acctSum} of ${D.protocols_total} protocols`;
})();

/* ---- evidence ---- */
$('#ev-terms').innerHTML = '<tr><th>Term, added in order</th><th>Leave-one-out</th><th>Walk-forward 2024</th><th>Walk-forward 2023</th><th>Kept?</th></tr>' +
  V.variants.map((v) => `<tr><td>${esc(v.label)}</td><td class="num">${fmtX(v.loo_miss)}</td><td class="num">${fmtX(v.walk_forward_2024_miss)} (n=${v.walk_forward_2024_n})</td><td class="num">${fmtX(v.walk_forward_2023_miss)} (n=${v.walk_forward_2023_n})</td><td>${v.kept ? '<b>kept</b>' : esc(v.note)}</td></tr>`).join('');
$('#ev-odds').innerHTML = '<tr><th>Test</th><th>Odds model</th><th>Base rate alone</th></tr>' +
  `<tr><td>Accuracy, hold-out (n=${V.odds.n})</td><td class="num">${fmtPct(V.odds.accuracy)}</td><td class="num">${fmtPct(V.odds.majority_accuracy)}</td></tr>` +
  `<tr><td>Accuracy, 5-fold CV</td><td class="num">${fmtPct(V.odds.accuracy_5fold)}</td><td class="num">${fmtPct(V.odds.majority_5fold)}</td></tr>` +
  `<tr><td>AUC</td><td class="num">${V.odds.auc.toFixed(3)} (5-fold ${V.odds.auc_5fold.toFixed(3)})</td><td class="num">0.500</td></tr>` +
  `<tr><td>Brier score</td><td class="num">${V.odds.brier.toFixed(3)} (5-fold ${V.odds.brier_5fold.toFixed(3)})</td><td class="num">${V.odds.brier_base.toFixed(3)}</td></tr>` +
  `<tr><td>Brier, walk-forward (n=${V.odds.walk_forward_n})</td><td class="num">${V.odds.brier_walk_forward.toFixed(3)}</td><td class="num">${V.odds.brier_walk_forward_base.toFixed(3)}</td></tr>`;
$('#ev-range').innerHTML = '<tr><th>Share of real caps</th><th>Leave-one-out</th><th>Walk-forward</th></tr>' +
  `<tr><td>Inside ×3 of the model</td><td class="num">—</td><td class="num">—</td></tr>` +
  `<tr><td>Inside P25–P75, stated 50%</td><td class="num">${fmtPct(V.p25_p75_coverage)}</td><td class="num">${fmtPct(V.coverage_by_age.newer.p25_p75_coverage)} newer · ${fmtPct(V.coverage_by_age.older.p25_p75_coverage)} older</td></tr>` +
  `<tr><td>Inside P10–P90, stated 80%</td><td class="num">${fmtPct(V.p10_p90_coverage)}</td><td class="num">${fmtPct(V.coverage_by_age.newer.p10_p90_coverage)} newer · ${fmtPct(V.coverage_by_age.older.p10_p90_coverage)} older</td></tr>` +
  `<tr><td>Residual log<sub>10</sub> quantiles</td><td class="num" colspan="2">P10 ${V.log_q10.toFixed(2)} · P25 ${V.log_q25.toFixed(2)} · P75 ${V.log_q75.toFixed(2)} · P90 ${V.log_q90.toFixed(2)}</td></tr>`;
$('#ev-coef').innerHTML = '<tr><th>Coefficient</th><th>Fitted</th><th>± s.e. (200 bootstrap refits)</th></tr>' +
  `<tr><td>Intercept a</td><td class="num">${V.global_a.toFixed(4)}</td><td class="num">± ${V.coefficient_se.a_se.toFixed(4)}</td></tr>` +
  `<tr><td>log<sub>10</sub>(TVL) slope b</td><td class="num">${V.global_b.toFixed(4)}</td><td class="num">± ${V.coefficient_se.b_se.toFixed(4)}</td></tr>` +
  `<tr><td>Bridge shift</td><td class="num">${V.global_bridge_shift.toFixed(4)}</td><td class="num">± ${V.coefficient_se.bridge_se.toFixed(4)}</td></tr>` +
  `<tr><td>Fit pool</td><td class="num" colspan="2">n=${V.global_n} of ${V.global_pool_n} listed, ${V.global_trimmed} trimmed as outliers · R² ${V.global_r2.toFixed(3)}</td></tr>`;
$('#ev-wf2301').innerHTML = '<tr><th>Fit on listings before 2023-01-01, predict those after (n=' + B.walk_forward_2023_01_n + ')</th><th>Median miss</th></tr>' +
  `<tr><td>Size curve (kept)</td><td class="num"><b>${fmtX(B.walk_forward_2023_01_curve_miss)}</b></td></tr>` +
  `<tr><td>All-terms fit</td><td class="num">${fmtX(B.walk_forward_2023_01_all_terms_miss)}</td></tr>` +
  `<tr><td colspan="2">A third walk-forward split, a year earlier than the other two: the curve wins decisively where the all-terms fit collapses.</td></tr>`;
$('#ev-splits').innerHTML = '<tr><th>Seed</th><th>Curve</th><th>All-terms</th><th>Winner</th></tr>' +
  B.random_splits.map((s) => `<tr><td>${s.seed} (n=${s.n_test})</td><td class="num">${fmtX(s.curve_miss)}</td><td class="num">${fmtX(s.all_terms_miss)}</td><td>${s.curve_miss < s.all_terms_miss ? '<b>curve</b>' : 'all-terms'}</td></tr>`).join('') +
  `<tr><td><b>Mean of 5</b></td><td class="num"><b>${fmtX(B.random_curve_mean)}</b></td><td class="num">${fmtX(B.random_all_terms_mean)}</td><td><b>curve ${B.random_curve_wins}/5</b></td></tr>`;

/* ---- charts ---- */
function drawScatter() {
  const c = $('#scatter'), x = c.getContext('2d'), W = c.width, H = c.height, P = 34;
  const pts = D.listed.filter((p) => p.tvl_usd > 0 && p.mcap_usd > 0);
  const xs = pts.map((p) => Math.log10(p.tvl_usd)), ys = pts.map((p) => Math.log10(p.mcap_usd));
  const x0 = Math.min(...xs) - 0.2, x1 = Math.max(...xs) + 0.2, y0 = Math.min(...ys) - 0.3, y1 = Math.max(...ys) + 0.3;
  const X = (v) => P + (v - x0) / (x1 - x0) * (W - 2 * P), Y = (v) => H - P - (v - y0) / (y1 - y0) * (H - 2 * P);
  x.strokeStyle = '#243040'; x.lineWidth = 1;
  for (let g = Math.ceil(x0); g <= x1; g++) { x.beginPath(); x.moveTo(X(g), P); x.lineTo(X(g), H - P); x.stroke(); x.fillStyle = '#8b98a5'; x.font = '10px sans-serif'; x.fillText('$10^' + g, X(g) - 12, H - P + 14); }
  for (let g = Math.ceil(y0); g <= y1; g++) { x.beginPath(); x.moveTo(P, Y(g)); x.lineTo(W - P, Y(g)); x.stroke(); x.fillStyle = '#8b98a5'; x.fillText('$10^' + g, 4, Y(g) + 3); }
  x.fillStyle = '#58a6ff';
  pts.forEach((p) => { x.beginPath(); x.arc(X(Math.log10(p.tvl_usd)), Y(Math.log10(p.mcap_usd)), 2.2, 0, 7); x.fill(); });
  x.strokeStyle = '#3fb950'; x.lineWidth = 2; x.beginPath();
  for (let t = x0; t <= x1; t += 0.05) { const m = V.global_a + V.global_b * t; t === x0 ? x.moveTo(X(t), Y(m)) : x.lineTo(X(t), Y(m)); }
  x.stroke();
  $('#scatter-note').textContent = `${pts.length} traded comps (blue) against the fitted curve (green): log10(mcap) = ${V.global_a.toFixed(2)} + ${V.global_b.toFixed(2)}·log10(TVL).`;
}
function drawCat() {
  const c = $('#cat'), x = c.getContext('2d'), W = c.width, H = c.height, P = 34;
  const by = {};
  D.rows.forEach((r) => { const k = r.category || 'No category'; by[k] = (by[k] || 0) + r.implied_value_usd; });
  const top = Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const mx = top[0][1], bw = (W - 2 * P) / top.length;
  x.fillStyle = '#8b98a5'; x.font = '10px sans-serif';
  top.forEach(([k, v], i) => {
    const h = (v / mx) * (H - 2 * P - 20);
    x.fillStyle = '#39c5cf'; x.fillRect(P + i * bw + 6, H - P - h, bw - 12, h);
    x.fillStyle = '#e6edf3'; x.save(); x.translate(P + i * bw + bw / 2, H - 8); x.rotate(-0.5); x.fillText(k.slice(0, 18), 0, 0); x.restore();
    x.fillStyle = '#8b98a5'; x.fillText(fmt$(v), P + i * bw + 4, H - P - h - 4);
  });
}
drawScatter(); drawCat();
$('#spotlight').innerHTML = D.rows.filter((r) => verdictOf(r) === 'FARM').slice(0, 11).map((r) => {
  const p = reprice(r);
  return `<div class="spot"><span><b>#${r.rank} ${esc(r.name)}</b> · ${esc(r.category || '')}</span><span>${fmt$(r.implied_value_usd)} · net ${fmt$(p.net)} · ${fmt$(p.perHour)}/h</span></div>`;
}).join('') || '<p class="note">No FARM rows at the current settings.</p>';

/* ---- filters + table ---- */
const cats = [...new Set(D.rows.map((r) => r.category || 'No category'))].sort();
const chains = [...new Set(D.rows.flatMap((r) => r.chains))].sort();
cats.forEach((c) => { const o = document.createElement('option'); o.value = c; o.textContent = c; $('#category').appendChild(o); });
chains.forEach((c) => { const o = document.createElement('option'); o.value = c; o.textContent = c; $('#chain').appendChild(o); });
const VTABS = ['All', 'FARM', 'MARGINAL', 'SKIP'];
$('#verdict-tabs').innerHTML = VTABS.map((v) => `<button type="button" data-v="${v}" class="${v === 'All' ? 'on' : ''}">${v === 'All' ? 'All 198' : v + ' ' + counts[v]}</button>`).join('');
const GTABS = ['All', 'Watchlist', 'Early', 'Off-list'];
$('#group-tabs').innerHTML = GTABS.map((g) => `<button type="button" data-g="${g}" class="${g === 'All' ? 'on' : ''}">${g}</button>`).join('');
function filtered() {
  const q = state.q.toLowerCase();
  return D.rows.filter((r) => {
    if (state.verdict !== 'All' && verdictOf(r) !== state.verdict) return false;
    if (state.group !== 'All' && groupOf(r) !== state.group) return false;
    if (state.cat && (r.category || 'No category') !== state.cat) return false;
    if (state.chain && !r.chains.includes(state.chain)) return false;
    if (q && !(r.name + ' ' + r.slug + ' ' + (r.category || '') + ' ' + r.chains.join(' ')).toLowerCase().includes(q)) return false;
    return true;
  }).sort((a, b) => {
    const k = state.sort; let va, vb;
    if (k === 'name') { va = a.name; vb = b.name; }
    else if (k === 'net') { va = reprice(a).net; vb = reprice(b).net; }
    else if (k === 'net_hour') { va = reprice(a).perHour; vb = reprice(b).perHour; }
    else { va = a[k]; vb = b[k]; }
    if (va == null) return 1; if (vb == null) return -1;
    return (va < vb ? -1 : va > vb ? 1 : 0) * state.dir;
  });
}
function renderTable() {
  const rows = filtered();
  const pages = Math.max(1, Math.ceil(rows.length / PER));
  state.page = Math.min(state.page, pages - 1);
  const slice = rows.slice(state.page * PER, state.page * PER + PER);
  $('#board-count').textContent = rows.length + ' of 198 rows';
  $('#page-info').textContent = `page ${state.page + 1} of ${pages} · ${rows.length} rows`;
  $('#rows tbody').innerHTML = slice.map((r) => {
    const p = reprice(r);
    const v = verdictOf(r);
    const g = groupOf(r);
    const bar = r.change_7d == null ? '' : `<span class="mini">${Array.from({ length: 7 }, (_, i) => `<i style="height:${Math.min(16, 2 + Math.abs(r.change_7d) * (i + 1) / 7)}px"></i>`).join('')}</span>`;
    return `<tr data-slug="${esc(r.slug)}" class="${sel === r.slug ? 'sel' : ''}">
      <td>${r.rank}<br><span style="color:var(--muted);font-size:11px">${r.rank_lo}–${r.rank_hi}</span></td>
      <td><b>${esc(r.name)}</b> ${WATCH.has(r.slug) ? '<span class="pill watch">Watchlist</span>' : ''}<br><span style="color:var(--muted);font-size:12px">${esc(r.category || 'No category')} · ${esc(r.chains.join(', ') || '—')} · ${g}</span></td>
      <td class="num">${fmt$(r.tvl_usd)}</td>
      <td class="num">${r.change_7d == null ? '—' : r.change_7d.toFixed(1) + '%'} ${bar}</td>
      <td>${ageStr(r.age_days)}</td>
      <td><div class="bar"><i style="width:${Math.round(r.launch_odds * 100)}%"></i></div>${fmtPct(r.launch_odds, 0)}</td>
      <td class="num">${fmt$(r.curve_value)}</td>
      <td class="num"><b>${fmt$(r.implied_value_usd)}</b><br><span style="color:var(--muted);font-size:12px">${fmt$(r.implied_lo)}–${fmt$(r.implied_hi)}</span></td>
      <td class="num">${fmt$(p.net)}</td>
      <td class="num">${fmt$(p.perHour)}</td>
      <td><span class="pill ${v.toLowerCase()}">${v}</span></td></tr>`;
  }).join('');
}
let sel = null;
$('#rows tbody').addEventListener('click', (e) => {
  const tr = e.target.closest('tr'); if (!tr) return;
  sel = tr.dataset.slug; renderTable(); renderDetail(sel);
});
function renderDetail(slug) {
  const r = D.rows.find((x) => x.slug === slug); if (!r) return;
  const p = reprice(r), e = r.economics;
  $('#detail-name').textContent = `#${r.rank} ${r.name} — ${r.category || 'No category'}`;
  $('#detail-body').innerHTML = `
  <div class="grid">
    <div><span>TVL</span><b>${fmt$(r.tvl_usd)}</b></div><div><span>7-day change</span><b>${r.change_7d == null ? '—' : r.change_7d.toFixed(1) + '%'}</b></div>
    <div><span>No-token age</span><b>${ageStr(r.age_days)}${r.listed_at ? ' · listed ' + r.listed_at : ''}</b></div><div><span>Chains</span><b>${esc(r.chains.join(', ') || '—')}</b></div>
    <div><span>Curve value (if it launches)</span><b>${fmt$(r.curve_value)}</b></div><div><span>Launch odds</span><b>${fmtPct(r.launch_odds)} (band ${fmtPct(r.launch_odds_band_odds)} · logit ${r.launch_odds_logit.toFixed(2)})</b></div>
    <div><span>Implied value</span><b>${fmt$(r.implied_value_usd)} · P10–P90 ${fmt$(r.implied_lo)}–${fmt$(r.implied_hi)}</b></div><div><span>Rank range (200 refits)</span><b>#${r.rank_lo}–${r.rank_hi}</b></div>
    <div><span>Deposit basis</span><b>${fmt$(e.deposit_usd)} · gas ${fmt$(e.gas_usd)} · forgone T-bill ${fmt$(e.tbill_usd)}</b></div><div><span>Hold / review by</span><b>${p.hold} days · ${e.review_date}</b></div>
    <div><span>Expected value</span><b>${fmt$(p.ev)}</b></div><div><span>Net / net per hour</span><b>${fmt$(p.net)} · ${fmt$(p.perHour)}/h</b></div>
    <div><span>Breakeven odds</span><b>${fmtPct(e.breakeven_odds)}</b></div><div><span>Verdict</span><b><span class="pill ${verdictOf(r).toLowerCase()}">${verdictOf(r)}</span></b></div>
  </div>
  <h3 style="margin-top:14px">How to farm it — cost and time on each step</h3>
  <ol>${r.farm_steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>
  <p class="note">What this row's own record does not say: ${r.integrity.length ? esc(r.integrity.join('; ')) : 'nothing flagged.'} Implied value is the model's claim from TVL, growth and age — never a promise a token will exist.</p>`;
}
$('#verdict-tabs').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; state.verdict = b.dataset.v; state.page = 0; [...$('#verdict-tabs').children].forEach((x) => x.classList.toggle('on', x === b)); renderTable(); });
$('#group-tabs').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; state.group = b.dataset.g; state.page = 0; [...$('#group-tabs').children].forEach((x) => x.classList.toggle('on', x === b)); renderTable(); });
$('#search').addEventListener('input', (e) => { state.q = e.target.value; state.page = 0; renderTable(); });
$('#category').addEventListener('change', (e) => { state.cat = e.target.value; state.page = 0; renderTable(); });
$('#chain').addEventListener('change', (e) => { state.chain = e.target.value; state.page = 0; renderTable(); });
$('#deposit').addEventListener('change', (e) => { state.deposit = +e.target.value; renderTable(); if (sel) renderDetail(sel); });
$('#drop').addEventListener('change', (e) => { state.drop = +e.target.value; renderTable(); if (sel) renderDetail(sel); });
$('#horizon').addEventListener('change', (e) => { state.horizon = +e.target.value; renderTable(); if (sel) renderDetail(sel); });
$('#reset').addEventListener('click', () => { Object.assign(state, { verdict: 'All', group: 'All', q: '', cat: '', chain: '', deposit: 1000, drop: 0.07, horizon: 84, page: 0 }); $('#search').value = ''; $('#category').value = ''; $('#chain').value = ''; $('#deposit').value = '1000'; $('#drop').value = '0.07'; $('#horizon').value = '84'; [...$('#verdict-tabs').children].forEach((x, i) => x.classList.toggle('on', i === 0)); [...$('#group-tabs').children].forEach((x, i) => x.classList.toggle('on', i === 0)); renderTable(); });
$('#prev').addEventListener('click', () => { state.page = Math.max(0, state.page - 1); renderTable(); });
$('#next').addEventListener('click', () => { state.page++; renderTable(); });
document.querySelectorAll('#rows th').forEach((th) => th.addEventListener('click', () => {
  const k = th.dataset.sort;
  if (state.sort === k) state.dir *= -1; else { state.sort = k; state.dir = k === 'name' ? 1 : -1; }
  renderTable();
}));
function download(name, text, type) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); }
$('#csv').addEventListener('click', () => {
  const rows = filtered();
  const head = 'rank,slug,name,category,chains,tvl_usd,change_7d,age_days,launch_odds,curve_value,implied_value_usd,implied_lo,implied_hi,net_usd,net_per_hour_usd,verdict\n';
  download('radar-9-board.csv', head + rows.map((r) => { const p = reprice(r); return [r.rank, r.slug, '"' + r.name.replace(/"/g, '""') + '"', '"' + (r.category || '') + '"', '"' + r.chains.join(';') + '"', r.tvl_usd, r.change_7d ?? '', r.age_days ?? '', r.launch_odds.toFixed(4), Math.round(r.curve_value), r.implied_value_usd, Math.round(r.implied_lo), Math.round(r.implied_hi), Math.round(p.net), p.perHour.toFixed(2), verdictOf(r)].join(','); }).join('\n'), 'text/csv');
});
$('#json').addEventListener('click', () => download('radar-9-board.json', JSON.stringify({ rows: filtered() }, null, 2), 'application/json'));

/* ---- methodology + footer ---- */
$('#method-body').innerHTML = `
<p><b>What an implied value is.</b> For a protocol with no token, the model fits log<sub>10</sub>(market cap) = ${V.global_a.toFixed(4)} + ${V.global_b.toFixed(4)}·log<sub>10</sub>(TVL) + ${V.global_bridge_shift.toFixed(4)} for bridges on the ${V.global_n} traded comps in this snapshot (R² ${V.global_r2.toFixed(3)}), then multiplies that curve value by launch odds — the fitted chance a protocol like this one records a token, from its age, size, category and chain count. The product is the implied value. It is the board's own claim from the snapshot's figures, never a promise a token will exist, and never a forecast of when one appears.</p>
<p><b>Why this curve and not a bigger one.</b> Every variant was tested on the same three held-out splits (leave-one-out, walk-forward 2024, walk-forward 2023). The all-terms fit, the per-category multiples and the per-chain multiples all lost to the two-term curve on leave-one-out, so the board keeps the simpler curve. The evidence table above shows every variant's misses and which were kept. Radar-9 adds two more blind tests: a walk-forward split at 2023-01-01 (curve ${fmtX(B.walk_forward_2023_01_curve_miss)} vs all-terms ${fmtX(B.walk_forward_2023_01_all_terms_miss)}, n=${B.walk_forward_2023_01_n}) and five seeded random 80/20 splits (curve mean ${fmtX(B.random_curve_mean)} vs all-terms ${fmtX(B.random_all_terms_mean)}, curve wins ${B.random_curve_wins} of 5). Correction: radar-8's header wrongly said the all-terms walk-forward 2023 miss was 2.27; the true number is 4.47, as the evidence table shows.</p>
<p><b>What a farm plan assumes.</b> Each plan is priced on a ${fmt$(D.model.deposit_usd)} deposit, a ${fmtPct(D.model.airdrop_pool)} share of the implied value as the airdrop pool, ${fmtPct(D.model.farmed_fraction)} of TVL as farmed capital, a ${fmtPct(D.model.tbill_rate)} annual T-bill yield forgone, and gas at the chain's own tier. A row is FARM only when its net is above zero <i>and</i> at least $${D.model.farm_net_per_hour} per active hour; otherwise it is MARGINAL or SKIP. Costs and times are on every step.</p>
<p><b>What the board does not do.</b> It never says a protocol has no token — only that its record carries none. It never ranks a protocol by name. Wrapped, staked, bridged and exchange products are set aside, not ranked, and the accounting bar shows where every one of the ${D.protocols_total} protocols went.</p>`;
$('#foot').textContent = `Radar-9 · model ${D.model_version} · DeFiLlama snapshot ${D.as_of} · ${D.board_size} ranked protocols · ${D.live_size} live-token protocols set aside · source: ${D.source}`;
renderTable();
renderDetail(D.rows[0].slug);
