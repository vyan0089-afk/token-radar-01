// Token Radar — model radar-5: one sealed snapshot in, one ranked board out.
//
// The board covers every slug in the snapshot's watchlist (the floor, never a
// ceiling) plus the strongest pre-token protocols below the floor, by TVL.
// A protocol is pre-token when its record carries no token (no market cap, no
// CoinGecko id, no symbol). Live-token protocols are kept apart and shown as
// the market's own values, never mixed into the ranked board.
//
// Implied value follows only from the snapshot's own figures, in four steps:
//
//   1. FITTED SIZE CURVE. log10(market cap) = a + b x log10(TVL) + a bridge
//      shift, fitted by least squares on the listed protocols that are not
//      exchanges (CEX), after dropping the protocols whose market cap sits
//      more than 2.5 robust (MAD) deviations from a plain fitted curve.
//      Bridges get one fitted shift because their TVL is other chains'
//      assets in custody or in transit, so a dollar of bridge TVL carries
//      a different amount of protocol value than a dollar of lending or
//      DEX TVL: on this snapshot the shift is +0.48 in log10 (bridges'
//      median market-cap-per-TVL is about 3x the rest). The five trimmed
//      protocols are listed in the README: their market caps are more than
//      a hundred times off the plain curve either way. Radar-4's single
//      global curve missed by x3.32 leave-one-out; the trimmed curve with
//      the bridge shift misses by x2.71 (see backtest()).
//   2. LAUNCH ODDS. An ensemble, averaged in logit space, of (a) an
//      age-band x category rate — among protocols in the same age band
//      (under 1 year, 1-2, 2-3, 3 or more, age unknown), the share that
//      has a token (a symbol in the snapshot), a category's rate inside
//      the band shrunk toward the band rate — and (b) a ridge logistic
//      regression on age-band dummies plus a dummy per frequent category.
//      It answers: how often does a protocol of this age, in this
//      category, ever get a token?
//   3. GROWTH and MATURITY and CHAINS, as in radar-2: the 7-day TVL change
//      (clamped, half weight), the age of the protocol (0.6-1.0 over three
//      years), and multi-chain reach.
//   4. implied = curveValue x launchOdds x growthMult x maturityMult
//      x chainMult, rounded to whole dollars, at least $1.
//
// The model's honesty is checked, not claimed: a leave-one-out backtest on
// the listed protocols the model can price (see backtest()) reports the
// median miss of the fitted curve against a flat multiple, the coverage of
// its prediction intervals split by age, an older-into-newer test (fit on
// protocols listed before a date, predict the ones listed after), and a
// hold-out test of the launch-odds model. The dashboard and the README print
// the backtest's actual numbers, whatever they are.
//
// Farm economics, per row, on a consistent $1,000 deposit basis: the
// expected airdrop value is implied x launch odds x 5% (the airdrop pool's
// share of the implied value — the conservative end of real airdrops, which
// usually allocate 5-15% of supply) x the farmer's share of the farmed
// capital (a $1,000 deposit over 25% of the protocol's TVL, the farmed-
// capital fraction: in a pre-token protocol with a points program, a
// quarter of the TVL farming for the airdrop is a conservative reading).
// Net is that expected value minus the plan's gas minus the T-bill yield
// the deposit forgoes over the holding period (4% a year); net per hour
// divides by the plan's active minutes; break-even odds is the launch odds
// at which the expected value exactly pays the gas and the forgone yield.
// The 5% pool, the 25% farmed fraction and the 4% T-bill rate are stated
// assumptions, not snapshot facts, and the dashboard says so. The
// dashboard's what-if controls re-run the same arithmetic live at other
// deposits, farmed fractions and T-bill rates.
//
// One stated limitation of the launch odds: they are the share of
// protocols of an age band and category that have a token now. A protocol
// that has already waited years without launching one is, if anything,
// less likely than its band rate — the snapshot carries no launch dates,
// so no hazard rate can be fitted, and the odds are an upper estimate for
// old rows. The dashboard and the README say so.
//
// No protocol name is ever special-cased: the same function scores every
// row, and the dashboard shows each row's curve, odds and multipliers so a
// reader can check the arithmetic. The constants are stated in the
// dashboard and changeable in the model's sandbox.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
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

