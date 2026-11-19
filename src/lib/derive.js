// Pure helpers that turn raw USD/oz + FX data into what the UI shows.
import { GOLD_POUND, GRAMS_PER_OZ, KARATS, METALS, UNITS } from './constants.js';
import { isoDay } from './api.js';

export function convert(usdOz, { unit = 'g', currency = 'EGP', usdEgp }) {
  if (!Number.isFinite(usdOz)) return null;
  const perUnit = usdOz * UNITS[unit].perOz;
  if (currency === 'USD') return perUnit;
  return Number.isFinite(usdEgp) ? perUnit * usdEgp : null;
}

export const pctChange = (cur, prev) =>
  Number.isFinite(cur) && Number.isFinite(prev) && prev > 0 ? (cur / prev - 1) * 100 : null;

/** Latest daily snapshot strictly before `date` (YYYY-MM-DD). */
export function prevDaily(daily, date) {
  for (let i = daily.length - 1; i >= 0; i--) if (daily[i].date < date) return daily[i];
  return null;
}

function refDate(metal, now) {
  return metal?.date ?? isoDay(now);
}

export function metalRows({ metals, fx, daily, unit, currency, now = Date.now() }) {
  const usdEgp = fx?.usdEgp;
  return METALS.map((m) => {
    const cur = metals[m.code];
    const value = convert(cur?.usdOz, { unit, currency, usdEgp });
    const prev = prevDaily(daily, refDate(cur, now));
    const prevVal = prev?.metals?.[m.code]
      ? convert(prev.metals[m.code].usdOz, { unit, currency, usdEgp: prev.usdEgp })
      : null;
    const spark = daily
      .slice(-7)
      .map((d) => (d.metals?.[m.code] ? convert(d.metals[m.code].usdOz, { unit, currency, usdEgp: d.usdEgp }) : null))
      .filter(Number.isFinite);
    if (Number.isFinite(value)) spark.push(value);
    return {
      ...m,
      usdOz: cur?.usdOz ?? null,
      value,
      egpGram: convert(cur?.usdOz, { unit: 'g', currency: 'EGP', usdEgp }),
      usdGram: convert(cur?.usdOz, { unit: 'g', currency: 'USD' }),
      change: pctChange(value, prevVal),
      spark,
      live: !!cur?.live,
      source: cur?.source ?? null,
      at: cur?.at ?? null,
    };
  });
}

/** Egyptian karat prices per gram (spot-derived), with an optional local premium %. */
export function karatPrices({ metals, fx, daily, currency, premium = 0, now = Date.now() }) {
  const gold = metals.XAU;
  const mult = 1 + (Number(premium) || 0) / 100;
  const usdEgp = fx?.usdEgp;
  const base = convert(gold?.usdOz, { unit: 'g', currency, usdEgp });
  const prev = prevDaily(daily, refDate(gold, now));
  const prevBase = prev?.metals?.XAU ? convert(prev.metals.XAU.usdOz, { unit: 'g', currency, usdEgp: prev.usdEgp }) : null;
  const change = pctChange(base, prevBase);
  const karats = KARATS.map((k) => ({
    ...k,
    price: Number.isFinite(base) ? base * k.purity * mult : null,
    change,
  }));
  const pound = Number.isFinite(base) ? base * GOLD_POUND.purity * GOLD_POUND.grams * mult : null;
  return { karats, pound, change };
}

export function fxCards({ fx, daily, now = Date.now() }) {
  if (!fx) return [];
  const prev = prevDaily(daily, isoDay(fx.at ?? now));
  const series = (fn) => {
    const s = daily.slice(-7).map(fn).filter(Number.isFinite);
    const c = fn(fx);
    if (Number.isFinite(c)) s.push(c);
    return s;
  };
  const usdEgp = (d) => d?.usdEgp;
  const eurEgp = (d) => (d?.usdEgp && d?.usdEur ? d.usdEgp / d.usdEur : NaN);
  const eurUsd = (d) => (d?.usdEur ? 1 / d.usdEur : NaN);
  return [
    { id: 'usd', pair: 'USD → EGP', name: 'US Dollar', value: usdEgp(fx), digits: 2, change: pctChange(usdEgp(fx), usdEgp(prev)), spark: series(usdEgp) },
    { id: 'eur', pair: 'EUR → EGP', name: 'Euro', value: eurEgp(fx), digits: 2, change: pctChange(eurEgp(fx), eurEgp(prev)), spark: series(eurEgp) },
    { id: 'eurusd', pair: 'EUR → USD', name: 'Cross rate', value: eurUsd(fx), digits: 4, change: pctChange(eurUsd(fx), eurUsd(prev)), spark: series(eurUsd) },
  ];
}

const RANGE_DAYS = { '1W': 7, '1M': 31, '1Y': 366 };

/**
 * Gold chart series for the selected karat, in the chosen currency per gram.
 * Historical points use today's USD/EGP rate (the free history feed is USD only).
 */
export function goldChart({ range, goldHistory, goldIntraday, daily, metals, fx, currency, purity, premium = 0, now = Date.now() }) {
  const mult = (1 + (Number(premium) || 0) / 100) * purity;
  const usdEgp = fx?.usdEgp;
  const toVal = (usdOz) => {
    const v = convert(usdOz, { unit: 'g', currency, usdEgp });
    return Number.isFinite(v) ? v * mult : null;
  };
  let pts = [];
  if (range === '1D') {
    pts = goldIntraday.filter((p) => p.t >= now - 26 * 3600_000);
  } else {
    const from = now - RANGE_DAYS[range] * 86_400_000;
    pts = goldHistory.filter((p) => p.t >= from);
    if (pts.length < 3 && range === '1W') {
      pts = daily.filter((d) => d.metals?.XAU).map((d) => ({ t: Date.parse(d.date), usdOz: d.metals.XAU.usdOz }));
    }
  }
  const out = pts.map((p) => ({ t: p.t, v: toVal(p.usdOz) })).filter((p) => Number.isFinite(p.v));
  const live = metals.XAU;
  if (live && out.length && (!out.length || live.at > out[out.length - 1].t)) {
    const v = toVal(live.usdOz);
    if (Number.isFinite(v)) out.push({ t: live.at ?? now, v });
  }
  return out;
}

export { GRAMS_PER_OZ };
