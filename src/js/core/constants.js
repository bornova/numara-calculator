export const USD_UNIT = 'USD'
export const PAGE_OBJECT_SYMBOL = Symbol.for('numara.pageObject')

export const CLASS_ANSWER = 'answer'
export const CLASS_PLOT_BUTTON = 'plotButton answer'
export const CLASS_LINE_ERROR_LINK = 'lineError'

export const INTERNAL_SCOPE_KEYS = new Set(['_', 'ans', 'now', 'today'])

/**
 * Checks whether a scope key is an internal calculator key (`_`, `ans`, `now`, `today`, or `lineN`).
 * @param {string} key Scope variable name.
 * @returns {boolean}
 */
export function isInternalScopeKey(key) {
  return INTERNAL_SCOPE_KEYS.has(key) || /^line\d+$/.test(key)
}

const DATE_UNIT_NAMES =
  'millisecond|second|sec|minute|min|hour|hr|day|week|month|quarter|year|decade|century|centuries|millennium|millennia'
const DATE_UNITS = `(?:${DATE_UNIT_NAMES})s?\\b`

export const REGEX_CONTINUATION = /[+\-*/]/
export const REGEX_DATE_TIME = new RegExp(
  `(?:\\+|(?<!\\b\\d{4}(?=-\\d{1,2}-\\d{1,2}\\b)|\\b\\d{4}-\\d{1,2}(?=-\\d{1,2}\\b(?!\\s*${DATE_UNITS})))-)\\s*.*?\\s*${DATE_UNITS}`,
  'i'
)
export const REGEX_DATE_TERM = new RegExp(`([+-])\\s*(.*?)\\s*(${DATE_UNIT_NAMES})s?\\b`, 'gi')
export const REGEX_PCNT_OF = /%[ ]*of[ ]*/gi
export const REGEX_PCNT_RATIO =
  /^(?:([\p{L}\p{M}_][\p{L}\p{M}\w]*)\s*=\s*)?(.+?)\s+\b(?:as\s+(?:a\s+)?%|is\s+what\s+%)\s+of\s+(.+)$/iu
export const REGEX_CONVERSION_SUFFIX = /^(.*?)\s+\b(?:to|in)\s+(hex|bin|oct|%)\s*$/i
export const REGEX_PLOT = /^\s*[\p{L}\p{M}_][\p{L}\p{M}\w]*\s*\(\s*[\p{L}\p{M}_][\p{L}\p{M}\w]*\s*\)\s*=(?!=)/u
export const REGEX_ASSIGNMENT = /^([\p{L}\p{M}_][\p{L}\p{M}\w]*)\s*=\s*(.+)$/u
export const REGEX_STRING_LITERAL = /("(?:\\[\s\S]|[^"\\])*")/g
export const DATE_DIFF_CANDIDATE_REGEX =
  /\b\d{1,4}[/-]\d{1,2}[/-]\d{1,4}\b.*-.*(?:\b\d{1,4}[/-]\d{1,2}[/-]\d{1,4}\b|\b(?:today|now)\b)|\b(?:today|now)\b.*-.*\b\d{1,4}[/-]\d{1,2}[/-]\d{1,4}\b/i

export const CHART_SPLINE_ICON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chart-spline"><path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="M7 16c.5-2 1.5-7 4-7 2 0 2 3 4 3 2.5 0 4.5-5 5-7"/></svg>'
