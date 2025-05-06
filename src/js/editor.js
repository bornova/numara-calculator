import { app, store } from './common'
import { dom } from './dom'
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
export const cm = CodeMirror.fromTextArea(dom.inputArea, {
  autofocus: true,
  coverGutterNextToScrollbar: true,
  extraKeys: { 'Ctrl-Space': 'autocomplete' },
  flattenSpans: true,
  mode: 'numara',
  smartIndent: false,
  theme: 'numara',
  viewportMargin: Infinity
})

// User defined functions and units editors
const udOptions = {
  autoCloseBrackets: true,
  autofocus: true,
  mode: 'javascript',
  smartIndent: false,
  tabSize: 2
}

const udfPlaceholder = 'xyz: (x, y, z) => {\n\treturn x+y+z\n},\n\nmyConstant: 123'
const uduPlaceholder = 'foo: "18 foot",\nbar: "40 foo"'

dom.udfInput.setAttribute('placeholder', udfPlaceholder)
dom.uduInput.setAttribute('placeholder', uduPlaceholder)

export const udfInput = CodeMirror.fromTextArea(dom.udfInput, udOptions)
export const uduInput = CodeMirror.fromTextArea(dom.uduInput, udOptions)

/**
 * Refresh editor and focus.
 *
 * @param {CodeMirror} editor CodeMirror instance to refresh
 */
export function refreshEditor(editor) {
  editor.refresh()

  setTimeout(() => {
    editor.focus()
  }, 100)
}

