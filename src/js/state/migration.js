import { DateTime } from 'luxon'

import { math } from '../core/mathInstance.js'
import {
  compileUdfItems,
  compileUduItems,
  defaultProxy,
  evalUdfuObject,
  findMatchingClose,
  RESERVED_KEYS,
  skipStringOrComment,
  VALID_IDENTIFIER
} from '../core/udfu.js'
import { getSystemLocale } from '../core/utils.js'
import { app } from './appState.js'
import { store } from './store.js'

const VALID_NUMBER_FORMATS = new Set(['1,234.56', '1.234,56', '1 234.56', '1 234,56'])
const VALID_DATE_FORMATS = new Set(['MM/dd/yyyy', 'dd/MM/yyyy', 'yyyy-MM-dd'])

const VALID_SELECT_OPTIONS = {
  zoomLevel: new Set(['smaller', 'normal', 'larger']),
  pageListPosition: new Set(['auto', 'float', 'dock', 'tabs']),
  notifyLocation: new Set(['top-left', 'top-center', 'top-right', 'bottom-left', 'bottom-center', 'bottom-right']),
  notifyDuration: new Set(['1000', '3000', '5000', '10000', '30000', '0']),
  fontSize: new Set(['12px', '13px', '14px', '15px', '16px']),
  fontWeight: new Set(['200', '300', '400', '500', '700']),
  lineHeight: new Set(['17px', '21px', '26px', '30px', '34px']),
  answerPosition: new Set(['left', 'right', 'bottom']),
  numericOutput: new Set(['number', 'BigNumber', 'Fraction']),
  matrixType: new Set(['Matrix', 'Array']),
  notation: new Set(['auto', 'engineering', 'exponential', 'fixed', 'bin', 'hex', 'oct']),
  numberFormat: VALID_NUMBER_FORMATS,
  dateFormat: VALID_DATE_FORMATS,
  currencyInterval: new Set(['0', '3600000', '10800000', '21600000', '43200000', 'manual'])
}

const OBSOLETE_STORE_KEYS = ['sideBarWidth', 'rateInterval']

const LEGACY_FONT_SIZE_MAP = {
  '0.9rem': '12px',
  '1.0rem': '13px',
  '1rem': '13px',
  '1.1rem': '14px',
  '1.2rem': '15px',
  '1.3rem': '16px'
}

const LEGACY_LINE_HEIGHT_MAP = {
  '16px': '17px',
  '20px': '21px',
  '24px': '26px',
  '28px': '30px',
  '32px': '34px'
}

/**
 * Resolves the closest v8 number format (`1,234.56`, `1.234,56`, `1 234.56`, or `1 234,56`)
 * from a BCP 47 locale tag.
 * @param {string} locale BCP 47 locale string.
 * @returns {'1,234.56' | '1.234,56' | '1 234.56' | '1 234,56'} Resolved v8 number format.
 */
function resolveLocaleNumberFormat(locale) {
  try {
    // Use 5 integer digits so CLDR `minimumGroupingDigits: 2` locales (e.g. pl-PL, es-ES) still emit `group`
    const parts = new Intl.NumberFormat(locale).formatToParts(12345.6)
    const groupPart = parts.find((part) => part.type === 'group')?.value ?? ','
    const decimalPart = parts.find((part) => part.type === 'decimal')?.value ?? '.'
    const usesSpaceGroup = /[\s\u00A0\u202F\u2009]/.test(groupPart)
    const usesCommaDecimal = decimalPart === ','

    return usesSpaceGroup ? (usesCommaDecimal ? '1 234,56' : '1 234.56') : usesCommaDecimal ? '1.234,56' : '1,234.56'
  } catch {
    return '1,234.56'
  }
}

/**
 * Resolves the closest v8 date format (`MM/dd/yyyy`, `dd/MM/yyyy`, or `yyyy-MM-dd`)
 * from a BCP 47 locale tag.
 * @param {string} locale BCP 47 locale string.
 * @returns {'MM/dd/yyyy' | 'dd/MM/yyyy' | 'yyyy-MM-dd'} Resolved v8 date format.
 */
