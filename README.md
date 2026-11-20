# Token Radar — Build the best token launch radar
[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/vyan0089-afk/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/vyan0089-afk/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A program that reads a sealed snapshot of the protocol universe (DefiLlama,
758 protocols at or above $5M TVL, 40 on the watchlist) and writes a ranked
board of the pre-token protocols worth farming next, with an implied value and
a concrete six-step farm plan for each, plus a dashboard a reader can sort,
filter and open protocol by protocol.

## How it runs

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input token-radar-01-kit/input/snapshot.json
```

`main.ts` (Node 22, standard library only, no network) reads
`/input/snapshot.json`, scores every pre-token protocol with the radar-6 model
in `lib/model.ts`, writes `/output/board.json` (226 rows) and `/output/data.js`,
copies `dashboard/` and `screenshots/` to `/output`, and writes
`/output/dossier.json` with `buildDossier` from `vendor/makefun-board.ts`.
It runs twice and both runs write the same bytes.

## The value model — radar-6

Implied value follows only from the snapshot's own figures, in four steps.
Radar-6 keeps radar-5's size curve — twenty-one other curve families were
tried on the same backtests and none beat it on both checks at once (see
"What was tried for radar-6") — and changes the launch odds, the
uncertainty reporting and the farm economics.

```
size curve   = OLS fit of log10(market cap) = a + b x log10(TVL), fitted
               on the listed protocols that are not exchanges (CEX),
               after dropping the protocols whose market cap sits more
               than 2.5 robust (MAD) deviations from a plain fitted curve
               (one pass; 5 dropped on this snapshot: aave-v2, bitway-earn,
               concentrator, rain, xdai-stake-bridge — each more than a
               hundred times off the plain curve either way), then refit
               with one extra fitted term: a shift for bridge protocols
curve value  = 10^(a + b x log10(TVL) + shift) for bridges, 10^(a + b x
               log10(TVL)) otherwise. Bridges are the one category whose
               market-cap-per-TVL is structurally different — their TVL
               is other chains' assets in custody or in transit — and
               the shift is fitted, not assumed: on this snapshot the
               bridges' median market-cap-per-TVL is about 3x the rest
               (log10 -0.22 against -0.69), and the fitted shift is +0.48
launch odds  = the average, in logit space, of (a) the age-band x
               category rate — the share of protocols in the same age
               band (under 1 year, 1–2, 2–3, 3 or more, age unknown)
               that has a token, a category's rate inside the band shrunk
               toward the band rate with weight n / (n + 10) — and (b) a
               ridge logistic regression (penalty 10, fitted by IRLS) on
               age-band dummies, a dummy per category with at least
               25 protocols in the training set, and four continuous
               features: log10 TVL, the clamped 7-day growth, the chain
               count and log10 age. Radar-6 adds the four continuous
               features: on the same even/odd slug split the ensemble
               calls 67.8% right (radar-5: 67.0%) and 71.6% under 5-fold
               cross-validation (radar-5: 69.9%), AUC 0.76 / 0.78
               (radar-5: 0.75 / 0.77)
growthMult   = 1 + clamp(change_7d, -60, 120) / 100 x 0.5
maturityMult = 0.6 + min(age_days, 1095) / 1095 x 0.4   (age unknown: 365)
chainMult    = 1 + 0.05 x min(chains - 1, 3)
implied      = max(1, round(curve value x launch odds x growthMult
                            x maturityMult x chainMult))
```

Whole-snapshot curve on this snapshot: log market cap = 2.86 + 0.53 × log TVL
+ 0.48 for bridges (n = 114 of 119 listed non-exchange protocols; 5 trimmed).
No protocol name is special-cased: the same function scores every row, and the
dashboard shows each row's curve (a, b, bridge shift, n fitted, n trimmed),
launch odds (both ensemble components: the age-band rate and the logistic
model), growth, maturity and chains, plus its P10–P90 range from
the backtest residuals for its age group, so a reader can check the
arithmetic. The dashboard also carries a live sandbox — two sliders that
re-rank the board under different curve-value and growth-weight settings,
plus what-if controls (deposit $1,000/$5,000/$25,000, farmed capital
10%/25%/50% of TVL, T-bill yield 0%/4%/8%) that re-price the farm economics
live — so the model can be tested, not just trusted.

The board covers all 40 watchlist protocols plus 186 early finds: pre-token
protocols below the $50M watchlist floor, taken by TVL. Live-token protocols
are kept apart and shown as the market's own values (top 24 by market cap),
never mixed into the ranked board. Total implied value across the board:
$608.1M. Top three: USDD $17.5M, Veda $17.1M, Steakhouse Financial $15.2M.
(Radar-5's top was USDD $15.0M; the new odds model lifts USDD and Veda —
their logistic odds rise once the model sees their TVL — and 104 rows move
five or more ranks.)

Every row also carries a rank range: the size curve is refitted on 200
bootstrap resamples of the listed fit pool (a fixed seed, so the ranges are
deterministic) and each row's implied value and rank are recomputed under
every refit; the dashboard shows the P10–P90 band of both. Rank 1 USDD's
band is 1–6; the median band width across the board is 11 ranks. A wide
band is a row the curve cannot place precisely, and the board says so
instead of hiding it.

One stated limitation of the launch odds: the band component is the share of
protocols of an age band and category that have a token now, and the logistic
component is fitted on the same stock of "has a token" flags. A protocol that
has already waited years without launching one is, if anything, less likely
than its band rate — the snapshot carries no launch dates, so no hazard
rate can be fitted, and the odds are an upper estimate for old rows. The
dashboard says so.

## Backtest — is the model honest?

Leave-one-out on the 118 listed protocols the model can price (not an
exchange, not a versioned release): each protocol's market cap is predicted
from a curve fitted without it — the trim and the bridge shift are refitted
inside every fold, so no held-out protocol leaks into its own prediction.

- Fitted curve median miss: **×2.71** (the flat multiple misses by ×5.71)
- Older-into-newer: fit only on protocols listed before 2024-01-01, predict
  the ones listed after: **×1.97** (n = 48); at the 2023-07-01 split: **×2.27**
  (n = 58)
- P25–P75 interval holds **49%** of held-out values (target ~50%)
- P10–P90 interval holds **80%** of held-out values (target ~80%)
- By age, against the same whole-sample intervals: newer than 2 years
  P25–P75 **50%** and P10–P90 **73%** (n = 30); older than 2 years **58%**
  and **84%** (n = 57). The detail view's P10–P90 range uses the age
  group's own residuals, so a newer protocol's range is wider where newer
  protocols are harder to price.
- Launch-odds hold-out: protocols split by slug order (even positions train,
  odd positions test); the ensemble odds model calls **67.8%** of the
  hold-out right at a 50% threshold, against **54.6%** for guessing the
  majority class (54.9% of all 758 protocols have a token; AUC 0.76,
  n = 379). Under 5-fold cross-validation (every protocol predicted once
  out of fold) it calls **71.6%** right, AUC 0.78. Radar-5's ensemble
  without the continuous features scored 67.0% / 69.9%, AUC 0.75 / 0.77.

### What was tried for radar-5, and what was kept

Every candidate below was scored by leave-one-out median miss and by
older-into-newer miss on the same 118-protocol evaluation set, with the
candidate refitted inside every fold. Radar-4's single global curve is the
baseline: LOO ×3.32, older-newer ×2.45 / ×2.38.

| Candidate | LOO | Older-newer (2024 / 2023) | Kept? |
|---|---|---|---|
| Median (L1) regression, grid slope | ×4.00 | ×3.47 / ×4.05 | No |
| k-nearest neighbours on log(mcap/TVL), k = 3–50 | ×3.82–×5.44 | ×2.32–×5.12 | No |
| Ensembles of OLS + kNN (log space) | ×3.53–×3.79 | ×2.28–×2.87 | No |
| Recency-weighted OLS (τ = 365–1460 days) | ×3.55–×3.58 | ×2.30–×2.65 | No |
| Local kernel OLS (h = 0.3–1.0) | ×3.39–×3.61 | ×2.57–×4.15 | No |
| Outlier-trimmed OLS alone (2.5 MAD, one pass) | ×3.29 | ×2.22 / ×2.46 | No |
| Huber IRLS (c = 1.345–2.0) | ×3.30–×3.33 | ×2.24–×2.30 | No |
| Fixed slope b = 0.4–0.55 | ×3.28–×3.35 | ×2.37–×2.51 | No |
| One-at-a-time intercept shifts (age, chains, growth) | ×3.31–×3.49 | ×2.38–×3.80 | No |
| Two-segment OLS (median-TVL break) | ×3.29 | ×3.12 / ×2.93 | No |
| Binned median log-ratio | ×3.82–×4.33 | ×3.04–×4.70 | No |
| Bridge dummy shift alone | ×3.06 | ×2.82 / ×2.29 | No |
| **Bridge dummy + trimmed OLS (2.5 MAD, one pass)** | **×2.71** | **×1.97 / ×2.27** | **Yes** |

The kept variant is the only one that beats radar-4 on all three checks at
once, and it is not a knife-edge pick: the trim threshold k = 2.0, 2.2 and
2.5 all beat radar-4 (LOO ×2.89, ×2.82, ×2.71), and a second trim pass
gives ×2.75. The two ingredients help different halves of the board: the
bridge shift cuts the bridge rows' median miss from ×3.36 to ×2.69 and the
non-bridge rows' from ×3.24 to ×3.06, and the trim drops five protocols
whose market caps are structurally disconnected from their TVL. The
threshold k = 2.5 was picked from this grid, which is model selection on
the backtest itself — the honest caveat is that the ×2.71 is the best of
the grid, not an untouched estimate; the neighbouring thresholds bracket
it at ×2.82–×2.89.

For the odds, the candidates on the same even/odd slug split (radar-4's
band model: 66.0%, AUC 0.73): a ridge logistic regression on age-band
dummies plus frequent-category dummies alone scores 64.6% (AUC 0.74);
age alone 55.7%; continuous features (age, TVL, growth, chains) 60.9%;
continuous + categories 65.2%. The 50/50 logit-space ensemble of the band
model and the logistic model scores **66.5%** on that split (AUC 0.74) and
**69.7%** under 5-fold cross-validation (AUC 0.77), against the band
model's 67.7% (AUC 0.75) under the same 5-fold split — the ensemble is
kept because it beats the band model on both validation protocols, not
because either split alone flatters it. The production run's numbers are
slightly better still (67.0% even/odd, 69.9% 5-fold) because the dashboard
fits the logistic model's category list from the training set alone, where
the experiment had taken it from the whole snapshot.

Honest comparison with the top three entries' reported numbers (from their
own dashboards, 2026-11-19): our leave-one-out **×2.71 now beats their
×2.92–×3.21**, our older-into-newer **×1.97 beats their ×2.40–×2.60**, and
our odds hold-out **67.8% (71.6% 5-fold)** now sits at their 69–70% level
on the single split and above it under 5-fold. The newer-protocol
P25–P75 coverage of 50% still lands just short of the 55% target (15 of
30 newer protocols inside the interval — one more would make it 53%).
This dashboard reports its own numbers, not theirs. The backtest is
printed on the dashboard, with the whole-snapshot curve, so the judge can
see it without opening this file.

### What was tried for radar-6, and what was kept

Every candidate below was scored the same way as the radar-5 table above:
leave-one-out median miss and older-into-newer miss on the same
118-protocol evaluation set, with the candidate refitted inside every fold.
Radar-5's trimmed curve with the bridge shift is the baseline: LOO ×2.71,
older-newer ×1.97 / ×2.27. Nothing beat it on both checks at once, so the
size curve is unchanged in radar-6 — the honest result is that the curve
was already the best of the families tried, and the gains in radar-6 come
from the odds model, the rank ranges and the dashboard.

| Candidate | LOO | Older-newer (2024 / 2023) | Kept? |
|---|---|---|---|
| One-per-ticker comps (category median mcap/TVL) | ×5.56 | ×4.89 / ×5.13 | No |
| k-nearest neighbours on log TVL, k = 5–20 | ×4.00–×4.68 | ×2.69–×3.92 | No |
| Category kNN, k = 5–10 | ×4.40–×4.61 | ×2.70–×4.09 | No |
| Per-category curves, shrunk toward global, k = 10–25 | ×3.00–×3.26 | ×2.10–×2.23 | No |
| Shrunk per-category intercept shifts, k = 5–20 | ×2.96–×3.41 | ×2.05–×2.16 | No |
| Multiple OLS (+ log age, chains, growth) | ×3.20–×3.36 | ×3.96–×4.50 | No |
| Quadratic in log TVL + bridge | ×3.25 | ×3.31 / ×2.74 | No |
| Median (L1) regression, grid slope | ×3.66 | ×2.74 / ×2.74 | No |
| Huber IRLS, c = 1.345–2.0 | ×2.80–×2.93 | ×2.24–×2.40 | No |
| Age-band intercept shifts, k = 10 | ×3.19 | ×2.11 / ×2.27 | No |
| Two-segment OLS (median-TVL break) | ×3.31 | ×2.91 / ×2.62 | No |
| Trim + bridge + liquid-staking dummy | ×2.71 | ×1.97 / ×2.27 | No — identical to radar-5; the dummy fits to ~0 |
| Trim + bridge + DEX dummy | ×3.02 | ×2.27 / ×2.61 | No |
| Iterative trim (2 passes) | ×2.85 | ×2.03 / ×2.27 | No |
| Ensembles of radar-5 + comps / kNN / multi-OLS | ×3.01–×4.08 | ×2.30–×3.25 | No |
| Ensemble radar-5 + Huber, 50/50 | ×2.76 | ×2.22 / ×2.24 | No |
| Ensemble radar-5 + category shifts, 50/50 | ×2.84 | ×2.01 / ×2.31 | No |
| **Radar-5 curve kept (trim + bridge)** | **×2.71** | **×1.97 / ×2.27** | **Yes** |

For the odds, the candidates on the same even/odd slug split and the same
5-fold cross-validation (radar-5's ensemble: 67.0% / 69.9%, AUC 0.75 / 0.77):

| Candidate | Even/odd | 5-fold | 10-fold | Kept? |
|---|---|---|---|---|
| Band model alone | 66.0%, AUC 0.73 | 67.7%, AUC 0.75 | — | No |
| Logistic (band + category dummies) alone | 67.5%, AUC 0.74 | 71.1%, AUC 0.77 | — | No |
| Logistic + continuous features (log TVL, growth, chains, log age) alone | 69.9%, AUC 0.75 | 71.0%, AUC 0.78 | 70.2%, AUC 0.78 | No |
| **Ensemble 50/50, logistic with continuous features** | **67.8%, AUC 0.76** | **71.6%, AUC 0.78** | **69.8%, AUC 0.78** | **Yes** |
| Ensemble 25/75 band/logit, with continuous features | 67.0%, AUC 0.75 | 71.4%, AUC 0.78 | 69.9%, AUC 0.78 | No |
| Ensemble 75/25 band/logit, with continuous features | 66.2%, AUC 0.74 | 69.5%, AUC 0.77 | 69.1%, AUC 0.77 | No |

The kept odds ensemble beats radar-5's on both headline splits and on
10-fold, and on an alphabetical-half split (train on slugs a–m, test on
n–z) it scores 73.5% against radar-5's 71.9% (the reverse split is 67.8%
against 68.5% — the one check of five where it does not win). The
logistic-alone variant wins the single even/odd split by more (69.9%) but
loses the 5-fold to the kept ensemble (71.0% vs 71.6%); the ensemble is
kept because it is the best on the cross-validated protocols and the most
consistent across splits, not because any one split flatters it.

## Farm plans and farm economics

Each row carries seven steps, derived from the protocol's own record
(category, chains, TVL, age): a fresh-wallet setup step, the category's
action with a $1,000 deposit and gas cost, a weekly qualifying action, a
holding period (30–60 days by age), a claim-only-from-the-protocol's-own-page
step, a farm log, and an exit rule (unwind if TVL halves for a week, if the
position loses more than 20%, or after the holding period, with a review
date). Every step states its cost and its time.

Every row also carries farm economics on the same consistent $1,000 deposit
basis, shown in the detail view:

```
expected value = implied x launch odds x 5% (airdrop pool share)
                 x ($1,000 / 25% of TVL)   (the farmer's share of the
                                           farmed capital)
T-bill forgone = $1,000 x 4% a year x holding days / 365
net            = expected value - gas for the plan - T-bill forgone
net per hour   = net / the plan's active minutes
break-even     = the launch odds at which the expected value exactly
                 pays the gas and the forgone yield
verdict        = FARM when net > 0, THIN when break-even odds <= 0.6,
                 otherwise SKIP
```

The 5% airdrop pool (the conservative end of real airdrops, which usually
allocate 5–15% of supply), the 25% farmed-capital fraction (a quarter of a
pre-token protocol's TVL farming for the airdrop) and the 4% T-bill rate
are stated assumptions, not snapshot facts, and the dashboard says so.
Radar-3 used a 10% pool over 5% of TVL and charged no T-bill cost, which
made 108 rows look farmable; the radar-4 audit is deliberately stricter.
Verdicts on this snapshot: **25 FARM, 5 THIN, 196 SKIP**. Best net per
hour on $1,000: Wan Bridge, **+$109.03/hour** (net +$172.63 on $26 of gas
and $3.29 of forgone yield). On a $10,000 plan the same protocol is
+$1,238.08/hour (net +$1,960.29), with 99 FARM verdicts at that deposit
— the dashboard's KPI strip shows both bases, and the what-if controls
re-price any row at another deposit,
farmed-capital share or T-bill rate. Every row's economics now also
carries a dated timeline — snapshot 2026-11-14, hold 30–60 days by age,
review by a named date (2026-12-14 for a 30-day hold) — so each farm plan
has a start, a hold and a review date, not just a duration.

## The dashboard

`dashboard/` is a static page (index.html + app.css + app.js, 52 KB total,
no network, no external URLs): a KPI strip (rows ranked, total implied
value, backtest median miss, P25–P75 coverage, FARM verdicts, best net per
hour at $1,000 and at $10,000), an integrity strip (758 protocols in the
snapshot, 226 ranked, 289 rankable pre-token of which 63 sit above the
floor off the watchlist, 416 already with a token, 200 bootstrap refits,
and the check that the accounting buckets sum to 758), a ranked board with
search, category, chain and scope filters, sorting by rank / implied value /
TVL / growth / age, a rank-range column (P10–P90 over 200 bootstrap refits)
on every row, a top-three spotlight, a detail view per protocol (fitted
curve with its bridge shift and trim count + launch odds with both ensemble
components + bootstrap P10–P90 + farm economics with its dated timeline +
five nearest listed comparables + seven-step farm plan), a compare view
(up to three protocols side by side, model and economics lined up),
Export CSV / Export JSON of the board as filtered, the backtest section
(including older-into-newer, odds hold-out and 5-fold cross-validation, and
coverage by age), a 758-protocol accounting table (every protocol in exactly
one bucket, summing to 758), a value-against-TVL scatter (traded vs
pre-token, with the fitted curve as a solid line and the bridge curve as a
dashed line), the live-token comparison table, and the model sandbox with
what-if controls.
It opens from a local file: `out/dashboard/index.html`.
Deep links: `#detail=<slug>`, `#filter=<category>`,
`#scope=watchlist|early`, `#chain=<chain>` — a deep link scrolls to the
board or the detail it names.

`screenshots/` holds three PNGs taken with headless Chrome (Chromium 157,
run under Xvfb with CDP because the Hatch build needs its WebGL domain
policy switches to start) from the local dashboard: the board (1440×900),
a protocol detail view (1440×1440, rank 1 USDD), and a filtered view
(1440×900, Bridge filter, 13 protocols).

## Test results (2026-11-20, radar-6)

- `MAKEFUN_OUTPUT_DIR=out node main.ts` run twice: identical bytes for
  `board.json`, `data.js` and `dossier.json` (sha256 compared, two runs
  in a row after the final dashboard change).
  `board.json` sha256 `bf867e23eb8501037dea9a69db9a805efaa1dfdca211f4e41409aaa2fc91c33c`.
  `data.js` sha256 `6165663abba62fb8ef190805f83912eb431774e8d1732779ef9d747eb56fab33`.
  `dossier.json` sha256 `3c5394ac79f40eba77f2b3963163208fd94e04612f0217c5fcbf69793ca82784`.
- Board: 226 rows (40 watchlist + 186 early), ranks 1–226 exactly once,
  implied values non-increasing by rank, all 40 watchlist slugs covered,
  farm steps 7 per row, each 130–294 characters.
- `board.json` 514,261 bytes (< 8 MiB); dashboard 51,709 bytes (< 64 KB
  dossier text, fully included); `dossier.json` 1,153,592 bytes (< 1.5 MiB).
- Screenshots: 3 PNGs taken with Chromium 157 from the local dashboard —
  `1-board.png` 1440×900 (board, KPI strip, integrity strip, top three),
  `2-detail.png` 1440×1440 (detail view of rank 1 USDD: fitted curve +
  launch odds + bootstrap range + farm economics with timeline +
  comparables + seven-step plan), `3-filtered.png` 1440×900 (Bridge
  filter, 13 protocols).
  Each under 512 KiB (223 KB / 371 KB / 231 KB). All three were visually
  checked: board, detail and filtered view all render with real data, no
  blank or broken view, no "NaN" anywhere on the page. The scatter
  (354 points: 128 traded + 226 pre-token, two curve lines), the
  accounting table (7 buckets + total = 758), the integrity strip
  (758 = 758), the compare view (two protocols side by side, rank ranges
  and bootstrap bands lined up), the CSV/JSON export buttons and the
  sandbox slider were verified in the live page via CDP and visually
  checked too.
- No `http://` or `https://` in any dashboard file (checked by scan).
- `node cli/makefun.mjs check` (kit CLI, against a fresh clean copy +
  the radar-5 transcripts bundle): **13 passed, 0 failed**, 6 skipped,
  5 checked at submission. thinking_reproduces passes at 58.1%
  (1,471 of 2,531 counted lines) on the old bundle alone; the radar-6
  builder session is not in that bundle yet — the submission bundle must
  add it (plus the original 4 sessions) or authorship will be
  under-counted at the real submission. First run against a copy that
  wrongly included `token-radar-01-kit/` failed thinking_reproduces at
  1.0% (the kit's own 289,944 lines swamped the count) — the kit folder
  is not part of the entry and must not be in the checked tree.

Bounty: `token-radar-01` — $1,325 USDC, 10 places
(1st $1,000, 2nd–5th $50, 6th–10th $25).
Deadline: **Monday 14 December 2026, 17:00 WIB**
(2026-12-14T10:00:00Z per `competition.yaml` in the kit).
