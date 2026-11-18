import { REGEX_STRING_LITERAL } from './constants.js'
import { calcState } from './mathInstance.js'
import { isCommaDecimal, isSpaceGrouping } from './utils.js'

const SPACE_COMMA_TOKEN_REGEX =
  /(?<![\w\p{L}.,])(?:\d+(?:[ \u00A0\u202F]\d{3})+(?:[.,][\d.,]*\d)?|\d+[.,][\d.,]*\d|\.\d+)(?![\d.,])/gu
const DOT_COMMA_TOKEN_REGEX = /(?<![\w\p{L}.,])(?:\d+[.,][\d.,]*\d|\.\d+)(?![\d.,])/gu
const VALID_SPACE_GROUP_COMMA_REGEX = /^[1-9]\d{0,2}(?:[ \u00A0\u202F]\d{3})+(?:,\d+)?$/
const VALID_DOT_GROUP_COMMA_REGEX = /^[1-9]\d{0,2}(?:\.\d{3})+(?:,\d+)?$/
const SIMPLE_COMMA_DEC_REGEX = /^\d+,\d+$/
const DATE_DAY_PREFIX_REGEX = /[\p{L}\p{M}.]+,\s+(?=\d{1,4}[/-]\d{1,2}[/-]\d{1,4}\b)/gu
const SPACE_DOT_GROUP_REGEX =
  /(?<![\w\p{L}.])[1-9]\d{0,2}(?:[ \u00A0\u202F]\d{3})+(?:\.\d+)?(?![.\d]|[ \u00A0\u202F]\d)/gu
const COMMA_DOT_GROUP_REGEX = /(?<![\w\p{L}.])[1-9]\d{0,2}(?:,\d{3})+(?:\.\d+)?(?![.\d])/gu
const LEADING_COLON_LABEL_REGEX = /^\s*([a-zA-Z_\p{L}](?:[\w\p{L}\p{M}\s]*[\w\p{L}\p{M}])?):\s+(.+)$/u

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
  const spaceGrp = isSpaceGrouping(calcState.settings)

  if (isCommaDecimal(calcState.settings)) {
    // 1.234,56 or 1 234,56 format: period or space thousands separator, comma decimal separator, semicolon argument separator
    const tokenRegex = spaceGrp ? SPACE_COMMA_TOKEN_REGEX : DOT_COMMA_TOKEN_REGEX

    let depth = 0

    return transformOutsideStrings(line, (segment) => {
      segment = segment.replace(tokenRegex, (numToken) => {
        if (spaceGrp) {
          if (VALID_SPACE_GROUP_COMMA_REGEX.test(numToken)) {
            return numToken.replaceAll(/[ \u00A0\u202F]/g, '').replace(',', '.')
          }
        } else if (VALID_DOT_GROUP_COMMA_REGEX.test(numToken)) {
          return numToken.replaceAll('.', '').replace(',', '.')
        }

        if (SIMPLE_COMMA_DEC_REGEX.test(numToken)) {
          return numToken.replace(',', '.')
        }

        throw new Error(`Invalid number "${numToken}"`)
      })

      const checkSegment = segment.replace(DATE_DAY_PREFIX_REGEX, '')

      if (checkSegment.includes(',')) {
        throw new Error('Use semicolon (;) as argument separator')
      }

      let out = ''

      for (const ch of segment) {
        if (ch === '(' || ch === '[' || ch === '{') {
          depth++
          out += ch
        } else if (ch === ')' || ch === ']' || ch === '}') {
          depth = Math.max(0, depth - 1)
          out += ch
        } else if (ch === ';' && depth > 0) {
          out += ','
        } else {
          out += ch
        }
      }

      return out
    })
  }

  if (spaceGrp) {
    // 1 234.56 format: space thousands separator, period decimal separator, comma argument separator
    return transformOutsideStrings(line, (segment) =>
      segment.replace(SPACE_DOT_GROUP_REGEX, (numToken) => numToken.replaceAll(/[ \u00A0\u202F]/g, ''))
    )
  }

  // 1,234.56 format: comma thousands separator, period decimal separator, comma argument separator
  return transformOutsideStrings(line, (segment) =>
    segment.replace(COMMA_DOT_GROUP_REGEX, (numToken) => numToken.replaceAll(',', ''))
  )
}

const COMMENT_OR_STRING_REGEX = new RegExp(`${REGEX_STRING_LITERAL.source}|(\\/\\/.*|#.*)`, 'g')

/**
 * Strip comments from a line while preserving comment tokens inside string literals.
 * @param {string} line The line to strip comments from.
 * @returns {string} The line without comments.
 */
export function stripComments(line) {
  return line.replace(COMMENT_OR_STRING_REGEX, (match, stringVal, commentVal) => {
    return commentVal ? '' : match
  })
}

/**
 * Strips a leading text label (`label: expr`) when the colon is immediately attached to the label
 * and followed by whitespace so variable names in scope do not collide with Math.js range syntax (`a:10`, `a : b`).
 * @param {string} line Input line.
 * @returns {string}
 */
export function stripLeadingColonLabel(line) {
  const trimmed = line.trim()
  if (trimmed.startsWith('{')) {
    return line
  }

  const match = line.match(LEADING_COLON_LABEL_REGEX)
  if (!match) {
    return line
  }

  return match[2]
}
