import { PineTS } from 'pinets'
import { defineIndicator } from '@tradecanvas/chart'

// Run Pine source over OHLCV bars with PineTS, return { name, overlay, lines }.
export async function runPine(source, bars) {
  const ohlcv = bars.map((b) => ({
    open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume,
    openTime: b.time, closeTime: b.time + 1,
  }))
  const pine = new PineTS(ohlcv)
  const { plots } = await pine.run(source)
  const byTime = new Map(bars.map((b, i) => [b.time, i]))
  const lines = {}
  for (const [name, plot] of Object.entries(plots)) {
    if (name.startsWith('__')) continue // PineTS internals (labels, lines, boxes…)
    const arr = new Array(bars.length).fill(null)
    for (const p of plot.data ?? []) {
      const i = byTime.get(p.time)
      if (i !== undefined && typeof p.value === 'number' && Number.isFinite(p.value)) arr[i] = p.value
    }
    if (arr.some((v) => v !== null)) lines[name] = arr // hidden plots (display.none / na) stay off the chart
  }
  const overlay = /overlay\s*=\s*true/.test(source)
  const short = /shorttitle\s*=\s*["']([^"']+)["']/.exec(source)?.[1]
  const full = /indicator\(\s*(?:title\s*=\s*)?["']([^"']+)["']/.exec(source)?.[1] ?? 'Pine script'
  // TradingView-style legend label, e.g. "EMA 9 close", from the script's first length input
  const len = /input\.int\(\s*(\d+)/.exec(source)?.[1]
  const title = short ? `${short}${len ? ' ' + len : ''} close` : full
  return { title, overlay, lines }
}

// Wrap precomputed Pine output as a TradeCanvas indicator plugin.
export function toIndicator(id, result) {
  const keys = Object.keys(result.lines)
  const safe = (k) => k.replace(/[^a-zA-Z0-9_]/g, '_')
  return defineIndicator({
    id,
    name: result.title,
    shortName: result.title,
    placement: result.overlay ? 'overlay' : 'panel',
    plots: keys.map((k, i) => ({ key: safe(k), title: k, color: i })),
    calculate: () => Object.fromEntries(keys.map((k) => [safe(k), result.lines[k]])),
  })
}
