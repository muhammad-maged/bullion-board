const cache = new Map();
function nf(min, max) {
  const key = min + ':' + max;
  if (!cache.has(key)) {
    cache.set(key, new Intl.NumberFormat('en-US', { minimumFractionDigits: min, maximumFractionDigits: max }));
  }
  return cache.get(key);
}

/** Pick sensible decimals for a price. */
export function decimalsFor(v, currency) {
  const a = Math.abs(v);
  if (currency === 'EGP') return a >= 1000 ? 0 : a >= 10 ? 2 : 3;
  return a >= 10000 ? 0 : a >= 10 ? 2 : 3;
}

export function fmtNum(v, digits) {
  if (v == null || !Number.isFinite(v)) return '—';
  return nf(digits, digits).format(v);
}

export function fmtMoney(v, currency, digits) {
  if (v == null || !Number.isFinite(v)) return '—';
  const d = digits ?? decimalsFor(v, currency);
  return (currency === 'EGP' ? 'E£' : '$') + nf(d, d).format(v);
}

export function fmtPct(p) {
  if (p == null || !Number.isFinite(p)) return '—';
  const s = p > 0 ? '+' : p < 0 ? '−' : '';
  return s + nf(2, 2).format(Math.abs(p)) + '%';
}

export function fmtTime(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function fmtAgo(ts, now = Date.now()) {
  if (!ts) return 'never';
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 60) return s + 's ago';
  const m = Math.round(s / 60);
  if (m < 60) return m + ' min ago';
  const h = Math.round(m / 60);
  if (h < 48) return h + ' h ago';
  return Math.round(h / 24) + ' d ago';
}
