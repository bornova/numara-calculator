import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert'
import { create, all } from 'mathjs'
import { areBoundsEqual, isBoundsOnScreen, resolveWindowBounds } from '../src/electron/bounds.js'
import { INTERNAL_SCOPE_KEYS, isInternalScopeKey } from '../src/js/core/constants.js'
import { runCalculation, formatAnswer, applyUdfu } from '../src/js/core/evaluator.js'
import { parseLocaleNumber, parseStrictLocaleNumber } from '../src/js/core/formatter.js'
import { stripComments } from '../src/js/core/preprocessor.js'
import {
  applyUdfuToMath,
  compileUdfItems,
  compileUduItems,
  parseLegacyUdf,
  parseLegacyUdu
} from '../src/js/core/udfu.js'
import { debounce, escapeHTML, escapeRegExp, getSafeFilename, resolveEditorFontSize } from '../src/js/core/utils.js'
import { detectExternalRenames } from '../src/js/pages/syncPlan.js'
import { app as appState } from '../src/js/state/appState.js'
import { migrateColors, migrateFromV7, migrateStorageAndPages } from '../src/js/state/migration.js'
import { initStoreObject, store } from '../src/js/state/store.js'
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
  dateFormat: 'MM/dd/yyyy',
  expLower: '-12',
  expUpper: '12',
  fontSize: '14px',
  fontWeight: '400',
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
  numberFormat: '1,234.56',
  numericOutput: 'number',
  pageListPosition: 'auto',
  precision: '4',
  calcTimeout: '10',
  predictable: false,
  rulers: false,
  syntax: true,
  theme: 'system',
  thouSep: true,
  showTray: false,
  openAtLogin: false
}

