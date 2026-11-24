// Token Radar radar-7 dashboard. Reads window.RADAR (written beside dashboard/ by main.ts),
// renders the ranked board, filters, per-protocol detail and the model panel. No network, no
// framework: every number shown comes from data.js, and the detail view recomputes the row's
// implied value from the fitted curve so the arithmetic is checkable on the page.
(function () {
  'use strict';
  var D = window.RADAR;
  var app = document.getElementById('app');
  if (!D || !app) { if (app) app.innerHTML = '<p class="card">No radar data found. Run main.ts first so data.js sits beside dashboard/.</p>'; return; }
  var V = D.validation, M = D.model, VT = V.value_terms;

  /* ---------- formatting ---------- */
  function usd(n) { if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    var a = Math.abs(n); if (a >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (a >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (a >= 1e3) return '$' + Math.round(n / 1e3) + 'K'; return '$' + Math.round(n); }
  function usd2(n) { if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n < 0 ? '-$' : '$') + Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 2 }); }
  function pct(n, d) { if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(d === undefined ? 1 : d) + '%'; }
  function odds(n) { return (n * 100).toFixed(1) + '%'; }
  function age(d) { if (d === null || d === undefined) return 'unknown';
    if (d >= 365) return (d / 365).toFixed(1) + 'y'; return d + 'd'; }
  function esc(s) { return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function num(n, d) { return n === null || n === undefined || !isFinite(n) ? 'n/a' : n.toFixed(d === undefined ? 4 : d); }
  function isBridge(r) { return (r.category || '').toLowerCase().indexOf('bridge') >= 0; }
  function verdictClass(v) { return v === 'FARM' ? 'vFARM' : v === 'THIN' ? 'vTHIN' : 'vSKIP'; }

  /* ---------- state + hash routing ---------- */
  // #/ board · #/live live tokens · #/model the model · #/acct accounting
  // #/p/<slug> protocol detail · #/f/k=v&k=v filtered board
  var state = { tab: 'board', sort: 'implied', dir: -1, sel: null, page: 1,
    f: { q: '', chain: 'all', cat: 'all', verdict: 'all', min: '', max: '', pre: true } };
  var PAGE_SIZE = 25;
  function parseHash() {
    state.page = 1;
    var h = location.hash || '#/';
    if (h.indexOf('#/p/') === 0) { state.tab = 'detail'; state.sel = decodeURIComponent(h.slice(4)); return; }
    if (h.indexOf('#/f/') === 0) {
      state.tab = 'board';
      h.slice(4).split('&').forEach(function (kv) { var p = kv.split('=');
        if (p.length < 2) return; var k = p[0], v = decodeURIComponent(p[1]);
        if (k === 'q') state.f.q = v; if (k === 'chain') state.f.chain = v;
        if (k === 'cat') state.f.cat = v; if (k === 'verdict') state.f.verdict = v;
        if (k === 'min') state.f.min = v; if (k === 'max') state.f.max = v;
        if (k === 'pre') state.f.pre = v !== '0';
        if (k === 'page') state.page = Math.max(1, parseInt(v, 10) || 1); });
      return;
    }
    state.tab = h === '#/live' ? 'live' : h === '#/model' ? 'model' : h === '#/acct' ? 'acct' : 'board';
    state.sel = null;
  }
  function filterHash() {
    var f = state.f, parts = [];
    if (f.q) parts.push('q=' + encodeURIComponent(f.q));
    if (f.chain !== 'all') parts.push('chain=' + encodeURIComponent(f.chain));
    if (f.cat !== 'all') parts.push('cat=' + encodeURIComponent(f.cat));
    if (f.verdict !== 'all') parts.push('verdict=' + f.verdict);
    if (f.min !== '') parts.push('min=' + f.min);
    if (f.max !== '') parts.push('max=' + f.max);
    if (!f.pre) parts.push('pre=0');
    if (state.page > 1) parts.push('page=' + state.page);
    return '#/f/' + parts.join('&');
  }

  /* ---------- data helpers ---------- */
  var chains = [], cats = [];
  D.rows.forEach(function (r) { r.chains.forEach(function (c) { if (chains.indexOf(c) < 0) chains.push(c); });
    if (r.category && cats.indexOf(r.category) < 0) cats.push(r.category); });
  chains.sort(); cats.sort();
  function rowBySlug(slug) { for (var i = 0; i < D.rows.length; i++) if (D.rows[i].slug === slug) return D.rows[i]; return null; }
  function sortVal(r, key) {
    switch (key) {
      case 'rank': return r.rank; case 'implied': return r.implied_value_usd;
      case 'tvl': return r.tvl_usd; case 'growth': return r.change_7d === null ? -9999 : r.change_7d;
      case 'age': return r.age_days === null ? -1 : r.age_days; case 'odds': return r.launch_odds;
      case 'band': return r.rank_hi - r.rank_lo; case 'verdict': return r.economics.verdict; default: return r.rank;
    }
  }
  function filteredRows() {
    var f = state.f, out = [];
    D.rows.forEach(function (r) {
      if (f.q && (r.name + ' ' + r.slug + ' ' + (r.category || '')).toLowerCase().indexOf(f.q.toLowerCase()) < 0) return;
      if (f.chain !== 'all' && r.chains.indexOf(f.chain) < 0) return;
      if (f.cat !== 'all' && r.category !== f.cat) return;
      if (f.verdict !== 'all' && r.economics.verdict !== f.verdict) return;
      if (f.min !== '' && r.tvl_usd < +f.min) return;
      if (f.max !== '' && r.tvl_usd > +f.max) return;
      out.push(r);
    });
    if (!f.pre) D.live.forEach(function (l) {
      if (f.q && (l.name + ' ' + l.slug).toLowerCase().indexOf(f.q.toLowerCase()) < 0) return;
      if (f.chain !== 'all' && l.chains.indexOf(f.chain) < 0) return;
      if (f.cat !== 'all' && l.category !== f.cat) return;
      out.push({ live: true, slug: l.slug, name: l.name, category: l.category, chains: l.chains,
        tvl_usd: l.tvl_usd, change_7d: l.change_7d, mcap_usd: l.mcap_usd, age_days: null,
        implied_value_usd: l.mcap_usd || 0, launch_odds: null, rank: null, rank_lo: null, rank_hi: null,
        economics: null, integrity: [] });
    });
    var k = state.sort, d = state.dir;
    out.sort(function (a, b) { var x = sortVal(a, k), y = sortVal(b, k);
      return x < y ? -d : x > y ? d : (a.rank || 9999) - (b.rank || 9999); });
    return out;
  }
  function shortChains(r) {
    if (r.chains.length <= 3) return esc(r.chains.join(', '));
    return esc(r.chains.slice(0, 3).join(', ')) + ' +' + (r.chains.length - 3) + ' more';
  }
  function comparables(r) {
    var lt = Math.log10(Math.max(1, r.tvl_usd));
    return D.listed.map(function (l) { return { l: l, d: Math.abs(Math.log10(Math.max(1, l.tvl_usd)) - lt) }; })
      .sort(function (a, b) { return a.d - b.d; }).slice(0, 5).map(function (x) { return x.l; });
  }

  /* ---------- export (client-side, from the data already on the page) ---------- */
  function csvEsc(v) {
    if (v === null || v === undefined) return '';
    var s = String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function exportFields(r) {
    var e = r.economics;
    return [r.rank === null ? '' : r.rank, r.slug, r.name, r.category || '',
      r.chains.join('|'), r.tvl_usd, r.change_7d === null ? '' : r.change_7d,
      r.age_days === null ? '' : r.age_days,
      r.launch_odds === null ? '' : r.launch_odds.toFixed(4),
      Math.round(r.curve_value || 0), r.implied_value_usd,
      r.implied_lo === null ? '' : r.implied_lo, r.implied_hi === null ? '' : r.implied_hi,
      r.rank_lo === null ? '' : r.rank_lo, r.rank_hi === null ? '' : r.rank_hi,
      e ? e.verdict : 'traded', e ? Math.round(e.net_usd * 100) / 100 : '',
      e ? Math.round(e.expected_value_usd * 100) / 100 : '', e ? Math.round(e.gas_usd * 100) / 100 : '',
      (r.integrity || []).join('|')];
  }
  var CSV_HEAD = ['rank', 'slug', 'name', 'category', 'chains', 'tvl_usd', 'change_7d_pct',
    'age_days', 'launch_odds', 'curve_value_usd', 'implied_value_usd', 'implied_lo_usd',
    'implied_hi_usd', 'rank_lo', 'rank_hi', 'verdict', 'net_usd', 'expected_airdrop_usd',
    'gas_usd', 'integrity_flags'];
  function downloadFile(name, text, mime) {
    var blob = new Blob([text], { type: mime });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 400);
  }
  function exportCSV() {
    var rows = filteredRows().filter(function (r) { return !r.live || true; });
    var lines = [CSV_HEAD.join(',')];
    rows.forEach(function (r) { lines.push(exportFields(r).map(csvEsc).join(',')); });
    downloadFile('token-radar-board.csv', lines.join('\n'), 'text/csv;charset=utf-8');
  }
  function exportJSON() {
    var rows = filteredRows();
    var out = rows.map(function (r) {
      var o = {}; CSV_HEAD.forEach(function (k, i) { o[k] = exportFields(r)[i]; }); return o;
    });
    downloadFile('token-radar-board.json', JSON.stringify({ as_of: D.as_of, model: D.model_version,
      rows_shown: rows.length, rows: out }, null, 1), 'application/json;charset=utf-8');
  }

  /* ---------- header / footer ---------- */
  var farmN = D.rows.filter(function (r) { return r.economics.verdict === 'FARM'; }).length;
  var thinN = D.rows.filter(function (r) { return r.economics.verdict === 'THIN'; }).length;
  document.getElementById('topmeta').innerHTML =
    '<span class="pill">snapshot <b>' + esc(D.as_of) + '</b></span>' +
    '<span class="pill"><b>' + D.protocols_total + '</b> protocols</span>' +
    '<span class="pill">board <b>' + D.board_size + '</b> · watchlist <b>' + D.watchlist_size + '</b></span>' +
    '<span class="pill"><b class="vF">' + farmN + ' FARM</b> · ' + thinN + ' THIN · ' + (D.board_size - farmN - thinN) + ' SKIP</span>';
  document.getElementById('foot').innerHTML =
    'Source: ' + esc(D.source) + '. Floor $' + D.floor_usd.toLocaleString('en-US') +
    '. Model ' + esc(D.model_version) + ': implied = curve × launch odds; no hand multiplier. ' +
    'Farm economics on a $' + M.deposit_usd.toLocaleString('en-US') + ' deposit; airdrop pool ' +
    (M.airdrop_pool * 100) + '% of implied value, farmed share ' + (M.farmed_fraction * 100) +
    '% of TVL, T-bill ' + (M.tbill_rate * 100) + '%/yr. Bootstrap bands: ' + D.bootstrap_draws +
    ' refits, fixed seed. Every number on this page is in data.js — no network.';

  /* ---------- shared bits ---------- */
  function flagsHtml(flags, max) {
    if (!flags || !flags.length) return '<span class="flag ok">clean record</span>';
    var shown = max ? flags.slice(0, max) : flags;
    var h = shown.map(function (f) { return '<span class="flag">' + esc(f) + '</span>'; }).join('');
    if (max && flags.length > max) h += '<span class="flag">+' + (flags.length - max) + ' more</span>';
    return h;
  }
  function tabsHtml() {
    var t = state.tab;
    return '<div class="tabs" role="tablist">' +
      '<a class="tab' + (t === 'board' || t === 'detail' ? ' on' : '') + '" href="#/">Board</a>' +
      '<a class="tab' + (t === 'live' ? ' on' : '') + '" href="#/live">Live tokens</a>' +
      '<a class="tab' + (t === 'model' ? ' on' : '') + '" href="#/model">Model</a>' +
      '<a class="tab' + (t === 'acct' ? ' on' : '') + '" href="#/acct">Accounting</a></div>';
  }
  function modelStrip() {
    return '<div class="card"><h2 style="margin-top:0">The model, in one line</h2>' +
      '<div class="eq">log<sub>10</sub>(mcap) = <b>' + num(V.global_a) + '</b> + <b>' + num(V.global_b) +
      '</b> · log<sub>10</sub>(TVL) + <b>' + num(V.global_bridge_shift) + '</b> bridge &nbsp;·&nbsp; R² ' +
      num(V.global_r2, 4) + ' · n=' + V.global_n + ' (pool ' + V.global_pool_n + ', trimmed ' + V.global_trimmed +
      ') &nbsp;·&nbsp; implied = curve × launch odds</div>' +
      '<p class="small muted">Held-out, median miss: <b>LOO ×' + num(V.median_miss, 2) + '</b> · older→newer 2024 ×' +
      num(V.older_newer_miss, 2) + ' (n=' + V.older_newer_n + ') · 2023 ×' + num(V.older_newer_2023_miss, 2) +
      ' (n=' + V.older_newer_2023_n + ') · flat baseline ×' + num(V.median_miss_flat, 2) +
      '. Launch odds: ' + pct(V.odds.accuracy * 100, 1) + ' hold-out vs ' + pct(V.odds.majority_accuracy * 100, 1) +
      ' majority (AUC ' + num(V.odds.auc, 3) + '); 5-fold ' + pct(V.odds.accuracy_5fold * 100, 1) +
      ' (AUC ' + num(V.odds.auc_5fold, 3) + '). ' +
      '<a href="#/model">Full model panel →</a></p></div>';
  }

  /* ---------- board ---------- */
  function controlsHtml() {
    var f = state.f;
    function opts(list, cur) { return '<option value="all">All</option>' + list.map(function (x) {
      return '<option value="' + esc(x) + '"' + (x === cur ? ' selected' : '') + '>' + esc(x) + '</option>'; }).join(''); }
    return '<div class="controls">' +
      '<input type="text" id="fq" placeholder="Search name or slug…" value="' + esc(f.q) + '">' +
      '<label>Chain <select id="fchain">' + opts(chains, f.chain) + '</select></label>' +
      '<label>Category <select id="fcat">' + opts(cats, f.cat) + '</select></label>' +
      '<label>Verdict <select id="fverdict"><option value="all">All</option>' +
      ['FARM', 'THIN', 'SKIP'].map(function (v) { return '<option' + (f.verdict === v ? ' selected' : '') + '>' + v + '</option>'; }).join('') + '</select></label>' +
      '<label>TVL $ <input type="number" id="fmin" placeholder="min" value="' + esc(f.min) + '"> – <input type="number" id="fmax" placeholder="max" value="' + esc(f.max) + '"></label>' +
      '<label><input type="checkbox" id="fpre"' + (f.pre ? ' checked' : '') + '> pre-token only</label>' +
      '<button class="btn" id="fapply">Apply</button>' +
      '<button class="btn ghost" id="fclear">Clear</button>' +
      '<button class="btn ghost" id="expCsv" title="Download the filtered board as CSV">Export CSV</button>' +
      '<button class="btn ghost" id="expJson" title="Download the filtered board as JSON">Export JSON</button>' +
      '<span class="muted small" id="fcount"></span></div>';
  }
  /* ---------- at-a-glance visuals (verdict mix + implied-value distribution) ---------- */
  function mixStrip(rows) {
    var f = 0, t = 0, s = 0, live = 0;
    rows.forEach(function (r) {
      if (r.live) { live++; return; }
      var v = r.economics.verdict;
      if (v === 'FARM') f++; else if (v === 'THIN') t++; else s++;
    });
    var n = f + t + s;
    function seg(c) { return n ? (c / n * 100).toFixed(1) : 0; }
    return '<div class="card distcard"><div class="mixstrip"><b class="small">Verdict mix</b>' +
      '<div class="mixbar" role="img" aria-label="' + f + ' FARM, ' + t + ' THIN, ' + s + ' SKIP">' +
      '<i class="segF" style="width:' + seg(f) + '%"></i>' +
      '<i class="segT" style="width:' + seg(t) + '%"></i>' +
      '<i class="segS" style="width:' + seg(s) + '%"></i></div>' +
      '<span class="small"><span class="dotF">●</span> <b>' + f + ' FARM</b> &nbsp; <span class="dotT">●</span> <b>' +
      t + ' THIN</b> &nbsp; <span class="dotS">●</span> <b>' + s + ' SKIP</b>' +
      (live ? ' &nbsp;·&nbsp; ' + live + ' live' : '') + ' &nbsp;·&nbsp; ' + rows.length + ' rows</span></div></div>';
  }
  function histCard(rows) {
    var vals = rows.filter(function (r) { return !r.live; }).map(function (r) { return Math.log10(Math.max(1, r.implied_value_usd)); });
    if (!vals.length) return '';
    var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals), bins = 12, counts = [];
    var i, b; for (i = 0; i < bins; i++) counts[i] = 0;
    vals.forEach(function (v) { b = Math.min(bins - 1, Math.floor((v - lo) / (hi - lo + 1e-9) * bins)); counts[b]++; });
    var mx = Math.max.apply(null, counts), BW = 360, BH = 96, BP = 4;
    var bars = counts.map(function (c, j) {
      var bh = Math.max(c ? 3 : 0, c / mx * (BH - 22));
      return '<rect x="' + (BP + j * (BW - 2 * BP) / bins).toFixed(1) + '" y="' + (BH - 18 - bh).toFixed(1) +
        '" width="' + ((BW - 2 * BP) / bins - 3).toFixed(1) + '" height="' + bh.toFixed(1) +
        '" rx="2" fill="' + (j < bins / 3 ? '#f87171' : j < 2 * bins / 3 ? '#f59e0b' : '#4ade80') + '" opacity="0.85"/>';
    }).join('');
    return '<div class="card distcard"><h3 style="margin-top:0">Implied value — distribution (log scale)</h3>' +
      '<svg class="hist" viewBox="0 0 ' + BW + ' ' + BH + '" role="img" aria-label="Histogram of implied values">' +
      bars + '<text x="' + BP + '" y="' + (BH - 4) + '" fill="#93a1bd" font-size="10">' + usd(Math.pow(10, lo)) +
      '</text><text x="' + (BW - BP) + '" y="' + (BH - 4) + '" fill="#93a1bd" font-size="10" text-anchor="end">' +
      usd(Math.pow(10, hi)) + '</text></svg>' +
      '<p class="small muted">Most of the board sits far below the top: the curve is steep, the odds decide who is worth farming.</p></div>';
  }
  function catHtml(rows) {
    var by = {};
    rows.forEach(function (r) { if (r.live) return; var k = r.category || 'no category'; (by[k] = by[k] || []).push(Math.log10(Math.max(1, r.implied_value_usd))); });
    var arr = Object.keys(by).map(function (k) { var v = by[k].sort(function (a, b) { return a - b; }); return { k: k, m: v[Math.floor(v.length / 2)], n: v.length }; })
      .sort(function (a, b) { return b.m - a.m; }).slice(0, 10);
    if (!arr.length) return '';
    var lo = arr[arr.length - 1].m, hi = arr[0].m, BW = 560, BH = 30 + arr.length * 24, LX = 132;
    var bars = arr.map(function (c, i) {
      var y = 24 + i * 24, w = Math.max(4, (c.m - lo) / (hi - lo + 1e-9) * (BW - LX - 92));
      var lbl = c.k.length > 20 ? c.k.slice(0, 19) + '…' : c.k;
      return '<text x="' + (LX - 8) + '" y="' + (y + 11) + '" fill="#e8edf7" font-size="11" text-anchor="end">' + esc(lbl) + '</text>' +
        '<rect x="' + LX + '" y="' + y + '" width="' + w.toFixed(1) + '" height="14" rx="3" fill="#e8b64c" opacity="0.9"/>' +
        '<text x="' + (LX + w + 6).toFixed(1) + '" y="' + (y + 11) + '" fill="#93a1bd" font-size="11">' + usd(Math.pow(10, c.m)) + ' · n=' + c.n + '</text>';
    }).join('');
    return '<div class="card distcard"><h3 style="margin-top:0">Categories — median implied value (top 10)</h3>' +
      '<svg class="cat" viewBox="0 0 ' + BW + ' ' + BH + '" role="img" aria-label="Median implied value by category">' + bars + '</svg>' +
      '<p class="small muted">Median of the rows shown, log scale. Small categories (n=1–2) can top the list on a single large protocol.</p></div>';
  }
  function spotHtml() {
    var f = D.rows.filter(function (r) { return r.economics.verdict === 'FARM'; }).slice(0, 3);
    if (!f.length) return '';
    return '<h2>Top FARM — worth the deposit</h2><div class="spot">' + f.map(function (r) { var e = r.economics;
      return '<div class="card spotc"><div class="small muted">FARM #' + r.rank + ' · ' + esc(r.category || 'no category') + ' · TVL ' + usd(r.tvl_usd) + '</div>' +
        '<a class="name" href="#/p/' + esc(r.slug) + '">' + esc(r.name) + '</a>' +
        '<div class="spotn">' + usd(r.implied_value_usd) + ' implied · ' + odds(r.launch_odds) + ' launch odds</div>' +
        '<p class="small">Net ' + usd2(e.net_usd) + ' on a $1,000 deposit — break-even odds ' + odds(e.breakeven_odds) +
        ' vs ' + odds(r.launch_odds) + ' launch odds, so the margin is real.</p></div>';
    }).join('') + '</div>';
  }
  function pagerHtml(total, page, totalPages) {
    if (totalPages <= 1) return '';
    function pbtn(p, label, on, dis) {
      return '<button class="pbtn' + (on ? ' on' : '') + '" data-page="' + p + '"' + (dis ? ' disabled' : '') + '>' + label + '</button>';
    }
    var h = '<div class="pager"><span class="muted small">Page ' + page + ' of ' + totalPages + ' · ' + total + ' rows</span><span class="pgbtns">';
    h += pbtn(page - 1, '‹ Prev', false, page <= 1);
    var start = Math.max(1, Math.min(page - 2, totalPages - 4)), end = Math.min(totalPages, start + 4);
    var p; for (p = start; p <= end; p++) h += pbtn(p, p, p === page, false);
    h += pbtn(page + 1, 'Next ›', false, page >= totalPages);
    return h + '</span></div>';
  }

  function boardHtml() {
    var rows = filteredRows(), f = state.f;
    /* A filtered view focuses on the filtered rows: the overview spotlight and the
       whole-board scatter stay on the unfiltered board, so the table is visible. */
    var isF = f.q || f.chain !== 'all' || f.cat !== 'all' || f.verdict !== 'all' || f.min !== '' || f.max !== '' || !f.pre;
    var totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    if (state.page > totalPages) state.page = totalPages;
    if (state.page < 1) state.page = 1;
    var pageRows = rows.slice((state.page - 1) * PAGE_SIZE, state.page * PAGE_SIZE);
    var maxImp = D.rows[0].implied_value_usd;
    function th(key, label, cls) {
      var on = state.sort === key;
      return '<th class="sortable' + (on ? ' sorted' : '') + (cls ? ' ' + cls : '') + '" data-sort="' + key + '">' +
        label + (on ? (state.dir < 0 ? ' ↓' : ' ↑') : '') + '</th>';
    }
    var h = tabsHtml() + mixStrip(rows) +
      (isF ? '' : spotHtml() +
      '<div class="card"><h2 style="margin-top:0">TVL vs market cap — the curve the board is priced on</h2>' + scatterSvg(true, 360) +
      '<p class="small muted">Blue: ' + D.listed.length + ' traded protocols (amber dots are bridges). Ringed amber: the board&rsquo;s top 20 at their curve value — where they would sit if a token existed today. Gold line: the fitted curve, R² ' + num(V.global_r2, 3) + '.</p></div>') +
      '<div class="grid2">' + catHtml(rows) + histCard(rows) + '</div>' +
      controlsHtml() +
      '<table><thead><tr>' + th('rank', '#') + '<th>Protocol</th>' + th('implied', 'Implied value') +
      '<th>Bootstrap band</th>' + th('tvl', 'TVL') + th('growth', '7d') + th('age', 'Age') +
      th('odds', 'Launch odds') + th('band', 'Rank band') + '<th>Verdict</th><th>Integrity</th></tr></thead><tbody>';
    pageRows.forEach(function (r) {
      var w = Math.max(2, Math.round(100 * Math.log10(Math.max(1, r.implied_value_usd)) / Math.log10(Math.max(1, maxImp))));
      h += '<tr data-slug="' + esc(r.slug) + '"' + (state.sel === r.slug ? ' class="sel"' : '') + '>' +
        '<td class="num">' + (r.live ? '<span class="live-tag">LIVE</span>' : '#' + r.rank) + '</td>' +
        '<td><a class="name" href="#/p/' + esc(r.slug) + '">' + esc(r.name) + '</a><br><span class="slug">' + esc(r.slug) +
        ' · ' + esc(r.category || 'no category') + ' · ' + shortChains(r) + '</span></td>' +
        '<td class="num"><b>' + usd(r.implied_value_usd) + '</b><div class="bar"><i style="width:' + w + '%"></i></div></td>' +
        '<td class="num small">' + (r.live ? 'market' : usd(r.implied_lo) + ' – ' + usd(r.implied_hi)) + '</td>' +
        '<td class="num">' + usd(r.tvl_usd) + '</td>' +
        '<td class="num">' + pct(r.change_7d) + (r.change_7d === null ? '' : '<div class="mini"><i style="width:' + Math.max(3, Math.min(100, Math.sqrt(Math.abs(r.change_7d)) * 14.14)).toFixed(0) + '%;background:' + (r.change_7d >= 0 ? '#4ade80' : '#f87171') + '"></i></div>') + '</td>' +
        '<td class="num">' + age(r.age_days) + '</td>' +
        '<td class="num">' + (r.launch_odds === null ? '—' : odds(r.launch_odds)) + '</td>' +
        '<td class="num">' + (r.live ? '—' : '#' + r.rank_lo + '–' + r.rank_hi) + '</td>' +
        '<td>' + (r.economics ? '<span class="vbadge ' + verdictClass(r.economics.verdict) + '">' + r.economics.verdict + '</span>' : '<span class="dim">traded</span>') + '</td>' +
        '<td>' + flagsHtml(r.integrity, 2) + '</td></tr>';
    });
    h += '</tbody></table>' + pagerHtml(rows.length, state.page, totalPages) +
      '<p class="small muted">Showing ' + pageRows.length + ' of ' + rows.length + ' filtered rows (' +
      D.board_size + ' on the board' + (f.pre ? '' : ' + live tokens') +
      '). Click a protocol for its detail, model numbers and farm plan. ' +
      'Sort by implied value, TVL, 7-day growth, age, launch odds or rank band.</p>' + modelStrip();
    return h;
  }
  function bindBoard() {
    app.querySelectorAll('th.sortable').forEach(function (th) {
      th.addEventListener('click', function () {
        var k = th.getAttribute('data-sort');
        if (state.sort === k) state.dir = -state.dir; else { state.sort = k; state.dir = k === 'rank' ? 1 : -1; }
        state.page = 1;
        render();
      });
    });
    app.querySelectorAll('.pbtn').forEach(function (b) {
      b.addEventListener('click', function () {
        var p = parseInt(b.getAttribute('data-page'), 10);
        if (!p || p < 1) return;
        state.page = p;
        location.hash = filterHash();
      });
    });
    document.getElementById('expCsv').addEventListener('click', exportCSV);
    document.getElementById('expJson').addEventListener('click', exportJSON);
    function readFilters() {
      var f = state.f;
      f.q = document.getElementById('fq').value; f.chain = document.getElementById('fchain').value;
      f.cat = document.getElementById('fcat').value; f.verdict = document.getElementById('fverdict').value;
      f.min = document.getElementById('fmin').value; f.max = document.getElementById('fmax').value;
      f.pre = document.getElementById('fpre').checked;
    }
    document.getElementById('fapply').addEventListener('click', function () { readFilters(); state.page = 1; location.hash = filterHash(); });
    document.getElementById('fclear').addEventListener('click', function () {
      state.f = { q: '', chain: 'all', cat: 'all', verdict: 'all', min: '', max: '', pre: true };
      state.page = 1;
      location.hash = '#/';
    });
    ['fq', 'fmin', 'fmax'].forEach(function (id) {
      document.getElementById(id).addEventListener('keydown', function (e) { if (e.key === 'Enter') { readFilters(); location.hash = filterHash(); } });
    });
    var c = document.getElementById('fcount');
    if (c) c.textContent = filteredRows().length + ' shown';
  }

  /* ---------- detail ---------- */
  function logBarW(v, maxImp) {
    var lo = 5, hi = Math.log10(Math.max(1, maxImp));
    return Math.max(2, Math.min(100, 100 * (Math.log10(Math.max(1, v)) - lo) / (hi - lo)));
  }
  function compChart(r, comps) {
    var items = [{ n: r.name + ' (implied)', v: r.implied_value_usd, g: 1 }].concat(comps.map(function (l) { return { n: l.name, v: l.mcap_usd, g: 0 }; }))
      .sort(function (a, b) { return b.v - a.v; });
    var mx = items[0].v;
    return '<h3>Implied vs comparables — market caps, log scale</h3><div class="vbars">' + items.map(function (x) {
      var lbl = x.n.length > 22 ? x.n.slice(0, 21) + '…' : x.n;
      return '<div class="vbar-row"><span class="vbar-label">' + esc(lbl) + '</span><div class="vbar"><i class="' +
        (x.g ? 'vbar-curve' : 'vbar-odds') + '" style="width:' + logBarW(x.v, mx).toFixed(1) + '%"></i></div><b>' + usd(x.v) + '</b></div>';
    }).join('') + '</div><p class="small muted">Gold: this protocol&rsquo;s implied value. Blue: the traded comparables&rsquo; actual market caps — the market&rsquo;s own verdict on the same TVL neighbourhood.</p>';
  }
  function detailHtml(r) {
    if (!r) return tabsHtml() + '<div class="card"><h2>Protocol not found</h2><p class="muted">No board row with that slug. <a href="#/">Back to the board →</a></p></div>';
    var e = r.economics, m = r;
    var bridge = isBridge(r);
    var recomputed = Math.pow(10, r.curve_a + r.curve_b * Math.log10(Math.max(1, r.tvl_usd)) + (bridge ? r.curve_bridge_shift : 0));
    var recomputedImplied = Math.max(1, Math.round(recomputed * r.launch_odds));
    var comps = comparables(r);
    var h = tabsHtml() +
      '<div class="navrow"><a href="#/">← Board</a><a href="' + filterHash() + '">Filtered view</a></div>' +
      '<div class="card"><h2 style="margin-top:0">#' + r.rank + ' · ' + esc(r.name) + ' <span class="muted">(' + esc(r.slug) + ')</span></h2>' +
      '<p class="muted">' + esc(r.category || 'no category') + ' · ' + esc(r.chains.join(', ')) +
      ' · TVL ' + usd(r.tvl_usd) + ' · 7d ' + pct(r.change_7d) + ' · listed ' + esc(r.listed_at || 'unknown') +
      ' · age ' + age(r.age_days) + '</p>' +
      '<div class="kv">' +
      '<div><b>' + usd(r.implied_value_usd) + '</b><span>implied value (rank #' + r.rank + ')</span></div>' +
      '<div><b>' + usd(r.implied_lo) + ' – ' + usd(r.implied_hi) + '</b><span>bootstrap P10–P90, ' + D.bootstrap_draws + ' refits</span></div>' +
      '<div><b>#' + r.rank_lo + ' – #' + r.rank_hi + '</b><span>bootstrap rank band</span></div>' +
      '<div><b>' + odds(r.launch_odds) + '</b><span>launch odds</span></div>' +
      '<div><b>' + usd(r.curve_value) + '</b><span>curve value, before odds</span></div>' +
      '<div><b><span class="vbadge ' + verdictClass(e.verdict) + '">' + e.verdict + '</span></b><span>costed verdict</span></div>' +
      '</div>' +
      '<h3>Curve → implied — where the odds cut the value</h3>' +
      '<div class="vbars">' +
      '<div class="vbar-row"><span class="vbar-label">curve value</span><div class="vbar"><i class="vbar-curve" style="width:' +
      logBarW(r.curve_value, Math.max(r.curve_value, D.rows[0].implied_value_usd)).toFixed(1) + '%"></i></div><b>' + usd(r.curve_value) + '</b></div>' +
      '<div class="vbar-row"><span class="vbar-label">× odds ' + odds(r.launch_odds) + '</span><div class="vbar"><i class="vbar-odds" style="width:' +
      logBarW(r.implied_value_usd, Math.max(r.curve_value, D.rows[0].implied_value_usd)).toFixed(1) + '%"></i></div><b>' + usd(r.implied_value_usd) + '</b></div>' +
      '<p class="small muted">Log scale, 100% = ' + usd(Math.max(r.curve_value, D.rows[0].implied_value_usd)) + '. The curve says what the protocol ' +
      'would be worth if a token were certain; the odds shrink it to the implied value. The bootstrap band ' +
      usd(r.implied_lo) + ' – ' + usd(r.implied_hi) + ' is the same cut, refit 200 times.</p></div>' + compChart(r, comps) +
      '<h3>Integrity strip — what this row&rsquo;s own record does not say</h3><p>' + flagsHtml(r.integrity) + '</p>' +
      '<h3>Model arithmetic — check it yourself</h3>' +
      '<div class="eq">curve = 10^(' + num(r.curve_a) + ' + ' + num(r.curve_b) + ' · log<sub>10</sub>(' + usd(r.tvl_usd) +
      ')' + (bridge ? ' + ' + num(r.curve_bridge_shift) + ' bridge' : '') + ') = ' + usd(recomputed) +
      '<br>implied = curve × odds = ' + usd(recomputed) + ' × ' + odds(r.launch_odds) + ' = <b>' + usd(recomputedImplied) +
      '</b> (board: ' + usd(r.implied_value_usd) + ', curve n=' + r.curve_n + ', trimmed ' + r.curve_trimmed + ')</div>' +
      '<p class="small muted">Launch odds ' + odds(r.launch_odds) + ' = ensemble of band odds ' + odds(r.launch_odds_band_odds) +
      ' (band ' + r.launch_odds_band + ', n=' + r.launch_odds_band_n + ', band rate ' + odds(r.launch_odds_band_rate) +
      (r.launch_odds_category ? ', category rate used' : ', band rate only') + ') and ridge-logit odds ' +
      odds(r.launch_odds_logit) + ', averaged in logit space. Growth used in the (losing) all-terms fit: ' +
      pct(r.growth_pct, 0) + ' clamped; chains ' + r.chain_count + '.</p>' +
      '<h3>Comparables — traded protocols nearest in TVL</h3><table><thead><tr><th>Protocol</th><th class="num">TVL</th><th class="num">Market cap</th><th class="num">mcap / TVL</th></tr></thead><tbody>' +
      comps.map(function (l) { return '<tr><td>' + esc(l.name) + ' <span class="slug">' + esc(l.slug) + '</span></td><td class="num">' +
        usd(l.tvl_usd) + '</td><td class="num">' + usd(l.mcap_usd) + '</td><td class="num">' + (l.mcap_usd / l.tvl_usd).toFixed(2) + '×</td></tr>'; }).join('') +
      '</tbody></table>' +
      '<h3>Farm economics — $' + M.deposit_usd.toLocaleString('en-US') + ' deposit basis</h3>' +
      '<div class="kv">' +
      '<div><b>' + usd2(e.expected_value_usd) + '</b><span>expected airdrop value</span></div>' +
      '<div><b>' + usd2(e.gas_usd) + '</b><span>total gas</span></div>' +
      '<div><b>' + usd2(e.tbill_usd) + '</b><span>T-bill yield forgone (' + e.hold_days + 'd)</span></div>' +
      '<div><b>' + usd2(e.net_usd) + '</b><span>net</span></div>' +
      '<div><b>' + usd2(e.net_per_hour_usd) + '/h</b><span>net per active hour (' + e.time_min + ' min)</span></div>' +
      '<div><b>' + odds(e.breakeven_odds) + '</b><span>break-even launch odds</span></div>' +
      '</div>' +
      '<p class="small muted">Review the position on <b>' + esc(e.review_date) + '</b> (snapshot + ' + e.hold_days +
      ' days). Verdict rule: net &gt; 0 → FARM; break-even ≤ 60% → THIN; else SKIP.</p>' +
      '<h3>Farm plan — dated, costed, timed</h3><ol class="steps">' +
      r.farm_steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ol></div>';
    return h;
  }

  /* ---------- live / model / accounting ---------- */
  function liveHtml() {
    var h = tabsHtml() + '<div class="card"><h2 style="margin-top:0">Live tokens — the market&rsquo;s own values</h2>' +
      '<p class="muted">These protocols already trade, so the board never ranks them against pre-token ones. ' +
      'Shown by market cap, top ' + D.live_size + '.</p><table><thead><tr><th>Protocol</th><th class="num">TVL</th><th class="num">Market cap</th><th class="num">mcap / TVL</th><th class="num">7d</th></tr></thead><tbody>';
    D.live.forEach(function (l) {
      h += '<tr><td><span class="name">' + esc(l.name) + '</span><br><span class="slug">' + esc(l.slug) + ' · ' +
        esc(l.category || 'no category') + ' · ' + esc(l.chains.join(', ')) + '</span></td><td class="num">' +
        usd(l.tvl_usd) + '</td><td class="num"><b>' + usd(l.mcap_usd) + '</b></td><td class="num">' +
        (l.mcap_usd / l.tvl_usd).toFixed(2) + '×</td><td class="num">' + pct(l.change_7d) + '</td></tr>';
    });
    return h + '</tbody></table></div>';
  }
  function scatterSvg(bd, hh) {
    var pts = D.listed.filter(function (l) { return l.tvl_usd > 0 && l.mcap_usd > 0; });
    var W = 880, H = hh || 440, P = 56, PB = 46;
    var xs = pts.map(function (l) { return Math.log10(l.tvl_usd); }), ys = pts.map(function (l) { return Math.log10(l.mcap_usd); });
    var ov = bd ? D.rows.slice(0, 20).filter(function (r) { return r.tvl_usd > 0 && r.curve_value > 0; }) : [];
    ov.forEach(function (r) { xs.push(Math.log10(r.tvl_usd)); ys.push(Math.log10(r.curve_value)); });
    var x0 = Math.floor(Math.min.apply(null, xs)), x1 = Math.ceil(Math.max.apply(null, xs)),
      y0 = Math.floor(Math.min.apply(null, ys)), y1 = Math.ceil(Math.max.apply(null, ys));
    function X(v) { return P + (v - x0) / (x1 - x0) * (W - P - 20); }
    function Y(v) { return H - PB - (v - y0) / (y1 - y0) * (H - PB - P); }
    function tickLbl(v) { var a = Math.pow(10, v); return a >= 1e9 ? '$' + (a / 1e9) + 'B' : a >= 1e6 ? '$' + (a / 1e6) + 'M' : '$' + (a / 1e3) + 'K'; }
    var grid = '', k;
    for (k = x0; k <= x1; k++) grid += '<line x1="' + X(k).toFixed(1) + '" y1="' + (H - PB) + '" x2="' + X(k).toFixed(1) +
      '" y2="' + P + '" stroke="#1a2742" stroke-width="1"/>' +
      '<text x="' + X(k).toFixed(1) + '" y="' + (H - PB + 16) + '" fill="#93a1bd" font-size="11" text-anchor="middle">' + tickLbl(k) + '</text>';
    for (k = y0; k <= y1; k++) grid += '<line x1="' + P + '" y1="' + Y(k).toFixed(1) + '" x2="' + (W - 20) + '" y2="' +
      Y(k).toFixed(1) + '" stroke="#1a2742" stroke-width="1"/>' +
      '<text x="' + (P - 8) + '" y="' + (Y(k) + 4).toFixed(1) + '" fill="#93a1bd" font-size="11" text-anchor="end">' + tickLbl(k) + '</text>';
    var dots = pts.map(function (l) {
      var br = (l.category || '').toLowerCase().indexOf('bridge') >= 0;
      return '<circle cx="' + X(Math.log10(l.tvl_usd)).toFixed(1) + '" cy="' + Y(Math.log10(l.mcap_usd)).toFixed(1) +
        '" r="' + (br ? 4 : 3) + '" fill="' + (br ? '#f59e0b' : '#60a5fa') + '" opacity="0.75"><title>' +
        esc(l.name) + ' · TVL ' + usd(l.tvl_usd) + ' · mcap ' + usd(l.mcap_usd) + '</title></circle>';
    }).join('');
    var ovdots = ov.map(function (r) {
      return '<circle cx="' + X(Math.log10(r.tvl_usd)).toFixed(1) + '" cy="' + Y(Math.log10(r.curve_value)).toFixed(1) +
        '" r="5" fill="#f59e0b" stroke="#0b1220" stroke-width="1.5" opacity="0.95"><title>' +
        esc(r.name) + ' · TVL ' + usd(r.tvl_usd) + ' · curve ' + usd(r.curve_value) + ' · implied ' + usd(r.implied_value_usd) + '</title></circle>';
    }).join('');
    var line = '', prev = null;
    for (var x = x0; x <= x1; x += 0.05) {
      var y = V.global_a + V.global_b * x;
      var px = X(x), py = Y(Math.max(y0, Math.min(y1, y)));
      line += (prev === null ? 'M' : 'L') + px.toFixed(1) + ' ' + py.toFixed(1) + ' ';
      prev = px;
    }
    return '<svg class="scatter" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Traded protocols: market cap against TVL, with the fitted curve">' +
      grid +
      '<line x1="' + P + '" y1="' + (H - PB) + '" x2="' + (W - 20) + '" y2="' + (H - PB) + '" stroke="#22304d" stroke-width="1.5"/>' +
      '<line x1="' + P + '" y1="' + P + '" x2="' + P + '" y2="' + (H - PB) + '" stroke="#22304d" stroke-width="1.5"/>' + dots + ovdots +
      '<path d="' + line + '" fill="none" stroke="#e8b64c" stroke-width="2.5"/>' +
      '<text x="' + (W / 2 + 20) + '" y="' + (H - 10) + '" fill="#93a1bd" font-size="12" text-anchor="middle">TVL ($) — log scale</text>' +
      '<text x="16" y="' + (H / 2) + '" fill="#93a1bd" font-size="12" text-anchor="middle" transform="rotate(-90 16 ' + (H / 2) + ')">Market cap ($) — log scale</text>' +
      '<g font-size="12"><circle cx="' + (P + 8) + '" cy="' + (P - 22) + '" r="4" fill="#60a5fa"/><text x="' + (P + 18) + '" y="' + (P - 18) + '" fill="#e8edf7">traded protocol</text>' +
      '<circle cx="' + (P + 150) + '" cy="' + (P - 22) + '" r="4" fill="#f59e0b"/><text x="' + (P + 160) + '" y="' + (P - 18) + '" fill="#e8edf7">bridge</text>' +
      '<line x1="' + (P + 224) + '" y1="' + (P - 22) + '" x2="' + (P + 254) + '" y2="' + (P - 22) + '" stroke="#e8b64c" stroke-width="2.5"/>' +
      '<text x="' + (P + 260) + '" y="' + (P - 18) + '" fill="#e8b64c">fitted curve, n=' + V.global_n + ', R² ' + num(V.global_r2, 3) + '</text></g>' +
      (bd ? '<g font-size="12"><circle cx="' + (P + 8) + '" cy="' + (P - 6) + '" r="5" fill="#f59e0b" stroke="#0b1220" stroke-width="1.5"/><text x="' + (P + 18) + '" y="' + (P - 2) + '" fill="#e8edf7">pre-token board, top 20 (at curve value)</text></g>' : '') + '</svg>';
  }
  function modelHtml() {
    function missRow(label, loo, m24, n24, m23, n23) {
      return '<tr><td>' + label + '</td><td class="num">×' + num(loo, 2) + '</td><td class="num">×' + num(m24, 2) +
        '</td><td class="num">' + n24 + '</td><td class="num">×' + num(m23, 2) + '</td><td class="num">' + n23 + '</td></tr>';
    }
    return tabsHtml() + '<div class="card"><h2 style="margin-top:0">Model radar-7 — every term fitted, every term tested</h2>' +
      '<div class="eq">log<sub>10</sub>(mcap) = <b>' + num(V.global_a) + '</b> + <b>' + num(V.global_b) +
      '</b> · log<sub>10</sub>(TVL) + <b>' + num(V.global_bridge_shift) + '</b> bridge<br>' +
      'R² ' + num(V.global_r2, 4) + ' · n = ' + V.global_n + ' · pool ' + V.global_pool_n + ' · trimmed ' +
      V.global_trimmed + ' (MAD, 2.5σ, one pass) · implied = curve × launch odds</div>' +
      '<div class="grid2"><div><h3>Held-out tests — median miss multiple (1.0 is perfect)</h3>' +
      '<table><thead><tr><th>Curve</th><th class="num">LOO</th><th class="num">2024 split</th><th class="num">n</th><th class="num">2023 split</th><th class="num">n</th></tr></thead><tbody>' +
      missRow('<b>Chosen: log TVL + bridge</b>', V.median_miss_radar6_curve, V.older_newer_miss, V.older_newer_n, V.older_newer_2023_miss, V.older_newer_2023_n) +
      missRow('All-terms fit (growth, age, chains)', V.median_miss_multiterm, V.older_newer_multiterm_miss, V.older_newer_multiterm_n, V.older_newer_2023_multiterm_miss, V.older_newer_2023_n) +
      '<tr><td>Flat mcap/TVL multiple</td><td class="num">×' + num(V.median_miss_flat, 2) + '</td><td class="num">—</td><td class="num">—</td><td class="num">—</td><td class="num">—</td></tr>' +
      '</tbody></table>' +
      '<p class="small muted">The all-terms fit loses on all three held-out tests, so the board does not use it. ' +
      'That is the honest result: extra terms were fitted, not assumed, and they carry no out-of-sample signal here.</p>' +
      '<h3>Prediction intervals</h3><p class="small">Held-out log<sub>10</sub>(pred/actual) quantiles: P10 ' + num(V.log_q10, 2) +
      ' · P25 ' + num(V.log_q25, 2) + ' · P75 ' + num(V.log_q75, 2) + ' · P90 ' + num(V.log_q90, 2) +
      '. Coverage P25–P75 ' + pct(V.p25_p75_coverage * 100, 0) + ', P10–P90 ' + pct(V.p10_p90_coverage * 100, 0) +
      ' (n=' + V.n + '). By age — newer (&lt;2y, n=' + V.coverage_by_age.newer.n + '): P10–P90 ' +
      pct(V.coverage_by_age.newer.p10_p90_coverage * 100, 0) + '; older (n=' + V.coverage_by_age.older.n + '): ' +
      pct(V.coverage_by_age.older.p10_p90_coverage * 100, 0) + '.</p></div>' +
      '<div><h3>All-terms fit — the fit that lost (reported, not hidden)</h3>' +
      '<table><tbody>' +
      '<tr><td>intercept</td><td class="num">' + num(VT.intercept) + '</td></tr>' +
      '<tr><td>log<sub>10</sub> TVL</td><td class="num">' + num(VT.log_tvl) + '</td></tr>' +
      '<tr><td>bridge shift</td><td class="num">' + num(VT.bridge_shift) + '</td></tr>' +
      '<tr><td>growth (clamped 7d)</td><td class="num">' + num(VT.growth) + '</td></tr>' +
      '<tr><td>log<sub>10</sub> age</td><td class="num">' + num(VT.log_age) + '</td></tr>' +
      '<tr><td>age unknown</td><td class="num">' + num(VT.age_unknown) + '</td></tr>' +
      '<tr><td>chains (capped ' + M.chain_cap + ')</td><td class="num">' + num(VT.chains) + '</td></tr>' +
      '<tr><td>R² · n · pool · trimmed</td><td class="num">' + num(VT.r2, 4) + ' · ' + VT.n + ' · ' + VT.pool_n + ' · ' + VT.trimmed_n + '</td></tr>' +
      '</tbody></table>' +
      '<p class="small muted">Growth +0.02, log-age −0.02, chains −0.005 per chain: near zero. Traded protocols&rsquo; 7-day ' +
      'changes run −40% to +3% (median −9%); age and chain count correlate with log(mcap/TVL) at −0.01 and +0.01.</p>' +
      '<h3>Launch odds — hold-out</h3><table><tbody>' +
      '<tr><td>Even/odd slug hold-out (n=' + V.odds.n + ', train ' + V.odds.train_n + ')</td><td class="num">' + pct(V.odds.accuracy * 100, 1) + ' vs ' + pct(V.odds.majority_accuracy * 100, 1) + ' majority</td></tr>' +
      '<tr><td>AUC, hold-out</td><td class="num">' + num(V.odds.auc, 3) + '</td></tr>' +
      '<tr><td>5-fold CV accuracy</td><td class="num">' + pct(V.odds.accuracy_5fold * 100, 1) + ' vs ' + pct(V.odds.majority_5fold * 100, 1) + ' majority</td></tr>' +
      '<tr><td>AUC, 5-fold</td><td class="num">' + num(V.odds.auc_5fold, 3) + '</td></tr>' +
      '<tr><td>Base rate (has a token)</td><td class="num">' + pct(V.odds.base_rate * 100, 1) + '</td></tr>' +
      '</tbody></table>' +
      '<p class="small muted">Ensemble: age-band × category rate (shrunk, k=' + M.odds_shrink_k + ') averaged in logit space with a ' +
      'ridge logistic (λ=10, band + frequent-category dummies + log TVL, growth, chains, log age). A tuning grid over ' +
      'penalty, category floor, shrinkage and ensemble weight found no setting beating it on both hold-outs at once.</p></div></div>' +
      '<h3>Traded protocols — the fit pool</h3>' + scatterSvg() +
      '<p class="small muted">' + D.listed.length + ' traded protocols with a market cap train the curve; exchanges and versioned ' +
      'releases are excluded from the fit. Gold line: the chosen curve.</p></div>';
  }
  function acctHtml() {
    var total = D.accounting.reduce(function (s, a) { return s + a.count; }, 0);
    return tabsHtml() + '<div class="card"><h2 style="margin-top:0">Accounting — all ' + D.protocols_total + ' protocols, exactly one bucket each</h2>' +
      '<table><thead><tr><th>Bucket</th><th class="num">Count</th><th>Note</th></tr></thead><tbody>' +
      D.accounting.map(function (a) { return '<tr><td>' + esc(a.label) + '</td><td class="num"><b>' + a.count +
        '</b></td><td class="muted">' + esc(a.note) + '</td></tr>'; }).join('') +
      '</tbody></table><p class="small muted">Buckets sum to ' + total + ' = snapshot total ' + D.protocols_total +
      '. Floor: $' + D.floor_usd.toLocaleString('en-US') + '. Board: all ' + D.watchlist_size +
      ' watchlist protocols, plus ' + D.early_size + ' early finds, ranked by implied value; wrapped, staked or bridged ' +
      'products sit at the tail only to reach 250 rows.</p></div>';
  }

  /* ---------- render ---------- */
  function render() {
    app.setAttribute('aria-busy', 'false');
    if (state.tab === 'detail') app.innerHTML = detailHtml(rowBySlug(state.sel));
    else if (state.tab === 'live') app.innerHTML = liveHtml();
    else if (state.tab === 'model') app.innerHTML = modelHtml();
    else if (state.tab === 'acct') app.innerHTML = acctHtml();
    else app.innerHTML = boardHtml();
    if (state.tab === 'board') bindBoard();
    window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', function () { parseHash(); render(); });
  parseHash();
  render();
})();
