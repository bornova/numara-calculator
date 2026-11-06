import { getSystemLocale } from '../core/utils.js'
import { app } from './appState.js'
import { store } from './store.js'

const VALID_NUMBER_FORMATS = new Set(['1,234.56', '1.234,56', '1 234.56', '1 234,56'])
const VALID_DATE_FORMATS = new Set(['MM/dd/yyyy', 'dd/MM/yyyy', 'yyyy-MM-dd'])

const ACTIVE_STORE_KEYS = [
  'settings',
  'colors',
  'pages',
  'lastPage',
  'udf',
  'udu',
  'udfItems',
  'uduItems',
  'plotSettings',
  'currencies',
  'rateDate',
  'inputWidth',
  'pageListWidth'
]

const OBSOLETE_STORE_KEYS = ['sideBarWidth', 'rateInterval', 'input', 'saved']

const LEGACY_LINE_HEIGHT_MAP = {
  '1.5em': '16px',
  '1.75em': '20px',
  '2em': '24px',
  '2.5em': '28px',
  '3em': '32px'
}

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
 * Reads a raw root `localStorage` item if present, parses it, and removes the root key.
 * @param {string} key Root localStorage key.
 * @returns {any} Parsed value or `null`.
 */
function consumeRootKey(key) {
  try {
    if (typeof localStorage === 'undefined') return null

    const raw = localStorage.getItem(key)
    if (raw === null) return null

    localStorage.removeItem(key)

    try {
      return JSON.parse(raw)
    } catch {
      return raw
    }
  } catch {
    return null
  }
}

/**
 * Consolidates any lingering root `localStorage` keys into `store`, migrates legacy
 * `sideBarWidth`, `saved`, `input`, and page `history`/`answers` fields, and removes obsolete keys.
 */
export function migrateStorageAndPages() {
  // 1. Consolidate any orphaned root localStorage keys into the `numara` store object
  for (const key of ACTIVE_STORE_KEYS) {
    const existing = store.get(key)
    const rootVal = consumeRootKey(key)

    if (existing === null && rootVal !== null) {
      store.set(key, rootVal)
    }
  }

  // 2. Migrate v7 `sideBarWidth` -> v8 `pageListWidth`
  const oldSideBarWidth = store.get('sideBarWidth') ?? consumeRootKey('sideBarWidth')

  if (oldSideBarWidth !== null) {
    if (store.get('pageListWidth') === null) {
      store.set('pageListWidth', oldSideBarWidth)
    }

    store.remove('sideBarWidth')
  }

  // 3. Migrate legacy `saved` map ({ [id]: [name, data] }) and `input` string into `pages`
  const legacySaved = store.get('saved') ?? consumeRootKey('saved')
  const legacyInput = store.get('input') ?? consumeRootKey('input')
  let pages = store.get('pages')
  let pagesModified = false

  if (legacySaved && typeof legacySaved === 'object' && !Array.isArray(legacySaved)) {
    pages = Array.isArray(pages) ? pages : []

    for (const [id, val] of Object.entries(legacySaved)) {
      if (Array.isArray(val) && !pages.some((p) => p.id === id)) {
        pages.push({ id, name: String(val[0] || 'Page'), data: String(val[1] || '') })
        pagesModified = true
      }
    }
  }

  if (typeof legacyInput === 'string' && legacyInput.length > 0 && (!Array.isArray(pages) || pages.length === 0)) {
    pages = [{ id: '20260101000000000', name: 'Page 1', data: legacyInput }]
    pagesModified = true
  }

  // 4. Clean up v7 persisted `history` and `answers` bloat from stored pages while seeding session history
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
    }

    if (pagesModified) {
      store.set('pages', pages)
    }
  }

  // 5. Remove all obsolete v7/v6 store keys
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

  if (migrated) {
    store.set('colors', targetColors)
  }

  return migrated
}

/**
 * Migrates v7 (and earlier) settings in-place to the v8 settings schema
 * and cleans up legacy storage keys.
 * Safe to remove once v7 -> v8 migration is no longer needed.
 * @param {object} targetSettings The loaded settings object to migrate in-place.
 * @returns {boolean} True if any v7 fields were migrated.
 */
export function migrateFromV7(targetSettings) {
  migrateStorageAndPages()

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
  // -> v8 `thouSep` (boolean) & `numberFormat` ('1,234.56' | '1.234,56' | '1 234.56' | '1 234,56')
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

  // Legacy `lineHeight` in `em` -> `px`
  if (typeof targetSettings.lineHeight === 'string' && targetSettings.lineHeight in LEGACY_LINE_HEIGHT_MAP) {
    targetSettings.lineHeight = LEGACY_LINE_HEIGHT_MAP[targetSettings.lineHeight]
    migrated = true
  }

  if (migrated) {
    store.set('settings', targetSettings)
  }

  return migrated
}