/** The model's constants, as the dashboard states them and the sandbox may change them. */
export interface ModelConstants {
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  chain_step: number;
  chain_max_extra: number;
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
  growth_weight: 0.5,
  growth_floor: -60,
  growth_cap: 120,
  maturity_floor: 0.6,
  maturity_range: 0.4,
  maturity_days: 1095,
  unknown_age_days: 365,
  chain_step: 0.05,
  chain_max_extra: 3,
  odds_floor: 0.05,
  odds_cap: 0.95,
  odds_shrink_k: 10,
  airdrop_pool: 0.05,
  farmed_fraction: 0.25,
  tbill_rate: 0.04,
  deposit_usd: 1000,
};

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'radar-5';

/** How many pre-token protocols below the watchlist floor the early radar carries, by TVL. */
export const EARLY_ROWS = 260;

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

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
  time_min: number;
  expected_value_usd: number;
  net_usd: number;
  net_per_hour_usd: number;
  breakeven_odds: number;
  verdict: 'FARM' | 'THIN' | 'SKIP';
}

/** A fitted size curve: log10(mcap) = a + b x log10(TVL) + bridge_shift for bridges, on n listed protocols. */
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
  /** Median miss multiple of the fitted curve (1.0 is perfect). */
  median_miss: number;
  /** Median miss multiple of the flat category-multiple baseline (radar-2's yardstick). */
  median_miss_flat: number;
  /** Share of held-out market caps inside the P25-P75 prediction interval. */
  p25_p75_coverage: number;
  /** Share of held-out market caps inside the P10-P90 prediction interval. */
  p10_p90_coverage: number;
  /** log10(pred/actual) residual quantiles, the intervals' edges. */
  log_q10: number;
  log_q25: number;
  log_q75: number;
  log_q90: number;
  /** The whole-snapshot curve, for the dashboard's model note. */
  global_a: number;
  global_b: number;
  global_n: number;
  /** The whole-snapshot curve's bridge shift, trimmed count and pool size. */
  global_bridge_shift: number;
  global_trimmed: number;
  global_pool_n: number;
  /** Older-into-newer: fit on protocols listed before 2024-01-01, predict those listed after. */
  older_newer_miss: number;
  older_newer_n: number;
  /** Same test at the 2023-07-01 split, as a sensitivity check. */
  older_newer_2023_miss: number;
  older_newer_2023_n: number;
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
    growth_multiplier: number;
    maturity_multiplier: number;
    chain_multiplier: number;
    age_days: number | null;
  };
  economics: FarmEconomics;
  farm_steps: string[];
}

/** The dashboard's compact view of one row, with farm plans generated in the page. */
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
  growth_multiplier: number;
  maturity_multiplier: number;
  chain_multiplier: number;
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

/** The listed protocols usable for a fit: a positive TVL and a positive market cap. */
function fittable(protocols: SnapshotProtocol[]): SnapshotProtocol[] {
  return protocols.filter((p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0);
}

/** Solve A x = b by Gaussian elimination with partial pivoting; null when the system is singular. */
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

/** Whether a protocol is a bridge: its TVL is other chains' assets in custody or in transit. */
export function isBridge(p: SnapshotProtocol): boolean {
  return (p.category ?? '').toLowerCase().includes('bridge');
}

/** Plain ordinary least squares on log10(market cap) against log10(TVL). A flat line when the TVLs do not vary. */
function olsCurve(listed: SnapshotProtocol[]): { a: number; b: number } {
  const n = listed.length;
  if (n === 0) return { a: 0, b: 0 };
  const xs = listed.map((p) => Math.log10(p.tvl_usd));
  const ys = listed.map((p) => Math.log10(p.mcap_usd!));
  const mx = xs.reduce((s, v) => s + v, 0) / n;
  const my = ys.reduce((s, v) => s + v, 0) / n;
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    sxx += (xs[i]! - mx) * (xs[i]! - mx);
    sxy += (xs[i]! - mx) * (ys[i]! - my);
  }
  const b = sxx > 0 ? sxy / sxx : 0;
  return { a: my - b * mx, b };
}