function resolveLocaleDateFormat(locale) {
  try {
    const parts = new Intl.DateTimeFormat(locale).formatToParts(new Date(2026, 10, 25))
    const firstDatePart = parts.find((part) => part.type === 'year' || part.type === 'month' || part.type === 'day')

    if (firstDatePart?.type === 'year') return 'yyyy-MM-dd'
    if (firstDatePart?.type === 'day') return 'dd/MM/yyyy'
  } catch {
    // Fall back to default format if locale tag is invalid
  }

  return 'MM/dd/yyyy'
}

/**
 * Advances `idx` past any whitespace and JS comments.
 * @param {string} str Source string.
 * @param {number} idx Starting index.
 * @returns {number} First non-whitespace, non-comment index.
 */
function skipWsAndComments(str, idx) {
  let i = idx

  while (i < str.length) {
    if (/\s/.test(str[i])) {
      i++
      continue
    }

    if (str[i] === '/' && (str[i + 1] === '/' || str[i + 1] === '*')) {
      i = skipStringOrComment(str, i)
      continue
    }

    break
  }

  return i
}

/**
 * Trims leading and trailing whitespace and JS comments while preserving internal source text.
 * @param {string} str Source string.
 * @returns {string}
 */
function trimJsComments(str) {
  let firstTokenStart = -1
  let lastTokenEnd = 0
  let i = 0

  while (i < str.length) {
    if (/\s/.test(str[i])) {
      i++
      continue
    }

    if (str[i] === '/' && (str[i + 1] === '/' || str[i + 1] === '*')) {
      i = skipStringOrComment(str, i)
      continue
    }

    const after = skipStringOrComment(str, i)
    const end = after !== -1 ? after : i + 1

    if (firstTokenStart === -1) firstTokenStart = i
    lastTokenEnd = end
    i = end
  }

  return firstTokenStart === -1 ? '' : str.slice(firstTokenStart, lastTokenEnd)
}

/**
 * Strips a single balanced pair of outer parentheses from an expression string,
 * preserving parentheses when they wrap an object literal (`({ ... })`) or multiple groups (`(a) * (b)`).
 * @param {string} str Expression string.
 * @returns {string} Unwrapped expression string.
 */
function unwrapBalancedParens(str) {
  if (!str.startsWith('(') || !str.endsWith(')')) return str

  const closeIdx = findMatchingClose(str, 0)
  if (closeIdx !== str.length - 1) return str

  const inner = trimJsComments(str.slice(1, -1))
  return inner.startsWith('{') ? str : inner
}

/**
 * Strips outer block braces or balanced parentheses from an arrow-function body string.
 * @param {string} rawBody Trimmed right-hand side of `=>`.
 * @returns {string}
 */
function normalizeArrowBody(rawBody) {
  if (rawBody.startsWith('{') && findMatchingClose(rawBody, 0) === rawBody.length - 1) {
    return trimJsComments(rawBody.slice(1, -1)) || 'undefined'
  }

  return unwrapBalancedParens(rawBody)
}

/**
 * Splits a JS object-literal body string into top-level comma-separated entry strings.
 * @param {string} src Raw object-literal interior string.
 * @returns {string[]}
 */
function splitTopLevelObjectEntries(src) {
  const entries = []
  let parenDepth = 0
  let bracketDepth = 0
  let braceDepth = 0
  let entryStart = 0
  let i = 0

  while (i < src.length) {
    const after = skipStringOrComment(src, i)
    if (after !== -1) {
      i = after
      continue
    }

    const ch = src[i]
    if (ch === '(') parenDepth++
    else if (ch === ')') parenDepth--
    else if (ch === '[') bracketDepth++
    else if (ch === ']') bracketDepth--
    else if (ch === '{') braceDepth++
    else if (ch === '}') braceDepth--
    else if (ch === ',' && parenDepth === 0 && bracketDepth === 0 && braceDepth === 0) {
      const segment = trimJsComments(src.slice(entryStart, i))
      if (segment) entries.push(segment)
      entryStart = i + 1
    }

    i++
  }

  const tail = trimJsComments(src.slice(entryStart))
  if (tail) entries.push(tail)

  return entries
}

