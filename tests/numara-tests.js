import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert'
import { create, all } from 'mathjs'
import { runCalculation, formatAnswer, applyUdfu } from '../src/js/core/evaluator.js'
import { customCases } from './custom-cases.js'

// Default settings from settings.js
const defaultSettings = {
  alwaysOnTop: false,
  syncDirEnabled: false,
  syncDir: '',
  answerPosition: 'left',
  autocomplete: true,
  closeBrackets: true,
  contPrevLine: false, // Disabled line-continuation for pure mathematical matching
  copyThouSep: false,
  currency: true,
  currencyInterval: '0',
  dateDay: false,
  dateFormat: 'system',
  expLower: '-12',
  expUpper: '12',
  fontSize: '1.1rem',
  fontWeight: '400',
  inputLocale: false,
  inputWidth: 60,
  keywordTips: true,
  lineErrors: true,
  lineHeight: '24px',
  lineNumbers: true,
  lineWrap: true,
  truncateAnswers: true,
  matchBrackets: true,
  matrixType: 'Matrix',
  newPageOnStart: false,
  notation: 'auto',
  notifyDuration: '5000',
  notifyLocation: 'bottom-center',
  numericOutput: 'number',
  pageListPosition: 'auto',
  precision: '4',
  calcTimeout: '10',
  predictable: false,
  rulers: false,
  syntax: true,
  theme: 'system',
  thouSep: 'system',
  showTray: false,
  openAtLogin: false
}

const mockCurrencies = {
  USD: { symbol: '$', name: 'U.S. Dollar', locale: 'en-US' },
  EUR: { symbol: '€', name: 'Euro', locale: 'de-DE', rate: 1.13 },
  GBP: { symbol: '£', name: 'British Pound', locale: 'en-GB', rate: 1.28 },
  CNY: { symbol: '¥', name: 'Chinese Yuan', locale: 'zh-CN', rate: 0.14 },
  RUB: { symbol: '₽', name: 'Russian Ruble', locale: 'ru-RU', rate: 0.011 },
  TRY: { symbol: '₺', name: 'Turkish Lira', locale: 'tr-TR', rate: 0.03 },
  SZL: { symbol: 'E', name: 'Swaziland Lilangeni', locale: 'en-SZ', rate: 0.055 }
}

const standardMath = create(all)

// Stochastic/random functions to skip
const SKIPPED_FUNCTIONS = new Set(['random', 'randomInt', 'pickRandom', 'partitionSelect', 'print', 'config'])

function unescapeHTML(str) {
  if (!str) return ''

  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
}

function extractAnswer(htmlStr) {
  if (!htmlStr) return { answer: '' }

  const errorMatch = htmlStr.match(/data-error="([^"]+)"/)
  if (errorMatch) return { error: unescapeHTML(errorMatch[1]) }

  const answerMatch = htmlStr.match(/data-answer="([^"]+)"/)
  if (answerMatch) return { answer: unescapeHTML(answerMatch[1]) }

  if (htmlStr.includes('plotButton')) {
    const plotMatch = htmlStr.match(/data-plot="([^"]+)"/)
    return { answer: plotMatch ? unescapeHTML(plotMatch[1]) : '', isPlot: true }
  }

  // Strip HTML tags as fallback
  const text = htmlStr.replace(/<\/?[^>]+(>|$)/g, '').trim()
  return { answer: unescapeHTML(text) }
}

// Get all functions and constants with help examples
function getMathjsExamples() {
  const functions = []
  const constants = []

  const keys = Object.keys(standardMath.expression.mathWithTransform)

  for (const key of keys) {
    try {
      const help = standardMath.help(key).toJSON()

      if (help.examples && help.examples.length > 0) {
        const item = {
          name: key,
          category: help.category || 'Unknown',
          examples: help.examples
        }

        if (help.category === 'Constants') {
          constants.push(item)
        } else {
          functions.push(item)
        }
      }
    } catch {
      // Ignore if no help info exists
    }
  }

  return { functions, constants }
}

