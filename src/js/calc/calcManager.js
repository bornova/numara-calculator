import UIkit from 'uikit'

import { version } from '../../../package.json'

import { debounce, getSystemLocale } from '../core/utils.js'
import { dom } from '../dom.js'
import { registerExcelFunctions } from '../editor/hints.js'
import { cm } from '../editor/index.js'
import { app } from '../state/appState.js'
import { isMobile } from '../state/env.js'
import { events } from '../state/events.js'
import { store } from '../state/store.js'
import { notify } from '../ui/dialogs.js'
import { getFoldedState, syncOutputHeights, updateLineWidget, updateOutputDOM } from './outputRenderer.js'

const sharedBuffer = typeof SharedArrayBuffer !== 'undefined' ? new SharedArrayBuffer(4) : null
const sharedArray = sharedBuffer ? new Int32Array(sharedBuffer) : null

let worker = null
let currentTaskId = 0
let currentTaskPageId = null
let currentTaskDocValue = null
let lastErrorHandles = []
let lastActivePage = null
let slowCalcTimeout = null
let hardCalcTimeout = null
let lastActiveLineIndex = -1
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
 * Resets in-flight calculation flags, timers, and timeout dialog state.
 */
function finishCalcState() {
  isCalculating = false
  clearCalcTimeouts()
  lastActiveLineIndex = -1
  hideTimeoutDialogAfterCalc()
}

/**
 * Lazily spawns or retrieves the background Web Worker for calculation execution.
 * @returns {Worker} The spawned web worker instance.
 */
function getWorker() {
  if (!worker) {
    worker = new Worker(`js/calc.worker.js?v=${version}`)

    worker.onmessage = (event) => {
      const { type, payload } = event.data

      if (type === 'calcResult') {
        const { taskId, answers, errorLines, serializedScope, scopeProperties, scopeTypes, udfList, uduList } = payload

        if (taskId !== currentTaskId) return
        if (app.activePage !== currentTaskPageId || cm.getValue() !== currentTaskDocValue) return

        finishCalcState()

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
          finishCalcState()
        }
        console.error('Calculation worker returned error:', payload?.error)
      }
    }

    worker.onerror = (error) => {
      finishCalcState()
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
    cm.operation(() => {
      let lineIndex = 0

      cm.eachLine((lineHandle) => {
        updateLineWidget(lineHandle, answers[lineIndex] || '', lineIndex, foldedLines.has(lineIndex))
        lineIndex++
      })
    })
  } else {
    updateOutputDOM(answers)
  }

  syncOutputHeights(true, foldedLines)
  events.emit('calc:resultsApplied')

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
 * Queues a debounced persistence update for the active page's folded sections and cursor without recalculating.
 */
export function queueFoldStateSave() {
  if (!app.activePage || app.loadingPage) return

  const { foldedLines, folds } = getFoldedState()

  syncOutputHeights(true, foldedLines)
  pendingPageSave = {
    pageId: app.activePage,
    data: cm.getValue(),
    folds,
    cursor: cm.getCursor()
  }
  debouncedSavePageState()
}

/**
 * Displays a dialog warning the user that calculation is taking longer than expected.
 */
function showTimeoutDialog() {
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

      hardCalcTimeout = setTimeout(showTimeoutDialog, timeoutDuration)
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
 * Persists any pending page calculation state (content, folds, and cursor) to local storage.
 */
function savePendingPageState() {
  if (!pendingPageSave) return

  const { pageId, data, folds, cursor } = pendingPageSave
  pendingPageSave = null

  const pages = store.get('pages')
  const page = pages?.find((p) => p.id === pageId)

  if (!page) return

  const nextCursor = pageId === app.activePage && !app.loadingPage && cm ? cm.getCursor() : cursor

  const foldsEqual =
    Array.isArray(page.folds) &&
    page.folds.length === folds.length &&
    page.folds.every((f, i) => f.from === folds[i].from && f.to === folds[i].to)

  const dataChanged = page.data !== data
  const cursorChanged = page.cursor?.line !== nextCursor?.line || page.cursor?.ch !== nextCursor?.ch

  if (dataChanged || !foldsEqual || cursorChanged) {
    page.data = data
    page.folds = folds
    page.cursor = nextCursor
    store.set('pages', pages)

    if (dataChanged) {
      events.emit('page:contentSaved', page.name, data)
    }
  }
}

/**
 * Tells the background calculation worker to clear its evaluation cache if already spawned.
 */
export function clearEvaluationCache() {
  if (worker) {
    worker.postMessage({ type: 'clearCache' })
  }
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

  if (sharedArray) {
    sharedArray[0] = -1
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
    showTimeoutDialog()
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
        systemLocale: getSystemLocale(app.settings)
      },
      currencies: app.currencies,
      udf: store.get('udf') ?? '',
      udu: store.get('udu') ?? '',
      sharedBuffer
    }
  })
}

export const debouncedCalculate = debounce(calculate, 100)

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

/**
 * Subscribes calculation and persistence handlers to editor events and window unload.
 */
export function setupCalcManager() {
  events.on('editor:changes', (changes) => {
    if (isMobile) {
      calculate()
      return
    }

    const hasNewLine = changes.some((change) => change.text.length > 1 || change.removed?.length > 1)

    if (hasNewLine) {
      debouncedCalculate.cancel()
      calculate()
    } else {
      debouncedCalculate()
    }
  })

  events.on('editor:foldChanges', queueFoldStateSave)
  events.on('editor:update', () => syncOutputHeights(false))

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      debouncedSavePageState.flush()
    }
  })

  window.addEventListener('beforeunload', () => {
    debouncedSavePageState.flush()
  })
}
