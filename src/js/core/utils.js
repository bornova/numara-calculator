const HTML_ESCAPES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  "'": '&#39;',
  '"': '&quot;'
}

/**
 * Escape HTML special characters in a string.
 * @param {string} str The string to escape.
 * @returns {string} The escaped string.
 */
export function escapeHTML(str) {
  if (str === null || str === undefined) {
    return ''
  }

  return String(str).replace(/[&<>'"]/g, (tag) => HTML_ESCAPES[tag])
}

/**
 * Escape special characters in a string for use in a regular expression.
 * @param {string} string The string to escape.
 * @returns {string} The escaped string.
 */
export function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Sanitizes a page name by stripping angle brackets and trimming whitespace.
 * @param {string} name The raw page name.
 * @param {string} [fallback=''] Fallback value if the sanitized name is empty.
 * @returns {string} The sanitized page name.
 */
export function sanitizePageName(name, fallback = '') {
  return (name || '').replace(/<|>/g, '').trim() || fallback
}

/**
 * Finds a page in a pages array by case-insensitive name (ignoring optional `.num` suffix) or exact ID.
 * @param {Array<{id: string, name?: string}>} pages List of pages.
 * @param {string} rawPageName Page name or ID reference.
 * @param {string|null} [excludePageId=null] Optional page ID to exclude from matching.
 * @returns {object|null} Matching page object or null.
 */
export function findPageByRef(pages, rawPageName, excludePageId = null) {
  if (!Array.isArray(pages) || !rawPageName) {
    return null
  }

  const trimmedRef = String(rawPageName).trim()
  if (!trimmedRef) {
    return null
  }

  const query = trimmedRef.toLowerCase().replace(/\.num$/, '')

  return (
    pages.find((p) => {
      if (!p || p.id === excludePageId) {
        return false
      }

      const name = (p.name || '')
        .trim()
        .toLowerCase()
        .replace(/\.num$/, '')

      return name === query || p.id === rawPageName || p.id === trimmedRef
    }) || null
  )
}

const WIN_RESERVED_BASENAME_REGEX =
  /^(?:con|prn|aux|nul|com[1-9\u00b9\u00b2\u00b3]|lpt[1-9\u00b9\u00b2\u00b3])(?:\..*)?$/i

/**
 * Sanitizes a page name to ensure it is safe to use as a file name across Windows, macOS, and Linux.
 * @param {string} name The page name.
 * @returns {string} The safe file name.
 */
export function getSafeFilename(name) {
  const cleaned = String(name || '')
    .replace(/\p{Cc}/gu, '')
    .replace(/[/\\:*?"<>|]/g, '-')
    .replace(/[. ]+$/g, '')
    .trim()

  if (!cleaned) {
    return 'Untitled'
  }

  return WIN_RESERVED_BASENAME_REGEX.test(cleaned) ? `_${cleaned}` : cleaned
}

/**
 * Computes a normalized case-insensitive sync key for a page or file name.
 * @param {string} name Page or file name.
 * @returns {string}
 */
export function getSyncKey(name) {
  return getSafeFilename(name).toLowerCase()
}

/**
 * Resolves a unique page name that does not collide with any existing normalized sync key.
 * @param {string} baseName Candidate base page name.
 * @param {Set<string>} usedKeys Set of already-used normalized sync keys.
 * @returns {string} Non-conflicting page name.
 */
export function resolveUniquePageName(baseName, usedKeys) {
  let candidate = baseName
  let count = 1

  while (usedKeys.has(getSyncKey(candidate))) {
    candidate = `${baseName} (${count++})`
  }

  return candidate
}

/**
 * Get standard BCP 47 locale tag based on system preference.
 * @param {object} settings The application settings.
 * @returns {string} The system locale.
 */
export function getSystemLocale(settings) {
  if (settings?.systemLocale) {
    return settings.systemLocale.split('-u-')[0]
  }

  const nav =
    typeof navigator !== 'undefined' ? navigator : typeof self !== 'undefined' && self.navigator ? self.navigator : null
  const rawLocale = nav?.languages?.[0] ?? nav?.language ?? 'en-US'

  return rawLocale.split('-u-')[0]
}

/**
 * Check if settings use comma as the decimal separator (1.234,56 or 1 234,56 format).
 * @param {object} settings The application settings.
 * @returns {boolean} True if comma decimal format (1.234,56 or 1 234,56) is active.
 */
export function isCommaDecimal(settings) {
  return settings?.numberFormat === '1.234,56' || settings?.numberFormat === '1 234,56'
}

/**
 * Check if settings use space as the thousands separator (1 234.56 or 1 234,56 format).
 * @param {object} settings The application settings.
 * @returns {boolean} True if space thousands format (1 234.56 or 1 234,56) is active.
 */
export function isSpaceGrouping(settings) {
  return settings?.numberFormat === '1 234.56' || settings?.numberFormat === '1 234,56'
}

/**
 * Get number formatting configuration based on settings.
 * @param {object} settings The application settings.
 * @returns {{ locale: string, group: string, decimal: string, argSep: string, useGrouping: boolean }}
 */
export function getNumberFormat(settings) {
  const commaDec = isCommaDecimal(settings)
  const spaceGrp = isSpaceGrouping(settings)

  return {
    locale: commaDec ? 'tr-TR' : 'en-US',
    group: spaceGrp ? ' ' : commaDec ? '.' : ',',
    decimal: commaDec ? ',' : '.',
    argSep: commaDec ? ';' : ',',
    useGrouping: Boolean(settings?.thouSep ?? true)
  }
}

/**
 * Creates a debounced function that delays invoking `func` until after `wait` milliseconds have elapsed.
 * @param {Function} func The function to debounce.
 * @param {number} wait The delay in milliseconds.
 * @returns {Function} The debounced function with `.flush()` and `.cancel()` methods.
 */
export function debounce(func, wait) {
  let timeout = null
  let lastArgs = null
  let lastThis = null

  const debounced = function (...args) {
    lastThis = this
    lastArgs = args

    clearTimeout(timeout)
    timeout = setTimeout(() => {
      const ctx = lastThis
      const callArgs = lastArgs

      timeout = null
      lastThis = null
      lastArgs = null
      func.apply(ctx, callArgs)
    }, wait)
  }

  debounced.flush = function () {
    if (timeout) {
      const ctx = lastThis
      const callArgs = lastArgs ?? []

      clearTimeout(timeout)
      timeout = null
      lastThis = null
      lastArgs = null
      func.apply(ctx, callArgs)
    }
  }

  debounced.cancel = function () {
    if (timeout) {
      clearTimeout(timeout)
      timeout = null
    }

    lastThis = null
    lastArgs = null
  }

  return debounced
}
