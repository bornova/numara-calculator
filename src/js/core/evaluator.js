import * as formulajs from '@formulajs/formulajs'
import { DateTime, Settings } from 'luxon'
import { factory } from 'mathjs'
import nerdamer from 'nerdamer-prime'

Settings.defaultNumberingSystem = 'latn'
Settings.defaultOutputCalendar = 'iso8601'

import {
  CLASS_LINE_ERROR_LINK,
  isInternalScopeKey,
  PAGE_OBJECT_SYMBOL,
  REGEX_CONTINUATION,
  REGEX_CONVERSION_SUFFIX,
  REGEX_DATE_TERM,
  REGEX_DATE_TIME,
  REGEX_PCNT_OF,
  REGEX_PCNT_RATIO,
  REGEX_PLOT
} from './constants.js'
import {
  formatAnswer,
  formatAnswerHtml,
  formatErrorHtml,
  formatPageLinkHtml,
  formatPlotAnswerHtml,
  stripAnswer
} from './formatter.js'
import {
  app,
  currencySymbolsRegex,
  getDateFormatSettings,
  getFlexibleFormat,
  math,
  refreshCurrencyState,
  replaceCurrencySymbol
} from './mathInstance.js'
import { normalizeNumberInput, stripComments, stripLeadingColonLabel, transformOutsideStrings } from './preprocessor.js'
import { applyUdfuToMath, isPlainNamespaceObject } from './udfu.js'
import { findPageByRef, getSystemLocale } from './utils.js'

export { formatAnswer }
export const formulajsKeys = Object.keys(formulajs)

// Import Formula.js, Nerdamer, and Luxon DateTime into Math.js
math.import(factory('formulajs', [], () => formulajs))
math.import(factory('nerdamer', [], () => nerdamer))
math.import(factory('DateTime', [], () => DateTime))

const keywords = [
  { key: 'avg', regex: /\bavg\b/, fn: (stats) => math.mean(stats.runningTotal) },
  { key: 'subavg', regex: /\bsubavg\b/, fn: (stats) => math.mean(stats.runningSubtotal) },
  { key: 'total', regex: /\btotal\b/, fn: (stats) => math.sum(stats.runningTotal) },
  { key: 'subtotal', regex: /\bsubtotal\b/, fn: (stats) => math.sum(stats.runningSubtotal) }
]
const KEYWORDS_REGEX = new RegExp(`\\b(?:${keywords.map((kw) => kw.key).join('|')})\\b`)

const MAX_CACHE_SIZE = 1000
const compiledExpressions = new Map()
const pageScopeCache = new Map()
const loadingStack = new Set()

const udfuState = {
  previouslyImportedUDFs: [],
  previouslyCreatedUnits: []
}

/**
 * Checks whether a scope value can be mutated in place by expressions (e.g. `a[1] = 99`, `o.x = 99`).
 * @param {*} val Value to inspect.
 * @returns {boolean}
 */
function isMutableScopeValue(val) {
  if (!val || typeof val !== 'object') return false
  if (Array.isArray(val) || math.isMatrix(val)) return true
  if (val.constructor === Object && !val[PAGE_OBJECT_SYMBOL]) return true

  return false
}

/**
 * Deep-clones mutable scope values (`Matrix`, `Array`, plain `Object`) so in-place mutations
 * on subsequent lines do not corrupt cached `scopeDelta` snapshots.
 * @param {*} val Value to clone.
 * @returns {*}
 */
function cloneScopeValue(val) {
  if (!isMutableScopeValue(val)) return val

  try {
    return math.clone(val)
  } catch {
    return val
  }
}

/**
 * Map subclass that records per-line key modifications so the evaluation cache
 * can store compact per-line deltas instead of cloning the full scope on every line.
 */
class TrackedScope extends Map {
  constructor() {
    super()
    this.touched = new Set()
    this.deleted = new Set()
  }

  resetTracking() {
    this.touched.clear()
    this.deleted.clear()
  }

  get(key) {
    const val = super.get(key)

    if (isMutableScopeValue(val)) {
      this.touched.add(key)
    }

    return val
  }

