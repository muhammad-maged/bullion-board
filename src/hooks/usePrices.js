import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchErApi,
  fetchFawaz,
  fetchGoldApi,
  fetchGoldHistory,
  fetchGoldIntraday,
  fetchXausSpot,
  isoDay,
} from '../lib/api.js';
import { FORCE_COOLDOWN, FX_INTERVAL, HISTORY_INTERVAL, METALS, METALS_INTERVAL } from '../lib/constants.js';

const STORE_KEY = 'bullion-board.snapshot.v1';
const SAMPLES_KEY = 'bullion-board.gold-samples.v1';
const DAY = 86_400_000;

function loadSnapshot() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function saveSnapshot(s) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(s));
  } catch {
    /* storage full or blocked: fine */
  }
}

const emptyStatus = () => ({
  goldApi: { ok: null, at: null, error: null },
  xaus: { ok: null, at: null, error: null },
  erApi: { ok: null, at: null, error: null },
  fawaz: { ok: null, at: null, error: null },
});

/** Merge live quotes with the daily backup. Live sources win. */
export function mergeMetals(goldApi, xaus, fawazLatest) {
  const out = {};
  for (const { code } of METALS) {
    if (goldApi[code]) out[code] = { ...goldApi[code], source: 'goldApi', live: true };
    else if (xaus?.[code]) out[code] = { ...xaus[code], source: 'xaus', live: true };
    else if (fawazLatest?.metals?.[code])
      out[code] = { ...fawazLatest.metals[code], at: fawazLatest.at, source: 'fawaz', live: false, date: fawazLatest.date };
  }
  return out;
}

