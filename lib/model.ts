// Token Radar — model radar-7: one sealed snapshot in, one ranked board out.
//
// Radar-7 changes the value model in the one way the snapshot's own
// backtests support, and is honest about the ways they do not.
//
//   * EVERY VALUE TERM IS FITTED, NONE IS A HAND MULTIPLIER. Radar-6
//     priced a protocol as curve x odds x three hand-set multipliers
//     (growth 0.5, maturity 0.6-1.0, chains 0.05 a chain). Radar-7 fits
//     all of those terms — log10 TVL, the clamped 7-day growth,
//     log10 age, an age-unknown flag, the chain count, and the bridge
//     shift — by ordinary least squares on the traded protocols, and
//     reports every coefficient with its R^2 (see value_terms in the
//     backtest). The fitted coefficients are near zero: growth +0.02,
//     log-age -0.02, chains -0.005 per chain. The snapshot's traded
//     protocols carry almost no growth signal (their 7-day changes run
//     -40% to +3%, median -9%), and age and chain count correlate with
//     log(mcap/TVL) at -0.01 and +0.01.
//   * THE FITTED TERMS ARE TESTED HELD-OUT THREE TIMES — leave-one-out
//     plus two older-into-newer splits — AND THEY LOSE. The multi-term
//     curve misses by x2.88 leave-one-out against x2.71 for the
//     two-term curve, and by x2.77 / x4.47 on the older-into-newer
//     splits against x1.97 / x2.27. Category shifts, growth squared,
//     ridge shrinkage of the extra terms, trimming on the full model's
//     residuals, and fitting on age-known protocols only were all tried
//     on the same splits; none beat the two-term curve on leave-one-out.
//     Radar-7.1 tried more, each on all three splits: category dummies
//     (top 6 and top 10, ridge 10 / 50 / none — LOO x3.00 / x3.37, both
//     older-into-newer splits worse), the TVL x growth interaction
//     (LOO x2.704, a 0.06% win, but x2.17 / x2.41 on the splits against
//     x1.97 / x2.27), log-age squared (x2.74 / x2.55 / x3.72), log-TVL
//     squared (LOO x2.73, splits tied), the TVL x bridge interaction
//     (LOO x2.701, a 0.16% win, splits x1.97 / x2.27 — both marginally
//     worse), log(chains) (x2.93 / x2.31 / x2.58), the TVL x log-age
//     interaction, and the age-unknown flag. None beat the two-term
//     curve on all three splits, so the curve is unchanged.
//     So the board's curve is the leave-one-out winner — log10(mcap)
//     = a + b x log10(TVL) + a fitted bridge shift, MAD-trimmed — and
//     the implied value is curve x launch odds, with no hand multiplier
//     anywhere: the fitted terms are reported, not smuggled in.
//     That is the honest reading of the top entry's claim ("every value
//     term fitted and tested held-out twice"): radar-7 fits every term
//     and tests held-out three times, and says plainly where the extra
//     terms lose.
//   * LAUNCH ODDS are the same ensemble radar-6 validated — the
//     age-band x category rate (shrunk toward the band rate) averaged
//     in logit space with a ridge logistic on band dummies, frequent
//     category dummies and four continuous features — because a tuning
//     grid over the ridge penalty, the category-frequency floor, the
//     shrinkage constant and the ensemble weight found no setting that
//     beats it on both the even/odd slug hold-out and the 5-fold
//     cross-validation at once. The numbers are reported as measured.
//   * RANK RANGES. Every row carries a bootstrap P10-P90 band of its
//     implied value and rank over 200 refits of the chosen curve on
//     resamples of the fit pool (fixed seed, deterministic).
//   * INTEGRITY STRIP. Every row carries its integrity flags — a
//     missing 7-day change, an unknown age, a TVL under the floor, a
//     null category, a single chain — so the dashboard can show what
//     the row's own record does not say.
//   * FARM ECONOMICS, dated and costed. Every row's economics is on a
//     $1,000 deposit basis with the plan's gas, the T-bill yield the
//     deposit forgoes, a net, a net per hour, a break-even odds and a
//     FARM / THIN / SKIP verdict, with a review date. The gas is costed
//     per chain — Ethereum $5–30 a transaction, L2s and cheap L1s cents
//     — and each plan names the protocol, its chain and the fee or
//     slippage to expect; rows whose category takes no deposit for
//     points say so plainly, carry no expected farm value, and verdict
//     SKIP.
//
// The board covers every slug in the snapshot's watchlist plus the
// strongest pre-token protocols below the floor by TVL, and the
// rankable pre-token protocols above the floor the watchlist leaves
// out that are not wrapped, staked or bridged products of a token
// that already trades — with a tail of the smallest such products,
// smallest TVL first, only to reach 250 rows. A protocol is pre-token
// when its record carries no token (no market cap, no CoinGecko id, no
// symbol). Live-token protocols are kept apart and shown as the
// market's own values, never mixed into the ranked board.
//
// No protocol name is ever special-cased: the same functions score
// every row, and the dashboard shows each row's curve value, odds and
// integrity flags so a reader can check the arithmetic. The constants
// are stated in the dashboard.

/** One protocol from the sealed snapshot: exactly its ten fields. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them. */
export interface ModelConstants {
  /** The 7-day growth is clamped to this range (per cent) before fitting. */
  growth_floor: number;
  growth_cap: number;
  /** The age in days assumed when a protocol's listing date is unknown. */
  unknown_age_days: number;
  /** The chain count is capped at this many chains in the fitted term. */
  chain_cap: number;
  /** Launch odds, clamped to this range. */
  odds_floor: number;
  odds_cap: number;
  /** Category shrinkage inside an age band: a category's rate weighs n / (n + k). */
  odds_shrink_k: number;
  /** The airdrop pool's assumed share of the implied value. */
  airdrop_pool: number;
  /** The assumed share of a protocol's TVL that is farmed capital. */
  farmed_fraction: number;
  /** The annual T-bill yield a deposit forgoes while it is farmed. */
  tbill_rate: number;
  /** The deposit basis every farm plan's economics uses. */
  deposit_usd: number;
}

export const MODEL: ModelConstants = {
  growth_floor: -60,
  growth_cap: 120,
  unknown_age_days: 365,
  chain_cap: 10,
  odds_floor: 0.05,
  odds_cap: 0.95,
  odds_shrink_k: 10,
  airdrop_pool: 0.05,
  farmed_fraction: 0.25,
  tbill_rate: 0.04,
  deposit_usd: 1000,
};

/** The model's version label: the dashboard names it. */
export const MODEL_VERSION = 'radar-7';

/** Non-watchlist rows the board carries, so the board holds 250 rows. */
export const EARLY_ROWS = 210;

/** Live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** Bootstrap refits behind every row's rank range (a fixed seed, so the ranges are deterministic). */
export const BOOTSTRAP_DRAWS = 200;

/** A farm step: the action, what it costs, and how long it takes — in words and in numbers. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
  cost_usd: number;
  time_min: number;
}

/** One row's farm economics, on the model's $1,000 deposit basis. */
export interface FarmEconomics {
  deposit_usd: number;
  gas_usd: number;
  tbill_usd: number;
  hold_days: number;
  /** The date to review the position: the snapshot date plus the holding period (YYYY-MM-DD). */
  review_date: string;
  time_min: number;
  expected_value_usd: number;
  net_usd: number;
  net_per_hour_usd: number;
  breakeven_odds: number;
  verdict: 'FARM' | 'THIN' | 'SKIP';
}

/** A bootstrap P10-P90 band for one row: the implied value and the rank it takes when the chosen curve is refitted on resamples of the listed fit pool. */
export interface BootstrapRange {
  implied_lo: number;
  implied_hi: number;
  rank_lo: number;
  rank_hi: number;
}

/** The chosen size curve: log10(mcap) = a + b x log10(TVL) + bridge_shift for bridges, on n listed protocols. */
export interface SizeCurve {
  a: number;
  b: number;
  /** The fitted log10 shift for bridge protocols (0 when the fit has no bridges). */
  bridge_shift: number;
  /** Protocols the curve was fitted on, after trimming. */
  n: number;
  /** Protocols in the fit pool before trimming. */
  pool_n: number;
  /** Protocols trimmed as outliers before the fit. */
  trimmed_n: number;
  /** R^2 of the fitted curve on its kept pool. */
  r2: number;
}

/**
 * The all-terms value fit: log10(mcap) fitted on log10 TVL, the bridge
 * shift, the clamped 7-day growth, log10 age, an age-unknown flag and
 * the capped chain count, by OLS on the same trimmed pool as the chosen
 * curve. Every coefficient is fitted, none is set by hand — and the
 * held-out tests in the backtest show this fit loses to the two-term
 * curve, which is why the board does not use it.
 */
export interface ValueTerms {
  intercept: number;
  log_tvl: number;
  bridge_shift: number;
  growth: number;
  log_age: number;
  age_unknown: number;
  chains: number;
  r2: number;
  n: number;
  pool_n: number;
  trimmed_n: number;
  /** Leave-one-out median miss multiple of this fit (same eval list as the chosen curve). */
  loo_miss: number;
  /** Older-into-newer median miss at the 2024-01-01 split. */
  older_newer_miss: number;
  older_newer_n: number;
  /** Older-into-newer median miss at the 2023-07-01 split. */
  older_newer_2023_miss: number;
  older_newer_2023_n: number;
}

/** Coverage of the prediction intervals for one age group of held-out protocols. */
export interface AgeCoverage {
  n: number;
  p25_p75_coverage: number;
  p10_p90_coverage: number;
}

/** log10(pred/actual) residual quantiles: one prediction interval. */
export interface RangeQuantiles {
  log_q10: number;
  log_q25: number;
  log_q75: number;
  log_q90: number;
}

