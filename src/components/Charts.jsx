import { useMemo, useRef, useState } from 'react';

function scale(values, w, h, pad) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  return values.map((v, i) => [
    values.length === 1 ? w : (i / (values.length - 1)) * w,
    pad + (1 - (v - min) / span) * (h - pad * 2),
  ]);
}
const toPath = (pts) => pts.map(([x, y], i) => (i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1)).join(' ');

export function Sparkline({ data, color, width = 120, height = 44, strokeWidth = 2 }) {
  if (!data || data.length < 2) return <svg width={width} height={height} aria-hidden="true" />;
  const d = toPath(scale(data, width, height, 5));
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" style={{ flex: 'none' }}>
      <path d={d} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Area chart with a hover / touch tooltip. points: [{t, v}] */
export function AreaChart({ points, format, color = '#E8B54A', label, timeFormat }) {
  const W = 640;
  const H = 190;
  const ref = useRef(null);
  const [hover, setHover] = useState(null);
  const geo = useMemo(() => {
    if (!points || points.length < 2) return null;
    const vals = points.map((p) => p.v);
    const xy = scale(vals, W, H, 14);
    const line = toPath(xy);
    return { xy, line, area: line + ` L${W} ${H} L0 ${H} Z`, min: Math.min(...vals), max: Math.max(...vals) };
  }, [points]);

  if (!geo) return <div className="chart-empty">Chart data unavailable right now</div>;

  const onMove = (e) => {
    const r = ref.current.getBoundingClientRect();
    const x = Math.min(Math.max(0, e.clientX - r.left), r.width);
    const i = Math.round((x / r.width) * (points.length - 1));
    setHover({ i, px: (i / (points.length - 1)) * r.width });
  };
  const hp = hover ? points[hover.i] : null;
  const hy = hover ? geo.xy[hover.i][1] : 0;
  const trendUp = points[points.length - 1].v >= points[0].v;

  return (
    <div
      className="chart"
      ref={ref}
      onPointerMove={onMove}
      onPointerDown={onMove}
      onPointerLeave={() => setHover(null)}
      role="img"
      aria-label={`${label}: from ${format(points[0].v)} to ${format(points[points.length - 1].v)}, ${trendUp ? 'up' : 'down'}`}
    >
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={color} stopOpacity="0.28" />
            <stop offset="1" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1="0" x2={W} y1={H * f} y2={H * f} stroke="#23272F" strokeDasharray="3 5" vectorEffect="non-scaling-stroke" />
        ))}
        <path d={geo.area} fill="url(#areaFill)" />
        <path d={geo.line} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        {hover && (
          <line x1={geo.xy[hover.i][0]} x2={geo.xy[hover.i][0]} y1="0" y2={H} stroke="#8A92A0" strokeDasharray="2 4" vectorEffect="non-scaling-stroke" />
        )}
      </svg>
      {hover && (
        <>
          <span
            style={{ position: 'absolute', left: hover.px, top: `${(hy / H) * 100}%`, width: 10, height: 10, marginLeft: -5, marginTop: -5, borderRadius: '50%', background: color, border: '2px solid #0B0D10', pointerEvents: 'none' }}
          />
          <div className="tip" style={{ left: Math.min(Math.max(hover.px, 70), (ref.current?.clientWidth ?? 0) - 70) }}>
            <div className="num" style={{ fontWeight: 600 }}>{format(hp.v)}</div>
            <div className="faint">{timeFormat(hp.t)}</div>
          </div>
        </>
      )}
      <div className="faint num" style={{ position: 'absolute', right: 4, top: 2, fontSize: 11 }}>{format(geo.max)}</div>
      <div className="faint num" style={{ position: 'absolute', right: 4, bottom: 2, fontSize: 11 }}>{format(geo.min)}</div>
    </div>
  );
}
