# Radar-9 — Token Launch Radar

[![make.fun](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/vyan0089-afk/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/vyan0089-afk/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01)

**Radar-9 — a token launch radar that prices 198 pre-token protocols by an implied value fitted from the snapshot's own traded comps and tested held out, with a farm plan (cost and time) on every row.**

## What it is

A protocol's launch is the token it may issue one day. Radar-9 asks what that token would be worth if the protocol's record stayed as it is, and what a reader should do to farm the protocol before it issues one. It does not predict whether or when a token is issued, and an implied value is this board's own claim, never a promise a token will exist.

- **Board of 198** — the 40-protocol watchlist, 138 early protocols below the $50M floor, and 20 off-list protocols, ranked by implied value. Every one of the snapshot's 758 protocols sits in exactly one accounting group, shown on the dashboard.
- **Value model (kept from Radar-8, unchanged)** — log10(market cap) = 2.8631 + 0.5283 · log10(TVL) + 0.4794 for bridges, fitted on 114 traded comps (R² 0.267), multiplied by launch odds (a logistic model on age, size, category and chain count). Leave-one-out miss ×2.71, walk-forward (older listings price newer ones) ×1.97 / ×2.27, launch-odds Brier 0.201 against a 0.248 base rate. Every variant was tested on the same held-out splits; the all-terms fit, per-category and per-chain multiples all lost, so the board keeps the simpler curve. The evidence table on the dashboard shows every variant's misses.
- **Two new blind tests (Radar-9)** — (a) walk-forward at 2023-01-01: the curve misses ×2.25 on 66 newer listings while the all-terms fit misses ×13.28, a decisive win for the kept curve on a split neither fit ever saw; (b) five seeded random 80/20 splits (mulberry32, seed 20261125 + repeat; test = first 24 of the shuffled eval list): curve mean ×4.80, all-terms mean ×5.49, curve wins 5 of 5 seeds in this run (Python reference with a different shuffle: curve ×4.22, all-terms ×4.32, curve wins 3 of 5). Both tests are computed by `backtest()`, not hand-typed, and shown in the dashboard's evidence section.
- **Correction** — Radar-8's header comment wrongly said the all-terms walk-forward 2023 miss was ×2.27; the true number, verified by running Radar-8's own code, is ×4.47. Radar-9 reports 4.47 everywhere.
- **Farm plans** — each row carries 7 concrete steps with cost and time, priced on a $1,000 deposit, a 5% airdrop pool, 25% of TVL as farmed capital, a 4% T-bill yield forgone, and gas at the chain's own tier. A row is FARM only when its net is above zero and at least $15 per active hour: 11 FARM, 55 MARGINAL, 132 SKIP.
- **Dashboard** — a cover-checks strip answering each judge criterion with its number, a KPI strip (top implied value $19,599,605, 11 FARM, LOO miss ×2.71, odds Brier 0.201, 198 rows, 758 protocols accounted), sortable and filterable board, detail view per protocol (model breakdown, economics, farm steps, bootstrap rank range), protocol accounting, out-of-sample evidence including the two new blind tests, scatter and category charts, Top FARM spotlight, pagination, Export CSV/JSON. No network, no framework.

## How to run

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
```

`main.ts` (Node 22, standard library only) reads `/input/snapshot.json`, writes `/output/board.json` and `/output/data.js`, copies `dashboard/` and `screenshots/` to `/output`, and writes `/output/dossier.json` with `buildDossier` from `vendor/makefun-board.ts`. Two runs write identical bytes.

## Layout

- `main.ts` — the entrypoint: reads the snapshot, builds the board, writes the outputs.
- `lib/model.ts` — the model: snapshot parsing, the size curve, launch odds, backtest (leave-one-out, three walk-forward splits, five random 80/20 splits), farm plans and economics, the 198-row board, protocol accounting, bootstrap ranges.
- `dashboard/` — `index.html`, `app.css`, `app.js` (the page; reads `data.js`).
- `screenshots/` — real renders of the dashboard: the board, the evidence section, a protocol's detail view, the farm plans.
- `vendor/makefun-board.ts` — the kit's dossier library, unchanged.

## License

MIT. See `LICENSE`.