/** The launch-odds model's hold-out test: does it beat guessing the majority class? */
export interface OddsValidation {
  /** Protocols in the hold-out test. */
  n: number;
  /** Protocols the odds model was fitted on. */
  train_n: number;
  /** Share of the hold-out the odds model calls right at a 50% threshold. */
  accuracy: number;
  /** Share the majority class alone would call right. */
  majority_accuracy: number;
  /** Share of all protocols that have a token (a symbol). */
  base_rate: number;
  /** Area under the ROC curve of the odds model's ranking. */
  auc: number;
  /** The same test under 5-fold cross-validation (every protocol predicted out of fold). */
  accuracy_5fold: number;
  /** Majority-class accuracy under the same 5-fold split. */
  majority_5fold: number;
  /** AUC under the same 5-fold split. */
  auc_5fold: number;
}

/** The leave-one-out backtest on the listed protocols, run once per snapshot. */
export interface Backtest {
  /** Listed protocols the model can price (not an exchange, not a versioned release). */
  n: number;
  /** Median miss multiple of the chosen curve (1.0 is perfect). */
  median_miss: number;
  /** Median miss multiple of the flat multiple baseline. */
  median_miss_flat: number;
  /** Median miss multiple of the two-term curve (log TVL + bridge shift). */
  median_miss_radar6_curve: number;
  /** Median miss multiple of the all-terms fit. */
  median_miss_multiterm: number;
  /** Which curve the board uses: the leave-one-out winner. */
  curve_kind: 'logtvl-bridge' | 'multi-term';
  /** Share of held-out market caps inside the P25-P75 prediction interval. */
  p25_p75_coverage: number;
  /** Share of held-out market caps inside the P10-P90 prediction interval. */
  p10_p90_coverage: number;
  /** log10(pred/actual) residual quantiles, the intervals' edges. */
  log_q10: number;
  log_q25: number;
  log_q75: number;
  log_q90: number;
  /** The whole-snapshot chosen curve, for the dashboard's model note. */
  global_a: number;
  global_b: number;
  global_n: number;
  /** The whole-snapshot curve's bridge shift, trimmed count, pool size and R^2. */
  global_bridge_shift: number;
  global_trimmed: number;
  global_pool_n: number;
  global_r2: number;
  /** The all-terms fit on the whole snapshot, with its own held-out numbers. */
  value_terms: ValueTerms;
  /** Older-into-newer: fit on protocols listed before 2024-01-01, predict those listed after (chosen curve). */
  older_newer_miss: number;
  older_newer_n: number;
  /** Same test at the 2023-07-01 split, as a sensitivity check (chosen curve). */
  older_newer_2023_miss: number;
  older_newer_2023_n: number;
  /** The same two splits for the all-terms fit. */
  older_newer_multiterm_miss: number;
  older_newer_multiterm_n: number;
  older_newer_2023_multiterm_miss: number;
  older_newer_2023_multiterm_n: number;
  /** Interval coverage split by age, against the whole-sample intervals. */
  coverage_by_age: { newer: AgeCoverage; older: AgeCoverage };
  /** Prediction intervals by age group, for the detail view's range. */
  ranges_newer: RangeQuantiles;
  ranges_older: RangeQuantiles;
  /** The launch-odds model's hold-out test. */
  odds: OddsValidation;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  /** What the row's own record does not say: missing growth, unknown age, TVL under the floor, null category, a single chain, or a wrapped, staked or bridged product. */
  integrity: string[];
  model: {
    curve_value: number;
    curve_a: number;
    curve_b: number;
    curve_n: number;
    curve_bridge_shift: number;
    curve_trimmed: number;
    launch_odds: number;
    launch_odds_band_odds: number;
    launch_odds_logit: number;
    launch_odds_n: number;
    launch_odds_band: number;
    launch_odds_band_n: number;
    launch_odds_band_rate: number;
    launch_odds_category: boolean;
    growth_pct: number;
    age_days: number | null;
    chain_count: number;
  };
  economics: FarmEconomics;
  farm_steps: string[];
}

/** The dashboard's compact view of one row. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  /** Bootstrap P10-P90 band of the implied value over 200 refits of the chosen curve. */
  implied_lo: number;
  implied_hi: number;
  /** Bootstrap P10-P90 band of the rank over the same 200 refits. */
  rank_lo: number;
  rank_hi: number;
  curve_value: number;
  curve_a: number;
  curve_b: number;
  curve_n: number;
  curve_bridge_shift: number;
  curve_trimmed: number;
  launch_odds: number;
  launch_odds_band_odds: number;
  launch_odds_logit: number;
  launch_odds_n: number;
  launch_odds_band: number;
  launch_odds_band_n: number;
  launch_odds_band_rate: number;
  launch_odds_category: boolean;
  growth_pct: number;
  chain_count: number;
  integrity: string[];
  economics: FarmEconomics;
  farm_steps: string[];
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** One listed protocol for the value-against-TVL scatter: traded, with a market cap. */
export interface ListedRow {
  slug: string;
  name: string;
  category: string | null;
  tvl_usd: number;
  mcap_usd: number;
}

/** One bucket of the 758-protocol accounting: every protocol in exactly one bucket. */
export interface AccountingRow {
  label: string;
  count: number;
  note: string;
}

/** Everything the dashboard needs: the board, the live set, the backtest, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  /** Bootstrap refits behind every row's rank range (a fixed seed, so the ranges are deterministic). */
  bootstrap_draws: number;
  /** Protocols in the snapshot: the accounting buckets must sum to this. */
  protocols_total: number;
  validation: Backtest;
  accounting: AccountingRow[];
  listed: ListedRow[];
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** Median of a number array; null when empty. */
function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** A value's quantile (linear interpolation) of a sorted array. */
function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo]!;
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
}

/** Quantiles of an array's values, as a RangeQuantiles object. */
function rangeOf(values: number[]): RangeQuantiles {
  const s = [...values].sort((a, b) => a - b);
  return { log_q10: quantile(s, 0.1), log_q25: quantile(s, 0.25), log_q75: quantile(s, 0.75), log_q90: quantile(s, 0.9) };
}

/** R^2 of predictions against actuals. */
function rSquared(actual: number[], predicted: number[]): number {
  if (actual.length === 0) return 0;
  const mean = actual.reduce((s, v) => s + v, 0) / actual.length;
  let ssRes = 0;
  let ssTot = 0;
  for (let i = 0; i < actual.length; i++) {
    ssRes += (actual[i]! - predicted[i]!) * (actual[i]! - predicted[i]!);
    ssTot += (actual[i]! - mean) * (actual[i]! - mean);
  }
  return ssTot > 0 ? 1 - ssRes / ssTot : 0;
}

/** Solve A x = b by Gauss-Jordan elimination with partial pivoting; null when the system is singular. */
function solveLinear(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]!]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r]![c]!) > Math.abs(M[piv]![c]!)) piv = r;
    const tmp = M[c]!;
    M[c] = M[piv]!;
    M[piv] = tmp;
    const d = M[c]![c]!;
    if (Math.abs(d) < 1e-12) return null;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r]![c]! / d;
      for (let k = c; k <= n; k++) M[r]![k]! -= f * M[c]![k]!;
    }
  }
  return M.map((row, i) => row[n]! / M[i]![i]!);
}

/** Least squares for rows x -> y, via the normal equations; null when singular. */
function solveLeastSquares(rows: number[][], ys: number[]): number[] | null {
  const k = rows[0]!.length;
  const A: number[][] = Array.from({ length: k }, () => new Array<number>(k).fill(0));
  const b = new Array<number>(k).fill(0);
  for (let i = 0; i < rows.length; i++) {
    for (let a = 0; a < k; a++) {
      b[a]! += rows[i]![a]! * ys[i]!;
      for (let c = 0; c < k; c++) A[a]![c]! += rows[i]![a]! * rows[i]![c]!;
    }
  }
  return solveLinear(A, b);
}

/** The listed protocols usable for a fit: a positive TVL and a positive market cap. */
function fittable(protocols: SnapshotProtocol[]): SnapshotProtocol[] {
  return protocols.filter((p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0);
}

/** Whether a protocol is a bridge: its TVL is other chains' assets in custody or in transit. */
export function isBridge(p: SnapshotProtocol): boolean {
  return (p.category ?? '').toLowerCase().includes('bridge');
}

/** Whether a protocol has a token: the snapshot records a symbol for it. */
export function hasToken(p: SnapshotProtocol): boolean {
  return p.symbol !== null;
}

/** A protocol's age band: 0 under a year, 1 one to two, 2 two to three, 3 three or more, 4 unknown. */
export function ageBand(age: number | null): number {
  if (age === null) return 4;
  if (age < 365) return 0;
  if (age < 730) return 1;
  if (age < 1095) return 2;
  return 3;
}

/** The age bands' labels, in band order. */
export const AGE_BAND_LABELS = ['under 1 year', '1–2 years', '2–3 years', '3 years or more', 'age unknown'];

/** The 7-day growth in fractions, clamped to the model's range; 0 when unreported. */
export function growthFraction(p: SnapshotProtocol, model: ModelConstants): number {
  return Math.min(model.growth_cap, Math.max(model.growth_floor, finite(p.change_7d, 0))) / 100;
}

/** log10 of a protocol's age in days; the model's unknown-age value when the listing date is missing. */
export function logAge(p: SnapshotProtocol, asOf: string, model: ModelConstants): number {
  const age = ageDays(asOf, p.listed_at);
  return Math.log10(Math.max(30, age ?? model.unknown_age_days));
}

/** The all-terms feature row: [1, log10 TVL, bridge, growth, log10 age, age-unknown, capped chain count]. */
export function valueFeatures(p: SnapshotProtocol, asOf: string, model: ModelConstants): number[] {
  const age = ageDays(asOf, p.listed_at);
  return [
    1,
    Math.log10(Math.max(1, p.tvl_usd)),
    isBridge(p) ? 1 : 0,
    growthFraction(p, model),
    logAge(p, asOf, model),
    age === null ? 1 : 0,
    Math.min(p.chains.length, model.chain_cap),
  ];
}

/**
 * The trimmed fit pool: a plain OLS curve on log10(TVL) alone, then the
 * protocols whose market cap sits more than 2.5 robust (MAD) deviations
 * from it are dropped — one pass. Both the two-term curve and the
 * all-terms fit are fitted on this same kept pool, so their held-out
 * comparison is on identical data. Falls back to the whole pool when
 * the trim would leave too few protocols.
 */
function trimmedPool(listed: SnapshotProtocol[]): { kept: SnapshotProtocol[]; trimmed_n: number } {
  const poolN = listed.length;
  if (poolN < 20) return { kept: listed, trimmed_n: 0 };
  const xs = listed.map((p) => Math.log10(p.tvl_usd));
  const ys = listed.map((p) => Math.log10(p.mcap_usd!));
  const n = listed.length;
  const mx = xs.reduce((s, v) => s + v, 0) / n;
  const my = ys.reduce((s, v) => s + v, 0) / n;
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    sxx += (xs[i]! - mx) * (xs[i]! - mx);
    sxy += (xs[i]! - mx) * (ys[i]! - my);
  }
  const b = sxx > 0 ? sxy / sxx : 0;
  const a = my - b * mx;
  const residuals = listed.map((p) => Math.log10(p.mcap_usd!) - (a + b * Math.log10(p.tvl_usd)));
  const med = median(residuals) ?? 0;
  const mad = (median(residuals.map((r) => Math.abs(r - med))) ?? 0) * 1.4826;
  if (mad <= 0) return { kept: listed, trimmed_n: 0 };
  const kept = listed.filter((_, i) => Math.abs(residuals[i]! - med) <= 2.5 * mad);
  if (kept.length < 20) return { kept: listed, trimmed_n: 0 };
  return { kept, trimmed_n: poolN - kept.length };
}

