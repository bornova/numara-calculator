import { outputContext } from './ui/context'
import { dom } from './dom'
import { cm, debouncedCalculate } from './editor/editor'
import { app, store, getSystemLocale } from './utils'
import { syncPageSaveDebounced } from './sync'
import { notify } from './ui/modal'
import {
  app as coreApp,
  math as coreMath,
  formatAnswer as coreFormatAnswer,
  refreshCurrencyState as coreRefreshCurrencyState
} from './calc/evalCore'

import UIkit from 'uikit'

export const math = coreMath

/**
 * Formats a calculation answer for display using application settings.
 * @param {*} answer - The raw value to format.
 * @param {boolean} useGrouping - Whether to use grouping/thousands separator.
 * @returns {string} The formatted answer string.
 */
export function formatAnswer(answer, useGrouping) {
  coreApp.settings = {
    ...app.settings,
    systemLocale: getSystemLocale()
  }

  return coreFormatAnswer(answer, useGrouping)
}

/**
 * Synchronizes currency state with background calculation helper state.
 */
export function refreshCurrencyState() {
  coreApp.currencies = app.currencies
  coreApp.settings = {
    ...app.settings,
    systemLocale: getSystemLocale()
  }
  coreRefreshCurrencyState()
}

let worker = null
let currentTaskId = 0
let lastErrorHandles = []
let lastActivePage = null
let slowCalcTimeout = null
let hardCalcTimeout = null
let lastActiveLineIndex = -1
let sharedArray = null
let isCalculating = false
let isDialogVisible = false
let lastDialogShowTime = 0
let autoCloseTimeout = null
let lastScopeKeysSignature = ''

/**
 * Compares current scope, UDF, and UDU list keys against the last state to check if keys changed.
 * @param {object} serializedScope - The current serialized math scope.
 * @param {string[]} udfList - List of user-defined function names.
 * @param {string[]} uduList - List of user-defined unit names.
 * @returns {boolean} True if keys changed, requiring a syntax mode reload.
 */
function checkScopeKeysChanged(serializedScope, udfList, uduList) {
  const currentKeys = [
    ...Object.keys(serializedScope || {}).filter((k) => typeof (serializedScope || {})[k] !== 'function'),
    ...(udfList || []),
    ...(uduList || [])
  ].sort()

  const currentSignature = currentKeys.join(',')

  if (currentSignature !== lastScopeKeysSignature) {
    lastScopeKeysSignature = currentSignature
    return true
  }

  return false
}

/** Hides the timeout dialog smoothly after a calculation completes or errors. */
function hideTimeoutDialogAfterCalc() {
  if (isDialogVisible) {
    isDialogVisible = false

    const elapsed = Date.now() - lastDialogShowTime

    if (elapsed < 1000) {
      autoCloseTimeout = setTimeout(() => {
        UIkit.modal('#dialogCalcTimeout').hide()
        autoCloseTimeout = null
      }, 1000 - elapsed)
    } else {
      UIkit.modal('#dialogCalcTimeout').hide()
    }
  } else {
    UIkit.modal('#dialogCalcTimeout').hide()
  }
}

/**
 * Lazily spawns or retrieves the background Web Worker for calculation execution.
 * @returns {Worker} The spawned web worker instance.
 */
function getWorker() {
  if (!worker) {
    worker = new Worker('js/calc.worker.js')

    // Initialize with current user-defined functions/units
    worker.postMessage({
      type: 'initUdfu',
      payload: {
        udf: store.get('udf') ?? '',
        udu: store.get('udu') ?? ''
      }
    })

    worker.onmessage = (event) => {
      const { type, payload } = event.data

      if (type === 'calcResult') {
        const { taskId, answers, errorLines, serializedScope, udfList, uduList } = payload

        if (taskId !== currentTaskId) return

        isCalculating = false

        if (slowCalcTimeout) {
          clearTimeout(slowCalcTimeout)
          slowCalcTimeout = null
        }

        if (hardCalcTimeout) {
          clearTimeout(hardCalcTimeout)
          hardCalcTimeout = null
        }

        lastActiveLineIndex = -1

        hideTimeoutDialogAfterCalc()

        // Update the main thread's math scope mapping keys to serialized strings
        const keysChanged = checkScopeKeysChanged(serializedScope, udfList, uduList)

        app.mathScope = new Map(Object.entries(serializedScope))
        app.udfList = udfList
        app.uduList = uduList

        applyCalculationResults(answers, errorLines)

        if (keysChanged) {
          cm.setOption('mode', cm.getOption('mode'))
        }
      } else if (type === 'lineStart') {
        const { lineIndex } = payload

        lastActiveLineIndex = lineIndex
      } else if (type === 'calcError') {
        const { taskId } = payload || {}

        if (taskId === currentTaskId) {
          isCalculating = false

          if (slowCalcTimeout) {
            clearTimeout(slowCalcTimeout)
            slowCalcTimeout = null
          }

          if (hardCalcTimeout) {
            clearTimeout(hardCalcTimeout)
            hardCalcTimeout = null
          }

          lastActiveLineIndex = -1

          hideTimeoutDialogAfterCalc()
        }
        console.error('Calculation worker returned error:', payload.error)
      }
    }
  }

  return worker
}

