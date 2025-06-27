import { outputContext } from './context'
import { dom } from './dom'
import { cm } from './editor'
import { app, store } from './utils'
import { CURRENCY_SYMBOLS } from './forex'

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
 * Preprocess currency symbols in expressions to convert them to currency codes.
 * This allows users to type currency symbols (like $, £, €) instead of currency codes.
 *
 * Examples:
 *   $100 → 100 usd
 *   £50 → 50 gbp
 *   €75.50 → 75.50 eur
 *   $x → x usd (where x is a variable)
 *   $x + $y → x usd + y usd
 *   $100 to € → 100 usd to eur
 *
 * @param {string} expression - The expression to preprocess
 * @returns {string} - The preprocessed expression with currency symbols replaced
 */
function preprocessCurrencySymbols(expression) {
  // Return unchanged if CURRENCY_SYMBOLS is not available
  if (!CURRENCY_SYMBOLS || typeof CURRENCY_SYMBOLS !== 'object') {
    return expression
  }

  let processed = expression

  // Sort symbols by length (longest first) to avoid partial matches (e.g., A$ before $)
  const sortedSymbols = Object.keys(CURRENCY_SYMBOLS).sort((a, b) => b.length - a.length)

  // Create escaped versions of symbols for regex
  const escapedSymbols = sortedSymbols.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))

  // Pattern 1: Currency symbol followed by number (e.g., $100, €50.25)
  // This handles direct numeric values with currency symbols
  const numberPattern = new RegExp('(' + escapedSymbols.join('|') + ')' + '\\s*([0-9]+\\.?[0-9]*)', 'g')

  // Pattern 2: Currency symbol followed by variable or expression (e.g., $x, $(x+y))
  // Matches: symbol + variable name OR symbol + parenthesized expression
  // This enables using currency symbols with variables and complex expressions
  const variablePattern = new RegExp(
    '(' + escapedSymbols.join('|') + ')' + '\\s*([a-zA-Z_][a-zA-Z0-9_]*|\\([^)]+\\))',
    'g'
  )

  // Pattern 3: Standalone currency symbol (e.g., "to €", "in $")
  // Must be preceded by whitespace or start of string, and followed by whitespace, operator, or end of string
  // This supports currency conversion syntax like "$100 to €"
  const standalonePattern = new RegExp('(?:^|\\s)(' + escapedSymbols.join('|') + ')(?=\\s|[+\\-*/,)]|$)', 'g')

  // Apply replacements in order of specificity to avoid conflicts

  // First, replace currency symbol + number (e.g., $100 → 100 usd)
  processed = processed.replace(numberPattern, (match, symbol, number) => {
    const currencyCode = CURRENCY_SYMBOLS[symbol]
    return `${number} ${currencyCode.toLowerCase()}`
  })

  // Then, replace currency symbol + variable/expression (e.g., $x → x usd, $(x+y) → (x+y) usd)
  processed = processed.replace(variablePattern, (match, symbol, variableOrExpr) => {
    const currencyCode = CURRENCY_SYMBOLS[symbol]
    // Handle parenthesized expressions by removing outer parentheses from the match
    if (variableOrExpr.startsWith('(')) {
      return `(${variableOrExpr.slice(1, -1)}) ${currencyCode.toLowerCase()}`
    }
    return `${variableOrExpr} ${currencyCode.toLowerCase()}`
  })

  // Finally, replace standalone currency symbols (e.g., "to €" → "to eur")
  processed = processed.replace(standalonePattern, (match, symbol) => {
    const currencyCode = CURRENCY_SYMBOLS[symbol]
    // Preserve leading whitespace from the match
    const leadingSpace = match.startsWith(' ') ? ' ' : ''
    return `${leadingSpace}${currencyCode.toLowerCase()}`
  })

  return processed
}

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

    try {
      app.mathScope.avg = avgs.length ? math.mean(avgs) : 0
    } catch {
      app.mathScope.avg = 'n/a'
    }

    try {
      app.mathScope.total = totals.length ? math.sum(totals) : 0
    } catch {
      app.mathScope.total = 'n/a'
    }

    try {
      app.mathScope.subtotal = subtotals.length ? math.sum(subtotals) : 0
    } catch {
      app.mathScope.subtotal = 'n/a'
    }

    // Preprocess currency symbols
    const processedLine = preprocessCurrencySymbols(line)

    try {
      answer = math.evaluate(processedLine, app.mathScope)
    } catch {
      answer = altEvaluate(processedLine)
    }

    if (!answer || answer === 0) {
      subtotals.length = 0
      return ``
    }

    app.mathScope._ = answer
    app.mathScope.ans = answer
    app.mathScope[`line${lineIndex + 1}`] = answer

    avgs.push(answer)
    totals.push(answer)
    subtotals.push(answer)

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
    cm.addLineClass(cm.getLineNumber(lineHandle), 'gutter', CLASS_LINE_ERROR)

    const errorMessage = String(error).replace(/'|"/g, '`')
    const errorLink = app.settings.lineErrors ? 'Error' : ''

    return `<a class="${CLASS_LINE_ERROR_LINK}" data-error="${errorMessage}">${errorLink}</a>`
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
