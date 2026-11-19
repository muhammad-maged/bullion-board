# Bullion Board

**Live:** https://muhammad-maged.github.io/bullion-board/

A React dashboard for the Egyptian gold market, world precious metals, and USD/EUR → EGP exchange rates. It uses free APIs only, with no keys and no sign-up.

## Run it

```bash
npm install
npm run dev            # http://localhost:5173
```

## Build and host

```bash
npm run build          # static site in dist/ (Netlify, Vercel, GitHub Pages, any web host)
npm run build:single   # one self-contained file: dist-single/index.html
npm test               # data-logic tests
```

You can open `dist-single/index.html` directly in a desktop browser or upload it anywhere.

## What it shows

- **Egypt gold by karat**: 24K, 22K, 21K, 18K and 14K per gram, plus the gold pound (8 g of 21K). An optional *local market premium %* covers times when shops price above the world rate. Workmanship fees aren't included.
- **Gold chart** for the selected karat: 1D (intraday), 1W, 1M and 1Y, with a hover/touch tooltip.
- **All precious metals**: gold, silver, platinum and palladium in EGP or USD, per g, oz or kg, with the 1-day change and a 7-day trend line.
- **FX**: USD → EGP, EUR → EGP and EUR → USD.
- Defaults are **EGP** and **per gram**. Your choices are remembered in this browser.

## Data sources and refresh

| Data | Source | Refresh |
|---|---|---|
| Live metals (XAU, XAG, XPT, XPD) | api.gold-api.com `/price/{SYM}` | every 60 s |
| Live gold and silver, gold charts | xaus.com `/api/v1/spot`, `/history`, `/intraday` | 60 s (charts every 6 h) |
| USD/EUR → EGP | open.er-api.com `/v6/latest/USD` | every 5 min (updates daily) |
| Backup for everything, plus the 7-day trend | fawazahmed0 currency-api (jsDelivr, mirrored on pages.dev) | every 5 min / 6 h |

- If a live metal source fails, the dashboard uses the daily backup and labels that row **daily**. The status pill then shows **Delayed**.
- **Refresh now** skips all caches and then waits 10 seconds before it can be used again.
- Polling pauses while the tab is hidden. The last good data is cached in `localStorage`, so the page opens instantly next time.
- You can change the intervals in `src/lib/constants.js`.

## Notes

- The chart history is in USD and is converted to EGP using **today's** USD → EGP rate.
- Prices are indicative spot-derived values, not dealer quotes. These are free community APIs, so for a commercial product, consider a paid feed as the primary source and keep these as backups.

## Structure

```
src/
  lib/api.js         fetchers + parsers for every source
  lib/derive.js      conversions, karat prices, changes, chart series
  lib/constants.js   karats, units, refresh intervals
  hooks/usePrices.js polling, fallbacks, force refresh, caching
  components/        charts and small UI parts
  App.jsx            the dashboard
tests/               node:test suite (uses a real daily data file)
```