  peek(key) {
    return super.get(key)
  }

  set(key, value) {
    this.touched.add(key)
    this.deleted.delete(key)
    return super.set(key, value)
  }

  setUntracked(key, value) {
    return super.set(key, value)
  }

  delete(key) {
    this.deleted.add(key)
    this.touched.delete(key)
    return super.delete(key)
  }

  deleteUntracked(key) {
    return super.delete(key)
  }
}

let evaluationCache = []
let lastActivePage = null
let lastSettingsSignature = ''
let lastPagesSignature = ''
let lastDateTimeSignature = ''
let lastAppliedUdf = null
let lastAppliedUdu = null
let currentPages = []
let activePageId = null

/**
 * Builds a deterministic signature of calculation-affecting settings only.
 * @param {object} settings Application settings.
 * @returns {string}
 */
function getCalcSettingsSignature(settings) {
  if (!settings) return ''

  return JSON.stringify({
    contPrevLine: settings.contPrevLine,
    copyThouSep: settings.copyThouSep,
    currency: settings.currency,
    dateDay: settings.dateDay,
    dateFormat: settings.dateFormat,
    expLower: settings.expLower,
    expUpper: settings.expUpper,
    lineErrors: settings.lineErrors,
    matrixType: settings.matrixType,
    notation: settings.notation,
    numberFormat: settings.numberFormat,
    numericOutput: settings.numericOutput,
    precision: settings.precision,
    predictable: settings.predictable,
    systemLocale: settings.systemLocale,
    thouSep: settings.thouSep
  })
}

/**
 * Retrieve a compiled Math.js expression. If the expression has not been
 * compiled before, compile it and store it in the cache.
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
 * Checks whether a value can participate in running totals and averages.
 * @param {*} value Evaluated answer value.
 * @returns {boolean}
 */
function isSummableValue(value) {
  return (
    (typeof value === 'number' && Number.isFinite(value)) ||
    Boolean(math.isBigNumber(value)) ||
    Boolean(math.isFraction(value)) ||
    Boolean(math.isUnit(value))
  )
}

const DATE_DIFF_CANDIDATE_REGEX =
  /\b\d{1,4}[/-]\d{1,2}[/-]\d{1,4}\b.*-.*(?:\b\d{1,4}[/-]\d{1,2}[/-]\d{1,4}\b|\b(?:today|now)\b)|\b(?:today|now)\b.*-.*\b\d{1,4}[/-]\d{1,2}[/-]\d{1,4}\b/i

/**
 * Resolves a date/time string or scope variable into a Luxon `DateTime` according to active date format settings.
 * @param {string} rawCandidate Date expression or variable name.
 * @returns {{ fmt: string, dt: DateTime, hasTime: boolean } | null}
 */
function resolveDateOperand(rawCandidate) {
  const candidate = rawCandidate ? rawCandidate.trim() : ''
  if (!candidate) return null

  const sysLocale = getSystemLocale(app.settings)
  const locales = sysLocale && sysLocale.toLowerCase() !== 'en-us' ? [sysLocale, 'en-US'] : ['en-US']
  const dateFormats = getDateFormatSettings()
  const flexToday = getFlexibleFormat(dateFormats.todayFormat)
  const flexTodayDay = getFlexibleFormat(dateFormats.todayDayFormat)
  const formats = [
    { parse: getFlexibleFormat(dateFormats.nowDayFormat), display: dateFormats.nowDayFormat, hasTime: true },
    { parse: getFlexibleFormat(dateFormats.nowFormat), display: dateFormats.nowFormat, hasTime: true },
    { parse: `${flexTodayDay} T`, display: `${dateFormats.todayDayFormat} T`, hasTime: true },
    { parse: `${flexToday} T`, display: `${dateFormats.todayFormat} T`, hasTime: true },
    { parse: flexTodayDay, display: dateFormats.todayDayFormat, hasTime: false },
    { parse: flexToday, display: dateFormats.todayFormat, hasTime: false }
  ]

  const matchDateFormats = (str) => {
    for (const loc of locales) {
      for (const fmt of formats) {
        const dt = DateTime.fromFormat(str, fmt.parse, { locale: loc })

        if (dt.isValid) {
          return { fmt: fmt.display, dt: dt.setLocale(sysLocale), hasTime: fmt.hasTime }
        }
      }
    }

    return null
  }

  let found = matchDateFormats(stripAnswer(candidate).trim())

  if (!found) {
    if (/^[a-zA-Z_\p{L}][\w\p{L}\p{M}]*$/u.test(candidate) && app.mathScope.has(candidate)) {
      const scopeVal = app.mathScope.peek(candidate)

      if (typeof scopeVal === 'string') {
        found = matchDateFormats(stripAnswer(scopeVal).trim())
      }
    } else {
      try {
        const evaluatedDate = math.evaluate(candidate, app.mathScope)

        if (typeof evaluatedDate === 'string') {
          found = matchDateFormats(stripAnswer(evaluatedDate).trim())
        }
      } catch {
        // Ignore evaluation errors for non-date expressions
      }
    }
  }

  return found
}