/**
 * Tells the background calculation worker to clear its evaluation cache.
 */
export function clearEvaluationCache() {
  const w = getWorker()

  w.postMessage({ type: 'clearCache' })
}

/**
 * Update the line widget with the answer.
 *
 * @param {number} lineHandle - The line handle.
 * @param {string} answer - The answer to display.
 * @param {number} lineIndex - The absolute 0-based line index.
 * @param {boolean} isFolded - Whether the line is currently folded.
 */
function updateLineWidget(lineHandle, answer, lineIndex, isFolded) {
  let widget = app.widgetMap.get(lineHandle)

  if (widget) {
    let changed = false

    if (widget.node.innerHTML !== answer) {
      widget.node.innerHTML = answer
      changed = true
    }

    const newDisplay = isFolded ? 'none' : ''

    if (widget.node.style.display !== newDisplay) {
      widget.node.style.display = newDisplay
      changed = true
    }

    if (changed) {
      widget.changed()
    }
  } else {
    const node = document.createElement('div')

    node.dataset.index = lineIndex
    node.innerHTML = answer
    node.addEventListener('contextmenu', outputContext)
    node.style.display = isFolded ? 'none' : ''

    widget = cm.addLineWidget(lineHandle, node, { above: false, coverGutter: false, noHScroll: true })
    widget.node = node

    app.widgetMap.set(lineHandle, widget)
  }
}

/**
 * Synchronizes the heights of output display items with their corresponding CodeMirror inputs.
 */
export function syncOutputHeights() {
  if (app.settings.answerPosition === 'bottom') {
    const newHeight = dom.el('.CodeMirror-scroll').scrollHeight - 50
    const currentEl = dom.output.firstElementChild

    if (!currentEl || currentEl.style.height !== `${newHeight}px`) {
      dom.output.innerHTML = `<div style="height: ${newHeight}px;"></div>`
    }

    if (Math.abs(dom.output.scrollTop - dom.el('.CodeMirror-scroll').scrollTop) > 1) {
      dom.output.scrollTop = dom.el('.CodeMirror-scroll').scrollTop
    }

    return
  }

  const totalLines = cm.lineCount()
  const foldedLines = new Set()

  if (typeof cm !== 'undefined' && typeof cm.getAllMarks === 'function') {
    for (const mark of cm.getAllMarks()) {
      if (mark.__isFold) {
        const range = mark.find()

        if (range) {
          for (let i = range.from.line + 1; i <= range.to.line; i++) {
            foldedLines.add(i)
          }
        }
      }
    }
  }

  const visibleChildren = Array.from(cm.display.lineDiv.children)
  const lineToElementMap = new Map()

  for (const child of visibleChildren) {
    if (child.firstElementChild) {
      const lineAttr = child.firstElementChild.getAttribute('data-line')

      if (lineAttr !== null) {
        lineToElementMap.set(lineAttr, child)
      }
    }
  }

  let visibleIndex = 0

  for (let i = 0; i < totalLines; i++) {
    const lineHandle = cm.getLineHandle(i)
    const el = dom.el(`[data-index="${i}"]`)

    if (el) {
      if (lineHandle.hidden || foldedLines.has(i)) {
        if (el.style.display !== 'none') {
          el.style.display = 'none'
        }
      } else {
        const child = lineToElementMap.get(String(i)) || visibleChildren[visibleIndex++]
        const height = child ? (child.clientHeight ?? 27) : 27
        const newHeightStr = `${height}px`

        if (el.style.display !== '') {
          el.style.display = ''
        }

        if (el.style.height !== newHeightStr) {
          el.style.height = newHeightStr
        }
      }
    }
  }

  if (Math.abs(dom.output.scrollTop - dom.el('.CodeMirror-scroll').scrollTop) > 1) {
    dom.output.scrollTop = dom.el('.CodeMirror-scroll').scrollTop
  }
}

