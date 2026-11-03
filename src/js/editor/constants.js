import { DateTime } from 'luxon'

import { math } from '../core/mathInstance.js'
import { app } from '../state/appState.js'

export const CLASS_NAMES = {
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

const mathEntries = Object.entries(math.expression.mathWithTransform)

export const mathFunctions = mathEntries.filter(([k]) => typeof math[k] === 'function')
export const mathConstants = mathEntries.filter(
  ([k]) => typeof math[k] !== 'function' && typeof math[k] !== 'boolean' && (math[k]?.value || !isNaN(math[k]))
)

/**
 * Resolves all built-in Math.js units and their prefixes into helper hint structures.
 * @returns {Array<{token: string, hint: {text: string, desc: string, className: string}}>} Array of hints.
 */
function buildUnits() {
  return Object.values(math.Unit.UNITS).flatMap((unit) =>
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
}

export const allUnits = buildUnits()

export const functionTokens = new Set(mathFunctions.map(([f]) => f))
export const constantTokens = new Set(mathConstants.map(([c]) => c))
export const unitTokens = new Set(allUnits.map((u) => u.token))
export const keywordTokens = new Set(keywords.map((key) => key.text))
export const currencyTokens = new Set()

export const dateTimeStaticMethods = Object.getOwnPropertyNames(DateTime).filter(
  (prop) => typeof DateTime[prop] === 'function'
)

export const dateTimeInstanceMethods = Object.getOwnPropertyNames(DateTime.prototype).filter(
  (prop) => typeof DateTime.prototype[prop] === 'function' && prop !== 'constructor' && !prop.startsWith('_')
)

export const dateTimeMethodsSet = new Set([...dateTimeStaticMethods, ...dateTimeInstanceMethods])

/**
 * Rebuilds the set of currency symbol glyphs from `app.currencies`.
 */
export function refreshCurrencyTokens() {
  currencyTokens.clear()

  for (const c of Object.values(app.currencies || {})) {
    if (c?.symbol) {
      currencyTokens.add(c.symbol)
    }
  }
}