/**
 * The two-term size curve fitted on `listed`: the trimmed pool, then
 * least squares on [1, log10(TVL), bridge]. The bridge shift is fitted,
 * not assumed: bridges' TVL is other chains' assets, so a dollar of
 * bridge TVL carries a different amount of protocol value. Falls back
 * to the plain curve when the fit is singular.
 */
export function fitCurve(listed: SnapshotProtocol[]): SizeCurve {
  const poolN = listed.length;
  if (poolN === 0) return { a: 0, b: 0, bridge_shift: 0, n: 0, pool_n: 0, trimmed_n: 0, r2: 0 };
  const { kept, trimmed_n } = trimmedPool(listed);
  const coef = solveLeastSquares(
    kept.map((p) => [1, Math.log10(p.tvl_usd), isBridge(p) ? 1 : 0]),
    kept.map((p) => Math.log10(p.mcap_usd!)),
  );
  if (coef === null) {
    const ys = kept.map((p) => Math.log10(p.mcap_usd!));
    return { a: median(ys) ?? 0, b: 0, bridge_shift: 0, n: kept.length, pool_n: poolN, trimmed_n, r2: 0 };
  }
  const predicted = kept.map((p) => coef[0]! + coef[1]! * Math.log10(p.tvl_usd) + coef[2]! * (isBridge(p) ? 1 : 0));
  return {
    a: coef[0]!,
    b: coef[1]!,
    bridge_shift: coef[2]!,
    n: kept.length,
    pool_n: poolN,
    trimmed_n,
    r2: rSquared(kept.map((p) => Math.log10(p.mcap_usd!)), predicted),
  };
}

/**
 * The all-terms value fit on `listed`: the same trimmed pool as the
 * two-term curve, then least squares on every value term — log10 TVL,
 * the bridge shift, the clamped 7-day growth, log10 age, an
 * age-unknown flag and the capped chain count. Every coefficient is
 * fitted from the snapshot; none is set by hand. Two stabilisers keep
 * the fit honest on every split: a feature column that is constant on
 * the fit pool (the age-unknown flag is all zero among protocols
 * listed before 2024, for instance) is dropped with coefficient 0
 * instead of being solved from a singular system, and the four extra
 * terms are ridge-shrunk (penalty 10 on their standardised columns;
 * the intercept, log10 TVL and the bridge shift are not penalised).
 * Without the shrinkage the older-into-newer refits explode — the
 * normal equations are near-singular where log-age barely varies —
 * and the fit predicts market caps millions of times off. The held-out
 * numbers (loo_miss and the older-newer misses) are filled in by
 * backtest(), which refits this function on each split; the
 * whole-snapshot fit carries 0 there until then.
 */
export function fitValueTerms(listed: SnapshotProtocol[], asOf: string, model: ModelConstants): ValueTerms {
  const poolN = listed.length;
  const empty: ValueTerms = {
    intercept: 0, log_tvl: 0, bridge_shift: 0, growth: 0, log_age: 0, age_unknown: 0, chains: 0,
    r2: 0, n: 0, pool_n: poolN, trimmed_n: 0,
    loo_miss: 0, older_newer_miss: 0, older_newer_n: 0, older_newer_2023_miss: 0, older_newer_2023_n: 0,
  };
  if (poolN === 0) return empty;
  const { kept, trimmed_n } = trimmedPool(listed);
  const rows = kept.map((p) => valueFeatures(p, asOf, model));
  const ys = kept.map((p) => Math.log10(p.mcap_usd!));
  const k = 7;
  // The intercept always stays; any other column that is constant on
  // this pool carries no information and is dropped with coefficient 0.
  const keepCols = [0];
  for (let j = 1; j < k; j++) {
    let mn = Infinity;
    let mx = -Infinity;
    for (const r of rows) {
      if (r[j]! < mn) mn = r[j]!;
      if (r[j]! > mx) mx = r[j]!;
    }
    if (mx - mn > 1e-12) keepCols.push(j);
  }
  const extraCols = new Set([3, 4, 5, 6]);
  const means = new Map<number, number>();
  const sds = new Map<number, number>();
  const zRows = rows.map((r) => {
    const z = keepCols.map((j) => r[j]!);
    for (let jj = 0; jj < keepCols.length; jj++) {
      const j = keepCols[jj]!;
      if (extraCols.has(j)) {
        if (!means.has(j)) {
          const vals = rows.map((rr) => rr[j]!);
          const m = vals.reduce((s, v) => s + v, 0) / vals.length;
          const sd = Math.sqrt(vals.reduce((s, v) => s + (v - m) * (v - m), 0) / vals.length);
          means.set(j, m);
          sds.set(j, sd > 0 ? sd : 1);
        }
        z[jj] = (r[j]! - means.get(j)!) / sds.get(j)!;
      }
    }
    return z;
  });
  const kk = keepCols.length;
  const A: number[][] = Array.from({ length: kk }, () => new Array<number>(kk).fill(0));
  const b = new Array<number>(kk).fill(0);
  for (let i = 0; i < zRows.length; i++) {
    for (let a = 0; a < kk; a++) {
      b[a]! += zRows[i]![a]! * ys[i]!;
      for (let c = 0; c < kk; c++) A[a]![c]! += zRows[i]![a]! * zRows[i]![c]!;
    }
  }
  for (let jj = 0; jj < kk; jj++) if (extraCols.has(keepCols[jj]!)) A[jj]![jj]! += 10;
  const beta = solveLinear(A, b);
  if (beta === null) return { ...empty, n: kept.length, trimmed_n };
  const coef = new Array<number>(k).fill(0);
  for (let jj = 0; jj < kk; jj++) {
    const j = keepCols[jj]!;
    coef[j] = extraCols.has(j) ? beta[jj]! / sds.get(j)! : beta[jj]!;
  }
  for (const j of extraCols) {
    if (keepCols.includes(j)) coef[0]! -= coef[j]! * means.get(j)!;
  }
  const predicted = rows.map((r) => r.reduce((s, v, j) => s + v * coef[j]!, 0));
  return {
    intercept: coef[0]!,
    log_tvl: coef[1]!,
    bridge_shift: coef[2]!,
    growth: coef[3]!,
    log_age: coef[4]!,
    age_unknown: coef[5]!,
    chains: coef[6]!,
    r2: rSquared(ys, predicted),
    n: kept.length,
    pool_n: poolN,
    trimmed_n,
    loo_miss: 0,
    older_newer_miss: 0,
    older_newer_n: 0,
    older_newer_2023_miss: 0,
    older_newer_2023_n: 0,
  };
}

/** A fitted value pricer: the curve the board uses, plus the all-terms fit it was chosen against. */
export interface Pricer {
  kind: 'logtvl-bridge' | 'multi-term';
  curve: SizeCurve;
  terms: ValueTerms;
  /** log10 of the predicted market cap for a protocol. */
  predict(p: SnapshotProtocol): number;
}

/**
 * Fit both pricers on a pool and keep the leave-one-out winner — in
 * practice the two-term curve, because the all-terms fit's extra terms
 * carry no out-of-sample signal (see the file header). The choice is
 * made from the numbers, not from a preference: the caller passes the
 * two LOO misses, and the lower one wins.
 */
export function fitPricer(
  listed: SnapshotProtocol[],
  asOf: string,
  model: ModelConstants,
  kind: 'logtvl-bridge' | 'multi-term',
): Pricer {
  const curve = fitCurve(listed);
  const terms = fitValueTerms(listed, asOf, model);
  if (kind === 'multi-term') {
    return {
      kind,
      curve,
      terms,
      predict(p: SnapshotProtocol): number {
        const f = valueFeatures(p, asOf, model);
        const c = [terms.intercept, terms.log_tvl, terms.bridge_shift, terms.growth, terms.log_age, terms.age_unknown, terms.chains];
        return f.reduce((s, v, j) => s + v * c[j]!, 0);
      },
    };
  }
  return {
    kind,
    curve,
    terms,
    predict(p: SnapshotProtocol): number {
      return curve.a + curve.b * Math.log10(Math.max(1, p.tvl_usd)) + (isBridge(p) ? curve.bridge_shift : 0);
    },
  };
}

/** A curve's value at a TVL: 10^(a + b x log10(TVL) + bridge shift when the protocol is a bridge). */
export function curveValue(curve: SizeCurve, tvl: number, bridge: boolean): number {
  return Math.pow(10, curve.a + curve.b * Math.log10(Math.max(1, tvl)) + (bridge ? curve.bridge_shift : 0));
}

/** The flat multiple baseline: median mcap/TVL of `listed`, or null when empty. */
function flatMultiple(listed: SnapshotProtocol[]): number | null {
  const ratios = listed.filter((p) => p.tvl_usd > 0).map((p) => p.mcap_usd! / p.tvl_usd);
  return median(ratios);
}