/**
 * Attempts to evaluate a date subtraction expression (`date1 - date2 [in/to unit]`) into a Math.js `Unit`.
 * @param {string} line Line expression (without leading label).
 * @returns {* | null} Evaluated Math.js `Unit`, or `null` if not a valid date difference.
 */
function tryEvaluateDateDiff(line) {
  let assignVar = null
  let expr = line.trim()

  const assignMatch = expr.match(/^([\p{L}\p{M}_][\p{L}\p{M}\w]*)\s*=\s*(.+)$/u)
  if (assignMatch) {
    assignVar = assignMatch[1]
    expr = assignMatch[2].trim()
  }

  let targetUnit = null
  const unitSuffixMatch = expr.match(/^(.+?)\s+\b(?:to|in)\s+([a-zA-Z]+)\s*$/i)
  if (unitSuffixMatch) {
    expr = unitSuffixMatch[1].trim()
    targetUnit = unitSuffixMatch[2]
  }

  if (REGEX_DATE_TIME.test(expr)) return null

  const splitMatch =
    expr.match(/^(.+?)\s+-\s+(.+)$/) || expr.match(/^(.+?)(?<!\b\d{4}|\b\d{4}-\d{1,2})-(?!\d{1,2}-\d{1,2}\b)(.+)$/)
  if (!splitMatch) return null

  const leftFound = resolveDateOperand(splitMatch[1])
  if (!leftFound) return null

  const rightFound = resolveDateOperand(splitMatch[2])
  if (!rightFound) return null

  const baseUnit = leftFound.hasTime || rightFound.hasTime ? 'hours' : 'days'
  const diffVal = leftFound.dt.diff(rightFound.dt, baseUnit)[baseUnit]
  let resultUnit = math.unit(diffVal, baseUnit)

  if (targetUnit) {
    resultUnit = resultUnit.to(targetUnit)
  }

  if (assignVar) {
    app.mathScope.set(assignVar, resultUnit)
  }

  return resultUnit
}

