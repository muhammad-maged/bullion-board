// Free, keyless data sources. Every fetcher returns normalized data or throws.
// All metal prices are normalized to USD per troy ounce.
import { REQUEST_TIMEOUT } from './constants.js';

export const SOURCES = {
  goldApi: { name: 'gold-api.com', url: 'https://gold-api.com', kind: 'Live metals' },
  xaus: { name: 'XAUS', url: 'https://xaus.com/api', kind: 'Live gold & silver, charts' },
  erApi: { name: 'ExchangeRate-API (open)', url: 'https://www.exchangerate-api.com/docs/free', kind: 'FX, daily' },
  fawaz: { name: 'fawazahmed0 currency-api', url: 'https://github.com/fawazahmed0/exchange-api', kind: 'FX + metals, daily backup' },
};

export async function fetchJSON(url, { bust = false, timeout = REQUEST_TIMEOUT } = {}) {
  const u = bust ? url + (url.includes('?') ? '&' : '?') + '_=' + Date.now() : url;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(u, { signal: ctrl.signal, cache: bust ? 'no-store' : 'default' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

const num = (v) => (typeof v === 'string' ? parseFloat(v) : v);
const valid = (v) => Number.isFinite(v) && v > 0;
const toTs = (v) => {
  if (v == null) return null;
  if (typeof v === 'number') return v < 1e12 ? v * 1000 : v;
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : null;
};

/* ---------- gold-api.com : /price/{SYMBOL} ---------- */
export function parseGoldApi(json) {
  const usdOz = num(json?.price);
  if (!valid(usdOz)) throw new Error('gold-api: no price');
  return { usdOz, at: toTs(json.updatedAt) ?? Date.now() };
}
export async function fetchGoldApi(code, opts) {
  return parseGoldApi(await fetchJSON('https://api.gold-api.com/price/' + code, opts));
}

/* ---------- XAUS : /api/v1/spot ---------- */
export function parseXausSpot(json) {
  const out = {};
  const at = toTs(json?.price_as_of) ?? toTs(json?.updated_at) ?? Date.now();
  const gold = num(json?.spot_usd_oz);
  const silver = num(json?.silver_usd_oz);
  if (valid(gold)) out.XAU = { usdOz: gold, at };
  if (valid(silver)) out.XAG = { usdOz: silver, at };
  if (!out.XAU && !out.XAG) throw new Error('xaus: no price');
  return out;
}
export async function fetchXausSpot(opts) {
  return parseXausSpot(await fetchJSON('https://xaus.com/api/v1/spot?compact=1', opts));
}

// Finds the first array of objects that carries the given keys, wherever it sits.
export function findSeries(obj, keys, depth = 0) {
  if (!obj || depth > 3) return null;
  if (Array.isArray(obj)) {
    return obj.length && typeof obj[0] === 'object' && keys.every((k) => k in obj[0]) ? obj : null;
  }
  if (typeof obj === 'object') {
    for (const v of Object.values(obj)) {
      const s = findSeries(v, keys, depth + 1);
      if (s) return s;
    }
  }
  return null;
}

export function parseXausHistory(json) {
  const rows = findSeries(json, ['d', 'c']);
  if (!rows) throw new Error('xaus history: no series');
  return rows
    .map((r) => ({ t: toTs(r.d), usdOz: num(r.c) }))
    .filter((p) => p.t && valid(p.usdOz))
    .sort((a, b) => a.t - b.t);
}
export async function fetchGoldHistory(opts) {
  return parseXausHistory(await fetchJSON('https://xaus.com/api/v1/history', opts));
}

export function parseXausIntraday(json) {
  const rows = findSeries(json, ['t', 'p']);
  if (!rows) throw new Error('xaus intraday: no series');
  return rows
    .map((r) => ({ t: toTs(r.t), usdOz: num(r.p) }))
    .filter((p) => p.t && valid(p.usdOz))
    .sort((a, b) => a.t - b.t);
}
export async function fetchGoldIntraday(opts) {
  return parseXausIntraday(await fetchJSON('https://xaus.com/api/v1/intraday?symbol=xau&hours=24', opts));
}

/* ---------- ExchangeRate-API open endpoint ---------- */
export function parseErApi(json) {
  const egp = num(json?.rates?.EGP);
  const eur = num(json?.rates?.EUR);
  if (!valid(egp) || !valid(eur)) throw new Error('er-api: missing EGP/EUR');
  return { usdEgp: egp, usdEur: eur, at: toTs(json.time_last_update_unix) ?? Date.now() };
}
export async function fetchErApi(opts) {
  return parseErApi(await fetchJSON('https://open.er-api.com/v6/latest/USD', opts));
}

/* ---------- fawazahmed0 currency-api (daily files, has XAU/XAG/XPT/XPD) ---------- */
// date: 'latest' or 'YYYY-MM-DD'
export function parseFawaz(json) {
  const u = json?.usd;
  if (!u) throw new Error('fawaz: no usd table');
  const usdEgp = num(u.egp);
  const usdEur = num(u.eur);
  const metals = {};
  for (const code of ['XAU', 'XAG', 'XPT', 'XPD']) {
    const r = num(u[code.toLowerCase()]); // ounces per 1 USD
    if (valid(r)) metals[code] = { usdOz: 1 / r };
  }
  if (!valid(usdEgp)) throw new Error('fawaz: no EGP');
  return { date: json.date, usdEgp, usdEur: valid(usdEur) ? usdEur : null, metals, at: toTs(json.date) };
}
export async function fetchFawaz(date = 'latest', opts) {
  const urls = [
    `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${date}/v1/currencies/usd.min.json`,
    `https://${date}.currency-api.pages.dev/v1/currencies/usd.min.json`,
  ];
  let lastErr;
  for (const u of urls) {
    try {
      return parseFawaz(await fetchJSON(u, opts));
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

export function isoDay(d) {
  return new Date(d).toISOString().slice(0, 10);
}