/** A miss multiple: how many times off a prediction is from the actual, either way. */
function missMultiple(predicted: number, actual: number): number {
  const pr = Math.max(1, predicted);
  return Math.max(pr / actual, actual / pr);
}

/** An older-into-newer test for one pricer kind: fit on protocols listed before `cutoff`, predict the ones after. */
function olderNewer(
  listed: SnapshotProtocol[],
  asOf: string,
  model: ModelConstants,
  kind: 'logtvl-bridge' | 'multi-term',
  cutoff: string,
): { miss: number; n: number } {
  const older = listed.filter((p) => p.listed_at !== null && p.listed_at < cutoff && p.category !== 'CEX');
  const newer = listed.filter((p) => p.listed_at !== null && p.listed_at >= cutoff && isRankableLike(p));
  if (older.length < 5 || newer.length === 0) return { miss: 0, n: newer.length };
  const pricer = fitPricer(older, asOf, model, kind);
  const misses = newer.map((p) => missMultiple(Math.pow(10, pricer.predict(p)), p.mcap_usd!));
  return { miss: median(misses) ?? 0, n: newer.length };
}

/** A logit's inverse, clamped so the odds never leave (0, 1). */
function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, x))));
}

/** log(o / (1 - o)), with the odds first kept inside [0.01, 0.99]. */
function logitOf(o: number): number {
  const c = Math.min(0.99, Math.max(0.01, o));
  return Math.log(c / (1 - c));
}

/**
 * Launch odds from the age band x category rate: among protocols in the
 * same age band, the share that has a token; a category's rate inside the
 * band is shrunk toward the band rate with weight n / (n + k). Clamped to
 * the model's odds range.
 */
export function launchOdds(
  protocols: SnapshotProtocol[],
  asOf: string,
  protocol: SnapshotProtocol,
  model: ModelConstants,
): { odds: number; n: number; band: number; band_n: number; band_rate: number; perCategory: boolean } {
  const band = ageBand(ageDays(asOf, protocol.listed_at));
  const inBand = protocols.filter((p) => ageBand(ageDays(asOf, p.listed_at)) === band);
  const share = (list: SnapshotProtocol[]): number => (list.length === 0 ? 0.55 : list.filter(hasToken).length / list.length);
  const bandRate = share(inBand);
  const clamp = (v: number) => Math.min(model.odds_cap, Math.max(model.odds_floor, v));
  if (protocol.category !== null) {
    const catInBand = inBand.filter((p) => p.category === protocol.category);
    if (catInBand.length > 0) {
      const w = catInBand.length / (catInBand.length + model.odds_shrink_k);
      return {
        odds: clamp(w * share(catInBand) + (1 - w) * bandRate),
        n: catInBand.length,
        band,
        band_n: inBand.length,
        band_rate: bandRate,
        perCategory: true,
      };
    }
  }
  return { odds: clamp(bandRate), n: inBand.length, band, band_n: inBand.length, band_rate: bandRate, perCategory: false };
}

/** Categories with at least this many protocols in the training set get their own dummy in the logistic odds model. */
const LOGIT_MIN_CATEGORY = 25;
/** Ridge penalty on the logistic model's non-intercept coefficients. */
const LOGIT_LAMBDA = 10;

/** The logistic odds model's features: one dummy per age band, one per frequent category, plus log10 TVL, the clamped 7-day growth, the chain count and log10 age. */
function logitFeatures(asOf: string, topCats: string[], p: SnapshotProtocol): number[] {
  const band = ageBand(ageDays(asOf, p.listed_at));
  const feats = [0, 0, 0, 0, 0];
  feats[band] = 1;
  for (const c of topCats) feats.push(p.category === c ? 1 : 0);
  const age = ageDays(asOf, p.listed_at);
  feats.push(Math.log10(Math.max(1, p.tvl_usd)));
  feats.push(Math.min(MODEL.growth_cap, Math.max(MODEL.growth_floor, finite(p.change_7d, 0))) / 100);
  feats.push(Math.min(p.chains.length, 5));
  feats.push(Math.log10(Math.max(30, age ?? MODEL.unknown_age_days)));
  return feats;
}

/**
 * A ridge logistic regression for "has a token", fitted by iteratively
 * reweighted least squares on `train`. Deterministic: a fixed iteration
 * cap, a fixed ridge, no random start. Returns a function from a
 * protocol to its fitted probability. The continuous columns are
 * standardised; the dummies and the intercept are left alone apart
 * from mean-centring the dummies.
 */
function fitLogitModel(train: SnapshotProtocol[], asOf: string): (p: SnapshotProtocol) => number {
  const counts = new Map<string, number>();
  for (const p of train) if (p.category !== null) counts.set(p.category, (counts.get(p.category) ?? 0) + 1);
  const topCats = [...counts.entries()]
    .filter(([, n]) => n >= LOGIT_MIN_CATEGORY)
    .map(([c]) => c)
    .sort();
  const rows = train.map((p) => ({ x: [1, ...logitFeatures(asOf, topCats, p)], y: hasToken(p) ? 1 : 0 }));
  const k = rows[0]!.x.length;
  const means = new Array<number>(k).fill(0);
  const sds = new Array<number>(k).fill(1);
  for (let j = 1; j < k; j++) {
    const vals = rows.map((r) => r.x[j]!);
    const m = vals.reduce((s, v) => s + v, 0) / vals.length;
    const sd = Math.sqrt(vals.reduce((s, v) => s + (v - m) * (v - m), 0) / vals.length);
    const isDummy = vals.every((v) => v === 0 || v === 1);
    means[j] = m;
    sds[j] = isDummy ? 1 : sd > 0 ? sd : 1;
  }
  const zOf = (x: number[]): number[] => x.map((v, j) => (v - means[j]!) / sds[j]!);
  let beta = new Array<number>(k).fill(0);
  for (let it = 0; it < 60; it++) {
    const A: number[][] = Array.from({ length: k }, () => new Array<number>(k).fill(0));
    const g = new Array<number>(k).fill(0);
    for (const r of rows) {
      const z = zOf(r.x);
      const eta = z.reduce((s, v, j) => s + beta[j]! * v, 0);
      const pr = sigmoid(eta);
      const w = Math.max(pr * (1 - pr), 1e-6);
      for (let i = 0; i < k; i++) {
        g[i]! += (r.y - pr) * z[i]!;
        for (let j = 0; j < k; j++) A[i]![j]! += w * z[i]! * z[j]!;
      }
    }
    for (let i = 1; i < k; i++) A[i]![i]! += LOGIT_LAMBDA;
    const step = solveLinear(A, g);
    if (step === null) break;
    beta = beta.map((b, i) => b + step[i]!);
    if (Math.max(...step.map(Math.abs)) < 1e-6) break;
  }
  return (p: SnapshotProtocol) => {
    const z = zOf([1, ...logitFeatures(asOf, topCats, p)]);
    return sigmoid(z.reduce((s, v, j) => s + beta[j]! * v, 0));
  };
}

/** One protocol's launch odds from a fitted odds model: the ensemble value plus its two components. */
export interface OddsPrediction {
  odds: number;
  bandOdds: number;
  logitOdds: number;
  band: number;
  band_n: number;
  band_rate: number;
  perCategory: boolean;
  n: number;
}

/** A fitted launch-odds model: call predict on any protocol in the snapshot. */
export interface OddsModel {
  predict(p: SnapshotProtocol): OddsPrediction;
}

/**
 * The launch-odds model, fitted once on `protocols`: the average, in logit
 * space, of the age-band x category rate and the ridge logistic regression
 * above. Both components are fitted on the same protocols, so a hold-out
 * test fits this whole function on its train half and calls it on the test
 * half — nothing about a test protocol leaks into its own odds.
 */
export function fitOddsModel(protocols: SnapshotProtocol[], asOf: string, model: ModelConstants): OddsModel {
  const logitPredict = fitLogitModel(protocols, asOf);
  return {
    predict(p: SnapshotProtocol): OddsPrediction {
      const band = launchOdds(protocols, asOf, p, model);
      const lo = logitPredict(p);
      const odds = sigmoid((logitOf(band.odds) + logitOf(lo)) / 2);
      return {
        odds,
        bandOdds: band.odds,
        logitOdds: lo,
        band: band.band,
        band_n: band.band_n,
        band_rate: band.band_rate,
        perCategory: band.perCategory,
        n: band.n,
      };
    },
  };
}

/** Area under the ROC curve for scored hold-out protocols. */
function aucOf(scored: { actual: boolean; odds: number }[]): number {
  const pos = scored.filter((s) => s.actual).map((s) => s.odds);
  const neg = scored.filter((s) => !s.actual).map((s) => s.odds);
  let wins = 0;
  let ties = 0;
  for (const a of pos) {
    for (const b of neg) {
      if (a > b) wins++;
      else if (a === b) ties++;
    }
  }
  return pos.length > 0 && neg.length > 0 ? (wins + 0.5 * ties) / (pos.length * neg.length) : 0.5;
}

/**
 * The launch-odds model's hold-out tests. Protocols are split by slug
 * order (even positions train, odd positions test); the model is fitted
 * on the train half and called on the test half at a 50% threshold. The
 * same test is repeated as 5-fold cross-validation, so every protocol
 * is predicted once out of fold.
 */
