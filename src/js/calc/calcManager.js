import UIkit from 'uikit'

import { formatAnswer as coreFormatAnswer, parseLocaleNumber } from '../core/formatter.js'
import { math, refreshCurrencyState as coreRefreshCurrencyState } from '../core/mathInstance.js'
import { debounce } from '../core/utils.js'
import { dom } from '../dom.js'
import { cm, debouncedCalculate, registerExcelFunctions, updateSelectionStats } from '../editor/index.js'
import { syncPageSaveDebounced } from '../pages/sync.js'
import { app } from '../state/appState.js'
import { getSystemLocale } from '../state/env.js'
import { store } from '../state/store.js'
import { notify } from '../ui/dialogs.js'
import {
  getFoldedState,
  renderAnswersToHTML,
  syncOutputHeights,
  updateLineWidget,
  updateOutputDOM
} from './outputRenderer.js'

export { math, parseLocaleNumber, renderAnswersToHTML, syncOutputHeights }

let worker = null
let currentTaskId = 0
let currentTaskPageId = null
let currentTaskDocValue = null
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
let pendingPageSave = null

/**
 * Clears active slow/hard calculation timeout timers.
 */
function clearCalcTimeouts() {
  if (slowCalcTimeout) {
    clearTimeout(slowCalcTimeout)
    slowCalcTimeout = null
  }

  if (hardCalcTimeout) {
    clearTimeout(hardCalcTimeout)
    hardCalcTimeout = null
  }
}

/**
 * Clears any scheduled auto-close timer for the timeout dialog.
 */
function clearAutoCloseTimeout() {
  if (autoCloseTimeout) {
    clearTimeout(autoCloseTimeout)
    autoCloseTimeout = null
  }
}

/**
 * Compares current scope, UDF, and UDU list keys against the last state to check if keys changed.
 * @param {object} serializedScope The current serialized math scope.
 * @param {string[]} udfList List of user-defined function names.
 * @param {string[]} uduList List of user-defined unit names.
 * @returns {boolean} True if keys changed, requiring a syntax mode reload.
 */
function checkScopeKeysChanged(serializedScope, udfList, uduList) {
  const currentKeys = [...Object.keys(serializedScope || {}), ...(udfList || []), ...(uduList || [])].sort()

  const currentSignature = currentKeys.join(',')

  if (currentSignature !== lastScopeKeysSignature) {
    lastScopeKeysSignature = currentSignature
    return true
  }

  return false
}

/**
 * Hides the timeout dialog smoothly after a calculation completes or errors.
 */
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
  }
}

/**
 * Lazily spawns or retrieves the background Web Worker for calculation execution.
 * @returns {Worker} The spawned web worker instance.
 */
function getWorker() {
  if (!worker) {
    worker = new Worker('js/calc.worker.js')

    worker.onmessage = (event) => {
      const { type, payload } = event.data

      if (type === 'calcResult') {
        const { taskId, answers, errorLines, serializedScope, scopeProperties, scopeTypes, udfList, uduList } = payload

        if (taskId !== currentTaskId) return
        if (app.activePage !== currentTaskPageId || cm.getValue() !== currentTaskDocValue) return

        isCalculating = false
        clearCalcTimeouts()
        lastActiveLineIndex = -1

        hideTimeoutDialogAfterCalc()

        // Update the main thread's math scope mapping keys to serialized strings
        const keysChanged = checkScopeKeysChanged(serializedScope, udfList, uduList)

        app.mathScope = new Map(Object.entries(serializedScope))
        app.scopeProperties = scopeProperties || {}
        app.scopeTypes = scopeTypes || {}
        app.udfList = udfList
        app.uduList = uduList

        applyCalculationResults(answers, errorLines)

        if (keysChanged) {
          cm.setOption('mode', cm.getOption('mode'))
        }
      } else if (type === 'initFormulajs') {
        registerExcelFunctions(payload.keys)
      } else if (type === 'lineStart') {
        const { taskId, lineIndex } = payload || {}

        if (taskId === currentTaskId) {
          lastActiveLineIndex = lineIndex
        }
      } else if (type === 'calcError') {
        const { taskId } = payload || {}

        if (taskId === currentTaskId) {
          isCalculating = false
          clearCalcTimeouts()
          lastActiveLineIndex = -1

          hideTimeoutDialogAfterCalc()
        }
        console.error('Calculation worker returned error:', payload?.error)
      }
    }

    worker.onerror = (error) => {
      isCalculating = false
      clearCalcTimeouts()
      lastActiveLineIndex = -1
      hideTimeoutDialogAfterCalc()
      console.error('Calculation worker error:', error)
    }
  }

  return worker
}

