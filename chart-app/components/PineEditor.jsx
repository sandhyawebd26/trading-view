'use client'

import React, { useEffect, useRef } from 'react'
import { EditorView, keymap, lineNumbers, highlightActiveLine, drawSelection } from '@codemirror/view'
import { EditorState, Compartment } from '@codemirror/state'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { StreamLanguage, HighlightStyle, syntaxHighlighting, indentUnit } from '@codemirror/language'
import { setDiagnostics } from '@codemirror/lint'
import { tags as t } from '@lezer/highlight'

const KEYWORDS = new Set('if else for to by while switch break continue var varip import export type method return and or not true false in'.split(' '))
const DECLS = new Set('indicator strategy library'.split(' '))
const NAMESPACES = new Set('ta math input color str array matrix map request timeframe syminfo barstate strategy plot hline fill bgcolor barcolor box line label table alert alertcondition display extend position size shape location format style'.split(' '))
const BUILTIN_VARS = new Set('open high low close volume time bar_index hl2 hlc3 ohlc4 hlcc4 na tr'.split(' '))

// A small Pine Script tokenizer so the editor colours keywords, built-ins, strings, numbers and comments.
const pine = StreamLanguage.define({
  token(stream) {
    if (stream.eatSpace()) return null
    if (stream.match('//')) { stream.skipToEnd(); return 'comment' }
    const q = stream.peek()
    if (q === '"' || q === "'") {
      stream.next()
      let esc = false, ch
      while ((ch = stream.next()) != null) { if (ch === q && !esc) break; esc = !esc && ch === '\\' }
      return 'string'
    }
    if (stream.match(/^#[0-9a-fA-F]{6,8}\b/)) return 'atom'
    if (stream.match(/^\d+(\.\d*)?([eE][+-]?\d+)?|^\.\d+/)) return 'number'
    if (stream.match(/^[A-Za-z_][A-Za-z0-9_]*/)) {
      const w = stream.current()
      if (KEYWORDS.has(w)) return 'keyword'
      if (/^(int|float|bool|string|color|series|simple|const|label|line|box|table)$/.test(w) && stream.peek() !== '.' && stream.peek() !== '(') return 'typeName'
      if (DECLS.has(w)) return 'keyword'
      if (NAMESPACES.has(w) && stream.peek() === '.') return 'namespace'
      if (BUILTIN_VARS.has(w)) return 'variableName.special'
      if (stream.peek() === '(') return 'function'
      return 'variableName'
    }
    stream.next()
    return 'operator'
  },
  languageData: { commentTokens: { line: '//' } },
  tokenTable: {
    comment: t.lineComment, string: t.string, atom: t.atom, number: t.number, keyword: t.keyword,
    typeName: t.typeName, namespace: t.namespace, 'variableName.special': t.special(t.variableName),
    function: t.function(t.variableName), variableName: t.variableName, operator: t.operator,
  },
})

const highlight = HighlightStyle.define([
  { tag: t.lineComment, color: 'var(--syn-comment)', fontStyle: 'italic' },
  { tag: t.string, color: 'var(--syn-string)' },
  { tag: t.atom, color: 'var(--syn-atom)' },
  { tag: t.number, color: 'var(--syn-number)' },
  { tag: t.keyword, color: 'var(--syn-kw)' },
  { tag: t.typeName, color: 'var(--syn-type)' },
  { tag: t.namespace, color: 'var(--syn-ns)' },
  { tag: t.special(t.variableName), color: 'var(--syn-var)' },
  { tag: t.function(t.variableName), color: 'var(--syn-ns)' },
  { tag: t.operator, color: 'var(--syn-var)' },
])

const theme = EditorView.theme({
  '&': { height: '100%', background: 'var(--bg)', color: 'var(--fg)', fontSize: '12.5px' },
  '.cm-scroller': { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', lineHeight: '1.55' },
  '.cm-gutters': { background: 'var(--bg)', color: 'var(--gutter)', border: 'none' },
  '.cm-activeLine': { background: '#8882' },
  '.cm-activeLineGutter': { background: '#8884', color: 'var(--muted2)' },
  '.cm-cursor': { borderLeftColor: 'var(--fg)' },
  '&.cm-focused': { outline: 'none' },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': { background: '#2f6feb55' },
}, { dark: true })

// Pull a line number out of a PineTS / parser error message ("line 12", "at 12:5", ":12:5").
export function errorLine(msg) {
  const m = /line\s+(\d+)/i.exec(msg) || /\bat\s+(\d+):\d+/.exec(msg) || /:(\d+):\d+/.exec(msg)
  return m ? +m[1] : null
}

export default function PineEditor({ value, onChange, onRun, error }) {
  const host = useRef(null)
  const view = useRef(null)
  const cb = useRef({ onChange, onRun })
  cb.current = { onChange, onRun }

  useEffect(() => {
    const run = () => { cb.current.onRun?.(); return true }
    const v = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(), highlightActiveLine(), drawSelection(), history(), pine, syntaxHighlighting(highlight),
          indentUnit.of('    '), EditorState.tabSize.of(4), theme,
          keymap.of([{ key: 'Mod-Enter', run }, { key: 'Mod-s', run, preventDefault: true }, indentWithTab, ...defaultKeymap, ...historyKeymap]),
          EditorView.updateListener.of((u) => { if (u.docChanged) cb.current.onChange(u.state.doc.toString()) }),
        ],
      }),
    })
    view.current = v
    return () => v.destroy()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Replace the document when the parent swaps scripts (e.g. Reset or loading a sample).
  useEffect(() => {
    const v = view.current
    if (v && v.state.doc.toString() !== value) v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value } })
  }, [value])

  // Mark the failing line in the gutter and text.
  useEffect(() => {
    const v = view.current
    if (!v) return
    const diags = []
    if (error) {
      const n = errorLine(error)
      if (n && n >= 1 && n <= v.state.doc.lines) {
        const line = v.state.doc.line(n)
        diags.push({ from: line.from, to: Math.max(line.to, line.from + 1), severity: 'error', message: error })
      }
    }
    v.dispatch(setDiagnostics(v.state, diags))
  }, [error])

  return <div className="cm-host" ref={host} />
}