export function oddsValidation(snapshot: Snapshot, model: ModelConstants = MODEL): OddsValidation {
  const sorted = [...snapshot.protocols].sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  const train = sorted.filter((_, i) => i % 2 === 0);
  const test = sorted.filter((_, i) => i % 2 === 1);
  const oddsModel = fitOddsModel(train, snapshot.as_of, model);
  const scored = test.map((p) => ({ actual: hasToken(p), odds: oddsModel.predict(p).odds }));
  const correct = scored.filter((s) => (s.odds > 0.5) === s.actual).length;
  const positives = scored.filter((s) => s.actual).length;
  const majority = Math.max(positives, scored.length - positives) / scored.length;
  const all: { actual: boolean; odds: number }[] = [];
  for (let fold = 0; fold < 5; fold++) {
    const te = sorted.filter((_, i) => i % 5 === fold);
    const tr = sorted.filter((_, i) => i % 5 !== fold);
    const m = fitOddsModel(tr, snapshot.as_of, model);
    for (const p of te) all.push({ actual: hasToken(p), odds: m.predict(p).odds });
  }
  const correct5 = all.filter((s) => (s.odds > 0.5) === s.actual).length;
  const positives5 = all.filter((s) => s.actual).length;
  const majority5 = Math.max(positives5, all.length - positives5) / all.length;
  return {
    n: test.length,
    train_n: train.length,
    accuracy: scored.length === 0 ? 0 : correct / scored.length,
    majority_accuracy: majority,
    base_rate: snapshot.protocols.filter(hasToken).length / snapshot.protocols.length,
    auc: aucOf(scored),
    accuracy_5fold: all.length === 0 ? 0 : correct5 / all.length,
    majority_5fold: majority5,
    auc_5fold: aucOf(all),
  };
}

/**
 * The leave-one-out test for both pricers on the same eval list, plus
 * the flat baseline. For each listed protocol the model can price, both
 * pricers are fitted on the other listed non-exchange protocols. The
 * winner's out-of-fold log predictions are kept, so backtest() can
 * build its prediction intervals without refitting anything.
 */
function looMisses(snapshot: Snapshot, model: ModelConstants): {
  evalList: SnapshotProtocol[];
  missesCurve: number[];
  missesTerms: number[];
  missesFlat: number[];
  winnerLogPred: number[];
  kind: 'logtvl-bridge' | 'multi-term';
} {
  const listed = fittable(snapshot.protocols);
  const fitPool = listed.filter((p) => p.category !== 'CEX');
  const evalList = listed.filter(isRankableLike);
  const missesCurve: number[] = [];
  const missesTerms: number[] = [];
  const missesFlat: number[] = [];
  const logPredCurve: number[] = [];
  const logPredTerms: number[] = [];
  for (const p of evalList) {
    const train = fitPool.filter((q) => q.slug !== p.slug);
    const pricerCurve = fitPricer(train, snapshot.as_of, model, 'logtvl-bridge');
    const pricerTerms = fitPricer(train, snapshot.as_of, model, 'multi-term');
    const actual = p.mcap_usd!;
    logPredCurve.push(pricerCurve.predict(p));
    logPredTerms.push(pricerTerms.predict(p));
    missesCurve.push(missMultiple(Math.pow(10, pricerCurve.predict(p)), actual));
    missesTerms.push(missMultiple(Math.pow(10, pricerTerms.predict(p)), actual));
    const catOthers = listed.filter((q) => q.slug !== p.slug && q.category === p.category);
    const flatList = p.category !== null && catOthers.length >= 2 ? catOthers : listed.filter((q) => q.slug !== p.slug);
    const mult = flatMultiple(flatList) ?? 0.25;
    missesFlat.push(missMultiple(p.tvl_usd * mult, actual));
  }
  const looCurve = median(missesCurve) ?? 0;
  const looTerms = median(missesTerms) ?? 0;
  const kind: 'logtvl-bridge' | 'multi-term' = looCurve <= looTerms ? 'logtvl-bridge' : 'multi-term';
  return {
    evalList,
    missesCurve,
    missesTerms,
    missesFlat,
    winnerLogPred: kind === 'logtvl-bridge' ? logPredCurve : logPredTerms,
    kind,
  };
}

/** The leave-one-out winner, from the held-out numbers alone — the only curve decision buildBoard needs. */
export function chooseCurveKind(snapshot: Snapshot, model: ModelConstants = MODEL): 'logtvl-bridge' | 'multi-term' {
  return looMisses(snapshot, model).kind;
}

/**
 * The backtest: three held-out tests of the value model, on the same
 * eval list for both pricers — (a) leave-one-out, (b) older-into-newer
 * at 2024-01-01, (c) older-into-newer at 2023-07-01 — plus the flat
 * multiple baseline, the prediction intervals and their coverage split
 * by age, and the launch-odds hold-out tests. The board's curve is
 * whichever pricer wins the leave-one-out test; the loser is reported
 * beside it, not hidden.
 */
export function backtest(snapshot: Snapshot, model: ModelConstants = MODEL): Backtest {
  const listed = fittable(snapshot.protocols);
  const fitPool = listed.filter((p) => p.category !== 'CEX');
  const loo = looMisses(snapshot, model);
  const evalList = loo.evalList;
  const looCurve = median(loo.missesCurve) ?? 0;
  const looTerms = median(loo.missesTerms) ?? 0;
  const winner = loo.kind;
  const residuals = evalList.map((p, i) => ({
    r: Math.log10(Math.max(1, Math.pow(10, loo.winnerLogPred[i]!)) / p.mcap_usd!),
    age: ageDays(snapshot.as_of, p.listed_at),
  }));
  const sortedRes = residuals.map((x) => x.r).sort((a, b) => a - b);
  const q10 = quantile(sortedRes, 0.1);
  const q25 = quantile(sortedRes, 0.25);
  const q75 = quantile(sortedRes, 0.75);
  const q90 = quantile(sortedRes, 0.9);
  const inRange = (list: { r: number }[], lo: number, hi: number): number => {
    if (list.length === 0) return 0;
    return list.filter((x) => x.r >= lo && x.r <= hi).length / list.length;
  };
  const newer = residuals.filter((x) => x.age !== null && x.age < 730);
  const older = residuals.filter((x) => x.age !== null && x.age >= 730);
  const global = fitCurve(fitPool);
  const globalTerms = fitValueTerms(fitPool, snapshot.as_of, model);
  const on2024Curve = olderNewer(listed, snapshot.as_of, model, 'logtvl-bridge', '2024-01-01');
  const on2023Curve = olderNewer(listed, snapshot.as_of, model, 'logtvl-bridge', '2023-07-01');
  const on2024Terms = olderNewer(listed, snapshot.as_of, model, 'multi-term', '2024-01-01');
  const on2023Terms = olderNewer(listed, snapshot.as_of, model, 'multi-term', '2023-07-01');
  const valueTerms: ValueTerms = {
    ...globalTerms,
    loo_miss: looTerms,
    older_newer_miss: on2024Terms.miss,
    older_newer_n: on2024Terms.n,
    older_newer_2023_miss: on2023Terms.miss,
    older_newer_2023_n: on2023Terms.n,
  };
  return {
    n: evalList.length,
    median_miss: winner === 'logtvl-bridge' ? looCurve : looTerms,
    median_miss_flat: median(loo.missesFlat) ?? 0,
    median_miss_radar6_curve: looCurve,
    median_miss_multiterm: looTerms,
    curve_kind: winner,
    p25_p75_coverage: inRange(residuals, q25, q75),
    p10_p90_coverage: inRange(residuals, q10, q90),
    log_q10: q10,
    log_q25: q25,
    log_q75: q75,
    log_q90: q90,
    global_a: global.a,
    global_b: global.b,
    global_n: global.n,
    global_bridge_shift: global.bridge_shift,
    global_trimmed: global.trimmed_n,
    global_pool_n: global.pool_n,
    global_r2: global.r2,
    value_terms: valueTerms,
    older_newer_miss: winner === 'logtvl-bridge' ? on2024Curve.miss : on2024Terms.miss,
    older_newer_n: winner === 'logtvl-bridge' ? on2024Curve.n : on2024Terms.n,
    older_newer_2023_miss: winner === 'logtvl-bridge' ? on2023Curve.miss : on2023Terms.miss,
    older_newer_2023_n: winner === 'logtvl-bridge' ? on2023Curve.n : on2023Terms.n,
    older_newer_multiterm_miss: on2024Terms.miss,
    older_newer_multiterm_n: on2024Terms.n,
    older_newer_2023_multiterm_miss: on2023Terms.miss,
    older_newer_2023_multiterm_n: on2023Terms.n,
    coverage_by_age: {
      newer: { n: newer.length, p25_p75_coverage: inRange(newer, q25, q75), p10_p90_coverage: inRange(newer, q10, q90) },
      older: { n: older.length, p25_p75_coverage: inRange(older, q25, q75), p10_p90_coverage: inRange(older, q10, q90) },
    },
    ranges_newer: rangeOf(newer.map((x) => x.r)),
    ranges_older: rangeOf(older.map((x) => x.r)),
    odds: oddsValidation(snapshot, model),
  };
}

/** The multipliers and the implied value one protocol gets. No hand multiplier: implied = curve value x launch odds. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  pricer: Pricer,
  odds: number,
  model: ModelConstants,
): { implied: number; curveVal: number; growthPct: number; age: number | null; chainCount: number } {
  const age = ageDays(asOf, protocol.listed_at);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, finite(protocol.change_7d, 0)));
  const curveVal = Math.pow(10, pricer.predict(protocol));
  const implied = Math.max(1, Math.round(curveVal * odds));
  return { implied, curveVal, growthPct, age, chainCount: protocol.chains.length };
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Whether a listed protocol is one the model can price: not an exchange, not a versioned pool. */
export function isRankableLike(p: SnapshotProtocol): boolean {
  return p.category !== 'CEX' && !VERSIONED.test(p.name);
}

