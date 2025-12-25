import { outputContext } from './context'
import { dom } from './dom'
import { cm } from './editor'
import { currencySymbols } from './forex'
import { app, localeUsesComma, store } from './utils'

import { DateTime } from 'luxon'
import { all, create, factory } from 'mathjs'

import * as formulajs from '@formulajs/formulajs'
import nerdamer from 'nerdamer-prime/all.js'

// Initialize a Math.js instance with all functions.
export const math = create(all)

// Import Formula.js and Nerdamer into MathJs
math.import(factory('formulajs', [], () => formulajs))
math.import(factory('nerdamer', [], () => nerdamer))

// Expose math to global scope for use in user defined functions.
window.math = math

// Cache for compiled expressions
const compiledExpressions = new Map()

/**
 * Retrieve a compiled Math.js expression. If the expression has not been
 * compiled before, compile it and store it in the cache.
 *
 * @param {string} expr - Expression string to compile.
 * @returns {Object} - Compiled expression with an evaluate method.
 */
function getCompiledExpression(expr) {
  if (!compiledExpressions.has(expr)) {
    const compiled = math.compile(expr)

    compiledExpressions.set(expr, compiled)
  }

  return compiledExpressions.get(expr)
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

const nowFormat = 'D t'
const nowDayFormat = 'ccc, D t'
const todayFormat = 'D'
const todayDayFormat = 'ccc, D'

const REGEX_CONTINUATION = /[+\-*/]/
const REGEX_DATE_TIME =
  /[+-] * .* *(millisecond|second|minute|hour|day|week|month|quarter|year|decade|century|centuries|millennium|millennia)s?/g
const REGEX_PCNT_OF = /%[ ]*of[ ]*/g
const REGEX_PCNT_OF_VAL = /[\w.]*%[ ]*of[ ]*/g
const REGEX_PLOT = /\w\(x\)\s*=/

const CLASS_RULER = 'ruler'
const CLASS_NO_RULER = 'noRuler'
const CLASS_LINE_ERROR = 'lineNoError'
const CLASS_ANSWER = 'answer'
const CLASS_PLOT_BUTTON = 'plotButton answer'
const CLASS_LINE_ERROR_LINK = 'lineError'

/**
 * Evaluate a single line and return the answer.
 *
 * @param {string} line - The line to evaluate.
 * @param {number} lineIndex - The line index (0-based).
 * @param {object} lineHandle - The CodeMirror line handle.
 * @param {Object} stats - Object holding runningSum, runningCount, runningTotal, runningSubtotal and invalidAvg/invalidTotal/invalidSubtotal flags.
 * @returns {string} - The evaluated answer or an error link.
 */
function evaluateLine(line, lineIndex, lineHandle, stats) {
  let answer, answerCopy

  try {
    // Pre‑process locale and currency symbols
    if (app.settings.inputLocale) {
      line = localeUsesComma() ? line.replace(/\./g, '').replace(/,/g, '.') : line.replace(/,/g, '')
      line = line.replace(/;/g, ',')
    }

    if (app.settings.currency) {
      Object.entries(currencySymbols).forEach(([code, symbol]) => {
        line = line.replaceAll(symbol, code + ' ')
      })
    }

    // Handle line continuation
    if (lineIndex > 0 && REGEX_CONTINUATION.test(line.charAt(0)) && app.settings.contPrevLine) {
      const prevLine = cm.getLine(lineIndex - 1)

      if (prevLine && prevLine.length > 0) {
        line = (app.mathScope.get('ans') ?? '') + line
      }
    }

    // Set avg, total and subtotal in scope before evaluating the current line.
    setScope('avg', stats.invalidAvg ? 'n/a' : stats.runningCount > 0 ? stats.runningSum / stats.runningCount : 0)
    setScope('total', stats.invalidTotal ? 'n/a' : stats.runningTotal)
    setScope('subtotal', stats.invalidSubtotal ? 'n/a' : stats.runningSubtotal)

    // Evaluate the expression. Try compiled evaluation first;
    // fall back to altEvaluate if compilation fails.
    try {
      // Compile the trimmed expression and evaluate it with the current scope.
      const expr = line.trim()
      const compiled = getCompiledExpression(expr)

      answer = compiled.evaluate(app.mathScope)
    } catch {
      answer = altEvaluate(line)
    }
    // If the answer is empty/undefined/null, reset subtotal and return early.
    if (answer === undefined || answer === null || answer === '') {
      // Reset running subtotal when encountering an empty answer.
      stats.runningSubtotal = 0
      stats.invalidSubtotal = false

      return ``
    }

    // Update the scope with the new answer. Use both Map and property for compatibility.
    setScope('_', answer)
    setScope('ans', answer)
    setScope(`line${lineIndex + 1}`, answer)

    // Update stats after evaluation
    if (typeof answer === 'number' && !Number.isNaN(answer)) {
      if (!stats.invalidAvg) {
        stats.runningSum += answer
        stats.runningCount += 1
      }

      if (!stats.invalidTotal) {
        stats.runningTotal += answer
      }

      if (!stats.invalidSubtotal) {
        stats.runningSubtotal += answer
      }
    } else {
      // Mark statistics as invalid when encountering a non-numeric answer.
      stats.invalidAvg = true
      stats.invalidTotal = true
      stats.invalidSubtotal = true
    }

    // Format the answer for display and copying.
    answerCopy = formatAnswer(answer, app.settings.thouSep && app.settings.copyThouSep)
    answer = formatAnswer(answer, app.settings.thouSep)

    // Handle plotting lines.
    if (REGEX_PLOT.test(line) || REGEX_PLOT.test(answer)) {
      const plotAns = REGEX_PLOT.test(line) ? line : answer

      setScope('ans', plotAns)
      setScope(`line${lineIndex + 1}`, plotAns)

      return `<a
        class="${CLASS_PLOT_BUTTON}"
        data-plot="${plotAns}"
        uk-tooltip="title: Plot; pos: right">
          ${dom.icons.ChartSpline}
        </a>`
    }

    return `<span class="${CLASS_ANSWER}" data-answer="${answerCopy}">${answer}</span>`
  } catch (error) {
    // Highlight the error line and return an error link.
    cm.addLineClass(cm.getLineNumber(lineHandle), 'gutter', CLASS_LINE_ERROR)

    const errorMessage = String(error).replace(/'|"/g, '`')
    const errorLink = app.settings.lineErrors ? 'Error' : ''

    return `<a class="${CLASS_LINE_ERROR_LINK}" data-error="${errorMessage}">${errorLink}</a>`
  }
}

/**
 * Secondary evaluate method to try if math.evaluate fails. This function
 * supports features such as date/time arithmetic and percentage of syntax.
 *
 * @param {string} line - The line to evaluate.
 * @returns {*} - The evaluated result.
 */
function altEvaluate(line) {
  // Support expression before colon for separate evaluation
  if (line.includes(':')) {
    try {
      math.evaluate(line.split(':')[0])
    } catch {
      line = line.substring(line.indexOf(':') + 1)
    }
  }

  // Replace variables in the expression with values from the mathScope Map.
  for (const [key, value] of app.mathScope.entries()) {
    const regex = new RegExp(`\\b${key}\\b`, 'g')

    line = line.replace(regex, value)
  }

  // Handle date/time arithmetic.
  if (line.match(REGEX_DATE_TIME)) {
    const locale = { locale: app.settings.locale }
    const lineDate = line.replace(REGEX_DATE_TIME, '').trim()
    const lineDateRight = line.replace(lineDate, '').trim()
    const lineDateNow = DateTime.fromFormat(lineDate, nowFormat, locale)
    const lineDateToday = DateTime.fromFormat(lineDate, todayFormat, locale)
    const lineDateTodayDay = DateTime.fromFormat(lineDate, todayDayFormat, locale)
    const lineDateTime = lineDateNow.isValid
      ? lineDateNow
      : lineDateToday.isValid
        ? lineDateToday
        : lineDateTodayDay.isValid
          ? lineDateTodayDay
          : false

    if (!lineDateTime) return 'Invalid Date'

    const rightOfDate = String(math.evaluate(lineDateRight + ' to hours', app.mathScope))
    const durHrs = Number(rightOfDate.split(' ')[0])
    const dtLine = lineDateTime
      .plus({ hours: durHrs })
      .toFormat(
        lineDateNow.isValid
          ? app.settings.dateDay
            ? nowDayFormat
            : nowFormat
          : app.settings.dateDay
            ? todayDayFormat
            : todayFormat
      )

    line = `"${dtLine}"`
  }

  // Convert "% of" syntax to arithmetic
  line = line.match(REGEX_PCNT_OF_VAL) ? line.replaceAll(REGEX_PCNT_OF, '/100*') : line

  return math.evaluate(line, app.mathScope)
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
  const locale = app.settings.locale
  const maximumFractionDigits = app.settings.precision

  if (['bin', 'hex', 'oct'].includes(notation)) {
    answer = math.format(answer, { notation })

    return stripAnswer(answer)
  }

  const formatOptions = { notation, lowerExp, upperExp }
  const localeOptions = { maximumFractionDigits, useGrouping }
  const formattedAnswer = math.format(answer, (value) => {
    value = math.format(value, formatOptions)

    if (value.includes('e')) {
      const [base, exponent] = value.split('e')

      return (+base).toLocaleString(locale, localeOptions) + 'e' + exponent
    }

    return (+value).toLocaleString(locale, localeOptions)
  })

  return stripAnswer(formattedAnswer)
}

/**
 * Strip comments from a line.
 *
 * @param {string} line - The line to strip comments from.
 * @returns {string} - The line without comments.
 */
function stripComments(line) {
  const commentIdx = line.indexOf('//')
  const hashIdx = line.indexOf('#')

  if (commentIdx !== -1 || hashIdx !== -1) {
    const idx =
      commentIdx !== -1 && hashIdx !== -1 ? Math.min(commentIdx, hashIdx) : commentIdx !== -1 ? commentIdx : hashIdx

    return line.substring(0, idx)
  }

  return line
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

  const dateTime = DateTime.now().setLocale(app.settings.locale)
  const cmValue = cm.getValue()
  const cmHistory = cm.getHistory()

  let answers = ''

  app.mathScope = new Map()

  // Initialize running statistics for averages, totals and subtotals.
  const stats = {
    runningSum: 0,
    runningCount: 0,
    runningTotal: 0,
    runningSubtotal: 0,
    invalidAvg: false,
    invalidTotal: false,
    invalidSubtotal: false
  }

  // Set initial date/time variables in the scope.
  setScope('now', dateTime.toFormat(app.settings.dateDay ? nowDayFormat : nowFormat))
  setScope('today', dateTime.toFormat(app.settings.dateDay ? todayDayFormat : todayFormat))

  dom.clearButton.setAttribute('disabled', cmValue === '')
  dom.copyButton.setAttribute('disabled', cmValue === '')

  const lineHeights = Array.from(cm.display.lineDiv.children).map((child) => child.clientHeight ?? 0)
  const useRulers = app.settings.rulers
  const classRuler = useRulers ? CLASS_RULER : CLASS_NO_RULER
  const totalLines = cm.lineCount()

  for (let lineIndex = 0; lineIndex < totalLines; lineIndex++) {
    const lineHandle = cm.getLineHandle(lineIndex)
    let line = stripComments(lineHandle.text.trim())

    cm.removeLineClass(lineHandle, 'gutter', CLASS_LINE_ERROR)

    if (useRulers) {
      cm.removeLineClass(lineHandle, 'wrap', CLASS_NO_RULER)
      cm.addLineClass(lineHandle, 'wrap', CLASS_RULER)
    } else {
      cm.removeLineClass(lineHandle, 'wrap', CLASS_RULER)
      cm.addLineClass(lineHandle, 'wrap', CLASS_NO_RULER)
    }

    let result = ``

    if (line) {
      result = evaluateLine(line, lineIndex, lineHandle, stats)
    } else {
      // Reset running subtotal and invalidSubtotal when encountering a blank line.
      stats.runningSubtotal = 0
      stats.invalidSubtotal = false
    }

    const lineHeight = lineHeights[lineIndex]

    if (app.settings.answerPosition === 'bottom') {
      updateLineWidget(lineHandle, result)
    } else {
      answers += `<div class="${classRuler}" data-index="${lineIndex}" style="height:${lineHeight}px">${result}</div>`
    }
  }

  if (app.settings.answerPosition === 'bottom') {
    dom.output.innerHTML = `<div style="height: ${dom.el('.CodeMirror-scroll').scrollHeight - 50}px;"></div>`
  } else if (dom.output.innerHTML !== answers) {
    dom.output.innerHTML = answers
  }

  if (app.activePage) {
    const pages = store.get('pages')
    const page = pages.find((page) => page.id === app.activePage)

    if (!page || (page.data === cmValue && JSON.stringify(page.history) === JSON.stringify(cmHistory))) return

    page.data = cmValue
    page.history = cmHistory

    store.set('pages', pages)
  }
}
