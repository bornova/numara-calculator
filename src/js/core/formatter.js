import {
  CHART_SPLINE_ICON_SVG,
  CLASS_ANSWER,
  CLASS_LINE_ERROR_LINK,
  CLASS_PLOT_BUTTON,
  PAGE_OBJECT_SYMBOL
} from './constants.js'
import { calcState, currencyFormatRegex, math } from './mathInstance.js'
import { transformOutsideStrings } from './preprocessor.js'
import { escapeHTML, getNumberFormat } from './utils.js'

const numberFormatCache = new Map()
const clampPrecision = (p) => Math.min(Math.max(0, Number.isFinite(+p) ? Math.trunc(+p) : 0), 100)

/**
 * Retrieves or creates a cached `Intl.NumberFormat` instance.
 * @param {string} locale Locale tag.
 * @param {Intl.NumberFormatOptions} options Formatting options.
 * @returns {Intl.NumberFormat}
 */
function getNumberFormatter(locale, options) {
  const key = `${locale}_${options.useGrouping ?? ''}_${options.maximumFractionDigits ?? ''}_${options.style ?? ''}_${options.currency ?? ''}`
  let formatter = numberFormatCache.get(key)

  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, options)
    numberFormatCache.set(key, formatter)
  }

  return formatter
}

/**
 * Formats a numeric string with custom decimal and group separators.
 * @param {string} numStr Raw numeric string.
 * @param {string} decSep Decimal separator character.
 * @param {string} grpSep Group separator character.
 * @param {boolean} useGrp Whether grouping is enabled.
 * @returns {string}
 */
function formatNumericString(numStr, decSep, grpSep, useGrp) {
  const parts = numStr.split('.')
  let integerPart = parts[0]
  const decimalPart = parts[1] || ''

  if (useGrp && grpSep) {
    const isNegative = integerPart.startsWith('-')

    if (isNegative) {
      integerPart = integerPart.slice(1)
    }

    integerPart = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, grpSep)

    if (isNegative) {
      integerPart = '-' + integerPart
    }
  }

  if (decimalPart) {
    return integerPart + decSep + decimalPart
  }

  return integerPart
}

/**
 * Strips a balanced pair of surrounding double quotes from a formatted string answer.
 * @param {*} answer Raw or formatted answer.
 * @returns {*}
 */
export function stripAnswer(answer) {
  return typeof answer === 'string' && answer.length >= 2 && answer.startsWith('"') && answer.endsWith('"')
    ? answer.slice(1, -1)
    : answer
}

/**
 * Parses a localized number string into a standard JavaScript float.
 * @param {string} str Localized numeric string.
 * @param {object} [settings=calcState.settings] Settings object containing number format configuration.
 * @returns {number}
 */
export function parseLocaleNumber(str, settings = calcState.settings) {
  if (typeof str !== 'string') {
    return NaN
  }

  const { group, decimal } = getNumberFormat(settings)
  const cleaned = str
    .replaceAll(group, '')
    .replace(/[\u00A0\u202F\u2009 ]/g, '')
    .replace(decimal, '.')
    .trim()

  return cleaned === '' ? NaN : Number(cleaned)
}

const STRICT_LOCALE_NUMBER_REGEX = /^-?\d[\d.,\s\u00A0\u202F\u2009]*(?:e[+-]?\d+)?$/i

/**
 * Parses a localized numeric string only when the entire trimmed input is a numeric literal.
 * @param {string} str Raw string to validate and parse.
 * @param {object} [settings=calcState.settings] Settings object containing number format configuration.
 * @returns {number} Finite number or `NaN`.
 */
export function parseStrictLocaleNumber(str, settings = calcState.settings) {
  if (typeof str !== 'string') {
    return NaN
  }

  const trimmed = str.trim()

  if (!STRICT_LOCALE_NUMBER_REGEX.test(trimmed)) {
    return NaN
  }

  const num = parseLocaleNumber(trimmed, settings)

  return Number.isFinite(num) ? num : NaN
}

/**
 * Formats currency amounts within an output string using `Intl.NumberFormat`.
 * @param {string} str Output string potentially containing currency values.
 * @param {boolean} [useGrouping] Whether to apply thousands grouping.
 * @param {object} [settings=calcState.settings] Settings object.
 * @param {object} [currencies=calcState.currencies] Currencies configuration map.
 * @returns {string}
 */
