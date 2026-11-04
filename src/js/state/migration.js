import { getSystemLocale } from '../core/utils.js'
import { store } from './store.js'

const VALID_NUMBER_FORMATS = new Set(['1,234.56', '1.234,56'])
const VALID_DATE_FORMATS = new Set(['MM/dd/yyyy', 'dd/MM/yyyy', 'yyyy-MM-dd'])

/**
 * Checks whether a BCP 47 locale tag uses a comma as its decimal separator.
 * @param {string} locale BCP 47 locale string.
 * @returns {boolean} True if the locale formats decimals with a comma.
 */
function localeUsesCommaDecimal(locale) {
  try {
    return (1.1).toLocaleString(locale).includes(',')
  } catch {
    return false
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
 * Migrates v7 (and earlier) settings in-place to the v8 settings schema.
 * Safe to remove once v7 -> v8 migration is no longer needed.
 * @param {object} targetSettings The loaded settings object to migrate in-place.
 * @returns {boolean} True if any v7 fields were migrated.
 */
export function migrateFromV7(targetSettings) {
  if (!targetSettings || typeof targetSettings !== 'object') return false

  let migrated = false
  const systemLocale = getSystemLocale(targetSettings)

  // Legacy v6/v7 `locale` property -> `thouSep`
  if (targetSettings.locale !== undefined) {
    if (targetSettings.thouSep === undefined) {
      targetSettings.thouSep = targetSettings.locale
    }

    delete targetSettings.locale
    migrated = true
  }

  // v7 `thouSep` ('system' | 'period' | 'comma' | 'disabled') & `inputLocale` (boolean)
  // -> v8 `thouSep` (boolean) & `numberFormat` ('1,234.56' | '1.234,56')
  const hasLegacyThouSep = typeof targetSettings.thouSep === 'string'
  const hasLegacyInputLocale = targetSettings.inputLocale !== undefined

  if (hasLegacyThouSep || hasLegacyInputLocale) {
    const oldThouSep = targetSettings.thouSep

    if (!VALID_NUMBER_FORMATS.has(targetSettings.numberFormat)) {
      if (oldThouSep === 'comma') {
        targetSettings.numberFormat = '1.234,56'
      } else if (oldThouSep === 'period') {
        targetSettings.numberFormat = '1,234.56'
      } else if (typeof oldThouSep === 'string' && oldThouSep !== 'system' && oldThouSep !== 'disabled') {
        targetSettings.numberFormat = localeUsesCommaDecimal(oldThouSep) ? '1.234,56' : '1,234.56'
      } else if (oldThouSep === 'system' || targetSettings.inputLocale === true) {
        targetSettings.numberFormat = localeUsesCommaDecimal(systemLocale) ? '1.234,56' : '1,234.56'
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

  // v7 `dateFormat: 'system'` (or legacy locale/boolean) -> v8 explicit format
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

  // v7 `sideBarWidth` -> v8 `pageListWidth`
  const oldSideBarWidth = store.get('sideBarWidth')

  if (oldSideBarWidth !== null) {
    if (store.get('pageListWidth') === null) {
      store.set('pageListWidth', oldSideBarWidth)
    }

    store.remove('sideBarWidth')
  }

  if (migrated) {
    store.set('settings', targetSettings)
  }

  return migrated
}