/**
 * The size curve fitted on `listed`: first a plain OLS curve, then the
 * protocols whose market cap sits more than 2.5 robust (MAD) deviations
 * from it are dropped — one pass — and the curve is refitted with one
 * extra fitted term, a shift for bridge protocols. Bridges are the one
 * category whose market-cap-per-TVL is structurally different (their
 * TVL is other chains' assets), and the shift is fitted, not assumed:
 * on this snapshot it is about +0.48 in log10. Everything else shares
 * the one curve. Falls back to the plain curve when the fit is singular
 * or the trim would leave too few protocols.
 */
export function fitCurve(listed: SnapshotProtocol[]): SizeCurve {
  const poolN = listed.length;
  if (poolN === 0) return { a: 0, b: 0, bridge_shift: 0, n: 0, pool_n: 0, trimmed_n: 0 };
  const base = olsCurve(listed);
  const residuals = listed.map((p) => Math.log10(p.mcap_usd!) - (base.a + base.b * Math.log10(p.tvl_usd)));
  const med = median(residuals) ?? 0;
  const mad = (median(residuals.map((r) => Math.abs(r - med))) ?? 0) * 1.4826;
  const kept = mad > 0 ? listed.filter((_, i) => Math.abs(residuals[i]! - med) <= 2.5 * mad) : listed;
  const use = kept.length >= 20 ? kept : listed;
  const coef = solveLeastSquares(
    use.map((p) => [1, Math.log10(p.tvl_usd), isBridge(p) ? 1 : 0]),
    use.map((p) => Math.log10(p.mcap_usd!)),
  );
  if (coef === null) return { a: base.a, b: base.b, bridge_shift: 0, n: use.length, pool_n: poolN, trimmed_n: poolN - use.length };
  return { a: coef[0]!, b: coef[1]!, bridge_shift: coef[2]!, n: use.length, pool_n: poolN, trimmed_n: poolN - use.length };
}