/**
 * Secondary evaluate method to try if compiled `math.evaluate` fails.
 * Supports labels, date/time arithmetic, totals, averages, and percentage operations.
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
      let isLabel = !app.mathScope.has(left) && /^[a-zA-Z_\p{L}][\w\p{L}\p{M}\s]*$/u.test(left)

      if (!isLabel) {
        try {
          isLabel = typeof math.evaluate(left) !== 'number'
        } catch {
          isLabel = true
        }
      }

      if (isLabel) {
        parsedLine = parsedLine.slice(colonIndex + 1)
      }
    }
  }

  // Temporarily bind keyword values (avg, subavg, total, subtotal) into scope
  // so expressions like `total^2` or `total * 2` preserve proper operator precedence and types.
  const savedKeywords = new Map()
  const injectedKeywords = []

  if (KEYWORDS_REGEX.test(parsedLine)) {
    for (const { key, regex, fn } of keywords) {
      if (regex.test(parsedLine)) {
        if (app.mathScope.has(key)) {
          savedKeywords.set(key, app.mathScope.peek(key))
        }

        let kwVal

        try {
          kwVal = fn(stats)
        } catch {
          kwVal = 'n/a'
        }

        app.mathScope.setUntracked(key, kwVal)
        injectedKeywords.push(key)
      }
    }
  }

  try {
    const dateDiffResult = tryEvaluateDateDiff(parsedLine)
    if (dateDiffResult !== null) {
      return dateDiffResult
    }

    // Handle date/time arithmetic.
    const dateMatch = REGEX_DATE_TIME.exec(parsedLine)

    if (dateMatch) {
      let assignPrefix = ''
      let datePart = parsedLine

      const assignMatch = parsedLine.match(/^([\p{L}\p{M}_][\p{L}\p{M}\w]*)\s*=\s*(.+)$/u)

      if (assignMatch) {
        assignPrefix = `${assignMatch[1]} = `
        datePart = assignMatch[2]
      }

      const partMatch = REGEX_DATE_TIME.exec(datePart)
      const rawLineDate = partMatch ? datePart.slice(0, partMatch.index).trim() : datePart.trim()
      const lineDateRight = partMatch ? datePart.slice(partMatch.index).trim() : ''

      const found = resolveDateOperand(rawLineDate)

      if (!found) return 'Invalid Date'

      const remaining = lineDateRight.replace(REGEX_DATE_TERM, '').trim()
      let updatedDt = found.dt

      if (!remaining) {
        let match
        REGEX_DATE_TERM.lastIndex = 0

        while ((match = REGEX_DATE_TERM.exec(lineDateRight)) !== null) {
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

    // Convert "% of" syntax to arithmetic outside string literals
    parsedLine = transformOutsideStrings(parsedLine, (segment) => segment.replaceAll(REGEX_PCNT_OF, '/100*'))

    return math.evaluate(parsedLine, app.mathScope)
  } finally {
    for (const key of injectedKeywords) {
      if (savedKeywords.has(key)) {
        app.mathScope.setUntracked(key, savedKeywords.get(key))
      } else {
        app.mathScope.deleteUntracked(key)
      }
    }
  }
}

/**
 * Checks whether a line references a built-in aggregation keyword (`avg`, `subavg`, `total`, `subtotal`)
 * that is not currently bound as a user variable in scope and is not being assigned on this line.
 * @param {string} line Line expression.
 * @param {Map} scope Active math scope.
 * @returns {boolean}
 */
function hasUnboundKeyword(line, scope) {
  if (!KEYWORDS_REGEX.test(line)) return false
  if (/^\s*(?:avg|subavg|total|subtotal)\s*=[^=]/.test(line)) return false

  for (const { key, regex } of keywords) {
    if (regex.test(line) && !scope.has(key)) {
      return true
    }
  }

  return false
}

/**
 * Evaluate a single line and return the HTML answer or error markup.
 * @param {string} line The line to evaluate.
 * @param {number} lineIndex The line index (0-based).
 * @param {Object} stats Object holding runningTotal and runningSubtotal.
 * @param {string} prevLineText The raw text of the previous line.
 * @returns {{ html: string, resetSubtotal: boolean, summableVal: * }}
 */
