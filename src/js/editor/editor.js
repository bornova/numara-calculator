import { dom } from '../dom'
import { calculate, formatAnswer, math, syncOutputHeights } from '../eval'
import { showError } from '../ui/modal'
import { app, debounce, store } from '../utils'

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
import 'codemirror/addon/fold/foldcode'
import 'codemirror/addon/fold/foldgutter'

import * as formulajs from '@formulajs/formulajs'
import { DateTime } from 'luxon'

const CLASS_NAMES = {
  CONSTANT: 'cm-constant',
  CURRENCY: 'cm-currency',
  DATETIME: 'cm-datetime',
  EXCEL: 'cm-excel',
  FORMULAJS: 'cm-formulajs',
  FUNCTION: 'cm-function',
  KEYWORD: 'cm-keyword',
  LINE_NO: 'cm-lineNo',
  NERDAMER: 'cm-nerdamer',
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

/**
 * Resolves all built-in Math.js units and their prefixes into helper hint structures.
 * @returns {Array<{token: string, hint: {text: string, desc: string, className: string}}>} Array of hints.
 */
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
  { text: 'subavg', desc: 'Average of all lines in previous block' },
  { text: 'subtotal', desc: 'Total of all lines in previous block' },
  { text: 'today', desc: 'Current date' },
  { text: 'total', desc: 'Total of previous line values' }
]

// Mode tokens
const functionTokens = new Set(mathFunctions.map(([f]) => f))
const constantTokens = new Set(mathConstants.map(([c]) => c))
const unitTokens = new Set(units().map((u) => u.token))
const keywordTokens = new Set(keywords.map((key) => key.text))
const excelTokens = new Set(Object.keys(formulajs).map((f) => 'formulajs.' + f))

let currencyTokens = new Set()

/** Rebuild the set of currency symbol glyphs from app.currencies. */
export function refreshCurrencyTokens() {
  currencyTokens = new Set(
    Object.values(app.currencies || {})
      .map((c) => c?.symbol)
      .filter(Boolean)
  )
}

