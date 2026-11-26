import React, { useEffect, useRef, useState } from 'react'
import { Chart } from '@tradecanvas/chart'
import { runPine, toIndicator } from './pineRunner.js'
// Client Pine script: runs internally and is applied to the chart; users never see the source.
import clientScript from './clientEma.pine?raw'

const LINE_COLORS = ['#4f6df5', '#f5c542', '#3fb950']
const SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT']
const INTERVALS = ['5m', '15m', '1h', '4h', '1d']

async function fetchBars(symbol, interval) {
  const res = await fetch(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=500`)
  if (!res.ok) throw new Error(`Binance ${res.status}`)
  const rows = await res.json()
  return rows.map((r) => ({ time: r[0], open: +r[1], high: +r[2], low: +r[3], close: +r[4], volume: +r[5] }))
}

export default function ChartPage({ user, onLogout }) {
  const el = useRef(null)
  const chart = useRef(null)
  const counter = useRef(0)
  const [symbol, setSymbol] = useState('BTCUSDT')
  const [interval, setIntervalV] = useState('1h')
  const [error, setError] = useState('')
  const [legend, setLegend] = useState(null) // { title, lines: {name: number[]}, index }
  const legendRef = useRef(null)

  useEffect(() => {
    chart.current = new Chart(el.current, { theme: 'dark' })
    chart.current.on('crosshairMove', (e) => {
      if (legendRef.current && e.payload?.barIndex != null) setLegend((l) => (l ? { ...l, index: e.payload.barIndex } : l))
    })
    chart.current.on('crosshairLeave', () => setLegend((l) => (l ? { ...l, index: null } : l)))
    return () => { chart.current?.destroy(); chart.current = null }
  }, [])

  useEffect(() => {
    let cancelled = false
    setError('')
    ;(async () => {
      try {
        const bars = await fetchBars(symbol, interval)
        const c = chart.current
        if (cancelled || !c) return
        c.setData(bars)
        const result = await runPine(clientScript, bars)
        if (cancelled || !chart.current) return
        const id = `pine_${++counter.current}`
        c.registerIndicator(toIndicator(id, result))
        c.addIndicator(id)
        legendRef.current = result
        setLegend({ title: result.title, lines: result.lines, index: null })
      } catch (e) {
        if (!cancelled) setError(String(e?.message ?? e))
      }
    })()
    return () => { cancelled = true }
  }, [symbol, interval])

  return (
    <div className="app">
      <header>
        <strong>Live Chart</strong>
        <span className="sub">{symbol} · {interval}</span>
        <select value={symbol} onChange={(e) => setSymbol(e.target.value)}>
          {SYMBOLS.map((s) => <option key={s}>{s}</option>)}
        </select>
        <select value={interval} onChange={(e) => setIntervalV(e.target.value)}>
          {INTERVALS.map((s) => <option key={s}>{s}</option>)}
        </select>
        <span className="user">{user.name}</span>
        <button className="ghost" onClick={onLogout}>Sign out</button>
      </header>
      <div className="chart-wrap">
        <div className="chart" ref={el} />
        {legend && (
          <div className="legend">
            <span className="legend-name">{legend.title}</span>
            {Object.entries(legend.lines).map(([name, arr], i) => {
              const v = arr[legend.index ?? arr.length - 1]
              return (
                <span key={name} className="legend-val" style={{ color: LINE_COLORS[i % LINE_COLORS.length] }}>
                  {v == null ? '∅' : v.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                </span>
              )
            })}
          </div>
        )}
      </div>
      {error && <div className="error">{error}</div>}
    </div>
  )
}