const mockCurrencies = {
  USD: { symbol: '$', name: 'U.S. Dollar', locale: 'en-US' },
  EUR: { symbol: '€', name: 'Euro', locale: 'de-DE', rate: 1.13 },
  GBP: { symbol: '£', name: 'British Pound', locale: 'en-GB', rate: 1.28 },
  CNY: { symbol: '¥', name: 'Chinese Yuan', locale: 'zh-CN', rate: 0.14 },
  INR: { symbol: '₹', name: 'Indian Rupee', locale: 'en-IN', rate: 0.012 },
  KRW: { symbol: '₩', name: 'South Korean Won', locale: 'ko-KR', rate: 0.00075 },
  RUB: { symbol: '₽', name: 'Russian Ruble', locale: 'ru-RU', rate: 0.011 },
  TRY: { symbol: '₺', name: 'Turkish Lira', locale: 'tr-TR', rate: 0.03 },
  BRL: { symbol: 'R$', name: 'Brazilian Real', locale: 'pt-BR', rate: 0.2 },
  NIO: { symbol: 'C$', name: 'Nicaraguan Córdoba', locale: 'es-NI', rate: 0.027 },
  PEN: { symbol: 'S/', name: 'Peruvian Sol', locale: 'es-PE', rate: 0.27 },
  PLN: { symbol: 'zł', name: 'Polish Zloty', locale: 'pl-PL', rate: 0.25 },
  ILS: { symbol: '₪', name: 'Israeli New Shekel', locale: 'he-IL', rate: 0.27 },
  PHP: { symbol: '₱', name: 'Philippine Peso', locale: 'en-PH', rate: 0.018 },
  THB: { symbol: '฿', name: 'Thai Baht', locale: 'th-TH', rate: 0.029 },
  VND: { symbol: '₫', name: 'Vietnamese Dong', locale: 'vi-VN', rate: 0.00004 },
  UAH: { symbol: '₴', name: 'Ukrainian Hryvnia', locale: 'uk-UA', rate: 0.024 },
  NGN: { symbol: '₦', name: 'Nigerian Naira', locale: 'en-NG', rate: 0.0006 },
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

  describe('Math.js Functions, Constants, and Units Across Settings Profiles', () => {
    const toCommaLocaleExpr = (expr) =>
      expr
        .replace(/\[([^[\]"']*;[^[\]"']*)\]/g, (_, inner) => {
          return (
            '[[' +
            inner
              .split(';')
              .map((s) => s.trim())
              .join('], [') +
            ']]'
          )
        })
        .split(/("(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*')/g)
        .map((seg, idx) => {
          if (idx % 2 === 1) return seg

          return seg
            .replace(/,/g, ';')
            .replace(/(?<![\w.])(\d+)\.(\d+)(?![\d.])/g, '$1,$2')
            .replace(/(?<![\w.\d])\.(\d+)(?![\d.])/g, '0,$1')
        })
        .join('')

    const profiles = [
      {
        name: 'numberFormat: 1 234.56 with copyThouSep: true',
        settings: { ...defaultSettings, numberFormat: '1 234.56', thouSep: true, copyThouSep: true }
      },
      {
        name: 'numberFormat: 1.234,56 with copyThouSep: true',
        settings: { ...defaultSettings, numberFormat: '1.234,56', thouSep: true, copyThouSep: true },
        transform: toCommaLocaleExpr
      },
      {
        name: 'numberFormat: 1 234,56 with copyThouSep: true',
        settings: { ...defaultSettings, numberFormat: '1 234,56', thouSep: true, copyThouSep: true },
        transform: toCommaLocaleExpr
      },
      {
        name: 'numberFormat: 1 234,56 with thouSep: false',
        settings: { ...defaultSettings, numberFormat: '1 234,56', thouSep: false, copyThouSep: false },
        transform: toCommaLocaleExpr
      },
      {
        name: 'matrixType: Array',
        settings: { ...defaultSettings, matrixType: 'Array' }
      },
      {
        name: 'numericOutput: BigNumber',
        settings: { ...defaultSettings, numericOutput: 'BigNumber' }
      },
      {
        name: 'numericOutput: Fraction',
        settings: { ...defaultSettings, numericOutput: 'Fraction' }
      },
      {
        name: 'predictable: true',
        settings: { ...defaultSettings, predictable: true }
      },
      {
        name: 'notation: fixed, precision: 2, copyThouSep: true',
        settings: { ...defaultSettings, notation: 'fixed', precision: '2', thouSep: true, copyThouSep: true }
      },
      {
        name: 'notation: exponential, precision: 3',
        settings: { ...defaultSettings, notation: 'exponential', precision: '3' }
      },
      {
        name: 'notation: engineering, precision: 3',
        settings: { ...defaultSettings, notation: 'engineering', precision: '3' }
      },
      {
        name: 'combined: BigNumber + Array + 1 234,56 + fixed + copyThouSep',
        settings: {
          ...defaultSettings,
          numericOutput: 'BigNumber',
          matrixType: 'Array',
          numberFormat: '1 234,56',
          notation: 'fixed',
          precision: '3',
          thouSep: true,
          copyThouSep: true
        },
        transform: toCommaLocaleExpr
      },
      {
        name: 'combined: Fraction + Array + predictable + 1.234,56 + thouSep: false',
        settings: {
          ...defaultSettings,
          numericOutput: 'Fraction',
          matrixType: 'Array',
          predictable: true,
          numberFormat: '1.234,56',
          thouSep: false
        },
        transform: toCommaLocaleExpr
      }
    ]

    const unitLines = []

    for (const unit of units) {
      let expr = `10 ${unit}`

      try {
        standardMath.evaluate(expr)
        unitLines.push(expr)
      } catch {
        if (unit === 'celsius' || unit === 'kelvin' || unit === 'fahrenheit') {
          unitLines.push('10 degC')
        }
      }
    }

    for (const profile of profiles) {
      it(`should evaluate all Math.js functions, constants, and units under profile (${profile.name})`, () => {
        const items = [
          ...functions.filter((fn) => !SKIPPED_FUNCTIONS.has(fn.name)),
          ...constants,
          { name: 'all-units', examples: unitLines }
        ]
        const copyGrouping = Boolean(profile.settings.thouSep && profile.settings.copyThouSep)

        standardMath.config({
          matrix: profile.settings.matrixType,
          number: profile.settings.numericOutput,
          predictable: profile.settings.predictable
        })

        for (const item of items) {
          const standardScope = {}

          const standardAnswers = item.examples.map((expr) => {
            try {
              const val = standardMath.evaluate(expr, standardScope)
              const formatted =
                val !== undefined && val !== null
                  ? formatAnswer(val, copyGrouping, profile.settings, mockCurrencies)
                  : ''

              return { answer: formatted }
            } catch (e) {
              return { error: e.message }
            }
          })

          const lines = profile.transform ? item.examples.map(profile.transform) : item.examples
          const pageId = `test-profile-${profile.name}-${item.name}`
          const numaraResult = runCalculation({
            activePage: pageId,
            lines,
            settings: profile.settings,
            currencies: mockCurrencies
          })

          for (let i = 0; i < lines.length; i++) {
            const expr = lines[i]
            const std = standardAnswers[i]
            const num = extractAnswer(numaraResult.answers[i])

            if (std.error) {
              if (num.error) continue

              assert.fail(
                `[${profile.name}] (${item.name}) Expected error "${std.error}" but got "${num.answer}" for "${expr}"`
              )
            } else if (!num.isPlot) {
              if (num.error) {
                if (expr.includes(':') && num.error.includes('Unexpected operator }')) continue

                assert.fail(
                  `[${profile.name}] (${item.name}) Expression "${expr}" failed with "${num.error}" (expected "${std.answer}")`
                )
              } else if (std.answer !== num.answer) {
                const stdNum = parseLocaleNumber(std.answer, profile.settings)
                const numNum = parseLocaleNumber(num.answer, profile.settings)

                if (!isNaN(stdNum) && !isNaN(numNum) && Math.abs(stdNum - numNum) < 1e-4) continue

                assert.strictEqual(
                  num.answer,
                  std.answer,
                  `[${profile.name}] (${item.name}) Value mismatch for "${expr}"`
                )
              }
            }
          }
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
        } else {
          applyUdfu(true, '')
        }
        if (testCase.udu) {
          applyUdfu(false, testCase.udu)
        } else {
          applyUdfu(false, '')
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
          pages: testCase.pages || [],
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

    it('should restore built-in functions and units when user-defined overrides are removed', () => {
      applyUdfu(true, 'sqrt: (x) => 42')
      let res = runCalculation({
        activePage: 'test-udf-override',
        lines: ['sqrt(4)'],
        settings: defaultSettings,
        currencies: mockCurrencies
      })
      assert.strictEqual(extractAnswer(res.answers[0]).answer, '42')

      applyUdfu(true, '')
      res = runCalculation({
        activePage: 'test-udf-override',
        lines: ['sqrt(4)'],
        settings: defaultSettings,
        currencies: mockCurrencies
      })
      assert.strictEqual(extractAnswer(res.answers[0]).answer, '2')
    })

    it('should escape HTML and prevent user objects with _pageId from spoofing page links', () => {
      const res = runCalculation({
        activePage: 'test-page-spoof',
        lines: ['f() = ["<b>pwn</b>"]', 'o = {_pageId: 1, format: f}'],
        settings: defaultSettings,
        currencies: mockCurrencies
      })
      assert.ok(!res.answers[1].includes('<b>pwn</b>'), 'Raw HTML tag should not appear unescaped in output')
      assert.ok(!res.answers[1].includes('pageLink'), 'User object must not render as a pageLink')
    })

    it('should not expose BigNumber internal properties in scopeProperties', () => {
      const res = runCalculation({
        activePage: 'test-bignum-props',
        lines: ['x = 5'],
        settings: { ...defaultSettings, numericOutput: 'BigNumber' },
        currencies: mockCurrencies
      })
      assert.strictEqual(res.scopeProperties.x, undefined)
    })

    it('should accurately update incremental line cache when editing a middle line', () => {
      const pageId = 'test-incremental-cache'
      const firstRun = runCalculation({
        activePage: pageId,
        lines: ['a = 10', 'b = 20', 'a + b', 'total'],
        settings: defaultSettings,
        currencies: mockCurrencies
      })
      assert.deepStrictEqual(
        firstRun.answers.map((h) => extractAnswer(h).answer),
        ['10', '20', '30', '60']
      )

      const secondRun = runCalculation({
        activePage: pageId,
        lines: ['a = 10', 'b = 50', 'a + b', 'total'],
        settings: defaultSettings,
        currencies: mockCurrencies
      })
      assert.deepStrictEqual(
        secondRun.answers.map((h) => extractAnswer(h).answer),
        ['10', '50', '60', '120']
      )
    })

    it('should isolate cached objects and matrices from in-place mutations across runs', () => {
      const pageId = 'test-cache-mutation-isolation'
      const run1 = runCalculation({
        activePage: pageId,
        lines: ['o = {x: 1}', 'o.x = 99', 'o.x', 'm = [10, 20]', 'm[1] = 77', 'm[1]'],
        settings: defaultSettings,
        currencies: mockCurrencies
      })
      assert.deepStrictEqual(
        run1.answers.map((h) => extractAnswer(h).answer),
        ['{"x": 1}', '99', '99', '[10, 20]', '77', '77']
      )

      // Hit cache on lines 0..5 and evaluate a new line 6
      const run2 = runCalculation({
        activePage: pageId,
        lines: ['o = {x: 1}', 'o.x = 99', 'o.x + 1', 'm = [10, 20]', 'm[1] = 77', 'm[1] + 1'],
        settings: defaultSettings,
        currencies: mockCurrencies
      })
      assert.deepStrictEqual(
        run2.answers.map((h) => extractAnswer(h).answer),
        ['{"x": 1}', '99', '100', '[10, 20]', '77', '78']
      )

      // Replace the mutating lines; line 0 and line 3 come from cache and must NOT retain 99 or 77
      const run3 = runCalculation({
        activePage: pageId,
        lines: ['o = {x: 1}', '1 + 1', 'o.x', 'm = [10, 20]', '2 + 2', 'm[1]'],
        settings: defaultSettings,
        currencies: mockCurrencies
      })
      assert.deepStrictEqual(
        run3.answers.map((h) => extractAnswer(h).answer),
        ['{"x": 1}', '2', '1', '[10, 20]', '4', '10']
      )
    })

    it('should update lowercase currency unit aliases when exchange rates change', () => {
      const pageId = 'test-lowercase-currency-update'
      const ratesA = {
        ...mockCurrencies,
        EUR: { symbol: '€', name: 'Euro', rate: 1.2 }
      }
      const ratesB = {
        ...mockCurrencies,
        EUR: { symbol: '€', name: 'Euro', rate: 2.0 }
      }

      const resA = runCalculation({
        activePage: pageId,
        lines: ['10 eur in usd', '10 EUR in USD'],
        settings: { ...defaultSettings, currency: false },
        currencies: ratesA
      })
      assert.deepStrictEqual(
        resA.answers.map((h) => extractAnswer(h).answer),
        ['12 usd', '12 USD']
      )

      const resB = runCalculation({
        activePage: pageId,
        lines: ['10 eur in usd', '10 EUR in USD'],
        settings: { ...defaultSettings, currency: false },
        currencies: ratesB
      })
      assert.deepStrictEqual(
        resB.answers.map((h) => extractAnswer(h).answer),
        ['20 usd', '20 USD']
      )
    })

    it('should not flatten plain UDF objects onto built-in math functions and should include UDU aliases', () => {
      applyUdfu(true, 'ns: { sqrt: 999, base: 25 }')
      applyUdfu(false, 'myunit: { definition: "2 m", aliases: ["myu"] }')

      const res = runCalculation({
        activePage: 'test-udf-plain-obj',
        lines: ['sqrt(16)', 'ns.sqrt', 'ns.base', '3 myu in m'],
        settings: defaultSettings,
        currencies: mockCurrencies
      })
      assert.deepStrictEqual(
        res.answers.map((h) => extractAnswer(h).answer),
        ['4', '999', '25', '6 m']
      )
      assert.ok(res.uduList.includes('myunit') && res.uduList.includes('myu'))

      applyUdfu(true, '')
      applyUdfu(false, '')
    })

    it('should parse locale-formatted numbers with explicit settings and reject non-numeric strings', () => {
      const euroSettings = { ...defaultSettings, numberFormat: '1.234,56', thouSep: true }
      const spaceDotSettings = { ...defaultSettings, numberFormat: '1 234.56', thouSep: true }
      const spaceCommaSettings = { ...defaultSettings, numberFormat: '1 234,56', thouSep: true }
      assert.strictEqual(parseLocaleNumber('1.500,25', euroSettings), 1500.25)
      assert.strictEqual(parseLocaleNumber('1.500', euroSettings), 1500)
      assert.strictEqual(parseLocaleNumber('1 500.25', spaceDotSettings), 1500.25)
      assert.strictEqual(parseLocaleNumber('1 500,25', spaceCommaSettings), 1500.25)
      assert.ok(Number.isNaN(parseLocaleNumber('10 km', euroSettings)))
      assert.ok(Number.isNaN(parseLocaleNumber('2026-11-03', euroSettings)))
    })

    it('should respect copyThouSep when formatting data-answer vs displayed text', () => {
      const withoutCopySep = runCalculation({
        activePage: 'test-copy-thou-sep-off',
        lines: ['1234567.89', '0.12345 in %'],
        settings: { ...defaultSettings, thouSep: true, copyThouSep: false },
        currencies: mockCurrencies
      })
      assert.strictEqual(withoutCopySep.answers[0], '<span class="answer" data-answer="1234567.89">1,234,567.89</span>')

      const withCopySep = runCalculation({
        activePage: 'test-copy-thou-sep-on',
        lines: ['1234567.89', '12.34567 in %'],
        settings: { ...defaultSettings, thouSep: true, copyThouSep: true },
        currencies: mockCurrencies
      })
      assert.strictEqual(withCopySep.answers[0], '<span class="answer" data-answer="1,234,567.89">1,234,567.89</span>')
      assert.strictEqual(withCopySep.answers[1], '<span class="answer" data-answer="1,234.567%">1,234.567%</span>')

      const spaceCommaOff = runCalculation({
        activePage: 'test-space-comma-copy-off',
        lines: ['1 234 567,89', '$1 234,56', '1 234,5 days'],
        settings: { ...defaultSettings, numberFormat: '1 234,56', thouSep: true, copyThouSep: false },
        currencies: mockCurrencies
      })
      assert.strictEqual(spaceCommaOff.answers[0], '<span class="answer" data-answer="1234567,89">1 234 567,89</span>')
      assert.strictEqual(spaceCommaOff.answers[1], '<span class="answer" data-answer="$1234,56">$1 234,56</span>')
      assert.strictEqual(spaceCommaOff.answers[2], '<span class="answer" data-answer="1234,5 days">1 234,5 days</span>')

      const spaceDotOn = runCalculation({
        activePage: 'test-space-dot-copy-on',
        lines: ['1 234 567.89', '$1 234.56', '1 234.5 days'],
        settings: { ...defaultSettings, numberFormat: '1 234.56', thouSep: true, copyThouSep: true },
        currencies: mockCurrencies
      })
      assert.strictEqual(spaceDotOn.answers[0], '<span class="answer" data-answer="1 234 567.89">1 234 567.89</span>')
      assert.strictEqual(spaceDotOn.answers[1], '<span class="answer" data-answer="$1 234.56">$1 234.56</span>')
      assert.strictEqual(spaceDotOn.answers[2], '<span class="answer" data-answer="1 234.5 days">1 234.5 days</span>')

      const dotCommaOff = runCalculation({
        activePage: 'test-dot-comma-copy-off',
        lines: ['1.234.567,89', '$1.234,56', '1.234,5 days'],
        settings: { ...defaultSettings, numberFormat: '1.234,56', thouSep: true, copyThouSep: false },
        currencies: mockCurrencies
      })
      assert.strictEqual(dotCommaOff.answers[0], '<span class="answer" data-answer="1234567,89">1.234.567,89</span>')
      assert.strictEqual(dotCommaOff.answers[1], '<span class="answer" data-answer="$1234,56">$1.234,56</span>')
      assert.strictEqual(dotCommaOff.answers[2], '<span class="answer" data-answer="1234,5 days">1.234,5 days</span>')

      const thouSepOffWithCopyOn = runCalculation({
        activePage: 'test-thou-sep-off-copy-on',
        lines: ['1 234 567.89', '$1 234.56'],
        settings: { ...defaultSettings, numberFormat: '1 234.56', thouSep: false, copyThouSep: true },
        currencies: mockCurrencies
      })
      assert.strictEqual(
        thouSepOffWithCopyOn.answers[0],
        '<span class="answer" data-answer="1234567.89">1234567.89</span>'
      )
      assert.strictEqual(thouSepOffWithCopyOn.answers[1], '<span class="answer" data-answer="$1234.56">$1234.56</span>')
    })

    it('should migrate legacy v7 settings and preserve valid v8 numberFormat and dateFormat values', () => {
      const storage = new Map()
      const prevLocalStorage = globalThis.localStorage
      globalThis.localStorage = {
        getItem: (k) => (storage.has(k) ? storage.get(k) : null),
        setItem: (k, v) => storage.set(k, String(v)),
        removeItem: (k) => storage.delete(k)
      }

      try {
        const legacyComma = { thouSep: 'comma', inputLocale: true, dateFormat: 'de-DE', pageListPosition: 'slide' }
        assert.strictEqual(migrateFromV7(legacyComma), true)
        assert.strictEqual(legacyComma.numberFormat, '1.234,56')
        assert.strictEqual(legacyComma.thouSep, true)
        assert.strictEqual(legacyComma.inputLocale, undefined)
        assert.strictEqual(legacyComma.dateFormat, 'dd/MM/yyyy')
        assert.strictEqual(legacyComma.pageListPosition, 'float')

        const legacyDisabled = { locale: 'disabled', dateFormat: 'sv-SE' }
        assert.strictEqual(migrateFromV7(legacyDisabled), true)
        assert.strictEqual(legacyDisabled.numberFormat, '1,234.56')
        assert.strictEqual(legacyDisabled.thouSep, false)
        assert.strictEqual(legacyDisabled.locale, undefined)
        assert.strictEqual(legacyDisabled.dateFormat, 'yyyy-MM-dd')

        const validSpaceFormat = {
          numberFormat: '1 234,56',
          thouSep: 'period',
          dateFormat: 'MM/dd/yyyy',
          fontSize: '1.1rem',
          lineHeight: '2em'
        }
        assert.strictEqual(migrateFromV7(validSpaceFormat), true)
        assert.strictEqual(validSpaceFormat.numberFormat, '1 234,56')
        assert.strictEqual(validSpaceFormat.thouSep, true)
        assert.strictEqual(validSpaceFormat.fontSize, '14px')
        assert.strictEqual(validSpaceFormat.lineHeight, '26px')
      } finally {
        globalThis.localStorage = prevLocalStorage
      }
    })

    it('should seamlessly migrate v7 UDF/UDU definitions, theme customizations, pages, and clean up obsolete storage', () => {
      const storage = new Map()
      const prevLocalStorage = globalThis.localStorage
      globalThis.localStorage = {
        getItem: (k) => (storage.has(k) ? storage.get(k) : null),
        setItem: (k, v) => storage.set(k, String(v)),
        removeItem: (k) => storage.delete(k)
      }

      try {
        // 1. Seed root localStorage keys and consolidated v7 keys with obsolete data
        storage.set('sideBarWidth', '280')
        storage.set('rateInterval', 'true')
        storage.set('lastPage', JSON.stringify('p2'))
        storage.set(
          'numara',
          JSON.stringify({
            rateInterval: false,
            pages: [
              {
                id: 'p1',
                name: 'Page 1',
                data: 'a = 10\na * 2',
                cursor: { line: 1, ch: 5 },
                folds: [{ from: 0, to: 1 }],
                history: { done: ['op1'], undone: [] },
                answers: ['10', '20']
              }
            ],
            saved: {
              p2: ['Migrated Saved Page', 'x = 50']
            }
          })
        )

        appState.pageHistory.clear()
        migrateStorageAndPages()

        // Root keys and obsolete consolidated keys must be cleaned up
        assert.strictEqual(storage.has('sideBarWidth'), false)
        assert.strictEqual(storage.has('rateInterval'), false)
        assert.strictEqual(storage.has('lastPage'), false)
        assert.strictEqual(store.get('sideBarWidth'), null)
        assert.strictEqual(store.get('rateInterval'), null)
        assert.strictEqual(store.get('saved'), null)
        assert.strictEqual(store.get('pageListWidth'), 280)
        assert.strictEqual(store.get('lastPage'), 'p2')

        // Pages should preserve data/cursor/folds, seed session pageHistory, and strip persisted history/answers
        const migratedPages = store.get('pages')
        assert.strictEqual(migratedPages.length, 2)
        assert.strictEqual(migratedPages[0].id, 'p1')
        assert.strictEqual(migratedPages[0].data, 'a = 10\na * 2')
        assert.deepStrictEqual(migratedPages[0].cursor, { line: 1, ch: 5 })
        assert.deepStrictEqual(migratedPages[0].folds, [{ from: 0, to: 1 }])
        assert.strictEqual('history' in migratedPages[0], false)
        assert.strictEqual('answers' in migratedPages[0], false)
        assert.deepStrictEqual(appState.pageHistory.get('p1'), { done: ['op1'], undone: [] })
        assert.strictEqual(migratedPages[1].id, 'p2')
        assert.strictEqual(migratedPages[1].name, 'Migrated Saved Page')
        assert.strictEqual(migratedPages[1].data, 'x = 50')

        // 2. Migrate theme customizations: preserve custom light/dark hex values while syncing class/title metadata
        const storedColors = {
          answer: { title: 'Old Title', class: '.output', dark: '#112233', light: '#445566' },
          function: { title: 'Functions', class: '.cm-udf', dark: '#abcdef', light: '#fedcba' }
        }
        const defaultColors = {
          answer: { title: 'Answers', class: '.answer', dark: '#1eb5f0', light: '#17586b' },
          function: {
            title: 'Functions',
            class: '.cm-formulajs, .cm-function, .cm-nerdamer, .cm-udf, .cm-datetime',
            dark: '#cb82f5',
            light: '#6f42c1'
          }
        }
        assert.strictEqual(migrateColors(storedColors, defaultColors), true)
        assert.strictEqual(storedColors.answer.title, 'Answers')
        assert.strictEqual(storedColors.answer.class, '.answer')
        assert.strictEqual(storedColors.answer.dark, '#112233')
        assert.strictEqual(storedColors.answer.light, '#445566')
        assert.strictEqual(
          storedColors.function.class,
          '.cm-formulajs, .cm-function, .cm-nerdamer, .cm-udf, .cm-datetime'
        )
        assert.strictEqual(storedColors.function.dark, '#abcdef')

        // 3. Migrate legacy v7 UDF and UDU strings into structured items, compile, and evaluate
        const legacyUdfStr = `
          double: x => x * 2,
          mulGroups: (a, b) => (a + 1) * (b + 1),
          zeroArg: () => luxon.fromObject({ year: 2026, month: 1 }).daysInMonth,
          mySum: (a, b) => formulajs.SUM(a, b),
          mySolve: (expr) => nerdamer(expr).solveFor("x").toString(),
          methodStyle(a, b) { return a + b },
          sk: { BaseCarry: 300, SteedStone: 100, Necromage: 1.25 },
          myConst: 42
        `
        const legacyUduStr = `
          foo: "18 foot",
          bar: { definition: "40 rod", prefixes: "long", aliases: ["bars", "br"] }
        `
        const udfItems = parseLegacyUdf(legacyUdfStr, standardMath)
        const uduItems = parseLegacyUdu(legacyUduStr, standardMath)

        assert.strictEqual(udfItems.length, 8)
        assert.strictEqual(uduItems.length, 2)
        assert.strictEqual(udfItems.find((i) => i.name === 'zeroArg').params, '()')
        assert.strictEqual(udfItems.find((i) => i.name === 'mulGroups').body, '(a + 1) * (b + 1)')

        const compiledUdf = compileUdfItems(udfItems)
        const compiledUdu = compileUduItems(uduItems)

        applyUdfu(true, compiledUdf)
        applyUdfu(false, compiledUdu)

        const calcRes = runCalculation({
          activePage: 'test-migrated-udfu',
          lines: [
            'double(5)',
            'mulGroups(2, 3)',
            'zeroArg()',
            'mySum(10, 15)',
            'mySolve("x^2 = 16")',
            'methodStyle(7, 8)',
            'sk.BaseCarry + sk.SteedStone * sk.Necromage',
            'myConst',
            '1 foo in foot',
            '1 br in rod'
          ],
          settings: defaultSettings,
          currencies: mockCurrencies
        })

        assert.deepStrictEqual(
          calcRes.answers.map((h) => extractAnswer(h).answer),
          ['10', '12', '31', '25', '4,-4', '15', '425', '42', '18 foot', '40 rod']
        )

        applyUdfu(true, '')
        applyUdfu(false, '')
      } finally {
        globalThis.localStorage = prevLocalStorage
      }
    })

    it('should control error link text via lineErrors setting while always recording errorLines', () => {
      const shown = runCalculation({
        activePage: 'test-line-errors-on',
        lines: ['10', 'unknown_symbol'],
        settings: { ...defaultSettings, lineErrors: true },
        currencies: mockCurrencies
      })
      assert.deepStrictEqual(shown.errorLines, [1])
      assert.ok(shown.answers[1].includes('>Error</a>'))

      const hidden = runCalculation({
        activePage: 'test-line-errors-off',
        lines: ['10', 'unknown_symbol'],
        settings: { ...defaultSettings, lineErrors: false },
        currencies: mockCurrencies
      })
      assert.deepStrictEqual(hidden.errorLines, [1])
      assert.ok(hidden.answers[1].includes('></a'))
    })

    it('should render plotButton markup for functions of x and detect self-referential page() calls', () => {
      const plotRes = runCalculation({
        activePage: 'test-plot-and-self-page',
        lines: ['f(x) = sin(x)', 'page("SelfPage")'],
        pages: [{ id: 'test-plot-and-self-page', name: 'SelfPage', data: 'a = 1' }],
        settings: defaultSettings,
        currencies: mockCurrencies
      })
      const parsedPlot = extractAnswer(plotRes.answers[0])
      assert.strictEqual(parsedPlot.isPlot, true)
      assert.strictEqual(parsedPlot.answer, 'f(x) = sin(x)')

      const selfPageErr = extractAnswer(plotRes.answers[1])
      assert.match(selfPageErr.error, /Circular reference detected: "SelfPage"/)
    })

    it('should reject reserved prototype pollution keys, invalid identifiers, and invalid unit aliases in UDF/UDU', () => {
      const state = { previouslyImportedUDFs: [], previouslyCreatedUnits: [] }

      assert.throws(
        () => applyUdfuToMath(standardMath, 'constructor: () => 1', true, state),
        /Reserved key not allowed/
      )
      assert.throws(() => applyUdfuToMath(standardMath, 'prototype: () => 1', true, state), /Reserved key not allowed/)
      assert.throws(() => applyUdfuToMath(standardMath, '"bad-key": () => 1', true, state), /Invalid identifier/)
      assert.throws(
        () => applyUdfuToMath(standardMath, 'u1: { definition: "1 m", aliases: ["bad-alias"] }', false, state),
        /Invalid unit alias/
      )
      assert.throws(
        () => applyUdfuToMath(standardMath, 'u2: { definition: "1 m", aliases: ["constructor"] }', false, state),
        /Invalid unit alias/
      )
    })

    it('should sanitize filenames, escape HTML/RegExp, strip comments safely, and support debounce flush/cancel', async () => {
      assert.strictEqual(getSafeFilename('My:Page*Name?.num... '), 'My-Page-Name-.num')
      assert.strictEqual(getSafeFilename('   ...   '), 'Untitled')
      assert.strictEqual(escapeHTML('<script>"\'&'), '&lt;script&gt;&quot;&#39;&amp;')
      assert.strictEqual(escapeRegExp('$100.00 (USD)*'), '\\$100\\.00 \\(USD\\)\\*')
      assert.strictEqual(stripComments('a = "http://x.com#1" // comment'), 'a = "http://x.com#1" ')

      let count = 0
      const fn = debounce(() => {
        count++
      }, 50)

      fn()
      fn.flush()
      assert.strictEqual(count, 1)

      fn()
      fn.cancel()
      await new Promise((r) => setTimeout(r, 70))
      assert.strictEqual(count, 1)
    })

    it('should detect external file renames in sync directory and prioritize active page on content tie', () => {
      const pages = [
        { id: 'p1', name: 'Page 1', data: '' },
        { id: 'p2', name: 'Page 2', data: '' },
        { id: 'p3', name: 'Budget', data: 'rent = 1200' }
      ]
      const lastSyncContent = new Map([
        ['page 1', ''],
        ['page 2', ''],
        ['budget', 'rent = 1200']
      ])
      const files = [
        { name: 'Page 1', content: '' },
        { name: 'Renamed Empty', content: '' },
        { name: 'Household Budget', content: 'rent = 1200' }
      ]

      const renames = detectExternalRenames({
        pages,
        files,
        lastSyncContent,
        activePageId: 'p2'
      })

      assert.strictEqual(renames.length, 2)
      assert.strictEqual(renames[0].page.id, 'p2')
      assert.strictEqual(renames[0].sanitizedName, 'Renamed Empty')
      assert.strictEqual(renames[1].page.id, 'p3')
      assert.strictEqual(renames[1].sanitizedName, 'Household Budget')
    })

    it('should detect single external file rename even when content was simultaneously edited', () => {
      const pages = [{ id: 'p1', name: 'Old Name', data: 'a = 1' }]
      const lastSyncContent = new Map([['old name', 'a = 1']])
      const files = [{ name: 'New Name', content: 'a = 2' }]

      const renames = detectExternalRenames({
        pages,
        files,
        lastSyncContent,
        activePageId: 'p1'
      })

      assert.strictEqual(renames.length, 1)
      assert.strictEqual(renames[0].page.id, 'p1')
      assert.strictEqual(renames[0].sanitizedName, 'New Name')
    })

    it('should center window on primary workArea when saved position is missing, minimized, or on a disconnected monitor', () => {
      const laptop = { workArea: { x: 0, y: 25, width: 1440, height: 875 } }
      const displays = [laptop]

      // Fresh launch with no saved position
      assert.deepStrictEqual(resolveWindowBounds({ width: 600, height: 515 }, displays, laptop), {
        x: 420,
        y: 205,
        width: 600,
        height: 515
      })

      // Disconnected right-hand monitor (issue #327)
      assert.deepStrictEqual(
        resolveWindowBounds({ position: [2200, 180], width: 600, height: 515 }, displays, laptop),
        {
          x: 420,
          y: 205,
          width: 600,
          height: 515
        }
      )

      // Barely touching right/bottom edge (5x5 px sliver, undraggable frameless window)
      assert.strictEqual(isBoundsOnScreen({ x: 1435, y: 895, width: 600, height: 515 }, displays), false)
      assert.deepStrictEqual(
        resolveWindowBounds({ position: [1435, 895], width: 600, height: 515 }, displays, laptop),
        {
          x: 420,
          y: 205,
          width: 600,
          height: 515
        }
      )

      // Windows minimized sentinel (-32000, -32000) and malformed position array
      assert.deepStrictEqual(
        resolveWindowBounds({ position: [-32000, -32000], width: 600, height: 515 }, displays, laptop),
        { x: 420, y: 205, width: 600, height: 515 }
      )
      assert.deepStrictEqual(resolveWindowBounds({ position: [100], width: 600, height: 515 }, displays, laptop), {
        x: 420,
        y: 205,
        width: 600,
        height: 515
      })
    })

    it('should preserve valid secondary monitor positions and clamp overhanging or oversized bounds into workArea', () => {
      const primary = { workArea: { x: 0, y: 25, width: 1440, height: 875 } }
      const leftExternal = { workArea: { x: -1920, y: 0, width: 1920, height: 1040 } }
      const displays = [primary, leftExternal]

      // Valid position on connected left external monitor
      const onLeft = resolveWindowBounds({ position: [-1500, 120], width: 600, height: 515 }, displays, primary)
      assert.deepStrictEqual(onLeft, { x: -1500, y: 120, width: 600, height: 515 })
      assert.strictEqual(isBoundsOnScreen(onLeft, displays), true)
      assert.strictEqual(areBoundsEqual(onLeft, { x: -1500, y: 120, width: 600, height: 515 }), true)

      // Partially overhanging right edge and tucked above menu bar on primary display -> clamped inside workArea
      assert.deepStrictEqual(resolveWindowBounds({ position: [1050, 0], width: 600, height: 515 }, displays, primary), {
        x: 840,
        y: 25,
        width: 600,
        height: 515
      })

      // Straddling two connected displays -> snaps into the display with larger overlap
      assert.deepStrictEqual(
        resolveWindowBounds({ position: [-450, 100], width: 600, height: 515 }, displays, primary),
        {
          x: -600,
          y: 100,
          width: 600,
          height: 515
        }
      )

      // Oversized dimensions from a 4K monitor reopened on a smaller laptop screen with fractional coordinates
      const smallLaptop = { workArea: { x: 0, y: 0, width: 1366, height: 728 } }
      assert.deepStrictEqual(
        resolveWindowBounds({ position: [2500.4, 300.7], width: 1800.6, height: 1100.2 }, [smallLaptop], smallLaptop),
        { x: 0, y: 0, width: 1366, height: 728 }
      )
    })

    it('should resolve optical editor font sizes across zoom levels for macOS/mobile vs Windows/Linux desktop', () => {
      assert.strictEqual(resolveEditorFontSize('14px', 'normal', true), '14px')
      assert.strictEqual(resolveEditorFontSize('14px', 'smaller', true), '13px')
      assert.strictEqual(resolveEditorFontSize('14px', 'larger', true), '15px')

      assert.strictEqual(resolveEditorFontSize('14px', 'normal', false), '13px')
      assert.strictEqual(resolveEditorFontSize('14px', 'smaller', false), '12px')
      assert.strictEqual(resolveEditorFontSize('14px', 'larger', false), '14px')
      assert.strictEqual(resolveEditorFontSize('12px', 'smaller', false), '11px')
    })

    it('should parse strict localized numbers and classify internal scope keys accurately', () => {
      assert.strictEqual(parseStrictLocaleNumber('1.234,56', { numberFormat: '1.234,56' }), 1234.56)
      assert.strictEqual(parseStrictLocaleNumber('-1 234,5e2', { numberFormat: '1 234,56' }), -123450)
      assert.ok(Number.isNaN(parseStrictLocaleNumber('123 km', { numberFormat: '1,234.56' })))
      assert.ok(Number.isNaN(parseStrictLocaleNumber('', { numberFormat: '1,234.56' })))

      assert.strictEqual(INTERNAL_SCOPE_KEYS.has('ans'), true)
      assert.strictEqual(INTERNAL_SCOPE_KEYS.has('line1'), false)
      assert.strictEqual(isInternalScopeKey('ans'), true)
      assert.strictEqual(isInternalScopeKey('today'), true)
      assert.strictEqual(isInternalScopeKey('line12'), true)
      assert.strictEqual(isInternalScopeKey('lineWidth'), false)
    })

    it('should avoid no-op store writes and invalidate cross-page scope cache when referenced pages change', () => {
      const storage = new Map()
      let setCount = 0
      const prevDesc = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
      Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        writable: true,
        value: {
          getItem: (k) => (storage.has(k) ? storage.get(k) : null),
          setItem: (k, v) => {
            setCount++
            storage.set(k, String(v))
          },
          removeItem: (k) => storage.delete(k)
        }
      })

      try {
        store.set('settings', { a: 1 })
        const writesAfterSeed = setCount

        // Removing a missing key must not rewrite localStorage
        store.remove('nonExistentObsoleteKey')
        assert.strictEqual(setCount, writesAfterSeed)

        // initStoreObject with multiple missing defaults should batch into a single store.set
        const merged = initStoreObject('settings', { a: 0, b: 2, c: 3 })
        assert.deepStrictEqual(merged, { a: 1, b: 2, c: 3 })
        assert.strictEqual(setCount, writesAfterSeed + 1)

        // Subsequent launch with all keys present must perform zero writes
        initStoreObject('settings', { a: 0, b: 2, c: 3 })
        assert.strictEqual(setCount, writesAfterSeed + 1)
      } finally {
        if (prevDesc) Object.defineProperty(globalThis, 'localStorage', prevDesc)
      }

      const pagesV1 = [
        { id: 'src', name: 'Rates', data: 'tax = 0.08' },
        { id: 'dest', name: 'Invoice', data: 'p = page("Rates")\n100 * p.tax' }
      ]
      const res1 = runCalculation({
        activePage: 'dest',
        lines: ['p = page("Rates")', '100 * p.tax'],
        pages: pagesV1,
        settings: defaultSettings,
        currencies: mockCurrencies
      })
      assert.strictEqual(extractAnswer(res1.answers[1]).answer, '8')

      // Editing active page lines while referenced page is unchanged reuses cached page scope accurately
      const res2 = runCalculation({
        activePage: 'dest',
        lines: ['p = page("Rates")', '200 * p.tax'],
        pages: pagesV1,
        settings: defaultSettings,
        currencies: mockCurrencies
      })
      assert.strictEqual(extractAnswer(res2.answers[1]).answer, '16')

      // Updating referenced page data invalidates cached page scope
      const pagesV2 = [
        { id: 'src', name: 'Rates', data: 'tax = 0.1' },
        { id: 'dest', name: 'Invoice', data: 'p = page("Rates")\n200 * p.tax' }
      ]
      const res3 = runCalculation({
        activePage: 'dest',
        lines: ['p = page("Rates")', '200 * p.tax'],
        pages: pagesV2,
        settings: defaultSettings,
        currencies: mockCurrencies
      })
      assert.strictEqual(extractAnswer(res3.answers[1]).answer, '20')
    })
  })
})