function evaluateLine(line, lineIndex, stats, prevLineText) {
  let answer, answerCopy, answerOut
  let resetSubtotal = false
  let summableVal = undefined

  try {
    // Strip leading text label (`label: expr`) before number normalization and evaluation
    line = stripLeadingColonLabel(line)

    // Pre-process number format and currency symbols
    line = normalizeNumberInput(line)

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
        const prevAns = app.mathScope.get('ans')
        const prevAnsStr = math.isFraction(prevAns) ? `(${prevAns.toFraction()})` : (prevAns ?? '')

        line = prevAnsStr + line
      }
    }

    // Handle base and percentage conversion suffixes (e.g. "255 in hex", "0.15 in %")
    // and natural percentage ratio syntax (e.g. "50 as % of 200", "30 is what % of 150")
    const convMatch = line.match(REGEX_CONVERSION_SUFFIX)
    let conversionTarget = convMatch ? convMatch[2].toLowerCase() : null

    if (convMatch) {
      line = convMatch[1]
    } else {
      const ratioMatch = line.match(REGEX_PCNT_RATIO)

      if (ratioMatch) {
        const assignPrefix = ratioMatch[1] ? `${ratioMatch[1]} = ` : ''
        line = `${assignPrefix}((${ratioMatch[2]}) / (${ratioMatch[3]}))`
        conversionTarget = '%'
      }
    }

    // Evaluate the expression. Route lines with unbound keywords or literal date differences directly to altEvaluate.
    if (hasUnboundKeyword(line, app.mathScope)) {
      answer = altEvaluate(line, stats)
    } else {
      if (DATE_DIFF_CANDIDATE_REGEX.test(line)) {
        const dateDiffResult = tryEvaluateDateDiff(line)

        if (dateDiffResult !== null) {
          answer = dateDiffResult
        }
      }

      if (answer === undefined) {
        try {
          const compiled = getCompiledExpression(line.trim())

          answer = compiled.evaluate(app.mathScope)
        } catch {
          answer = altEvaluate(line, stats)
        }
      }
    }

    // If the answer is empty/undefined/null, reset subtotal and return early.
    if (answer === undefined || answer === null || answer === '') {
      stats.runningSubtotal.length = 0
      resetSubtotal = true

      return { html: '', resetSubtotal, summableVal }
    }

    if (conversionTarget && conversionTarget !== '%') {
      answer = math[conversionTarget](typeof answer === 'bigint' ? math.bignumber(answer.toString()) : answer)
    }

    // Format the answer for display and copying.
    const displayValue = conversionTarget === '%' ? math.multiply(answer, 100) : answer
    const suffix = conversionTarget === '%' ? '%' : ''
    const outGrouping = Boolean(app.settings.thouSep)
    const copyGrouping = Boolean(outGrouping && app.settings.copyThouSep)

    answerOut = `${formatAnswer(displayValue, outGrouping)}${suffix}`
    answerCopy = copyGrouping === outGrouping ? answerOut : `${formatAnswer(displayValue, copyGrouping)}${suffix}`

    // Update the scope with the new answer.
    app.mathScope.set('_', answer)
    app.mathScope.set('ans', answer)
    app.mathScope.set(`line${lineIndex + 1}`, answer)

    // Update stats after evaluation (only summable numeric/unit values)
    if (!KEYWORDS_REGEX.test(line) && isSummableValue(answer)) {
      stats.runningTotal.push(answer)
      stats.runningSubtotal.push(answer)
      summableVal = answer
    }

    // Handle plotting lines.
    if (REGEX_PLOT.test(line) || REGEX_PLOT.test(answerOut)) {
      const plotAns = REGEX_PLOT.test(line) ? line : answerOut

      app.mathScope.set('ans', plotAns)
      app.mathScope.set(`line${lineIndex + 1}`, plotAns)

      return { html: formatPlotAnswerHtml(plotAns), resetSubtotal, summableVal }
    }

    // Handle page link lines
    if (answer && typeof answer === 'object' && answer[PAGE_OBJECT_SYMBOL]) {
      return { html: formatPageLinkHtml(answer, answerCopy, answerOut), resetSubtotal, summableVal }
    }

    return { html: formatAnswerHtml(answerCopy, answerOut), resetSubtotal, summableVal }
  } catch (error) {
    // Clear out stale 'ans', '_' and runningSubtotal on failure so downstream continuations don't use stale states
    app.mathScope.delete('ans')
    app.mathScope.delete('_')
    if (stats && stats.runningSubtotal) {
      stats.runningSubtotal.length = 0
      resetSubtotal = true
    }

    return { html: formatErrorHtml(error, app.settings.lineErrors), resetSubtotal, summableVal }
  }
}

