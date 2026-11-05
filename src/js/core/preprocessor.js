import { REGEX_DATE_TIME, REGEX_STRING_LITERAL } from './constants.js'
import { app } from './mathInstance.js'
import { isCommaDecimal, isSpaceGrouping } from './utils.js'

/**
 * Applies a transformation function only to parts of a line outside string literals.
 * @param {string} line The input line.
 * @param {function(string): string} fn Transformation function for non-string segments.
 * @returns {string} The transformed line.
 */
export function transformOutsideStrings(line, fn) {
  return line
    .split(REGEX_STRING_LITERAL)
    .map((segment, index) => (index % 2 === 1 ? segment : fn(segment)))
    .join('')
}

/**
 * Normalizes thousands separators, decimal separators, and argument separators in an input line.
 * @param {string} line The input expression line.
 * @returns {string} The normalized expression line for Math.js evaluation.
 */
export function normalizeNumberInput(line) {
  const spaceGrp = isSpaceGrouping(app.settings)

  if (isCommaDecimal(app.settings)) {
    // 1.234,56 or 1 234,56 format: period or space thousands separator, comma decimal separator, semicolon argument separator
    const tokenRegex = spaceGrp
      ? /(?<![\w\p{L}.,/:])(?:\d+(?:[ \u00A0\u202F]\d{3})+(?:[.,][\d.,]*\d)?|\d+[.,][\d.,]*\d|\.\d+)(?![\d.,/:])/gu
      : /(?<![\w\p{L}.,])(?:\d+[.,][\d.,]*\d|\.\d+)(?![\d.,])/gu

    return transformOutsideStrings(line, (segment) => {
      segment = segment.replace(tokenRegex, (numToken) => {
        if (spaceGrp) {
          if (/^[1-9]\d{0,2}(?:[ \u00A0\u202F]\d{3})+(?:,\d+)?$/.test(numToken)) {
            return numToken.replaceAll(/[ \u00A0\u202F]/g, '').replace(',', '.')
          }
        } else if (/^[1-9]\d{0,2}(?:\.\d{3})+(?:,\d+)?$/.test(numToken)) {
          return numToken.replaceAll('.', '').replace(',', '.')
        }

        if (/^\d+,\d+$/.test(numToken)) {
          return numToken.replace(',', '.')
        }

        throw new Error(`Invalid number "${numToken}"`)
      })

      REGEX_DATE_TIME.lastIndex = 0
      const checkSegment = REGEX_DATE_TIME.test(line)
        ? segment.replace(/^\s*(?:[\p{L}\p{M}_][\p{L}\p{M}\w]*\s*=\s*)?[\p{L}\p{M}.]+,\s+/u, '')
        : segment

      if (checkSegment.includes(',')) {
        throw new Error('Use semicolon (;) as argument separator')
      }

      return segment.replaceAll(';', ',')
    })
  }

  if (spaceGrp) {
    // 1 234.56 format: space thousands separator, period decimal separator, comma argument separator
    return transformOutsideStrings(line, (segment) =>
      segment.replace(
        /(?<![\w\p{L}./:])[1-9]\d{0,2}(?:[ \u00A0\u202F]\d{3})+(?:\.\d+)?(?![.\d/:]|[ \u00A0\u202F]\d)/gu,
        (numToken) => numToken.replaceAll(/[ \u00A0\u202F]/g, '')
      )
    )
  }

  // 1,234.56 format: comma thousands separator, period decimal separator, comma argument separator
  return transformOutsideStrings(line, (segment) =>
    segment.replace(/(?<![\w\p{L}.])[1-9]\d{0,2}(?:,\d{3})+(?:\.\d+)?(?![.\d])/gu, (numToken) =>
      numToken.replaceAll(',', '')
    )
  )
}

/**
 * Strip comments from a line while preserving comment tokens inside string literals.
 * @param {string} line The line to strip comments from.
 * @returns {string} The line without comments.
 */
export function stripComments(line) {
  return line.replace(
    /("(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'|`(?:\\[\s\S]|[^`\\])*`)|(\/\/.*|#.*)/g,
    (match, stringVal, commentVal) => {
      return commentVal ? '' : match
    }
  )
}
