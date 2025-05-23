import { $, app, store } from './common'
import { cm, numaraHints, keywords } from './editor'
import { checkLocale } from './utils'

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

/**
 * Calculate answers.
 */
export function calculate() {
  if (app.refreshCM) {
    cm.refresh()
  }

  let answers = ''
  let answerCopy = ''

  const avgs = []
  const totals = []
  const subtotals = []

  const dateTime = DateTime.now().setLocale(app.settings.locale)

  app.mathScope = {}
  app.mathScope.now = dateTime.toFormat(app.settings.dateDay ? nowDayFormat : nowFormat)
  app.mathScope.today = dateTime.toFormat(app.settings.dateDay ? todayDayFormat : todayFormat)

  $('#clearButton').setAttribute('disabled', cm.getValue() === '')
  $('#copyButton').setAttribute('disabled', cm.getValue() === '')

  cm.eachLine((cmLine) => {
    const cmLineNo = cm.getLineNumber(cmLine)
    const lineNo = cmLineNo + 1

    let answer = ''
    let line = cmLine.text.trim().split('//')[0].split('#')[0]

    cm.removeLineClass(cmLine, 'gutter', 'lineNoError')

    if (app.settings.rulers) {
      cm.removeLineClass(cmLine, 'wrap', 'noRuler')
      cm.addLineClass(cmLine, 'wrap', 'ruler')
    } else {
      cm.removeLineClass(cmLine, 'wrap', 'ruler')
      cm.addLineClass(cmLine, 'wrap', 'noRuler')
    }

    if (line) {
      try {
        line =
          lineNo > 1 &&
          line.charAt(0).match(/[+\-*/]/) &&
          cm.getLine(lineNo - 2).length > 0 &&
          app.settings.contPrevLine
            ? app.mathScope.ans + line
            : line

        if (checkLocale()) {
          line = line.replace(/[,;]/g, (match) => (match === ',' ? '.' : ','))
        }

        app.mathScope.avg = math.evaluate(avgs.length > 0 ? '(' + math.mean(avgs) + ')' : '0')
        app.mathScope.total = math.evaluate(totals.length > 0 ? '(' + totals.join('+') + ')' : '0')
        app.mathScope.subtotal = math.evaluate(subtotals.length > 0 ? '(' + subtotals.join('+') + ')' : '0')

        try {
          answer = math.evaluate(line, app.mathScope)
        } catch {
          answer = evaluate(line)
        }

        if (answer || answer === 0) {
          app.mathScope._ = answer
          app.mathScope.ans = answer
          app.mathScope['line' + lineNo] = answer

          if (typeof answer === 'number') {
            avgs.push(answer)
            totals.push(answer)
            subtotals.push(answer)
          }

          answerCopy = formatAnswer(answer, app.settings.thouSep && app.settings.copyThouSep)
          answer = formatAnswer(answer, app.settings.thouSep)

          if (answer.match(/\w\(x\)/)) {
            const plotAns = (/\w\(x\)$/.test(answer) && line !== 'ans' ? line : answer).replace(/\s+/g, '')

            app.mathScope.ans = plotAns
            app.mathScope['line' + lineNo] = plotAns

            answer = `<a class="plotButton" data-func="${plotAns}">Plot</a>`
          }
        } else {
          subtotals.length = 0

          answer = ''
        }
      } catch (error) {
        if (app.settings.lineErrors) {
          cm.addLineClass(cmLineNo, 'gutter', 'lineNoError')

          answer = `<a class="lineError" data-line="${lineNo}" data-error="${String(error).replace(/'|"/g, '`')}">Error</a>`
        }
      }
    } else {
      subtotals.length = 0
    }

    const lineHeight = cm.display.lineDiv.children[cmLineNo].clientHeight

    answers += `<div
        class="${app.settings.rulers ? 'ruler' : 'noRuler'} uk-display-block"
        data-line="${cmLineNo}"
        style="height:${lineHeight}px"
      >
        <span class="${answer && !answer.startsWith('<a') ? 'answer' : ''}" data-copy="${answerCopy}">${answer}</span>
      </div>`
  })

  $('#output').innerHTML = answers

  addScopeHints()

  if (app.activePage) {
    savePageData()
  }
}

/**
 * Secondary evaluate method to try if math.evaluate fails.
 * @param {string} line - The line to evaluate.
 * @returns {*} - The evaluated result.
 */
function evaluate(line) {
  if (line.match(/:/)) {
    try {
      math.evaluate(line.split(':')[0])
    } catch {
      line = line.substring(line.indexOf(':') + 1)
    }
  }

  const dateTimeReg =
    /[+-] * .* *(millisecond|second|minute|hour|day|week|month|quarter|year|decade|century|centuries|millennium|millennia)s?/g

  if (line.match(dateTimeReg)) {
    line = line.replace('now', app.mathScope.now).replace('today', app.mathScope.today)

    const lineDate = line.replace(dateTimeReg, '').trim()
    const lineDateRight = line.replace(lineDate, '').trim()
    const locale = { locale: app.settings.locale }
    const lineDateNow = DateTime.fromFormat(lineDate, app.settings.dateDay ? nowDayFormat : nowFormat, locale)
    const lineDateToday = DateTime.fromFormat(lineDate, app.settings.dateDay ? todayDayFormat : todayFormat, locale)
    const lineDateTime = lineDateNow.isValid ? lineDateNow : lineDateToday.isValid ? lineDateToday : false
    const rightOfDate = String(math.evaluate(lineDateRight + ' to hours', app.mathScope))
    const durHrs = Number(rightOfDate.split(' ')[0])

    if (lineDateTime) {
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
    } else {
      return 'Invalid Date'
    }
  }

  const pcntOfReg = /%[ ]*of[ ]*/g
  const pcntOfValReg = /[\w.]*%[ ]*of[ ]*/g

  if (line.match(pcntOfValReg)) {
    line = line.replaceAll(pcntOfReg, '/100*')
  }

  return math.evaluate(line, app.mathScope)
}

/**
 * Strip quotes from the answer.
 * @param {string} answer - The answer to strip.
 * @returns {string} - The stripped answer.
 */
function stripAnswer(answer) {
  let t = answer.length

  if (answer.charAt(0) === '"') {
    answer = answer.substring(1, t--)
  }

  if (answer.charAt(--t) === '"') {
    answer = answer.substring(0, t)
  }

  return answer
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
 * Add scoped items to hints.
 */
function addScopeHints() {
  const scopeKeywords = keywords.map((key) => key.text)
  const vars = Object.keys(app.mathScope).filter((scope) => !scopeKeywords.includes(scope))

  vars.forEach((v) => {
    if (!numaraHints.some((hint) => hint.text === v) && v !== 'line' + cm.lineCount()) {
      numaraHints.push({ text: v, desc: 'Variable', className: 'cm-variable' })
    }
  })
}

/**
 * Save page data to store.
 */
function savePageData() {
  const pages = store.get('pages')
  const page = pages.find((page) => page.id === app.activePage)

  page.data = cm.getValue()
  page.history = cm.getHistory()

  store.set('pages', pages)
}
