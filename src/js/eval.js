import { outputContext } from './context'
import { dom } from './dom'
import { cm } from './editor'
import { app, escapeHTML, escapeRegExp, getAppLocale, localeUsesComma, store } from './utils'

import { DateTime } from 'luxon'
import { all, create, factory } from 'mathjs'

import * as formulajs from '@formulajs/formulajs'
import nerdamer from 'nerdamer-prime/all.js'

// Initialize a Math.js instance with all functions.
export const math = create(all)

// Import Formula.js and Nerdamer into MathJs
math.import(factory('formulajs', [], () => formulajs))
math.import(factory('nerdamer', [], () => nerdamer))

// Override the isAlpha function to support Unicode letters, allowing for variable names in non-Latin characters.
const isAlphaOriginal = math.parse.isAlpha
const universalRegex = /[\p{L}\p{M}]/u

math.parse.isAlpha = (c, cPrev, cNext) => isAlphaOriginal(c, cPrev, cNext) || universalRegex.test(c)

const nowFormat = 'D t'
const nowDayFormat = 'ccc, D t'
const todayFormat = 'D'
const todayDayFormat = 'ccc, D'

const REGEX_CONTINUATION = /[+\-*/]/
const REGEX_DATE_TIME =
  /[+-] * .*? *(millisecond|second|minute|hour|day|week|month|quarter|year|decade|century|centuries|millennium|millennia)s?/gi
const REGEX_PCNT_OF = /%[ ]*of[ ]*/g
const REGEX_PLOT = /\w\(x\)\s*=/

let currencySymbolsRegex = null
let currencyFormatRegex = null
let currencySymbolToCode = {}

/** Rebuild the currency regexes and symbol→code map from app.currencies. */
export function refreshCurrencyState() {
  const entries = Object.entries(app.currencies || {})
  const codes = []
  const symbols = []

  currencySymbolToCode = {}

  for (const [code, info] of entries) {
    codes.push(code)

    if (info?.symbol && !(info.symbol in currencySymbolToCode)) {
      currencySymbolToCode[info.symbol] = code
      symbols.push(info.symbol)
    }
  }

  const numPattern =
    '\\b0[xX][0-9a-fA-F]+\\b|\\b0[bB][01]+\\b|\\b0[oO][0-7]+\\b|\\b(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:[eE][+-]?\\d+)?\\b'

  currencySymbolsRegex = symbols.length
    ? new RegExp(
        `(${numPattern})|(?<![\\p{L}])(${symbols
          .sort((a, b) => b.length - a.length)
          .map(escapeRegExp)
          .join('|')})(?![\\p{L}])`,
        'gu'
      )
    : null

  currencyFormatRegex = codes.length
    ? new RegExp(`(-?\\d[\\d.,'\\u00A0\\u202F\\u2009 ]*(?:e[+-]?\\d+)?)\\s*\\b(${codes.join('|')})\\b`, 'gi')
    : null
}

/** Replace a matched currency symbol with its ISO code (used inside evaluateLine). */
function replaceCurrencySymbol(symbol) {
  const code = currencySymbolToCode[symbol]

  return code ? code + ' ' : symbol
}

const CLASS_RULER = 'ruler'
const CLASS_NO_RULER = 'noRuler'
const CLASS_LINE_ERROR = 'lineNoError'
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

// Cache for Intl.NumberFormat formatters
const numberFormatCache = new Map()

function getNumberFormatter(locale, options) {
  const key = `${locale}_${options.useGrouping ?? ''}_${options.maximumFractionDigits ?? ''}_${options.style ?? ''}_${options.currency ?? ''}`
  let formatter = numberFormatCache.get(key)

  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, options)
    numberFormatCache.set(key, formatter)
  }

  return formatter
}

/**
 * Retrieve a compiled Math.js expression. If the expression has not been
 * compiled before, compile it and store it in the cache.
 *
 * @param {string} expr - Expression string to compile.
 * @returns {Object} - Compiled expression with an evaluate method.
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
 * @param {string} key - Name of the scope variable.
 * @param {*} value - Value to set.
 */
function setScope(key, value) {
  app.mathScope.set(key, value)
}

/**
 * Evaluate a single line and return the answer.
 *
 * @param {string} line - The line to evaluate.
 * @param {number} lineIndex - The line index (0-based).
 * @param {object} lineHandle - The CodeMirror line handle.
 * @param {Object} stats - Object holding runningTotal and runningSubtotal.
 * @returns {string} - The evaluated answer or an error link.
 */