/** Whether a protocol is one the board may rank: pre-token, not an exchange, not a versioned pool. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSIONED.test(p.name);
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** A whole number with thousands separators, without depending on a locale. */
function fmtInt(n: number): string {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** A per-transaction gas estimate in dollars: first transaction, deposit, one weekly action, exit. These are estimates, not measurements — Ethereum is the expensive tier ($5–30 a transaction), L2s and cheap L1s cost cents, and any chain not listed falls in the $1 default tier, which is a deliberately conservative guess. */
export interface GasTier {
  first: number;
  deposit: number;
  weekly: number;
  exit: number;
}

const GAS_ETHEREUM: GasTier = { first: 12, deposit: 18, weekly: 6, exit: 12 };
const GAS_BITCOIN: GasTier = { first: 5, deposit: 5, weekly: 2, exit: 5 };
const GAS_SOLANA: GasTier = { first: 0.05, deposit: 0.05, weekly: 0.02, exit: 0.05 };
const GAS_L2: GasTier = { first: 0.5, deposit: 0.5, weekly: 0.2, exit: 0.3 };
const GAS_BSC: GasTier = { first: 0.3, deposit: 0.3, weekly: 0.1, exit: 0.2 };
const GAS_POLYGON: GasTier = { first: 0.1, deposit: 0.1, weekly: 0.05, exit: 0.1 };
const GAS_AVALANCHE: GasTier = { first: 0.5, deposit: 0.5, weekly: 0.2, exit: 0.3 };
const GAS_TRON: GasTier = { first: 1, deposit: 1, weekly: 0.5, exit: 1 };
const GAS_CHEAP_L1: GasTier = { first: 0.1, deposit: 0.1, weekly: 0.05, exit: 0.1 };
const GAS_DEFAULT: GasTier = { first: 1, deposit: 1, weekly: 0.5, exit: 1 };

/** Ethereum L2s and L2-like chains in the snapshot: cents a transaction. */
const GAS_L2_CHAINS = new Set([
  'Arbitrum', 'Arbitrum Nova', 'Base', 'Optimism', 'Unichain', 'Linea', 'Scroll', 'zkSync Era', 'Ink', 'Mode',
  'Blast', 'Mantle', 'World Chain', 'Zora', 'Soneium', 'Manta', 'Taiko', 'Metis', 'Boba', 'Boba_Bnb', 'Boba_Avax',
  'Fraxtal', 'Op_Bnb', 'Polygon zkEVM', 'Starknet', 'Reya Network', 'RISE', 'X Layer', 'Morph', 'ApeChain',
  'Abstract', 'Katana', 'Lisk', 'Plume', 'Plume Mainnet', 'Sophon', 'Zircuit', 'Kroma', 'Zkfair', 'Etherlink',
  'Cronos zkEVM', 'Astar zkEVM', 'Swellchain', 'Corn', 'BOB', 'Hemi', 'Bitlayer', 'Merlin', 'BSquared',
]);

/** Cheap non-Ethereum L1s in the snapshot: about ten cents a transaction. */
const GAS_CHEAP_L1_CHAINS = new Set([
  'Sui', 'Aptos', 'Near', 'Hyperliquid L1', 'Cosmos', 'Osmosis', 'Injective', 'Sei', 'Stellar', 'Ripple',
  'Algorand', 'TON', 'Hedera', 'Cardano', 'Flow', 'Celestia', 'Stride', 'Neutron', 'Kava', 'Evmos', 'Fantom',
  'Sonic', 'Celo', 'Moonbeam', 'Moonriver', 'Cronos', 'Berachain', 'Monad', 'MegaETH', 'Tempo', 'Stable',
  'Flare', 'Sei', 'ZetaChain', 'XION', 'Saga', 'Initia', 'Dymension', 'Noble', 'Provenance', 'Stacks',
]);

/** The gas tier for a chain, by name. */
export function gasTierFor(chain: string): GasTier {
  if (chain === 'Ethereum') return GAS_ETHEREUM;
  if (chain === 'Bitcoin' || chain === 'Litecoin' || chain === 'Doge' || chain === 'Bitcoincash' || chain === 'Zcash') return GAS_BITCOIN;
  if (chain === 'Solana') return GAS_SOLANA;
  if (chain === 'Binance') return GAS_BSC;
  if (chain === 'Polygon') return GAS_POLYGON;
  if (chain === 'Avalanche') return GAS_AVALANCHE;
  if (chain === 'Tron') return GAS_TRON;
  if (GAS_L2_CHAINS.has(chain)) return GAS_L2;
  if (GAS_CHEAP_L1_CHAINS.has(chain)) return GAS_CHEAP_L1;
  return GAS_DEFAULT;
}

/** A dollar amount as "$12" or "$0.05": whole dollars without decimals, cents with two. */
function fmtUsd(n: number): string {
  const r = Math.round(n * 100) / 100;
  return Number.isInteger(r) ? `$${r}` : `$${r.toFixed(2)}`;
}

/** One protocol's farm plan in words: the deposit action, the weekly action that keeps it qualifying, and what it costs beyond gas. `clear` is false when the protocol takes no deposit for points, so the steps say so instead of inventing a path. */
export interface FarmPlan {
  clear: boolean;
  action: string;
  weekly: string;
  fee: string;
}

/** Why a category has no clear farm path: the protocol is not an app that takes a deposit for points. 'chain' is matched exactly — "Cross Chain Bridge" is a bridge, not a chain. */
const NO_FARM_PATH_REASON: [string, string][] = [
  ['anchor btc', 'it issues a BTC-pegged asset rather than taking a deposit for points; holding it earns no farm activity by itself'],
  ['decentralized btc', 'it issues a BTC-pegged asset rather than taking a deposit for points; holding it earns no farm activity by itself'],
  ['nft marketplace', 'buying an NFT is a purchase, not a deposit that earns points'],
  ['token locker', 'locking needs the protocol\u2019s own token, which does not trade yet'],
  ['governance incentives', 'its incentives pay for governance activity, not for a deposit'],
  ['indexes', 'an index is a basket to hold, not a farm; holding it earns no points by itself'],
  ['dor', 'its rate product takes no deposit for points'],
  ['privacy', 'a privacy app takes no deposit that earns points'],
  ['ai agents', 'an agent app, not a deposit-taking protocol'],
  ['decentralized ai', 'an agent app, not a deposit-taking protocol'],
  ['otc marketplace', 'an OTC desk for trades, not a farm'],
  ['crypto card', 'a card product, not a deposit that earns points'],
  ['reserve currency', 'a reserve asset to hold, not a farm'],
];

/** The no-farm-path reason for a lowercased category, or null when it has a clear path. */
function noFarmPathReason(c: string): string | null {
  if (c === 'chain') return 'it is a blockchain, not an app that takes a deposit — farming it would mean using apps built on it, which this plan does not cover';
  for (const [key, reason] of NO_FARM_PATH_REASON) if (c.includes(key)) return reason;
  return null;
}

/** Whether a protocol has a clear farm path: its category takes a deposit for points. */
export function hasClearFarmPath(p: SnapshotProtocol): boolean {
  return noFarmPathReason((p.category ?? '').toLowerCase()) === null;
}

/** The category's farm plan, naming the protocol and its chain, with the fee or slippage to expect. No venue name is ever invented: the protocol itself is the venue, and where a swap is needed the plan says "the chain's main DEX" rather than guessing which one that is. */
export function farmPlanFor(p: SnapshotProtocol, chain: string): FarmPlan {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  const noPath = noFarmPathReason(c);
  if (noPath !== null) {
    return {
      clear: false,
      action: `There is no clear farm path for ${name}: ${noPath}. Do not deposit the $1,000 on a guess.`,
      weekly: `No weekly action: there is no clear farm path for ${name}, so do not spend gas chasing one.`,
      fee: '',
    };
  }
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) {
    return {
      clear: true,
      action: `Supply $1,000 of USDC to the lending market of ${name} on ${chain} and leave it supplied; borrowing against it is optional.`,
      weekly: `Top up the supply by $10–25, or repay a small borrow and re-supply it, on ${name}.`,
      fee: `Supplying costs only gas; the borrow rate applies only if you borrow.`,
    };
  }
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm') || c.includes('liquidity manager') || c === 'farm') {
    return {
      clear: true,
      action: `Add $1,000 of liquidity to the main pool of ${name} on ${chain} — usually the USDC pair — and leave the position open.`,
      weekly: `Swap $10–25 through the main pool of ${name} on ${chain}.`,
      fee: `The pool's fee tier (often 0.3% on swaps) applies when others trade; a $1,000 add in the main pool should slip under 0.5%.`,
    };
  }
  if (c.includes('bridge')) {
    return {
      clear: true,
      action: `Bridge $1,000 of USDC to ${chain} through ${name}, from the chain where your USDC sits, then use the bridged funds inside its app on ${chain}.`,
      weekly: `Bridge $10–25 back through ${name}, or use the bridged funds in its app on ${chain}.`,
      fee: `The bridge fee runs roughly 0.1–0.5% of the amount, plus gas on ${chain}.`,
    };
  }
  if (c.includes('staking') || c.includes('restak')) {
    return {
      clear: true,
      action: `Stake $1,000 of the chain's staking asset through ${name} on ${chain} and hold the receipt token.`,
      weekly: `Claim or restake any rewards the app shows; otherwise just check the position.`,
      fee: `No swap fee; the receipt token tracks the staked asset plus any staking yield.`,
    };
  }
  if (c.includes('synthetic')) {
    return {
      clear: true,
      action: `Deposit $1,000 of USDC as collateral on ${name} on ${chain} and mint a small synthetic position.`,
      weekly: `Adjust the collateral or the synthetic position by $10–25 on ${name}.`,
      fee: `Minting may carry a small fee; the collateral stays yours unless the position is liquidated.`,
    };
  }
  if (c.includes('curator') || c.includes('allocator') || c.includes('risk') || c.includes('vault')) {
    return {
      clear: true,
      action: `Put $1,000 into a ${name} vault on ${chain} and hold the vault shares.`,
      weekly: `Check the vault's points page and top up by $10–25 if the vault accepts it.`,
      fee: `The vault's management and performance fee applies; read it on the vault page before depositing.`,
    };
  }
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('basis trading') || c.includes('options')) {
    return {
      clear: true,
      action: `Deposit $1,000 of USDC as margin on ${name} on ${chain} and open one small hedged trade.`,
      weekly: `Close and reopen the hedge once, or adjust the margin by $10–25, on ${name}.`,
      fee: `Taker fees and funding apply per trade, roughly 0.02–0.1% a fill; keep the trade small and hedged.`,
    };
  }
  if (c.includes('prediction')) {
    return {
      clear: true,
      action: `Fund an account on ${name} on ${chain} with $1,000 and take one position in a market.`,
      weekly: `Take a small position ($10–25) in a new market on ${name}.`,
      fee: `The market's spread is the cost; there is no fee to hold a position.`,
    };
  }
  if (c.includes('stable')) {
    return {
      clear: true,
      action: `Mint or hold $1,000 of the stable asset issued through ${name} on ${chain}.`,
      weekly: `Check the peg and the position; top up by $10–25 if the mint is open.`,
      fee: `Minting may carry a small fee; check the mint page.`,
    };
  }
  if (c.includes('rwa')) {
    return {
      clear: true,
      action: `Mint $1,000 of the yield-bearing asset from ${name} on ${chain} and hold it.`,
      weekly: `Check the position and any distributions; top up by $10–25 if the mint is open.`,
      fee: `The asset's yield is the return; minting may carry a small fee.`,
    };
  }
  if (c.includes('insurance')) {
    return {
      clear: true,
      action: `Buy $1,000 of cover from ${name} on ${chain} and keep the policy active.`,
      weekly: `Check the policy stays active; no weekly trade is needed.`,
      fee: `The premium is the cost, priced per $1,000 of cover.`,
    };
  }
  if (c.includes('payment')) {
    return {
      clear: true,
      action: `Pay $1,000 through ${name} on ${chain} and keep the payment receipt.`,
      weekly: `Make one small payment ($10–25) through ${name} on ${chain}.`,
      fee: `The network fee is the gas on ${chain}.`,
    };
  }
  return {
    clear: true,
    action: `Deposit $1,000 of USDC into ${name} on ${chain} and leave the position open.`,
    weekly: `Make one small qualifying action — a deposit, a swap or a vote — on ${name}.`,
    fee: `No fee beyond gas is stated on the protocol's own page; check it before depositing.`,
  };
}

