import { $, app, store } from './common'
import { cm } from './editor'
import { checkLocale } from './utils'

import { DateTime } from 'luxon'
import { create, all } from 'mathjs'

export const math = create(all)

// Expose math to global scope for use in function-plot.
window.math = math

const nowFormat = 'D t'
const nowWithDayFormat = 'ccc, D t'

const todayFormat = 'D'
const todayWithDayFormat = 'ccc, D'

/** Calculate answers. */
export function calculate() {
  if (app.refreshCM) {
    cm.refresh()
  }

  let answers = ''
  let answerCopy = ''

  const dateTime = DateTime.now().setLocale(app.settings.locale)

  app.mathScope = {}

  app.mathScope.now = dateTime.toFormat(app.settings.dateDay ? nowWithDayFormat : nowFormat)
  app.mathScope.today = dateTime.toFormat(app.settings.dateDay ? todayWithDayFormat : todayFormat)

  app.mathScope.avgs = []
  app.mathScope.totals = []
  app.mathScope.subtotals = []

  cm.eachLine((line) => {
    const cmLineNo = cm.getLineNumber(line)
    const lineNo = cmLineNo + 1

    if (app.settings.rulers) {
      cm.removeLineClass(line, 'wrap', 'noRuler')
      cm.addLineClass(line, 'wrap', 'ruler')
    } else {
      cm.removeLineClass(line, 'wrap', 'ruler')
      cm.addLineClass(line, 'wrap', 'noRuler')
    }

    cm.removeLineClass(line, 'gutter', 'lineNoError')

    let answer = ''
    let cmLine = line.text.trim().split('//')[0].split('#')[0]

    if (cmLine) {
      try {
        cmLine =
          lineNo > 1 &&
          cmLine.charAt(0).match(/[+\-*/]/) &&
          cm.getLine(lineNo - 2).length > 0 &&
          app.settings.contPrevLine
            ? app.mathScope.ans + cmLine
            : cmLine

        if (checkLocale()) {
          cmLine = cmLine.replace(/[,;]/g, (match) => (match === ',' ? '.' : ','))
        }

        try {
          answer = math.evaluate(cmLine, app.mathScope)
        } catch (e) {
          if (cmLine.match(/:/)) {
            try {
              math.evaluate(cmLine.split(':')[0])
            } catch (e) {
              cmLine = cmLine.substring(cmLine.indexOf(':') + 1)
            }
          }

          while (cmLine.match(/\([^)]+\)/)) {
            let s = cmLine.substring(cmLine.lastIndexOf('(') + 1)
            let sp = cmLine.substring(cmLine.lastIndexOf('('))

            s = s.substring(0, s.indexOf(')'))
            sp = sp.substring(0, sp.indexOf(')') + 1)

            if (sp.length === 0) {
              break
            }

            try {
              cmLine = cmLine.replace(sp, solveLine(s))
            } catch (e) {
              break
            }
          }

          answer = solveLine(cmLine)
        }

        if (answer !== undefined) {
          app.mathScope.ans = answer
          app.mathScope['line' + lineNo] = answer

          if (!isNaN(answer)) {
            app.mathScope.avgs.push(answer)
            app.mathScope.totals.push(answer)
            app.mathScope.subtotals.push(answer)
          }

          answer = math.format(answer, {
            notation: app.settings.expNotation ? 'exponential' : 'auto',
            lowerExp: app.settings.expLower,
            upperExp: app.settings.expUpper
          })

          const answerCopyInit = answer

          answer = formatAnswer(answer, false)
          answerCopy = formatAnswer(answerCopyInit, true)

          if (answer.match(/\w\(x\)/)) {
            const plotAns = /\w\(x\)$/.test(answer) ? cmLine.trim() : answer.trim()

            answer = `<a class="plotButton" data-func="${plotAns}">Plot</a>`

            app.mathScope.ans = plotAns
            app.mathScope['line' + lineNo] = plotAns
          }
        } else {
          app.mathScope.subtotals.length = 0

          answer = ''
        }
      } catch (e) {
        const errStr = String(e).replace(/'|"/g, '`')

        answer = app.settings.lineErrors
          ? `<a class="lineError" data-line="${lineNo}" data-error="${errStr}">Error</a>`
          : ''

        if (app.settings.lineErrors) {
          cm.addLineClass(cmLineNo, 'gutter', 'lineNoError')
        }
      }
    } else {
      app.mathScope.subtotals.length = 0
    }

    answers += `
      <div class="${app.settings.rulers ? 'ruler' : 'noRuler'}" line-no=${cmLineNo} style="height:${line.height - 1}px">
        <span class="${answer && !answer.startsWith('<a') ? 'answer' : ''}" data-copy="${answerCopy}">${answer}</span>
      </div>`
  })

  $('#output').innerHTML = answers

  store.set('input', cm.getValue())
}

function solveLine(line) {
  const avg = math.evaluate(app.mathScope.avgs.length > 0 ? '(' + math.mean(app.mathScope.avgs) + ')' : '0')
  const total = math.evaluate(app.mathScope.totals.length > 0 ? '(' + app.mathScope.totals.join('+') + ')' : '0')
  const subtotal = math.evaluate(
    app.mathScope.subtotals.length > 0 ? '(' + app.mathScope.subtotals.join('+') + ')' : '0'
  )

  line = line
    .replace(/\bans\b/g, app.mathScope.ans)
    .replace(/\bnow\b/g, app.mathScope.now)
    .replace(/\btoday\b/g, app.mathScope.today)
    .replace(/\bavg\b/g, avg)
    .replace(/\btotal\b/g, total)
    .replace(/\bsubtotal\b/g, subtotal)

  const lineNoMatch = line.match(/\bline\d+\b/g)

  if (lineNoMatch) {
    lineNoMatch.forEach((n) => {
      line = app.mathScope[n] ? line.replace(n, app.mathScope[n]) : n
    })
  }

  const dateTimeReg =
    /[+-] * .* *(millisecond|second|minute|hour|day|week|month|quarter|year|decade|century|centuries|millennium|millennia)s?/g

  if (line.match(dateTimeReg)) {
    const lineDate = line.replace(dateTimeReg, '').trim()
    const lineDateRight = line.replace(lineDate, '').trim()

    const locale = { locale: app.settings.locale }

    const lineDateNow = DateTime.fromFormat(lineDate, app.settings.dateDay ? nowWithDayFormat : nowFormat, locale)
    const lineDateToday = DateTime.fromFormat(lineDate, app.settings.dateDay ? todayWithDayFormat : todayFormat, locale)

    const lineDateTime = lineDateNow.isValid ? lineDateNow : lineDateToday.isValid ? lineDateToday : false
    const rightOfDate = String(math.evaluate(lineDateRight + ' to hours', app.mathScope))
    const durHrs = Number(rightOfDate.split(' ')[0])

    if (lineDateTime) {
      const dtLine = lineDateTime
        .plus({ hours: durHrs })
        .toFormat(
          lineDateNow.isValid
            ? app.settings.dateDay
              ? nowWithDayFormat
              : nowFormat
            : app.settings.dateDay
            ? todayWithDayFormat
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
    line = line.replace(pcntOfReg, '/100*')
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
 * @param {*} answer Value to format.
 * @param {boolean} forCopy Include thousands separator - True|False
 * @returns
 */
export function formatAnswer(answer, forCopy) {
  answer = String(answer)

  const a = answer.trim().split(' ')[0]
  const b = answer.replace(a, '')
  const digits = {
    maximumFractionDigits: app.settings.precision,
    useGrouping: forCopy ? app.settings.copyThouSep : app.settings.thouSep
  }

  const formattedAnswer =
    !a.includes('e') && !isNaN(a)
      ? Number(a).toLocaleString(app.settings.locale, digits) + b
      : a.match(/e[+-]?\d+/) && !isNaN(a.split('e')[0])
      ? Number(a.split('e')[0]).toLocaleString(app.settings.locale, digits) + 'e' + answer.split('e')[1]
      : stripAnswer(answer)

  return formattedAnswer
}
