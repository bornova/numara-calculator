/* global appInfo, CodeMirror, DeepDiff, feather, fetch, localStorage, location, luxon, math, Mousetrap, UIkit  */
/* eslint no-new-func: 0 */

// Get element by id
const $ = (id) => document.getElementById(id)

// localStorage
const ls = {
  get: (key) => JSON.parse(localStorage.getItem(key)),
  set: (key, value) => {
    localStorage.setItem(key, JSON.stringify(value))
  }
}

const DateTime = luxon.DateTime

// App action buttons
feather.replace()

// Initialize input
const cm = CodeMirror.fromTextArea($('inputArea'), {
  theme: 'numara',
  coverGutterNextToScrollbar: true,
  inputStyle: 'textarea',
  viewportMargin: Infinity
})

cm.setValue(ls.get('input') || '')
cm.execCommand('goDocEnd')

$('udfInput').setAttribute('placeholder', `// Define new functions and variables:
myvalue: 42,
hello: (name) => {
  return "hello, " + name + "!"
}`)

const udfInput = CodeMirror.fromTextArea($('udfInput'), {
  mode: 'javascript',
  autoCloseBrackets: true,
  smartIndent: false
})

$('uduInput').setAttribute('placeholder', `// Define new units:
foo: {
  prefixes: "long",
  baseName: "essence-of-foo"
},
bar: "40 foo",
baz: {
  definition: "1 bar/hour",
  prefixes: "long"
}`)

const uduInput = CodeMirror.fromTextArea($('uduInput'), {
  mode: 'javascript',
  autoCloseBrackets: true,
  smartIndent: false
})

// User agent
const isMac = navigator.userAgent.toLowerCase().includes('mac')
const isNode = navigator.userAgent.toLowerCase().includes('electron')
const ipc = isNode ? require('electron').ipcRenderer : null

// Set app info
document.title = appInfo.description
$('dialog-about-title').innerHTML = appInfo.description
$('dialog-about-copyright').innerHTML = `Copyright ©️ ${DateTime.local().year} ${appInfo.author}`
$('dialog-about-appVersion').innerHTML = isNode
  ? 'Version ' + appInfo.version
  : `Version ${appInfo.version}
    <div class="versionCtnr">
      <div>
        <a href="https://github.com/bornova/numara-calculator/releases" target="_blank">Download desktop version</a>
      </div>
    </div>`
$('gitLink').setAttribute('href', appInfo.homepage)
$('webLink').setAttribute('href', appInfo.website)
$('licenseLink').setAttribute('href', appInfo.homepage + '/blob/master/LICENSE')

if (isNode) {
  ipc.on('themeUpdate', applySettings)
  ipc.on('fullscreen', (event, isFullscreen) => {
    if (isFullscreen) {
      ipc.send('maximize')
    }
  })
} else {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker
      .register('./sw.js')
      .catch(() => {
        console.log('Service worker registration failed')
      })
  }
}

// Set headers
if (isNode && !isMac) {
  $('header-mac').remove()
  $('header-win').style.display = 'block'
  $('header-win-title').innerHTML = appInfo.productName

  $('max').style.display = ipc.sendSync('isMaximized') ? 'none' : 'block'
  $('unmax').style.display = ipc.sendSync('isMaximized') ? 'block' : 'none'

  $('winButtons').addEventListener('click', (e) => {
    switch (e.target.id) {
      case 'min':
        ipc.send('minimize')
        break
      case 'max':
        ipc.send('maximize')
        break
      case 'unmax':
        ipc.send('unmaximize')
        break
      case 'close':
        ipc.send('close')
        break
    }
    e.stopPropagation()
  })

  ipc.on('isMax', (event, isMax) => {
    $('unmax').style.display = isMax ? 'block' : 'none'
    $('max').style.display = isMax ? 'none' : 'block'
  })

  $('header-win').addEventListener('dblclick', toggleMax)
} else {
  $('header-win').remove()
  $('header-mac').style.display = 'block'
  $('header-mac-title').innerHTML = appInfo.productName

  if (isNode) {
    $('header-mac').addEventListener('dblclick', toggleMax)
  }
}

function toggleMax () {
  ipc.send(ipc.sendSync('isMaximized') ? 'unmaximize' : 'maximize')
}

// App settings
let settings

const defaultSettings = {
  app: {
    autocomplete: true,
    closeBrackets: true,
    contPrevLine: true,
    currencies: true,
    dateDay: false,
    dateFormat: 'M/d/yyyy',
    divider: true,
    fontSize: '1.1rem',
    fontWeight: '400',
    keywordTips: true,
    lineErrors: true,
    lineNumbers: true,
    lineWrap: true,
    matchBrackets: true,
    matrixType: 'Matrix',
    numericOutput: 'number',
    precision: '4',
    predictable: false,
    syntax: true,
    theme: 'system',
    thouSep: true,
    timeFormat: 'h:mm a'
  },
  inputWidth: 60,
  plot: {
    plotArea: false,
    plotCross: false,
    plotGrid: false
  }
}

settings = ls.get('settings')

if (settings) {
  // Check for and apply changes
  DeepDiff.observableDiff(settings, defaultSettings, (d) => {
    if (d.kind !== 'E') {
      DeepDiff.applyChange(settings, defaultSettings, d)
      ls.set('settings', settings)
    }
  })
} else {
  settings = defaultSettings
  ls.set('settings', defaultSettings)
}

