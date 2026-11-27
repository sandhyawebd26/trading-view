import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Chart } from '@tradecanvas/chart'
import { runPine, toIndicator } from './pineRunner.js'
// Default client Pine script. It runs internally; users only see it through the hover editor.
import defaultScript from './clientEma.pine?raw'

const SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT']
const INTERVALS = ['1m', '3m', '5m', '15m', '1h', '4h', '1d']
const STORE_KEY = 'pine-script-v1'

const loadScript = () => { try { return localStorage.getItem(STORE_KEY) || defaultScript } catch { return defaultScript } }
const saveScript = (s) => { try { s === defaultScript ? localStorage.removeItem(STORE_KEY) : localStorage.setItem(STORE_KEY, s) } catch { /* ignore */ } }

async function fetchBars(symbol, interval, signal) {
  const res = await fetch(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=500`, { signal })
  if (!res.ok) throw new Error(`Binance ${res.status}`)
  const rows = await res.json()
  return rows.map((r) => ({ time: r[0], open: +r[1], high: +r[2], low: +r[3], close: +r[4], volume: +r[5] }))
}

export default function ChartPage({ user, onLogout }) {
  const el = useRef(null)
  const chart = useRef(null)
  const bars = useRef([])
  const indicatorId = useRef(null) // instance id of the Pine indicator currently on the chart
  const seq = useRef(0)            // guards against stale async results
  const [symbol, setSymbol] = useState('BTCUSDT')
  const [interval, setIntervalV] = useState('1h')
  const [script, setScript] = useState(loadScript)
  const [draft, setDraft] = useState(script)
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState('')
  const [scriptError, setScriptError] = useState('')
  const [legend, setLegend] = useState(null) // { title, lines, index }
  const scriptRef = useRef(script)
  scriptRef.current = script

  // Put a Pine script on the current chart, replacing the previous one. Throws on script errors.
  const applyScript = useCallback(async (src) => {
    const c = chart.current
    if (!c || !bars.current.length) return
    const mine = ++seq.current
    const result = await runPine(src, bars.current)
    if (mine !== seq.current || chart.current !== c) return // superseded by a newer apply / chart rebuild
    if (indicatorId.current) { c.removeIndicator(indicatorId.current); indicatorId.current = null }
    const id = `pine_${mine}`
    c.registerIndicator(toIndicator(id, result))
    indicatorId.current = c.addIndicator(id)
    setLegend({ title: result.title, lines: result.lines, colors: result.colors, index: null })
  }, [])

  // A new symbol or timeframe gets a brand-new chart, so it always looks exactly like the first load.
  useEffect(() => {
    const ctl = new AbortController()
    setError('')
    setLegend(null)
    indicatorId.current = null
    bars.current = []
    ++seq.current
    const c = new Chart(el.current, { theme: 'dark' })
    chart.current = c
    c.on('crosshairMove', (e) => {
      const i = e.payload?.barIndex
      if (i != null) setLegend((l) => (l ? { ...l, index: i } : l))
    })
    c.on('crosshairLeave', () => setLegend((l) => (l ? { ...l, index: null } : l)))

    fetchBars(symbol, interval, ctl.signal)
      .then(async (b) => {
        if (chart.current !== c) return
        bars.current = b
        c.setData(b)
        await applyScript(scriptRef.current)
      })
      .catch((e) => { if (e.name !== 'AbortError' && chart.current === c) setError(String(e?.message ?? e)) })

    return () => { ctl.abort(); c.destroy(); if (chart.current === c) chart.current = null }
  }, [symbol, interval, applyScript])

  async function runDraft() {
    setScriptError('')
    try {
      await applyScript(draft)
      setScript(draft)
      saveScript(draft)
    } catch (e) {
      setScriptError(String(e?.message ?? e))
    }
  }

  async function resetDraft() {
    setDraft(defaultScript)
    setScriptError('')
    try { await applyScript(defaultScript); setScript(defaultScript); saveScript(defaultScript) } catch (e) { setScriptError(String(e?.message ?? e)) }
  }

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
                <span key={name} className="legend-val" style={{ color: legend.colors[i] }}>
                  {v == null ? '∅' : v.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                </span>
              )
            })}
            <button className="legend-edit" title="View / edit Pine Script" aria-label="Edit Pine Script"
              onClick={() => { setDraft(script); setScriptError(''); setEditing(true) }}>&lt;/&gt; Script</button>
          </div>
        )}
        {editing && (
          <div className="editor" role="dialog" aria-label="Pine Script editor">
            <div className="editor-head">
              <strong>Pine Script</strong>
              <button className="ghost" onClick={() => setEditing(false)} aria-label="Close editor">✕</button>
            </div>
            <textarea spellCheck={false} value={draft} onChange={(e) => setDraft(e.target.value)} />
            {scriptError && <div className="error" role="alert">{scriptError}</div>}
            <div className="editor-actions">
              <button onClick={runDraft}>Apply to chart</button>
              <button className="ghost" onClick={resetDraft}>Reset to default</button>
            </div>
          </div>
        )}
      </div>
      {error && <div className="error">{error}</div>}
    </div>
  )
}
