import { PineTS } from 'pinets'
import { defineIndicator } from '@tradecanvas/chart'
import { extractDrawings } from './pineDrawings.js'

const DEFAULT_COLORS = ['#4f6df5', '#f5c542', '#3fb950', '#e5534b', '#a371f7']

// Pine gives colours as #RRGGBB or #RRGGBBAA. Split into the solid colour and its opacity (0–1).
function splitColor(c) {
  if (typeof c !== 'string' || !/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(c)) return null
  return { hex: c.slice(0, 7), alpha: c.length === 9 ? parseInt(c.slice(7), 16) / 255 : 1 }
}

// A plot's colour: its options, else the last point that carries one (Pine allows per-bar colours).
function plotColor(plot) {
  const fromOpts = splitColor(plot.options?.color)
  if (fromOpts) return fromOpts
  const pts = plot.data ?? []
  for (let i = pts.length - 1; i >= 0; i--) {
    const c = splitColor(pts[i]?.options?.color)
    if (c) return c
  }
  return null
}

const safeKey = (k) => k.replace(/[^a-zA-Z0-9_]/g, '_')

// PineTS has no syminfo.mintick when fed a bare bar array, so math.round_to_mintick(x) returns NaN.
// Rewrite it to math.round(x, decimals) (balanced-paren scan, so nested calls are fine).
export function fixMintick(src, decimals = 2) {
  const needle = 'math.round_to_mintick('
  let out = '', i = 0
  for (;;) {
    const at = src.indexOf(needle, i)
    if (at < 0) return out + src.slice(i)
    let depth = 1, j = at + needle.length
    while (j < src.length && depth) { const c = src[j++]; if (c === '(') depth++; else if (c === ')') depth-- }
    out += src.slice(i, at) + 'math.round(' + fixMintick(src.slice(at + needle.length, j - 1), decimals) + ', ' + decimals + ')'
    i = j
  }
}

// Run Pine source over OHLCV bars with PineTS. Returns { title, overlay, lines, colors, fills }.
export async function runPine(source, bars) {
  const ohlcv = bars.map((b) => ({
    open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume,
    openTime: b.time, closeTime: b.time + 1,
  }))
  const { plots } = await new PineTS(ohlcv).run(fixMintick(source))
  const byTime = new Map(bars.map((b, i) => [b.time, i]))

  const lines = {}
  const colors = []
  const fillPlots = []
  for (const [name, plot] of Object.entries(plots)) {
    if (name.startsWith('__')) continue // PineTS internals (labels, lines, boxes…)
    if (plot.options?.style === 'fill' || plot.plot1) { fillPlots.push(plot); continue }
    const arr = new Array(bars.length).fill(null)
    for (const p of plot.data ?? []) {
      const i = byTime.get(p.time)
      if (i !== undefined && typeof p.value === 'number' && Number.isFinite(p.value)) arr[i] = p.value
    }
    if (!arr.some((v) => v !== null)) continue // hidden plots (display.none / na) stay off the chart
    lines[name] = arr
    colors.push(plotColor(plot)?.hex ?? DEFAULT_COLORS[colors.length % DEFAULT_COLORS.length])
  }

  // fill(plotA, plotB, color): shaded area between two visible plots.
  const fills = []
  for (const f of fillPlots) {
    const c = plotColor(f)
    if (!c || c.alpha === 0) continue // na colour => no fill
    if (!(f.plot1 in lines) || !(f.plot2 in lines)) continue // one of the plots is hidden
    fills.push({ between: [f.plot1, f.plot2], hex: c.hex, opacity: c.alpha })
  }

  const overlay = /overlay\s*=\s*true/.test(source)
  const short = /shorttitle\s*=\s*["']([^"']+)["']/.exec(source)?.[1]
  const full = /indicator\(\s*(?:title\s*=\s*)?["']([^"']+)["']/.exec(source)?.[1] ?? 'Pine script'
  // TradingView-style legend label, e.g. "EMA 9 close", from the script's first length input
  const len = /input\.int\(\s*(\d+)/.exec(source)?.[1]
  const title = short ? `${short}${len ? ' ' + len : ''} close` : full
  return { title, overlay, lines, colors, fills, drawings: extractDrawings(plots) }
}

// Wrap precomputed Pine output as a TradeCanvas indicator plugin, using the script's own colours.
export function toIndicator(id, result) {
  const keys = Object.keys(result.lines)
  const styleColors = [...result.colors]
  const fills = result.fills.map((f) => {
    styleColors.push(f.hex)
    return {
      between: [safeKey(f.between[0]), safeKey(f.between[1])],
      color: styleColors.length - 1,
      opacity: Math.min(1, Math.max(0.03, f.opacity)),
    }
  })
  const plugin = defineIndicator({
    id,
    name: result.title,
    shortName: result.title,
    placement: result.overlay ? 'overlay' : 'panel',
    plots: keys.map((k, i) => ({ key: safeKey(k), title: k, color: i })),
    fills,
    calculate: () => Object.fromEntries(keys.map((k) => [safeKey(k), result.lines[k]])),
  })
  plugin.descriptor.defaultStyle = { colors: styleColors }
  return plugin
}
