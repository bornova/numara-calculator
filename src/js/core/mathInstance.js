import { create, all } from 'mathjs'
import {
  escapeHTML,
  escapeRegExp,
  getAppLocale as coreGetAppLocale,
  getSystemLocale as coreGetSystemLocale,
  localeUsesComma as coreLocaleUsesComma
} from './utils.js'

export { escapeHTML, escapeRegExp }

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

export function getAppLocale() {
  return coreGetAppLocale(app.settings)
}

export function getSystemLocale() {
  return coreGetSystemLocale(app.settings)
}

export function localeUsesComma() {
  return coreLocaleUsesComma(app.settings)
}

export function getDateFormatSettings() {
  const fmt = app.settings.dateFormat || 'system'

  return fmt === 'system'
    ? {
        todayFormat: 'D',
        todayDayFormat: 'ccc, D',
        nowFormat: 'D t',
        nowDayFormat: 'ccc, D t'
      }
    : {
        todayFormat: fmt,
        todayDayFormat: 'ccc, ' + fmt,
        nowFormat: fmt + ' t',
        nowDayFormat: 'ccc, ' + fmt + ' t'
      }
}

export function getFlexibleFormat(fmt) {
  return !fmt ? fmt : fmt.replace(/dd/g, 'd').replace(/MM/g, 'M')
}

export let currencySymbolsRegex = null
export let currencyFormatRegex = null
export let currencySymbolToCode = {}
let lastProcessedCurrencies = null

const USD_UNIT = 'USD'

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

export function refreshCurrencyState() {
  if (app.currencies === lastProcessedCurrencies) return

  if (lastProcessedCurrencies && isSameCurrencies(app.currencies, lastProcessedCurrencies)) {
    lastProcessedCurrencies = app.currencies
    return
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
              code.toLowerCase() in math.Unit.UNITS || code.toLowerCase() in math.expression.mathWithTransform
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

  const letterSymbols = []
  const nonLetterSymbols = []
  const letterRegex = /[\p{L}]/u

  for (const symbol of symbols) {
    if (letterRegex.test(symbol)) {
      letterSymbols.push(symbol)
    } else {
      nonLetterSymbols.push(symbol)
    }
  }

  const parts = []

  if (letterSymbols.length) {
    parts.push(
      `(?<![\\p{L}\\p{M}_][\\p{L}\\p{M}\\d_]*)(?:${letterSymbols
        .sort((a, b) => b.length - a.length)
        .map(escapeRegExp)
        .join('|')})(?![\\p{L}\\p{M}\\d_])`
    )
  }

  if (nonLetterSymbols.length) {
    parts.push(
      `(?:${nonLetterSymbols
        .sort((a, b) => b.length - a.length)
        .map(escapeRegExp)
        .join('|')})`
    )
  }

  currencySymbolsRegex = symbols.length ? new RegExp(`(${numPattern})|(${parts.join('|')})`, 'gu') : null
  currencyFormatRegex = codes.length
    ? new RegExp(`(-?\\d[\\d.,'\\u00A0\\u202F\\u2009 ]*(?:e[+-]?\\d+)?)\\s*\\b(${codes.join('|')})\\b`, 'gi')
    : null
}

export function replaceCurrencySymbol(symbol) {
  const code = currencySymbolToCode[symbol]

  return code ? code + ' ' : symbol
}

const numberFormatCache = new Map()
const localeSeparatorCache = new Map()

function getNumberFormatter(locale, options) {
  const key = `${locale}_${options.useGrouping ?? ''}_${options.maximumFractionDigits ?? ''}_${options.style ?? ''}_${options.currency ?? ''}`
  let formatter = numberFormatCache.get(key)

  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, options)
    numberFormatCache.set(key, formatter)
  }

  return formatter
}

export function stripAnswer(answer) {
  return typeof answer === 'string' ? answer.replace(/^"|"$/g, '') : answer
}

export function getLocaleSeparators(locale) {
  if (locale === 'en-US') return { group: ',', decimal: '.' }
  if (locale === 'tr-TR') return { group: '.', decimal: ',' }

  let sep = localeSeparatorCache.get(locale)

  if (sep) return sep

  const parts = new Intl.NumberFormat(locale).formatToParts(12345.6)

  sep = {
    group: parts.find((p) => p.type === 'group')?.value ?? ',',
    decimal: parts.find((p) => p.type === 'decimal')?.value ?? '.'
  }

  localeSeparatorCache.set(locale, sep)

  return sep
}

