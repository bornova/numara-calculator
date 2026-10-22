import { DateTime } from 'luxon'
import { factory } from 'mathjs'

import * as formulajs from '@formulajs/formulajs'
import nerdamer from 'nerdamer-prime'

import { applyUdfuToMath } from './udfu.js'

import {
  math,
  app,
  getAppLocale,
  getSystemLocale,
  localeUsesComma,
  getDateFormatSettings,
  getFlexibleFormat,
  getLocaleSeparators,
  currencySymbolsRegex,
  refreshCurrencyState,
  replaceCurrencySymbol,
  formatAnswer,
  escapeHTML,
  escapeRegExp
} from './mathInstance.js'

export { escapeHTML, escapeRegExp, formatAnswer }

// Import Formula.js and Nerdamer into MathJs
math.import(factory('formulajs', [], () => formulajs))
math.import(factory('nerdamer', [], () => nerdamer))
math.import(factory('DateTime', [], () => DateTime))

const REGEX_CONTINUATION = /[+\-*/]/
const REGEX_DATE_TIME =
  /[+-] * .*? *(millisecond|second|minute|hour|day|week|month|quarter|year|decade|century|centuries|millennium|millennia)s?/gi
const REGEX_PCNT_OF = /%[ ]*of[ ]*/g
const REGEX_PLOT = /^\s*[a-zA-Z_]\w*\s*\(\s*[a-zA-Z_]\w*\s*\)\s*=/
const REGEX_SPACE_GROUP_NUM = /\b\d{1,3}(?:[ \u00A0\u202F\u2009]\d{3})+(?:[.,]\d+)?\b/g
const REGEX_SPACE_CHARS = /[ \u00A0\u202F\u2009]/g
const REGEX_APOS_GROUP_NUM = /\b\d{1,3}(?:['\u2019]\d{3})+(?:[.,]\d+)?\b/g
const REGEX_APOS_CHARS = /['\u2019]/g

const CLASS_ANSWER = 'answer'
const CLASS_PLOT_BUTTON = 'plotButton answer'
const CLASS_LINE_ERROR_LINK = 'lineError'

const keywords = [
  { key: 'avg', regex: /\bavg\b/g, fn: (stats) => math.mean(stats.runningTotal) },
  { key: 'subavg', regex: /\bsubavg\b/g, fn: (stats) => math.mean(stats.runningSubtotal) },
  { key: 'total', regex: /\btotal\b/g, fn: (stats) => math.sum(stats.runningTotal) },
  { key: 'subtotal', regex: /\bsubtotal\b/g, fn: (stats) => math.sum(stats.runningSubtotal) }
]
const KEYWORDS_REGEX = new RegExp(`\\b(?:${keywords.map((kw) => kw.key).join('|')})\\b`)

// Cache for compiled expressions
const compiledExpressions = new Map()
const MAX_CACHE_SIZE = 1000

// Cache for line-by-line evaluation results and scope state
let evaluationCache = []
let lastActivePage = null
let lastSettingsSignature = ''
let lastPagesSignature = ''

/**
 * Clears the line-by-line calculation cache memory.
 */
export function clearEvaluationCache() {
  evaluationCache = []
  compiledExpressions.clear()
  pageScopeCache.clear()
  loadingStack.clear()
}

/**
 * Retrieve a compiled Math.js expression. If the expression has not been
 * compiled before, compile it and store it in the cache.
 *
 * @param {string} expr Expression string to compile.
 * @returns {Object} Compiled expression with an evaluate method.
 */
function getCompiledExpression(expr) {
  let compiled = compiledExpressions.get(expr)

  if (!compiled) {
    if (compiledExpressions.size >= MAX_CACHE_SIZE) {
      compiledExpressions.clear()
    }

    compiled = math.compile(expr)
    compiledExpressions.set(expr, compiled)
  }

  return compiled
}

/**
 * Helper to set a value in the mathScope.
 *
 * @param {string} key Name of the scope variable.
 * @param {*} value Value to set.
 */
function setScope(key, value) {
  app.mathScope.set(key, value)
}

/**
 * Evaluate a single line and return the answer.
 *
 * @param {string} line The line to evaluate.
 * @param {number} lineIndex The line index (0-based).
 * @param {object} lineHandle Deprecated.
 * @param {Object} stats Object holding runningTotal and runningSubtotal.
 * @param {string} prevLineText The raw text of the previous line.
 * @returns {string} The evaluated answer or an error link.
 */
function evaluateLine(line, lineIndex, lineHandle, stats, prevLineText) {
  let answer, answerCopy, answerOut

  try {
    // Pre‑process locale and currency symbols
    const usesComma = localeUsesComma()

    if (app.settings.thouSep !== 'disabled' && app.settings.inputLocale) {
      const locale = getAppLocale()
      const { group: groupSeparator } = getLocaleSeparators(locale)
      const isSpaceGroup =
        groupSeparator === ' ' ||
        groupSeparator === '\u00A0' ||
        groupSeparator === '\u202F' ||
        groupSeparator === '\u2009' ||
        groupSeparator.trim() === ''
      const isApostropheGroup = groupSeparator === "'" || groupSeparator === '\u2019'

      if (isSpaceGroup || isApostropheGroup) {
        const groupRegex = isSpaceGroup ? REGEX_SPACE_GROUP_NUM : REGEX_APOS_GROUP_NUM
        const charRegex = isSpaceGroup ? REGEX_SPACE_CHARS : REGEX_APOS_CHARS

        line = line.replace(groupRegex, (numToken) => {
          const stripped = numToken.replace(charRegex, '')

          return usesComma ? stripped.replace(/,/g, '.') : stripped
        })
      } else {
        // Match contiguous digit sequences with embedded commas/periods (ignoring isolated separators)
        line = line.replace(/\b\d+(?:[.,]\d+)+\b/g, (numToken) => {
          const commas = (numToken.match(/,/g) || []).length
          const periods = (numToken.match(/\./g) || []).length

          // Both commas and periods are present (e.g. 1.234,56 or 1,234.56)
          if (commas > 0 && periods > 0) {
            const lastComma = numToken.lastIndexOf(',')
            const lastPeriod = numToken.lastIndexOf('.')

            return lastComma > lastPeriod ? numToken.replace(/\./g, '').replace(/,/g, '.') : numToken.replace(/,/g, '')
          }

          // Only periods are present (e.g. 1.234.567 or 1.23 or 1.234)
          if (periods > 0 && commas === 0) {
            if (periods > 1) return numToken.replace(/\./g, '')

            const parts = numToken.split('.')

            if (parts[1].length === 3) {
              if (usesComma && /^0+$/.test(parts[0])) return numToken

              return usesComma ? numToken.replace(/\./g, '') : numToken
            }

            return numToken
          }

          // Only commas are present (e.g. 1,234,567 or 1,23 or 1,234)
          if (commas > 0 && periods === 0) {
            if (commas > 1) return numToken.replace(/,/g, '')

            const parts = numToken.split(',')

            if (parts[1].length === 3) {
              if (!usesComma && /^0+$/.test(parts[0])) return numToken.replace(/,/g, '.')

              return usesComma ? numToken.replace(/,/g, '.') : numToken.replace(/,/g, '')
            }

            return numToken.replace(/,/g, '.')
          }

          return numToken
        })
      }

      // Since arguments inside functions also use comma or semicolon depending on separator setting,
      // mapping semicolon to comma lets the parser interpret arguments uniformly (e.g., sum(1;3) -> sum(1,3))
      line = line.replace(/;/g, ',')
    }

    if (app.settings.currency && currencySymbolsRegex) {
      line = line.replace(currencySymbolsRegex, (match, num, symbol) => {
        if (num) return num

        return replaceCurrencySymbol(symbol)
      })
    }

    // Handle line continuation
    if (lineIndex > 0 && REGEX_CONTINUATION.test(line.charAt(0)) && app.settings.contPrevLine) {
      const prevClean = prevLineText ? stripComments(prevLineText.trim()) : ''

      if (prevClean.length > 0) {
        line = (app.mathScope.get('ans') ?? '') + line
      }
    }

    // Evaluate the expression. Try compiled evaluation first. Fall back to altEvaluate if compilation fails.
    try {
      const expr = line.trim()
      const compiled = getCompiledExpression(expr)

      answer = compiled.evaluate(app.mathScope)
    } catch {
      answer = altEvaluate(line, stats)
    }

    // If the answer is empty/undefined/null, reset subtotal and return early.
    if (answer === undefined || answer === null || answer === '') {
      // Reset running subtotal when encountering an empty answer.
      stats.runningSubtotal.length = 0

      return ''
    }

    // Update the scope with the new answer. Use both Map and property for compatibility.
    setScope('_', answer)
    setScope('ans', answer)
    setScope(`line${lineIndex + 1}`, answer)

    // Update stats after evaluation
    if (!KEYWORDS_REGEX.test(line)) {
      stats.runningTotal.push(answer)
      stats.runningSubtotal.push(answer)
    }

    // Format the answer for display and copying.
    answerCopy = formatAnswer(answer, app.settings.thouSep !== 'disabled' && app.settings.copyThouSep)
    answerOut = formatAnswer(answer, app.settings.thouSep !== 'disabled')

    // Handle plotting lines.
    if (REGEX_PLOT.test(line) || REGEX_PLOT.test(answerOut)) {
      const plotAns = REGEX_PLOT.test(line) ? line : answerOut

      setScope('ans', plotAns)
      setScope(`line${lineIndex + 1}`, plotAns)

      // Instead of dom.icons, we return a simple icon placeholder which has ChartSpline icon SVG contents hardcoded
      const chartSplineIcon = `
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chart-spline">
          <path d="M3 3v16a2 2 0 0 0 2 2h16"/>
          <path d="M7 16c.5-2 1.5-6 4-6 2.5 0 3 3 5.5 3 2.5 0 3.5-3 4-4"/>
        </svg>
      `

      return `<a
        class="${CLASS_PLOT_BUTTON}"
        data-plot="${escapeHTML(plotAns)}"
        uk-tooltip="title: Plot; pos: right">
          ${chartSplineIcon}
        </a>`
    }

    // Handle page link lines
    if (answer && typeof answer === 'object' && answer._pageId) {
      const pageId = answer._pageId
      const pageVarCount = answer._pageVarCount ?? 0
      const pageVarDetails = answer._pageVarDetails || ''
      const varText = `${pageVarCount} ${pageVarCount === 1 ? 'variable' : 'variables'}`
      const tooltipText = pageVarDetails ? `${varText} (${pageVarDetails})` : varText

      return `<a
        class="pageLink ${CLASS_ANSWER}"
        data-page-id="${escapeHTML(pageId)}"
        data-answer="${escapeHTML(answerCopy)}"
        title="${escapeHTML(tooltipText)}"
        uk-tooltip>
          ${escapeHTML(answerOut)}
        </a>`
    }

    return `<span class="${CLASS_ANSWER}" data-answer="${escapeHTML(answerCopy)}">${escapeHTML(answerOut)}</span>`
  } catch (error) {
    // Clear out stale 'ans', '_' and runningSubtotal on failure so downstream continuations don't use stale states
    app.mathScope.delete('ans')
    app.mathScope.delete('_')
    if (stats && stats.runningSubtotal) {
      stats.runningSubtotal.length = 0
    }

    const errorMessage = escapeHTML(String(error))
    const errorLink = app.settings.lineErrors ? 'Error' : ''

    return `<a class="${CLASS_LINE_ERROR_LINK}" data-error="${errorMessage}">${errorLink}</a>`
  }
}

/**
 * Secondary evaluate method to try if math.evaluate fails. This function
 * supports features such as date/time arithmetic, totals, averages, percentage operations, etc.
 *
 * @param {string} line The line to evaluate.
 * @param {Object} stats Object holding runningTotal and runningSubtotal.
 * @returns {*} The evaluated result.
 */
function altEvaluate(line, stats) {
  let parsedLine = line

  const colonIndex = parsedLine.search(/:(?!\d)/)

  if (colonIndex !== -1 && !parsedLine.trim().startsWith('{')) {
    const left = parsedLine.slice(0, colonIndex).trim()

    if (!left.includes('?') && !left.includes('"') && !left.includes("'")) {
      try {
        if (!app.mathScope.has(left) && /^[a-zA-Z_\p{L}][\w\p{L}\p{M}\s]*$/u.test(left)) {
          throw new Error('label')
        }

        const val = math.evaluate(left)

        if (typeof val !== 'number') {
          throw new Error('label')
        }
      } catch {
        parsedLine = parsedLine.slice(colonIndex + 1)
      }
    }
  }

  // Handle variable assignments inside altEvaluate
  // Avoid replacing the variable name on the left-hand side of assignments (e.g. x = x + 1)
  const assignmentMatch = parsedLine.match(/^(\s*[\p{L}_][\p{L}\p{M}\w]*\s*=)([^=].*|)$/u)
  if (
    assignmentMatch &&
    !parsedLine.includes('==') &&
    !parsedLine.includes('!=') &&
    !parsedLine.includes('<=') &&
    !parsedLine.includes('>=')
  ) {
    const assignVar = assignmentMatch[1]
    let exprPart = assignmentMatch[2]

    exprPart = exprPart.replace(/(?:[\p{L}_][\p{L}\p{M}\w]*)/gu, (match) =>
      app.mathScope.has(match) ? app.mathScope.get(match) : match
    )

    parsedLine = assignVar + exprPart
  } else {
    parsedLine = parsedLine.replace(/(?:[\p{L}_][\p{L}\p{M}\w]*)/gu, (match) =>
      app.mathScope.has(match) ? app.mathScope.get(match) : match
    )
  }

  // Calculate and return avg, subavg, total and subtotal values.
  if (KEYWORDS_REGEX.test(parsedLine)) {
    for (const { regex, fn } of keywords) {
      parsedLine = parsedLine.replace(regex, () => {
        try {
          return fn(stats)
        } catch {
          return '"n/a"'
        }
      })
    }
  }

  // Handle date/time arithmetic.
  if (parsedLine.match(REGEX_DATE_TIME)) {
    const locale = { locale: getSystemLocale() }

    let assignPrefix = ''
    let datePart = parsedLine

    const assignMatch = parsedLine.match(/^([\p{L}\p{M}_][\p{L}\p{M}\w]*)\s*=\s*(.+)$/u)

    if (assignMatch) {
      assignPrefix = `${assignMatch[1]} = `
      datePart = assignMatch[2]
    }

    const lineDate = datePart.replace(REGEX_DATE_TIME, '').trim()
    const lineDateRight = datePart.replace(lineDate, '').trim()

    // Lazily evaluate date formats to avoid redundant parsing operations
    const dateFormats = getDateFormatSettings()
    const flexToday = getFlexibleFormat(dateFormats.todayFormat)
    const flexTodayDay = getFlexibleFormat(dateFormats.todayDayFormat)
    const formats = [
      { parse: getFlexibleFormat(dateFormats.nowDayFormat), display: dateFormats.nowDayFormat },
      { parse: getFlexibleFormat(dateFormats.nowFormat), display: dateFormats.nowFormat },
      { parse: `${flexTodayDay} T`, display: `${dateFormats.todayDayFormat} T` },
      { parse: `${flexToday} T`, display: `${dateFormats.todayFormat} T` },
      { parse: flexTodayDay, display: dateFormats.todayDayFormat },
      { parse: flexToday, display: dateFormats.todayFormat }
    ]

    if (app.settings.dateFormat && app.settings.dateFormat !== 'system') {
      formats.push(
        { parse: 'ccc, D t', display: 'ccc, D t' },
        { parse: 'D t', display: 'D t' },
        { parse: 'ccc, D', display: 'ccc, D' },
        { parse: 'D', display: 'D' }
      )
    }

    let found = null

    for (const fmt of formats) {
      const dt = DateTime.fromFormat(lineDate, fmt.parse, locale)

      if (dt.isValid) {
        found = { fmt: fmt.display, dt }
        break
      }
    }

    if (!found) return 'Invalid Date'

    const termRegex =
      /([+-])\s*(.*?)\s*(millisecond|second|minute|hour|day|week|month|quarter|year|decade|century|centuries|millennium|millennia)s?\b/gi
    const remaining = lineDateRight.replace(termRegex, '').trim()
    let updatedDt = found.dt

    if (!remaining) {
      let match
      termRegex.lastIndex = 0

      while ((match = termRegex.exec(lineDateRight)) !== null) {
        const sign = match[1] === '-' ? -1 : 1
        const exprStr = match[2].trim() || '1'
        const rawUnit = match[3].toLowerCase()
        const amount = Number(math.evaluate(exprStr, app.mathScope)) * sign

        if (!Number.isFinite(amount)) {
          throw new Error('Invalid date duration')
        }

        if (rawUnit === 'decade') {
          updatedDt = updatedDt.plus({ years: amount * 10 })
        } else if (rawUnit === 'century' || rawUnit === 'centuries') {
          updatedDt = updatedDt.plus({ years: amount * 100 })
        } else if (rawUnit === 'millennium' || rawUnit === 'millennia') {
          updatedDt = updatedDt.plus({ years: amount * 1000 })
        } else {
          updatedDt = updatedDt.plus({ [rawUnit + 's']: amount })
        }
      }
    } else {
      const rightOfDate = String(math.evaluate(lineDateRight + ' to hours', app.mathScope))
      const durHrs = Number(rightOfDate.split(' ')[0])

      updatedDt = updatedDt.plus({ hours: durHrs })
    }

    let outputFmt = found.fmt

    if (app.settings.dateDay && !outputFmt.includes('ccc')) {
      outputFmt = 'ccc, ' + outputFmt
    }

    const dtLine = updatedDt.toFormat(outputFmt)

    parsedLine = `${assignPrefix}"${dtLine}"`
  }

  // Convert "% of" syntax to arithmetic
  parsedLine = parsedLine.replaceAll(REGEX_PCNT_OF, '/100*')

  return math.evaluate(parsedLine, app.mathScope)
}

/**
 * Strip comments from a line.
 *
 * @param {string} line The line to strip comments from.
 * @returns {string} The line without comments.
 */
function stripComments(line) {
  return line.replace(
    /("(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'|`(?:\\[\s\S]|[^`\\])*`)|(\/\/.*|#.*)/g,
    (match, stringVal, commentVal) => {
      return commentVal ? '' : match
    }
  )
}

const udfuState = {
  previouslyImportedUDFs: [],
  previouslyCreatedUnits: []
}
let lastAppliedUdf = null
let lastAppliedUdu = null

/**
 * Imports and applies user-defined functions or units into the MathJS context.
 * @param {boolean} isFunc True if parsing functions, false if units.
 * @param {string} input The raw definition string content.
 */
export function applyUdfu(isFunc, input) {
  if (isFunc && lastAppliedUdf === input) return
  if (!isFunc && lastAppliedUdu === input) return

  clearEvaluationCache()

  try {
    const keys = applyUdfuToMath(math, input, isFunc, udfuState, {
      luxon: DateTime,
      nerdamer,
      formulajs
    })

    if (isFunc) {
      app.udfList = keys
      lastAppliedUdf = input
    } else {
      app.uduList = keys
      lastAppliedUdu = input
    }
  } catch (error) {
    console.error('applyUdfu Error:', error)
  }
}

let currentPages = []
let activePageId = null

const pageScopeCache = new Map()
const loadingStack = new Set()

/**
 * Loads and evaluates another page's scope to return its exported variables.
 * @param {string} pageName Name or ID of the page to load.
 * @returns {object} Object containing variables from the page.
 */
function loadPageScope(pageName) {
  if (pageName === undefined || pageName === null || typeof pageName !== 'string') {
    throw new TypeError('Page name must be a string')
  }

  const query = pageName
    .trim()
    .toLowerCase()
    .replace(/\.num$/, '')

  const targetPage = currentPages.find((p) => {
    if (!p) return false

    const name = (p.name || '')
      .trim()
      .toLowerCase()
      .replace(/\.num$/, '')

    return name === query || p.id === pageName
  })

  if (!targetPage) {
    throw new Error(`Page "${pageName}" not found`)
  }

  if (targetPage.id === activePageId || loadingStack.has(targetPage.id)) {
    throw new Error(`Circular reference detected: "${targetPage.name || pageName}"`)
  }

  const cacheKey = `${targetPage.id}:${targetPage.data || ''}`

  if (pageScopeCache.has(cacheKey)) {
    return pageScopeCache.get(cacheKey)
  }

  const targetLines = (targetPage.data || '').split('\n')
  const savedScope = app.mathScope
  const localScope = new Map()

  app.mathScope = localScope

  if (savedScope.has('now')) localScope.set('now', savedScope.get('now'))
  if (savedScope.has('today')) localScope.set('today', savedScope.get('today'))

  const localStats = {
    runningTotal: [],
    runningSubtotal: []
  }

  try {
    loadingStack.add(targetPage.id)
    let prevText = ''

    for (let i = 0; i < targetLines.length; i++) {
      const rawText = targetLines[i]
      const line = stripComments(rawText.trim())

      if (!line) {
        localStats.runningSubtotal.length = 0
        prevText = ''
        continue
      }

      evaluateLine(line, i, null, localStats, prevText)
      prevText = rawText
    }
  } finally {
    loadingStack.delete(targetPage.id)
    app.mathScope = savedScope
  }

  const result = {}

  for (const [key, val] of localScope.entries()) {
    if (!/^line\d+$/.test(key) && key !== '_' && key !== 'ans' && key !== 'now' && key !== 'today') {
      result[key] = val
    }
  }

  const varKeys = Object.keys(result)
  const varCount = varKeys.length
  const pageTitle = targetPage.name || pageName
  const displayName = pageTitle

  Object.defineProperty(result, '_pageId', {
    value: targetPage.id,
    enumerable: false
  })

  Object.defineProperty(result, '_pageName', {
    value: pageTitle,
    enumerable: false
  })

  Object.defineProperty(result, '_pageVarCount', {
    value: varCount,
    enumerable: false
  })

  Object.defineProperty(result, '_pageVarDetails', {
    value: varKeys.join(', '),
    enumerable: false
  })

  Object.defineProperty(result, 'format', {
    value: () => displayName,
    enumerable: false,
    writable: true,
    configurable: true
  })

  Object.defineProperty(result, 'toString', {
    value: () => displayName,
    enumerable: false,
    writable: true,
    configurable: true
  })

  pageScopeCache.set(cacheKey, result)

  return result
}

// Register functional page cross-page function
math.import(
  {
    page: (name) => loadPageScope(name)
  },
  { override: true }
)

/**
 * Perform all calculation operations line-by-line.
 * @param {object} params Calculation parameters.
 * @param {string} params.activePage The active page ID.
 * @param {string[]} params.lines The array of lines to evaluate.
 * @param {object[]} [params.pages=[]] The full list of workbook pages.
 * @param {object} params.settings The application settings.
 * @param {object} params.currencies The application currencies config map.
 * @param {SharedArrayBuffer} [params.sharedBuffer] Shared buffer to communicate progress back to main thread.
 * @param {function} [params.onLineStart] Progress callback fired when starting to process a line.
 * @returns {object} The answers, errorLines, serializedScope, and user defined lists.
 */
export function runCalculation({ activePage, lines, pages = [], settings, currencies, sharedBuffer, onLineStart }) {
  currentPages = pages
  activePageId = activePage
  loadingStack.clear()
  pageScopeCache.clear()
  app.settings = settings
  app.currencies = currencies

  const sharedArray = sharedBuffer ? new Int32Array(sharedBuffer) : null

  // Configure background math instance according to settings
  try {
    math.config({
      matrix: settings.matrixType || 'Matrix',
      number: settings.numericOutput || 'number',
      predictable: settings.predictable || false
    })
  } catch {
    // Ignore config adjustment error
  }

  const currenciesChanged = refreshCurrencyState()
  const settingsSignature = JSON.stringify(settings || {})
  const pagesSignature = (pages || [])
    .filter((p) => p && p.id !== activePage)
    .map((p) => `${p.id}:${p.name || ''}:${p.data || ''}`)
    .join('|')

  if (
    currenciesChanged ||
    lastActivePage !== activePage ||
    lastSettingsSignature !== settingsSignature ||
    lastPagesSignature !== pagesSignature
  ) {
    evaluationCache = []

    if (lastSettingsSignature !== settingsSignature) {
      compiledExpressions.clear()
    }

    lastActivePage = activePage
    lastSettingsSignature = settingsSignature
    lastPagesSignature = pagesSignature
  }

  const dateTime = DateTime.now().setLocale(getSystemLocale())

  app.mathScope = new Map()

  const stats = {
    runningTotal: [],
    runningSubtotal: []
  }

  const dateFormats = getDateFormatSettings()

  setScope('now', dateTime.toFormat(app.settings.dateDay ? dateFormats.nowDayFormat : dateFormats.nowFormat))
  setScope('today', dateTime.toFormat(app.settings.dateDay ? dateFormats.todayDayFormat : dateFormats.todayFormat))

  const totalLines = lines.length
  const newCache = []
  const answers = []
  const errorLines = []
  let canUseCache = true
  let prevLineText = ''

  for (let lineIndex = 0; lineIndex < totalLines; lineIndex++) {
    if (sharedArray) {
      sharedArray[0] = lineIndex
    }

    if (typeof onLineStart === 'function') {
      onLineStart(lineIndex)
    }

    const rawText = lines[lineIndex]
    const line = stripComments(rawText.trim())

    let result = ''

    const cached = evaluationCache[lineIndex]

    if (
      canUseCache &&
      cached &&
      cached.rawText === rawText &&
      (lineIndex === 0 || evaluationCache[lineIndex - 1].rawText === prevLineText)
    ) {
      if (cached.hasError) {
        errorLines.push(lineIndex)
      }

      newCache.push(cached)
      answers.push(cached.result)
      prevLineText = rawText
      continue
    }

    if (canUseCache) {
      canUseCache = false

      if (lineIndex > 0) {
        const prevCached = evaluationCache[lineIndex - 1]
        app.mathScope = new Map(prevCached.mathScope)
        stats.runningTotal = [...prevCached.stats.runningTotal]
        stats.runningSubtotal = [...prevCached.stats.runningSubtotal]
      }
    }

    if (line) {
      result = evaluateLine(line, lineIndex, null, stats, prevLineText)
    } else {
      stats.runningSubtotal.length = 0
    }

    const hasError = result.includes(CLASS_LINE_ERROR_LINK)

    if (hasError) {
      errorLines.push(lineIndex)
    }

    newCache.push({
      rawText,
      result,
      mathScope: new Map(app.mathScope),
      stats: {
        runningTotal: [...stats.runningTotal],
        runningSubtotal: [...stats.runningSubtotal]
      },
      hasError
    })

    answers.push(result)
    prevLineText = rawText
  }

  if (canUseCache && totalLines > 0) {
    app.mathScope = new Map(evaluationCache[totalLines - 1].mathScope)
  }

  evaluationCache = newCache

  // Convert app.mathScope Map to a serializable object of pre‑formatted answers
  const serializedScope = {}
  const scopeProperties = {}
  const scopeTypes = {}

  for (const udfKey of app.udfList) {
    if (math[udfKey] && typeof math[udfKey] === 'object' && !Array.isArray(math[udfKey])) {
      scopeProperties[udfKey] = Object.keys(math[udfKey])
      scopeTypes[udfKey] = 'object'
    }
  }

  for (const [key, value] of app.mathScope.entries()) {
    if (typeof value === 'function') {
      serializedScope[key] = 'Function'
      scopeTypes[key] = 'function'
    } else if (DateTime.isDateTime(value)) {
      scopeTypes[key] = 'datetime'
      try {
        serializedScope[key] = formatAnswer(value, app.settings.thouSep !== 'disabled')
      } catch {
        serializedScope[key] = String(value)
      }
    } else if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof math.Unit)) {
      scopeTypes[key] = value._pageId ? 'page' : 'object'
      scopeProperties[key] = Object.keys(value).filter((k) => !k.startsWith('_'))
      try {
        serializedScope[key] = formatAnswer(value, app.settings.thouSep !== 'disabled')
      } catch {
        serializedScope[key] = String(value)
      }
    } else {
      try {
        serializedScope[key] = formatAnswer(value, app.settings.thouSep !== 'disabled')
      } catch {
        serializedScope[key] = String(value)
      }
    }
  }

  return {
    answers,
    errorLines,
    serializedScope,
    scopeProperties,
    scopeTypes,
    udfList: app.udfList,
    uduList: app.uduList
  }
}