/**
 * A protocol's farm plan: seven steps, each an action with a cost and a time,
 * in words and in numbers. The plan is derived from the protocol's own
 * record (category, chains, TVL, age), never from a hand-written list of
 * names — the protocol itself is the venue, and the gas is costed for its
 * first chain (Ethereum expensive, L2s and cheap L1s cents). Every plan
 * uses the same $1,000 deposit basis the economics use, except the rows
 * whose category takes no deposit for points: their steps say there is no
 * clear farm path instead of inventing one. The seventh step is the exit
 * rule: when to unwind, so a farm that goes wrong is closed instead of
 * ridden down.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null, asOf: string): FarmStep[] {
  const chain = chainOf(p);
  const gas = gasTierFor(chain);
  const hold = holdDaysFor(age);
  const weeks = Math.ceil(hold / 7);
  const plan = farmPlanFor(p, chain);
  const others = p.chains.length > 1 ? ` Do the same on ${p.chains[1]} when the protocol runs there, so the activity spans chains.` : '';
  const review = new Date(Date.parse(`${asOf}T00:00:00Z`) + hold * DAY_MS).toISOString().slice(0, 10);
  const weeklyTotal = Math.round(gas.weekly * weeks * 100) / 100;
  const wallet: FarmStep = {
    text: `Open a fresh wallet that holds only the funds you mean to farm, and store its seed phrase offline where no one else can read it.`,
    cost: `about ${fmtUsd(gas.first)} of gas on ${chain} for the first transaction`,
    time: '5 minutes',
    cost_usd: gas.first,
    time_min: 5,
  };
  const claim: FarmStep = {
    text: `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes itself.`,
    cost: 'no fee to check, and never pay to claim',
    time: '10 minutes',
    cost_usd: 0,
    time_min: 10,
  };
  const log: FarmStep = {
    text: `Write the wallet, the dates and every transaction in a farm log, so you can repeat the position or unwind it later.`,
    cost: 'nothing but the log',
    time: '5 minutes',
    cost_usd: 0,
    time_min: 5,
  };
  if (!plan.clear) {
    return [
      wallet,
      {
        text: plan.action,
        cost: 'no deposit is made on this plan',
        time: '5 minutes to check',
        cost_usd: 0,
        time_min: 5,
      },
      {
        text: plan.weekly,
        cost: 'nothing',
        time: '5 minutes',
        cost_usd: 0,
        time_min: 5,
      },
      {
        text: `No position is open, so there is nothing to hold; revisit ${p.name} only if it publishes a points program.`,
        cost: 'nothing is locked up',
        time: `${hold} days`,
        cost_usd: 0,
        time_min: 0,
      },
      claim,
      log,
      {
        text: `Exit rule: there is no position to unwind — do not deposit on a guess. Review whether ${p.name} has published a farm path on ${review}.`,
        cost: 'nothing to unwind',
        time: '5 minutes',
        cost_usd: 0,
        time_min: 5,
      },
    ];
  }
  return [
    wallet,
    {
      text: `${plan.action} ${plan.fee}`,
      cost: `$1,000 of capital and about ${fmtUsd(gas.deposit)} of gas on ${chain}`,
      time: '15 minutes to set up',
      cost_usd: gas.deposit,
      time_min: 15,
    },
    {
      text: `${plan.weekly}${others}`,
      cost: `about ${fmtUsd(gas.weekly)} of gas a week on ${chain}, ${fmtUsd(weeklyTotal)} over ${weeks} weeks`,
      time: `${10 * weeks} minutes over ${weeks} weeks`,
      cost_usd: weeklyTotal,
      time_min: 10 * weeks,
    },
    {
      text: `Keep the position open for at least ${hold} days, so the activity is counted in more than one snapshot.`,
      cost: `the $1,000 stays in the position`,
      time: `${hold} days`,
      cost_usd: 0,
      time_min: 0,
    },
    claim,
    log,
    {
      text: `Exit rule: unwind if ${p.name}'s TVL stays below $${fmtInt(p.tvl_usd / 2)} — half its current TVL — for a week, if the position loses more than 20% to fees or price moves, or after ${hold} days; review the position on ${review}.`,
      cost: `about ${fmtUsd(gas.exit)} of gas to unwind on ${chain}`,
      time: '10 minutes to unwind',
      cost_usd: gas.exit,
      time_min: 10,
    },
  ];
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/**
 * A row's farm economics, on the model's $1,000 deposit basis. The expected
 * airdrop value is implied value x launch odds x the airdrop pool's share
 * of implied value x the farmer's share of the farmed capital (a $1,000
 * deposit over the farmed fraction of the protocol's TVL). Net is that
 * expected value minus the plan's gas minus the T-bill yield the deposit
 * forgoes over the holding period; net per hour divides by the plan's
 * active minutes; break-even odds is the launch odds at which the expected
 * value exactly pays the gas and the forgone yield. The pool share, the
 * farmed fraction and the T-bill rate are stated assumptions, not snapshot
 * facts. When a row has no clear farm path (`farmable` false), there is no
 * position to earn an airdrop from, so the expected value is zero and the
 * verdict is SKIP — the steps say so, and the economics agree with them.
 */
export function farmEconomics(
  implied: number,
  odds: number,
  tvl: number,
  steps: FarmStep[],
  holdDays: number,
  asOf: string,
  model: ModelConstants = MODEL,
  farmable = true,
): FarmEconomics {
  const gas = steps.reduce((s, st) => s + st.cost_usd, 0);
  const timeMin = steps.reduce((s, st) => s + st.time_min, 0);
  const farmedCapital = Math.max(1, model.farmed_fraction * tvl);
  const farmerShare = model.deposit_usd / farmedCapital;
  const expected = farmable ? implied * odds * model.airdrop_pool * farmerShare : 0;
  const tbill = (model.deposit_usd * model.tbill_rate * holdDays) / 365;
  const net = expected - gas - tbill;
  const hours = timeMin / 60;
  const netPerHour = hours > 0 ? net / hours : 0;
  const denom = implied * model.airdrop_pool * farmerShare;
  const breakeven = !farmable ? 1 : denom > 0 ? (gas + tbill) / denom : 1;
  const verdict: FarmEconomics['verdict'] = !farmable ? 'SKIP' : net > 0 ? 'FARM' : breakeven <= 0.6 ? 'THIN' : 'SKIP';
  const review = new Date(Date.parse(`${asOf}T00:00:00Z`) + holdDays * DAY_MS).toISOString().slice(0, 10);
  return {
    deposit_usd: model.deposit_usd,
    gas_usd: Math.round(gas * 100) / 100,
    tbill_usd: Math.round(tbill * 100) / 100,
    hold_days: holdDays,
    review_date: review,
    time_min: timeMin,
    expected_value_usd: Math.round(expected * 100) / 100,
    net_usd: Math.round(net * 100) / 100,
    net_per_hour_usd: Math.round(netPerHour * 100) / 100,
    breakeven_odds: Math.round(Math.min(1, Math.max(0, breakeven)) * 10000) / 10000,
    verdict,
  };
}

/**
 * Whether a protocol is a wrapped, staked or bridged product of a token
 * that already trades — the snapshot's own watchlist rule, applied here
 * to the above-floor fill so the board's top is not wrapped bitcoin and
 * staked ether: a bridge or liquid-staking category, a name carrying a
 * whole word wrapped, staked or staking, or a name beginning with an
 * exchange's name. These protocols still record no token of their own,
 * so they are rankable — but they sit at the tail of the board, and
 * their integrity strip says so.
 */
export function isWrappedProduct(p: SnapshotProtocol): boolean {
  const cat = p.category ?? '';
  if (['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC'].includes(cat)) return true;
  if (/\bwrapped\b|\bstaked\b|\bstaking\b/i.test(p.name)) return true;
  for (const ex of ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini']) {
    if (p.name.startsWith(ex)) return true;
  }
  return false;
}

/**
 * What a row's own record does not say: a missing 7-day change, an
 * unknown age, a TVL under the floor, a null category, a single chain,
 * or a wrapped, staked or bridged product of a token that already
 * trades. The dashboard shows these as the row's integrity strip.
 */