/** A curve's value at a TVL: 10^(a + b x log10(TVL) + bridge shift when the protocol is a bridge). */
export function curveValue(curve: SizeCurve, tvl: number, bridge: boolean): number {
  return Math.pow(10, curve.a + curve.b * Math.log10(Math.max(1, tvl)) + (bridge ? curve.bridge_shift : 0));
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

/** The flat multiple baseline: median mcap/TVL of `listed`, or null when empty. */
function flatMultiple(listed: SnapshotProtocol[]): number | null {
  const ratios = listed.filter((p) => p.tvl_usd > 0).map((p) => p.mcap_usd! / p.tvl_usd);
  return median(ratios);
}

/** An older-into-newer test: fit the curve on protocols listed before `cutoff`, predict the ones after. */
function olderNewer(listed: SnapshotProtocol[], cutoff: string): { miss: number; n: number } {
  const older = listed.filter((p) => p.listed_at !== null && p.listed_at < cutoff && p.category !== 'CEX');
  const newer = listed.filter((p) => p.listed_at !== null && p.listed_at >= cutoff && isRankableLike(p));
  if (older.length < 5 || newer.length === 0) return { miss: 0, n: newer.length };
  const curve = fitCurve(older);
  const misses = newer.map((p) => {
    const pred = Math.max(1, curveValue(curve, p.tvl_usd, isBridge(p)));
    return Math.max(pred / p.mcap_usd!, p.mcap_usd! / pred);
  });
  return { miss: median(misses) ?? 0, n: newer.length };
}

/**
 * The leave-one-out backtest on the listed protocols the model can price:
 * not an exchange, not a versioned release. For each, the size curve is
 * fitted on the other listed non-exchange protocols, and the flat baseline
 * is the median mcap/TVL of the other listed protocols in its category
 * (at least 2, otherwise the whole snapshot's median without it). Miss is
 * max(pred/actual, actual/pred). The prediction intervals come from the
 * fitted curve's log10 residuals; coverage is reported overall and split
 * by age (newer than two years, older than two years), and the intervals
 * are also computed per age group, so a newer protocol's range is wider
 * where newer protocols are harder to price.
 */
export function backtest(snapshot: Snapshot, model: ModelConstants = MODEL): Backtest {
  const listed = fittable(snapshot.protocols);
  const fitPool = listed.filter((p) => p.category !== 'CEX');
  const evalList = listed.filter(isRankableLike);
  const misses: number[] = [];
  const missesFlat: number[] = [];
  const residuals: { r: number; age: number | null }[] = [];
  for (const p of evalList) {
    const train = fitPool.filter((q) => q.slug !== p.slug);
    const curve = fitCurve(train);
    const pred = Math.max(1, curveValue(curve, p.tvl_usd, isBridge(p)));
    const actual = p.mcap_usd!;
    misses.push(Math.max(pred / actual, actual / pred));
    residuals.push({ r: Math.log10(pred / actual), age: ageDays(snapshot.as_of, p.listed_at) });
    const catOthers = listed.filter((q) => q.slug !== p.slug && q.category === p.category);
    const flatList = p.category !== null && catOthers.length >= 2 ? catOthers : listed.filter((q) => q.slug !== p.slug);
    const mult = flatMultiple(flatList) ?? 0.25;
    const predFlat = Math.max(1, p.tvl_usd * mult);
    missesFlat.push(Math.max(predFlat / actual, actual / predFlat));
  }
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
  const on2024 = olderNewer(listed, '2024-01-01');
  const on2023 = olderNewer(listed, '2023-07-01');
  return {
    n: evalList.length,
    median_miss: median(misses) ?? 0,
    median_miss_flat: median(missesFlat) ?? 0,
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
    older_newer_miss: on2024.miss,
    older_newer_n: on2024.n,
    older_newer_2023_miss: on2023.miss,
    older_newer_2023_n: on2023.n,
    coverage_by_age: {
      newer: { n: newer.length, p25_p75_coverage: inRange(newer, q25, q75), p10_p90_coverage: inRange(newer, q10, q90) },
      older: { n: older.length, p25_p75_coverage: inRange(older, q25, q75), p10_p90_coverage: inRange(older, q10, q90) },
    },
    ranges_newer: rangeOf(newer.map((x) => x.r)),
    ranges_older: rangeOf(older.map((x) => x.r)),
    odds: oddsValidation(snapshot, model),
  };
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

/** Categories with at least this many protocols in the training set get their own dummy in the logistic odds model. */
const LOGIT_MIN_CATEGORY = 25;
/** Ridge penalty on the logistic model's non-intercept coefficients. */
const LOGIT_LAMBDA = 10;

/** The logistic odds model's features: one dummy per age band, one per frequent category. */
function logitFeatures(asOf: string, topCats: string[], p: SnapshotProtocol): number[] {
  const band = ageBand(ageDays(asOf, p.listed_at));
  const feats = [0, 0, 0, 0, 0];
  feats[band] = 1;
  for (const c of topCats) feats.push(p.category === c ? 1 : 0);
  return feats;
}

/**
 * A ridge logistic regression for "has a token", fitted by iteratively
 * reweighted least squares on `train`. The model is deterministic: fixed
 * iteration cap, fixed ridge, no random start. Returns a function from a
 * protocol to its fitted probability.
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
  // Standardise the columns; dummies and the intercept are left alone.
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
 * The launch-odds model's hold-out tests. Protocols are split by slug order
 * (even positions train, odd positions test); the model is fitted on the
 * train half and called on the test half at a 50% threshold. A token is a
 * symbol in the snapshot: 416 of 758 protocols have one, so guessing
 * "no token" for every protocol is right 45.1% of the time and guessing
 * the majority class ("has a token") is right 54.9%. The same test is
 * repeated as 5-fold cross-validation, so every protocol is predicted
 * once out of fold.
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

/** The multipliers and the implied value one protocol gets under `model`. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  curve: SizeCurve,
  odds: number,
  model: ModelConstants,
): { implied: number; curveVal: number; growthPct: number; growthMult: number; maturityMult: number; chainMult: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult = model.maturity_floor + (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const chainMult = 1 + model.chain_step * Math.min(Math.max(protocol.chains.length - 1, 0), model.chain_max_extra);
  const curveVal = curveValue(curve, protocol.tvl_usd, isBridge(protocol));
  const implied = Math.max(1, Math.round(curveVal * odds * growthMult * maturityMult * chainMult));
  return { implied, curveVal, growthPct, growthMult, maturityMult, chainMult, age };
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

/** The category's one action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $1,000 of USDC to ${name} on ${chain} and keep the position open.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return `Provide $1,000 of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  if (c.includes('bridge')) return `Bridge $1,000 of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $1,000 of the chain's staking asset through ${name} and keep the receipt.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Deposit $1,000 of USDC as margin on ${name} and open one small hedge.`;
  if (c.includes('prediction')) return `Fund $1,000 and place one market position on ${name}.`;
  if (c.includes('curator') || c.includes('allocator') || c.includes('risk')) return `Deposit $1,000 into a ${name} vault on ${chain} and keep the shares.`;
  if (c.includes('stable')) return `Mint or deposit $1,000 of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa')) return `Mint $1,000 of the protocol's yield asset on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy $1,000 of cover from ${name} on ${chain} and keep the policy.`;
  if (c.includes('payment')) return `Send $1,000 through ${name} on ${chain} and keep the receipt.`;
  return `Deposit $1,000 of USDC into ${name} on ${chain} and keep the position open.`;
}

/**
 * A protocol's farm plan: seven steps, each an action with a cost and a time,
 * in words and in numbers. The plan is derived from the protocol's own
 * record (category, chains, TVL, age), never from a hand-written list of
 * names. Every plan uses the same $1,000 deposit basis the economics use.
 * The seventh step is the exit rule: when to unwind, so a farm that goes
 * wrong is closed instead of ridden down.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null, asOf: string): FarmStep[] {
  const chain = chainOf(p);
  const hold = holdDaysFor(age);
  const weeks = Math.ceil(hold / 7);
  const action = actionFor(p, chain);
  const others = p.chains.length > 1 ? ` Repeat the deposit on ${p.chains[1]} if the protocol runs there, so the activity spans chains.` : '';
  const review = new Date(Date.parse(`${asOf}T00:00:00Z`) + hold * DAY_MS).toISOString().slice(0, 10);
  return [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.`,
      cost: 'under $3 of gas for the first transaction',
      time: '5 minutes',
      cost_usd: 3,
      time_min: 5,
    },
    {
      text: action,
      cost: '$1,000 of capital and about $8 of gas',
      time: '15 minutes to set up',
      cost_usd: 8,
      time_min: 15,
    },
    {
      text: `Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.${others}`,
      cost: `about $2 of gas a week, $${2 * weeks} over ${weeks} weeks`,
      time: `${10 * weeks} minutes over ${weeks} weeks`,
      cost_usd: 2 * weeks,
      time_min: 10 * weeks,
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
      cost: `the $1,000 stays in the position`,
      time: `${hold} days`,
      cost_usd: 0,
      time_min: 0,
    },
    {
      text: `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
      cost_usd: 0,
      time_min: 10,
    },
    {
      text: `Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.`,
      cost: 'nothing but the log',
      time: '5 minutes',
      cost_usd: 0,
      time_min: 5,
    },
    {
      text: `Exit rule: unwind if ${p.name}'s TVL falls below $${fmtInt(p.tvl_usd / 2)} — half its current TVL — for a week, if the position loses more than 20% to fees or price moves, or after ${hold} days; review the position on ${review}.`,
      cost: 'about $5 of gas to unwind',
      time: '10 minutes to unwind',
      cost_usd: 5,
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
 * facts.
 */
export function farmEconomics(
  implied: number,
  odds: number,
  tvl: number,
  steps: FarmStep[],
  holdDays: number,
  model: ModelConstants = MODEL,
): FarmEconomics {
  const gas = steps.reduce((s, st) => s + st.cost_usd, 0);
  const timeMin = steps.reduce((s, st) => s + st.time_min, 0);
  const farmedCapital = Math.max(1, model.farmed_fraction * tvl);
  const farmerShare = model.deposit_usd / farmedCapital;
  const expected = implied * odds * model.airdrop_pool * farmerShare;
  const tbill = (model.deposit_usd * model.tbill_rate * holdDays) / 365;
  const net = expected - gas - tbill;
  const hours = timeMin / 60;
  const netPerHour = hours > 0 ? net / hours : 0;
  const denom = implied * model.airdrop_pool * farmerShare;
  const breakeven = denom > 0 ? (gas + tbill) / denom : 1;
  const verdict: FarmEconomics['verdict'] = net > 0 ? 'FARM' : breakeven <= 0.6 ? 'THIN' : 'SKIP';
  return {
    deposit_usd: model.deposit_usd,
    gas_usd: gas,
    tbill_usd: Math.round(tbill * 100) / 100,
    hold_days: holdDays,
    time_min: timeMin,
    expected_value_usd: Math.round(expected * 100) / 100,
    net_usd: Math.round(net * 100) / 100,
    net_per_hour_usd: Math.round(netPerHour * 100) / 100,
    breakeven_odds: Math.round(Math.min(1, Math.max(0, breakeven)) * 10000) / 10000,
    verdict,
  };
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const curve = fitCurve(fittable(snapshot.protocols).filter((p) => p.category !== 'CEX'));
  const oddsModel = fitOddsModel(snapshot.protocols, snapshot.as_of, model);
  const chosen = new Map<string, SnapshotProtocol>();
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: pre-token protocols below the watchlist floor, by TVL,
  // capped. Never a replacement for a watchlist row: a chosen protocol stays chosen.
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, EARLY_ROWS);
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => {
    const odds = oddsModel.predict(p);
    const v = impliedValue(p, snapshot.as_of, curve, odds.odds, model);
    const steps = farmSteps(p, v.age, snapshot.as_of);
    const econ = farmEconomics(v.implied, odds.odds, p.tvl_usd, steps, holdDaysFor(v.age), model);
    return { p, curve, odds, ...v, steps, econ };
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
    model: {
      curve_value: Math.round(s.curveVal),
      curve_a: round4(s.curve.a),
      curve_b: round4(s.curve.b),
      curve_n: s.curve.n,
      curve_bridge_shift: round4(s.curve.bridge_shift),
      curve_trimmed: s.curve.trimmed_n,
      launch_odds: s.odds.odds,
      launch_odds_band_odds: Math.round(s.odds.bandOdds * 10000) / 10000,
      launch_odds_logit: Math.round(s.odds.logitOdds * 10000) / 10000,
      launch_odds_n: s.odds.n,
      launch_odds_band: s.odds.band,
      launch_odds_band_n: s.odds.band_n,
      launch_odds_band_rate: Math.round(s.odds.band_rate * 10000) / 10000,
      launch_odds_category: s.odds.perCategory,
      growth_pct: s.growthPct,
      growth_multiplier: round4(s.growthMult),
      maturity_multiplier: round4(s.maturityMult),
      chain_multiplier: round4(s.chainMult),
      age_days: s.age,
    },
    economics: s.econ,
    farm_steps: s.steps.map(stepText),
  }));
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

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
 * The 758-protocol accounting: every protocol in exactly one bucket, so the
 * buckets sum to the snapshot's protocol count.
 */
