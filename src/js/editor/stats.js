import { formatAnswer } from '../calc/calcManager.js'
import { parseStrictLocaleNumber } from '../core/formatter.js'
import { dom } from '../dom.js'
import { app } from '../state/appState.js'
import { cm } from './index.js'

/**
 * Resolves the inclusive `[startLine, endLine]` range for a CodeMirror selection,
 * excluding a trailing line when a multi-line selection ends at column 0.
 * @param {object} sel CodeMirror selection range.
 * @returns {{ startLine: number, endLine: number }}
 */
export function getSelectionLineRange(sel) {
  const startPos = sel.from()
  const endPos = sel.to()
  const startLine = startPos.line
  const endLine =
    sel.anchor.line !== sel.head.line && endPos.ch === 0 ? Math.max(startLine, endPos.line - 1) : endPos.line

  return { startLine, endLine }
}

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
    const { startLine, endLine } = getSelectionLineRange(sel)

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
    const num = parseStrictLocaleNumber(app.mathScope.get(`line${lineIdx + 1}`), app.settings)

    if (Number.isFinite(num)) {
      values.push(num)
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
  const copyGrouping = Boolean(useThouSep && app.settings?.copyThouSep)
  const sumOut = formatAnswer(sum, useThouSep)
  const sumCopy = copyGrouping === useThouSep ? sumOut : formatAnswer(sum, copyGrouping)
  const avgOut = formatAnswer(avg, useThouSep)

  dom.selectionStats.textContent = `Sum: ${sumOut}  •  Avg: ${avgOut}  •  Count: ${values.length}`
  dom.selectionStats.dataset.copy = sumCopy
  dom.actions?.classList.add('showing-stats')
  dom.selectionStats.style.display = 'inline-block'
}