// Codemirror syntax templates
CodeMirror.defineMode('numara', () => ({
  token: (stream) => {
    if (stream.match(/\/\/.*/) || stream.match(/#.*/)) return 'comment'
    if (stream.match(/\d/)) return 'number'
    if (stream.match(/(?:\+|-|\*|\/|,|;|\.|:|@|~|=|>|<|&|\||`|'|\^|\?|!|%)/)) return 'operator'
    if (stream.match(/\b(?:xls.)\b/)) return 'formulajs'

    stream.eatWhile(/\w/)

    const cmStream = stream.current()

    if (
      app.settings.currency &&
      (Object.keys(app.currencyRates).some((curr) => app.currencyRates[curr].code === cmStream) || cmStream === 'USD')
    ) {
      return 'currency'
    }

    if (typeof math[cmStream] === 'function' && Object.getOwnPropertyNames(math[cmStream]).includes('signatures'))
      return 'function'

    if (app.udfList.includes(cmStream)) return 'udf'
    if (app.uduList.includes(cmStream)) return 'udu'
    if (cmStream.match(/\b(?:_|ans|total|subtotal|avg|today|now)\b/)) return 'keyword'
    if (cmStream.match(/\b(?:line\d+)\b/)) return 'lineNo'
    if (typeof formulajs[cmStream] === 'function' && stream.string.startsWith('xls.')) return 'excel'

    try {
      const val = math.evaluate(cmStream)
      const par = math.parse(cmStream)

      if (val.units && !val.value) return 'unit'
      if (par.isSymbolNode && val) return 'constant'
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

    return 'plain'
  }
}))

// Codemirror autocomplete hints
export const keywords = [
  { text: '_', desc: 'Answer from last calculated line' },
  { text: 'ans', desc: 'Answer from last calculated line' },
  { text: 'avg', desc: 'Average of previous line values. Numbers only.' },
  { text: 'now', desc: 'Current date and time' },
  { text: 'subtotal', desc: 'Total of all lines in previous block. Numbers only.' },
  { text: 'today', desc: 'Current date' },
  { text: 'total', desc: 'Total of previous line values. Numbers only.' }
]

export const numaraHints = [
  ...keywords.map((key) => ({ ...key, className: 'cm-keyword' })),
  ...Object.keys(math)
    .filter((f) => typeof math[f] === 'function' && Object.getOwnPropertyNames(math[f]).includes('signatures'))
    .map((f) => ({ text: f, className: 'cm-function' })),
  ...Object.keys(math.expression.mathWithTransform)
    .filter(
      (expr) =>
        typeof math[expr] !== 'function' && typeof math[expr] !== 'boolean' && (math[expr]?.value || !isNaN(math[expr]))
    )
    .map((expr) => ({
      text: expr,
      desc: math.help(expr).doc.description,
      className: 'cm-constant'
    })),
  ...Object.keys(formulajs).map((f) => ({ text: 'xls.' + f, className: 'cm-excel' })),
  ...Object.values(math.Unit.UNITS).flatMap((unit) =>
    Object.values(unit.prefixes).map((prefix) => {
      const unitBase = unit.base.key.replaceAll('_', ' ').toLowerCase()
      const unitCat = unitBase.charAt(0).toUpperCase() + unitBase.slice(1)
      return { text: prefix.name + unit.name, desc: unitCat + ' unit', className: 'cm-unit' }
    })
  )
]

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

  // Use a more robust regex for word matching
  const curWordRegex = curWord ? new RegExp('^' + curWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') : null

  // Only show hints if not ending with '.' or is 'xls.'
  const shouldShowHints = curStr && (!curStr.endsWith('.') || curStr === 'xls.')

  return {
    list:
      shouldShowHints && curWordRegex
        ? numaraHints.filter(({ text }) => curWordRegex.test(text)).sort((a, b) => a.text.localeCompare(b.text))
        : [],
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

// Force editor line bottom alignment
function cmForceBottom() {
  const lineTop = cm.display.lineDiv.children[cm.getCursor().line].getBoundingClientRect().top
  const barTop = dom.el('.CodeMirror-hscrollbar').getBoundingClientRect().top
  const lineHeight = +app.settings.lineHeight.replace('px', '') + 1

  if (barTop - lineTop < lineHeight) {
    dom.output.scrollTop = dom.output.scrollTop + (lineHeight - (barTop - lineTop))
  }
}

// Codemirror handlers
cm.on('changes', calculate)

cm.on('inputRead', (cm) => {
  if (app.settings.autocomplete) {
    CodeMirror.commands.autocomplete(cm)
  }
})

cm.on('paste', (cm, event) => {
  event.preventDefault()

  let pastedText = event.clipboardData.getData('text/plain')

  try {
    math.evaluate(pastedText, app.mathScope)
    cm.replaceSelection(pastedText)
  } catch {
    let modifiedText = pastedText.replaceAll(',', '')
    cm.replaceSelection(modifiedText)
  }
})

cm.on('cursorActivity', (cm) => {
  const activeLine = cm.getCursor().line

  cm.eachLine((line) => {
    const cmLineNo = cm.getLineNumber(line)
    cm[cmLineNo === activeLine ? 'addLineClass' : 'removeLineClass'](cmLineNo, 'gutter', 'activeLine')
  })

  setTimeout(cmForceBottom, 20)

  const pages = store.get('pages')
  const page = pages.find((page) => page.id == app.activePage)

  page.cursor = cm.getCursor()

  store.set('pages', pages)
})

cm.on('gutterClick', (cm, line) => {
  const lineNo = line + 1
  const activeLine = cm.getCursor().line + 1

  if (activeLine > lineNo) {
    cm.replaceSelection('line' + lineNo)
  }
})

cm.on('scrollCursorIntoView', cmForceBottom)

// Tooltips
const CLASS_NAMES = {
  FUNCTION: 'cm-function',
  UDF: 'cm-udf',
  UDU: 'cm-udu',
  CURRENCY: 'cm-currency',
  UNIT: 'cm-unit',
  CONSTANT: 'cm-constant',
  VARIABLE: 'cm-variable',
  LINE_NO: 'cm-lineNo',
  KEYWORD: 'cm-keyword',
  FORMULAJS: 'cm-formulajs',
  EXCEL: 'cm-excel'
}

function getTooltipPosition(el) {
  return el.nodeName.toLowerCase() === 'li' ? 'right' : 'top-left'
}

function showTooltip(target, title) {
  UIkit.tooltip(target, {
    pos: getTooltipPosition(target),
    title
  }).show()
}

function handleFunctionTooltip(target) {
  try {
    const tip = JSON.parse(JSON.stringify(math.help(target.innerText).toJSON()))

    showTooltip(
      target,
      `<div>${tip.description}</div>
      <div class="tooltipCode">${tip.syntax.map((s) => '<code>' + s + '</code>').join(' ')}</div>`
    )
  } catch {
    showTooltip(target, 'Description not available')
  }
}

function handleCurrencyTooltip(target) {
  try {
    const currency = target.innerText
    const currencyName = currency === 'USD' ? 'U.S. Dollar' : app.currencyRates[currency.toLowerCase()].name

    showTooltip(target, currencyName)
  } catch {
    showTooltip(target, 'Description not available')
  }
}

function handleUnitTooltip(target) {
  const hint = numaraHints.find((hint) => hint.text === target.innerText)

  showTooltip(target, hint.desc)
}

function handleConstantTooltip(target) {
  try {
    showTooltip(target, math.help(target.innerText).doc.description)
  } catch {
    /* No tooltip */
  }
}

function handleVariableTooltip(target) {
  if (app.mathScope[target.innerText] && typeof app.mathScope[target.innerText] !== 'function') {
    let varTooltip

    try {
      varTooltip = formatAnswer(math.evaluate(target.innerText, app.mathScope))
    } catch {
      varTooltip = 'Undefined'
    }

    showTooltip(target, varTooltip)
  }
}

function handleLineNoTooltip(target) {
  let tooltip

  try {
    tooltip =
      typeof app.mathScope[target.innerText] === 'function'
        ? 'Function'
        : formatAnswer(math.evaluate(target.innerText, app.mathScope))
  } catch {
    tooltip = 'Undefined'
  }

  showTooltip(target, tooltip)
}

function handleKeywordTooltip(target) {
  const keyword = keywords.find((key) => target.innerText === key.text)

  showTooltip(target, keyword.desc)
}

const TOOLTIP_HANDLERS = {
  [CLASS_NAMES.FUNCTION]: handleFunctionTooltip,
  [CLASS_NAMES.UDF]: (target) => showTooltip(target, 'User defined function'),
  [CLASS_NAMES.UDU]: (target) => showTooltip(target, 'User defined unit'),
  [CLASS_NAMES.CURRENCY]: handleCurrencyTooltip,
  [CLASS_NAMES.UNIT]: handleUnitTooltip,
  [CLASS_NAMES.CONSTANT]: handleConstantTooltip,
  [CLASS_NAMES.VARIABLE]: handleVariableTooltip,
  [CLASS_NAMES.LINE_NO]: handleLineNoTooltip,
  [CLASS_NAMES.KEYWORD]: handleKeywordTooltip,
  [CLASS_NAMES.FORMULAJS]: (target) => showTooltip(target, 'Formulajs'),
  [CLASS_NAMES.EXCEL]: (target) => showTooltip(target, 'Excel function')
}

document.addEventListener('mouseover', (event) => {
  if (app.settings.keywordTips && event.target.classList[0]?.startsWith('cm-')) {
    const handler = TOOLTIP_HANDLERS[event.target.classList[0]]

    if (handler) {
      handler(event.target)
    }
  }

  if (event.target.classList[0] === 'CodeMirror-linenumber') {
    const activeLine = cm.getCursor().line + 1
    const isValid = activeLine > +event.target.innerText

    event.target.style.cursor = isValid ? 'pointer' : 'default'
    event.target.setAttribute(
      'title',
      isValid && app.settings.keywordTips ? `Insert 'line${event.target.innerText}' to Line ${activeLine}` : ''
    )
  }
})