export function parseLocaleNumber(str, locale) {
  const { group, decimal } = getLocaleSeparators(locale)
  const cleaned = str
    .replace(new RegExp(escapeRegExp(group), 'g'), '')
    .replace(/[\u00A0\u202F\u2009 ]/g, '')
    .replace(decimal, '.')

  return parseFloat(cleaned)
}

export function formatCurrency(str) {
  if (!currencyFormatRegex) return str

  const appLocale = getAppLocale()
  const useGrouping = app.settings.thouSep !== 'disabled'
  const maximumFractionDigits = app.settings.precision

  return str.replace(currencyFormatRegex, (match, amount, code) => {
    const upperCode = code.toUpperCase()
    const info = app.currencies[upperCode]

    if (!info) return match

    const trimmed = amount.trim()
    const eIndex = trimmed.search(/e[+-]?\d+$/i)
    const baseStr = eIndex >= 0 ? trimmed.slice(0, eIndex) : trimmed
    const expStr = eIndex >= 0 ? trimmed.slice(eIndex) : ''
    const value = parseLocaleNumber(baseStr, appLocale)

    if (!Number.isFinite(value)) return `${info.symbol ?? ''}${trimmed}`

    const locale = appLocale

    try {
      const formatter = getNumberFormatter(locale, {
        style: 'currency',
        currency: upperCode,
        currencyDisplay: 'narrowSymbol',
        useGrouping,
        maximumFractionDigits
      })

      return formatter.format(value) + expStr
    } catch {
      return `${info.symbol ?? ''}${trimmed}${expStr}`
    }
  })
}

export function formatAnswer(answer, useGrouping) {
  if (typeof answer === 'string') return stripAnswer(answer)

  const notation = app.settings.notation
  const lowerExp = +app.settings.expLower
  const upperExp = +app.settings.expUpper
  const locale = getAppLocale()
  const maximumFractionDigits = +app.settings.precision

  if (['bin', 'hex', 'oct'].includes(notation)) {
    answer = math.format(answer, { notation })

    return stripAnswer(answer)
  }

  const formatOptions = { notation, lowerExp, upperExp }
  const localeOptions = { maximumFractionDigits, useGrouping }
  const formatter = getNumberFormatter(locale, localeOptions)
  const { decimal: decimalSeparator, group: groupSeparator } = getLocaleSeparators(locale)

  function formatNumericString(numStr, decSep, grpSep, useGrp) {
    const parts = numStr.split('.')
    let integerPart = parts[0]
    const decimalPart = parts[1] || ''

    if (useGrp && grpSep) {
      const isNegative = integerPart.startsWith('-')

      if (isNegative) {
        integerPart = integerPart.slice(1)
      }

      integerPart = integerPart.slice(0).replace(/\B(?=(\d{3})+(?!\d))/g, grpSep)

      if (isNegative) {
        integerPart = '-' + integerPart
      }
    }

    if (decimalPart) return integerPart + decSep + decimalPart

    return integerPart
  }

  let processedAnswer = answer

  if (typeof maximumFractionDigits === 'number' && !isNaN(maximumFractionDigits)) {
    try {
      processedAnswer = math.round(answer, maximumFractionDigits)
    } catch {
      // ignore
    }
  }

  let formattedAnswer = math.format(processedAnswer, (value) => {
    let roundedValue = value

    if (typeof maximumFractionDigits === 'number' && !isNaN(maximumFractionDigits)) {
      try {
        roundedValue = math.round(value, maximumFractionDigits)
      } catch {
        // ignore
      }
    }

    const valueStr = math.format(roundedValue, formatOptions)

    if (typeof roundedValue === 'number' && notation === 'auto' && !valueStr.includes('e')) {
      const formatted = formatter.format(roundedValue)
      const expectedDecimal = decimalSeparator
      const hasDecimal = valueStr.includes('.')

      if (!hasDecimal || formatted.includes(expectedDecimal)) return formatted
    }

    if (valueStr.includes('e')) {
      const [base, exponent] = valueStr.split('e')

      return formatNumericString(base, decimalSeparator, groupSeparator, useGrouping) + 'e' + exponent
    }

    return formatNumericString(valueStr, decimalSeparator, groupSeparator, useGrouping)
  })

  if (app.settings.currency) {
    formattedAnswer = formatCurrency(formattedAnswer)
  }

  return stripAnswer(formattedAnswer)
}