export function usePrices() {
  const snap = useRef(loadSnapshot());
  const [metals, setMetals] = useState(snap.current?.metals ?? {});
  const [fx, setFx] = useState(snap.current?.fx ?? null);
  const [fawazLatest, setFawazLatest] = useState(snap.current?.fawazLatest ?? null);
  const [daily, setDaily] = useState(snap.current?.daily ?? []);
  const [goldHistory, setGoldHistory] = useState(snap.current?.goldHistory ?? []);
  const [goldIntraday, setGoldIntraday] = useState(snap.current?.goldIntraday ?? []);
  const [status, setStatus] = useState(emptyStatus);
  const [lastUpdated, setLastUpdated] = useState(snap.current?.lastUpdated ?? null);
  const [fromCache, setFromCache] = useState(!!snap.current);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [cooldownUntil, setCooldownUntil] = useState(0);

  const next = useRef({ metals: 0, fx: 0, history: 0 });
  const inFlight = useRef({ metals: false, fx: false, history: false });
  const fawazRef = useRef(fawazLatest);
  fawazRef.current = fawazLatest;

  const live = useRef({ goldApi: {}, xaus: null });
  const [goldSamples, setGoldSamples] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(SAMPLES_KEY) || '[]');
    } catch {
      return [];
    }
  });
  const [fallbackHistory, setFallbackHistory] = useState([]);
  const dayCache = useRef(new Map()); // 'YYYY-MM-DD' -> fawaz day

  // Merge whatever live sources answered so far with the daily backup, and show it.
  const applyMerged = useCallback((fw) => {
    const merged = mergeMetals(live.current.goldApi, live.current.xaus, fw ?? fawazRef.current);
    if (!Object.keys(merged).length) return;
    setMetals(merged);
    setLastUpdated(Date.now());
    setFromCache(false);
    const g = merged.XAU;
    if (g?.live) {
      setGoldSamples((prev) => {
        const cutoff = Date.now() - 26 * 3600_000;
        const last = prev[prev.length - 1];
        if (last && Date.now() - last.t < 30_000) return prev; // one sample per refresh
        const nextS = [...prev.filter((x) => x.t >= cutoff), { t: Date.now(), usdOz: g.usdOz }].slice(-2000);
        try {
          localStorage.setItem(SAMPLES_KEY, JSON.stringify(nextS));
        } catch {
          /* ignore */
        }
        return nextS;
      });
    }
  }, []);

  const mark = (key, ok, error = null) =>
    setStatus((s) => ({ ...s, [key]: { ok, at: ok ? Date.now() : s[key].at, error: error ? String(error.message || error) : null } }));

  const loadFx = useCallback(async (bust = false) => {
    if (inFlight.current.fx) return;
    inFlight.current.fx = true;
    try {
      const [er, fw] = await Promise.allSettled([fetchErApi({ bust }), fetchFawaz('latest', { bust })]);
      mark('erApi', er.status === 'fulfilled', er.reason);
      mark('fawaz', fw.status === 'fulfilled', fw.reason);
      if (fw.status === 'fulfilled') {
        setFawazLatest(fw.value);
        fawazRef.current = fw.value;
        applyMerged(fw.value);
      }
      if (er.status === 'fulfilled') setFx({ ...er.value, source: 'erApi' });
      else if (fw.status === 'fulfilled') setFx({ usdEgp: fw.value.usdEgp, usdEur: fw.value.usdEur, at: fw.value.at, source: 'fawaz' });
      return fw.status === 'fulfilled' ? fw.value : null;
    } finally {
      inFlight.current.fx = false;
      next.current.fx = Date.now() + FX_INTERVAL;
    }
  }, [applyMerged]);

  const loadMetals = useCallback(async (bust = false) => {
    if (inFlight.current.metals) return;
    inFlight.current.metals = true;
    try {
      const codes = METALS.map((m) => m.code);
      const ga = Promise.allSettled(codes.map((c) => fetchGoldApi(c, { bust }))).then((res) => {
        const goldApi = {};
        res.forEach((r, i) => {
          if (r.status === 'fulfilled') goldApi[codes[i]] = r.value;
        });
        const ok = Object.keys(goldApi).length > 0;
        mark('goldApi', ok, ok ? null : res.find((r) => r.status === 'rejected')?.reason);
        live.current.goldApi = goldApi;
        applyMerged();
      });
      const xa = fetchXausSpot({ bust }).then(
        (v) => {
          mark('xaus', true);
          live.current.xaus = v;
          applyMerged();
        },
        (e) => {
          mark('xaus', false, e);
          live.current.xaus = null;
          applyMerged();
        }
      );
      await Promise.all([ga, xa]);
    } finally {
      inFlight.current.metals = false;
      next.current.metals = Date.now() + METALS_INTERVAL;
    }
  }, [applyMerged]);

  const loadHistory = useCallback(async (bust = false) => {
    if (inFlight.current.history) return;
    inFlight.current.history = true;
    try {
      // previous 8 daily snapshots for 24h change + 7-day trend lines
      const days = Array.from({ length: 8 }, (_, i) => isoDay(Date.now() - (i + 1) * DAY));
      const [dailyRes, hist, intra] = await Promise.all([
        Promise.allSettled(days.map((d) => fetchFawaz(d, { bust }))),
        fetchGoldHistory({ bust }).then((v) => v, () => null),
        fetchGoldIntraday({ bust }).then((v) => v, () => null),
      ]);
      const got = dailyRes.filter((r) => r.status === 'fulfilled').map((r) => r.value);
      if (got.length) {
        const byDate = new Map(got.map((d) => [d.date, d]));
        setDaily([...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1)));
      }
      if (hist?.length) setGoldHistory(hist);
      if (intra?.length) setGoldIntraday(intra);
    } finally {
      inFlight.current.history = false;
      next.current.history = Date.now() + HISTORY_INTERVAL;
    }
  }, []);

  const refreshAll = useCallback(
    async (bust) => {
      setBusy(true);
      try {
        await Promise.all([loadFx(bust), loadMetals(bust), loadHistory(bust)]);
      } finally {
        setBusy(false);
      }
    },
    [loadFx, loadMetals, loadHistory]
  );

  // first load
  useEffect(() => {
    refreshAll(false);
  }, [refreshAll]);

  // scheduler: 1 s tick, paused while the tab is hidden
  useEffect(() => {
    const tick = () => {
      const t = Date.now();
      setNow(t);
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      if (t >= next.current.fx && next.current.fx) loadFx(false);
      if (t >= next.current.metals && next.current.metals) loadMetals(false);
      if (t >= next.current.history && next.current.history) loadHistory(false);
    };
    const id = setInterval(tick, 1000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [loadFx, loadMetals, loadHistory]);

  // persist the latest good data so the page opens instantly next time
  useEffect(() => {
    if (!Object.keys(metals).length && !fx) return;
    saveSnapshot({ metals, fx, fawazLatest, daily, goldHistory, goldIntraday, lastUpdated });
  }, [metals, fx, fawazLatest, daily, goldHistory, goldIntraday, lastUpdated]);

  /** Make sure the chart has data for a range; uses the daily backup when the live history feed is down. */
  const ensureHistory = useCallback(
    async (range) => {
      if (range === '1D') return;
      const days = range === '1W' ? 8 : range === '1M' ? 31 : 365;
      const from = Date.now() - days * DAY;
      if (goldHistory.length > 2 && goldHistory[0].t <= from + 2 * DAY) return; // live feed covers it
      const step = range === '1Y' ? 7 : 1;
      const dates = [];
      for (let i = 1; i <= days; i += step) dates.push(isoDay(Date.now() - i * DAY));
      const missing = dates.filter((d) => !dayCache.current.has(d));
      // fetch in small batches to stay polite to the CDN
      for (let i = 0; i < missing.length; i += 8) {
        const batch = missing.slice(i, i + 8);
        const res = await Promise.allSettled(batch.map((d) => fetchFawaz(d)));
        res.forEach((r, j) => dayCache.current.set(batch[j], r.status === 'fulfilled' ? r.value : null));
      }
      const pts = [...dayCache.current.values()]
        .filter((d) => d?.metals?.XAU)
        .map((d) => ({ t: Date.parse(d.date), usdOz: d.metals.XAU.usdOz }))
        .sort((a, b) => a.t - b.t);
      setFallbackHistory(pts);
    },
    [goldHistory]
  );

  const forceRefresh = useCallback(() => {
    if (Date.now() < cooldownUntil || busy) return;
    setCooldownUntil(Date.now() + FORCE_COOLDOWN);
    refreshAll(true);
  }, [cooldownUntil, busy, refreshAll]);

  const nextIn = next.current.metals ? Math.max(0, Math.ceil((next.current.metals - now) / 1000)) : null;

  return {
    metals,
    fx,
    daily,
    goldHistory,
    goldIntraday,
    goldSamples,
    fallbackHistory,
    ensureHistory,
    status,
    lastUpdated,
    fromCache,
    busy,
    now,
    nextIn,
    cooldownLeft: Math.max(0, Math.ceil((cooldownUntil - now) / 1000)),
    forceRefresh,
  };
}