function evaluateLine(line, lineIndex, lineHandle, stats, prevLineText) {
  let answer, answerCopy, answerOut

  try {
    // Pre‑process locale and currency symbols
    if (app.settings.inputLocale) {
      const usesComma = localeUsesComma()
      // Match contiguous digit sequences with embedded commas/periods (ignoring isolated separators)
      line = line.replace(/\b\d+(?:[.,]\d+)+\b/g, (numToken) => {
        const commas = (numToken.match(/,/g) || []).length
        const periods = (numToken.match(/\./g) || []).length

        // 1. Both commas and periods are present (e.g. 1.234,56 or 1,234.56)
        if (commas > 0 && periods > 0) {
          const lastComma = numToken.lastIndexOf(',')
          const lastPeriod = numToken.lastIndexOf('.')
          if (lastComma > lastPeriod) {
            return numToken.replace(/\./g, '').replace(/,/g, '.')
          } else {
            return numToken.replace(/,/g, '')
          }
        }

        // 2. Only periods are present (e.g. 1.234.567 or 1.23 or 1.234)
        if (periods > 0 && commas === 0) {
          if (periods > 1) {
            return numToken.replace(/\./g, '')
          }
          const parts = numToken.split('.')
          if (parts[1].length === 3) {
            return usesComma ? numToken.replace(/\./g, '') : numToken
          }
          return numToken
        }

        // 3. Only commas are present (e.g. 1,234,567 or 1,23 or 1,234)
        if (commas > 0 && periods === 0) {
          if (commas > 1) {
            return numToken.replace(/,/g, '')
          }
          const parts = numToken.split(',')
          if (parts[1].length === 3) {
            return usesComma ? numToken.replace(/,/g, '.') : numToken.replace(/,/g, '')
          }
          return numToken.replace(/,/g, '.')
        }

        return numToken
      })

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
      if (prevLineText && prevLineText.length > 0) {
        line = (app.mathScope.get('ans') ?? '') + line
      }
    }

    // Evaluate the expression. Try compiled evaluation first;
    // fall back to altEvaluate if compilation fails.
    try {
      // Compile the trimmed expression and evaluate it with the current scope.
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
    answerCopy = formatAnswer(answer, app.settings.thouSep && app.settings.copyThouSep)
    answerOut = formatAnswer(answer, app.settings.thouSep)

    // Handle plotting lines.
    if (REGEX_PLOT.test(line) || REGEX_PLOT.test(answerOut)) {
      const plotAns = REGEX_PLOT.test(line) ? line : answerOut

      setScope('ans', plotAns)
      setScope(`line${lineIndex + 1}`, plotAns)

      return `<a
        class="${CLASS_PLOT_BUTTON}"
        data-plot="${escapeHTML(plotAns)}"
        uk-tooltip="title: Plot; pos: right">
          ${dom.icons.ChartSpline}
        </a>`
    }

    return `<span class="${CLASS_ANSWER}" data-answer="${escapeHTML(answerCopy)}">${escapeHTML(answerOut)}</span>`
  } catch (error) {
    // Highlight the error line and return an error link.
    cm.addLineClass(cm.getLineNumber(lineHandle), 'gutter', CLASS_LINE_ERROR)

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
 * @param {string} line - The line to evaluate.
 * @returns {*} - The evaluated result.
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
    const locale = { locale: getAppLocale() }

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
    const formatTypes = [nowDayFormat, nowFormat, todayDayFormat, todayFormat]
    let found = null

    for (const fmt of formatTypes) {
      const dt = DateTime.fromFormat(lineDate, fmt, locale)
      if (dt.isValid) {
        found = { fmt, dt }
        break
      }
    }

    if (!found) return 'Invalid Date'

    const rightOfDate = String(math.evaluate(lineDateRight + ' to hours', app.mathScope))
    const durHrs = Number(rightOfDate.split(' ')[0])
    const dtLine = found.dt.plus({ hours: durHrs }).toFormat(found.fmt)

    parsedLine = `${assignPrefix}"${dtLine}"`
  }

  // Convert "% of" syntax to arithmetic
  parsedLine = parsedLine.replaceAll(REGEX_PCNT_OF, '/100*')

  return math.evaluate(parsedLine, app.mathScope)
}

/**
 * Strip quotes from the answer.
 *
 * @param {string} answer - The answer to strip.
 * @returns {string} - The stripped answer.
 */
function stripAnswer(answer) {
  return typeof answer === 'string' ? answer.replace(/^"|"$/g, '') : answer
}

const localeSeparatorCache = new Map()

/**
 * Get the decimal and group separators for a given locale, using caching to optimize performance.
 *
 * @param {string} locale - The locale identifier (e.g., 'en-US').
 * @returns {{group: string, decimal: string}} - The group and decimal separators.
 */
function getLocaleSeparators(locale) {
  let sep = localeSeparatorCache.get(locale)

  if (sep) return sep

  const parts = new Intl.NumberFormat(locale).formatToParts(12345.6)

  sep = {
    group: parts.find((p) => p.type === 'group')?.value ?? ',',
    decimal: parts.find((p) => p.type === 'decimal')?.value ?? '.'
  }

  localeSeparatorCache.set(locale, sep)

  return sep
}

/**
 * Parse a locale-formatted number string back to a Number.
 *
 * @param {string} str - The locale-formatted number string.
 * @param {string} locale - The locale identifier (e.g., 'en-US').
 * @returns {number} - The parsed number.
 */
function parseLocaleNumber(str, locale) {
  const { group, decimal } = getLocaleSeparators(locale)
  const cleaned = str
    .replace(new RegExp(escapeRegExp(group), 'g'), '')
    .replace(/[\u00A0\u202F\u2009 ]/g, '')
    .replace(decimal, '.')

  return parseFloat(cleaned)
}

/**
 * Format currency answers in the currency's native locale.
 * @param {string} str - The input string containing amount and currency code.
 * @returns {string} - The formatted currency string.
 */
function formatCurrency(str) {
  if (!currencyFormatRegex) return str

  const appLocale = getAppLocale()
  const useGrouping = app.settings.thouSep
  const maximumFractionDigits = app.settings.precision

  return str.replace(currencyFormatRegex, (match, amount, code) => {
    const upperCode = code.toUpperCase()
    const info = app.currencies[upperCode]

    if (!info) return match

    // Preserve any exponent suffix unchanged.
    const trimmed = amount.trim()
    const eIndex = trimmed.search(/e[+-]?\d+$/i)
    const baseStr = eIndex >= 0 ? trimmed.slice(0, eIndex) : trimmed
    const expStr = eIndex >= 0 ? trimmed.slice(eIndex) : ''
    const value = parseLocaleNumber(baseStr, appLocale)

    if (!Number.isFinite(value)) return `${info.symbol ?? ''}${trimmed}`

    const locale = info.locale || appLocale

    try {
      const formatter = getNumberFormatter(locale, {
        style: 'currency',
        currency: upperCode,
        currencyDisplay: 'narrowSymbol',
        useGrouping,
        maximumFractionDigits
      })

      return formatter.format(value) + expStr
    } catch {
      return `${info.symbol ?? ''}${trimmed}${expStr}`
    }
  })
}

/**
 * Format answer.
 *
 * @param {*} answer Value to format.
 * @param {boolean} useGrouping Include thousands separator - True|False
 * @returns {string} - The formatted answer.
 */
export function formatAnswer(answer, useGrouping) {
  const notation = app.settings.notation
  const lowerExp = +app.settings.expLower
  const upperExp = +app.settings.expUpper
  const locale = getAppLocale()
  const maximumFractionDigits = app.settings.precision

  if (['bin', 'hex', 'oct'].includes(notation)) {
    answer = math.format(answer, { notation })

    return stripAnswer(answer)
  }

  const formatOptions = { notation, lowerExp, upperExp }
  const localeOptions = { maximumFractionDigits, useGrouping }
  const formatter = getNumberFormatter(locale, localeOptions)

  // Retrieve dynamic decimal and group separators for this locale
  let decimalSeparator = '.'
  let groupSeparator = ','
  try {
    const parts = getNumberFormatter(locale, { useGrouping: true }).formatToParts(123456.78)
    for (const part of parts) {
      if (part.type === 'decimal') decimalSeparator = part.value
      if (part.type === 'group') groupSeparator = part.value
    }
  } catch {
    // Fallback to defaults
  }

  function formatNumericString(numStr, decSep, grpSep, useGrp) {
    const parts = numStr.split('.')
    let integerPart = parts[0]
    const decimalPart = parts[1] || ''

    if (useGrp && grpSep) {
      const isNegative = integerPart.startsWith('-')
      if (isNegative) {
        integerPart = integerPart.slice(1)
      }
      integerPart = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, grpSep)
      if (isNegative) {
        integerPart = '-' + integerPart
      }
    }

    if (decimalPart) {
      return integerPart + decSep + decimalPart
    }
    return integerPart
  }

  let processedAnswer = answer
  if (typeof maximumFractionDigits === 'number') {
    try {
      if (math.typeOf(answer) === 'BigNumber') {
        processedAnswer = math.round(answer, maximumFractionDigits)
      }
    } catch {
      // ignore
    }
  }

  let formattedAnswer = math.format(processedAnswer, (value) => {
    const valueStr = math.format(value, formatOptions)

    // For standard float numbers, use built-in formatter for safety
    if (typeof value === 'number') {
      return formatter.format(value)
    }

    // For BigNumbers and high precision, format as localized numeric string
    if (valueStr.includes('e')) {
      const [base, exponent] = valueStr.split('e')
      return formatNumericString(base, decimalSeparator, groupSeparator, useGrouping) + 'e' + exponent
    }

    return formatNumericString(valueStr, decimalSeparator, groupSeparator, useGrouping)
  })

  // Handle currency formatting
  if (app.settings.currency) {
    formattedAnswer = formatCurrency(formattedAnswer)
  }

  return stripAnswer(formattedAnswer)
}

