'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { BinanceAdapter, pluginKey } from '@tradecanvas/chart'
import { ChartWidget } from '@tradecanvas/chart/widget'
import { runPine, toIndicator } from './pineRunner.js'
import { createDrawingOverlay, hasDrawings } from './pineDrawings.js'
import PineEditor from './PineEditor.jsx'
import volumeProfile from '@/lib/scripts/volumeProfile.js'
// Default client Pine script. It runs internally; users only see it through the hover editor.
import defaultScript from '@/lib/scripts/ema.js'

const SAMPLES = { 'EMA (default)': defaultScript, 'Volume Profile / Fixed Range': volumeProfile }
const SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT']
const TIMEFRAMES = ['1m', '5m', '15m', '1h', '4h', '1d']
const STORE_KEY = 'pine-script-v1'
const LOOKS = ['graphite', 'modern', 'print', 'studio', 'terminal', 'capsule', 'desk']
const loadTheme = () => { try { return localStorage.getItem('chart-theme') === 'light' ? 'light' : 'dark' } catch { return 'dark' } }
const loadLook = () => { try { const v = localStorage.getItem('chart-look'); return LOOKS.includes(v) ? v : 'graphite' } catch { return 'graphite' } }

const loadScript = () => { try { return localStorage.getItem(STORE_KEY) || defaultScript } catch { return defaultScript } }
const saveScript = (s) => { try { s === defaultScript ? localStorage.removeItem(STORE_KEY) : localStorage.setItem(STORE_KEY, s) } catch { /* ignore */ } }