/**
 * Loads and evaluates another page's scope to return its exported variables.
 * @param {string} pageName Name or ID of the page to load.
 * @returns {object} Object containing variables from the page.
 */
function loadPageScope(pageName) {
  if (pageName === undefined || pageName === null || typeof pageName !== 'string') {
    throw new TypeError('Page name must be a string')
  }

  const targetPage = findPageByRef(currentPages, pageName)

  if (!targetPage) {
    throw new Error(`Page "${pageName}" not found`)
  }

  if (targetPage.id === activePageId || loadingStack.has(targetPage.id)) {
    throw new Error(`Circular reference detected: "${targetPage.name || pageName}"`)
  }

  const cacheKey = targetPage.id

  if (pageScopeCache.has(cacheKey)) {
    return pageScopeCache.get(cacheKey)
  }

  const targetLines = (targetPage.data || '').split('\n')
  const savedScope = app.mathScope
  const localScope = new TrackedScope()

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

      evaluateLine(line, i, localStats, prevText)
      prevText = rawText
    }
  } finally {
    loadingStack.delete(targetPage.id)
    app.mathScope = savedScope
  }

  const result = {}

  for (const [key, val] of localScope.entries()) {
    if (!isInternalScopeKey(key)) {
      result[key] = val
    }
  }

  const varKeys = Object.keys(result)
  const varCount = varKeys.length
  const pageTitle = targetPage.name || pageName

  Object.defineProperties(result, {
    [PAGE_OBJECT_SYMBOL]: { value: true },
    _pageId: { value: targetPage.id },
    _pageVarCount: { value: varCount },
    _pageVarDetails: { value: varKeys.join(', ') },
    format: { value: () => pageTitle, writable: true, configurable: true },
    toString: { value: () => pageTitle, writable: true, configurable: true }
  })

  pageScopeCache.set(cacheKey, result)

  return result
}

// Register functional cross-page `page()` helper
math.import(
  {
    page: (name) => loadPageScope(name)
  },
  { override: true }
)

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
 * @returns {object} The answers, errorLines, serializedScope, scopeProperties, scopeTypes, and user defined lists.
 */