/**
 * Generate output panel HTML for a list of answers.
 *
 * @param {Array<string>} answers - The list of answer HTML strings.
 * @returns {string} - The complete outputResults HTML string.
 */
export function renderAnswersToHTML(answers) {
  const useRulers = app.settings.rulers
  const classRuler = useRulers ? 'ruler' : 'noRuler'
  const outputAnswers = []

  for (let lineIndex = 0; lineIndex < answers.length; lineIndex++) {
    const result = answers[lineIndex] || ''
    let displayResult = result

    if (app.settings.truncateAnswers && result && result.includes('class="answer"')) {
      const tooltipText = result.replace(/<[^>]*>/g, '').replace(/"/g, '&quot;')

      displayResult = result.replace('class="answer"', `class="answer" uk-tooltip="title: ${tooltipText}"`)
    }

    outputAnswers.push(`<div class="${classRuler}" data-index="${lineIndex}">${displayResult}</div>`)
  }

  return `<div class="outputWrapper">${outputAnswers.join('')}</div>`
}

/**
 * Apply results received asynchronously from the worker to CodeMirror and the DOM.
 */
function applyCalculationResults(answers, errorLines) {
  const totalLines = cm.lineCount()
  const CLASS_LINE_ERROR = 'lineNoError'

  if (lastActivePage !== app.activePage) {
    lastActivePage = app.activePage
    lastErrorHandles = []
  }

  cm.operation(() => {
    for (const lh of lastErrorHandles) {
      cm.removeLineClass(lh, 'gutter', CLASS_LINE_ERROR)
    }

    const currentErrorHandles = []

    for (const lineIdx of errorLines) {
      if (lineIdx < totalLines) {
        const lh = cm.getLineHandle(lineIdx)

        if (lh) {
          cm.addLineClass(lh, 'gutter', CLASS_LINE_ERROR)
          currentErrorHandles.push(lh)
        }
      }
    }

    lastErrorHandles = currentErrorHandles
  })

  // Find all folded lines
  const foldedLines = new Set()
  if (typeof cm !== 'undefined' && typeof cm.getAllMarks === 'function') {
    for (const mark of cm.getAllMarks()) {
      if (mark.__isFold) {
        const range = mark.find()

        if (range) {
          for (let i = range.from.line + 1; i <= range.to.line; i++) {
            foldedLines.add(i)
          }
        }
      }
    }
  }

  const hasLineWidget = app.settings.answerPosition === 'bottom'

  if (hasLineWidget) {
    for (let lineIndex = 0; lineIndex < totalLines; lineIndex++) {
      const lineHandle = cm.getLineHandle(lineIndex)
      const result = answers[lineIndex] || ''
      updateLineWidget(lineHandle, result, lineIndex, foldedLines.has(lineIndex))
    }
    dom.output.innerHTML = `<div style="height: ${dom.el('.CodeMirror-scroll').scrollHeight - 50}px;"></div>`
  } else {
    const outputResults = renderAnswersToHTML(answers)

    if (dom.output.innerHTML !== outputResults) {
      dom.output.innerHTML = outputResults
    }
  }

  syncOutputHeights()

  // Update page lists / storage
  if (app.activePage) {
    const pages = store.get('pages')
    const page = pages.find((page) => page.id === app.activePage)

    const folds = []

    if (typeof cm !== 'undefined' && typeof cm.getAllMarks === 'function') {
      for (const mark of cm.getAllMarks()) {
        if (mark.__isFold) {
          const range = mark.find()

          if (range) {
            folds.push({ from: range.from.line, to: range.to.line })
          }
        }
      }
    }

    const cmValue = cm.getValue()
    const cmHistory = cm.getHistory()

    if (page) {
      if (
        page.data !== cmValue ||
        JSON.stringify(page.history) !== JSON.stringify(cmHistory) ||
        JSON.stringify(page.folds) !== JSON.stringify(folds) ||
        JSON.stringify(page.answers) !== JSON.stringify(answers)
      ) {
        page.data = cmValue
        page.history = cmHistory
        page.folds = folds
        page.answers = answers
        store.set('pages', pages)
        syncPageSaveDebounced(page.name, cmValue)
      }
    }
  }
}

/**
 * Displays a dialog warning the user that calculation is taking longer than expected.
 * @param {string[]} lines - The array of lines being calculated.
 */
function showTimeoutDialog(lines) {
  lastDialogShowTime = Date.now()
  isDialogVisible = true

  if (autoCloseTimeout) {
    clearTimeout(autoCloseTimeout)
    autoCloseTimeout = null
  }

  const stuckLineIndex = sharedArray && sharedArray[0] !== -1 ? sharedArray[0] : lastActiveLineIndex
  const lineNo = stuckLineIndex !== -1 ? stuckLineIndex + 1 : null

  const msg = lineNo
    ? `Calculating line ${lineNo} is taking too long.<br><br>Do you want to continue waiting or ignore the line?`
    : `Calculations are running but taking too long.<br><br>Do you want to continue waiting or ignore the line?`

  dom.calcTimeoutMsg.innerHTML = msg

  UIkit.modal('#dialogCalcTimeout', { bgClose: false, escClose: false, stack: true }).show()

  dom.calcTimeoutContinue.onclick = () => {
    UIkit.modal('#dialogCalcTimeout').hide()

    isDialogVisible = false

    if (autoCloseTimeout) {
      clearTimeout(autoCloseTimeout)
      autoCloseTimeout = null
    }

    if (isCalculating) {
      const timeoutDuration = (parseInt(app.settings.calcTimeout) || 10) * 1000

      hardCalcTimeout = setTimeout(() => showTimeoutDialog(lines), timeoutDuration)
    }
  }

  dom.calcTimeoutIgnore.onclick = () => {
    UIkit.modal('#dialogCalcTimeout').hide()

    isDialogVisible = false

    if (autoCloseTimeout) {
      clearTimeout(autoCloseTimeout)
      autoCloseTimeout = null
    }

    if (!isCalculating) return

    const currentStuckIndex = sharedArray && sharedArray[0] !== -1 ? sharedArray[0] : lastActiveLineIndex

    if (worker) {
      worker.terminate()
      worker = null
    }

    if (currentStuckIndex !== -1 && currentStuckIndex < cm.lineCount()) {
      const lineText = cm.getLine(currentStuckIndex)

      if (lineText !== null && !lineText.trim().startsWith('//') && !lineText.trim().startsWith('#')) {
        cm.replaceRange('// ', { line: currentStuckIndex, ch: 0 })
      }

      if (debouncedCalculate) {
        debouncedCalculate.flush()
      } else {
        calculate()
      }
    } else {
      notify('Calculations took too long and were cancelled.', 'danger')
    }
  }
}

/**
 * Triggers asynchronous calculations in the background web worker.
 */
export function calculate() {
  if (app.refreshCM) cm.refresh()

  const cmValue = cm.getValue()

  dom.clearButton.setAttribute('disabled', cmValue === '')
  dom.copyButton.setAttribute('disabled', cmValue === '')

  const totalLines = cm.lineCount()
  const lines = []

  for (let i = 0; i < totalLines; i++) {
    lines.push(cm.getLine(i))
  }

  if (!app.timedOutLines) {
    app.timedOutLines = new Map()
  }

  for (const [idx, text] of app.timedOutLines.entries()) {
    if (idx >= totalLines || lines[idx] !== text) {
      app.timedOutLines.delete(idx)
    }
  }

  let sharedBuffer = null

  if (typeof SharedArrayBuffer !== 'undefined') {
    sharedBuffer = new SharedArrayBuffer(4)
    sharedArray = new Int32Array(sharedBuffer)
    sharedArray[0] = -1
  } else {
    sharedArray = null
  }

  isCalculating = true

  if (autoCloseTimeout) {
    clearTimeout(autoCloseTimeout)
    autoCloseTimeout = null
  }

  currentTaskId++

  if (slowCalcTimeout) {
    clearTimeout(slowCalcTimeout)
    slowCalcTimeout = null
  }

  if (hardCalcTimeout) {
    clearTimeout(hardCalcTimeout)
    hardCalcTimeout = null
  }

  const timeoutDuration = (parseInt(app.settings.calcTimeout) || 10) * 1000
  const slowDuration = Math.min(5000, timeoutDuration / 2)

  slowCalcTimeout = setTimeout(() => {
    notify('Calculations are running but taking longer than expected...', 'warning')
  }, slowDuration)

  hardCalcTimeout = setTimeout(() => {
    showTimeoutDialog(lines)
  }, timeoutDuration)

  const w = getWorker()

  w.postMessage({
    type: 'calculate',
    payload: {
      taskId: currentTaskId,
      activePage: app.activePage,
      lines,
      settings: {
        ...app.settings,
        systemLocale: getSystemLocale()
      },
      currencies: app.currencies,
      udf: store.get('udf') ?? '',
      udu: store.get('udu') ?? '',
      sharedBuffer,
      timedOutLines: Array.from(app.timedOutLines.keys())
    }
  })
}
