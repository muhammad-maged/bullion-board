import { fmtPct } from '../lib/format.js';

export function Segmented({ label, options, value, onChange, square = false, className = '' }) {
  return (
    <div role="group" aria-label={label} className={`seg ${square ? 'square' : ''} ${className}`}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

const FLAT = 0.005; // below this a change rounds to 0.00%
export function Change({ value: raw, badge = false, suffix }) {
  const value = raw != null && Math.abs(raw) < FLAT ? 0 : raw;
  const cls = value == null ? 'flat' : value > 0 ? 'up' : value < 0 ? 'down' : 'flat';
  const arrow = value == null ? '' : value > 0 ? '▲ ' : value < 0 ? '▼ ' : '';
  return (
    <span className={`${badge ? 'badge ' : ''}${cls}`} style={{ fontWeight: 600, fontSize: 13 }}>
      {arrow}
      {fmtPct(value)}
      {suffix && <span className="faint" style={{ fontWeight: 400 }}> {suffix}</span>}
    </span>
  );
}

export const changeColor = (v) => (v == null || Math.abs(v) < FLAT ? '#8A92A0' : v > 0 ? '#3DD6A3' : '#FF8A4C');

export function RefreshIcon({ spinning }) {
  return (
    <svg className={spinning ? 'spin' : ''} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12a9 9 0 1 1-2.64-6.36" />
      <path d="M21 3v6h-6" />
    </svg>
  );
}

export function Logo() {
  return (
    <div className="logo">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#E8B54A" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
        <path d="M3 18h8l-1.5-5h-5z" />
        <path d="M13 18h8l-1.5-5h-5z" />
        <path d="M8 11h8l-1.5-5h-5z" />
      </svg>
    </div>
  );
}

export function CountdownRing({ seconds, total }) {
  const r = 15;
  const c = 2 * Math.PI * r;
  const frac = seconds == null ? 0 : Math.min(1, seconds / total);
  return (
    <svg width="26" height="26" viewBox="0 0 36 36" aria-hidden="true">
      <circle cx="18" cy="18" r={r} fill="none" stroke="#23272F" strokeWidth="4" />
      <circle cx="18" cy="18" r={r} fill="none" stroke="#E8B54A" strokeWidth="4" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - frac)} transform="rotate(-90 18 18)" style={{ transition: 'stroke-dashoffset 1s linear' }} />
    </svg>
  );
}
