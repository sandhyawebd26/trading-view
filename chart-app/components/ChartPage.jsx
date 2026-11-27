'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { BinanceAdapter, pluginKey } from '@tradecanvas/chart'
import { ChartWidget } from '@tradecanvas/chart/widget'
import { runPine, toIndicator, placeholderIndicator } from './pineRunner.js'
import { createDrawingOverlay, hasDrawings } from './pineDrawings.js'
import PineEditor from './PineEditor.jsx'
import { listIndicators, saveIndicator, deleteIndicator } from '@/lib/api.js'
import volumeProfile from '@/lib/scripts/volumeProfile.js'
// Default client Pine script. It runs internally; users only see it through the hover editor.
import defaultScript from '@/lib/scripts/ema.js'

const SAMPLES = { 'EMA (default)': defaultScript, 'Volume Profile / Fixed Range': volumeProfile }
const SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT']
const TIMEFRAMES = ['1m', '5m', '15m', '1h', '4h', '1d']
const LOOKS = ['graphite', 'modern', 'print', 'studio', 'terminal', 'capsule', 'desk']
const loadTheme = () => { try { return localStorage.getItem('chart-theme') === 'light' ? 'light' : 'dark' } catch { return 'dark' } }
// Default name for a saved indicator: the title in the script's indicator("…") line.
const nameFromSource = (src) => /indicator\(\s*(?:title\s*=\s*)?["']([^"']+)["']/.exec(src)?.[1]?.trim() || 'My indicator'
const loadLook = () => { try { const v = localStorage.getItem('chart-look'); return LOOKS.includes(v) ? v : 'graphite' } catch { return 'graphite' } }

// Scripts on the chart, kept across reloads: [{ key, source }].
//   key "s<id>"    a saved indicator (its saved name is shown)
//   key "d_<slug>" an unsaved script (one per script title, so running it again replaces it)
const STORE_V2 = 'pine-scripts-v2'
const slug = (t) => t.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40) || 'script'
const draftKey = (src) => `d_${slug(nameFromSource(src))}`
const pluginIdOf = (key) => (key.startsWith('s') ? `custom_${key.slice(1)}` : `custom_${key}`)
const savedIdOf = (key) => (key.startsWith('s') ? Number(key.slice(1)) : null)
const loadEntries = () => {
  try {
    const raw = localStorage.getItem(STORE_V2)
    if (raw) {
      const list = JSON.parse(raw)
      if (Array.isArray(list)) return list.filter((e) => e && typeof e.key === 'string' && typeof e.source === 'string').map((e) => ({ key: e.key, source: e.source, name: '' }))
    }
    // Earlier versions kept a single script (or "__none__" once it was removed).
    const v1 = localStorage.getItem('pine-script-v1')
    if (v1 === '__none__') return []
    const src = v1 || defaultScript
    return [{ key: draftKey(src), source: src, name: '' }]
  } catch { return [{ key: draftKey(defaultScript), source: defaultScript, name: '' }] }
}
const persistEntries = (list) => { try { localStorage.setItem(STORE_V2, JSON.stringify(list.map(({ key, source }) => ({ key, source })))) } catch { /* ignore */ } }
const pluginKeyOf = (pid) => pluginKey({ kind: 'indicator', plugin: { descriptor: { id: pid } } })

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
  const runtime = useRef(new Map())   // script key -> { instanceId, overlayKey, pluginId } for what is drawn on the chart now
  const epoch = useRef(0)              // bumped when everything is cleared, so late results are dropped
  const tokens = useRef(new Map())     // script key -> latest run number, so an older run cannot overwrite a newer one
  const tokenCounter = useRef(0)
  const selfAdd = useRef(false)        // true while this page adds an indicator, so its own add is not mistaken for a pick from the list
  const internalRemove = useRef(false) // true while this page removes one, so it is not mistaken for the legend's ✕
  const savedRef = useRef([])
  const registered = useRef(new Set()) // ids of the saved-script placeholders listed in the Indicators dialog
  const pickRef = useRef(() => {})
  const userRemoveRef = useRef(() => {})
  const rerunRef = useRef(() => {})
  const [chartReady, setChartReady] = useState(false)
  const [savedLoaded, setSavedLoaded] = useState(false)
  const [entries, setEntriesState] = useState(loadEntries) // the scripts on the chart: [{ key, source, name }]
  const entriesRef = useRef(entries)
  const commit = useCallback((updater) => {
    const next = typeof updater === 'function' ? updater(entriesRef.current) : updater
    entriesRef.current = next
    setEntriesState(next)
    persistEntries(next)
  }, [])
  const [draft, setDraft] = useState(() => entriesRef.current[entriesRef.current.length - 1]?.source ?? defaultScript)
  const [editing, setEditing] = useState(false)
  const [scriptError, setScriptError] = useState('')
  const [saved, setSaved] = useState([])          // this account's saved custom indicators
  const [activeId, setActiveId] = useState(null)  // saved indicator currently loaded in the editor
  const [savePrompt, setSavePrompt] = useState(null) // { name, source, key } shown after a successful Add to chart
  const [saveError, setSaveError] = useState('')
  const [saving, setSaving] = useState(false)
  const [note, setNote] = useState('')
  const [stamps, setStamps] = useState({})        // script key -> time it was last added, to pulse its chip

  savedRef.current = saved

  // List every saved script in the chart's Indicators dialog, under "My indicators".
  useEffect(() => {
    const c = chart.current
    if (!c || !chartReady) return
    const onChart = new Set([...runtime.current.values()].map((r) => r.pluginId))
    const wanted = new Set(saved.map((i) => `custom_${i.id}`))
    for (const i of saved) {
      const id = `custom_${i.id}`
      if (onChart.has(id)) continue // already on the chart with real results
      c.plugins.unregister(pluginKeyOf(id))
      c.registerIndicator(placeholderIndicator(id, i.name))
      registered.current.add(id)
    }
    for (const id of [...registered.current]) if (!wanted.has(id)) { c.plugins.unregister(pluginKeyOf(id)); registered.current.delete(id) }
  }, [saved, chartReady])

  // Take one script's indicator and drawings off the chart (internal: does not count as the user removing it).
  const detach = useCallback((c, key) => {
    const rt = runtime.current.get(key)
    if (!rt) return
    internalRemove.current = true
    try {
      if (rt.instanceId) { try { c.removeIndicator(rt.instanceId) } catch { /* already gone */ } }
      if (rt.overlayKey) c.plugins.unregister(rt.overlayKey)
    } finally { internalRemove.current = false }
    runtime.current.delete(key)
  }, [])

  // Take every script off the chart (they belong to the bars that are being replaced). The list is kept.
  const clearPine = useCallback(() => {
    const c = chart.current
    if (!c) return
    epoch.current += 1
    for (const key of [...runtime.current.keys()]) detach(c, key)
    c.requestRender?.()
  }, [detach])

  // Run one script on the chart's current bars and draw it, replacing that script's previous drawing only.
  // Returns the name it is shown under, or null if there was nothing to draw on. Throws on script errors.
  const applyEntry = useCallback(async (entry) => {
    const c = chart.current
    const bars = c?.getData?.() ?? []
    if (!entry.source.trim() || !c || !bars.length) return null
    const token = ++tokenCounter.current
    tokens.current.set(entry.key, token)
    const ep = epoch.current
    const result = await runPine(entry.source, bars)
    if (tokens.current.get(entry.key) !== token || epoch.current !== ep || chart.current !== c) return null // superseded
    detach(c, entry.key)
    const sid = savedIdOf(entry.key)
    const savedItem = sid != null ? savedRef.current.find((i) => i.id === sid) : null
    // A saved script is shown under the name its owner gave it; an unsaved one under its own title.
    const label = savedItem ? savedItem.name : result.title
    // A script that only draws shapes still gets a legend row (an empty line), like any other indicator.
    const shown = { ...(Object.keys(result.lines).length ? result
      : { ...result, lines: { [label]: new Array(bars.length).fill(null) }, colors: ['#8b93a7'], fills: [] }), title: label }
    const pid = pluginIdOf(entry.key)
    c.plugins.unregister(pluginKeyOf(pid))
    c.registerIndicator(toIndicator(pid, shown, savedItem ? savedItem.name : `Unsaved: ${result.title}`))
    registered.current.delete(pid)
    let instanceId = null
    selfAdd.current = true
    try { instanceId = c.addIndicator(pid) } finally { selfAdd.current = false }
    let ovKey = null
    if (hasDrawings(result.drawings)) {
      const ov = createDrawingOverlay(`${pid}_drawings`, result.drawings)
      c.plugins.register(ov)
      ovKey = pluginKey(ov)
    }
    runtime.current.set(entry.key, { instanceId, overlayKey: ovKey, pluginId: pid })
    c.requestRender?.()
    return label
  }, [detach])

  // Re-run every script on the chart (after a new symbol / timeframe, or once saved names have loaded).
  const applyAll = useCallback(async () => {
    const list = entriesRef.current
    // One after another: running several Pine scripts at the same moment can make them interfere.
    const names = []
    for (const e of list) {
      try { names.push(await applyEntry(e)) } catch (err) { console.warn(`Pine script “${e.name || e.key}” failed:`, err); names.push(null) }
    }
    commit((cur) => cur.map((e) => { const i = list.findIndex((x) => x.key === e.key); return i >= 0 && names[i] && names[i] !== e.name ? { ...e, name: names[i] } : e }))
  }, [applyEntry, commit])

  useEffect(() => {
    listIndicators().then((r) => { savedRef.current = r.indicators; setSaved(r.indicators); setSavedLoaded(true) }).catch(() => setSavedLoaded(true))
  }, [])

  // Once the saved list is known: a script on the chart that matches a saved one is that saved one; draw everything again.
  useEffect(() => {
    if (!savedLoaded || !chartReady) return
    commit((list) => list.map((e) => {
      const match = e.key.startsWith('d_') ? savedRef.current.find((i) => i.source === e.source) : null
      return match ? { ...e, key: `s${match.id}` } : e
    }))
    applyAll()
  }, [savedLoaded, chartReady, applyAll, commit])

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
      timer = setTimeout(() => { applyAll() }, 400)
    }
    // Picking a saved script in the Indicators dialog, or removing one with the legend's ✕, comes back to this page.
    c.on('indicatorAdd', (e) => {
      const p = e.payload
      if (selfAdd.current || !p?.id?.startsWith('custom_')) return
      setTimeout(() => {
        try { c.removeIndicator(p.instanceId) } catch { /* gone */ }
        pickRef.current(p.id)
      }, 0)
    })
    c.on('indicatorRemove', (e) => {
      if (internalRemove.current || !e.payload?.instanceId) return
      for (const [key, rt] of runtime.current) if (rt.instanceId === e.payload.instanceId) { userRemoveRef.current(key); break }
    })
    setChartReady(true)
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
      epoch.current += 1
      runtime.current.clear()
      widget.destroy()
      setChartReady(false)
      registered.current = new Set()
      widgetRef.current = null
      if (chart.current === c) chart.current = null
    }
  }, [applyAll, clearPine, applyTheme])

  const flashTimer = useRef(null)
  function flash(msg) { setNote(msg); clearTimeout(flashTimer.current); flashTimer.current = setTimeout(() => setNote(''), 4000) }

  // Add (or update) a script on the chart. Other scripts already there stay. Returns the name it is shown under.
  async function putOnChart(entry) {
    const label = await applyEntry(entry)
    if (label == null) return null
    commit((list) => (list.some((e) => e.key === entry.key)
      ? list.map((e) => (e.key === entry.key ? { ...e, source: entry.source, name: label } : e))
      : [...list, { key: entry.key, source: entry.source, name: label }]))
    setStamps((m) => ({ ...m, [entry.key]: Date.now() }))
    return label
  }

  async function runSource(src) {
    setScriptError('')
    const loaded = activeId != null ? saved.find((i) => i.id === activeId) : null
    const key = loaded ? `s${loaded.id}` : draftKey(src)
    try {
      const label = await putOnChart({ key, source: src })
      if (label == null) return
      flash(`Added “${label}” to the chart.`)
      // Offer to keep it, unless this exact script is already saved.
      const same = saved.find((i) => i.source === src)
      setSaveError('')
      if (same && key.startsWith('d_')) {
        // The script is already saved under another entry: show it as that saved one.
        const old = key
        const target = `s${same.id}`
        const rt = chart.current && runtime.current.get(old)
        if (rt) detach(chart.current, old)
        commit((list) => list.filter((e) => e.key !== old && e.key !== target))
        await putOnChart({ key: target, source: src })
        setActiveId(same.id)
        setSavePrompt(null)
      } else {
        setActiveId(same ? same.id : loaded ? loaded.id : null)
        setSavePrompt(same ? null : { name: loaded?.name || nameFromSource(src), source: src, key })
      }
    } catch (e) {
      setScriptError(String(e?.message ?? e))
    }
  }
  const runDraft = () => runSource(draft)

  async function saveCurrent() {
    const name = savePrompt.name.trim()
    if (!name) { setSaveError('Enter a name.'); return }
    setSaving(true); setSaveError('')
    try {
      const { indicator } = await saveIndicator(name, savePrompt.source)
      savedRef.current = [indicator, ...savedRef.current.filter((i) => i.id !== indicator.id)]
      setSaved(savedRef.current)
      // The script on the chart becomes the saved one, so it is listed and shown under its saved name.
      const oldKey = savePrompt.key
      const newKey = `s${indicator.id}`
      if (chart.current && oldKey !== newKey) detach(chart.current, oldKey)
      commit((list) => list.filter((e) => e.key !== oldKey || oldKey === newKey))
      await putOnChart({ key: newKey, source: savePrompt.source })
      setActiveId(indicator.id)
      setSavePrompt(null)
      flash(`Saved “${name}” to My indicators.`)
    } catch (e) { setSaveError(e.message) } finally { setSaving(false) }
  }

  // Put a saved script on the chart and load it in the editor. Used by the My indicators menu and the Indicators dialog.
  async function activateSaved(item) {
    setDraft(item.source); setScriptError(''); setSavePrompt(null); setActiveId(item.id)
    try {
      const label = await putOnChart({ key: `s${item.id}`, source: item.source })
      if (label) flash(`Added “${label}” to the chart.`)
    } catch (e) { setScriptError(String(e?.message ?? e)) }
  }
  function openSaved(id) {
    const item = saved.find((i) => i.id === Number(id))
    if (item) activateSaved(item)
  }
  // A pick in the chart's Indicators dialog arrives as a plugin id.
  pickRef.current = (pid) => {
    const item = savedRef.current.find((i) => `custom_${i.id}` === pid)
    if (item) { activateSaved(item); return }
    const entry = entriesRef.current.find((e) => pluginIdOf(e.key) === pid)
    if (entry) putOnChart(entry).catch(() => {})
  }

  async function removeSaved() {
    const item = saved.find((i) => i.id === activeId)
    if (!item || !window.confirm(`Delete “${item.name}” from My indicators? It stays on the chart until you remove it.`)) return
    try {
      await deleteIndicator(item.id)
      setSaved((list) => list.filter((i) => i.id !== item.id))
      setActiveId(null)
      flash(`Deleted “${item.name}”.`)
    } catch (e) { setScriptError(e.message) }
  }

  // Take one script off the chart and keep it off after a reload.
  function removeFromChart(key) {
    const name = entriesRef.current.find((e) => e.key === key)?.name
    if (chart.current) { detach(chart.current, key); chart.current.requestRender?.() }
    commit((list) => list.filter((e) => e.key !== key))
    flash(`Removed ${name ? `“${name}”` : 'the script'} from the chart.`)
  }
  userRemoveRef.current = removeFromChart

  function editEntry(e) {
    setDraft(e.source); setScriptError(''); setSavePrompt(null)
    const sid = savedIdOf(e.key)
    setActiveId(sid != null && saved.some((i) => i.id === sid) ? sid : null)
    setEditing(true)
  }

  function resetDraft() {
    setDraft(defaultScript)
    setActiveId(null)
    runSource(defaultScript)
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
        <button className={editing ? '' : 'ghost'} onClick={() => { setScriptError(''); setEditing((v) => !v) }}>&lt;/&gt; Pine Editor</button>
        <span className="user">{user.name}</span>
        <button className="ghost" onClick={onLogout}>Sign out</button>
      </header>
      {entries.length > 0 && (
        <div className="pine-chips" role="status" aria-live="polite">
          {entries.map((e) => (
            <span className="chip" key={`${e.key}-${stamps[e.key] ?? 0}`}>
              <span className="chip-dot" aria-hidden="true" />
              <span>On the chart: <strong>{e.name || nameFromSource(e.source)}</strong></span>
              <button className="ghost" onClick={() => editEntry(e)}>Edit</button>
              <button className="ghost" onClick={() => removeFromChart(e.key)} aria-label={`Remove ${e.name || nameFromSource(e.source)} from the chart`}>Remove</button>
            </span>
          ))}
        </div>
      )}
      <div className="chart-wrap">
        <div className="chart" ref={el} />
      </div>
      {editing && (
        <section className="pine-dock" aria-label="Pine Script editor">
          <div className="pine-bar">
            <strong>Pine Editor</strong>
            <select aria-label="Load sample script" value="" onChange={(e) => { if (e.target.value) { setDraft(SAMPLES[e.target.value]); setScriptError(''); setActiveId(null); setSavePrompt(null) } }}>
              <option value="">Open sample…</option>
              {Object.keys(SAMPLES).map((k) => <option key={k}>{k}</option>)}
            </select>
            <select aria-label="My indicators" value={activeId ?? ''} onChange={(e) => openSaved(e.target.value)}>
              <option value="" disabled>{saved.length ? `My indicators (${saved.length})` : 'My indicators (none yet)'}</option>
              {saved.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
            {activeId != null && <button className="ghost" onClick={removeSaved} title="Delete the loaded custom indicator">Delete</button>}
            <span className="pine-spacer" />
            {note && <span className="pine-note" role="status">{note}</span>}
            <span className="hint">Ctrl+Enter to run</span>
            <button className="ghost" onClick={resetDraft}>Reset</button>
            <button onClick={runDraft}>Add to chart</button>
            <button className="ghost" onClick={() => setEditing(false)} aria-label="Close editor">✕</button>
          </div>
          {savePrompt && (
            <form className="pine-save" onSubmit={(e) => { e.preventDefault(); saveCurrent() }}>
              <span>Added to chart. Save it as a custom indicator?</span>
              <input aria-label="Indicator name" value={savePrompt.name} maxLength={80} onChange={(e) => setSavePrompt({ ...savePrompt, name: e.target.value })} />
              <button type="submit" disabled={saving}>{saved.some((i) => i.name === savePrompt.name.trim()) ? 'Update' : 'Save'}</button>
              <button type="button" className="ghost" onClick={() => setSavePrompt(null)}>Not now</button>
              {saveError && <span className="pine-save-error" role="alert">{saveError}</span>}
            </form>
          )}
          <PineEditor value={draft} onChange={setDraft} onRun={runDraft} error={scriptError} />
          {scriptError && <div className="error pine-error" role="alert">{scriptError}</div>}
        </section>
      )}
    </div>
  )
}
