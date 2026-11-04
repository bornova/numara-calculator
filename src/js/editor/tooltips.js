import UIkit from 'uikit'

import { formatAnswer, math } from '../calc/calcManager.js'
import { escapeHTML } from '../core/utils.js'
import { app } from '../state/appState.js'
import { CLASS_NAMES, currencyTokens, dateTimeInstanceMethods, keywords } from './constants.js'
import { numaraHints } from './hints.js'

let cm
const hintMap = new Map()
const keywordMap = new Map(keywords.map((k) => [k.text, k]))
const dateTimeInstanceMethodsSet = new Set(dateTimeInstanceMethods)

/**
 * Determines the tooltip position based on the given element.
 * @param {Element} el The DOM element to check.
 * @returns {string} Returns 'right' if the element is an <li>, otherwise 'top-left'.
 */
function getTooltipPosition(el) {
  return el?.closest?.('.CodeMirror-hints') ? 'right' : 'top-left'
}

/**
 * Displays a tooltip on the specified target element with the given title.
 * @param {Element} target The target DOM element to attach the tooltip to.
 * @param {string} title The text to display inside the tooltip.
 */
function showTooltip(target, title) {
  UIkit.tooltip(target, {
    pos: getTooltipPosition(target),
    title
  }).show()
}

/**
 * Returns the identifier preceding a dot before the given token element, if any.
 * @param {Element} target The DOM element to check.
 * @returns {string|null} The preceding identifier name, or null.
 */
function getPrecededByName(target) {
  let node = target.previousSibling
  const parts = []

  while (node && parts.length < 2) {
    const text = node.textContent?.trim()

    if (text) {
      parts.push(text)
    }

    node = node.previousSibling
  }

  return parts[0] === '.' ? parts[1] || null : null
}

/**
 * Displays a tooltip with the description and syntax of a mathematical function.
 * @param {HTMLElement} target The DOM element representing the function for which to show the tooltip.
 */
function handleFunctionTooltip(target) {
  const text = target.textContent
  const parentName = getPrecededByName(target)

  if (parentName === 'formulajs') {
    showTooltip(target, 'Excel function')
    return
  }

  if (parentName === 'nerdamer') {
    showTooltip(target, 'Nerdamer')
    return
  }

  if (parentName === 'DateTime') {
    showTooltip(
      target,
      `<div>Luxon DateTime method</div>
      <div class="tooltipCode"><code>DateTime.${escapeHTML(text)}(...)</code></div>`
    )
    return
  }

  if (parentName && dateTimeInstanceMethodsSet.has(text)) {
    showTooltip(
      target,
      `<div>Luxon DateTime method</div>
      <div class="tooltipCode"><code>.${escapeHTML(text)}(...)</code></div>`
    )
    return
  }

  if (text === 'page') {
    showTooltip(
      target,
      `<div>Import variables from another page</div>
      <div class="tooltipCode"><code>page("pageName")</code></div>`
    )
    return
  }

  // Fallback to standard Math.js help
  try {
    const tip = math.help(text).toJSON()
    const syntax = tip.syntax.map((s) => s.replaceAll(/,/g, app.settings.numberFormat === '1.234,56' ? ';' : ','))

    showTooltip(
      target,
      `<div>${escapeHTML(tip.description)}</div>
      <div class="tooltipCode">${syntax.map((s) => `<code>${escapeHTML(s)}</code>`).join(' ')}</div>`
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
    const currencyName = app.currencies[code]?.name

    showTooltip(target, currencyName ? escapeHTML(currencyName) : 'Description not available')
  } catch {
    showTooltip(target, 'Description not available')
  }
}

/**
 * Displays a tooltip with the description of a unit.
 * @param {HTMLElement} target The DOM element representing the unit.
 */
function handleUnitTooltip(target) {
  const text = target.textContent
  let hint = hintMap.get(text)

  if (!hint) {
    hint = numaraHints.find((h) => h.text === text)
    if (hint) hintMap.set(text, hint)
  }

  showTooltip(target, escapeHTML(hint?.desc || 'Unit description not available'))
}

/**
 * Displays a tooltip with the description of a constant.
 * @param {HTMLElement} target The DOM element representing the constant.
 */
function handleConstantTooltip(target) {
  try {
    showTooltip(target, escapeHTML(math.help(target.textContent).doc.description))
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
  const parentName = getPrecededByName(target)
  const lookupKey = parentName ? `${parentName}.${text}` : text
  const val = app.mathScope.get(lookupKey)

  if (!val || typeof val === 'function' || app.scopeTypes?.[lookupKey] === 'function') return

  const varTooltip = formatAnswer(val ?? 'Undefined')

  showTooltip(target, escapeHTML(varTooltip))
}

/**
 * Displays a tooltip with the value or type of a line number reference.
 * @param {HTMLElement} target The DOM element representing the line number.
 */
function handleLineNoTooltip(target) {
  const text = target.textContent
  const val = app.mathScope.get(text)
  const lineTooltip =
    typeof val === 'function' || app.scopeTypes?.[text] === 'function' ? 'Function' : formatAnswer(val ?? 'Undefined')

  showTooltip(target, escapeHTML(lineTooltip))
}

/**
 * Displays a tooltip with the description of a keyword.
 * @param {HTMLElement} target The DOM element representing the keyword.
 */
function handleKeywordTooltip(target) {
  const keyword = keywordMap.get(target.textContent)

  showTooltip(target, keyword?.desc || 'Keyword description not available')
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
 * Initializes tooltip hover listeners for the editor.
 * @param {Object} cmInstance The CodeMirror instance.
 */
export function initTooltips(cmInstance) {
  cm = cmInstance

  document.addEventListener('mouseover', (event) => {
    if (!event.target?.closest?.('.cm-s-numara, .CodeMirror-hints')) return

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