export function integrityFlags(p: SnapshotProtocol, floorUsd: number): string[] {
  const flags: string[] = [];
  if (p.change_7d === null) flags.push('change_7d missing');
  if (p.listed_at === null) flags.push('age unknown');
  if (p.tvl_usd < floorUsd) flags.push('tvl below floor');
  if (p.category === null) flags.push('category null');
  if (p.chains.length <= 1) flags.push('single chain');
  if (isWrappedProduct(p)) flags.push('wrapped, staked or bridged product');
  return flags;
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/**
 * The protocols the board ranks, strongest first, with ranks 1..n.
 * Every watchlist protocol, then the rankable pre-token protocols below
 * the floor by TVL, then the rankable pre-token protocols above the
 * floor the watchlist leaves out that are not wrapped, staked or
 * bridged products of a token that already trades, by TVL — and, only
 * to reach 40 + EARLY_ROWS rows, the smallest wrapped, staked or
 * bridged products above the floor, smallest TVL first, so the board's
 * top stays with protocols whose token genuinely does not exist yet.
 * (Only 186 rankable protocols sit below the floor and only 20 more
 * above it pass the watchlist rule, so the board cannot reach 250 rows
 * without a tail.) The board's curve is the leave-one-out winner from
 * the backtest; the implied value is curve value x launch odds.
 */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const fitPool = fittable(snapshot.protocols).filter((p) => p.category !== 'CEX');
  const kind = chooseCurveKind(snapshot, model);
  const pricer = fitPricer(fitPool, snapshot.as_of, model, kind);
  const oddsModel = fitOddsModel(snapshot.protocols, snapshot.as_of, model);
  const chosen = new Map<string, SnapshotProtocol>();
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  const byTvlDesc = (a: SnapshotProtocol, b: SnapshotProtocol): number =>
    b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0);
  const byTvlAsc = (a: SnapshotProtocol, b: SnapshotProtocol): number =>
    a.tvl_usd - b.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0);
  const belowFloor = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort(byTvlDesc);
  const aboveFloor = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd >= snapshot.floor_usd && !isWrappedProduct(p))
    .sort(byTvlDesc);
  const wrappedTail = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd >= snapshot.floor_usd && isWrappedProduct(p))
    .sort(byTvlAsc);
  const early = [...belowFloor, ...aboveFloor, ...wrappedTail].slice(0, EARLY_ROWS);
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => {
    const odds = oddsModel.predict(p);
    const v = impliedValue(p, snapshot.as_of, pricer, odds.odds, model);
    const steps = farmSteps(p, v.age, snapshot.as_of);
    const econ = farmEconomics(v.implied, odds.odds, p.tvl_usd, steps, holdDaysFor(v.age), snapshot.as_of, model, hasClearFarmPath(p));
    return { p, pricer, odds, ...v, steps, econ };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    age_days: s.age,
    implied_value_usd: s.implied,
    integrity: integrityFlags(s.p, snapshot.floor_usd),
    model: {
      curve_value: Math.round(s.curveVal),
      curve_a: round4(s.pricer.curve.a),
      curve_b: round4(s.pricer.curve.b),
      curve_n: s.pricer.curve.n,
      curve_bridge_shift: round4(s.pricer.curve.bridge_shift),
      curve_trimmed: s.pricer.curve.trimmed_n,
      launch_odds: s.odds.odds,
      launch_odds_band_odds: Math.round(s.odds.bandOdds * 10000) / 10000,
      launch_odds_logit: Math.round(s.odds.logitOdds * 10000) / 10000,
      launch_odds_n: s.odds.n,
      launch_odds_band: s.odds.band,
      launch_odds_band_n: s.odds.band_n,
      launch_odds_band_rate: Math.round(s.odds.band_rate * 10000) / 10000,
      launch_odds_category: s.odds.perCategory,
      growth_pct: s.growthPct,
      age_days: s.age,
      chain_count: s.chainCount,
    },
    economics: s.econ,
    farm_steps: s.steps.map(stepText),
  }));
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** Every listed protocol with a market cap, for the value-against-TVL scatter. */
export function listedRows(snapshot: Snapshot): ListedRow[] {
  return fittable(snapshot.protocols)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd!,
    }));
}

/**
 * The accounting: every protocol in exactly one bucket, so the buckets
 * sum to the snapshot's protocol count. The order is the test: a board
 * row first, then traded with a usable market cap, then a token
 * recorded with a zero or negative market cap, then a token recorded
 * with no market cap, then the pre-token protocols the radar cannot
 * rank (exchanges, versioned releases), then the rankable pre-token
 * protocols the board leaves out, above and below the floor.
 */
export function accounting(snapshot: Snapshot, board: BoardRow[]): AccountingRow[] {
  const all = snapshot.protocols;
  const boardSlugs = new Set(board.map((r) => r.slug));
  return [
    {
      label: 'Ranked on the board',
      count: board.length,
      note: 'all 40 watchlist protocols plus early finds below the floor and above it',
    },
    {
      label: 'Already has a token, market cap tracked',
      count: all.filter((p) => p.mcap_usd !== null && p.mcap_usd > 0).length,
      note: 'traded; their market caps train the fitted size curve',
    },
    {
      label: 'Already has a token, market cap 0 or below',
      count: all.filter((p) => p.mcap_usd !== null && p.mcap_usd <= 0).length,
      note: 'a token exists but the snapshot carries no usable market cap',
    },
    {
      label: 'Has a token symbol, market cap untracked',
      count: all.filter((p) => p.mcap_usd === null && (p.symbol !== null || p.gecko_id !== null)).length,
      note: 'a token is recorded but no market cap is carried',
    },
    {
      label: 'Pre-token, exchange (CEX)',
      count: all.filter((p) => isPreToken(p) && p.category === 'CEX').length,
      note: 'exchange custody, not a protocol the radar can rank',
    },
    {
      label: 'Pre-token, versioned release',
      count: all.filter((p) => isPreToken(p) && p.category !== 'CEX' && VERSIONED.test(p.name)).length,
      note: 'a named release of another protocol, not a protocol of its own',
    },
    {
      label: 'Pre-token and rankable, above the floor but outside the board',
      count: all.filter((p) => isRankable(p) && p.tvl_usd >= snapshot.floor_usd && !boardSlugs.has(p.slug)).length,
      note: 'rankable but not on the watchlist, so the board leaves them out',
    },
    {
      label: 'Pre-token and rankable, below the floor but outside the board',
      count: all.filter((p) => isRankable(p) && p.tvl_usd < snapshot.floor_usd && !boardSlugs.has(p.slug)).length,
      note: 'early finds the board did not reach',
    },
  ];
}

/** A board row's compact form for data.js. */
export function radarRow(row: BoardRow, range?: BootstrapRange): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    implied_lo: range?.implied_lo ?? row.implied_value_usd,
    implied_hi: range?.implied_hi ?? row.implied_value_usd,
    rank_lo: range?.rank_lo ?? row.rank,
    rank_hi: range?.rank_hi ?? row.rank,
    curve_value: row.model.curve_value,
    curve_a: row.model.curve_a,
    curve_b: row.model.curve_b,
    curve_n: row.model.curve_n,
    curve_bridge_shift: row.model.curve_bridge_shift,
    curve_trimmed: row.model.curve_trimmed,
    launch_odds: row.model.launch_odds,
    launch_odds_band_odds: row.model.launch_odds_band_odds,
    launch_odds_logit: row.model.launch_odds_logit,
    launch_odds_n: row.model.launch_odds_n,
    launch_odds_band: row.model.launch_odds_band,
    launch_odds_band_n: row.model.launch_odds_band_n,
    launch_odds_band_rate: row.model.launch_odds_band_rate,
    launch_odds_category: row.model.launch_odds_category,
    growth_pct: row.model.growth_pct,
    chain_count: row.model.chain_count,
    integrity: row.integrity,
    economics: row.economics,
    farm_steps: row.farm_steps,
  };
}

/** A small deterministic PRNG (mulberry32): the bootstrap resamples must be the same on every run. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Every board row's bootstrap range. The chosen curve is refitted on
 * 200 resamples (with replacement, same size) of the listed non-exchange
 * fit pool, drawn from a fixed seed; under each refit every row's implied
 * value is recomputed with its own launch odds and the board is
 * re-ranked. The P10-P90 band of the implied values and of the ranks is
 * the row's range: a wide band is a row the curve cannot place
 * precisely, and the board says so instead of hiding it.
 */
export function bootstrapRanges(
  snapshot: Snapshot,
  board: BoardRow[],
  kind: 'logtvl-bridge' | 'multi-term',
  model: ModelConstants = MODEL,
): Map<string, BootstrapRange> {
  const pool = fittable(snapshot.protocols).filter((p) => p.category !== 'CEX');
  const index = bySlug(snapshot.protocols);
  const rng = mulberry32(20261124);
  const implieds = new Map<string, number[]>();
  const ranks = new Map<string, number[]>();
  for (const r of board) {
    implieds.set(r.slug, []);
    ranks.set(r.slug, []);
  }
  for (let draw = 0; draw < BOOTSTRAP_DRAWS; draw++) {
    const sample: SnapshotProtocol[] = [];
    for (let i = 0; i < pool.length; i++) sample.push(pool[Math.floor(rng() * pool.length)]!);
    const pricer = fitPricer(sample, snapshot.as_of, model, kind);
    const scored = board.map((r) => {
      const p = index.get(r.slug)!;
      const v = impliedValue(p, snapshot.as_of, pricer, r.model.launch_odds, model);
      return { slug: r.slug, implied: v.implied };
    });
    scored.sort((a, b) => b.implied - a.implied || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
    scored.forEach((s, i) => {
      implieds.get(s.slug)!.push(s.implied);
      ranks.get(s.slug)!.push(i + 1);
    });
  }
  const out = new Map<string, BootstrapRange>();
  for (const r of board) {
    const iv = [...implieds.get(r.slug)!].sort((a, b) => a - b);
    const rk = [...ranks.get(r.slug)!].sort((a, b) => a - b);
    out.set(r.slug, {
      implied_lo: Math.round(quantile(iv, 0.1)),
      implied_hi: Math.round(quantile(iv, 0.9)),
      rank_lo: Math.round(quantile(rk, 0.1)),
      rank_hi: Math.round(quantile(rk, 0.9)),
    });
  }
  return out;
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const validation = backtest(snapshot, model);
  const ranges = bootstrapRanges(snapshot, board, validation.curve_kind, model);
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    bootstrap_draws: BOOTSTRAP_DRAWS,
    protocols_total: snapshot.protocols.length,
    validation,
    accounting: accounting(snapshot, board),
    listed: listedRows(snapshot),
    rows: board.map((r) => radarRow(r, ranges.get(r.slug))),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not JSON');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
