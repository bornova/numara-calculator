import { $, $all, app, store } from './common'
import { calculate, formatAnswer, math } from './eval'

import * as formulajs from '@formulajs/formulajs'

import UIkit from 'uikit'

import CodeMirror from 'codemirror'

import 'codemirror/mode/javascript/javascript'
import 'codemirror/addon/dialog/dialog'
import 'codemirror/addon/display/placeholder'
import 'codemirror/addon/edit/closebrackets'
import 'codemirror/addon/edit/matchbrackets'
import 'codemirror/addon/hint/show-hint'
import 'codemirror/addon/search/jump-to-line'
import 'codemirror/addon/search/search'
import 'codemirror/addon/search/searchcursor'

/** CodeMirror input panel. */
export const cm = CodeMirror.fromTextArea($('#inputArea'), {
  autofocus: true,
  extraKeys: { 'Ctrl-Space': 'autocomplete', Tab: () => {} },
  inputStyle: 'textarea',
  mode: 'numara',
  singleCursorHeightPerLine: false,
  smartIndent: false,
  theme: 'numara',
  viewportMargin: Infinity
})

// User defined functions and units editors
const udOptions = {
  autoCloseBrackets: true,
  mode: 'javascript',
  tabSize: 2
}

export const udfInput = CodeMirror.fromTextArea($('#udfInput'), udOptions)
export const uduInput = CodeMirror.fromTextArea($('#uduInput'), udOptions)

