import { dom } from './dom'
import { calculate, formatAnswer, math } from './eval'
import { currencySymbols } from './forex'
import { showError } from './modal'
import { app, localeUsesComma, store } from './utils'

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

import * as formulajs from '@formulajs/formulajs'

const CLASS_NAMES = {
  CONSTANT: 'cm-constant',
  CURRENCY: 'cm-currency',
  EXCEL: 'cm-excel',
  FORMULAJS: 'cm-formulajs',
  FUNCTION: 'cm-function',
  KEYWORD: 'cm-keyword',
  LINE_NO: 'cm-lineNo',
  UDF: 'cm-udf',
  UDU: 'cm-udu',
  UNIT: 'cm-unit',
  VARIABLE: 'cm-variable'
}

const mathEntries = Object.entries(math.expression.mathWithTransform)
const mathFunctions = mathEntries.filter(([k]) => typeof math[k] === 'function')
const mathConstants = mathEntries.filter(
  ([k]) => typeof math[k] !== 'function' && typeof math[k] !== 'boolean' && (math[k]?.value || !isNaN(math[k]))
)
const units = () =>
  Object.values(math.Unit.UNITS).flatMap((unit) =>
    Object.values(unit.prefixes).map((prefix) => {
      const token = prefix.name + unit.name
      const unitBase = unit.base.key.replaceAll('_', ' ').toLowerCase()
      const unitCat = unitBase.charAt(0).toUpperCase() + unitBase.slice(1)

      return {
        token,
        hint: {
          text: token,
          desc: unitCat + ' unit',
          className: CLASS_NAMES.UNIT
        }
      }
    })
  )

export const keywords = [
  { text: '_', desc: 'Answer from last calculated line' },
  { text: 'ans', desc: 'Answer from last calculated line' },
  { text: 'avg', desc: 'Average of previous line values' },
  { text: 'now', desc: 'Current date and time' },
  { text: 'subtotal', desc: 'Total of all lines in previous block' },
  { text: 'today', desc: 'Current date' },
  { text: 'total', desc: 'Total of previous line values' }
]

// Mode tokens
const functionTokens = mathFunctions.map(([f]) => f)
const constantTokens = mathConstants.map(([c]) => c)
const unitTokens = units().map((u) => u.token)
const keywordTokens = keywords.map((key) => key.text)
const excelTokens = Object.keys(formulajs).map((f) => 'xls.' + f)
const currencyTokens = Object.entries(currencySymbols).map((c) => c[1])

