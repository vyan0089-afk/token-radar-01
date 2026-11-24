[![token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/vyan0089-afk/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/vyan0089-afk/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01)

# Token Radar radar-7 — pre-token protocols ranked by implied value

A radar over the sealed DeFiLlama snapshot of 2026-11-14 (758 protocols, floor $50M TVL,
40-protocol watchlist). It ranks 250 pre-token protocols by **implied value = fitted curve ×
launch odds**, with no hand-set multiplier anywhere, and gives each one a dated, costed farm
plan with a FARM / THIN / SKIP verdict. Live-token protocols are shown apart, at the market's
own values, never mixed into the ranked board.

## The model

The size curve is fitted by ordinary least squares on the traded protocols (MAD-trimmed):

```
log10(mcap) = 2.8631 + 0.5283 · log10(TVL) + 0.4794 bridge
R² 0.2668 · n = 114 (pool 119, trimmed 5) · implied = curve × launch odds
```

Launch odds are an ensemble: the age-band × category rate (shrunk toward the band rate,
k = 10) averaged in logit space with a ridge logistic regression (band + frequent-category
dummies + log TVL, growth, chains, log age). Every row also carries a bootstrap P10–P90 band
of its implied value and rank over 200 refits of the curve (fixed seed).

## Held-out tests — the honest numbers

| Test | Chosen curve | All-terms fit | Flat baseline |
| --- | --- | --- | --- |
| Leave-one-out (n = 114) | **×2.71** | ×2.88 | ×5.71 |
| Older → newer, 2024 split (n = 48) | **×1.97** | ×2.77 | — |
| Older → newer, 2023 split (n = 58) | **×2.27** | ×4.47 | — |

Launch odds: **67.8%** on the even/odd slug hold-out (majority 54.6%, AUC 0.756) and
**71.6%** under 5-fold cross-validation (AUC 0.778).

**The all-terms fit lost, and the board says so.** Radar-7 fits every value term — log TVL,
bridge shift, clamped 7-day growth, log age, an age-unknown flag, capped chain count — by
OLS on the same trimmed pool (intercept 2.94, log TVL 0.53, bridge 0.49, growth +0.02,
log-age −0.02, age-unknown −0.01, chains −0.005; R² 0.27). The extra coefficients are near
zero, and the fit loses to the two-term curve on all three held-out tests, so the board does
not use it. The full fit is reported in the dashboard's Model panel, not hidden. Category
shifts, growth squared, ridge shrinkage of the extra terms, trimming on the full model's
residuals and fitting on age-known protocols only were all tried on the same splits; none
beat the two-term curve on leave-one-out.

**This model does not beat radar-6 on the core fit** (LOO ×2.71, the same). Its edge is
honesty and presentation: every term fitted and tested three times held-out, the losing fit
reported, an integrity strip on every row, and a board whose top is kept free of wrapped,
staked and bridged products of tokens that already trade (they sit at the tail only, to
reach 250 rows).

## The board

250 rows, implied value $19,599,605 (USDD) down to $255,685. Verdicts on a $1,000 deposit
basis: **28 FARM / 5 THIN / 217 SKIP**. Top 5: USDD, Veda, DeFi Saver Asset Management,
Polymarket International, Steakhouse Financial. 24 live-token protocols are set aside and
shown in the Live view.

Each row shows its curve value, launch odds and its two odds components, its bootstrap
value and rank bands, its integrity flags (missing 7-day change, unknown age, TVL under
the floor, null category, single chain, wrapped/staked/bridged product), and its farm
economics: expected value, total gas, T-bill yield forgone, net, net per active hour,
break-even odds, review date, and a 7-step plan with a cost and a time per step.

## Run it

Node 22, standard library only — no install, no build:

```sh
node main.ts --input <snapshot.json|directory> --output <dir>
# or: MAKEFUN_OUTPUT_DIR=out node main.ts --input ../kit/input/snapshot.json
```

It writes `board.json` (`{rows: [...]}`), `data.js` (the dashboard dataset), copies
`dashboard/` and `screenshots/`, and writes `dossier.json` (rebuilt byte-for-byte by the
scorer from the same output). It exits 1 if the board fails the gate (watchlist coverage,
ranks 1..250, implied value monotone, farm steps 3–12 at 20–600 characters) or if fewer
than 3 screenshots are present.

## Dashboard

`dashboard/index.html` + `app.css` + `app.js` (35 KB combined), no network: it reads
`../data.js` (`window.RADAR`). Sortable columns (implied value, TVL, 7-day growth, age,
launch odds, rank band); filters for chain, category, pre-token only, TVL range and
verdict; click a row for its detail view (full model arithmetic recomputed on the page,
nearest traded comparables by TVL, farm timeline with review date, integrity strip,
economics and costed verdict). Deep links: `#/` board, `#/p/<slug>` detail,
`#/f/<filter>` filtered view (e.g. `#/f/verdict=FARM`), `#/live`, `#/model`, `#/acct`.

## Repo layout

```
main.ts            entry program (parse → build → check → write → dossier)
lib/model.ts       the radar-7 model (parseSnapshot, buildRadar, dataScript, boardIssue)
dashboard/         index.html + app.css + app.js
screenshots/       1-board.png, 2-detail.png, 3-filtered.png (1440×900)
vendor/makefun-board.ts   make.fun dossier library, copied from the kit starter
LICENSE            MIT, from the kit starter
```

## Assumptions, stated

- Airdrop pool 5% of implied value; farmed capital 25% of TVL; T-bill 4%/yr; $1,000
  deposit; hold 30–60 days by age; gas from the plan's own steps.
- Growth clamped to −60%…+120%; unknown age treated as 365 days; chain count capped at 10
  in the fitted term; odds clamped to 5%…95%.
- A protocol is pre-token when its record carries no market cap, no CoinGecko id and no
  symbol. Exchanges and versioned releases (e.g. "Foo V2") are never ranked.
- The snapshot is 2026-11-14; prices, TVL and launch odds are that day's, not today's.
