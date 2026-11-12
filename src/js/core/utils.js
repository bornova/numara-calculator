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
  if (!Array.isArray(pages) || !rawPageName) return null

  const trimmedRef = String(rawPageName).trim()
  const query = trimmedRef.toLowerCase().replace(/\.num$/, '')

  return (
    pages.find((p) => {
      if (!p || p.id === excludePageId) return false

      const name = (p.name || '')
        .trim()
        .toLowerCase()
        .replace(/\.num$/, '')

      return name === query || p.id === rawPageName || p.id === trimmedRef
    }) || null
  )
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

const MAC_FONT_SIZE_ZOOM_MAP = {
  smaller: { '12px': '11px', '13px': '12px', '14px': '13px', '15px': '14px', '16px': '15px' },
  normal: { '12px': '12px', '13px': '13px', '14px': '14px', '15px': '15px', '16px': '16px' },
  larger: { '12px': '13px', '13px': '14px', '14px': '15px', '15px': '16px', '16px': '17px' }
}

const NON_MAC_FONT_SIZE_ZOOM_MAP = {
  smaller: { '12px': '11px', '13px': '11px', '14px': '12px', '15px': '13px', '16px': '14px' },
  normal: { '12px': '11px', '13px': '12px', '14px': '13px', '15px': '14px', '16px': '15px' },
  larger: { '12px': '12px', '13px': '13px', '14px': '14px', '15px': '15px', '16px': '16px' }
}

/**
 * Resolves the optically matched editor font size for a semantic size tier, zoom level, and platform.
 * Non-macOS desktop displays (~96 logical PPI + DirectWrite/FreeType hinting) step down 1px so tiers
 * (`Tiny`..`X-Large`) match macOS Retina optical size while keeping `'14px'` (`Normal`) as the universal default.
 * @param {string} fontSize Stored font size tier (`'12px'`..`'16px'`).
 * @param {string} [zoomLevel='normal'] Active UI zoom level (`'smaller'`, `'normal'`, `'larger'`).
 * @param {boolean} [useMacScale=true] True on macOS or mobile devices; false on Windows/Linux desktop.
 * @returns {string} Effective CSS font-size string.
 */
export function resolveEditorFontSize(fontSize, zoomLevel = 'normal', useMacScale = true) {
  const map = useMacScale ? MAC_FONT_SIZE_ZOOM_MAP : NON_MAC_FONT_SIZE_ZOOM_MAP

  return map[zoomLevel]?.[fontSize] || fontSize
}

/**
 * Resolves the optically matched editor font weight for a platform.
 * Non-macOS desktop displays lack CoreText stem dilation, so variable font weights below 700
 * step up by +50 (e.g. `'400'` -> `'450'`) to match macOS stroke weight without altering glyph advance width.
 * @param {string} fontWeight Stored font weight (`'200'`, `'300'`, `'400'`, `'500'`, `'700'`).
 * @param {boolean} [useMacScale=true] True on macOS or mobile devices; false on Windows/Linux desktop.
 * @returns {string} Effective CSS font-weight string.
 */
export function resolveEditorFontWeight(fontWeight, useMacScale = true) {
  if (useMacScale) return fontWeight

  const numeric = Number.parseInt(fontWeight, 10)
  if (!Number.isFinite(numeric)) return fontWeight

  return String(Math.min(700, numeric + 50))
}

/**
 * Resolves the Google Sans variable `GRAD` axis value for a platform.
 * Non-macOS desktop displays apply `+50` grade so UI text matches macOS CoreText stem dilation
 * across all weights (400..700) without changing character advance widths.
 * @param {boolean} [useMacScale=true] True on macOS or mobile devices; false on Windows/Linux desktop.
 * @returns {string} CSS `GRAD` axis value (`'0'` or `'50'`).
 */
export function resolveUiFontGrade(useMacScale = true) {
  return useMacScale ? '0' : '50'
}

/**
 * Resolves the UI base font size offset for a platform.
 * Windows desktop steps UI text down by 1px (`'-1px'`), while macOS, Linux, and mobile keep `'0px'`.
 * @param {boolean} [isWindows=false] True on Windows desktop.
 * @returns {string} CSS pixel offset (`'-1px'` or `'0px'`).
 */
export function resolveUiFontOffset(isWindows = false) {
  return isWindows ? '-1px' : '0px'
}