// Codemirror syntax templates
CodeMirror.defineMode('numara', () => ({
  token: (stream) => {
    if (stream.match(/\/\/.*/) || stream.match(/#.*/)) {
      return 'comment'
    }

    if (stream.match(/\d/)) {
      return 'number'
    }

    if (stream.match(/(?:\+|-|\*|\/|,|;|\.|:|@|~|=|>|<|&|\||`|'|\^|\?|!|%)/)) {
      return 'operator'
    }

    stream.eatWhile(/\w/)

    const cmStream = stream.current()

    if (app.settings.currency && (cmStream.toLowerCase() in app.currencyRates || cmStream.toLowerCase() === 'usd')) {
      return 'currency'
    }

    if (typeof math[cmStream] === 'function' && Object.getOwnPropertyNames(math[cmStream]).includes('signatures')) {
      return 'function'
    }

    if (app.udfList.includes(cmStream)) {
      return 'udf'
    }

    if (app.uduList.includes(cmStream)) {
      return 'udu'
    }

    if (cmStream.match(/\b(?:_|ans|total|subtotal|avg|today|now)\b/)) {
      return 'scope'
    }

    if (cmStream.match(/\b(?:line\d+)\b/)) {
      return 'lineNo'
    }

    if (typeof formulajs[cmStream] === 'function') {
      return 'excel'
    }

    try {
      const val = math.evaluate(cmStream)
      const par = math.parse(cmStream)

      if (val.units && val) {
        return 'unit'
      }

      if (par.isSymbolNode && val) {
        return 'constant'
      }
    } catch {
      /** Ignore catch */
    }

    try {
      math.evaluate(cmStream)
    } catch {
      return 'variable'
    }

    stream.next()

    return 'space'
  }
}))

CodeMirror.defineMode('plain', () => ({
  token: (stream) => {
    stream.next()

    return 'text'
  }
}))

// Codemirror autocomplete hints
const numaraHints = []

const scopeList = [
  { text: '_', desc: 'Answer from last calculated line.' },
  { text: 'ans', desc: 'Answer from last calculated line.' },
  { text: 'avg', desc: 'Average of previous line values. Numbers only.' },
  { text: 'now', desc: 'Current date and time.' },
  { text: 'subtotal', desc: 'Total of all lines in previous block. Numbers only.' },
  { text: 'today', desc: 'Current date.' },
  { text: 'total', desc: 'Total of previous line values. Numbers only.' }
]

scopeList.forEach((scope) => {
  scope.className = 'cm-scope'
  numaraHints.push(scope)
})

Object.getOwnPropertyNames(math).forEach((f) => {
  if (typeof math[f] === 'function' && Object.getOwnPropertyNames(math[f]).includes('signatures')) {
    numaraHints.push({ text: f, className: 'cm-function' })
  }
})

Object.keys(formulajs).forEach((f) => {
  numaraHints.push({ text: f, className: 'cm-excel' })
})

CodeMirror.commands.autocomplete = (cm) => {
  CodeMirror.showHint(cm, CodeMirror.hint.numaraHints, {
    completeSingle: false,
    extraKeys: { Enter: 'newline' }
  })
}

CodeMirror.registerHelper('hint', 'numaraHints', (editor) => {
  const cmCursor = editor.getCursor()
  const cmCursorLine = editor.getLine(cmCursor.line)

  let start = cmCursor.ch
  let end = start

  while (end < cmCursorLine.length && /[\w$]/.test(cmCursorLine.charAt(end))) {
    ++end
  }

  while (start && /[\w$]/.test(cmCursorLine.charAt(start - 1))) {
    --start
  }

  const curWord = start !== end && cmCursorLine.slice(start, end)
  const curWordRegex = new RegExp('^' + curWord, 'i')

  return {
    list: !curWord
      ? []
      : numaraHints.filter(({ text }) => text.match(curWordRegex)).sort((a, b) => a.text.localeCompare(b.text)),
    from: CodeMirror.Pos(cmCursor.line, start),
    to: CodeMirror.Pos(cmCursor.line, end)
  }
})

// Codemirror handlers
cm.on('changes', calculate)

cm.on('inputRead', (cm) => {
  if (app.settings.autocomplete) {
    CodeMirror.commands.autocomplete(cm)
  }
})

cm.on('cursorActivity', (cm) => {
  cm.eachLine((line) => {
    const cmLineNo = cm.getLineNumber(line)
    const activeLine = cm.getCursor().line

    if (cmLineNo === activeLine) {
      cm.addLineClass(cmLineNo, 'gutter', 'activeLine')
    } else {
      cm.removeLineClass(cmLineNo, 'gutter', 'activeLine')
    }
  })
})

const ttPos = (el) => (el.nodeName.toLowerCase() === 'li' ? 'right' : 'top-left')

cm.on('update', () => {
  const funcs = $all('.cm-function')

  if (funcs.length > 0 && app.settings.keywordTips) {
    for (const f of funcs) {
      try {
        const obj = JSON.parse(JSON.stringify(math.help(f.innerText).toJSON()))

        UIkit.tooltip(f, {
          pos: ttPos(f),
          title: obj.description
        })
      } catch {
        UIkit.tooltip(f, {
          pos: ttPos(f),
          title: 'Description not available'
        })
      }
    }
  }

  const udfs = $all('.cm-udf')

  if (udfs.length > 0 && app.settings.keywordTips) {
    for (const f of udfs) {
      UIkit.tooltip(f, {
        pos: ttPos(f),
        title: 'User defined function'
      })
    }
  }

  const udus = $all('.cm-udu')

  if (udus.length > 0 && app.settings.keywordTips) {
    for (const u of udus) {
      UIkit.tooltip(u, {
        pos: ttPos(u),
        title: 'User defined unit'
      })
    }
  }

  const currencies = $all('.cm-currency')

  if (currencies.length > 0 && app.settings.keywordTips) {
    for (const c of currencies) {
      try {
        const currency = c.innerText.toLowerCase()
        const currencyName = currency === 'usd' ? 'U.S. Dollar' : app.currencyRates[currency].name

        UIkit.tooltip(c, {
          pos: ttPos(c),
          title: currencyName
        })
      } catch {
        UIkit.tooltip(c, {
          pos: ttPos(c),
          title: 'Description not available'
        })
      }
    }
  }

  const units = $all('.cm-unit')

  if (units.length > 0 && app.settings.keywordTips) {
    for (const u of units) {
      UIkit.tooltip(u, {
        pos: ttPos(u),
        title: `Unit '${u.innerText}'`
      })
    }
  }

  const constants = $all('.cm-constant')

  if (constants.length > 0 && app.settings.keywordTips) {
    for (const c of constants) {
      try {
        UIkit.tooltip(c, {
          pos: ttPos(c),
          title: math.help(c.innerText).doc.description + ' (Constant)'
        })
      } catch {
        /* No tooltip */
      }
    }
  }

  const vars = $all('.cm-variable')

  if (vars.length > 0 && app.settings.keywordTips) {
    for (const v of vars) {
      if (app.mathScope[v.innerText] && typeof app.mathScope[v.innerText] !== 'function') {
        let varTooltip

        try {
          varTooltip = formatAnswer(math.evaluate(v.innerText, app.mathScope))
        } catch {
          varTooltip = 'Undefined'
        }

        UIkit.tooltip(v, {
          pos: ttPos(v),
          title: varTooltip
        })
      }
    }
  }

  const lineNos = $all('.cm-lineNo')

  if (lineNos.length > 0 && app.settings.keywordTips) {
    for (const ln of lineNos) {
      let scopeTooltip

      try {
        scopeTooltip =
          typeof app.mathScope[ln.innerText] === 'function'
            ? 'Function'
            : formatAnswer(math.evaluate(ln.innerText, app.mathScope))
      } catch {
        scopeTooltip = 'Undefined'
      }

      UIkit.tooltip(ln, {
        pos: ttPos(ln),
        title: scopeTooltip
      })
    }
  }

  const scope = $all('.cm-scope')

  if (scope.length > 0 && app.settings.keywordTips) {
    for (const s of scope) {
      UIkit.tooltip(s, {
        pos: ttPos(s),
        title: scopeList.filter((scope) => s.innerText === scope.text)[0].desc
      })
    }
  }

  const excel = $all('.cm-excel')

  if (excel.length > 0 && app.settings.keywordTips) {
    for (const x of excel) {
      UIkit.tooltip(x, {
        pos: ttPos(x),
        title: 'Excel function'
      })
    }
  }
})

cm.on('cursorActivity', (cm) => {
  const pages = store.get('pages')
  const page = pages.find((page) => page.id == app.activePage)

  page.cursor = cm.getCursor()

  store.set('pages', pages)
})