/**
 * Parses a key-value right-hand side source expression into `{ params, body }` when it represents
 * a plain arrow or `function` expression, or `{ params: '', body: rawValue }` otherwise.
 * @param {string} key Property name.
 * @param {string} rawValue Trimmed property value source expression.
 * @returns {{ name: string, params: string, body: string }|null}
 */
function parseSourceKeyValue(key, rawValue) {
  if (!rawValue) return null

  if (rawValue[0] === '(') {
    const closeParen = findMatchingClose(rawValue, 0)
    if (closeParen !== -1) {
      const afterIdx = skipWsAndComments(rawValue, closeParen + 1)
      if (rawValue.slice(afterIdx, afterIdx + 2) === '=>') {
        const rawParams = rawValue.slice(1, closeParen).trim()
        const rhs = trimJsComments(rawValue.slice(afterIdx + 2))
        if (!rhs) return null
        return { name: key, params: rawParams || '()', body: normalizeArrowBody(rhs) }
      }
    }
  }

  const singleParamMatch = rawValue.match(/^([a-zA-Z_$][\w$]*)/)
  if (singleParamMatch && singleParamMatch[1] !== 'async') {
    const param = singleParamMatch[1]
    const afterIdx = skipWsAndComments(rawValue, param.length)
    if (rawValue.slice(afterIdx, afterIdx + 2) === '=>') {
      const rhs = trimJsComments(rawValue.slice(afterIdx + 2))
      if (!rhs) return null
      return { name: key, params: param, body: normalizeArrowBody(rhs) }
    }
  }

  const fnMatch = rawValue.match(/^function(?![\w$*])\s*([a-zA-Z_$][\w$]*)?\s*\(/)
  if (fnMatch) {
    const openParen = fnMatch[0].length - 1
    const closeParen = findMatchingClose(rawValue, openParen)
    if (closeParen !== -1) {
      const bracePos = skipWsAndComments(rawValue, closeParen + 1)
      if (rawValue[bracePos] === '{' && findMatchingClose(rawValue, bracePos) === rawValue.length - 1) {
        const fnName = fnMatch[1] || ''
        const rawParams = rawValue.slice(openParen + 1, closeParen).trim()
        const innerBody = trimJsComments(rawValue.slice(bracePos + 1, -1))
        const selfRefPattern = fnName && fnName !== key ? new RegExp(`\\b${fnName}\\b`) : null

        if (!/\b(?:arguments|this)\b/.test(innerBody) && (!selfRefPattern || !selfRefPattern.test(innerBody))) {
          return { name: key, params: rawParams || '()', body: innerBody || 'undefined' }
        }
      }
    }
  }

  return { name: key, params: '', body: rawValue }
}

/**
 * Parses a legacy v7 `udf` object-body source string without evaluating external libraries or
 * stringifying Math.js / namespace objects. Returns `null` if any entry requires runtime evaluation.
 * @param {string} rawUdf Trimmed `udf` source string.
 * @returns {Array<{ name: string, params: string, body: string }>|null}
 */
function parseSourceUdfEntries(rawUdf) {
  const entries = splitTopLevelObjectEntries(rawUdf)
  const items = []

  for (const entry of entries) {
    let key
    let afterKeyPos

    if (entry[0] === '"' || entry[0] === "'") {
      const strEnd = skipStringOrComment(entry, 0)
      if (strEnd === -1) return null
      key = entry.slice(1, strEnd - 1)
      afterKeyPos = skipWsAndComments(entry, strEnd)
    } else {
      const idMatch = entry.match(/^[a-zA-Z_$][\w$]*/)
      if (!idMatch) return null
      key = idMatch[0]
      afterKeyPos = skipWsAndComments(entry, key.length)

      if (
        (key === 'get' || key === 'set' || key === 'async') &&
        afterKeyPos < entry.length &&
        entry[afterKeyPos] !== ':'
      ) {
        return null
      }
    }

    if (afterKeyPos === entry.length) {
      items.push({ name: key, params: '', body: key })
      continue
    }

    const delim = entry[afterKeyPos]

    if (delim === ':') {
      const parsed = parseSourceKeyValue(key, trimJsComments(entry.slice(afterKeyPos + 1)))
      if (!parsed) return null
      items.push(parsed)
    } else if (delim === '(') {
      const closeParen = findMatchingClose(entry, afterKeyPos)
      if (closeParen === -1) return null
      const bracePos = skipWsAndComments(entry, closeParen + 1)
      if (entry[bracePos] !== '{' || findMatchingClose(entry, bracePos) !== entry.length - 1) return null

      const rawParams = entry.slice(afterKeyPos + 1, closeParen).trim()
      const innerBody = trimJsComments(entry.slice(bracePos + 1, -1))
      items.push({ name: key, params: rawParams || '()', body: innerBody || 'undefined' })
    } else {
      return null
    }
  }

  return items
}

/**
 * Serializes a runtime non-function value from `evalUdfuObject` back into valid UDF source code.
 * Preserves Math.js types (Unit, BigNumber, Fraction, Complex, Matrix) and Luxon DateTime values.
 * @param {*} val Evaluated runtime value.
 * @returns {string}
 */
function serializeEvaluatedUdfValue(val) {
  if (val !== null && typeof val === 'object') {
    if (val.isUnit) return `math.unit(${JSON.stringify(val.toString())})`
    if (val.isBigNumber) return `math.bignumber(${JSON.stringify(val.toString())})`
    if (val.isFraction) return `math.fraction(${JSON.stringify(val.toFraction())})`
    if (val.isComplex) return `math.complex(${JSON.stringify(val.toString())})`
    if (val.isMatrix) return JSON.stringify(val.toArray())
    if (val.isLuxonDateTime) return `luxon.fromISO(${JSON.stringify(val.toISO())})`
    return JSON.stringify(val)
  }

  return typeof val === 'string' ? JSON.stringify(val) : String(val)
}

/**
 * Extracts parameter list and body source from a runtime function value.
 * @param {Function} fn Function to inspect.
 * @returns {{ params: string, body: string }}
 */
function extractFunctionParts(fn) {
  const src = fn.toString().trim()

  if (src.startsWith('(')) {
    const closeIdx = findMatchingClose(src, 0)

    if (closeIdx !== -1) {
      const arrowMatch = src.slice(closeIdx + 1).match(/^\s*=>\s*([\s\S]*)$/)

      if (arrowMatch) {
        const rawParams = src.slice(1, closeIdx).trim()
        const params = rawParams.length > 0 ? rawParams : '()'

        return { params, body: normalizeArrowBody(arrowMatch[1].trim()) }
      }
    }
  }

  const singleArrow = src.match(/^([a-zA-Z_$][\w$]*)\s*=>\s*([\s\S]*)$/)

  if (singleArrow) {
    return { params: singleArrow[1].trim(), body: normalizeArrowBody(singleArrow[2].trim()) }
  }

  const headerMatch = src.match(
    /^(?:(?:async\s+)?function\s*(?:\*\s*)?[a-zA-Z_$]*[\w$]*|(?:async\s+)?[a-zA-Z_$][\w$]*)\s*\(/
  )

  if (headerMatch) {
    const openIdx = headerMatch[0].length - 1
    const closeIdx = findMatchingClose(src, openIdx)

    if (closeIdx !== -1) {
      const afterParams = src.slice(closeIdx + 1).trim()

      if (afterParams.startsWith('{') && findMatchingClose(afterParams, 0) === afterParams.length - 1) {
        const rawParams = src.slice(openIdx + 1, closeIdx).trim()
        const params = rawParams.length > 0 ? rawParams : '()'
        const body = afterParams.slice(1, -1).trim()

        return { params, body }
      }
    }
  }

  return { params: '', body: src }
}

/**
 * Parses a legacy v7 `udf` object-body string into structured `udfItems`.
 * @param {string} rawUdf Legacy v7 `udf` string.
 * @param {object} [mathInstance] Optional Math.js instance.
 * @param {object} [externalLibs] Optional libraries `{ luxon, nerdamer, formulajs }`.
 * @returns {Array<{name: string, params: string, body: string}>}
 */
export function parseLegacyUdf(rawUdf, mathInstance = defaultProxy, externalLibs = {}) {
  const trimmed = (rawUdf ?? '').trim()
  if (!trimmed) return []

  const sourceItems = parseSourceUdfEntries(trimmed)

  if (sourceItems !== null) {
    return sourceItems.filter(({ name }) => !RESERVED_KEYS.has(name) && VALID_IDENTIFIER.test(name))
  }

  const udfItems = []

  try {
    const obj = evalUdfuObject(trimmed, mathInstance, externalLibs)

    for (const [key, val] of Object.entries(obj || {})) {
      if (RESERVED_KEYS.has(key) || !VALID_IDENTIFIER.test(key) || val === defaultProxy) continue

      if (typeof val === 'function') {
        const { params, body } = extractFunctionParts(val)
        udfItems.push({ name: key, params, body })
      } else {
        udfItems.push({ name: key, params: '', body: serializeEvaluatedUdfValue(val) })
      }
    }
  } catch {
    // Return empty array if legacy string cannot be evaluated
  }

  return udfItems
}

/**
 * Parses a legacy v7 `udu` object-body string into structured `uduItems`.
 * @param {string} rawUdu Legacy v7 `udu` string.
 * @param {object} [mathInstance] Optional Math.js instance.
 * @param {object} [externalLibs] Optional libraries `{ luxon, nerdamer, formulajs }`.
 * @returns {Array<{name: string, definition: string, prefixes: string, aliases: string}>}
 */
export function parseLegacyUdu(rawUdu, mathInstance = defaultProxy, externalLibs = {}) {
  const trimmed = (rawUdu ?? '').trim()
  if (!trimmed) return []

  const uduItems = []

  try {
    const obj = evalUdfuObject(trimmed, mathInstance, externalLibs)

    for (const [key, val] of Object.entries(obj || {})) {
      if (RESERVED_KEYS.has(key) || !VALID_IDENTIFIER.test(key) || val === defaultProxy) continue

      if (typeof val === 'string') {
        uduItems.push({ name: key, definition: val, prefixes: 'none', aliases: '' })
      } else if (val && typeof val === 'object') {
        if (val.isUnit && typeof val.toString === 'function') {
          uduItems.push({ name: key, definition: val.toString(), prefixes: 'none', aliases: '' })
        } else if (val.definition !== defaultProxy) {
          const defStr = val.definition?.isUnit ? val.definition.toString() : String(val.definition ?? '')
          uduItems.push({
            name: key,
            definition: defStr,
            prefixes: val.prefixes || 'none',
            aliases: Array.isArray(val.aliases) ? val.aliases.join(', ') : ''
          })
        }
      }
    }
  } catch {
    // Return empty array if legacy string cannot be evaluated
  }

  return uduItems
}

/**
 * Migrates v7 `sideBarWidth` -> `pageListWidth`, cleans up v7 persisted page `history`/`answers`
 * fields while seeding session history, and removes obsolete v7 store keys.
 */
export function migrateStorageAndPages() {
  // 1. Migrate v7 `sideBarWidth` -> v8 `pageListWidth`
  const oldSideBarWidth = store.get('sideBarWidth')

  if (
    typeof oldSideBarWidth === 'number' &&
    Number.isFinite(oldSideBarWidth) &&
    oldSideBarWidth !== 240 &&
    store.get('pageListWidth') === null
  ) {
    store.set('pageListWidth', Math.min(510, Math.max(210, oldSideBarWidth)))
  }

  // 2. Clean up v7 persisted `history` and `answers` bloat from stored pages while seeding session history
  const pages = store.get('pages')
  let pagesModified = false

  if (Array.isArray(pages)) {
    for (const page of pages) {
      if (!page || typeof page !== 'object') continue

      if (page.history && app.pageHistory && !app.pageHistory.has(page.id)) {
        app.pageHistory.set(page.id, page.history)
      }

      if ('history' in page || 'answers' in page) {
        delete page.history
        delete page.answers
        pagesModified = true
      }

      if (typeof page.name !== 'string') {
        page.name = String(page.name ?? 'Page')
        pagesModified = true
      }

      if (typeof page.data !== 'string') {
        page.data = String(page.data ?? '')
        pagesModified = true
      }
    }

    if (pagesModified) {
      store.set('pages', pages)
    }
  }

  // 3. Remove obsolete v7 store keys
  for (const key of OBSOLETE_STORE_KEYS) {
    store.remove(key)
  }
}

/**
 * Syncs non-editable theme metadata (`title` and `class` selectors) on stored colors
 * from `defaults` while preserving the user's custom `light` and `dark` color values.
 * @param {object} targetColors Stored colors object to migrate in-place.
 * @param {object} defaultColors Default colors definition (`colors.defaults`).
 * @returns {boolean} True if any color metadata was updated.
 */
export function migrateColors(targetColors, defaultColors) {
  if (!targetColors || typeof targetColors !== 'object' || !defaultColors) return false

  let migrated = false

  for (const [key, def] of Object.entries(defaultColors)) {
    const entry = targetColors[key]
    if (!entry || typeof entry !== 'object') continue

    if (entry.title !== def.title) {
      entry.title = def.title
      migrated = true
    }

    if (entry.class !== def.class) {
      entry.class = def.class
      migrated = true
    }
  }

  return migrated
}

/**
 * Migrates v7 settings in-place to the v8 settings schema.
 * @param {object} targetSettings The loaded settings object to migrate in-place.
 * @returns {boolean} True if any v7 fields were migrated.
 */
export function migrateFromV7(targetSettings) {
  if (!targetSettings || typeof targetSettings !== 'object') return false

  let migrated = false
  const systemLocale = getSystemLocale(targetSettings)

  // v7 `thouSep` ('system' | 'period' | 'comma' | 'disabled' or carried-over locale) & `inputLocale` (boolean)
  // -> v8 `thouSep` (boolean) & `numberFormat` ('1,234.56' | '1.234,56' | '1 234.56' | '1 234,56')
  const hasLegacyThouSep = typeof targetSettings.thouSep === 'string'
  const hasLegacyInputLocale = targetSettings.inputLocale !== undefined

  if (hasLegacyThouSep || hasLegacyInputLocale) {
    const oldThouSep = targetSettings.thouSep

    if (!VALID_NUMBER_FORMATS.has(targetSettings.numberFormat)) {
      if (oldThouSep === 'comma') {
        targetSettings.numberFormat = '1.234,56'
      } else if (oldThouSep === 'period' || oldThouSep === 'disabled') {
        targetSettings.numberFormat = '1,234.56'
      } else if (typeof oldThouSep === 'string' && oldThouSep !== 'system') {
        targetSettings.numberFormat = resolveLocaleNumberFormat(oldThouSep)
      } else if (oldThouSep === 'system' || targetSettings.inputLocale === true) {
        targetSettings.numberFormat = resolveLocaleNumberFormat(systemLocale)
      } else {
        targetSettings.numberFormat = '1,234.56'
      }
    }

    if (hasLegacyThouSep) {
      targetSettings.thouSep = oldThouSep !== 'disabled'
    }

    if (hasLegacyInputLocale) {
      delete targetSettings.inputLocale
    }

    migrated = true
  }

  // v7 `dateFormat: 'system'` (or carried-over locale/invalid) -> v8 explicit format
  if (targetSettings.dateFormat !== undefined && !VALID_DATE_FORMATS.has(targetSettings.dateFormat)) {
    const formatLocale =
      typeof targetSettings.dateFormat === 'string' && targetSettings.dateFormat !== 'system'
        ? targetSettings.dateFormat
        : systemLocale

    targetSettings.dateFormat = resolveLocaleDateFormat(formatLocale)
    migrated = true
  }

  // v7 `pageListPosition: 'slide'` -> v8 `'float'`
  if (targetSettings.pageListPosition === 'slide') {
    targetSettings.pageListPosition = 'float'
    migrated = true
  }

  // v7 `fontSize` in `rem` -> `px`
  if (typeof targetSettings.fontSize === 'string' && targetSettings.fontSize in LEGACY_FONT_SIZE_MAP) {
    targetSettings.fontSize = LEGACY_FONT_SIZE_MAP[targetSettings.fontSize]
    migrated = true
  }

  // v7 `lineHeight` (`16px`–`32px`) -> v8 (`17px`–`34px`)
  if (typeof targetSettings.lineHeight === 'string' && targetSettings.lineHeight in LEGACY_LINE_HEIGHT_MAP) {
    targetSettings.lineHeight = LEGACY_LINE_HEIGHT_MAP[targetSettings.lineHeight]
    migrated = true
  }

  // Drop any unrecognized `<select>` setting values so v8 defaults populate cleanly
  for (const [key, validValues] of Object.entries(VALID_SELECT_OPTIONS)) {
    if (key in targetSettings && !validValues.has(targetSettings[key])) {
      delete targetSettings[key]
      migrated = true
    }
  }

  return migrated
}

/**
 * Migrates v7 raw `udf` and `udu` strings into structured `udfItems` and `uduItems` arrays if not yet present.
 */
function migrateUdfu() {
  if (store.get('udfItems') === null) {
    const rawUdf = store.get('udf')

    if (rawUdf !== null) {
      const trimmedUdf = String(rawUdf).trim()

      if (!trimmedUdf) {
        store.set('udfItems', [])
      } else {
        const parsedUdf = parseLegacyUdf(trimmedUdf, math, { luxon: DateTime })
        store.set('udfItems', parsedUdf)
        store.set('udf', compileUdfItems(parsedUdf))
      }
    }
  }

  if (store.get('uduItems') === null) {
    const rawUdu = store.get('udu')

    if (rawUdu !== null) {
      const trimmedUdu = String(rawUdu).trim()

      if (!trimmedUdu) {
        store.set('uduItems', [])
      } else {
        const parsedUdu = parseLegacyUdu(trimmedUdu, math, { luxon: DateTime })
        store.set('uduItems', parsedUdu)
        store.set('udu', compileUduItems(parsedUdu))
      }
    }
  }
}

/**
 * Runs all v7 -> v8 storage, page, settings, color, and UDF/UDU migrations on startup.
 * @param {object} [options] Migration options.
 * @param {object} [options.defaultColors] Default theme color definitions (`colors.defaults`).
 */
export function migrateAppState({ defaultColors } = {}) {
  migrateStorageAndPages()

  const storedSettings = store.get('settings')
  if (storedSettings && migrateFromV7(storedSettings)) {
    store.set('settings', storedSettings)
  }

  const storedColors = store.get('colors')
  if (storedColors && defaultColors && migrateColors(storedColors, defaultColors)) {
    store.set('colors', storedColors)
  }

  migrateUdfu()
}