describe('Numara Calculation Engine vs Math.js', function () {
  beforeEach(() => {
    // Ensure Numara engine is initialized with default settings before every test
    runCalculation({
      activePage: 'init-page',
      lines: [],
      settings: defaultSettings,
      currencies: mockCurrencies
    })
  })

  const { functions, constants } = getMathjsExamples()
  const units = Object.keys(standardMath.Unit.UNITS)

  describe('Math.js Functions', () => {
    for (const fn of functions) {
      if (SKIPPED_FUNCTIONS.has(fn.name)) continue

      it(`should evaluate examples for function: ${fn.name}`, () => {
        const standardScope = {}

        // Reset standard config before each test suite category
        standardMath.config({
          matrix: 'Matrix',
          number: 'number',
          predictable: false
        })

        // 1. Evaluate sequentially in standard mathjs
        const standardAnswers = fn.examples.map((expr) => {
          try {
            const val = standardMath.evaluate(expr, standardScope)
            let formatted = ''

            if (val !== undefined && val !== null) {
              formatted = formatAnswer(val, false)
            }

            return { answer: formatted }
          } catch (e) {
            return { error: e.message }
          }
        })

        // 2. Evaluate sequentially in Numara
        const pageId = `test-Function-${fn.name}`
        runCalculation({ activePage: pageId, lines: [], settings: defaultSettings, currencies: mockCurrencies })

        const numaraResult = runCalculation({
          activePage: pageId,
          lines: fn.examples,
          settings: defaultSettings,
          currencies: mockCurrencies
        })

        // 3. Assert outputs
        for (let i = 0; i < fn.examples.length; i++) {
          const expr = fn.examples[i]
          const std = standardAnswers[i]
          const numRaw = numaraResult.answers[i]
          const num = extractAnswer(numRaw)

          if (std.error) {
            if (num.error) {
              // Both errored - PASS
              continue
            }
            assert.fail(
              `Expected standard error: "${std.error}" but got successful Numara answer: "${num.answer}" for expression "${expr}"`
            )
          } else {
            if (num.error) {
              // Check if it's an expected difference (like colons inside objects, which Numara strips as labels)
              if (expr.includes(':') && num.error.includes('Unexpected operator }')) {
                continue
              }

              assert.fail(
                `Expression "${expr}" failed in Numara with error: "${num.error}" (MathJS expected: "${std.answer}")`
              )
            } else if (num.isPlot) {
              continue
            } else if (std.answer !== num.answer) {
              // Float check
              const stdNum = parseFloat(std.answer)
              const numNum = parseFloat(num.answer)

              if (!isNaN(stdNum) && !isNaN(numNum) && Math.abs(stdNum - numNum) < 1e-4) {
                continue
              }

              assert.strictEqual(num.answer, std.answer, `Value mismatch for expression: "${expr}"`)
            }
          }
        }
      })
    }
  })

  describe('Math.js Constants', () => {
    for (const cn of constants) {
      it(`should evaluate examples for constant: ${cn.name}`, () => {
        const standardScope = {}

        standardMath.config({
          matrix: 'Matrix',
          number: 'number',
          predictable: false
        })

        const standardAnswers = cn.examples.map((expr) => {
          try {
            const val = standardMath.evaluate(expr, standardScope)
            let formatted = ''

            if (val !== undefined && val !== null) {
              formatted = formatAnswer(val, false)
            }

            return { answer: formatted }
          } catch (e) {
            return { error: e.message }
          }
        })

        const pageId = `test-Constant-${cn.name}`
        runCalculation({ activePage: pageId, lines: [], settings: defaultSettings, currencies: mockCurrencies })

        const numaraResult = runCalculation({
          activePage: pageId,
          lines: cn.examples,
          settings: defaultSettings,
          currencies: mockCurrencies
        })

        for (let i = 0; i < cn.examples.length; i++) {
          const expr = cn.examples[i]
          const std = standardAnswers[i]
          const numRaw = numaraResult.answers[i]
          const num = extractAnswer(numRaw)

          if (std.error) {
            if (num.error) continue
            assert.fail(
              `Expected standard error: "${std.error}" but got successful Numara answer: "${num.answer}" for expression "${expr}"`
            )
          } else {
            if (num.error) {
              assert.fail(
                `Expression "${expr}" failed in Numara with error: "${num.error}" (MathJS expected: "${std.answer}")`
              )
            } else if (std.answer !== num.answer) {
              const stdNum = parseFloat(std.answer)
              const numNum = parseFloat(num.answer)

              if (!isNaN(stdNum) && !isNaN(numNum) && Math.abs(stdNum - numNum) < 1e-4) {
                continue
              }
              assert.strictEqual(num.answer, std.answer, `Value mismatch for expression: "${expr}"`)
            }
          }
        }
      })
    }
  })

  describe('Math.js Units', () => {
    for (const unit of units) {
      let expr = `10 ${unit}`

      try {
        standardMath.evaluate(expr)
      } catch {
        if (unit === 'celsius' || unit === 'kelvin' || unit === 'fahrenheit') {
          expr = `10 degC`
        } else {
          continue // skip prefixes or abstract units
        }
      }

      const finalExpr = expr // capture value for closure

      it(`should evaluate unit: ${unit} ("${finalExpr}")`, () => {
        const standardScope = {}

        standardMath.config({
          matrix: 'Matrix',
          number: 'number',
          predictable: false
        })

        let stdAns = ''

        try {
          const val = standardMath.evaluate(finalExpr, standardScope)
          if (val !== undefined && val !== null) {
            stdAns = formatAnswer(val, false)
          }
        } catch (e) {
          assert.fail(`MathJS standard failed to evaluate unit expression "${finalExpr}": ${e.message}`)
        }

        const pageId = `test-Unit-${unit}`
        runCalculation({ activePage: pageId, lines: [], settings: defaultSettings, currencies: mockCurrencies })

        const numaraResult = runCalculation({
          activePage: pageId,
          lines: [finalExpr],
          settings: defaultSettings,
          currencies: mockCurrencies
        })

        const num = extractAnswer(numaraResult.answers[0])

        if (num.error) {
          assert.fail(
            `Expression "${finalExpr}" failed in Numara with error: "${num.error}" (MathJS expected: "${stdAns}")`
          )
        } else if (stdAns !== num.answer) {
          const stdNum = parseFloat(stdAns)
          const numNum = parseFloat(num.answer)

          if (!isNaN(stdNum) && !isNaN(numNum) && Math.abs(stdNum - numNum) < 1e-4) return

          assert.strictEqual(num.answer, stdAns, `Value mismatch for unit expression: "${finalExpr}"`)
        }
      })
    }
  })

  describe('Custom Test Cases', () => {
    for (const testCase of customCases) {
      it(`should evaluate custom case: "${testCase.name}"`, () => {
        const caseSettings = { ...defaultSettings, ...(testCase.settings || {}) }
        const standardScope = {}
        const standardAnswers = []

        if (testCase.udf) {
          applyUdfu(true, testCase.udf)
        }
        if (testCase.udu) {
          applyUdfu(false, testCase.udu)
        }

        if (!testCase.expected) {
          standardMath.config({
            matrix: 'Matrix',
            number: 'number',
            predictable: false
          })

          for (const expr of testCase.expressions) {
            try {
              const val = standardMath.evaluate(expr, standardScope)
              standardAnswers.push({ answer: val !== undefined && val !== null ? formatAnswer(val, false) : '' })
            } catch (e) {
              standardAnswers.push({ error: e.message })
            }
          }
        }

        const pageId = `test-Custom-${testCase.name}`
        runCalculation({ activePage: pageId, lines: [], settings: caseSettings, currencies: mockCurrencies })

        const numaraResult = runCalculation({
          activePage: pageId,
          lines: testCase.expressions,
          settings: caseSettings,
          currencies: mockCurrencies
        })

        const errors = []
        for (let i = 0; i < testCase.expressions.length; i++) {
          const expr = testCase.expressions[i]
          const numRaw = numaraResult.answers[i]
          const num = extractAnswer(numRaw)

          if (testCase.expected) {
            const expVal = testCase.expected[i]
            const answerValue = num.answer !== undefined ? num.answer : num.error
            const isMatch = expVal instanceof RegExp ? expVal.test(answerValue) : String(expVal) === answerValue

            if (!isMatch) {
              errors.push(
                `Expected value matching "${expVal}" but got "${num.answer || num.error}" for expression "${expr}"`
              )
            }
          } else {
            const std = standardAnswers[i]

            if (std.error) {
              if (num.error) continue
              errors.push(
                `Expected standard error: "${std.error}" but got successful Numara answer: "${num.answer}" for expression "${expr}"`
              )
            } else {
              if (num.error) {
                errors.push(
                  `Expression "${expr}" failed in Numara with error: "${num.error}" (MathJS expected: "${std.answer}")`
                )
              } else if (std.answer !== num.answer) {
                const stdNum = parseFloat(std.answer)
                const numNum = parseFloat(num.answer)

                if (!isNaN(stdNum) && !isNaN(numNum) && Math.abs(stdNum - numNum) < 1e-4) {
                  continue
                }

                errors.push(
                  `Value mismatch for expression: "${expr}" (got "${num.answer}", expected standard "${std.answer}")`
                )
              }
            }
          }
        }

        if (errors.length > 0) {
          assert.fail(`Failing expressions:\n      ${errors.join('\n      ')}`)
        }
      })
    }
  })
})
