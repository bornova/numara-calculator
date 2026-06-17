import UIkit from 'uikit'
import { app } from '../appState'
import { math, formatAnswer } from '../calc/calcManager'

let cm, numaraHints, keywords, currencyTokens, CLASS_NAMES, dateTimeInstanceMethods
let TOOLTIP_HANDLERS = {}

/**
 * Determines the tooltip position based on the given element.
 * @param {Element} el The DOM element to check.
 * @returns {string} Returns 'right' if the element is an <li>, otherwise 'top-left'.
 */
function getTooltipPosition(el) {
  return el.nodeName.toLowerCase() === 'li' ? 'right' : 'top-left'
}

/**
 * Displays a tooltip on the specified target element with the given title.
 * @param {HTMLElement|string} target The target element or selector to attach the tooltip to.
 * @param {string} title The text to display inside the tooltip.
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
 * @param {HTMLElement} target The DOM element to check.
 * @param {string} name The keyword name (e.g. 'DateTime', 'formulajs', 'nerdamer').
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
 * @param {HTMLElement} target The DOM element representing the function for which to show the tooltip.
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

  // Fallback to standard Math.js help
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
 * @param {HTMLElement} target The DOM element representing the currency.
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
 * @param {HTMLElement} target The DOM element representing the unit.
 */
function handleUnitTooltip(target) {
  const hint = numaraHints.find((hint) => hint.text === target.textContent)

  showTooltip(target, hint?.desc || 'Unit description not available')
}

/**
 * Displays a tooltip with the description of a constant.
 * @param {HTMLElement} target The DOM element representing the constant.
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
 * @param {HTMLElement} target The DOM element representing the variable.
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
 * @param {HTMLElement} target The DOM element representing the line number.
 */
function handleLineNoTooltip(target) {
  const val = app.mathScope.get(target.textContent)
  let tooltip = typeof val === 'function' ? 'Function' : formatAnswer(val ?? 'Undefined')

  showTooltip(target, tooltip)
}

/**
 * Displays a tooltip with the description of a keyword.
 * @param {HTMLElement} target The DOM element representing the keyword.
 */
function handleKeywordTooltip(target) {
  const keyword = keywords.find((key) => target.textContent === key.text)

  showTooltip(target, keyword?.desc || 'Keyword description not available')
}

/**
 * Initializes tooltip hover listeners for the editor.
 * @param {Object} cmInstance The CodeMirror instance.
 * @param {Array} hints The list of numara autocomplete hints.
 * @param {Array} kw The list of keywords.
 * @param {Set} curTokens The set of active currency symbol strings.
 * @param {Object} clsNames The css class names mapping object.
 * @param {Array} dtInstanceMethods The custom Luxon DateTime instance methods names.
 */
export function initTooltips(cmInstance, hints, kw, curTokens, clsNames, dtInstanceMethods) {
  cm = cmInstance
  numaraHints = hints
  keywords = kw
  currencyTokens = curTokens
  CLASS_NAMES = clsNames
  dateTimeInstanceMethods = dtInstanceMethods

  TOOLTIP_HANDLERS = {
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
}
