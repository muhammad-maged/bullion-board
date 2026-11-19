import { useEffect, useMemo, useState } from 'react';
import { usePrices } from './hooks/usePrices.js';
import { SOURCES } from './lib/api.js';
import { KARATS, METALS_INTERVAL } from './lib/constants.js';
import { convert, fxCards, goldChart, karatPrices, metalRows } from './lib/derive.js';
import { fmtAgo, fmtMoney, fmtNum, fmtTime } from './lib/format.js';
import { AreaChart, Sparkline } from './components/Charts.jsx';
import { Change, changeColor, CountdownRing, Logo, RefreshIcon, Segmented } from './components/ui.jsx';

const SETTINGS_KEY = 'bullion-board.settings.v1';
const DEFAULTS = { currency: 'EGP', unit: 'g', karat: '21', range: '1D', premium: 0 };

function useSettings() {
  const [s, setS] = useState(() => {
    try {
      return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') };
    } catch {
      return DEFAULTS;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
    } catch {
      /* ignore */
    }
  }, [s]);
  return [s, (patch) => setS((p) => ({ ...p, ...patch }))];
}

const Skel = ({ w = '6ch' }) => <span className="skeleton" style={{ minWidth: w }}>…</span>;

export default function App() {
  const p = usePrices();
  const [s, set] = useSettings();
  const { currency, unit } = s;
  const hasData = Object.keys(p.metals).length > 0;
  const anyLive = Object.values(p.metals).some((m) => m.live);
  const state = !hasData ? 'off' : anyLive && !p.fromCache ? 'live' : 'delayed';

  const rows = useMemo(() => metalRows({ ...p, unit, currency, now: p.now }), [p.metals, p.fx, p.daily, unit, currency]); // eslint-disable-line
  const k = useMemo(() => karatPrices({ ...p, currency, premium: s.premium }), [p.metals, p.fx, p.daily, currency, s.premium]); // eslint-disable-line
  const fx = useMemo(() => fxCards(p), [p.fx, p.daily]); // eslint-disable-line
  const sel = k.karats.find((x) => x.id === s.karat) ?? k.karats[2];
  const chart = useMemo(
    () => goldChart({ ...p, range: s.range, currency, purity: sel.purity, premium: s.premium }),
    [p.goldHistory, p.goldIntraday, p.daily, p.metals, p.fx, s.range, currency, sel.purity, s.premium] // eslint-disable-line
  );

  const money = (v, c = currency) => fmtMoney(v, c);
  const gold = rows.find((r) => r.code === 'XAU');
  const silver = rows.find((r) => r.code === 'XAG');
  const ratio = gold?.usdOz && silver?.usdOz ? gold.usdOz / silver.usdOz : null;
  const unitLabel = unit === 'g' ? 'gram' : unit === 'kg' ? 'kg' : 'oz';
  // when the main column already is EGP/g, show USD/g in the extra column instead
  const altEgpGram = currency === 'EGP' && unit === 'g';
  const refreshDisabled = p.busy || p.cooldownLeft > 0;

  return (
    <main className="page">
      {/* ---------- header ---------- */}
      <header className="header">
        <div className="brand">
          <Logo />
          <div>
            <h1>Bullion Board</h1>
            <div className="muted" style={{ fontSize: 13 }}>Egypt gold, world metals &amp; EGP exchange rates</div>
          </div>
        </div>
        <div className="controls">
          <div className="pill" aria-live="polite">
            <span className={`dot ${state}`} />
            {state === 'live' ? 'Live' : state === 'delayed' ? 'Delayed' : 'Offline'} · {p.lastUpdated ? fmtTime(p.lastUpdated) : 'loading…'}
          </div>
          <div className="pill" style={{ paddingLeft: 8 }}>
            <CountdownRing seconds={p.nextIn} total={METALS_INTERVAL / 1000} />
            Next in <span className="num" style={{ color: 'var(--text)' }}>{p.nextIn == null ? '—' : `0:${String(p.nextIn).padStart(2, '0')}`}</span>
          </div>
          <Segmented label="Display currency" value={currency} onChange={(v) => set({ currency: v })} options={[{ value: 'EGP', label: 'EGP' }, { value: 'USD', label: 'USD' }]} />
          <Segmented label="Weight unit" value={unit} onChange={(v) => set({ unit: v })} options={[{ value: 'g', label: 'g' }, { value: 'oz', label: 'oz' }, { value: 'kg', label: 'kg' }]} />
          <button type="button" className="refresh" onClick={p.forceRefresh} disabled={refreshDisabled}>
            <RefreshIcon spinning={p.busy} />
            {p.busy ? 'Updating…' : p.cooldownLeft > 0 ? `Wait ${p.cooldownLeft}s` : 'Refresh now'}
          </button>
        </div>
      </header>

      {state === 'off' && !p.busy && (
        <div className="banner" role="alert">
          Couldn’t reach any price source. Check your connection, then tap Refresh now.
        </div>
      )}

      {/* ---------- Egypt gold hero ---------- */}
      <section className="row" aria-label="Egypt gold prices">
        <div className="card hero wide">
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="dot" style={{ background: 'var(--gold)', width: 10, height: 10 }} />
                <span style={{ fontWeight: 600, fontSize: 15 }}>Gold {sel.label}</span>
                <span className="lbl">per gram · Egypt</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                <span className="num big">{hasData && p.fx ? money(sel.price) : <Skel w="7ch" />}</span>
                <span className="muted" style={{ fontSize: 15 }}>/ g</span>
              </div>
              <Change value={k.change} suffix="vs yesterday" />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
              <Segmented square className="karat-pick" label="Karat" value={s.karat} onChange={(v) => set({ karat: v })} options={KARATS.filter((x) => x.id !== '14').map((x) => ({ value: x.id, label: x.label }))} />
              <Segmented square label="Chart range" value={s.range} onChange={(v) => set({ range: v })} options={['1D', '1W', '1M', '1Y'].map((r) => ({ value: r, label: r }))} />
            </div>
          </div>
          <AreaChart
            points={chart}
            label={`Gold ${sel.label} per gram, ${s.range}`}
            format={(v) => money(v)}
            timeFormat={(t) =>
              s.range === '1D'
                ? new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
                : new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: s.range === '1Y' ? '2-digit' : undefined })
            }
          />
          <div className="tiles">
            <div className="tile"><span className="lbl">24K / gram</span><span className="num" style={{ fontSize: 20, fontWeight: 600 }}>{money(k.karats[0].price)}</span></div>
            <div className="tile"><span className="lbl">Gold pound · 8 g 21K</span><span className="num" style={{ fontSize: 20, fontWeight: 600 }}>{money(k.pound)}</span></div>
            <div className="tile"><span className="lbl">World spot · USD/oz</span><span className="num" style={{ fontSize: 20, fontWeight: 600 }}>{fmtMoney(gold?.usdOz, 'USD', 2)}</span></div>
            <div className="tile"><span className="lbl">USD → EGP used</span><span className="num" style={{ fontSize: 20, fontWeight: 600 }}>{fmtNum(p.fx?.usdEgp, 2)}</span></div>
          </div>
        </div>

        <div className="card narrow" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="card-head" style={{ marginBottom: 0 }}>
            <h2>Egypt gold by karat</h2>
            <span className="faint" style={{ fontSize: 13 }}>{currency} per gram</span>
          </div>
          <div className="karat-grid">
            {k.karats.map((x) => (
              <button key={x.id} type="button" className="karat" aria-pressed={s.karat === x.id} onClick={() => x.id !== '14' && set({ karat: x.id })}>
                <span className="k">{x.label}</span>
                <span className="num p">{hasData && p.fx ? money(x.price) : <Skel />}</span>
                <span className="faint" style={{ fontSize: 12 }}>{x.note}</span>
              </button>
            ))}
            <div className="karat" style={{ cursor: 'default' }}>
              <span className="k">Gold pound</span>
              <span className="num p">{hasData && p.fx ? money(k.pound) : <Skel />}</span>
              <span className="faint" style={{ fontSize: 12 }}>8 g of 21K</span>
            </div>
          </div>
          <label className="premium">
            Local market premium
            <input type="number" inputMode="decimal" step="0.5" min="-20" max="50" value={s.premium} onChange={(e) => set({ premium: e.target.value === '' ? 0 : Number(e.target.value) })} />
            %
          </label>
          <p className="footnote" style={{ margin: 0 }}>
            Spot-derived prices before workmanship (مصنعية). Use the premium if Egyptian shops are pricing above the world rate.
          </p>
        </div>
      </section>

      {/* ---------- FX ---------- */}
      <section className="fx-grid" aria-label="Exchange rates">
        {(fx.length ? fx : [{ id: 'a' }, { id: 'b' }, { id: 'c' }]).map((f) => (
          <div key={f.id} className="card fx-card">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="chip">{f.pair ?? '— → —'}</span>
                <span className="muted" style={{ fontSize: 13 }}>{f.name}</span>
              </div>
              <div className="num rate">{f.value != null ? fmtNum(f.value, f.digits) : <Skel />}</div>
              <Change value={f.change} suffix="· 1d" />
            </div>
            <Sparkline data={f.spark} color={changeColor(f.change)} />
          </div>
        ))}
      </section>

      {/* ---------- all metals ---------- */}
      <section className="card" aria-label="All precious metals">
        <div className="card-head">
          <h2>All precious metals</h2>
          <span className="faint" style={{ fontSize: 13 }}>Prices in {currency} per {unitLabel} · world spot</span>
        </div>
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th className="lbl">Metal</th>
                <th className="lbl">{currency} / {unit}</th>
                <th className="lbl hide-sm">USD / oz</th>
                <th className="lbl hide-sm">{altEgpGram ? 'USD / g' : 'EGP / g'}</th>
                <th className="lbl">1d</th>
                <th className="lbl hide-sm">7 days</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.code}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span className="msym num" style={{ color: m.tint }}>{m.sym}</span>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontWeight: 600 }}>{m.name} <span className="faint" style={{ fontWeight: 400 }}>{m.nameAr}</span></span>
                        <span style={{ fontSize: 12 }} className="faint">
                          {m.code} {m.source && <span className="src">{m.live ? 'live' : 'daily'}</span>}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className="num" style={{ fontSize: 16, fontWeight: 600 }}>{m.value != null ? money(m.value) : <Skel />}</td>
                  <td className="num hide-sm" style={{ color: 'var(--text-2)' }}>{fmtMoney(m.usdOz, 'USD', 2)}</td>
                  <td className="num hide-sm" style={{ color: 'var(--text-2)' }}>{altEgpGram ? fmtMoney(m.usdGram, 'USD') : fmtMoney(m.egpGram, 'EGP')}</td>
                  <td><Change value={m.change} badge /></td>
                  <td className="hide-sm"><Sparkline data={m.spark} color={changeColor(m.change)} width={96} height={32} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ---------- ratio + data status ---------- */}
      <section className="row">
        <div className="card wide">
          <div className="card-head"><h2>Data &amp; refresh</h2><span className="faint" style={{ fontSize: 13 }}>Paused while this tab is hidden</span></div>
          {[
            ['goldApi', 'Live metals', 'every 60 s'],
            ['xaus', 'Live gold & silver, charts', 'every 60 s'],
            ['erApi', 'USD & EUR → EGP', 'every 5 min'],
            ['fawaz', 'Daily backup + 7-day trend', 'every 5 min'],
          ].map(([key, what, every]) => {
            const st = p.status[key];
            return (
              <div key={key} className="status-row">
                <span>
                  <span className={`dot ${st.ok == null ? '' : st.ok ? 'live' : 'off'}`} style={{ display: 'inline-block', marginRight: 8, background: st.ok == null ? '#8A92A0' : undefined, animation: 'none' }} />
                  <a href={SOURCES[key].url} target="_blank" rel="noreferrer">{SOURCES[key].name}</a>
                  <span className="muted"> · {what}</span>
                </span>
                <span className="muted">
                  {st.ok == null ? 'waiting…' : st.ok ? `OK · ${fmtAgo(st.at, p.now)}` : 'unavailable'} · {every}
                </span>
              </div>
            );
          })}
          <p className="footnote">
            Free, keyless sources. When a live source is down, the dashboard falls back to the daily rate and labels it “daily”. Refresh now skips caches (10 s cooldown).
            Charts convert the USD gold history with today’s USD → EGP rate. Indicative prices only, not dealer quotes.
          </p>
        </div>
        <div className="card narrow" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <span className="lbl">Gold / silver ratio</span>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            <span className="num" style={{ fontSize: 34, fontWeight: 600 }}>{ratio ? fmtNum(ratio, 1) : '—'}</span>
            <span className="muted" style={{ fontSize: 13 }}>oz of silver per oz of gold</span>
          </div>
          <div className="ratio-bar"><div style={{ width: `${ratio ? Math.min(100, (ratio / 125) * 100) : 0}%` }} /></div>
          <div className="tiles" style={{ marginTop: 4 }}>
            <div className="tile"><span className="lbl">Silver / g</span><span className="num" style={{ fontSize: 18, fontWeight: 600 }}>{money(convert(silver?.usdOz, { unit: 'g', currency, usdEgp: p.fx?.usdEgp }))}</span></div>
            <div className="tile"><span className="lbl">Silver 925 / g</span><span className="num" style={{ fontSize: 18, fontWeight: 600 }}>{money((convert(silver?.usdOz, { unit: 'g', currency, usdEgp: p.fx?.usdEgp }) ?? NaN) * 0.925)}</span></div>
          </div>
        </div>
      </section>
    </main>
  );
}