/**
 * Apply results received asynchronously from the worker to CodeMirror and the DOM.
 * @param {string[]} answers The list of evaluated answer HTML strings.
 * @param {number[]} errorLines The 0-based line indices that produced errors.
 */
function applyCalculationResults(answers, errorLines) {
  const totalLines = cm.lineCount()
  const CLASS_LINE_ERROR = 'lineNoError'

  if (lastActivePage !== app.activePage) {
    lastActivePage = app.activePage
    lastErrorHandles = []
  }

  if (lastErrorHandles.length > 0 || errorLines.length > 0) {
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
  }

  const { foldedLines, folds } = getFoldedState()
  const hasLineWidget = app.settings.answerPosition === 'bottom'

  if (hasLineWidget) {
    for (let lineIndex = 0; lineIndex < totalLines; lineIndex++) {
      const lineHandle = cm.getLineHandle(lineIndex)
      const result = answers[lineIndex] || ''

      updateLineWidget(lineHandle, result, lineIndex, foldedLines.has(lineIndex))
    }
  } else {
    updateOutputDOM(answers)
  }

  syncOutputHeights()
  updateSelectionStats()

  // Update in-memory undo history, answers cache, and queue debounced page persistence
  if (app.activePage) {
    app.pageHistory.set(app.activePage, cm.getHistory())
    app.pageAnswers.set(app.activePage, answers)
    pendingPageSave = {
      pageId: app.activePage,
      data: cm.getValue(),
      folds,
      cursor: cm.getCursor()
    }
    debouncedSavePageState()
  }
}

/**
 * Displays a dialog warning the user that calculation is taking longer than expected.
 * @param {string[]} lines The array of lines being calculated.
 */
