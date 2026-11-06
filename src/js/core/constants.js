import { ChartSpline } from 'lucide'

export const USD_UNIT = 'USD'
export const PAGE_OBJECT_SYMBOL = Symbol.for('numara.pageObject')

export const CLASS_ANSWER = 'answer'
export const CLASS_PLOT_BUTTON = 'plotButton answer'
export const CLASS_LINE_ERROR_LINK = 'lineError'

const DATE_UNITS =
  '(?:millisecond|second|minute|hour|day|week|month|quarter|year|decade|century|centuries|millennium|millennia)s?\\b'

export const REGEX_CONTINUATION = /[+\-*/]/
export const REGEX_DATE_TIME = new RegExp(
  `(?:\\+|(?<!\\b\\d{4}(?=-\\d{1,2}-\\d{1,2}\\b)|\\b\\d{4}-\\d{1,2}(?=-\\d{1,2}\\b(?!\\s*${DATE_UNITS})))-)\\s*.*?\\s*${DATE_UNITS}`,
  'gi'
)
export const REGEX_PCNT_OF = /%[ ]*of[ ]*/gi
export const REGEX_PCNT_RATIO =
  /^(?:([\p{L}\p{M}_][\p{L}\p{M}\w]*)\s*=\s*)?(.+?)\s+\b(?:as\s+(?:a\s+)?%|is\s+what\s+%)\s+of\s+(.+)$/iu
export const REGEX_CONVERSION_SUFFIX = /^(.*?)\s+\b(?:to|in)\s+(hex|bin|oct|%)\s*$/i
export const REGEX_PLOT = /^\s*[a-zA-Z_]\w*\s*\(\s*[a-zA-Z_]\w*\s*\)\s*=/
export const REGEX_STRING_LITERAL = /("(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'|`(?:\\[\s\S]|[^`\\])*`)/g

export const CHART_SPLINE_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chart-spline">${ChartSpline.map(
  ([tag, attrs]) =>
    `<${tag} ${Object.entries(attrs)
      .map(([k, v]) => `${k}="${v}"`)
      .join(' ')}/>`
).join('')}</svg>`