export function runCalculation({ activePage, lines, pages = [], settings, currencies, sharedBuffer, onLineStart }) {
  currentPages = pages
  activePageId = activePage
  loadingStack.clear()
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
  const settingsSignature = getCalcSettingsSignature(settings)
  const hasPageRef = lines.some((l) => l.includes('page'))
  const pagesSignature = hasPageRef
    ? (pages || [])
        .filter((p) => p && p.id !== activePage)
        .map((p) => `${p.id}:${p.name || ''}:${p.data || ''}`)
        .join('|')
    : lastPagesSignature

  const dateTime = DateTime.now().setLocale(getSystemLocale(settings))
  const dateFormats = getDateFormatSettings()
  const nowStr = dateTime.toFormat(app.settings.dateDay ? dateFormats.nowDayFormat : dateFormats.nowFormat)
  const todayStr = dateTime.toFormat(app.settings.dateDay ? dateFormats.todayDayFormat : dateFormats.todayFormat)
  const dateTimeSignature = `${nowStr}|${todayStr}`

  if (
    currenciesChanged ||
    lastActivePage !== activePage ||
    lastSettingsSignature !== settingsSignature ||
    lastPagesSignature !== pagesSignature
  ) {
    evaluationCache = []
    pageScopeCache.clear()

    if (lastSettingsSignature !== settingsSignature) {
      compiledExpressions.clear()
    }

    lastActivePage = activePage
    lastSettingsSignature = settingsSignature
    lastPagesSignature = pagesSignature
  } else if (!hasPageRef || lastDateTimeSignature !== dateTimeSignature) {
    pageScopeCache.clear()
  }

  lastDateTimeSignature = dateTimeSignature

  const trackedScope = new TrackedScope()

  app.mathScope = trackedScope

  const stats = {
    runningTotal: [],
    runningSubtotal: []
  }

  app.mathScope.set('now', nowStr)
  app.mathScope.set('today', todayStr)

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
      (lineIndex === 0 || evaluationCache[lineIndex - 1].rawText === prevLineText) &&
      (!cached.usesDateTimeVars || (cached.nowStr === nowStr && cached.todayStr === todayStr))
    ) {
      if (cached.hasError) {
        errorLines.push(lineIndex)
      }

      for (const delKey of cached.scopeDeleted) {
        trackedScope.delete(delKey)
      }

      for (const [k, v] of cached.scopeDelta) {
        trackedScope.set(k, cloneScopeValue(v))
      }

      if (cached.resetSubtotal) {
        stats.runningSubtotal.length = 0
      }

      if (cached.summableVal !== undefined) {
        stats.runningTotal.push(cached.summableVal)
        stats.runningSubtotal.push(cached.summableVal)
      }

      newCache.push(cached)
      answers.push(cached.result)
      prevLineText = rawText
      continue
    }

    canUseCache = false
    trackedScope.resetTracking()

    let resetSubtotal
    let summableVal = undefined

    if (line) {
      const evalOut = evaluateLine(line, lineIndex, stats, prevLineText)

      result = evalOut.html
      resetSubtotal = evalOut.resetSubtotal
      summableVal = evalOut.summableVal
    } else {
      stats.runningSubtotal.length = 0
      resetSubtotal = true
    }

    const hasError = result.includes(CLASS_LINE_ERROR_LINK)

    if (hasError) {
      errorLines.push(lineIndex)
    }

    const scopeDelta = []

    for (const k of trackedScope.touched) {
      if (trackedScope.has(k)) {
        scopeDelta.push([k, cloneScopeValue(trackedScope.peek(k))])
      }
    }

    const scopeDeleted = [...trackedScope.deleted].filter((k) => !trackedScope.has(k))
    const usesDateTimeVars = /\b(?:now|today|page)\b/.test(line)

    newCache.push({
      rawText,
      result,
      scopeDelta,
      scopeDeleted,
      resetSubtotal,
      summableVal,
      usesDateTimeVars,
      nowStr: usesDateTimeVars ? nowStr : undefined,
      todayStr: usesDateTimeVars ? todayStr : undefined,
      hasError
    })

    answers.push(result)
    prevLineText = rawText
  }

  evaluationCache = newCache

  // Convert app.mathScope Map to a serializable object of pre-formatted answers
  const serializedScope = {}
  const scopeProperties = {}
  const scopeTypes = {}
  const useGrouping = Boolean(app.settings.thouSep)
  const safeFormat = (val) => {
    try {
      return formatAnswer(val, useGrouping)
    } catch {
      try {
        return String(val)
      } catch {
        return ''
      }
    }
  }

  function serializeObjectProps(obj, name, filterPrivate = false) {
    const props = filterPrivate ? Object.keys(obj).filter((k) => !k.startsWith('_')) : Object.keys(obj)

    scopeProperties[name] = props

    for (const prop of props) {
      const propKey = `${name}.${prop}`
      const propVal = obj[prop]

      if (typeof propVal === 'function') {
        serializedScope[propKey] = 'Function'
        scopeTypes[propKey] = 'function'
      } else {
        serializedScope[propKey] = safeFormat(propVal)
      }
    }
  }

  for (const udfKey of app.udfList) {
    if (isPlainNamespaceObject(math[udfKey])) {
      scopeTypes[udfKey] = 'object'
      serializeObjectProps(math[udfKey], udfKey)
    }
  }

  for (const [key, value] of app.mathScope.entries()) {
    if (typeof value === 'function') {
      serializedScope[key] = 'Function'
      scopeTypes[key] = 'function'
    } else if (DateTime.isDateTime(value)) {
      scopeTypes[key] = 'datetime'
      serializedScope[key] = safeFormat(value)
    } else if (isPlainNamespaceObject(value)) {
      scopeTypes[key] = value[PAGE_OBJECT_SYMBOL] ? 'page' : 'object'
      serializeObjectProps(value, key, true)
      serializedScope[key] = safeFormat(value)
    } else {
      serializedScope[key] = safeFormat(value)
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