// Exchange rates
math.createUnit('USD', {
  aliases: ['usd']
})

let currencyRates = {}

function getRates () {
  const url = 'https://www.floatrates.com/widget/1030/cfc5515dfc13ada8d7b0e50b8143d55f/usd.json'
  if (navigator.onLine) {
    $('lastUpdated').innerHTML = '<div uk-spinner="ratio: 0.3"></div>'
    fetch(url)
      .then((response) => response.json())
      .then((rates) => {
        currencyRates = rates
        const dups = ['cup']
        Object.keys(rates).forEach((currency) => {
          math.createUnit(rates[currency].code, {
            definition: math.unit(rates[currency].inverseRate + 'USD'),
            aliases: [dups.includes(rates[currency].code.toLowerCase()) ? '' : rates[currency].code.toLowerCase()]
          }, {
            override: true
          })
          ls.set('rateDate', rates[currency].date)
        })
        applySettings()
        $('lastUpdated').innerHTML = ls.get('rateDate')
      }).catch((e) => {
        $('lastUpdated').innerHTML = 'n/a'
        notify('Failed to get exchange rates (' + e + ')', 'warning')
      })
  } else {
    $('lastUpdated').innerHTML = 'No internet connection.'
    notify('No internet connection. Could not update exchange rates.', 'warning')
  }
}