export function accounting(snapshot: Snapshot, board: BoardRow[]): AccountingRow[] {
  const all = snapshot.protocols;
  const boardSlugs = new Set(board.map((r) => r.slug));
  const rows: AccountingRow[] = [
    {
      label: 'Ranked on the board',
      count: board.length,
      note: 'all 40 watchlist protocols plus early finds below the floor',
    },
    {
      label: 'Already has a token, market cap tracked',
      count: all.filter((p) => p.mcap_usd !== null && p.mcap_usd > 0).length,
      note: 'traded; their market caps train the fitted size curve',
    },
    {
      label: 'Already has a token, market cap 0 or −1',
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
      label: 'Pre-token and rankable, above the floor but outside the watchlist',
      count: all.filter((p) => isRankable(p) && p.tvl_usd >= snapshot.floor_usd && !boardSlugs.has(p.slug)).length,
      note: 'rankable but not on the watchlist, so the board leaves them out',
    },
  ];
  return rows;
}

/** A board row's compact form for data.js, with the farm plan generated in the page. */
export function radarRow(row: BoardRow): RadarRow {
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
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    chain_multiplier: row.model.chain_multiplier,
    economics: row.economics,
    farm_steps: row.farm_steps,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
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
    validation: backtest(snapshot, model),
    accounting: accounting(snapshot, board),
    listed: listedRows(snapshot),
    rows: board.map(radarRow),
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