// Codemirror syntax templates
CodeMirror.defineMode('numara', () => ({
  startState: () => ({
    lastToken: null
  }),
  token: (stream, state) => {
    if (stream.eatSpace()) return null

    if (stream.match(/\/\/.*/) || stream.match(/#.*/)) {
      state.lastToken = 'comment'
      return 'comment'
    }

    if (stream.match(/\d/)) {
      state.lastToken = 'number'
      return 'number'
    }

    if (stream.match(/(?:\+|-|\*|\/|,|;|\.|:|@|~|=|>|<|&|\||`|'|\^|\?|!|%)/)) {
      const isDot = stream.current() === '.'
      let nextState = 'operator'

      if (isDot) {
        if (state.lastToken === 'formulajs') nextState = 'formulajs.'
        else if (state.lastToken === 'nerdamer') nextState = 'nerdamer.'
        else if (state.lastToken === 'datetime') nextState = 'datetime.'
      }

      state.lastToken = nextState

      return 'operator'
    }
    if (stream.match(/\bformulajs(?=[.]|\b)/)) {
      state.lastToken = 'formulajs'
      return 'formulajs'
    }

    if (stream.match(/\bnerdamer(?=[.(]|\b)/)) {
      state.lastToken = 'nerdamer'
      return 'nerdamer'
    }

    if (stream.match(/\bDateTime(?=[.]|\b)/)) {
      state.lastToken = 'datetime'
      return 'datetime'
    }

    const startChar = stream.peek()

    if (currencyTokens.has(startChar) && !/[\p{L}]/u.test(startChar)) {
      stream.next()
      state.lastToken = 'currency'
      return 'currency'
    }

    stream.eatWhile(/[\w\p{L}\p{M}]/u)

    const cmStream = stream.current()

    let style = null
    if (cmStream) {
      if (state.lastToken === 'formulajs.') {
        style = 'excel'
      } else if (state.lastToken === 'nerdamer.') {
        style = 'nerdamer'
      } else if (state.lastToken === 'datetime.') {
        style = 'function'
      } else {
        if (currencyTokens.has(cmStream)) style = 'currency'
        else if (/\bline\d+\b/.test(cmStream)) style = 'lineNo'
        else if (keywordTokens.has(cmStream)) style = 'keyword'
        else if (app.mathScope.has(cmStream) && typeof app.mathScope.get(cmStream) !== 'function') style = 'variable'
        else if (math.Unit.UNITS[cmStream]?.base.key === 'USD_STUFF') style = 'currency'
        else if (functionTokens.has(cmStream) || dateTimeMethodsSet.has(cmStream)) style = 'function'
        else if (constantTokens.has(cmStream)) style = 'constant'
        else if (unitTokens.has(cmStream)) style = 'unit'
        else if (app.udfList.includes(cmStream)) style = 'udf'
        else if (app.uduList.includes(cmStream)) style = 'udu'
        else if (excelTokens.has(cmStream)) style = 'excel'
        else style = 'text'
      }
    }

    if (style) {
      state.lastToken = style
      return style
    }

    stream.next()
    state.lastToken = 'text'
    return 'text'
  }
}))

CodeMirror.defineMode('plain', () => ({
  token: (stream) => {
    stream.next()
    return 'plain'
  }
}))

// Editor hints
const functionHints = mathFunctions
  .filter(([f]) => f !== 'DateTime')
  .map(([f]) => ({ text: f, className: CLASS_NAMES.FUNCTION }))
const constantHints = mathConstants.map(([c]) => ({
  text: c,
  desc: math.help(c).doc.description,
  className: CLASS_NAMES.CONSTANT
}))
const unitHints = units().map((u) => u.hint)
const keywordHints = keywords.map((key) => ({ ...key, className: CLASS_NAMES.KEYWORD }))
const excelHints = [...excelTokens].map((f) => ({ text: f, className: CLASS_NAMES.EXCEL }))

const dateTimeStaticMethods = Object.getOwnPropertyNames(DateTime).filter(
  (prop) => typeof DateTime[prop] === 'function'
)

const dateTimeStaticHints = [
  { text: 'DateTime', className: CLASS_NAMES.DATETIME, desc: 'Luxon DateTime class' },
  ...dateTimeStaticMethods.map((m) => ({
    text: `DateTime.${m}`,
    className: CLASS_NAMES.DATETIME,
    desc: `DateTime.${m} static method`,
    render: (el) => {
      el.innerHTML = `<span class="cm-datetime">DateTime</span>.<span class="cm-function">${m}</span>`
    }
  }))
]

const dateTimeInstanceMethods = Object.getOwnPropertyNames(DateTime.prototype).filter(
  (prop) => typeof DateTime.prototype[prop] === 'function' && prop !== 'constructor' && !prop.startsWith('_')
)

const dateTimeMethodsSet = new Set([...dateTimeStaticMethods, ...dateTimeInstanceMethods])

export const numaraHints = [
  ...functionHints,
  ...constantHints,
  ...unitHints,
  ...keywordHints,
  ...excelHints,
  ...dateTimeStaticHints
]

CodeMirror.registerHelper('hint', 'numaraHints', (editor) => {
  const cmCursor = editor.getCursor()
  const cmCursorLine = editor.getLine(cmCursor.line)

  let start = cmCursor.ch
  let end = start

  while (end < cmCursorLine.length && /[\w.$\p{L}\p{M}]/u.test(cmCursorLine.charAt(end))) ++end
  while (start && /[\w.$\p{L}\p{M}]/u.test(cmCursorLine.charAt(start - 1))) --start

  let curStr = cmCursorLine.slice(start, end)
  let curWord = start !== end && curStr
  let list = []

  if (curStr && curWord) {
    const searchWord = curWord.toLowerCase()
    const variableHints = []

    // Build hints for all variables from the current math scope
    for (const key of app.mathScope.keys()) {
      if (!keywordTokens.has(key)) {
        const lineMatch = key.match(/^line(\d+)$/)

        if (lineMatch) {
          const lineNum = parseInt(lineMatch[1], 10)

          if (lineNum >= cmCursor.line + 1) continue
        }
        variableHints.push({ text: key, className: CLASS_NAMES.VARIABLE })
      }
    }

    const userFunctionHints = app.udfList.map((funcName) => ({ text: funcName, className: CLASS_NAMES.FUNCTION }))
    const userUnitHints = app.uduList.map((unitName) => ({ text: unitName, className: CLASS_NAMES.UNIT }))

    let matches

    if (curStr.includes('.')) {
      const dotIndex = curStr.lastIndexOf('.')
      const prefix = curStr.slice(0, dotIndex + 1)
      const suffix = curStr.slice(dotIndex + 1).toLowerCase()

      if (prefix.toLowerCase() === 'datetime.') {
        matches = dateTimeStaticHints.filter(({ text }) => text.toLowerCase().startsWith(searchWord))
      } else if (prefix.toLowerCase() === 'formulajs.') {
        matches = excelHints.filter(({ text }) => text.toLowerCase().startsWith(searchWord))
      } else {
        matches = dateTimeInstanceMethods
          .filter((m) => m.toLowerCase().startsWith(suffix))
          .map((m) => ({
            text: prefix + m,
            className: CLASS_NAMES.DATETIME,
            desc: `DateTime.${m} instance method`,
            render: (el) => {
              el.innerHTML = `<span class="cm-variable">${prefix.slice(0, -1)}</span>.<span class="cm-function">${m}</span>`
            }
          }))
      }
    } else {
      const match = ({ text }) => text.toLowerCase().startsWith(searchWord)

      matches = [
        ...numaraHints.filter(match),
        ...variableHints.filter(match),
        ...userFunctionHints.filter(match),
        ...userUnitHints.filter(match)
      ]
    }

    list = matches.sort((a, b) => a.text.localeCompare(b.text, undefined, { numeric: true }))
  }

  return {
    list,
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

const HEADER_REGEXP = /^\s*(?:\/\/\s*)?(#{1,6})\s+(.*)$/
const END_SECTION_REGEXP = /^\s*(?:\/\/\s*)?#[!\s]*$/

CodeMirror.registerHelper('fold', 'numara', (cm, start) => {
  const startLineText = cm.getLine(start.line)

  if (!startLineText) return

  // Check for markdown headers
  const match = HEADER_REGEXP.exec(startLineText)

  if (match) {
    const headerLevel = match[1].length
    let endLine = -1
    const lastLine = cm.lineCount() - 1

    for (let i = start.line + 1; i <= lastLine; i++) {
      const text = cm.getLine(i)

      if (END_SECTION_REGEXP.test(text)) {
        endLine = i
        break
      }

      const m = HEADER_REGEXP.exec(text)

      if (m) {
        const nextLevel = m[1].length

        if (nextLevel <= headerLevel) {
          endLine = i - 1
          break
        }
      }
    }
    if (endLine === -1) {
      endLine = lastLine
    }
    if (endLine > start.line) {
      while (endLine > start.line && cm.getLine(endLine).trim() === '') {
        endLine--
      }

      if (endLine > start.line) {
        return {
          from: CodeMirror.Pos(start.line, startLineText.length),
          to: CodeMirror.Pos(endLine, cm.getLine(endLine).length)
        }
      }
    }
  }
})

/**
 * Forces CodeMirror editor scroll to focus line alignment at the bottom of the visible screen.
 */
function cmForceBottom() {
  const line = cm.getCursor().line
  const totalLines = cm.lineCount()

  if (line === totalLines - 1) {
    const inputScroll = dom.el('.CodeMirror-scroll')

    inputScroll.scrollTop = inputScroll.scrollHeight
    dom.output.scrollTop = dom.output.scrollHeight

    return
  }

  const lineRect = cm.charCoords({ line, ch: 0 }, 'window')
  const barTop = dom.el('.CodeMirror-hscrollbar')?.getBoundingClientRect()?.top

  if (barTop === undefined) return

  const lineHeight = lineRect.bottom - lineRect.top

  if (barTop - lineRect.top < lineHeight) {
    dom.output.scrollTop += lineHeight - (barTop - lineRect.top)
  }
}

/** Toggles comments on the selected lines.
 * @param {CodeMirror} cm - The CodeMirror instance to toggle comments on.
 */
function toggleComment(cm) {
  cm.operation(() => {
    for (const selection of cm.listSelections()) {
      const startLine = Math.min(selection.anchor.line, selection.head.line)
      const endLine = Math.max(selection.anchor.line, selection.head.line)
      const lines = []

      for (let i = startLine; i <= endLine; i++) {
        const line = cm.getLine(i)

        if (line != null) lines.push(line)
      }

      const allCommented = lines.every((line) => line.trim().startsWith('//'))

      for (let i = startLine; i <= endLine; i++) {
        const line = cm.getLine(i)

        if (line == null) continue

        const newLine = allCommented
          ? line.replace(/^(\s*)\/\/\s?/, '$1') // Remove comment
          : line.replace(/^(\s*)/, '$1// ') // Add comment

        cm.replaceRange(newLine, { line: i, ch: 0 }, { line: i, ch: line.length })
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
    'Ctrl-/': toggleComment,
    'Ctrl-Q': (cm) => cm.foldCode(cm.getCursor())
  },
  flattenSpans: true,
  foldGutter: {
    rangeFinder: CodeMirror.fold.numara,
    foldOnChangeTimeSpan: 1,
    updateViewportTimeSpan: 1
  },
  gutters: ['CodeMirror-foldgutter', 'CodeMirror-linenumbers'],
  mode: 'numara',
  smartIndent: false,
  theme: 'numara',
  viewportMargin: Infinity
})

cm.getInputField().setAttribute('id', 'inputAreaCodeMirror')
cm.getInputField().setAttribute('name', 'inputAreaCodeMirror')

const udOptions = { autoCloseBrackets: true, autofocus: true, mode: 'javascript', smartIndent: false, tabSize: 2 }

// Set the placeholder values of the user defined dialog CodeMirror instances
const udfPlaceholder = 'xyz: (x, y, z) => {\n\treturn x+y+z\n},\n\nmyConstant: 123'
const uduPlaceholder = 'foo: "18 foot",\nbar: "40 foo"'

dom.udfInput.setAttribute('placeholder', udfPlaceholder)
dom.uduInput.setAttribute('placeholder', uduPlaceholder)

export const udfInput = CodeMirror.fromTextArea(dom.udfInput, udOptions)
export const uduInput = CodeMirror.fromTextArea(dom.uduInput, udOptions)

udfInput.getInputField().setAttribute('id', 'udfInputCodeMirror')
udfInput.getInputField().setAttribute('name', 'udfInputCodeMirror')
uduInput.getInputField().setAttribute('id', 'uduInputCodeMirror')
uduInput.getInputField().setAttribute('name', 'uduInputCodeMirror')

export const debouncedCalculate = debounce(calculate, 100)

cm.on('changes', (cm, changes) => {
  if (app.loadingPage) return

  const hasNewLine = changes.some(
    (change) =>
      change.text.length > 1 || change.removed?.length > 1 || (change.origin === '+input' && change.text.includes(''))
  )

  if (hasNewLine) {
    debouncedCalculate.flush()
    calculate()
  } else {
    debouncedCalculate()
  }
})

/**
 * Toggle folded outputs.
 * @param {number} fromLine Start line.
 * @param {number} toLine End line.
 * @param {boolean} isFolded Whether the outputs are folded.
 */
function toggleFoldedOutputs(fromLine, toLine, isFolded) {
  const hasLineWidget = app.settings.answerPosition === 'bottom'

  for (let i = fromLine + 1; i <= toLine; i++) {
    if (hasLineWidget) {
      const lineHandle = cm.getLineHandle(i)

      if (lineHandle) {
        const widget = app.widgetMap.get(lineHandle)

        if (widget) {
          const newDisplay = isFolded ? 'none' : ''

          if (widget.node.style.display !== newDisplay) {
            widget.node.style.display = newDisplay
            widget.changed()
          }
        }
      }
    } else {
      const el = dom.el(`[data-index="${i}"]`)

      if (el) {
        el.style.display = isFolded ? 'none' : ''
      }
    }
  }
}

cm.on('fold', (cm, from, to) => {
  if (app.loadingPage) return

  toggleFoldedOutputs(from.line, to.line, true)
})

cm.on('unfold', (cm, from, to) => {
  if (app.loadingPage) return

  toggleFoldedOutputs(from.line, to.line, false)
})

cm.on('update', () => {
  if (app.loadingPage) return

  syncOutputHeights()
})

cm.on('inputRead', (cm) => {
  if (!app.settings.autocomplete) return

  CodeMirror.commands.autocomplete(cm)
})

let previousActiveLine = -1

cm.on('cursorActivity', (cm) => {
  const activeLine = cm.getCursor().line

  if (previousActiveLine !== -1 && previousActiveLine !== activeLine) {
    cm.removeLineClass(previousActiveLine, 'gutter', 'activeLine')
  }

  cm.addLineClass(activeLine, 'gutter', 'activeLine')
  previousActiveLine = activeLine

  setTimeout(cmForceBottom, 20)

  const pages = store.get('pages')
  const page = pages.find((page) => page.id === app.activePage)

  if (!page) return

  page.cursor = cm.getCursor()

  store.set('pages', pages)
})

cm.on('gutterClick', (cm, line, gutter) => {
  if (gutter !== 'CodeMirror-linenumbers') return

  const lineNo = line + 1
  const activeLine = cm.getCursor().line + 1
  const error = dom.el('[data-index="' + line + '"]')?.firstChild?.dataset.error

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
 * Helper to check if a token element is preceded by a specific keyword/namespace.
 * Uses node-walking to skip any text nodes (like whitespace).
 * @param {HTMLElement} target - The DOM element to check.
 * @param {string} name - The keyword name (e.g. 'DateTime', 'formulajs', 'nerdamer').
 * @returns {boolean} True if preceded by the keyword and dot.
 */
function isPrecededBy(target, name) {
  let node = target.previousSibling
  const parts = []

  while (node && parts.length < 2) {
    const text = node.textContent?.trim()

    if (text) {
      parts.push(text)
    }

    node = node.previousSibling
  }

  return parts[0] === '.' && parts[1] === name
}

/**
 * Displays a tooltip with the description and syntax of a mathematical function.
 * @param {HTMLElement} target - The DOM element representing the function for which to show the tooltip.
 */
function handleFunctionTooltip(target) {
  const text = target.textContent

  if (isPrecededBy(target, 'formulajs')) {
    showTooltip(target, 'Excel function')
    return
  }

  if (isPrecededBy(target, 'nerdamer')) {
    showTooltip(target, 'Nerdamer')
    return
  }

  if (isPrecededBy(target, 'DateTime')) {
    showTooltip(
      target,
      `<div>Luxon DateTime method</div>
      <div class="tooltipCode"><code>DateTime.${text}(...)</code></div>`
    )
    return
  }

  if (dateTimeInstanceMethods.includes(text)) {
    showTooltip(
      target,
      `<div>Luxon DateTime method</div>
      <div class="tooltipCode"><code>.${text}(...)</code></div>`
    )
    return
  }

  // 3. Fallback to standard Math.js help
  try {
    const tip = math.help(text).toJSON()
    const syntax = tip.syntax.map((s) =>
      s.replaceAll(/,/g, app.settings.thouSep !== 'disabled' && app.settings.inputLocale ? ';' : ',')
    )

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
    const text = target.textContent
    const code = currencyTokens.has(text)
      ? Object.keys(app.currencies).find((c) => app.currencies[c].symbol === text)
      : text?.toUpperCase()

    showTooltip(target, app.currencies[code]?.name || 'Description not available')
  } catch {
    showTooltip(target, 'Description not available')
  }
}

/**
 * Displays a tooltip with the description of a unit.
 * @param {HTMLElement} target - The DOM element representing the unit.
 */
function handleUnitTooltip(target) {
  const hint = numaraHints.find((hint) => hint.text === target.textContent)

  showTooltip(target, hint.desc)
}

/**
 * Displays a tooltip with the description of a constant.
 * @param {HTMLElement} target - The DOM element representing the constant.
 */
function handleConstantTooltip(target) {
  try {
    showTooltip(target, math.help(target.textContent).doc.description)
  } catch {
    /* No tooltip */
  }
}

/**
 * Displays a tooltip with the value of a variable.
 * @param {HTMLElement} target - The DOM element representing the variable.
 */
function handleVariableTooltip(target) {
  const text = target.textContent
  const val = app.mathScope.get(text)

  if (!val || typeof val === 'function') return

  let varTooltip = formatAnswer(val ?? 'Undefined')

  showTooltip(target, varTooltip)
}

/**
 * Displays a tooltip with the value or type of a line number reference.
 * @param {HTMLElement} target - The DOM element representing the line number.
 */
function handleLineNoTooltip(target) {
  const val = app.mathScope.get(target.textContent)
  let tooltip = typeof val === 'function' ? 'Function' : formatAnswer(val ?? 'Undefined')

  showTooltip(target, tooltip)
}

/**
 * Displays a tooltip with the description of a keyword.
 * @param {HTMLElement} target - The DOM element representing the keyword.
 */
function handleKeywordTooltip(target) {
  const keyword = keywords.find((key) => target.textContent === key.text)

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
  [CLASS_NAMES.NERDAMER]: (target) => showTooltip(target, 'Nerdamer'),
  [CLASS_NAMES.EXCEL]: (target) => showTooltip(target, 'Excel function'),
  [CLASS_NAMES.DATETIME]: (target) => showTooltip(target, 'Luxon DateTime')
}

/**
 * Refreshes the given CodeMirror editor and focuses it after a short delay.
 * @param {CodeMirror} editor - CodeMirror instance to refresh and focus.
 */
export function refreshEditor(editor = cm) {
  editor.operation(() => {
    editor.refresh()
    editor.setOption('mode', editor.getOption('mode'))
  })

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
  const isValid = activeLine > +event.target.textContent
  const hasError = event.target.parentElement.classList.contains('lineNoError')

  event.target.style.cursor = isValid || hasError ? 'pointer' : 'default'
  event.target.setAttribute(
    'title',
    hasError
      ? `Line ${event.target.textContent} has an error`
      : isValid && app.settings.keywordTips
        ? `Insert 'line${event.target.textContent}' to Line ${activeLine}`
        : ''
  )
})

document.addEventListener('keydown', (event) => {
  app.refreshCM = !event.repeat
})

document.addEventListener('keyup', () => {
  app.refreshCM = true
})