// Calculate
function calculate () {
  let answers = []
  const avgs = []
  const totals = []
  const subtotals = []
  const scope = {}
  const solverScope = {}
  const expLim = {
    lowerExp: -12,
    upperExp: 12
  }
  const digits = {
    maximumFractionDigits: settings.app.precision
  }

  scope.now = DateTime.local().toFormat((settings.app.dateDay ? 'ccc, ' : '') + settings.app.dateFormat + ' ' + settings.app.timeFormat)
  scope.today = DateTime.local().toFormat((settings.app.dateDay ? 'ccc, ' : '') + settings.app.dateFormat)

  cm.refresh()
  cm.eachLine((line) => {
    const cmLineNo = cm.getLineNumber(line)
    const lineNo = cmLineNo + 1
    const lineHeight = line.height

    let answer = ''
    let cmLine = line.text.trim().split('//')[0].split('#')[0]

    cm.removeLineClass(cmLineNo, 'gutter', 'lineNoError')

    if (cmLine) {
      try {
        cmLine = lineNo > 1 && cmLine.charAt(0).match(/[+\-*/]/) && cm.getLine(lineNo - 2).length > 0 && settings.app.contPrevLine
          ? scope.ans + cmLine
          : cmLine

        try {
          answer = math.evaluate(cmLine, scope)
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
            if (sp.length === 0) break

            try {
              cmLine = cmLine.replace(sp, solve(s))
            } catch (e) {
              break
            }
          }

          answer = solve(cmLine)
        }

        if (answer !== undefined) {
          scope.ans = answer
          scope['line' + lineNo] = answer

          if (!isNaN(answer)) {
            avgs.push(answer)
            totals.push(answer)
            subtotals.push(answer)
          }

          answer = format(math.format(answer, expLim))

          if (answer.match(/\w\(x\)/)) {
            const plotAns = /\w\(x\)$/.test(answer) ? cmLine.trim() : answer.trim()
            answer = `<a class="plotButton" data-func="${plotAns}">Plot</a>`
            scope.ans = plotAns
            scope['line' + lineNo] = plotAns
          }
        } else {
          subtotals.length = 0
          answer = ''
        }
      } catch (e) {
        const errStr = String(e).replace(/'|"/g, '`')
        answer = settings.app.lineErrors ? `<a class="lineError" data-line="${lineNo}" data-error="${errStr}">Error</a>` : ''
        if (settings.app.lineErrors) {
          cm.addLineClass(cmLineNo, 'gutter', 'lineNoError')
        }
      }
    } else {
      subtotals.length = 0
    }

    answers += `
      <div style="height:${lineHeight}px">
        <span class="${answer && !answer.startsWith('<a') ? 'answer' : ''}" >${answer}</span>
      </div>`
  })

  $('output').innerHTML = answers

  $('clearButton').className = cm.getValue() === '' ? 'noAction' : 'action'
  $('printButton').className = cm.getValue() === '' ? 'noAction' : 'action'
  $('saveButton').className = cm.getValue() === '' ? 'noAction' : 'action'

  ls.set('input', cm.getValue())

  function solve (line) {
    solverScope.avg = math.evaluate(avgs.length > 0 ? '(' + math.mean(avgs) + ')' : 0)
    solverScope.total = math.evaluate(totals.length > 0 ? '(' + totals.join('+') + ')' : 0)
    solverScope.subtotal = math.evaluate(subtotals.length > 0 ? '(' + subtotals.join('+') + ')' : 0)

    line = line
      .replace(/\bans\b/g, scope.ans)
      .replace(/\bnow\b/g, scope.now)
      .replace(/\btoday\b/g, scope.today)
      .replace(/\bavg\b/g, solverScope.avg)
      .replace(/\btotal\b/g, solverScope.total)
      .replace(/\bsubtotal\b/g, solverScope.subtotal)

    const lineNoReg = line.match(/\bline\d+\b/g)
    if (lineNoReg) {
      lineNoReg.forEach((n) => {
        line = line.replace(n, scope[n])
      })
    }

    const dateTimeReg = /'millisecond|second|minute|hour|day|week|month|quarter|year|decade|century|centuries|millennium|millennia'/g
    if (line.match(dateTimeReg)) {
      const lineDate = line.split(/[+-]/)
      const lineDateLeft = lineDate[0].replace(/[A-Za-z]+,/, '').trim()
      const lineDateRight = line.replace(lineDate[0], '').trim()
      const todayFormat = settings.app.dateFormat
      const nowFormat = settings.app.dateFormat + ' ' + settings.app.timeFormat
      const t = DateTime.fromFormat(lineDateLeft, todayFormat)
      const n = DateTime.fromFormat(lineDateLeft, nowFormat)
      const dt = t.isValid ? t : n.isValid ? n : null
      const rightOfDate = String(math.evaluate(lineDateRight + ' to hours', scope))
      const durHrs = Number(rightOfDate.split(' ')[0])

      if (dt) {
        const isToday = dt.toFormat(settings.app.dateFormat + 'hh:mm:ss:SSS').endsWith('12:00:00:000')
        line = '"' + dt.plus({ hours: durHrs }).toFormat((settings.app.dateDay ? 'ccc, ' : '') + (isToday ? todayFormat : nowFormat)) + '"'
      } else {
        return 'Invalid Date'
      }
    }

    const pcntOfReg = /%[ ]*of[ ]*/g
    const pcntOfRegC = /[\w.]*%[ ]*of[ ]*/g

    line = line.match(pcntOfRegC) ? line.replace(pcntOfReg, '/100*') : line

    return math.evaluate(line, scope)
  }

  function strip (s) {
    let t = s.length
    if (s.charAt(0) === '"') {
      s = s.substring(1, t--)
    }
    if (s.charAt(--t) === '"') {
      s = s.substring(0, t)
    }

    return s
  }

  function format (answer) {
    answer = String(answer)
    const a = answer.trim().split(' ')[0]
    const b = answer.replace(a, '')
    const formattedAnswer = !a.includes('e') && !isNaN(a)
      ? (settings.app.thouSep ? Number(a).toLocaleString(undefined, digits) + b : parseFloat(Number(a).toFixed(settings.app.precision)) + b)
      : (a.match(/e-?\d+/) ? parseFloat(Number(a.split('e')[0]).toFixed(settings.app.precision)) + 'e' + answer.split('e')[1] + b : strip(answer))

    return formattedAnswer
  }
}

// User defined functions and units
const udfList = []
const uduList = []

UIkit.util.on('#dialog-udfu', 'beforeshow', () => {
  $('udfSyntaxError').innerHTML = ''
  $('uduSyntaxError').innerHTML = ''
  const udf = ls.get('udf').trim()
  const udu = ls.get('udu').trim()
  udfInput.setValue(udf)
  uduInput.setValue(udu)
})
UIkit.util.on('#dialog-udfu', 'shown', () => {
  udfInput.refresh()
  uduInput.refresh()
})

function applyUdf (udf) {
  try {
    const loadUdf = new Function(`'use strict'; math.import({${udf}}, {override: true})`)
    loadUdf()
    calculate()
    ls.set('udf', udf)

    const udfFunc = new Function(`'use strict'; return {${udf}}`)
    const udfObj = udfFunc()

    for (const f in udfObj) {
      udfList.push(f)
    }

    UIkit.modal('#dialog-udfu').hide()
  } catch (e) {
    $('udfSyntaxError').innerHTML = e
  }
}

function applyUdu (udu) {
  try {
    const loadUdu = new Function(`'use strict'; math.createUnit({${udu}}, {override: true})`)
    loadUdu()
    calculate()
    ls.set('udu', udu)

    const uduFunc = new Function(`'use strict'; return {${udu}}`)
    const uduObj = uduFunc()

    for (const f in uduObj) {
      uduList.push(f)
    }

    UIkit.modal('#dialog-udfu').hide()
  } catch (e) {
    $('uduSyntaxError').innerHTML = e
  }
}

if (!ls.get('udf')) {
  ls.set('udf', '')
}

if (!ls.get('udu')) {
  ls.set('udu', '')
}

applyUdf(ls.get('udf'))
applyUdu(ls.get('udu'))

// Codemirror syntax templates
CodeMirror.defineMode('numara', () => {
  return {
    token: (stream, state) => {
      if (stream.match(/\/\/.*/) || stream.match(/#.*/)) return 'comment'
      if (stream.match(/\d/)) return 'number'
      if (stream.match(/(?:\+|-|\*|\/|,|;|\.|:|@|~|=|>|<|&|\||_|`|'|\^|\?|!|%)/)) return 'operator'

      stream.eatWhile(/\w/)
      const str = stream.current()

      if (settings.app.currencies && (str.toLowerCase() in currencyRates || str.toLowerCase() === 'usd')) return 'currency'

      try {
        if (math.unit(str).units.length > 0) return 'unit'
      } catch (e) { }

      if (udfList.includes(str)) return 'udf'
      if (uduList.includes(str)) return 'udu'

      if (typeof math[str] === 'function' && Object.getOwnPropertyNames(math[str]).includes('signatures')) return 'function'
      if (str.match(/\b(?:ans|total|subtotal|avg|today|now|line\d+)\b/)) return 'scope'

      try {
        math.evaluate(str)
      } catch (e) {
        return 'variable'
      }

      stream.next()
      return 'space'
    }
  }
})

CodeMirror.defineMode('plain', () => {
  return {
    token: (stream, state) => {
      stream.next()
      return 'text'
    }
  }
})

// Codemirror autocomplete hints
const numaraHints = ['ans', 'now', 'today', 'total', 'subtotal', 'avg']
Object.getOwnPropertyNames(math).forEach((f) => {
  if (typeof math[f] === 'function' && Object.getOwnPropertyNames(math[f]).includes('signatures')) {
    numaraHints.push(f)
  }
})

CodeMirror.registerHelper('hint', 'numaraHints', (editor) => {
  const cur = editor.getCursor()
  const curLine = editor.getLine(cur.line)
  let start = cur.ch
  let end = start
  while (end < curLine.length && /[\w$]/.test(curLine.charAt(end))) { ++end }
  while (start && /[\w$]/.test(curLine.charAt(start - 1))) { --start }
  const curWord = start !== end && curLine.slice(start, end)
  const regex = new RegExp('^' + curWord, 'i')
  return {
    list: (!curWord ? [] : numaraHints.filter((item) => item.match(regex))).sort(),
    from: CodeMirror.Pos(cur.line, start),
    to: CodeMirror.Pos(cur.line, end)
  }
})

CodeMirror.commands.autocomplete = (cm) => {
  CodeMirror.showHint(cm, CodeMirror.hint.numaraHints, {
    completeSingle: false
  })
}

// Codemirror handlers
cm.on('changes', calculate)
cm.on('inputRead', (cm, event) => {
  if (settings.app.autocomplete) {
    CodeMirror.commands.autocomplete(cm)
  }
})
cm.on('update', () => {
  const funcs = document.getElementsByClassName('cm-function')
  if (funcs.length > 0 && settings.app.keywordTips) {
    for (const f of funcs) {
      try {
        const res = JSON.stringify(math.help(f.innerHTML).toJSON())
        const obj = JSON.parse(res)
        UIkit.tooltip(f, {
          title: obj.description,
          pos: 'top-left'
        })
      } catch (e) {
        UIkit.tooltip(f, {
          title: 'Description not available.',
          pos: 'top-left'
        })
      }
    }
  }

  const udfs = document.getElementsByClassName('cm-udf')
  if (udfs.length > 0 && settings.app.keywordTips) {
    for (const f of udfs) {
      UIkit.tooltip(f, {
        title: 'User defined function.',
        pos: 'top-left'
      })
    }
  }

  const udus = document.getElementsByClassName('cm-udu')
  if (udus.length > 0 && settings.app.keywordTips) {
    for (const u of udus) {
      UIkit.tooltip(u, {
        title: 'User defined unit.',
        pos: 'top-left'
      })
    }
  }

  const curr = document.getElementsByClassName('cm-currency')
  if (curr.length > 0 && settings.app.keywordTips) {
    for (const c of curr) {
      try {
        const curr = c.innerHTML.toLowerCase()
        const currName = curr === 'usd' ? 'U.S. Dollar' : currencyRates[curr].name
        UIkit.tooltip(c, {
          title: currName,
          pos: 'top-left'
        })
      } catch (e) {
        UIkit.tooltip(c, {
          title: 'Description not available.',
          pos: 'top-left'
        })
      }
    }
  }

  const units = document.getElementsByClassName('cm-unit')
  if (units.length > 0 && settings.app.keywordTips) {
    for (const u of units) {
      UIkit.tooltip(u, {
        title: `Unit '${u.innerHTML}'`,
        pos: 'top-left'
      })
    }
  }
})

// Apply settings
function applySettings () {
  settings = ls.get('settings')

  $('style').setAttribute('href',
    settings.app.theme === 'system'
      ? (isNode ? (ipc.sendSync('isDark') ? 'css/dark.css' : 'css/light.css') : 'css/light.css')
      : settings.app.theme === 'light' ? 'css/light.css' : 'css/dark.css')

  if (isNode) {
    ipc.send('setTheme', settings.app.theme)
  }

  const elements = document.querySelectorAll('.panelFont, .CodeMirror')
  for (const el of elements) {
    el.style.fontSize = settings.app.fontSize
    el.style.fontWeight = settings.app.fontWeight
  }

  $('input').style.width = (settings.app.divider ? settings.inputWidth : defaultSettings.inputWidth) + '%'
  $('divider').style.display = settings.app.divider ? 'block' : 'none'
  $('output').style.textAlign = settings.app.divider ? 'left' : 'right'

  cm.setOption('mode', settings.app.syntax ? 'numara' : 'plain')
  cm.setOption('lineNumbers', settings.app.lineNumbers)
  cm.setOption('lineWrapping', settings.app.lineWrap)
  cm.setOption('autoCloseBrackets', settings.app.closeBrackets)
  cm.setOption('matchBrackets', settings.app.syntax && settings.app.matchBrackets ? { maxScanLines: 1 } : false)

  const theme = settings.app.theme === 'system'
    ? (isNode ? (ipc.sendSync('isDark') ? 'material-darker' : 'default') : 'default')
    : (settings.app.theme === 'light' ? 'default' : 'material-darker')

  udfInput.setOption('theme', theme)
  uduInput.setOption('theme', theme)

  math.config({
    matrix: settings.app.matrixType,
    number: settings.app.numericOutput,
    predictable: settings.app.predictable
  })

  setTimeout(calculate, 15)
}
applySettings()
if (settings.app.currencies) {
  getRates()
}

// Tooltip defaults
UIkit.mixin({
  data: {
    delay: 500,
    offset: 5
  }
}, 'tooltip')

// Show modal dialog
function showModal (id) {
  UIkit.modal(id, {
    bgClose: false,
    stack: true
  }).show()
}

UIkit.util.on('.modal', 'hidden', () => { cm.focus() })
UIkit.util.on('.uk-switcher', 'show', () => { cm.getInputField().blur() })

// Update open button count
const savedCount = () => Object.keys(ls.get('saved') || {}).length

function updateSavedCount () {
  UIkit.tooltip('#openButton', {
    title: 'Open (' + savedCount() + ')'
  })
}
updateSavedCount()

$('openButton').className = savedCount() > 0 ? 'action' : 'noAction'

// App button actions
$('actions').addEventListener('click', (e) => {
  switch (e.target.id) {
    case 'clearButton': // Clear board
      if (cm.getValue() !== '') {
        cm.setValue('')
        cm.focus()
        calculate()
      }
      break
    case 'printButton': // Print calculations
      UIkit.tooltip('#printButton').hide()
      if (cm.getValue() !== '') {
        $('print-title').innerHTML = appInfo.productName
        $('printBox').innerHTML = $('panel').innerHTML
        if (isNode) {
          ipc.send('print')
          ipc.on('printReply', (event, response) => {
            if (response) {
              notify(response)
            }
            $('printBox').innerHTML = ''
          })
        } else {
          window.print()
        }
      }
      break
    case 'saveButton': // Save calcualtions
      if (cm.getValue() !== '') {
        $('saveTitle').value = ''
        showModal('#dialog-save')
        $('saveTitle').focus()
      }
      break
    case 'openButton': // Open saved calculations
      if (Object.keys(ls.get('saved') || {}).length > 0) {
        showModal('#dialog-open')
      }
      break
    case 'udfuButton': // Open custom functions dialog
      showModal('#dialog-udfu')
      break
    case 'settingsButton': // Open settings dialog
      showModal('#dialog-settings')
      break
    case 'helpButton': // Open help dialog
      showModal('#dialog-help')
      $('searchBox').focus()
      break
    case 'aboutButton': // Open app info dialog
      showModal('#dialog-about')
      break
  }
  e.stopPropagation()
})

// Output actions
$('output').addEventListener('click', (e) => {
  switch (e.target.className) {
    case 'answer':
      navigator.clipboard.writeText(e.target.innerText)
      notify(`Copied '${e.target.innerText}' to clipboard.`)
      break
    case 'plotButton': // Plot function
      func = e.target.getAttribute('data-func')
      try {
        $('plotGrid').checked = settings.plot.plotGrid
        $('plotCross').checked = settings.plot.plotCross
        $('plotArea').checked = settings.plot.plotArea
        plot()
        showModal('#dialog-plot')
      } catch (error) {
        showError(error)
      }
      break
    case 'lineError': // Show line error
      showError(e.target.getAttribute('data-error'), 'Error on Line ' + e.target.getAttribute('data-line'))
      break
  }
  e.stopPropagation()
})

$('output').addEventListener('mousedown', () => {
  const sels = document.getElementsByClassName('CodeMirror-selected')
  while (sels[0]) {
    sels[0].classList.remove('CodeMirror-selected')
  }
})

// Dialog button actions
document.addEventListener('click', (e) => {
  const id = DateTime.local().toFormat('yyyyMMddHHmmssSSS')
  const savedItems = ls.get('saved') || {}
  const data = cm.getValue()
  const title = $('saveTitle').value.replace(/<|>/g, '').trim() || 'No title'

  switch (e.target.id) {
    case 'dialog-save-save': // Save calculation
      savedItems[id] = [title, data]
      ls.set('saved', savedItems)
      UIkit.modal('#dialog-save').hide()
      $('openButton').className = 'action'
      updateSavedCount()
      notify('Saved')
      break
    case 'dialog-open-deleteAll': // Delete all saved calculations
      confirm('All saved calculations will be deleted.', () => {
        localStorage.removeItem('saved')
        populateSaved()
        UIkit.modal('#dialog-open').hide()
        notify('Deleted all saved calculations')
      })
      break
    case 'dialog-udfu-save-f': // Save custom functions
      applyUdf(udfInput.getValue().trim())
      break
    case 'dialog-udfu-save-u': // Save custom functions
      applyUdu(uduInput.getValue().trim())
      break
    case 'defaultSettingsButton': // Revert back to default settings
      confirm('All settings will revert back to defaults.', () => {
        settings.app = defaultSettings.app
        ls.set('settings', settings)
        applySettings()
        if (!$('currencyButton').checked) {
          getRates()
        }
        prepSettings()
      })
      break
    case 'dialog-settings-reset': // Reset app
      confirm('All user settings and data will be lost.', () => {
        if (isNode) {
          ipc.send('resetApp')
        } else {
          localStorage.clear()
          location.reload()
        }
      })
      break
    case 'resetSizeButton': // Reset window size
      if (isNode) {
        ipc.send('resetSize')
      }
      break
    case 'syntaxButton':
      syntaxToggle()
      break
    case 'bigNumWarn': // BigNumber warning
      showError(`Using the BigNumber may break function plotting and is not compatible with some math functions. 
      It may also cause unexpected behavior and affect overall performance.<br><br>
      <a target="_blank" href="https://mathjs.org/docs/datatypes/bignumbers.html">Read more on BigNumbers</a>`, 'Caution: BigNumber Limitations')
      break
    case 'currencyButton': // Enable currency rates
      $('currencyUpdate').style.visibility = $('currencyButton').checked ? 'visible' : 'hidden'
      break
    // Plot settings
    case 'plotGrid':
      settings.plot.plotGrid = $('plotGrid').checked
      ls.set('settings', settings)
      plot()
      break
    case 'plotCross':
      settings.plot.plotCross = $('plotCross').checked
      ls.set('settings', settings)
      plot()
      break
    case 'plotArea':
      settings.plot.plotArea = $('plotArea').checked
      ls.set('settings', settings)
      plot()
      break

    case 'restartButton': // Restart to update
      ipc.send('updateApp')
      break

    case 'demoButton': // Load demo
      cm.setValue(demo)
      calculate()
      UIkit.modal('#dialog-help').hide()
      break
  }
})

// Open saved calculations dialog actions
$('dialog-open').addEventListener('click', (e) => {
  let pid
  const saved = ls.get('saved')
  if (e.target.parentNode.getAttribute('data-action') === 'load') {
    pid = e.target.parentNode.parentNode.id
    cm.setValue(saved[pid][1])
    calculate()
    UIkit.modal('#dialog-open').hide()
  }
  if (e.target.getAttribute('data-action') === 'delete') {
    pid = e.target.parentNode.id
    confirm('Calculation "' + saved[pid][0] + '" will be deleted.', () => {
      delete saved[pid]
      ls.set('saved', saved)
      populateSaved()
    })
  }
})

// Populate saved calculation
UIkit.util.on('#dialog-open', 'beforeshow', populateSaved)

function populateSaved () {
  const obj = ls.get('saved') || {}
  const savedItems = Object.entries(obj)
  $('dialog-open-body').innerHTML = ''
  if (savedItems.length > 0) {
    $('dialog-open-deleteAll').disabled = false
    savedItems.forEach(([id, val]) => {
      $('dialog-open-body').innerHTML += `
        <div class="dialog-open-wrapper" id="${id}">
          <div data-action="load">
            <div class="dialog-open-title">${val[0]}</div>
            <div class="dialog-open-date">${DateTime.fromFormat(id, 'yyyyMMddHHmmssSSS').toFormat('ff')}</div>
          </div>
          <span class="dialog-open-delete" data-action="delete"><i data-feather="x-circle"></i></span>
        </div>`
    })
    feather.replace()
  } else {
    $('dialog-open-deleteAll').disabled = true
    $('dialog-open-body').innerHTML = 'No saved calculations.'
    $('openButton').className = 'noAction'
  }
  updateSavedCount()
}

// Initiate settings dialog
UIkit.util.on('#setswitch', 'beforeshow', (e) => {
  e.stopPropagation()
})
UIkit.util.on('#dialog-settings', 'beforeshow', prepSettings)
UIkit.util.on('#dialog-settings', 'hidden', () => {
  cm.focus()
})

function prepSettings () {
  const dateFormats = ['M/d/yyyy', 'd/M/yyyy', 'MMM d, yyyy']
  const timeFormats = ['h:mm a', 'H:mm']
  const matrixTypes = ['Matrix', 'Array']
  const numericOutputs = ['number', 'BigNumber', 'Fraction']

  $('themeList').value = settings.app.theme
  $('fontSize').value = settings.app.fontSize
  $('fontWeight').value = settings.app.fontWeight
  $('dateFormat').innerHTML = ''
  for (const d of dateFormats) {
    $('dateFormat').innerHTML += `<option value="${d}">${DateTime.local().toFormat(d)}</option>`
  }
  $('dateFormat').value = settings.app.dateFormat
  $('timeFormat').innerHTML = ''
  for (const t of timeFormats) {
    $('timeFormat').innerHTML += `<option value="${t}">${DateTime.local().toFormat(t)}</option>`
  }
  $('timeFormat').value = settings.app.timeFormat
  $('dateDay').checked = settings.app.dateDay
  $('syntaxButton').checked = settings.app.syntax
  syntaxToggle()
  $('keywordTipsButton').checked = settings.app.keywordTips
  $('matchBracketsButton').checked = settings.app.matchBrackets
  $('precisionRange').value = settings.app.precision
  $('precision-label').innerHTML = settings.app.precision
  $('numericOutput').innerHTML = ''
  for (const n of numericOutputs) {
    $('numericOutput').innerHTML += `<option value="${n}">${n.charAt(0).toUpperCase() + n.slice(1)}</option>`
  }
  $('numericOutput').value = settings.app.numericOutput
  if (settings.app.numericOutput === 'BigNumber') {
    bigNumberWarning()
  }
  $('contPrevLineButton').checked = settings.app.contPrevLine
  $('matrixType').innerHTML = ''
  for (const m of matrixTypes) {
    $('matrixType').innerHTML += `<option value="${m}">${m}</option>`
  }
  $('matrixType').value = settings.app.matrixType
  $('predictableButton').checked = settings.app.predictable
  $('thouSepButton').checked = settings.app.thouSep
  $('currencyButton').checked = settings.app.currencies
  $('lastUpdated').innerHTML = settings.app.currencies ? ls.get('rateDate') : ''
  $('currencyUpdate').style.display = settings.app.currencies ? 'block' : 'none'
  $('autocompleteButton').checked = settings.app.autocomplete
  $('closeBracketsButton').checked = settings.app.closeBrackets
  $('dividerButton').checked = settings.app.divider
  $('lineNoButton').checked = settings.app.lineNumbers
  $('lineErrorButton').checked = settings.app.lineErrors
  $('lineWrapButton').checked = settings.app.lineWrap

  checkDefaultSettings()
  checkWindowSize()
}

function checkDefaultSettings () {
  $('defaultSettingsButton').style.display = DeepDiff.diff(settings.app, defaultSettings.app) ? 'inline' : 'none'
}

function checkWindowSize () {
  $('resetSizeButton').style.display = isNode ? (ipc.sendSync('isResized') && !ipc.sendSync('isMaximized') ? 'block' : 'none') : 'none'
}

function syntaxToggle () {
  $('keywordTipsButton').disabled = !$('syntaxButton').checked
  $('matchBracketsButton').disabled = !$('syntaxButton').checked

  $('keywordTipsButton').parentNode.style.opacity = $('syntaxButton').checked ? '1' : '0.5'
  $('matchBracketsButton').parentNode.style.opacity = $('syntaxButton').checked ? '1' : '0.5'
}

function bigNumberWarning () {
  $('bigNumWarn').style.display = $('numericOutput').value === 'BigNumber' ? 'inline-block' : 'none'
}

$('numericOutput').addEventListener('change', bigNumberWarning)
$('precisionRange').addEventListener('input', () => {
  $('precision-label').innerHTML = $('precisionRange').value
})

function saveSettings () {
  settings.app.theme = $('themeList').value
  settings.app.fontSize = $('fontSize').value
  settings.app.fontWeight = $('fontWeight').value
  settings.app.dateFormat = $('dateFormat').value
  settings.app.timeFormat = $('timeFormat').value
  settings.app.dateDay = $('dateDay').checked
  settings.app.syntax = $('syntaxButton').checked
  settings.app.keywordTips = $('keywordTipsButton').checked
  settings.app.matchBrackets = $('matchBracketsButton').checked
  settings.app.precision = $('precisionRange').value
  settings.app.numericOutput = $('numericOutput').value
  settings.app.contPrevLine = $('contPrevLineButton').checked
  settings.app.matrixType = $('matrixType').value
  settings.app.predictable = $('predictableButton').checked
  settings.app.thouSep = $('thouSepButton').checked
  if (!settings.app.currencies && $('currencyButton').checked) {
    getRates()
  } else if (!$('currencyButton').checked) {
    localStorage.removeItem('rateDate')
    currencyRates = {}
  }
  settings.app.currencies = $('currencyButton').checked
  settings.app.autocomplete = $('autocompleteButton').checked
  settings.app.closeBrackets = $('closeBracketsButton').checked
  settings.app.divider = $('dividerButton').checked
  settings.app.lineNumbers = $('lineNoButton').checked
  settings.app.lineErrors = $('lineErrorButton').checked
  settings.app.lineWrap = $('lineWrapButton').checked

  ls.set('settings', settings)
  checkDefaultSettings()
  applySettings()
}

document.querySelectorAll('.settingItem').forEach((el) => {
  el.addEventListener('change', saveSettings)
})

// Help dialog content
$('searchBox').addEventListener('input', () => {
  const str = $('searchBox').value.trim()
  if (str) {
    try {
      $('searchResults').innerHTML = ''
      const res = JSON.stringify(math.help(str).toJSON())
      const obj = JSON.parse(res)
      $('searchResults').innerHTML = `
        <div>Name:</div><div>${obj.name}</div>
        <div>Description:</div><div>${obj.description}</div>
        <div>Category:</div><div>${obj.category}</div>
        <div>Syntax:</div><div>${String(obj.syntax).split(',').join(', ')}</div>
        <div>Examples:</div><div>${String(obj.examples).split(',').join(', ')}</div>
        <div>Also see:</div><div>${String(obj.seealso).split(',').join(', ')}</div>
        `
    } catch (error) {
      $('searchResults').innerHTML = `No results for "${str}"`
    }
  } else {
    $('searchResults').innerHTML = 'Start typing above to search...'
  }
})

// Panel resizer
let resizeDelay
let isResizing = false

const panel = $('panel')
const divider = $('divider')

$('divider').addEventListener('dblclick', resetDivider)
$('divider').addEventListener('mousedown', (e) => {
  isResizing = e.target === divider
})
$('panel').addEventListener('mouseup', () => {
  isResizing = false
})
$('panel').addEventListener('mousemove', (e) => {
  const offset = settings.app.lineNumbers ? 12 : 27
  const pointerRelativeXpos = e.clientX - panel.offsetLeft - offset
  const iWidth = pointerRelativeXpos / panel.clientWidth * 100
  const inputWidth = iWidth < 0 ? 0 : iWidth > 100 ? 100 : iWidth
  if (isResizing) {
    $('input').style.width = inputWidth + '%'
    settings.inputWidth = inputWidth
    ls.set('settings', settings)
    clearTimeout(resizeDelay)
    resizeDelay = setTimeout(calculate, 10)
  }
})

function resetDivider () {
  settings.inputWidth = defaultSettings.inputWidth
  ls.set('settings', settings)
  applySettings()
}

// Plot
let func
let activePlot

const numaraPlot = window.functionPlot

function plot () {
  $('plotTitle').innerHTML = func

  const f = func.split('=')[1]
  let domain = math.abs(math.evaluate(f, {
    x: 0
  })) * 2

  if (domain === Infinity || domain === 0) {
    domain = 10
  }

  const xDomain = activePlot ? activePlot.meta.xScale.domain() : [-domain, domain]
  const yDomain = activePlot ? activePlot.meta.yScale.domain() : [-domain, domain]

  activePlot = numaraPlot({
    target: '#plot',
    height: $('plot').clientHeight,
    width: $('plot').clientWidth,
    xAxis: {
      domain: xDomain
    },
    yAxis: {
      domain: yDomain
    },
    tip: {
      xLine: settings.plot.plotCross,
      yLine: settings.plot.plotCross
    },
    grid: settings.plot.plotGrid,
    data: [{
      fn: f,
      graphType: 'polyline',
      closed: settings.plot.plotArea
    }],
    plugins: [numaraPlot.plugins.zoomBox()]
  })
}

UIkit.util.on('#dialog-plot', 'shown', plot)
UIkit.util.on('#dialog-plot', 'hide', () => {
  activePlot = false
})

// Relayout plot on window resize
let windowResizeDelay
window.addEventListener('resize', () => {
  if (activePlot && $('dialog-plot').classList.contains('uk-open')) {
    plot()
  }
  clearTimeout(windowResizeDelay)
  windowResizeDelay = setTimeout(calculate, 10)
  checkWindowSize()
})

// Show confirmation dialog
function confirm (msg, action) {
  $('confirmMsg').innerHTML = msg
  showModal('#dialog-confirm')
  const yesAction = (e) => {
    action()
    e.stopPropagation()
    UIkit.modal('#dialog-confirm').hide()
    $('confirm-yes').removeEventListener('click', yesAction)
  }
  $('confirm-yes').addEventListener('click', yesAction)
  UIkit.util.on('#dialog-confirm', 'hidden', () => {
    $('confirm-yes').removeEventListener('click', yesAction)
  })
}

// Show error dialog
function showError (e, title) {
  UIkit.util.on('#dialog-error', 'beforeshow', () => {
    $('errTitle').innerHTML = title || 'Error'
    $('errMsg').innerHTML = e
  })
  showModal('#dialog-error')
}

// Show app messages
function notify (msg, stat) {
  UIkit.notification({
    message: msg,
    status: stat || 'primary',
    pos: 'bottom-center',
    timeout: 3000
  })
}

// Sync scroll
let inputScroll = false
let outputScroll = false

const leftSide = document.getElementsByClassName('CodeMirror-scroll')[0]
const rightSide = $('output')

leftSide.addEventListener('scroll', () => {
  if (!inputScroll) {
    outputScroll = true
    rightSide.scrollTop = leftSide.scrollTop
  }
  inputScroll = false
})

rightSide.addEventListener('scroll', () => {
  if (!outputScroll) {
    inputScroll = true
    leftSide.scrollTop = rightSide.scrollTop
  }
  outputScroll = false
  $('scrollTop').style.display = $('output').scrollTop > 50 ? 'block' : 'none'
})

$('scrollTop').addEventListener('click', () => {
  $('output').scrollTop = 0
})

// Mousetrap
const traps = {
  clearButton: ['command+d', 'ctrl+d'],
  printButton: ['command+p', 'ctrl+p'],
  saveButton: ['command+s', 'ctrl+s'],
  openButton: ['command+o', 'ctrl+o']
}

Object.entries(traps).forEach(([b, c]) => {
  Mousetrap.bindGlobal(c, (e) => {
    e.preventDefault()
    if (document.getElementsByClassName('uk-open').length === 0) {
      $(b).click()
    }
  })
})

// Check for updates
if (isNode) {
  ipc.send('checkUpdate')
  ipc.on('notifyUpdate', (event) => {
    notify('Updating Numara to latest version... <a class="updateLink" onclick="$(`aboutButton`).click()">View update status</a>')
    $('notificationDot').style.display = 'block'
  })
  ipc.on('updateStatus', (event, status) => {
    if (status === 'ready') {
      $('dialog-about-updateStatus').innerHTML = 'Restart Numara to finish updating.'
      $('restartButton').style.display = 'inline-block'
      if (!$('dialog-about').classList.contains('uk-open')) {
        notify('Restart Numara to finish updating. <a class="updateLink" onclick="$(`restartButton`).click()">Restart Now</a>')
      }
    } else {
      $('dialog-about-updateStatus').innerHTML = status
    }
  })
}

const demo = `1+2

# In addition to mathjs functions, you can do:
ans // Get last answer
total // Total up to this point
avg // Average up to this point
line4 // Get answer from a line#
subtotal // Subtotal last block

# Percentages:
10% of 20
40 + 30%

# Dates
today
now
today - 3 weeks
now + 36 hours - 2 days

# Currency conversion
1 usd to try
20 cad to usd

# Plot functions
f(x) = sin(x)
f(x) = 2x^2 + 3x - 5
`

window.addEventListener('load', () => {
  setTimeout(() => { document.getElementsByClassName('CodeMirror-code')[0].lastChild.scrollIntoView() }, 250)
  setTimeout(() => { cm.focus() }, 500)
})
