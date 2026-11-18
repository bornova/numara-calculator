import { all, create } from 'mathjs'

import { USD_UNIT } from './constants.js'
import { escapeRegExp } from './utils.js'

export const calcState = {
  settings: {},
  currencies: {},
  mathScope: new Map(),
  udfList: [],
  uduList: []
}

export const math = create(all)

const isAlphaOriginal = math.parse.isAlpha
const universalRegex = /[\p{L}\p{M}]/u

math.parse.isAlpha = (c, cPrev, cNext) => isAlphaOriginal(c, cPrev, cNext) || universalRegex.test(c)

math.import(
  {
    page: () => ({})
  },
  { override: true }
)

export const BUILTIN_UNIT_KEYS = new Set(Object.keys(math.Unit.UNITS))
export const BUILTIN_MATH_KEYS = new Set(Object.keys(math.expression.mathWithTransform))

export let currencySymbolsRegex = null
export let currencyFormatRegex = null

let currencySymbolToCode = {}
let lastProcessedCurrencies = null
let lastProcessedUseRates = null

/**
 * Checks whether two currency maps have identical rates and symbols.
 * @param {object} a First currency map.
 * @param {object} b Second currency map.
 * @returns {boolean}
 */
function isSameCurrencies(a, b) {
  if (!a || !b) {
    return false
  }

  const keysA = Object.keys(a)
  const keysB = Object.keys(b)

  if (keysA.length !== keysB.length) {
    return false
  }

  for (let i = 0; i < keysA.length; i++) {
    const key = keysA[i]

    if (!b[key] || a[key].rate !== b[key].rate || a[key].symbol !== b[key].symbol) {
      return false
    }
  }

  return true
}

/**
 * Returns date and time format patterns derived from user settings.
 * @returns {{ todayFormat: string, todayDayFormat: string, nowFormat: string, nowDayFormat: string }}
 */
export function getDateFormatSettings() {
  const fmt = calcState.settings.dateFormat || 'MM/dd/yyyy'

  return {
    todayFormat: fmt,
    todayDayFormat: 'ccc, ' + fmt,
    nowFormat: fmt + ' t',
    nowDayFormat: 'ccc, ' + fmt + ' t'
  }
}

/**
 * Converts padded date format tokens (`dd`, `MM`) into flexible single-digit tokens (`d`, `M`).
 * @param {string} fmt Date format string.
 * @returns {string}
 */
export function getFlexibleFormat(fmt) {
  return !fmt ? fmt : fmt.replace(/dd/g, 'd').replace(/MM/g, 'M')
}

/**
 * Registers currency units in Math.js and rebuilds symbol/code matching regexes.
 * @param {object} [currencies] Optional currency configuration map to apply before refreshing.
 * @param {boolean} [useRates=Boolean(calcState.settings?.currency ?? true)] Whether exchange rate definitions should be applied.
 * @returns {boolean} True if currency state changed.
 */
export function refreshCurrencyState(currencies, useRates = Boolean(calcState.settings?.currency ?? true)) {
  if (currencies !== undefined) {
    calcState.currencies = currencies
  }

  const effectiveUseRates = Boolean(useRates)

  if (
    effectiveUseRates === lastProcessedUseRates &&
    (calcState.currencies === lastProcessedCurrencies ||
      (lastProcessedCurrencies && isSameCurrencies(calcState.currencies, lastProcessedCurrencies)))
  ) {
    lastProcessedCurrencies = calcState.currencies
    return false
  }

  lastProcessedCurrencies = calcState.currencies
  lastProcessedUseRates = effectiveUseRates

  const entries = Object.entries(calcState.currencies || {})
  const codes = []
  const symbols = []

  currencySymbolToCode = {}

  try {
    if (!math.Unit.UNITS[USD_UNIT] && !math.Unit.UNITS[USD_UNIT.toLowerCase()]) {
      math.createUnit(USD_UNIT, { aliases: [USD_UNIT.toLowerCase()] })
    }
  } catch {
    // Ignore
  }

  for (const [code, info] of entries) {
    codes.push(code)

    if (info?.symbol && !(info.symbol in currencySymbolToCode)) {
      currencySymbolToCode[info.symbol] = code
      symbols.push(info.symbol)
    }

    if (code !== USD_UNIT) {
      const aliases =
        BUILTIN_UNIT_KEYS.has(code.toLowerCase()) || BUILTIN_MATH_KEYS.has(code.toLowerCase())
          ? []
          : [code.toLowerCase()]

      try {
        if (effectiveUseRates && info?.rate) {
          math.createUnit(code, { aliases, definition: math.unit(`${info.rate} ${USD_UNIT}`) }, { override: true })
        } else {
          const baseName = `${code}_STUFF`
          const existingBase = math.Unit.BASE_UNITS[baseName]

          if (existingBase) {
            // Reusing the cached base dimension avoids Math.js throwing on re-created standalone base units
            const def = new math.Unit()
            def.value = 1
            def.dimensions = existingBase.dimensions.slice()

            math.createUnit(code, { aliases, definition: def }, { override: true })

            if (math.Unit.UNIT_SYSTEMS.auto?.[baseName] && math.Unit.UNITS[code]) {
              math.Unit.UNIT_SYSTEMS.auto[baseName].unit = math.Unit.UNITS[code]
            }
          } else {
            math.createUnit(code, { aliases }, { override: true })
          }
        }
      } catch {
        // Ignore
      }
    }
  }

  const numPattern =
    '\\b0[xX][0-9a-fA-F]+\\b|\\b0[bB][01]+\\b|\\b0[oO][0-7]+\\b|\\b(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:[eE][+-]?\\d+)?\\b'

  const symbolPatterns = symbols
    .sort((a, b) => b.length - a.length)
    .map((symbol) => {
      const startsWithLetter = /^[\p{L}\p{M}]/u.test(symbol)
      const endsWithLetter = /[\p{L}\p{M}]$/u.test(symbol)
      const isAsciiLettersOnly = /^[a-zA-Z]+$/.test(symbol)
      const prefix = startsWithLetter ? '(?<![\\p{L}\\p{M}_][\\p{L}\\p{M}\\d_]*)' : ''
      const suffix = endsWithLetter ? (isAsciiLettersOnly ? '(?![\\p{L}\\p{M}\\d_])' : '(?![\\p{L}\\p{M}_])') : ''

      return `${prefix}${escapeRegExp(symbol)}${suffix}`
    })

  const escapedCodes = codes.map(escapeRegExp).join('|')
  const formattedNumPattern = "-?(?:\\d{1,3}(?:[.,'\\u00A0\\u202F\\u2009 ]\\d{3})+|\\d+)(?:[.,]\\d+)?(?:e[+-]?\\d+)?"

  currencySymbolsRegex = symbolPatterns.length
    ? new RegExp(`(${numPattern})|(${symbolPatterns.join('|')})`, 'gu')
    : null
  currencyFormatRegex = codes.length ? new RegExp(`(${formattedNumPattern})\\s*\\b(${escapedCodes})\\b`, 'gi') : null

  return true
}

/**
 * Replaces a currency symbol glyph with its 3-letter ISO currency code.
 * @param {string} symbol Currency symbol.
 * @returns {string}
 */
export function replaceCurrencySymbol(symbol) {
  const code = currencySymbolToCode[symbol]

  return code ? code + ' ' : symbol
}