export default function ChartPage({ user, onLogout }) {
  const el = useRef(null)
  const chart = useRef(null)
  const widgetRef = useRef(null)
  const [look, setLook] = useState(loadLook)
  const [theme, setThemeState] = useState(loadTheme)
  const applyTheme = useCallback((t) => {
    document.documentElement.dataset.theme = t
    setThemeState(t)
    try { localStorage.setItem('chart-theme', t) } catch { /* ignore */ }
  }, [])
  const indicatorId = useRef(null) // instance id of the Pine indicator currently on the chart
  const overlayKey = useRef(null)  // plugin key of the Pine drawings overlay currently on the chart
  const seq = useRef(0)            // guards against stale async results
  const [script, setScript] = useState(loadScript)
  const [draft, setDraft] = useState(script)
  const [editing, setEditing] = useState(false)
  const [scriptError, setScriptError] = useState('')
  const scriptRef = useRef(script)
  scriptRef.current = script

  // Take the Pine indicator and drawings off the chart (they belong to the bars that are being replaced).
  const clearPine = useCallback(() => {
    const c = chart.current
    if (!c) return
    ++seq.current
    if (indicatorId.current) { c.removeIndicator(indicatorId.current); indicatorId.current = null }
    if (overlayKey.current) { c.plugins.unregister(overlayKey.current); overlayKey.current = null }
    c.requestRender?.()
  }, [])

  // Put a Pine script on the chart's current bars, replacing the previous one. Throws on script errors.
  const applyScript = useCallback(async (src) => {
    const c = chart.current
    const bars = c?.getData?.() ?? []
    if (!c || !bars.length) return
    const mine = ++seq.current
    const result = await runPine(src, bars)
    if (mine !== seq.current || chart.current !== c) return // superseded by a newer apply
    if (indicatorId.current) { c.removeIndicator(indicatorId.current); indicatorId.current = null }
    if (overlayKey.current) { c.plugins.unregister(overlayKey.current); overlayKey.current = null }
    const id = `pine_${mine}`
    if (Object.keys(result.lines).length) {
      c.registerIndicator(toIndicator(id, result))
      indicatorId.current = c.addIndicator(id)
    }
    if (hasDrawings(result.drawings)) {
      const ov = createDrawingOverlay(`${id}_drawings`, result.drawings)
      c.plugins.register(ov)
      overlayKey.current = pluginKey(ov)
    }
    c.requestRender?.()
  }, [])

  // The full TradeCanvas workspace: toolbar, drawing tools, watchlist, range bar. Pine re-runs when the bars change.
  useEffect(() => {
    const host0 = () => el.current
    const widget = new ChartWidget(el.current, {
      symbol: SYMBOLS[0],
      timeframe: '4h',
      theme: loadTheme(),
      adapter: new BinanceAdapter(),
      symbols: SYMBOLS,
      timeframes: TIMEFRAMES,
      customTimeframes: false,
      watchlist: true,
      depthLadder: true,
      ui: loadLook(),
    })
    widgetRef.current = widget
    document.documentElement.dataset.theme = loadTheme()
    // The widget has its own theme button; follow it so the page around the chart matches.
    const root = host0().querySelector('.tcw-root')
    const mo = root && new MutationObserver(() => { const t = root.getAttribute('data-tcw-theme'); if (t === 'light' || t === 'dark') applyTheme(t) })
    mo?.observe(root, { attributes: true, attributeFilter: ['data-tcw-theme'] })
    // While a new symbol / timeframe loads, the widget still shows the old bars. Fade them and drop the old Pine drawings.
    let guard = null
    function startSwitch() {
      el.current?.classList.add('switching')
      clearPine()
      clearTimeout(guard)
      guard = setTimeout(endSwitch, 3500)
    }
    function endSwitch() { clearTimeout(guard); el.current?.classList.remove('switching') }
    // The widget only tells us a switch happened once the new bars are in, so start the fade on the click itself.
    const host = el.current
    const onPick = (e) => {
      const b = e.target.closest?.('button,[role=button],[role=row],tr,li')
      if (!b || b.getAttribute('aria-pressed') === 'true' || b.classList.contains('active')) return
      const label = (b.getAttribute('aria-label') || b.textContent || '').trim()
      if (/^(1m|3m|5m|15m|30m|1h|2h|4h|1d|1w|1M)$/i.test(label) || /^(BTC|ETH|SOL|BNB)\/?USDT/.test(label)) startSwitch()
    }
    host.addEventListener('click', onPick, true)
    widget.openPanel('watchlist')
    const c = widget.getChart()
    chart.current = c
    let timer = null
    const rerun = () => {
      clearTimeout(timer)
      timer = setTimeout(() => { applyScript(scriptRef.current).catch(() => {}) }, 400)
    }
    const offs = [
      c.on('historyLoad', () => { endSwitch(); rerun() }),
      c.on('symbolInfoChange', rerun),
    ]
    rerun()
    return () => {
      clearTimeout(timer)
      clearTimeout(guard)
      mo?.disconnect()
      host.removeEventListener('click', onPick, true)
      offs.forEach((off) => typeof off === 'function' && off())
      ++seq.current
      indicatorId.current = null
      overlayKey.current = null
      widget.destroy()
      widgetRef.current = null
      if (chart.current === c) chart.current = null
    }
  }, [applyScript, clearPine, applyTheme])

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
        <span className="sub">Crypto · Binance</span>
        <select aria-label="Look" title="Look" value={look} onChange={(e) => { setLook(e.target.value); widgetRef.current?.setUI(e.target.value); try { localStorage.setItem('chart-look', e.target.value) } catch { /* ignore */ } }}>
          {LOOKS.map((l) => <option key={l} value={l}>{l[0].toUpperCase() + l.slice(1)}</option>)}
        </select>
        <button className="ghost" aria-label="Toggle light / dark theme" title="Toggle light / dark theme" onClick={() => { const t = theme === 'dark' ? 'light' : 'dark'; widgetRef.current?.setTheme(t); applyTheme(t) }}>{theme === 'dark' ? '☀ Light' : '☾ Dark'}</button>
        <button className={editing ? '' : 'ghost'} onClick={() => { setDraft(script); setScriptError(''); setEditing((v) => !v) }}>&lt;/&gt; Pine Editor</button>
        <span className="user">{user.name}</span>
        <button className="ghost" onClick={onLogout}>Sign out</button>
      </header>
      <div className="chart-wrap">
        <div className="chart" ref={el} />
      </div>
      {editing && (
        <section className="pine-dock" aria-label="Pine Script editor">
          <div className="pine-bar">
            <strong>Pine Editor</strong>
            <select aria-label="Load sample script" value="" onChange={(e) => { if (e.target.value) { setDraft(SAMPLES[e.target.value]); setScriptError('') } }}>
              <option value="">Open sample…</option>
              {Object.keys(SAMPLES).map((k) => <option key={k}>{k}</option>)}
            </select>
            <span className="pine-spacer" />
            <span className="hint">Ctrl+Enter to run</span>
            <button className="ghost" onClick={resetDraft}>Reset</button>
            <button onClick={runDraft}>Add to chart</button>
            <button className="ghost" onClick={() => setEditing(false)} aria-label="Close editor">✕</button>
          </div>
          <PineEditor value={draft} onChange={setDraft} onRun={runDraft} error={scriptError} />
          {scriptError && <div className="error pine-error" role="alert">{scriptError}</div>}
        </section>
      )}
    </div>
  )
}
