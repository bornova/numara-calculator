import {
  CHART_SPLINE_ICON_SVG,
  CLASS_ANSWER,
  CLASS_LINE_ERROR_LINK,
  CLASS_PLOT_BUTTON,
  PAGE_OBJECT_SYMBOL
} from './constants.js'
import { app, currencyFormatRegex, math } from './mathInstance.js'
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

  if (decimalPart) return integerPart + decSep + decimalPart

  return integerPart
}

/**
 * Strips surrounding double quotes from a formatted string answer.
 * @param {*} answer Raw or formatted answer.
 * @returns {*}
 */
export function stripAnswer(answer) {
  return typeof answer === 'string' ? answer.replace(/^"|"$/g, '') : answer
}

/**
 * Parses a localized number string into a standard JavaScript float.
 * @param {string} str Localized numeric string.
 * @param {object} [settings=app.settings] Settings object containing number format configuration.
 * @returns {number}
 */
export function parseLocaleNumber(str, settings = app.settings) {
  if (typeof str !== 'string') return NaN

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
 * @param {object} [settings=app.settings] Settings object containing number format configuration.
 * @returns {number} Finite number or `NaN`.
 */
export function parseStrictLocaleNumber(str, settings = app.settings) {
  if (typeof str !== 'string') return NaN

  const trimmed = str.trim()

  if (!STRICT_LOCALE_NUMBER_REGEX.test(trimmed)) return NaN

  const num = parseLocaleNumber(trimmed, settings)

  return Number.isFinite(num) ? num : NaN
}

/**
 * Formats currency amounts within an output string using `Intl.NumberFormat`.
 * @param {string} str Output string potentially containing currency values.
 * @param {boolean} [useGrouping] Whether to apply thousands grouping.
 * @param {object} [settings=app.settings] Settings object.
 * @param {object} [currencies=app.currencies] Currencies configuration map.
 * @returns {string}
 */
function formatCurrency(str, useGrouping, settings = app.settings, currencies = app.currencies) {
  if (!currencyFormatRegex) return str

  const { locale, group, useGrouping: defaultGrouping } = getNumberFormat(settings)
  const effectiveGrouping = useGrouping ?? defaultGrouping
  const maximumFractionDigits = clampPrecision(settings?.precision ?? 4)

  return transformOutsideStrings(str, (segment) =>
    segment.replace(currencyFormatRegex, (match, amount, code) => {
      const upperCode = code.toUpperCase()
      const info = currencies?.[upperCode]

      if (!info) return match

      const trimmed = amount.trim()
      const eIndex = trimmed.search(/e[+-]?\d+$/i)
      const baseStr = eIndex >= 0 ? trimmed.slice(0, eIndex) : trimmed
      const expStr = eIndex >= 0 ? trimmed.slice(eIndex) : ''
      const value = parseLocaleNumber(baseStr, settings)

      if (!Number.isFinite(value)) return `${info.symbol ?? ''}${trimmed}`

      try {
        const formatter = getNumberFormatter(locale, {
          style: 'currency',
          currency: upperCode,
          currencyDisplay: 'narrowSymbol',
          useGrouping: effectiveGrouping,
          maximumFractionDigits
        })

        const customDollarSymbol = info.symbol && info.symbol !== '$' && info.symbol !== upperCode ? info.symbol : null
        const needsPartsTransform = (effectiveGrouping && group === ' ') || Boolean(customDollarSymbol)

        const formattedCurrency = needsPartsTransform
          ? formatter
              .formatToParts(value)
              .map((part) => {
                if (effectiveGrouping && group === ' ' && part.type === 'group') return group
                if (customDollarSymbol && part.type === 'currency' && part.value === '$') return customDollarSymbol

                return part.value
              })
              .join('')
          : formatter.format(value)

        return formattedCurrency + expStr
      } catch {
        return `${info.symbol ?? ''}${trimmed}${expStr}`
      }
    })
  )
}

/**
 * Formats an evaluated calculation value into a display/copy string according to settings.
 * @param {*} answer Evaluated value.
 * @param {boolean} [useGrouping] Whether to apply thousands grouping.
 * @param {object} [settings=app.settings] Settings object.
 * @param {object} [currencies=app.currencies] Currencies configuration map.
 * @returns {string}
 */
export function formatAnswer(answer, useGrouping, settings = app.settings, currencies = app.currencies) {
  if (typeof answer === 'string') return stripAnswer(answer)
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
    if (typeof answer === 'bigint') {
      const [base, prefix] = { bin: [2, '0b'], oct: [8, '0o'], hex: [16, '0x'] }[notation]

      return `${answer < 0n ? '-' : ''}${prefix}${(answer < 0n ? -answer : answer).toString(base)}`
    }

    answer = math.format(answer, { notation })

    return stripAnswer(answer)
  }

  const formatOptions = {
    notation,
    lowerExp,
    upperExp,
    ...(notation === 'fixed' ? { precision: maximumFractionDigits } : {})
  }
  const localeOptions = { maximumFractionDigits, useGrouping: effectiveGrouping }
  const formatter = getNumberFormatter(locale, localeOptions)

  let processedAnswer = answer
  let wasRounded = false

  if (!answer?.isUnit && !math.isFraction(answer)) {
    try {
      processedAnswer = math.round(answer, maximumFractionDigits)
      wasRounded = true
    } catch {
      // ignore
    }
  }

  let formattedAnswer = math.format(processedAnswer, (value) => {
    let roundedValue = value

    if (!wasRounded && !math.isFraction(value)) {
      try {
        roundedValue = math.round(value, maximumFractionDigits)
      } catch {
        // ignore
      }
    }

    const valueStr = math.format(roundedValue, formatOptions)

    if (typeof roundedValue === 'number' && notation === 'auto' && !valueStr.includes('e') && groupSeparator !== ' ') {
      const formatted = formatter.format(roundedValue)
      const expectedDecimal = decimalSeparator
      const hasDecimal = valueStr.includes('.')

      if (!hasDecimal || formatted.includes(expectedDecimal)) return formatted
    }

    if (valueStr.includes('e')) {
      const [base, exponent] = valueStr.split('e')

      return formatNumericString(base, decimalSeparator, groupSeparator, effectiveGrouping) + 'e' + exponent
    }

    return formatNumericString(valueStr, decimalSeparator, groupSeparator, effectiveGrouping)
  })

  if (settings?.currency) {
    formattedAnswer = formatCurrency(formattedAnswer, effectiveGrouping, settings, currencies)
  }

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
        title="${escapeHTML(tooltipText)}"
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