function showTimeoutDialog(lines) {
  lastDialogShowTime = Date.now()
  isDialogVisible = true
  clearAutoCloseTimeout()

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
    clearAutoCloseTimeout()

    if (isCalculating) {
      const timeoutDuration = (parseInt(app.settings.calcTimeout) || 10) * 1000

      hardCalcTimeout = setTimeout(() => showTimeoutDialog(lines), timeoutDuration)
    }
  }

  dom.calcTimeoutIgnore.onclick = () => {
    UIkit.modal('#dialogCalcTimeout').hide()

    isDialogVisible = false
    clearAutoCloseTimeout()
    clearCalcTimeouts()

    if (worker) {
      worker.terminate()
      worker = null
    }

    isCalculating = false

    if (stuckLineIndex !== -1 && stuckLineIndex < cm.lineCount()) {
      const lineText = cm.getLine(stuckLineIndex)

      if (lineText !== null && !lineText.trim().startsWith('//') && !lineText.trim().startsWith('#')) {
        cm.replaceRange('// ', { line: stuckLineIndex, ch: 0 })
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
 * Persists any pending page calculation state to local storage.
 */
function savePendingPageState() {
  if (!pendingPageSave) return

  const { pageId, data, folds, cursor } = pendingPageSave
  pendingPageSave = null

  const pages = store.get('pages')
  const page = pages?.find((p) => p.id === pageId)

  if (!page) return

  const foldsEqual =
    Array.isArray(page.folds) &&
    page.folds.length === folds.length &&
    page.folds.every((f, i) => f.from === folds[i].from && f.to === folds[i].to)

  const hadLegacyFields = 'history' in page || 'answers' in page

  if (page.data !== data || !foldsEqual || hadLegacyFields) {
    page.data = data
    delete page.history
    delete page.answers
    page.folds = folds
    page.cursor = cursor
    store.set('pages', pages)
    syncPageSaveDebounced(page.name, data)
  }
}

/**
 * Formats a calculation answer for display using application settings.
 * @param {*} answer The raw value to format.
 * @param {boolean} useGrouping Whether to use grouping/thousands separator.
 * @returns {string} The formatted answer string.
 */
export function formatAnswer(answer, useGrouping) {
  return coreFormatAnswer(answer, useGrouping, app.settings, app.currencies)
}

/**
 * Synchronizes currency state with background calculation helper state.
 */
export function refreshCurrencyState() {
  coreRefreshCurrencyState(app.currencies)
}

/**
 * Tells the background calculation worker to clear its evaluation cache.
 */
export function clearEvaluationCache() {
  const w = getWorker()

  w.postMessage({ type: 'clearCache' })
}

/**
 * Triggers asynchronous calculations in the background web worker.
 */
export function calculate() {
  if (app.refreshCM) cm.refresh()

  const cmValue = cm.getValue()
  const isEmpty = cmValue === ''

  dom.clearButton.setAttribute('disabled', isEmpty)
  dom.searchButton.setAttribute('disabled', isEmpty)
  dom.copyButton.setAttribute('disabled', isEmpty)
  dom.printButton.setAttribute('disabled', isEmpty)

  if (dom.exportPageButton) {
    dom.exportPageButton.setAttribute('disabled', isEmpty)
  }

  const lines = cmValue.split('\n')

  let sharedBuffer = null

  if (typeof SharedArrayBuffer !== 'undefined') {
    sharedBuffer = new SharedArrayBuffer(4)
    sharedArray = new Int32Array(sharedBuffer)
    sharedArray[0] = -1
  } else {
    sharedArray = null
  }

  isCalculating = true
  clearAutoCloseTimeout()

  currentTaskId++
  currentTaskPageId = app.activePage
  currentTaskDocValue = cmValue
  clearCalcTimeouts()

  const timeoutDuration = (parseInt(app.settings.calcTimeout) || 10) * 1000
  const slowDuration = Math.min(5000, timeoutDuration / 2)

  slowCalcTimeout = setTimeout(() => {
    notify('Calculations are running but taking longer than expected...', 'warning')
  }, slowDuration)

  hardCalcTimeout = setTimeout(() => {
    showTimeoutDialog(lines)
  }, timeoutDuration)

  const w = getWorker()
  const needsPages = cmValue.includes('page')
  const allPages = needsPages
    ? (store.get('pages') ?? []).map((p) => ({
        id: p.id,
        name: p.name,
        data: p.id === app.activePage ? cmValue : p.data
      }))
    : []

  w.postMessage({
    type: 'calculate',
    payload: {
      taskId: currentTaskId,
      activePage: app.activePage,
      lines,
      pages: allPages,
      settings: {
        ...app.settings,
        systemLocale: getSystemLocale()
      },
      currencies: app.currencies,
      udf: store.get('udf') ?? '',
      udu: store.get('udu') ?? '',
      sharedBuffer
    }
  })
}

export const debouncedSavePageState = debounce(savePendingPageState, 300)

const baseCancelPageState = debouncedSavePageState.cancel

debouncedSavePageState.cancel = function () {
  pendingPageSave = null
  baseCancelPageState.call(this)
}

debouncedSavePageState.flush = function () {
  baseCancelPageState.call(this)

  if (app.activePage && !app.loadingPage && typeof cm?.getValue === 'function') {
    const { folds } = getFoldedState()

    pendingPageSave = {
      pageId: app.activePage,
      data: cm.getValue(),
      folds,
      cursor: cm.getCursor()
    }
  }

  savePendingPageState()
}

window.addEventListener('beforeunload', () => {
  debouncedSavePageState.flush()
})