// Codemirror syntax templates
CodeMirror.defineMode('numara', () => ({
  token: (stream) => {
    if (stream.match(/\/\/.*/) || stream.match(/#.*/)) return 'comment'
    if (stream.match(/\d/)) return 'number'
    if (stream.match(/(?:\+|-|\*|\/|,|;|\.|:|@|~|=|>|<|&|\||`|'|\^|\?|!|%)/)) return 'operator'
    if (stream.match(/\b(?:xls.)\b/)) return 'formulajs'
    if (currencyTokens.some((token) => stream.match(token))) return 'currency'

    stream.eatWhile(/\w/)

    const cmStream = stream.current()

    if (math.Unit.UNITS[cmStream]?.base.key === 'USD_STUFF') return 'currency'
    if (functionTokens.includes(cmStream)) return 'function'
    if (constantTokens.includes(cmStream)) return 'constant'
    if (unitTokens.includes(cmStream)) return 'unit'
    if (keywordTokens.includes(cmStream)) return 'keyword'
    if (/\bline\d+\b/.test(cmStream)) return 'lineNo'
    if (app.udfList.includes(cmStream)) return 'udf'
    if (app.uduList.includes(cmStream)) return 'udu'
    if (excelTokens.includes(cmStream)) return 'excel'

    // Variable fallback
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

// Editor hints
const functionHints = mathFunctions.map(([f]) => ({ text: f, className: CLASS_NAMES.FUNCTION }))
const constantHints = mathConstants.map(([c]) => ({
  text: c,
  desc: math.help(c).doc.description,
  className: CLASS_NAMES.CONSTANT
}))
const unitHints = units().map((u) => u.hint)
const keywordHints = keywords.map((key) => ({ ...key, className: CLASS_NAMES.KEYWORD }))
const excelHints = excelTokens.map((f) => ({ text: f, className: CLASS_NAMES.EXCEL }))

export const numaraHints = [...functionHints, ...constantHints, ...unitHints, ...keywordHints, ...excelHints]

CodeMirror.registerHelper('hint', 'numaraHints', (editor) => {
  const cmCursor = editor.getCursor()
  const cmCursorLine = editor.getLine(cmCursor.line)

  let start = cmCursor.ch
  let end = start

  while (end < cmCursorLine.length && /[\w.$]/.test(cmCursorLine.charAt(end))) ++end
  while (start && /[\w.$]/.test(cmCursorLine.charAt(start - 1))) --start

  let curStr = cmCursorLine.slice(start, end)
  let curWord = start !== end && curStr

  const curWordRegex = curWord ? new RegExp('^' + curWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') : null

  // Build hints for all variables from the current math scope
  // This shows users all available variables with their current values
  const variableHints = []

  // Keywords that are already included in the keyword hints
  const keywordNames = keywords.map((k) => k.text)

  for (const key of Object.keys(app.mathScope)) {
    // Skip variables that are already in keyword hints to avoid duplicates
    if (keywordNames.includes(key)) continue

    variableHints.push({
      text: key,
      className: CLASS_NAMES.VARIABLE
    })
  }

  // Add user-defined functions from udfList
  // These are custom functions created by the user
  const userFunctionHints = app.udfList.map((funcName) => ({
    text: funcName,
    className: CLASS_NAMES.FUNCTION
  }))

  // Add user-defined units from uduList
  // These are custom units created by the user
  const userUnitHints = app.uduList.map((unitName) => ({
    text: unitName,
    className: CLASS_NAMES.UNIT
  }))

  // Combine all hint sources: built-in hints, user variables, user functions, and user units
  const allHints = [...numaraHints, ...variableHints, ...userFunctionHints, ...userUnitHints]

  return {
    list:
      curStr && (!curStr.endsWith('.') || curStr === 'xls.') && curWordRegex
        ? allHints.filter(({ text }) => curWordRegex.test(text)).sort((a, b) => a.text.localeCompare(b.text))
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
  const lineBottom = cm.display.lineDiv.children[cm.getCursor().line].getBoundingClientRect().bottom
  const barTop = dom.el('.CodeMirror-hscrollbar').getBoundingClientRect().top
  const lineHeight = lineBottom - lineTop

  if (barTop - lineTop < lineHeight) dom.output.scrollTop = dom.output.scrollTop + (lineHeight - (barTop - lineTop))
}

/** Toggles comments on the selected lines.
 * @param {CodeMirror} cm - The CodeMirror instance to toggle comments on.
 */
function toggleComment(cm) {
  const selections = cm.listSelections()

  cm.operation(() => {
    for (const selection of selections) {
      const startLine = Math.min(selection.anchor.line, selection.head.line)
      const endLine = Math.max(selection.anchor.line, selection.head.line)

      // Check if all selected lines are already commented
      let allCommented = true
      for (let i = startLine; i <= endLine; i++) {
        const line = cm.getLine(i)
        if (line !== null && line !== undefined && !line.trim().startsWith('//')) {
          allCommented = false
          break
        }
      }

      // Toggle comments
      for (let i = startLine; i <= endLine; i++) {
        const line = cm.getLine(i)
        if (line === null || line === undefined) continue

        if (allCommented) {
          // Remove comment
          const uncommented = line.replace(/^(\s*)\/\/\s?/, '$1')
          cm.replaceRange(uncommented, { line: i, ch: 0 }, { line: i, ch: line.length })
        } else {
          // Add comment
          const leadingWhitespace = line.match(/^\s*/)[0]
          const commented = leadingWhitespace + '// ' + line.slice(leadingWhitespace.length)
          cm.replaceRange(commented, { line: i, ch: 0 }, { line: i, ch: line.length })
        }
      }
    }
  })
}

/** CodeMirror instances. */
export const cm = CodeMirror.fromTextArea(dom.inputArea, {
  autofocus: true,
  coverGutterNextToScrollbar: true,
  extraKeys: {
    'Ctrl-Space': 'autocomplete',
    'Cmd-/': toggleComment,
    'Ctrl-/': toggleComment
  },
  flattenSpans: true,
  mode: 'numara',
  smartIndent: false,
  theme: 'numara',
  viewportMargin: Infinity
})

const udOptions = { autoCloseBrackets: true, autofocus: true, mode: 'javascript', smartIndent: false, tabSize: 2 }

// Set the placeholder values of the user defined dialog CodeMirror instances
const udfPlaceholder = 'xyz: (x, y, z) => {\n\treturn x+y+z\n},\n\nmyConstant: 123'
const uduPlaceholder = 'foo: "18 foot",\nbar: "40 foo"'

dom.udfInput.setAttribute('placeholder', udfPlaceholder)
dom.uduInput.setAttribute('placeholder', uduPlaceholder)

export const udfInput = CodeMirror.fromTextArea(dom.udfInput, udOptions)
export const uduInput = CodeMirror.fromTextArea(dom.uduInput, udOptions)

// Codemirror handlers
cm.on('changes', calculate)

cm.on('inputRead', (cm) => {
  if (!app.settings.autocomplete) return

  CodeMirror.commands.autocomplete(cm)
})

cm.on('paste', (cm, event) => {
  event.preventDefault()

  let pastedText = event.clipboardData.getData('text/plain')

  if (app.settings.thouSep && app.settings.pasteThouSep) {
    cm.replaceSelection(pastedText)
  } else {
    try {
      pastedText.split(/\n|\r/).forEach((line) => {
        math.evaluate(line, app.mathScope)
      })
      cm.replaceSelection(pastedText)
    } catch {
      const modifiedText = pastedText.replaceAll(localeUsesComma() ? '.' : ',', '')
      cm.replaceSelection(modifiedText)
    }
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
  const error = dom.el('[data-index="' + line + '"]').firstChild?.dataset.error

  if (error) {
    showError(`Error on Line ${lineNo}`, error)
    return
  }

  if (activeLine <= lineNo) return

  cm.replaceSelection('line' + lineNo)
})

cm.on('scrollCursorIntoView', cmForceBottom)

// Tooltips

/**
 * Determines the tooltip position based on the given element.
 * @param {Element} el - The DOM element to check.
 * @returns {string} Returns 'right' if the element is an <li>, otherwise 'top-left'.
 */
function getTooltipPosition(el) {
  return el.nodeName.toLowerCase() === 'li' ? 'right' : 'top-left'
}

/**
 * Displays a tooltip on the specified target element with the given title.
 * @param {HTMLElement|string} target - The target element or selector to attach the tooltip to.
 * @param {string} title - The text to display inside the tooltip.
 */
function showTooltip(target, title) {
  UIkit.tooltip(target, {
    pos: getTooltipPosition(target),
    title
  }).show()
}

/**
 * Displays a tooltip with the description and syntax of a mathematical function.
 * @param {HTMLElement} target - The DOM element representing the function for which to show the tooltip.
 */
function handleFunctionTooltip(target) {
  try {
    const tip = math.help(target.innerText).toJSON()
    const syntax = tip.syntax.map((s) => s.replaceAll(/,/g, app.settings.inputLocale ? ';' : ','))

    showTooltip(
      target,
      `<div>${tip.description}</div>
      <div class="tooltipCode">${syntax.map((s) => `<code>${s}</code>`).join(' ')}</div>`
    )
  } catch {
    showTooltip(target, 'Description not available')
  }
}

/**
 * Displays a tooltip with the currency name for the given currency code.
 * @param {HTMLElement} target - The DOM element representing the currency.
 */
function handleCurrencyTooltip(target) {
  try {
    let currency = target.innerText

    if (currencyTokens.includes(currency)) {
      currency = Object.keys(currencySymbols).find((key) => currencySymbols[key] === currency)
    }

    const currencyName =
      currency.toUpperCase() === 'USD' ? 'U.S. Dollar' : app.currencyRates[currency.toLowerCase()].name

    showTooltip(target, currencyName)
  } catch (e) {
    console.log(e)
    showTooltip(target, 'Description not available')
  }
}

/**
 * Displays a tooltip with the description of a unit.
 * @param {HTMLElement} target - The DOM element representing the unit.
 */
function handleUnitTooltip(target) {
  const hint = numaraHints.find((hint) => hint.text === target.innerText)

  showTooltip(target, hint.desc)
}

/**
 * Displays a tooltip with the description of a constant.
 * @param {HTMLElement} target - The DOM element representing the constant.
 */
function handleConstantTooltip(target) {
  try {
    showTooltip(target, math.help(target.innerText).doc.description)
  } catch {
    /* No tooltip */
  }
}

/**
 * Displays a tooltip with the value of a variable.
 * @param {HTMLElement} target - The DOM element representing the variable.
 */
function handleVariableTooltip(target) {
  if (!app.mathScope[target.innerText] || typeof app.mathScope[target.innerText] === 'function') return

  let varTooltip

  try {
    varTooltip = formatAnswer(math.evaluate(target.innerText, app.mathScope))
  } catch {
    varTooltip = 'Undefined'
  }

  showTooltip(target, varTooltip)
}

/**
 * Displays a tooltip with the value or type of a line number reference.
 * @param {HTMLElement} target - The DOM element representing the line number.
 */
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

/**
 * Displays a tooltip with the description of a keyword.
 * @param {HTMLElement} target - The DOM element representing the keyword.
 */
function handleKeywordTooltip(target) {
  const keyword = keywords.find((key) => target.innerText === key.text)

  showTooltip(target, keyword?.desc)
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

/**
 * Refreshes the given CodeMirror editor and focuses it after a short delay.
 * @param {CodeMirror} editor - CodeMirror instance to refresh and focus.
 */
export function refreshEditor(editor) {
  editor.refresh()

  setTimeout(() => editor.focus(), 100)
}

document.addEventListener('mouseover', (event) => {
  const className = event.target?.classList[0]

  if (app.settings.keywordTips && className?.startsWith('cm-')) {
    const handler = TOOLTIP_HANDLERS[className]

    if (handler) handler(event.target)
  }

  if (className !== 'CodeMirror-linenumber') return

  const line = cm.getCursor().line
  const activeLine = line + 1
  const isValid = activeLine > +event.target.innerText
  const hasError = event.target.parentElement.classList.contains('lineNoError')

  event.target.style.cursor = isValid || hasError ? 'pointer' : 'default'
  event.target.setAttribute(
    'title',
    hasError
      ? `Line ${event.target.innerText} has an error`
      : isValid && app.settings.keywordTips
        ? `Insert 'line${event.target.innerText}' to Line ${activeLine}`
        : ''
  )
})

document.addEventListener('keydown', (event) => {
  app.refreshCM = !event.repeat
})

document.addEventListener('keyup', () => {
  app.refreshCM = true
})
