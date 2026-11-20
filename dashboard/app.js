// Token Radar dashboard: renders window.RADAR (written by main.ts from the
// sealed snapshot) as a sortable, filterable board with a detail view per
// protocol and a live model sandbox. No network: all data is local data.js.
(function () {
  'use strict';
  var D = window.RADAR;
  var rows = D.rows.slice();
  // Watchlist membership in the page: the board is built as the watchlist
  // (every row at or above the floor) plus early finds below the floor, so
  // TVL at or above the floor marks a watchlist row. board.json's coverage
  // is what the gate checks; this is only the page's badge.
  var state = { q: '', cat: '', chain: '', scope: 'all', sort: 'rank', shown: 100, sel: null, scale: 1, gw: D.model.growth_weight, deposit: 1000, farmed: D.model.farmed_fraction, tbill: D.model.tbill_rate, sandbox: false, compare: [] };

  function $(id) { return document.getElementById(id); }
  function money(n) {
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    return '$' + n;
  }
  function pct(n) { return n === null || n === undefined ? '—' : (n > 0 ? '+' : '') + n.toFixed(1) + '%'; }
  function ageFmt(d) { return d === null || d === undefined ? '—' : d + 'd'; }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

  // Recompute implied values under the sandbox sliders; off means the
  // submitted board's own values. The fitted curve value is the base:
  // implied = curve value x launch odds x growth x maturity x chains.
  function implied(r) {
    if (!state.sandbox) return r.implied_value_usd;
    var g = r.change_7d === null ? 0 : Math.min(D.model.growth_cap, Math.max(D.model.growth_floor, r.change_7d));
    var gm = 1 + (g / 100) * state.gw;
    return Math.max(1, Math.round(r.curve_value * state.scale * r.launch_odds * gm * r.maturity_multiplier * r.chain_multiplier));
  }

  function fmtUsd(n, dec) {
    var sign = n < 0 ? '−$' : '$';
    var a = Math.abs(n);
    if (dec === undefined) dec = 2;
    return sign + a.toFixed(dec);
  }

  // Farm economics under the what-if controls, from the row's own numbers:
  // expected = implied × odds × pool × (deposit / farmed capital), net =
  // expected − gas − the T-bill yield the deposit forgoes over the hold.
  function econ(r, deposit, farmed, tbill) {
    var e = r.economics;
    var share = deposit / Math.max(1, farmed * r.tvl_usd);
    var expected = implied(r) * r.launch_odds * D.model.airdrop_pool * share;
    var tb = deposit * tbill * e.hold_days / 365;
    var net = expected - e.gas_usd - tb;
    var denom = implied(r) * D.model.airdrop_pool * share;
    return {
      expected: expected, gas: e.gas_usd, tbill: tb, net: net,
      perHour: e.time_min > 0 ? net / (e.time_min / 60) : 0,
      breakeven: denom > 0 ? Math.min(1, Math.max(0, (e.gas_usd + tb) / denom)) : 1,
      verdict: net > 0 ? 'FARM' : ((e.gas_usd + tb) / Math.max(denom, 1e-9) <= 0.6 ? 'THIN' : 'SKIP')
    };
  }

  function bestPerHour(deposit) {
    var best = null;
    rows.forEach(function (r) {
      var e = econ(r, deposit, state.farmed, state.tbill);
      if (!best || e.perHour > best.e.perHour) best = { r: r, e: e };
    });
    return best;
  }

  function renderStrip() {
    var total = D.accounting.reduce(function (s, a) { return s + a.count; }, 0);
    var withToken = D.accounting.filter(function (a) { return a.label.indexOf('Already has a token') === 0 || a.label.indexOf('Has a token symbol') === 0; }).reduce(function (s, a) { return s + a.count; }, 0);
    var rankable = D.board_size + (D.accounting.filter(function (a) { return a.label.indexOf('Pre-token and rankable') === 0; })[0] || { count: 0 }).count;
    $('strip').innerHTML =
      '<div><span class="k">Snapshot</span><b>' + total + '</b><span class="k">protocols, every one counted once</span></div>' +
      '<div><span class="k">Ranked</span><b>' + D.board_size + '</b><span class="k">' + D.watchlist_size + ' watchlist + ' + D.early_size + ' early</span></div>' +
      '<div><span class="k">Rankable pre-token</span><b>' + rankable + '</b><span class="k">of which ' + (rankable - D.board_size) + ' sit above the floor, off the watchlist</span></div>' +
      '<div><span class="k">Already has a token</span><b>' + withToken + '</b><span class="k">their market caps train the curve</span></div>' +
      '<div><span class="k">Bootstrap refits</span><b>' + D.bootstrap_draws + '</b><span class="k">behind every rank range</span></div>' +
      '<div><span class="k">Integrity</span><b>' + total + ' = ' + D.protocols_total + '</b><span class="k">buckets sum to the snapshot</span></div>';
  }

  function renderKPI() {
    var total = rows.reduce(function (s, r) { return s + r.implied_value_usd; }, 0);
    var farm = rows.filter(function (r) { return econ(r, state.deposit, state.farmed, state.tbill).verdict === 'FARM'; }).length;
    var best = bestPerHour(1000);
    var best10k = bestPerHour(10000);
    var v = D.validation;
    $('kpi').innerHTML =
      '<div><span class="k">Ranked</span><b>' + rows.length + '</b><span class="k">protocols</span></div>' +
      '<div><span class="k">Total implied value</span><b>' + money(total) + '</b><span class="k">across the board</span></div>' +
      '<div><span class="k">Backtest median miss</span><b>×' + v.median_miss.toFixed(2) + '</b><span class="k">fitted curve, ' + v.n + ' listed</span></div>' +
      '<div><span class="k">P25–P75 coverage</span><b>' + Math.round(v.p25_p75_coverage * 100) + '%</b><span class="k">of held-out values</span></div>' +
      '<div><span class="k">FARM verdicts</span><b>' + farm + '</b><span class="k">of ' + rows.length + ' rows' + (state.sandbox ? ' · what-if' : '') + '</span></div>' +
      '<div><span class="k">Best net / hour</span><b>' + fmtUsd(best.e.perHour) + '</b><span class="k">' + esc(best.r.name) + ' · $1,000 plan · ' + fmtUsd(best10k.e.perHour) + '/hr at $10,000</span></div>';
  }

  function renderValidation() {
    var v = D.validation;
    var o = v.odds;
    var c = v.coverage_by_age;
    $('validtext').textContent = 'The fitted size curve misses the held-out market cap by a median factor of ×' + v.median_miss.toFixed(2) +
      ' (the flat multiple misses by ×' + v.median_miss_flat.toFixed(2) + '), on ' + v.n + ' listed protocols. ' +
      'Fitted only on older protocols, it misses newer ones by ×' + v.older_newer_miss.toFixed(2) + ' (' + v.older_newer_n + ' protocols listed since 2024). ' +
      'The launch-odds model calls ' + Math.round(o.accuracy * 100) + '% of a hold-out set right, against ' + Math.round(o.majority_accuracy * 100) + '% for guessing the majority class, and ' + Math.round(o.accuracy_5fold * 100) + '% under 5-fold cross-validation. ' +
      'The P25–P75 interval holds ' + Math.round(v.p25_p75_coverage * 100) + '% of held-out values and the P10–P90 interval holds ' +
      Math.round(v.p10_p90_coverage * 100) + '%. Whole-snapshot curve: log market cap = ' + v.global_a.toFixed(2) +
      ' + ' + v.global_b.toFixed(2) + ' × log TVL' + (v.global_bridge_shift >= 0 ? ' + ' : ' − ') + Math.abs(v.global_bridge_shift).toFixed(2) + ' for bridges' +
      ' (n = ' + v.global_n + ' of ' + v.global_pool_n + ' listed non-exchange protocols; ' + v.global_trimmed + ' trimmed as outliers).';
    $('validrows').innerHTML =
      '<tr><td>Median miss multiple (lower is better)</td><td class="num">×' + v.median_miss.toFixed(2) + '</td><td class="num">×' + v.median_miss_flat.toFixed(2) + '</td></tr>' +
      '<tr><td>Older-into-newer median miss (fit before 2024, predict after, n = ' + v.older_newer_n + ')</td><td class="num">×' + v.older_newer_miss.toFixed(2) + '</td><td class="num">—</td></tr>' +
      '<tr><td>Older-into-newer at the 2023-07-01 split (n = ' + v.older_newer_2023_n + ')</td><td class="num">×' + v.older_newer_2023_miss.toFixed(2) + '</td><td class="num">—</td></tr>' +
      '<tr><td>Launch-odds hold-out accuracy (n = ' + o.n + ', majority class ' + Math.round(o.majority_accuracy * 100) + '%, AUC ' + o.auc.toFixed(2) + ')</td><td class="num">' + Math.round(o.accuracy * 100) + '%</td><td class="num">' + Math.round(o.majority_accuracy * 100) + '%</td></tr>' +
      '<tr><td>Launch-odds 5-fold accuracy (n = 758, majority class ' + Math.round(o.majority_5fold * 100) + '%, AUC ' + o.auc_5fold.toFixed(2) + ')</td><td class="num">' + Math.round(o.accuracy_5fold * 100) + '%</td><td class="num">' + Math.round(o.majority_5fold * 100) + '%</td></tr>' +
      '<tr><td>Share of held-out values in P25–P75 (target ~50%)</td><td class="num">' + Math.round(v.p25_p75_coverage * 100) + '%</td><td class="num">—</td></tr>' +
      '<tr><td>P25–P75, newer than 2 years (n = ' + c.newer.n + ')</td><td class="num">' + Math.round(c.newer.p25_p75_coverage * 100) + '%</td><td class="num">—</td></tr>' +
      '<tr><td>P25–P75, older than 2 years (n = ' + c.older.n + ')</td><td class="num">' + Math.round(c.older.p25_p75_coverage * 100) + '%</td><td class="num">—</td></tr>' +
      '<tr><td>Share of held-out values in P10–P90 (target ~80%)</td><td class="num">' + Math.round(v.p10_p90_coverage * 100) + '%</td><td class="num">—</td></tr>' +
      '<tr><td>P10–P90, newer than 2 years</td><td class="num">' + Math.round(c.newer.p10_p90_coverage * 100) + '%</td><td class="num">—</td></tr>' +
      '<tr><td>P10–P90, older than 2 years</td><td class="num">' + Math.round(c.older.p10_p90_coverage * 100) + '%</td><td class="num">—</td></tr>';
  }

  function renderAccounting() {
    var total = D.accounting.reduce(function (s, a) { return s + a.count; }, 0);
    $('accountrows').innerHTML = D.accounting.map(function (a) {
      return '<tr><td><b>' + esc(a.label) + '</b></td><td class="num">' + a.count + '</td><td>' + esc(a.note) + '</td></tr>';
    }).join('') + '<tr><td><b>Total</b></td><td class="num"><b>' + total + '</b></td><td>every protocol in the snapshot, counted once</td></tr>';
  }

  function renderScatter() {
    var pts = D.listed.map(function (p) { return { x: Math.log10(p.tvl_usd), y: Math.log10(p.mcap_usd), pre: false }; });
    rows.forEach(function (r) { pts.push({ x: Math.log10(r.tvl_usd), y: Math.log10(Math.max(1, r.implied_value_usd)), pre: true }); });
    var xs = pts.map(function (p) { return p.x; }), ys = pts.map(function (p) { return p.y; });
    var x0 = Math.floor(Math.min.apply(null, xs)) - 0.2, x1 = Math.ceil(Math.max.apply(null, xs)) + 0.2;
    var y0 = Math.floor(Math.min.apply(null, ys)) - 0.2, y1 = Math.ceil(Math.max.apply(null, ys)) + 0.2;
    var W = 640, H = 420, L = 56, R = 14, T = 14, B = 44;
    function X(v) { return L + (v - x0) / (x1 - x0) * (W - L - R); }
    function Y(v) { return T + (1 - (v - y0) / (y1 - y0)) * (H - T - B); }
    var grid = '';
    function axLabel(v) {
      if (v >= 9) return '$' + Math.pow(10, v - 9) + 'B';
      if (v >= 6) return '$' + Math.pow(10, v - 6) + 'M';
      if (v >= 3) return '$' + Math.pow(10, v - 3) + 'K';
      return '$' + Math.pow(10, v);
    }
    for (var gx = Math.ceil(x0); gx <= x1; gx++) {
      grid += '<line x1="' + X(gx).toFixed(1) + '" y1="' + Y(y0).toFixed(1) + '" x2="' + X(gx).toFixed(1) + '" y2="' + Y(y1).toFixed(1) + '" stroke="#26364f" stroke-width="1"/>' +
        '<text x="' + X(gx).toFixed(1) + '" y="' + (H - 28).toFixed(1) + '" fill="#9fb0c7" font-size="11" text-anchor="middle">' + axLabel(gx) + '</text>';
    }
    for (var gy = Math.ceil(y0); gy <= y1; gy++) {
      grid += '<line x1="' + X(x0).toFixed(1) + '" y1="' + Y(gy).toFixed(1) + '" x2="' + X(x1).toFixed(1) + '" y2="' + Y(gy).toFixed(1) + '" stroke="#26364f" stroke-width="1"/>' +
        '<text x="' + (L - 8).toFixed(1) + '" y="' + (Y(gy) + 4).toFixed(1) + '" fill="#9fb0c7" font-size="11" text-anchor="end">' + axLabel(gy) + '</text>';
    }
    var line = '';
    var lineBridge = '';
    for (var i = 0; i <= 24; i++) {
      var lx = x0 + (x1 - x0) * i / 24;
      var ly = D.validation.global_a + D.validation.global_b * lx;
      line += (i === 0 ? 'M' : 'L') + X(lx).toFixed(1) + ' ' + Y(Math.min(y1, Math.max(y0, ly))).toFixed(1) + ' ';
      var lyb = ly + D.validation.global_bridge_shift;
      lineBridge += (i === 0 ? 'M' : 'L') + X(lx).toFixed(1) + ' ' + Y(Math.min(y1, Math.max(y0, lyb))).toFixed(1) + ' ';
    }
    var dots = pts.map(function (p) {
      return '<circle cx="' + X(p.x).toFixed(1) + '" cy="' + Y(p.y).toFixed(1) + '" r="' + (p.pre ? 2.6 : 2.2) + '" fill="' + (p.pre ? '#f0b35e' : '#5ec8a6') + '" opacity="0.85"/>';
    }).join('');
    $('scatter').innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" role="img" aria-label="Value against TVL scatter">' +
      grid + '<path d="' + line + '" fill="none" stroke="#7fb3ff" stroke-width="2"/>' +
      '<path d="' + lineBridge + '" fill="none" stroke="#e07a9b" stroke-width="2" stroke-dasharray="6 4"/>' + dots +
      '<text x="' + ((W - L - R) / 2 + L).toFixed(1) + '" y="' + (H - 8).toFixed(1) + '" fill="#9fb0c7" font-size="12" text-anchor="middle">TVL (log scale)</text>' +
      '<text x="14" y="' + ((H - T - B) / 2 + T).toFixed(1) + '" fill="#9fb0c7" font-size="12" text-anchor="middle" transform="rotate(-90 14 ' + ((H - T - B) / 2 + T).toFixed(1) + ')">Value (log scale)</text>' +
      '<text x="' + (W - R).toFixed(1) + '" y="24" fill="#5ec8a6" font-size="12" text-anchor="end">● traded (market cap)</text>' +
      '<text x="' + (W - R).toFixed(1) + '" y="40" fill="#f0b35e" font-size="12" text-anchor="end">● pre-token (implied value)</text>' +
      '<text x="' + (W - R).toFixed(1) + '" y="56" fill="#7fb3ff" font-size="12" text-anchor="end">— fitted curve</text>' +
      '<text x="' + (W - R).toFixed(1) + '" y="72" fill="#e07a9b" font-size="12" text-anchor="end">- - bridge curve</text>' +
      '</svg>';
  }

  function filtered() {
    var q = state.q.trim().toLowerCase();
    var list = rows.filter(function (r) {
      if (q && (r.name.toLowerCase().indexOf(q) < 0 && r.slug.indexOf(q) < 0)) return false;
      if (state.cat && r.category !== state.cat) return false;
      if (state.chain && r.chains.indexOf(state.chain) < 0) return false;
      if (state.scope === 'watchlist' && r.tvl_usd < D.floor_usd) return false;
      if (state.scope === 'early' && r.tvl_usd >= D.floor_usd) return false;
      return true;
    });
    var key = state.sort;
    list.sort(function (a, b) {
      if (key === 'tvl') return b.tvl_usd - a.tvl_usd;
      if (key === 'growth') return (b.change_7d || 0) - (a.change_7d || 0);
      if (key === 'age') return (b.age_days || 0) - (a.age_days || 0);
      if (key === 'implied') return implied(b) - implied(a);
      return a.rank - b.rank;
    });
    return list;
  }

  function scopeBadge(r) {
    return r.tvl_usd >= D.floor_usd
      ? '<span class="badge watch">Watchlist</span>'
      : '<span class="badge early">Early find</span>';
  }

  function renderSpot() {
    var top = rows.slice(0, 3);
    $('spot').innerHTML = top.map(function (r) {
      return '<article data-slug="' + esc(r.slug) + '"><div class="r">Rank ' + r.rank + ' · ' + esc(r.category || 'Uncategorised') + '</div>' +
        '<h3>' + esc(r.name) + '</h3><div class="v">' + money(r.implied_value_usd) + '</div>' +
        '<div class="s">TVL ' + money(r.tvl_usd) + ' · ' + pct(r.change_7d) + ' 7d · ' + esc(r.chains.join(', ') || '—') + '</div></article>';
    }).join('');
    Array.prototype.forEach.call(document.querySelectorAll('#spot article'), function (el) {
      el.addEventListener('click', function () { select(el.getAttribute('data-slug')); });
    });
  }

  function renderRows() {
    var list = filtered();
    var show = list.slice(0, state.shown);
    $('count').textContent = list.length + ' protocols · showing ' + show.length + (state.sandbox ? ' · sandbox model active' : '');
    $('rows').innerHTML = show.map(function (r) {
      var cls = r.change_7d === null ? '' : (r.change_7d >= 0 ? 'pos' : 'neg');
      return '<tr data-slug="' + esc(r.slug) + '" class="' + (state.sel === r.slug ? 'sel' : '') + '">' +
        '<td>' + r.rank + '</td>' +
        '<td><b>' + esc(r.name) + '</b><br><span style="color:var(--muted);font-size:12px">' + esc(r.slug) + '</span> ' + scopeBadge(r) + '</td>' +
        '<td>' + esc(r.category || '—') + '</td>' +
        '<td>' + esc(r.chains.map(esc).join(', ') || '—') + '</td>' +
        '<td class="num">' + money(r.tvl_usd) + '</td>' +
        '<td class="num ' + cls + '">' + pct(r.change_7d) + '</td>' +
        '<td class="num">' + ageFmt(r.age_days) + '</td>' +
        '<td class="num"><b>' + money(implied(r)) + '</b></td>' +
        '<td class="num">' + r.rank_lo + '–' + r.rank_hi + '</td>' +
        '<td><button type="button" data-farm="' + esc(r.slug) + '">Farm plan</button> <button type="button" data-cmp="' + esc(r.slug) + '">' + (state.compare.indexOf(r.slug) >= 0 ? '✓ Compare' : 'Compare') + '</button></td></tr>';
    }).join('');
    $('more').style.display = list.length > state.shown ? '' : 'none';
    Array.prototype.forEach.call(document.querySelectorAll('#rows tr'), function (tr) {
      tr.addEventListener('click', function () { select(tr.getAttribute('data-slug')); });
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-farm]'), function (b) {
      b.addEventListener('click', function (e) { e.stopPropagation(); select(b.getAttribute('data-farm')); });
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-cmp]'), function (b) {
      b.addEventListener('click', function (e) { e.stopPropagation(); toggleCompare(b.getAttribute('data-cmp')); });
    });
  }

  function toggleCompare(slug) {
    var i = state.compare.indexOf(slug);
    if (i >= 0) state.compare.splice(i, 1);
    else if (state.compare.length < 3) state.compare.push(slug);
    else state.compare = [state.compare[1], state.compare[2], slug];
    renderRows(); renderCompare();
  }

  function rowBySlug(slug) {
    for (var i = 0; i < rows.length; i++) if (rows[i].slug === slug) return rows[i];
    return null;
  }

  function renderCompare() {
    var el = $('compare');
    var sel = state.compare.map(rowBySlug).filter(function (r) { return r !== null; });
    if (sel.length === 0) {
      el.innerHTML = '<p class="empty">Nothing selected yet — pick up to three protocols from the board.</p>';
      return;
    }
    function metric(label, fn, num) {
      return '<tr><td>' + label + '</td>' + sel.map(function (r) { return '<td class="' + (num ? 'num' : '') + '">' + fn(r) + '</td>'; }).join('') + '</tr>';
    }
    el.innerHTML = '<table><thead><tr><th></th>' + sel.map(function (r) {
      return '<th>' + esc(r.name) + ' <button type="button" data-uncmp="' + esc(r.slug) + '" aria-label="Remove">×</button></th>';
    }).join('') + '</tr></thead><tbody>' +
      metric('Rank', function (r) { return '#' + r.rank + ' <span style="color:var(--muted)">(' + r.rank_lo + '–' + r.rank_hi + ')</span>'; }, true) +
      metric('Implied value', function (r) { return '<b>' + money(implied(r)) + '</b>'; }, true) +
      metric('Implied P10–P90 (bootstrap)', function (r) { return money(r.implied_lo) + ' – ' + money(r.implied_hi); }, true) +
      metric('TVL', function (r) { return money(r.tvl_usd); }, true) +
      metric('7-day growth', function (r) { return pct(r.change_7d); }, true) +
      metric('Age', function (r) { return ageFmt(r.age_days); }, true) +
      metric('Fitted curve value', function (r) { return money(r.curve_value); }, true) +
      metric('Launch odds', function (r) { return (r.launch_odds * 100).toFixed(1) + '%'; }, true) +
      metric('Net on $1,000', function (r) { var e = econ(r, 1000, state.farmed, state.tbill); return fmtUsd(e.net); }, true) +
      metric('Net per hour', function (r) { var e = econ(r, 1000, state.farmed, state.tbill); return '<b>' + fmtUsd(e.perHour) + '</b>'; }, true) +
      metric('Break-even odds', function (r) { var e = econ(r, 1000, state.farmed, state.tbill); return (e.breakeven * 100).toFixed(1) + '%'; }, true) +
      metric('Verdict', function (r) { var e = econ(r, 1000, state.farmed, state.tbill); return '<b>' + e.verdict + '</b>'; }, true) +
      metric('Review by', function (r) { return r.economics.review_date; }, true) +
      '</tbody></table>';
    Array.prototype.forEach.call(document.querySelectorAll('[data-uncmp]'), function (b) {
      b.addEventListener('click', function () { toggleCompare(b.getAttribute('data-uncmp')); });
    });
  }

  function download(filename, text, type) {
    var blob = new Blob([text], { type: type });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function csvCell(v) {
    var s = String(v === null || v === undefined ? '' : v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function exportCsv() {
    var list = filtered();
    var head = ['rank', 'slug', 'name', 'category', 'chains', 'tvl_usd', 'change_7d', 'age_days', 'implied_value_usd', 'implied_lo', 'implied_hi', 'rank_lo', 'rank_hi', 'launch_odds', 'net_usd_1000', 'net_per_hour_usd', 'breakeven_odds', 'verdict', 'review_date'];
    var lines = [head.join(',')];
    list.forEach(function (r) {
      var e = econ(r, 1000, state.farmed, state.tbill);
      lines.push([r.rank, r.slug, r.name, r.category || '', r.chains.join(';'), r.tvl_usd, r.change_7d === null ? '' : r.change_7d, r.age_days === null ? '' : r.age_days, implied(r), r.implied_lo, r.implied_hi, r.rank_lo, r.rank_hi, r.launch_odds.toFixed(4), e.net.toFixed(2), e.perHour.toFixed(2), e.breakeven.toFixed(4), e.verdict, r.economics.review_date].map(csvCell).join(','));
    });
    download('token-radar-board.csv', lines.join('\n') + '\n', 'text/csv');
  }

  function exportJson() {
    var list = filtered();
    download('token-radar-board.json', JSON.stringify(list.map(function (r) {
      var e = econ(r, 1000, state.farmed, state.tbill);
      return { rank: r.rank, slug: r.slug, name: r.name, category: r.category, chains: r.chains, tvl_usd: r.tvl_usd, change_7d: r.change_7d, age_days: r.age_days, implied_value_usd: implied(r), implied_lo: r.implied_lo, implied_hi: r.implied_hi, rank_lo: r.rank_lo, rank_hi: r.rank_hi, launch_odds: r.launch_odds, net_usd_1000: Math.round(e.net * 100) / 100, net_per_hour_usd: Math.round(e.perHour * 100) / 100, breakeven_odds: Math.round(e.breakeven * 10000) / 10000, verdict: e.verdict, review_date: r.economics.review_date };
    }), null, 2) + '\n', 'application/json');
  }

  // The five listed protocols nearest a row: same category first, then
  // closest by log TVL. Their market caps are the curve's training data.
  function compsRows(r) {
    var x = Math.log10(r.tvl_usd);
    var scored = D.listed.map(function (p) {
      return { p: p, score: (p.category === r.category ? 0 : 2) + Math.abs(Math.log10(p.tvl_usd) - x) };
    });
    scored.sort(function (a, b) { return a.score - b.score || (a.p.slug < b.p.slug ? -1 : 1); });
    return scored.slice(0, 5).map(function (s) {
      var p = s.p;
      return '<tr><td>' + esc(p.name) + '</td><td class="num">' + money(p.tvl_usd) + '</td><td class="num">' + money(p.mcap_usd) + '</td><td class="num">' + (p.mcap_usd / p.tvl_usd).toFixed(2) + '×</td></tr>';
    }).join('');
  }

  function renderDetail() {
    var el = $('detail');
    var r = null;
    for (var i = 0; i < rows.length; i++) if (rows[i].slug === state.sel) { r = rows[i]; break; }
    if (!r) {
      el.innerHTML = '<h2>Protocol detail</h2><p class="empty">Pick a protocol from the board to see its value model and its seven-step farm plan.</p>';
      return;
    }
    var g = r.change_7d === null ? 0 : Math.min(D.model.growth_cap, Math.max(D.model.growth_floor, r.change_7d));
    var steps = r.farm_steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('');
    var e = econ(r, state.deposit, state.farmed, state.tbill);
    var bandNames = ['under 1 year', '1–2 years', '2–3 years', '3 years or more', 'age unknown'];
    var bandNote = (r.launch_odds_category ? 'its category inside the ' : 'the ') + bandNames[r.launch_odds_band] + ' band' +
      ' (band rate ' + (r.launch_odds_band_rate * 100).toFixed(0) + '% on ' + r.launch_odds_band_n + ' protocols' +
      (r.launch_odds_category ? ', category cohort ' + r.launch_odds_n : '') + ')';
    var oddsNote = 'ensemble (logit average) of the band model ' + (r.launch_odds_band_odds * 100).toFixed(0) + '% and the logistic model ' + (r.launch_odds_logit * 100).toFixed(0) + '% — ' + bandNote;
    var curveNote = 'log mcap = ' + r.curve_a + ' + ' + r.curve_b + ' × log TVL' + (r.curve_bridge_shift >= 0 ? ' + ' : ' − ') + Math.abs(r.curve_bridge_shift).toFixed(2) + ' for bridges' +
      ', fitted on ' + r.curve_n + ' listed non-exchange protocols (' + r.curve_trimmed + ' trimmed as outliers)';
    var v = D.validation;
    var rq = r.age_days === null ? { log_q10: v.log_q10, log_q90: v.log_q90 } :
      (r.age_days < 730 ? v.ranges_newer : v.ranges_older);
    var depLabel = '$' + String(state.deposit).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    el.innerHTML =
      '<h2>' + esc(r.name) + '</h2>' +
      '<p class="sub">' + esc(r.slug) + ' · ' + esc(r.category || 'Uncategorised') + ' · ' + esc(r.chains.join(', ') || '—') + ' ' + scopeBadge(r) + '</p>' +
      '<div class="big">' + money(implied(r)) + ' <span style="font-size:14px;color:var(--muted);font-weight:400">implied value</span></div>' +
      '<h3>Why this value — the model, step by step</h3>' +
      '<table><tbody>' +
      '<tr><td>TVL</td><td class="num">' + money(r.tvl_usd) + '</td></tr>' +
      '<tr><td>Fitted curve value<br><span style="color:var(--muted);font-size:12px">' + curveNote + '</span></td><td class="num">' + money(r.curve_value) + '</td></tr>' +
      '<tr><td>Launch odds<br><span style="color:var(--muted);font-size:12px">' + oddsNote + '</span></td><td class="num">× ' + (r.launch_odds * 100).toFixed(1) + '%</td></tr>' +
      '<tr><td>Growth, 7d ' + pct(r.change_7d) + '</td><td class="num">× ' + r.growth_multiplier + '</td></tr>' +
      '<tr><td>Maturity (' + ageFmt(r.age_days) + ' listed)</td><td class="num">× ' + r.maturity_multiplier + '</td></tr>' +
      '<tr><td>Chains (' + r.chains.length + ')</td><td class="num">× ' + r.chain_multiplier + '</td></tr>' +
      '<tr><td><b>Implied value</b></td><td class="num"><b>' + money(implied(r)) + '</b></td></tr>' +
      '<tr><td>P10–P90 range<br><span style="color:var(--muted);font-size:12px">from the backtest residuals for its age group</span></td><td class="num">' + money(Math.round(implied(r) * Math.pow(10, rq.log_q10))) + ' – ' + money(Math.round(implied(r) * Math.pow(10, rq.log_q90))) + '</td></tr>' +
      '<tr><td>Bootstrap P10–P90<br><span style="color:var(--muted);font-size:12px">implied value over ' + D.bootstrap_draws + ' refits of the size curve; rank ' + r.rank_lo + '–' + r.rank_hi + '</span></td><td class="num">' + money(r.implied_lo) + ' – ' + money(r.implied_hi) + '</td></tr>' +
      '</tbody></table>' +
      '<p class="sub">Sandbox ' + (state.sandbox ? 'active — values above use your sliders and what-if controls.' : 'off — values are the submitted board.') + '</p>' +
      '<h3>Farm economics — ' + depLabel + ' deposit</h3>' +
      '<table><tbody>' +
      '<tr><td>Verdict</td><td class="num"><b>' + e.verdict + '</b></td></tr>' +
      '<tr><td>Expected airdrop value</td><td class="num">' + fmtUsd(e.expected) + '</td></tr>' +
      '<tr><td>Gas for the plan</td><td class="num">' + fmtUsd(e.gas, 0) + ' · ' + r.economics.time_min + ' min active</td></tr>' +
      '<tr><td>T-bill yield forgone (' + (state.tbill * 100).toFixed(0) + '% a year, ' + r.economics.hold_days + ' days)</td><td class="num">' + fmtUsd(e.tbill) + '</td></tr>' +
      '<tr><td><b>Net per ' + depLabel + '</b></td><td class="num"><b>' + fmtUsd(e.net) + '</b></td></tr>' +
      '<tr><td><b>Net per hour</b></td><td class="num"><b>' + fmtUsd(e.perHour) + '</b></td></tr>' +
      '<tr><td>Break-even launch odds</td><td class="num">' + (e.breakeven * 100).toFixed(1) + '% (model: ' + (r.launch_odds * 100).toFixed(1) + '%)</td></tr>' +
      '<tr><td>Timeline</td><td class="num">snapshot ' + esc(D.as_of) + ' · hold ' + r.economics.hold_days + ' days · review by ' + r.economics.review_date + '</td></tr>' +
      '</tbody></table>' +
      '<p class="sub">Assumptions, stated: airdrop pool ' + (D.model.airdrop_pool * 100).toFixed(0) + '% of implied value; farmed capital ' + (state.farmed * 100).toFixed(0) + '% of TVL; your share is ' + depLabel + ' of that farmed capital.</p>' +
      '<h3>Comparables — the five listed protocols nearest it</h3>' +
      '<p class="sub">Same category first, then closest by TVL. Their market caps are the curve\'s training data: if ' + esc(r.name) + '\'s implied value per TVL dollar sits far from its comparables, that is where the model is stretching.</p>' +
      '<table><thead><tr><th>Protocol</th><th class="num">TVL</th><th class="num">Market cap</th><th class="num">Mcap / TVL</th></tr></thead><tbody>' +
      compsRows(r) +
      '<tr><td><b>' + esc(r.name) + ' (implied)</b></td><td class="num">' + money(r.tvl_usd) + '</td><td class="num">' + money(implied(r)) + '</td><td class="num">' + (implied(r) / r.tvl_usd).toFixed(2) + '×</td></tr>' +
      '</tbody></table>' +
      '<h3>Farm plan — seven concrete steps</h3><ol>' + steps + '</ol>' +
      '<p class="sub">Snapshot ' + esc(D.as_of) + '. This record carries no token: farm it only with money you can leave in place for the holding period above.</p>';
  }

  function renderLive() {
    $('liverows').innerHTML = D.live.map(function (p) {
      var ratio = p.tvl_usd > 0 && p.mcap_usd ? (p.mcap_usd / p.tvl_usd).toFixed(2) + '×' : '—';
      return '<tr><td><b>' + esc(p.name) + '</b></td><td>' + esc(p.category || '—') + '</td>' +
        '<td class="num">' + money(p.tvl_usd) + '</td><td class="num">' + (p.mcap_usd ? money(p.mcap_usd) : '—') + '</td>' +
        '<td class="num">' + ratio + '</td></tr>';
    }).join('');
  }

  function renderMeta() {
    var top = rows[0];
    $('meta').innerHTML = 'Snapshot <b>' + esc(D.as_of) + '</b><br>' +
      D.board_size + ' ranked · ' + D.watchlist_size + ' watchlist · ' + D.early_size + ' early finds<br>' +
      'Top: <b>' + esc(top ? top.name : '—') + '</b> at ' + money(top ? top.implied_value_usd : 0);
    $('modelver').textContent = '· ' + D.model_version;
    $('modeltext').textContent = 'Implied value = fitted curve value (log market cap = a + b × log TVL, plus a fitted shift for bridges, fitted on listed protocols that are not exchanges after trimming outliers more than 2.5 robust deviations from a plain curve) × launch odds (an ensemble of the share of protocols in its age band and category that have a token, and a logistic regression on age band, category, log TVL, 7-day growth, chain count and log age) × growth × maturity × chains. ' +
      'Growth is the 7-day TVL change clamped to −60…+120% at weight ' + D.model.growth_weight + '; maturity runs 0.6–1.0 over ' + D.model.maturity_days + ' days. ' +
      'Move the sliders to test the model, and the what-if controls to re-price the farms at another deposit, farmed-capital share or T-bill rate — the board re-ranks live. ' +
      'Every row also carries a rank range from ' + D.bootstrap_draws + ' bootstrap refits of the size curve, and the detail view shows its five nearest listed comparables.';
    $('foot').textContent = 'Source: ' + D.source + ' · Watchlist floor ' + money(D.floor_usd) + ' TVL · ' + D.board_size + ' protocols ranked · Model ' + D.model_version + ' · Built by main.ts from the sealed snapshot; no network, no live prices.';
  }

  function renderAll() { renderStrip(); renderKPI(); renderValidation(); renderAccounting(); renderScatter(); renderSpot(); renderRows(); renderDetail(); renderLive(); renderMeta(); renderCompare(); }

  function select(slug) {
    state.sel = slug;
    renderRows(); renderDetail();
    var el = $('detail');
    if (el.scrollIntoView && window.innerWidth < 900) el.scrollIntoView({ behavior: 'smooth' });
  }

  function fillSelects() {
    var cats = {}, chains = {};
    rows.forEach(function (r) { if (r.category) cats[r.category] = 1; r.chains.forEach(function (c) { chains[c] = 1; }); });
    Object.keys(cats).sort().forEach(function (c) {
      var o = document.createElement('option'); o.value = c; o.textContent = c; $('cat').appendChild(o);
    });
    Object.keys(chains).sort().forEach(function (c) {
      var o = document.createElement('option'); o.value = c; o.textContent = c; $('chain').appendChild(o);
    });
  }

  function applyHash() {
    var h = window.location.hash.slice(1);
    if (!h) return;
    h.split('&').forEach(function (part) {
      var kv = part.split('=');
      var k = decodeURIComponent(kv[0] || ''), v = decodeURIComponent(kv[1] || '');
      if (k === 'detail' && v) state.sel = v;
      if (k === 'filter' && v) { state.cat = v; $('cat').value = v; }
      if (k === 'scope' && (v === 'watchlist' || v === 'early' || v === 'all')) { state.scope = v; $('scope').value = v; }
      if (k === 'chain' && v) { state.chain = v; $('chain').value = v; }
    });
  }

  function sandboxOn() {
    state.sandbox = (Math.abs(state.scale - 1) > 0.001) || (Math.abs(state.gw - D.model.growth_weight) > 0.001) ||
      state.deposit !== 1000 || Math.abs(state.farmed - D.model.farmed_fraction) > 0.001 || Math.abs(state.tbill - D.model.tbill_rate) > 0.001;
    $('sandnote').textContent = state.sandbox
      ? 'Sandbox active: the board is re-ranked under your sliders and what-if controls. Reset to return to the submitted board.'
      : 'Sandbox off: showing the submitted board.';
  }

  function whatif() { sandboxOn(); renderKPI(); renderDetail(); }

  $('q').addEventListener('input', function () { state.q = $('q').value; state.shown = 100; renderRows(); });
  $('cat').addEventListener('change', function () { state.cat = $('cat').value; state.shown = 100; renderRows(); });
  $('chain').addEventListener('change', function () { state.chain = $('chain').value; state.shown = 100; renderRows(); });
  $('scope').addEventListener('change', function () { state.scope = $('scope').value; state.shown = 100; renderRows(); });
  $('sort').addEventListener('change', function () { state.sort = $('sort').value; renderRows(); });
  $('reset').addEventListener('click', function () {
    state.q = ''; state.cat = ''; state.chain = ''; state.scope = 'all'; state.sort = 'rank'; state.shown = 100;
    $('q').value = ''; $('cat').value = ''; $('chain').value = ''; $('scope').value = 'all'; $('sort').value = 'rank';
    renderRows();
  });
  $('exportCsv').addEventListener('click', function () { exportCsv(); });
  $('exportJson').addEventListener('click', function () { exportJson(); });
  $('more').addEventListener('click', function () { state.shown += 100; renderRows(); });
  $('scale').addEventListener('input', function () {
    state.scale = parseFloat($('scale').value); $('oScale').textContent = state.scale.toFixed(2);
    sandboxOn(); renderKPI(); renderRows(); renderDetail();
  });
  $('growthw').addEventListener('input', function () {
    state.gw = parseFloat($('growthw').value); $('oGrowth').textContent = state.gw.toFixed(2);
    sandboxOn(); renderKPI(); renderRows(); renderDetail();
  });
  $('deposit').addEventListener('change', function () { state.deposit = parseInt($('deposit').value, 10); whatif(); });
  $('farmed').addEventListener('change', function () { state.farmed = parseFloat($('farmed').value); whatif(); });
  $('tbill').addEventListener('change', function () { state.tbill = parseFloat($('tbill').value); whatif(); });
  $('sandboxReset').addEventListener('click', function () {
    state.scale = 1; state.gw = D.model.growth_weight;
    state.deposit = 1000; state.farmed = D.model.farmed_fraction; state.tbill = D.model.tbill_rate;
    $('scale').value = '1'; $('growthw').value = String(D.model.growth_weight);
    $('deposit').value = '1000'; $('farmed').value = String(D.model.farmed_fraction); $('tbill').value = String(D.model.tbill_rate);
    $('oScale').textContent = '1.00'; $('oGrowth').textContent = D.model.growth_weight.toFixed(2);
    sandboxOn(); renderKPI(); renderRows(); renderDetail();
  });

  fillSelects();
  applyHash();
  renderAll();
  // A deep link lands on what it names: a protocol's detail, or the board
  // under the filter it sets.
  if (state.sel) {
    var d = $('detail');
    if (d && d.scrollIntoView) d.scrollIntoView();
  } else if (state.cat || state.chain || state.scope !== 'all') {
    var b = $('boardtitle');
    if (b && b.scrollIntoView) b.scrollIntoView();
  }
  document.querySelector('main').setAttribute('aria-busy', 'false');
})();
