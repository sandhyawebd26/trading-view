// Decorative chart scene for the sign-in screen: candles, a volume profile and a POC line.
// Built from a seeded random walk so the picture is the same on every load.

function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const W = 880, H = 640
const N = 46                       // candles
const X0 = 36, X1 = 700            // candle area
const TOP = 70, BOT = 560          // price area on screen
const rnd = mulberry32(2611)

// Random walk with a drift change halfway, so the scene reads as a move and a pullback.
const bars = []
let price = 100
for (let i = 0; i < N; i++) {
  const drift = i < 24 ? 0.55 : -0.35
  const o = price
  const c = o + drift + (rnd() - 0.5) * 5.2
  const h = Math.max(o, c) + rnd() * 2.8
  const l = Math.min(o, c) - rnd() * 2.8
  bars.push({ o, h, l, c, v: 0.4 + rnd() })
  price = c
}
const lo = Math.min(...bars.map((b) => b.l)), hi = Math.max(...bars.map((b) => b.h))
const y = (p) => TOP + (1 - (p - lo) / (hi - lo)) * (BOT - TOP)
const step = (X1 - X0) / N
const f = (n) => Math.round(n * 10) / 10

// Volume profile: 26 price rows, heavier near the middle of the range, split into up and down volume.
const ROWS = 26
const mid = (lo + hi) / 2
const profile = Array.from({ length: ROWS }, (_, r) => {
  const p = lo + ((r + 0.5) / ROWS) * (hi - lo)
  const w = Math.exp(-(((p - mid) / ((hi - lo) * 0.28)) ** 2)) * (0.65 + rnd() * 0.5)
  return { p, w, up: 0.35 + rnd() * 0.3 }
})
const maxW = Math.max(...profile.map((r) => r.w))
const poc = profile.reduce((a, b) => (b.w > a.w ? b : a))
const rowH = (BOT - TOP) / ROWS

// Price labels on the right axis, in a BTC-like range so the scene looks like a real market.
const axis = Array.from({ length: 6 }, (_, i) => {
  const p = lo + (i / 5) * (hi - lo)
  return { y: y(p), label: (60000 + ((p - 90) / 40) * 2400).toLocaleString('en-US', { maximumFractionDigits: 0 }) }
})
const last = bars[N - 1]

export default function AuthArt() {
  return (
    <svg className="authx-art" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMaxYMid slice" role="img"
      aria-label="Candlestick chart with a volume profile">
      {axis.map((a) => (
        <g key={a.label}>
          <line x1="0" x2={W} y1={f(a.y)} y2={f(a.y)} className="art-grid" />
          <text x={W - 14} y={f(a.y) - 5} className="art-axis" textAnchor="end">{a.label}</text>
        </g>
      ))}

      {profile.map((r, i) => {
        const len = (r.w / maxW) * 210
        const yy = f(y(r.p) - rowH / 2)
        const isPoc = r === poc
        return (
          <g key={i} className="art-vp" style={{ animationDelay: `${900 + i * 22}ms` }}>
            <rect x={f(W - 70 - len)} y={yy} width={f(len * r.up)} height={f(rowH - 2)} className={isPoc ? 'art-vp-up poc' : 'art-vp-up'} />
            <rect x={f(W - 70 - len * (1 - r.up))} y={yy} width={f(len * (1 - r.up))} height={f(rowH - 2)} className={isPoc ? 'art-vp-dn poc' : 'art-vp-dn'} />
          </g>
        )
      })}

      <line x1="0" x2={W - 70} y1={f(y(poc.p))} y2={f(y(poc.p))} className="art-poc" />
      <g transform={`translate(${W - 128} ${f(y(poc.p)) - 12})`} className="art-poc-tag">
        <rect width="56" height="22" rx="3" />
        <text x="28" y="15" textAnchor="middle">POC</text>
      </g>

      {bars.map((b, i) => {
        const x = f(X0 + i * step + step / 2)
        const up = b.c >= b.o
        const bw = f(step * 0.62)
        const body = Math.max(2, Math.abs(y(b.c) - y(b.o)))
        const isLast = i === N - 1
        return (
          <g key={i} className={`art-candle ${up ? 'up' : 'dn'}${isLast ? ' live' : ''}`} style={{ animationDelay: `${i * 16}ms` }}>
            <line x1={x} x2={x} y1={f(y(b.h))} y2={f(y(b.l))} />
            <rect x={f(x - bw / 2)} y={f(Math.min(y(b.o), y(b.c)))} width={bw} height={f(body)} />
            {isLast && (
              <g className="art-price" transform={`translate(${W - 86} ${f(y(last.c)) - 11})`}>
                <rect width="86" height="22" />
                <text x="43" y="15" textAnchor="middle">{(60000 + ((last.c - 90) / 40) * 2400).toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 2 })}</text>
                <line x1={-(W - 86 - x)} x2="0" y1="11" y2="11" />
              </g>
            )}
          </g>
        )
      })}
    </svg>
  )
}
