# Operative Data and Prediction Markets

Single-page board: for each economic indicator, live official data with a two-to-three-year trend, the prediction-market
contracts that price it (Polymarket, Manifold, Metaculus), and recent passages from BBC Business, CNBC Economy,
The Economist and seven economic think tanks (NIESR, Resolution Foundation, Institute for Government, LSE British
Politics and Policy, Oxford Economics, Bruegel, Tax Foundation), linked with W3C text fragments to the exact passage.

- `index.html` — the whole page. Works opened as a local file (shows the quote set selected when it was built) or hosted.
- `data/quotes.json` — the daily media selection; the hosted page fetches it on load.
- `scripts/fetch_candidates.py` — gathers candidate articles for the daily review.
- `scripts/verify_quotes.py` — verifies every quote against its source and builds the text-fragment links.
- `scripts/build.py` — rebuilds `index.html` from `template.html`, `app.js`, `data/quotes.json` and the fallbacks in `src/` (only needed when the page itself changes; a quote refresh needs no rebuild).
- `src/` — bundled fallback copies of the data and contract metadata, shown only if a publisher is unreachable.
- `JOB.md` — instructions the daily scheduled review follows.

Hosting: GitHub Pages, source "Deploy from a branch" (main, root). Nothing else to configure.
