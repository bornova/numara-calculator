import { outputContext } from './context'
import { dom } from './dom'
import { cm } from './editor'
import { app, store } from './utils'

import { DateTime } from 'luxon'
import { all, create, factory } from 'mathjs'

import * as formulajs from '@formulajs/formulajs'

export const math = create(all)

// Import Formula.js into MathJs
math.import(factory('xls', [], () => formulajs))

// Expose math to global scope for use in user defined functions.
window.math = math

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
 * Evaluate a single line and return the answer and answerCopy.
 * @param {string} line - The line to evaluate.
 * @param {number} lineIndex - The line index (0-based).
 * @param {object} lineHandle - The CodeMirror line handle.
 * @param {Array} avgs - Array of averages.
 * @param {Array} totals - Array of totals.
 * @param {Array} subtotals - Array of subtotals.
 * @returns {string} - The evaluated answer or an error link.
 */
function evaluateLine(line, lineIndex, lineHandle, avgs, totals, subtotals) {
  let answer, answerCopy

  try {
    if (lineIndex > 0 && REGEX_CONTINUATION.test(line.charAt(0)) && app.settings.contPrevLine) {
      const prevLine = cm.getLine(lineIndex - 1)

      if (prevLine && prevLine.length > 0) line = app.mathScope.ans + line
    }

    app.mathScope.avg = avgs.length > 0 ? math.mean(avgs) : 0
    app.mathScope.total = totals.length > 0 ? math.sum(totals) : 0

    // Calculate subtotal
    if (subtotals.length > 0) {
      try {
        const subtotalSum = math.sum(subtotals)
        // We want the subtotal to be in the most recent unit
        const lastValue = subtotals[subtotals.length - 1]

        // Try to convert to the unit of the last value if both have units
        try {
          if (
            subtotalSum &&
            lastValue &&
            subtotalSum.units &&
            lastValue.units &&
            subtotalSum.toString &&
            lastValue.toString
          ) {
            // Extract unit from the string representation
            const lastStr = lastValue.toString()
            const lastParts = lastStr.split(' ')
            if (lastParts.length > 1) {
              const targetUnit = lastParts.slice(1).join(' ')
              app.mathScope.subtotal = subtotalSum.to(targetUnit)
            } else {
              app.mathScope.subtotal = subtotalSum
            }
          } else {
            app.mathScope.subtotal = subtotalSum
          }
        } catch {
          // If conversion fails, use the original sum
          app.mathScope.subtotal = subtotalSum
        }
      } catch {
        // If sum fails (incompatible units), set subtotal to undefined
        // This allows evaluation to continue but subtotal won't be available
        app.mathScope.subtotal = undefined
      }
    } else {
      app.mathScope.subtotal = 0
    }

    try {
      answer = math.evaluate(line, app.mathScope)
    } catch {
      answer = altEvaluate(line)
    }

    if (!(answer || answer === 0)) {
      return ``
    }

    app.mathScope._ = answer
    app.mathScope.ans = answer
    app.mathScope[`line${lineIndex + 1}`] = answer

    if (typeof answer === 'number') {
      avgs.push(answer)
      totals.push(answer)
      subtotals.push(answer)
    } else if (answer && answer.type === 'Unit') {
      // Handle units - extract the numeric value and unit
      subtotals.push(answer)
    }

    answerCopy = formatAnswer(answer, app.settings.thouSep && app.settings.copyThouSep)
    answer = formatAnswer(answer, app.settings.thouSep)

    if (REGEX_PLOT.test(line) || REGEX_PLOT.test(answer)) {
      const plotAns = REGEX_PLOT.test(line) ? line : answer

      app.mathScope.ans = plotAns
      app.mathScope[`line${lineIndex + 1}`] = plotAns

      return `<a
        class="${CLASS_PLOT_BUTTON}"
        data-plot="${plotAns}"
        uk-tooltip="title: Plot; pos: right">
          ${dom.icons.ChartSpline}
        </a>`
    }

    return `<span class="${CLASS_ANSWER}" data-answer="${answerCopy}">${answer}</span>`
  } catch (error) {
    if (app.settings.lineErrors) {
      cm.addLineClass(cm.getLineNumber(lineHandle), 'gutter', CLASS_LINE_ERROR)

      return `<a class="${CLASS_LINE_ERROR_LINK}" data-error="${String(error).replace(/'|"/g, '`')}">Error</a>`
    }
  }
}