function formatCurrency(str, useGrouping, settings = calcState.settings, currencies = calcState.currencies) {
  if (!currencyFormatRegex) {
    return str
  }

  const { locale, group, useGrouping: defaultGrouping } = getNumberFormat(settings)
  const effectiveGrouping = useGrouping ?? defaultGrouping
  const maximumFractionDigits = clampPrecision(settings?.precision ?? 4)

  return transformOutsideStrings(str, (segment) =>
    segment.replace(currencyFormatRegex, (match, fracIntAmount, stdAmount, code) => {
      const amount = fracIntAmount ?? stdAmount
      const upperCode = code.toUpperCase()
      const info = currencies?.[upperCode]

      if (!info) {
        return match
      }

      const trimmed = amount.trim()
      const eIndex = trimmed.search(/e[+-]?\d+$/i)
      const baseStr = eIndex >= 0 ? trimmed.slice(0, eIndex) : trimmed
      const expStr = eIndex >= 0 ? trimmed.slice(eIndex) : ''
      const sigDigits = baseStr.replace(/\D/g, '').replace(/^0+/, '')

      if (sigDigits.length > 15) {
        const isNeg = trimmed.startsWith('-')
        const absTrimmed = isNeg ? trimmed.slice(1) : trimmed
        const sym = info.symbol ?? upperCode
        const sep = /^[a-zA-Z]+$/.test(sym) ? ' ' : ''

        return `${isNeg ? '-' : ''}${sym}${sep}${absTrimmed}`
      }

      const value = parseLocaleNumber(baseStr, settings)

      if (!Number.isFinite(value)) {
        return `${info.symbol ?? ''}${trimmed}`
      }

      try {
        const formatter = getNumberFormatter(locale, {
          style: 'currency',
          currency: upperCode,
          currencyDisplay: 'narrowSymbol',
          useGrouping: effectiveGrouping,
          maximumFractionDigits
        })

        const customSymbol =
          info.symbol &&
          info.symbol !== '$' &&
          (info.symbol !== upperCode || upperCode === 'NOK' || upperCode === 'ISK')
            ? info.symbol
            : null

        if ((effectiveGrouping && group === ' ') || customSymbol) {
          const parts = formatter.formatToParts(value)
          const nonLetterSymbol = customSymbol && (!/[\p{L}\p{M}]/u.test(customSymbol) || customSymbol.endsWith('$'))
          let skipSpace = false

          return (
            parts
              .map((part, idx) => {
                if (skipSpace) {
                  skipSpace = false
                  if (part.type === 'literal' && /^\s+$/.test(part.value)) return ''
                }

                if (effectiveGrouping && group === ' ' && part.type === 'group') return group

                if (
                  customSymbol &&
                  part.type === 'currency' &&
                  (part.value === '$' || part.value === 'kr' || part.value.toUpperCase() === upperCode)
                ) {
                  const isPrefix = !parts.slice(0, idx).some((p) => p.type === 'integer' || p.type === 'fraction')
                  skipSpace = Boolean(
                    isPrefix && nonLetterSymbol && (part.value === 'kr' || part.value.toUpperCase() === upperCode)
                  )
                  return customSymbol
                }

                return part.value
              })
              .join('') + expStr
          )
        }

        return formatter.format(value) + expStr
      } catch {
        return `${info.symbol ?? ''}${trimmed}${expStr}`
      }
    })
  )
}

function isExactZero(val) {
  if (math.isBigNumber(val)) {
    return val.isZero()
  }

  return Number(val) === 0
}

function roundScalar(value, digits, notation) {
  if (math.isFraction(value)) return value

  try {
    const rounded = math.round(value, digits)

    if (
      notation === 'fixed' ||
      !isExactZero(rounded) ||
      isExactZero(value) ||
      (typeof value === 'number' && !Number.isFinite(value))
    ) {
      return rounded
    }

    const sig = value.toPrecision(Math.max(1, digits + 1))

    return math.isBigNumber(value) ? math.bignumber(sig) : Number(sig)
  } catch {
    return value
  }
}

function cleanComplexValue(val, digits, notation) {
  if (val && typeof val === 'object') {
    if (math.isComplex(val)) {
      const re = Math.abs(val.re) < 1e-14 * Math.max(1, Math.abs(val.im)) ? 0 : val.re
      const im = Math.abs(val.im) < 1e-14 * Math.max(1, Math.abs(val.re)) ? 0 : val.im

      return math.complex(roundScalar(re, digits, notation), roundScalar(im, digits, notation))
    }

    if (Array.isArray(val) || (val.isMatrix && typeof val.map === 'function')) {
      return val.map((item) => cleanComplexValue(item, digits, notation))
    }
  }

  return val
}

/**
 * Formats an evaluated calculation value into a display/copy string according to settings.
 * @param {*} answer Evaluated value.
 * @param {boolean} [useGrouping] Whether to apply thousands grouping.
 * @param {object} [settings=calcState.settings] Settings object.
 * @param {object} [currencies=calcState.currencies] Currencies configuration map.
 * @returns {string}
 */
