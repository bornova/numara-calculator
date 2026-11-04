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
  if (str === null || str === undefined) return ''

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
 * Sanitizes a page name to ensure it is safe to use as a file name.
 * @param {string} name The page name.
 * @returns {string} The safe file name.
 */
export function getSafeFilename(name) {
  return (
    name
      .replace(/[/\\:*?"<>|]/g, '-')
      .replace(/[. ]+$/g, '')
      .trim() || 'Untitled'
  )
}

/**
 * Get standard BCP 47 locale tag based on system preference.
 * @param {object} settings The application settings.
 * @returns {string} The system locale.
 */
export function getSystemLocale(settings) {
  if (settings?.systemLocale) return settings.systemLocale.split('-u-')[0]

  const nav =
    typeof navigator !== 'undefined' ? navigator : typeof self !== 'undefined' && self.navigator ? self.navigator : null
  const rawLocale = nav?.languages?.[0] ?? nav?.language ?? 'en-US'

  return rawLocale.split('-u-')[0]
}

/**
 * Check if settings use comma as the decimal separator (1.234,56 format).
 * @param {object} settings The application settings.
 * @returns {boolean} True if comma decimal format (1.234,56) is active.
 */
export function isCommaDecimal(settings) {
  return settings?.numberFormat === '1.234,56'
}

/**
 * Get number formatting configuration based on settings.
 * @param {object} settings The application settings.
 * @returns {{ locale: string, group: string, decimal: string, argSep: string, useGrouping: boolean }}
 */
export function getNumberFormat(settings) {
  const commaDec = isCommaDecimal(settings)

  return {
    locale: commaDec ? 'tr-TR' : 'en-US',
    group: commaDec ? '.' : ',',
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

  const debounced = function (...args) {
    const context = this

    clearTimeout(timeout)
    timeout = setTimeout(() => {
      timeout = null
      func.apply(context, args)
    }, wait)
  }

  debounced.flush = function () {
    if (timeout) {
      clearTimeout(timeout)
      timeout = null
      func()
    }
  }

  debounced.cancel = function () {
    if (timeout) {
      clearTimeout(timeout)
      timeout = null
    }
  }

  return debounced
}
