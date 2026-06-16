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
 * Get standard BCP 47 standard locale tag based on system preference.
 * @param {object} settings - The application settings.
 * @returns {string} - The system locale.
 */
export function getSystemLocale(settings) {
  if (settings?.systemLocale) return settings.systemLocale

  const nav =
    typeof navigator !== 'undefined' ? navigator : typeof self !== 'undefined' && self.navigator ? self.navigator : null

  return nav?.languages?.[0] ?? nav?.language ?? 'en-US'
}

/**
 * Get standard BCP 47 standard locale tag based on selection.
 * @param {object} settings - The application settings.
 * @returns {string} - The standard locale.
 */
export function getAppLocale(settings) {
  const loc = settings?.thouSep || 'system'

  if (loc === 'period') return 'en-US'
  if (loc === 'comma') return 'tr-TR'

  return getSystemLocale(settings)
}

/**
 * Check user locale for decimal separator.
 * @param {object} settings - The application settings.
 * @returns {boolean} - True if locale uses comma.
 */
export function localeUsesComma(settings) {
  const locale = getAppLocale(settings)

  return (1.11).toLocaleString(locale).includes(',')
}