export function formatAnswer(answer, useGrouping, settings = calcState.settings, currencies = calcState.currencies) {
  if (typeof answer === 'string') {
    return answer
  }

  if (answer && typeof answer === 'object' && answer[PAGE_OBJECT_SYMBOL] && typeof answer.format === 'function') {
    return String(answer.format())
  }

  const notation = settings?.notation || 'auto'
  const lowerExp = Number.isFinite(+settings?.expLower) ? +settings.expLower : -12
  const upperExp = Number.isFinite(+settings?.expUpper) ? +settings.expUpper : 12
  const {
    locale,
    decimal: decimalSeparator,
    group: groupSeparator,
    useGrouping: defaultGrouping
  } = getNumberFormat(settings)
  const effectiveGrouping = useGrouping ?? defaultGrouping
  const maximumFractionDigits = clampPrecision(settings?.precision ?? 4)

  if (['bin', 'hex', 'oct'].includes(notation)) {
    const formatBigIntBase = (val) => {
      const [base, prefix] = { bin: [2, '0b'], oct: [8, '0o'], hex: [16, '0x'] }[notation]

      return `${val < 0n ? '-' : ''}${prefix}${(val < 0n ? -val : val).toString(base)}`
    }

    if (typeof answer === 'bigint') {
      return formatBigIntBase(answer)
    }

    const formattedBase = math.format(answer, (value) => {
      if (typeof value === 'bigint') {
        return formatBigIntBase(value)
      }

      if (math.isFraction(value)) {
        const numVal = value.d === 1n ? math.bignumber((value.s * value.n).toString()) : Number(value.valueOf())

        return math.format(numVal, { notation })
      }

      return math.format(value, { notation })
    })

    return stripAnswer(formattedBase)
  }

  const formatOptions = {
    notation,
    lowerExp,
    upperExp,
    ...(notation === 'fixed' ? { precision: maximumFractionDigits } : {})
  }
  const localeOptions = { maximumFractionDigits, useGrouping: effectiveGrouping }
  const formatter = getNumberFormatter(locale, localeOptions)

  let processedAnswer = cleanComplexValue(answer, maximumFractionDigits, notation)
  let wasRounded = false

  if (notation === 'fixed' && !answer?.isUnit && !math.isFraction(answer)) {
    try {
      processedAnswer = math.round(processedAnswer, maximumFractionDigits)
      wasRounded = true
    } catch {
      // ignore
    }
  }

  let formattedAnswer = math.format(processedAnswer, (value) => {
    const roundedValue = wasRounded ? value : roundScalar(value, maximumFractionDigits, notation)

    const valueStr = math.format(roundedValue, formatOptions)

    if (
      typeof roundedValue === 'number' &&
      notation === 'auto' &&
      !valueStr.includes('e') &&
      groupSeparator !== ' ' &&
      (roundedValue === 0 || Math.abs(roundedValue) >= Math.pow(10, -maximumFractionDigits))
    ) {
      const formatted = formatter.format(roundedValue)
      const expectedDecimal = decimalSeparator
      const hasDecimal = valueStr.includes('.')

      if (!hasDecimal || formatted.includes(expectedDecimal)) {
        return formatted
      }
    }

    if (valueStr.includes('e')) {
      const [base, exponent] = valueStr.split('e')

      return formatNumericString(base, decimalSeparator, groupSeparator, effectiveGrouping) + 'e' + exponent
    }

    return formatNumericString(valueStr, decimalSeparator, groupSeparator, effectiveGrouping)
  })

  formattedAnswer = formatCurrency(formattedAnswer, effectiveGrouping, settings, currencies)

  return stripAnswer(formattedAnswer)
}

/**
 * Generates HTML markup for a plot button answer.
 * @param {string} plotAns Function string to plot.
 * @returns {string}
 */
export function formatPlotAnswerHtml(plotAns) {
  return `<a
        class="${CLASS_PLOT_BUTTON}"
        data-plot="${escapeHTML(plotAns)}"
        uk-tooltip="title: Plot; pos: right">
          ${CHART_SPLINE_ICON_SVG}
        </a>`
}

/**
 * Generates HTML markup for a cross-page reference link answer.
 * @param {object} answer Page scope object.
 * @param {string} answerCopy Formatted copy string.
 * @param {string} answerOut Formatted display string.
 * @returns {string}
 */
export function formatPageLinkHtml(answer, answerCopy, answerOut) {
  const pageId = answer._pageId
  const pageVarCount = answer._pageVarCount ?? 0
  const pageVarDetails = answer._pageVarDetails || ''
  const varText = `${pageVarCount} ${pageVarCount === 1 ? 'variable' : 'variables'}`
  const tooltipText = pageVarDetails ? `${varText} (${pageVarDetails})` : varText

  return `<a
        class="pageLink ${CLASS_ANSWER}"
        data-page-id="${escapeHTML(pageId)}"
        data-answer="${escapeHTML(answerCopy)}"
        title="${escapeHTML(escapeHTML(tooltipText))}"
        uk-tooltip>
          ${escapeHTML(answerOut)}
        </a>`
}

/**
 * Generates HTML markup for a standard answer span.
 * @param {string} answerCopy Formatted copy string.
 * @param {string} answerOut Formatted display string.
 * @returns {string}
 */
export function formatAnswerHtml(answerCopy, answerOut) {
  return `<span class="${CLASS_ANSWER}" data-answer="${escapeHTML(answerCopy)}">${escapeHTML(answerOut)}</span>`
}

/**
 * Generates HTML markup for a line evaluation error link.
 * @param {*} error Error thrown during evaluation.
 * @param {boolean} showLineErrors Whether line error text is enabled.
 * @returns {string}
 */
export function formatErrorHtml(error, showLineErrors) {
  const errorMessage = escapeHTML(String(error))
  const errorLink = showLineErrors ? 'Error' : ''

  return `<a class="${CLASS_LINE_ERROR_LINK}" data-error="${errorMessage}">${errorLink}</a>`
}
