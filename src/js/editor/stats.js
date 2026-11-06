import { formatAnswer } from '../calc/calcManager.js'
import { parseLocaleNumber } from '../core/formatter.js'
import { dom } from '../dom.js'
import { app } from '../state/appState.js'
import { cm } from './index.js'

/**
 * Computes and displays live sum, average, and count for multi-line selections.
 */
export function updateSelectionStats() {
  if (!dom.selectionStats) return

  if (!cm.somethingSelected()) {
    dom.selectionStats.style.display = 'none'
    dom.actions?.classList.remove('showing-stats')
    return
  }

  const selectedLines = new Set()

  for (const sel of cm.listSelections()) {
    const startLine = Math.min(sel.anchor.line, sel.head.line)
    let endLine = Math.max(sel.anchor.line, sel.head.line)

    if (sel.anchor.line !== sel.head.line) {
      const endPos =
        sel.anchor.line > sel.head.line || (sel.anchor.line === sel.head.line && sel.anchor.ch > sel.head.ch)
          ? sel.anchor
          : sel.head

      if (endPos.ch === 0) {
        endLine = Math.max(startLine, endLine - 1)
      }
    }

    for (let i = startLine; i <= endLine; i++) {
      selectedLines.add(i)
    }
  }

  if (selectedLines.size < 2) {
    dom.selectionStats.style.display = 'none'
    dom.actions?.classList.remove('showing-stats')
    return
  }

  const values = []

  for (const lineIdx of selectedLines) {
    const rawAns = app.mathScope.get(`line${lineIdx + 1}`)

    if (typeof rawAns === 'string' && /^-?\d[\d.,\s\u00A0\u202F\u2009]*(?:e[+-]?\d+)?$/i.test(rawAns.trim())) {
      const num = parseLocaleNumber(rawAns.trim(), app.settings)

      if (Number.isFinite(num)) {
        values.push(num)
      }
    }
  }

  if (values.length < 2) {
    dom.selectionStats.style.display = 'none'
    dom.actions?.classList.remove('showing-stats')
    return
  }

  const sum = values.reduce((acc, v) => acc + v, 0)
  const avg = sum / values.length
  const useThouSep = Boolean(app.settings?.thouSep)
  const sumOut = formatAnswer(sum, useThouSep)
  const sumCopy = formatAnswer(sum, Boolean(useThouSep && app.settings?.copyThouSep))
  const avgOut = formatAnswer(avg, useThouSep)

  dom.selectionStats.textContent = `Sum: ${sumOut}  •  Avg: ${avgOut}  •  Count: ${values.length}`
  dom.selectionStats.dataset.copy = sumCopy
  dom.actions?.classList.add('showing-stats')
  dom.selectionStats.style.display = 'inline-block'
}
