import { $, app, store } from './common'
import { cm } from './editor'
import { checkLocale } from './utils'

import { DateTime } from 'luxon'
import { create, all } from 'mathjs'

import * as formulajs from '@formulajs/formulajs'

export const math = create(all)

// Import Formula.js into MathJs
math.import(formulajs, { silent: true, wrap: true })

// Expose math to global scope for use in function-plot.
window.math = math

const nowFormat = 'D t'
const nowDayFormat = 'ccc, D t'

const todayFormat = 'D'
const todayDayFormat = 'ccc, D'

/** Calculate answers. */
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
          app.mathScope.ans = answer
          app.mathScope['line' + lineNo] = answer

          if (!isNaN(answer)) {
            avgs.push(answer)
            totals.push(answer)
            subtotals.push(answer)
          }

          answer = math.format(answer, {
            notation: app.settings.notation,
            lowerExp: +app.settings.expLower,
            upperExp: +app.settings.expUpper
          })

          const answerCopyInit = answer

          answer = formatAnswer(answer, false)
          answerCopy = formatAnswer(answerCopyInit, true)

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

    answers += `<div
        class="${app.settings.rulers ? 'ruler' : 'noRuler'} uk-display-block"
        data-line="${cmLineNo}"
        style="height:${cmLine.height - 1}px"
      >
        <span class="${answer && !answer.startsWith('<a') ? 'answer' : ''}" data-copy="${answerCopy}">${answer}</span>
      </div>`
  })

  $('#output').innerHTML = answers

  if (app.activePage) {
    const pages = store.get('pages')
    const page = pages.find((page) => page.id === app.activePage)

    page.data = cm.getValue()
    page.history = cm.getHistory()

    store.set('pages', pages)
  }
}

/** Secondary evaluate method to try if math.evaluate fails */
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
 * @param {boolean} separator Include thousands separator - True|False
 * @returns
 */
export function formatAnswer(answer, separator) {
  answer = String(answer)

  if (['bin', 'hex', 'oct'].includes(app.settings.notation)) {
    return stripAnswer(answer)
  }

  const a = answer.trim().split(' ')[0]
  const b = answer.replace(a, '')
  const digits = {
    maximumFractionDigits: app.settings.precision,
    useGrouping: separator ? app.settings.copyThouSep : app.settings.thouSep
  }

  const formattedAnswer =
    !a.includes('e') && !isNaN(a)
      ? Number(a).toLocaleString(app.settings.locale, digits) + b
      : a.match(/e[+-]?\d+/) && !isNaN(a.split('e')[0])
        ? Number(a.split('e')[0]).toLocaleString(app.settings.locale, digits) + 'e' + answer.split('e')[1]
        : stripAnswer(answer)

  return formattedAnswer
}
