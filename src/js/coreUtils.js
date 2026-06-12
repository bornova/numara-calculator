export const HTML_ESCAPES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  "'": '&#39;',
  '"': '&quot;'
}

/**
 * Escape HTML special characters in a string.
 *
 * @param {string} str - The string to escape.
 * @returns {string} - The escaped string.
 */
export function escapeHTML(str) {
  return typeof str !== 'string' ? str : str.replace(/[&<>'"]/g, (tag) => HTML_ESCAPES[tag])
}

/**
 * Escape special characters in a string for use in a regular expression.
 * @param {string} string - The string to escape.
 * @returns {string} - The escaped string.
 */
export function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Get standard BCP 47 standard locale tag based on selection.
 * @param {object} settings - The application settings.
 * @returns {string} - The standard locale.
 */
export function getAppLocale(settings) {
  const loc = settings?.locale || 'system'
  const nav =
    typeof navigator !== 'undefined' ? navigator : typeof self !== 'undefined' && self.navigator ? self.navigator : null

  return loc === 'period' ? 'en-US' : loc === 'comma' ? 'tr-TR' : (nav?.languages?.[0] ?? nav?.language ?? 'en-US')
}

/**
 * Check user locale for decimal separator.
 * @param {object} settings - The application settings.
 * @returns {boolean} - True if locale uses comma.
 */
export function localeUsesComma(settings) {
  const loc = settings?.locale || 'system'
  const nav =
    typeof navigator !== 'undefined' ? navigator : typeof self !== 'undefined' && self.navigator ? self.navigator : null
  const locale = nav?.languages?.[0] ?? nav?.language ?? 'en-US'

  return loc === 'period' ? false : loc === 'comma' ? true : (1.11).toLocaleString(locale).includes(',')
}
