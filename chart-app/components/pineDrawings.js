import { barIndexToX, priceToY } from '@tradecanvas/chart'

// PineTS returns box.new / line.new / label.new results under plots named __boxes__, __lines__, __labels__.
// Each holds a list of snapshots; the last snapshot is the final state of every drawing the script made.
function lastValue(plot) {
  const pts = plot?.data ?? []
  for (let i = pts.length - 1; i >= 0; i--) if (Array.isArray(pts[i]?.value)) return pts[i].value
  return []
}

export function extractDrawings(plots) {
  const live = (d) => d && !d._deleted
  return {
    boxes: lastValue(plots.__boxes__).filter(live),
    lines: lastValue(plots.__lines__).filter(live),
    labels: lastValue(plots.__labels__).filter(live),
  }
}

// PineTS reports extend as 'r' / 'l' / 'b' (or 'n'); accept the long names too.
const extendsRight = (e) => e === 'r' || e === 'right' || e === 'b' || e === 'both'
const extendsLeft = (e) => e === 'l' || e === 'left' || e === 'b' || e === 'both'

export const hasDrawings = (d) => d.boxes.length + d.lines.length + d.labels.length > 0

// Pine colours come as #RRGGBB, #RRGGBBAA or "" (not set). Canvas understands the 8-digit form.
const col = (c, fallback) => (typeof c === 'string' && /^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(c) ? c : fallback)

const DASH = { style_dashed: [6, 4], style_dotted: [2, 3] }

// Overlay plugin that paints Pine drawings in chart coordinates (bar index + price).
export function createDrawingOverlay(id, drawings) {
  // xloc "bi" = bar index. xloc "bt" would be a timestamp; map it to an index through the bar times.
  return {
    kind: 'overlay',
    plugin: {
      descriptor: { id, name: 'Pine drawings', layer: 'overlay' },
      enabled: true,
      render(ctx, { viewport, data }) {
        const times = data.map ? data.map((b) => b.time) : []
        const xi = (v, xloc) => {
          if (xloc === 'bt') {
            let lo = 0, hi = times.length - 1
            while (lo < hi) { const m = (lo + hi) >> 1; if (times[m] < v) lo = m + 1; else hi = m }
            return barIndexToX(lo, viewport)
          }
          return barIndexToX(v, viewport)
        }
        const toY = (p) => priceToY(p, viewport)
        ctx.save()
        const area = viewport.chartRect
        if (area) { ctx.beginPath(); ctx.rect(area.x, area.y, area.width, area.height); ctx.clip() }
        const right = area ? area.x + area.width : ctx.canvas.width

        for (const b of drawings.boxes) {
          const x1 = xi(b.left, b.xloc), x2 = extendsRight(b.extend) ? right : xi(b.right, b.xloc)
          const y1 = toY(b.top), y2 = toY(b.bottom)
          ctx.fillStyle = col(b.bgcolor, 'rgba(41,98,255,0.15)')
          ctx.fillRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1))
          if (b.border_width > 0) {
            ctx.strokeStyle = col(b.border_color, '#2962ff'); ctx.lineWidth = b.border_width
            ctx.setLineDash(DASH[b.border_style] ?? [])
            ctx.strokeRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1))
          }
          if (b.text) {
            ctx.fillStyle = col(b.text_color, '#d7dde5'); ctx.font = '11px system-ui'
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
            ctx.fillText(b.text, (x1 + x2) / 2, (y1 + y2) / 2)
          }
        }

        for (const l of drawings.lines) {
          let x1 = xi(l.x1, l.xloc), x2 = xi(l.x2, l.xloc)
          let y1 = toY(l.y1), y2 = toY(l.y2)
          if (extendsRight(l.extend)) {
            const dx = x2 - x1
            if (dx !== 0) { const k = (right - x2) / dx; y2 += (y2 - y1) * k; x2 = right } else x2 = right
          }
          if (extendsLeft(l.extend)) {
            const dx = x2 - x1
            const left = area ? area.x : 0
            if (dx !== 0) { const k = (x1 - left) / dx; y1 -= (y2 - y1) * k; x1 = left }
          }
          ctx.strokeStyle = col(l.color, '#2962ff'); ctx.lineWidth = l.width || 1
          ctx.setLineDash(DASH[l.style] ?? [])
          ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke()
        }
        ctx.setLineDash([])

        for (const lb of drawings.labels) {
          const x = xi(lb.x, lb.xloc), y = toY(lb.y)
          const text = String(lb.text ?? '')
          ctx.font = '11px system-ui'
          const w = ctx.measureText(text).width + 12, h = 20
          const up = lb.style === 'style_label_up'
          const top = up ? y + 6 : y - 6 - h
          ctx.fillStyle = col(lb.color, '#2962ff')
          ctx.beginPath(); ctx.roundRect(x - w / 2, top, w, h, 4); ctx.fill()
          ctx.beginPath()
          if (up) { ctx.moveTo(x - 5, top); ctx.lineTo(x, y); ctx.lineTo(x + 5, top) } else { ctx.moveTo(x - 5, top + h); ctx.lineTo(x, y); ctx.lineTo(x + 5, top + h) }
          ctx.fill()
          ctx.fillStyle = col(lb.textcolor, '#ffffff'); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
          ctx.fillText(text, x, top + h / 2)
        }
        ctx.restore()
      },
    },
  }
}
