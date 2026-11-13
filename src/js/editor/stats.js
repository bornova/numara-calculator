import { formatAnswer, parseStrictLocaleNumber } from '../core/formatter.js'
import { dom } from '../dom.js'
import { app } from '../state/appState.js'
import { events } from '../state/events.js'

let cm = null

/**
 * Initializes live selection stats with the editor instance and subscribes to calculation updates.
 * @param {object} cmInstance The CodeMirror instance.
 */
export function initStats(cmInstance) {
  cm = cmInstance
  events.on('calc:resultsApplied', () => updateSelectionStats())
}

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
 * @param {object} [cmInstance=cm] CodeMirror instance to inspect.
 */
export function updateSelectionStats(cmInstance = cm) {
  if (!dom.selectionStats || !cmInstance) return

  if (!cmInstance.somethingSelected()) {
    dom.selectionStats.style.display = 'none'
    dom.actions?.classList.remove('showing-stats')
    return
  }

  const selectedLines = new Set()

  for (const sel of cmInstance.listSelections()) {
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
  const sumOut = formatAnswer(sum, useThouSep, app.settings, app.currencies)
  const sumCopy = copyGrouping === useThouSep ? sumOut : formatAnswer(sum, copyGrouping, app.settings, app.currencies)
  const avgOut = formatAnswer(avg, useThouSep, app.settings, app.currencies)

  dom.selectionStats.textContent = `Sum: ${sumOut}  •  Avg: ${avgOut}  •  Count: ${values.length}`
  dom.selectionStats.dataset.copy = sumCopy
  dom.actions?.classList.add('showing-stats')
  dom.selectionStats.style.display = 'inline-block'
}
