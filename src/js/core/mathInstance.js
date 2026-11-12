import { all, create } from 'mathjs'

import { USD_UNIT } from './constants.js'
import { escapeRegExp } from './utils.js'

export const app = {
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

/**
 * Checks whether two currency maps have identical rates and symbols.
 * @param {object} a First currency map.
 * @param {object} b Second currency map.
 * @returns {boolean}
 */
function isSameCurrencies(a, b) {
  if (!a || !b) return false

  const keysA = Object.keys(a)
  const keysB = Object.keys(b)

  if (keysA.length !== keysB.length) return false

  for (let i = 0; i < keysA.length; i++) {
    const key = keysA[i]

    if (!b[key] || a[key].rate !== b[key].rate || a[key].symbol !== b[key].symbol) return false
  }

  return true
}

/**
 * Returns date and time format patterns derived from user settings.
 * @returns {{ todayFormat: string, todayDayFormat: string, nowFormat: string, nowDayFormat: string }}
 */
export function getDateFormatSettings() {
  const fmt = app.settings.dateFormat || 'MM/dd/yyyy'

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
 * @returns {boolean} True if currency state changed.
 */
export function refreshCurrencyState(currencies) {
  if (currencies !== undefined) {
    app.currencies = currencies
  }

  if (app.currencies === lastProcessedCurrencies) return false

  if (lastProcessedCurrencies && isSameCurrencies(app.currencies, lastProcessedCurrencies)) {
    lastProcessedCurrencies = app.currencies
    return false
  }

  lastProcessedCurrencies = app.currencies

  const entries = Object.entries(app.currencies || {})
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

    if (code !== USD_UNIT && info?.rate) {
      try {
        math.createUnit(
          code,
          {
            aliases:
              BUILTIN_UNIT_KEYS.has(code.toLowerCase()) || BUILTIN_MATH_KEYS.has(code.toLowerCase())
                ? []
                : [code.toLowerCase()],
            definition: math.unit(`${info.rate} ${USD_UNIT}`)
          },
          { override: true }
        )
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

  currencySymbolsRegex = symbolPatterns.length
    ? new RegExp(`(${numPattern})|(${symbolPatterns.join('|')})`, 'gu')
    : null
  currencyFormatRegex = codes.length
    ? new RegExp(`(-?\\d[\\d.,'\\u00A0\\u202F\\u2009 ]*(?:e[+-]?\\d+)?)\\s*\\b(${codes.join('|')})\\b`, 'gi')
    : null

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