/**
 * Strip comments from a line.
 *
 * @param {string} line - The line to strip comments from.
 * @returns {string} - The line without comments.
 */
function stripComments(line) {
  const match = line.match(/\/\/|#/)
  return match ? line.substring(0, match.index) : line
}

/**
 * Update the line widget with the answer.
 *
 * @param {number} lineHandle - The line handle.
 * @param {string} answer - The answer to display.
 */
function updateLineWidget(lineHandle, answer) {
  let widget = app.widgetMap.get(lineHandle)

  if (widget) {
    if (widget.node.innerHTML !== answer) {
      widget.node.innerHTML = answer
    }
  } else {
    const node = document.createElement('div')
    node.dataset.index = cm.getLineNumber(lineHandle)
    node.innerHTML = answer
    node.addEventListener('contextmenu', outputContext)

    widget = cm.addLineWidget(lineHandle, node, { above: false, coverGutter: false, noHScroll: true })
    widget.node = node

    app.widgetMap.set(lineHandle, widget)
  }
}

/**
 * Calculate answers by iterating through each line in the editor.
 */
export function calculate() {
  if (app.refreshCM) cm.refresh()

  const dateTime = DateTime.now().setLocale(getAppLocale())
  const cmValue = cm.getValue()
  const cmHistory = cm.getHistory()
  const answers = []

  app.mathScope = new Map()

  // Initialize running statistics for averages, totals and subtotals.
  const stats = {
    runningTotal: [],
    runningSubtotal: []
  }

  // Set initial date/time variables in the scope.
  setScope('now', dateTime.toFormat(app.settings.dateDay ? nowDayFormat : nowFormat))
  setScope('today', dateTime.toFormat(app.settings.dateDay ? todayDayFormat : todayFormat))

  dom.clearButton.setAttribute('disabled', cmValue === '')
  dom.copyButton.setAttribute('disabled', cmValue === '')

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

  const totalLines = cm.lineCount()
  const lineHeights = []
  const visibleChildren = Array.from(cm.display.lineDiv.children)
  let visibleIndex = 0
  for (let i = 0; i < totalLines; i++) {
    const lineHandle = cm.getLineHandle(i)
    if (lineHandle.hidden || foldedLines.has(i)) {
      lineHeights.push(0)
    } else {
      const child = visibleChildren[visibleIndex++]
      lineHeights.push(child ? (child.clientHeight ?? 27) : 27)
    }
  }
  const useRulers = app.settings.rulers
  const classRuler = useRulers ? CLASS_RULER : CLASS_NO_RULER

  let prevLineText = ''
  for (let lineIndex = 0; lineIndex < totalLines; lineIndex++) {
    const lineHandle = cm.getLineHandle(lineIndex)
    const rawText = lineHandle.text
    const line = stripComments(rawText.trim())

    cm.removeLineClass(lineHandle, 'gutter', CLASS_LINE_ERROR)

    if (useRulers) {
      cm.removeLineClass(lineHandle, 'wrap', CLASS_NO_RULER)
      cm.addLineClass(lineHandle, 'wrap', CLASS_RULER)
    } else {
      cm.removeLineClass(lineHandle, 'wrap', CLASS_RULER)
      cm.addLineClass(lineHandle, 'wrap', CLASS_NO_RULER)
    }

    let result = ''

    if (line) {
      result = evaluateLine(line, lineIndex, lineHandle, stats, prevLineText)
    } else {
      // Reset running subtotal when encountering a blank line.
      stats.runningSubtotal.length = 0
    }

    const lineHeight = lineHeights[lineIndex]

    if (app.settings.answerPosition === 'bottom') {
      updateLineWidget(lineHandle, result)
    } else {
      const displayStyle = lineHeight === 0 ? 'display: none;' : `height:${lineHeight}px`
      answers.push(`<div class="${classRuler}" data-index="${lineIndex}" style="${displayStyle}">${result}</div>`)
    }

    prevLineText = rawText
  }

  const outputResults = answers.join('')

  if (app.settings.answerPosition === 'bottom') {
    dom.output.innerHTML = `<div style="height: ${dom.el('.CodeMirror-scroll').scrollHeight - 50}px;"></div>`
  } else if (dom.output.innerHTML !== outputResults) {
    dom.output.innerHTML = outputResults
  }

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

    if (
      !page ||
      (page.data === cmValue &&
        JSON.stringify(page.history) === JSON.stringify(cmHistory) &&
        JSON.stringify(page.folds) === JSON.stringify(folds))
    )
      return

    page.data = cmValue
    page.history = cmHistory
    page.folds = folds

    store.set('pages', pages)
  }
}
