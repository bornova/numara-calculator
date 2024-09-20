import { $, app, store } from './common'
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
  mode: 'numara',
  singleCursorHeightPerLine: false,
  smartIndent: false,
  theme: 'numara',
  viewportMargin: Infinity
})

// User defined functions and units editors
const udOptions = {
  autofocus: true,
  autoCloseBrackets: true,
  mode: 'javascript',
  singleCursorHeightPerLine: false,
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

    if (stream.match(/\b(?:xls.)\b/)) {
      return 'formulajs'
    }

    stream.eatWhile(/\w/)

    const cmStream = stream.current()

    if (
      app.settings.currency &&
      (Object.keys(app.currencyRates).some((curr) => app.currencyRates[curr].code === cmStream) || cmStream === 'USD')
    ) {
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

    if (typeof formulajs[cmStream] === 'function' && stream.string.startsWith('xls.')) {
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
export const numaraHints = []

export const scopeList = [
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
  numaraHints.push({ text: 'xls.' + f, className: 'cm-excel' })
})

Object.values(math.Unit.UNITS).flatMap((unit) => {
  Object.values(unit.prefixes).forEach((prefix) => {
    const unitBase = unit.base.key.replaceAll('_', ' ').toLowerCase()
    const unitCat = unitBase.charAt(0).toUpperCase() + unitBase.slice(1)

    numaraHints.push({ text: prefix.name + unit.name, desc: unitCat + ' unit', className: 'cm-unit' })
  })
})

CodeMirror.registerHelper('hint', 'numaraHints', (editor) => {
  const cmCursor = editor.getCursor()
  const cmCursorLine = editor.getLine(cmCursor.line)

  let start = cmCursor.ch
  let end = start

  while (end < cmCursorLine.length && /[\w.$]/.test(cmCursorLine.charAt(end))) {
    ++end
  }

  while (start && /[\w.$]/.test(cmCursorLine.charAt(start - 1))) {
    --start
  }

  let curStr = cmCursorLine.slice(start, end)
  let curWord = start !== end && curStr

  const curWordRegex = new RegExp('^' + curWord, 'i')

  curWord = !curStr.endsWith('.') || curStr === 'xls.'

  return {
    list: !curWord ? [] : numaraHints.filter(({ text }) => text.match(curWordRegex)),
    from: CodeMirror.Pos(cmCursor.line, start),
    to: CodeMirror.Pos(cmCursor.line, end)
  }
})

CodeMirror.commands.autocomplete = (cm) => {
  CodeMirror.showHint(cm, CodeMirror.hint.numaraHints, {
    completeSingle: false,
    extraKeys: { Enter: 'newline' }
  })
}

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

cm.on('gutterClick', (cm, line) => {
  const lineNo = line + 1

  cm.replaceSelection('line' + lineNo)
})

cm.on('cursorActivity', (cm) => {
  const pages = store.get('pages')
  const page = pages.find((page) => page.id == app.activePage)

  page.cursor = cm.getCursor()

  store.set('pages', pages)
})

// Tooltips
const ttPos = (el) => (el.nodeName.toLowerCase() === 'li' ? 'right' : 'top-left')

document.addEventListener('mouseover', (event) => {
  if (app.settings.keywordTips && event.target.classList[0]?.startsWith('cm-')) {
    switch (event.target.classList[0]) {
      case 'cm-function':
        try {
          const tip = JSON.parse(JSON.stringify(math.help(event.target.innerText).toJSON()))

          UIkit.tooltip(event.target, {
            pos: ttPos(event.target),
            title: tip.description
          })
        } catch {
          UIkit.tooltip(event.target, {
            pos: ttPos(event.target),
            title: 'Description not available'
          })
        }

        break

      case 'cm-udf':
        UIkit.tooltip(event.target, {
          pos: ttPos(event.target),
          title: 'User defined function'
        })

        break

      case 'cm-udu':
        UIkit.tooltip(event.target, {
          pos: ttPos(event.target),
          title: 'User defined unit'
        })

        break

      case 'cm-currency':
        try {
          const currency = event.target.innerText
          const currencyName = currency === 'USD' ? 'U.S. Dollar' : app.currencyRates[currency.toLowerCase()].name

          UIkit.tooltip(event.target, {
            pos: ttPos(event.target),
            title: currencyName
          })
        } catch {
          UIkit.tooltip(event.target, {
            pos: ttPos(event.target),
            title: 'Description not available'
          })
        }

        break

      case 'cm-unit': {
        UIkit.tooltip(event.target, {
          pos: ttPos(event.target),
          title: numaraHints.find((hint) => hint.text === event.target.innerText).desc
        })

        break
      }

      case 'cm-constant':
        try {
          UIkit.tooltip(event.target, {
            pos: ttPos(event.target),
            title: math.help(event.target.innerText).doc.description + ' (Constant)'
          })
        } catch {
          /* No tooltip */
        }

        break

      case 'cm-variable':
        if (app.mathScope[event.target.innerText] && typeof app.mathScope[event.target.innerText] !== 'function') {
          let varTooltip

          try {
            varTooltip = formatAnswer(math.evaluate(event.target.innerText, app.mathScope))
          } catch {
            varTooltip = 'Undefined'
          }

          UIkit.tooltip(event.target, {
            pos: ttPos(event.target),
            title: varTooltip
          })
        }

        break

      case 'cm-lineNo': {
        let scopeTooltip

        try {
          scopeTooltip =
            typeof app.mathScope[event.target.innerText] === 'function'
              ? 'Function'
              : formatAnswer(math.evaluate(event.target.innerText, app.mathScope))
        } catch {
          scopeTooltip = 'Undefined'
        }

        UIkit.tooltip(event.target, {
          pos: ttPos(event.target),
          title: scopeTooltip
        })

        break
      }

      case 'cm-scope':
        UIkit.tooltip(event.target, {
          pos: ttPos(event.target),
          title: scopeList.filter((scope) => event.target.innerText === scope.text)[0].desc
        })

        break

      case 'cm-formulajs':
        UIkit.tooltip(event.target, {
          pos: ttPos(event.target),
          title: 'Formulajs'
        })

        break

      case 'cm-excel':
        UIkit.tooltip(event.target, {
          pos: ttPos(event.target),
          title: 'Excel function'
        })

        break
    }

    UIkit.tooltip(event.target).show()
  }
})
