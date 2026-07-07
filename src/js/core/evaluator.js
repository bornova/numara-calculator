import { DateTime } from 'luxon'
import { factory } from 'mathjs'

import * as formulajs from '@formulajs/formulajs'
import nerdamer from 'nerdamer-prime/all.js'

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

const CLASS_ANSWER = 'answer'
const CLASS_PLOT_BUTTON = 'plotButton answer'
const CLASS_LINE_ERROR_LINK = 'lineError'

const keywords = [
  { key: 'avg', fn: (stats) => math.mean(stats.runningTotal) },
  { key: 'subavg', fn: (stats) => math.mean(stats.runningSubtotal) },
  { key: 'total', fn: (stats) => math.sum(stats.runningTotal) },
  { key: 'subtotal', fn: (stats) => math.sum(stats.runningSubtotal) }
]

// Cache for compiled expressions
const compiledExpressions = new Map()
const MAX_CACHE_SIZE = 1000

// Cache for line-by-line evaluation results and scope state
let evaluationCache = []
let lastActivePage = null

/**
 * Clears the line-by-line calculation cache memory.
 */
export function clearEvaluationCache() {
  evaluationCache = []
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
        const sepChars = isSpaceGroup ? ' \u00A0\u202F\u2009' : "'\u2019"
        const regex = new RegExp(`\\b\\d{1,3}(?:[${sepChars}]\\d{3})+(?:[.,]\\d+)?\\b`, 'g')

        line = line.replace(regex, (numToken) => {
          const stripped = numToken.replace(new RegExp(`[${sepChars}]`, 'g'), '')

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
    } else if (usesComma) {
      // inputLocale is false, but the locale uses comma as decimal separator.
      // So commas must be parsed as decimals, and periods should not be treated as decimals (cause error).
      line = line.replace(/\b\d+(?:[.,]\d+)+\b/g, (numToken) => {
        const commas = (numToken.match(/,/g) || []).length
        const periods = (numToken.match(/\./g) || []).length

        if (commas === 1 && periods === 0) return numToken.replace(/,/g, '.')

        return numToken.replace(/[.,]/g, ' ')
      })
    }

    if (app.settings.currency && currencySymbolsRegex) {
      line = line.replace(currencySymbolsRegex, (match, num, symbol) => {
        if (num) return num

        return replaceCurrencySymbol(symbol)
      })
    }

    // Handle line continuation
    if (lineIndex > 0 && REGEX_CONTINUATION.test(line.charAt(0)) && app.settings.contPrevLine) {
      if (prevLineText && prevLineText.length > 0) {
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
    if (!keywords.some((kw) => line.includes(kw.key))) {
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

  if (parsedLine.includes(':')) {
    const left = parsedLine.split(':')[0].trim()

    try {
      const val = math.evaluate(left)

      if (typeof val === 'function') {
        throw new Error('function')
      }
    } catch {
      parsedLine = parsedLine.substring(parsedLine.indexOf(':') + 1)
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
  for (const { key, fn } of keywords) {
    const regex = new RegExp(`\\b${key}\\b`, 'g')

    try {
      parsedLine = parsedLine.replace(regex, fn(stats))
    } catch {
      parsedLine = parsedLine.replace(regex, '"n/a"')
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
    const formats = [
      { parse: getFlexibleFormat(dateFormats.nowDayFormat), display: dateFormats.nowDayFormat },
      { parse: getFlexibleFormat(dateFormats.nowFormat), display: dateFormats.nowFormat },
      { parse: getFlexibleFormat(dateFormats.todayDayFormat), display: dateFormats.todayDayFormat },
      { parse: getFlexibleFormat(dateFormats.todayFormat), display: dateFormats.todayFormat }
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

    const rightOfDate = String(math.evaluate(lineDateRight + ' to hours', app.mathScope))
    const durHrs = Number(rightOfDate.split(' ')[0])

    let outputFmt = found.fmt

    if (app.settings.dateDay && !outputFmt.includes('ccc')) {
      outputFmt = 'ccc, ' + outputFmt
    }

    const dtLine = found.dt.plus({ hours: durHrs }).toFormat(outputFmt)

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

let previouslyImportedUDFs = []
let previouslyCreatedUnits = []
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
    const UDFunc = new Function('math', 'luxon', 'nerdamer', 'formulajs', `'use strict'; return {${input}}`)
    const udfObj = UDFunc(math, DateTime, nerdamer, formulajs)

    if (udfObj === null || typeof udfObj !== 'object' || Array.isArray(udfObj)) {
      throw new TypeError('User defined input must resolve to an object.')
    }

    if (isFunc) {
      previouslyImportedUDFs.forEach((key) => {
        delete math[key]

        if (math.expression?.mathWithTransform) {
          delete math.expression.mathWithTransform[key]
        }
      })

      math.import(udfObj, { override: true })
      previouslyImportedUDFs = Object.keys(udfObj)
      app.udfList = Object.keys(udfObj)
      lastAppliedUdf = input
    } else {
      previouslyCreatedUnits.forEach((unitName) => {
        if (math.Unit?.UNITS) {
          delete math.Unit.UNITS[unitName]
        }

        delete math[unitName]

        if (math.expression?.mathWithTransform) {
          delete math.expression.mathWithTransform[unitName]
        }
      })

      math.createUnit(udfObj, { override: true })
      previouslyCreatedUnits = Object.keys(udfObj)
      app.uduList = Object.keys(udfObj)
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
 * @param {object} params.settings The application settings.
 * @param {object} params.currencies The application currencies config map.
 * @param {SharedArrayBuffer} [params.sharedBuffer] Shared buffer to communicate progress back to main thread.
 * @param {number[]} [params.timedOutLines=[]] Array of line indices that timed out previously.
 * @param {function} [params.onLineStart] Progress callback fired when starting to process a line.
 * @returns {object} The answers, errorLines, serializedScope, and user defined lists.
 */
export function runCalculation({
  activePage,
  lines,
  settings,
  currencies,
  sharedBuffer,
  timedOutLines = [],
  onLineStart
}) {
  app.settings = settings
  app.currencies = currencies

  const sharedArray = sharedBuffer ? new Int32Array(sharedBuffer) : null
  const timedOutSet = new Set(timedOutLines)

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

  refreshCurrencyState()

  if (lastActivePage !== activePage) {
    evaluationCache = []
    lastActivePage = activePage
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

    if (timedOutSet.has(lineIndex)) {
      const errorMessage = 'Timeout (Took too long)'
      const errorLink = app.settings.lineErrors ? 'Timeout' : ''

      result = `<a class="${CLASS_LINE_ERROR_LINK}" data-error="${errorMessage}">${errorLink}</a>`
      stats.runningSubtotal.length = 0
    } else {
      const cached = evaluationCache[lineIndex]

      if (
        canUseCache &&
        cached &&
        cached.rawText === rawText &&
        (lineIndex === 0 || evaluationCache[lineIndex - 1].rawText === prevLineText)
      ) {
        result = cached.result

        app.mathScope = new Map(cached.mathScope)
        stats.runningTotal = [...cached.stats.runningTotal]
        stats.runningSubtotal = [...cached.stats.runningSubtotal]

        if (cached.hasError) {
          errorLines.push(lineIndex)
        }
      } else {
        canUseCache = false

        if (line) {
          result = evaluateLine(line, lineIndex, null, stats, prevLineText)
        } else {
          stats.runningSubtotal.length = 0
        }
      }
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

  evaluationCache = newCache

  // Convert app.mathScope Map to a serializable object of pre‑formatted answers
  const serializedScope = {}

  for (const [key, value] of app.mathScope.entries()) {
    if (typeof value === 'function') {
      serializedScope[key] = 'Function'
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
    udfList: app.udfList,
    uduList: app.uduList
  }
}