/**
 * Secondary evaluate method to try if math.evaluate fails.
 * @param {string} line - The line to evaluate.
 * @returns {*} - The evaluated result.
 */
function altEvaluate(line) {
  if (line.includes(':')) {
    try {
      math.evaluate(line.split(':')[0])
    } catch {
      line = line.substring(line.indexOf(':') + 1)
    }
  }

  if (line.match(REGEX_DATE_TIME)) {
    line = line.replace('now', app.mathScope.now).replace('today', app.mathScope.today)

    const lineDate = line.replace(REGEX_DATE_TIME, '').trim()
    const lineDateRight = line.replace(lineDate, '').trim()
    const locale = { locale: app.settings.locale }
    const lineDateNow = DateTime.fromFormat(lineDate, app.settings.dateDay ? nowDayFormat : nowFormat, locale)
    const lineDateToday = DateTime.fromFormat(lineDate, app.settings.dateDay ? todayDayFormat : todayFormat, locale)
    const lineDateTime = lineDateNow.isValid ? lineDateNow : lineDateToday.isValid ? lineDateToday : false
    const rightOfDate = String(math.evaluate(lineDateRight + ' to hours', app.mathScope))
    const durHrs = Number(rightOfDate.split(' ')[0])

    if (!lineDateTime) return 'Invalid Date'

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

  line = line.match(REGEX_PCNT_OF_VAL) ? line.replaceAll(REGEX_PCNT_OF, '/100*') : line

  return math.evaluate(line, app.mathScope)
}

/**
 * Strip quotes from the answer.
 * @param {string} answer - The answer to strip.
 * @returns {string} - The stripped answer.
 */
function stripAnswer(answer) {
  return typeof answer === 'string' ? answer.replace(/^"|"$/g, '') : answer
}

/**
 * Format answer.
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
 * @param {number} lineHandle - The line handle.
 * @param {string} answer - The answer to display.
 */
function updateLineWidget(lineHandle, answer) {
  let widget = app.widgetMap.get(lineHandle)

  if (widget) {
    widget.node.innerHTML = answer
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
 * Calculate answers.
 */
export function calculate() {
  if (app.refreshCM) cm.refresh()

  const avgs = []
  const totals = []
  const subtotals = []
  const dateTime = DateTime.now().setLocale(app.settings.locale)
  const cmValue = cm.getValue()
  const cmHistory = cm.getHistory()
  let answers = ''

  app.mathScope = {}
  app.mathScope.now = dateTime.toFormat(app.settings.dateDay ? nowDayFormat : nowFormat)
  app.mathScope.today = dateTime.toFormat(app.settings.dateDay ? todayDayFormat : todayFormat)

  dom.clearButton.setAttribute('disabled', cmValue === '')
  dom.copyButton.setAttribute('disabled', cmValue === '')

  const lineHeights = Array.from(cm.display.lineDiv.children).map((child) => child.clientHeight ?? 0)
  const useRulers = app.settings.rulers
  const classRuler = useRulers ? CLASS_RULER : CLASS_NO_RULER
  const totalLines = cm.lineCount()

  for (let lineIndex = 0; lineIndex < totalLines; lineIndex++) {
    const lineHandle = cm.getLineHandle(lineIndex)
    let line = stripComments(lineHandle.text.trim())

    cm.removeLineClass(lineHandle, 'gutter', 'lineNoError')

    if (useRulers) {
      cm.removeLineClass(lineHandle, 'wrap', 'noRuler')
      cm.addLineClass(lineHandle, 'wrap', 'ruler')
    } else {
      cm.removeLineClass(lineHandle, 'wrap', 'ruler')
      cm.addLineClass(lineHandle, 'wrap', 'noRuler')
    }

    let result = ``

    if (line) {
      result = evaluateLine(line, lineIndex, lineHandle, avgs, totals, subtotals)
    } else {
      subtotals.length = 0
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
