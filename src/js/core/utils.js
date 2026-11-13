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

export const HIDPI_MIN_DPR = 1.5

const ZOOM_STEP_OFFSETS = { smaller: -1, normal: 0, larger: 1 }
const EDITOR_FONT_SIZE_STEPS = { '12px': 1, '13px': 1, '14px': 1, '15px': 1, '16px': 1 }
const EDITOR_LINE_HEIGHT_STEPS = { '17px': 1, '21px': 1, '26px': 2, '30px': 2, '34px': 2 }

function resolveSteppedPx(value, stepMap, zoomLevel = 'normal', isLowDpiDesktop = false) {
  const perStep = stepMap[value]
  if (!perStep) return value

  const zoomStep = (ZOOM_STEP_OFFSETS[zoomLevel] ?? 0) + (isLowDpiDesktop ? -1 : 0)
  return `${Number.parseInt(value, 10) + zoomStep * perStep}px`
}

/**
 * Resolves the effective editor font size for a semantic size tier, zoom level, and display density.
 * Low-DPI desktop displays (`1x`, DPR < 1.5) step down 1 tier so 13px/14px does not render oversized.
 * @param {string} fontSize Stored font size tier (`'12px'`..`'16px'`).
 * @param {string} [zoomLevel='normal'] Active UI zoom level (`'smaller'`, `'normal'`, `'larger'`).
 * @param {boolean} [isLowDpiDesktop=false] True on non-macOS, non-mobile displays with DPR < 1.5.
 * @returns {string} Effective CSS font-size string.
 */
export function resolveEditorFontSize(fontSize, zoomLevel = 'normal', isLowDpiDesktop = false) {
  return resolveSteppedPx(fontSize, EDITOR_FONT_SIZE_STEPS, zoomLevel, isLowDpiDesktop)
}

/**
 * Resolves the effective editor line height for a tier, zoom level, and display density.
 * @param {string} lineHeight Stored line height tier (`'17px'`, `'21px'`, `'26px'`, `'30px'`, `'34px'`).
 * @param {string} [zoomLevel='normal'] Active UI zoom level (`'smaller'`, `'normal'`, `'larger'`).
 * @param {boolean} [isLowDpiDesktop=false] True on non-macOS, non-mobile displays with DPR < 1.5.
 * @returns {string} Effective CSS line-height string.
 */
export function resolveEditorLineHeight(lineHeight, zoomLevel = 'normal', isLowDpiDesktop = false) {
  return resolveSteppedPx(lineHeight, EDITOR_LINE_HEIGHT_STEPS, zoomLevel, isLowDpiDesktop)
}

/**
 * Resolves the optically matched editor font weight for a platform and display density.
 * HiDPI non-macOS desktop displays lack CoreText stem dilation, so variable weights below 700
 * step up by +50 (e.g. `'400'` -> `'450'`) to match macOS stroke weight. Low-DPI `1x` displays
 * stay on the hinted master weight so DirectWrite ClearType stays crisp.
 * @param {string} fontWeight Stored font weight (`'200'`, `'300'`, `'400'`, `'500'`, `'700'`).
 * @param {boolean} [useMacScale=true] True on macOS or mobile devices; false on Windows/Linux desktop.
 * @param {boolean} [isHiDpi=true] True when `devicePixelRatio >= 1.5`.
 * @returns {string} Effective CSS font-weight string.
 */
export function resolveEditorFontWeight(fontWeight, useMacScale = true, isHiDpi = true) {
  if (useMacScale || !isHiDpi) return fontWeight

  const numeric = Number.parseInt(fontWeight, 10)
  if (!Number.isFinite(numeric)) return fontWeight

  return String(Math.min(700, numeric + 50))
}

/**
 * Resolves the Google Sans variable `GRAD` axis value for a platform and display density.
 * HiDPI non-macOS desktop displays apply `+50` grade to match macOS CoreText stem dilation;
 * Low-DPI `1x` displays stay at `'0'` so ClearType hinting remains sharp.
 * @param {boolean} [useMacScale=true] True on macOS or mobile devices; false on Windows/Linux desktop.
 * @param {boolean} [isHiDpi=true] True when `devicePixelRatio >= 1.5`.
 * @returns {string} CSS `GRAD` axis value (`'0'` or `'50'`).
 */
export function resolveUiFontGrade(useMacScale = true, isHiDpi = true) {
  return useMacScale || !isHiDpi ? '0' : '50'
}
