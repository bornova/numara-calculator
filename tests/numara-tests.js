import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert'
import { create, all } from 'mathjs'
import { runCalculation, formatAnswer, applyUdfu } from '../src/js/core/evaluator.js'
import { parseLocaleNumber } from '../src/js/core/formatter.js'
import { stripComments } from '../src/js/core/preprocessor.js'
import { applyUdfuToMath } from '../src/js/core/udfu.js'
import { debounce, escapeHTML, escapeRegExp, getSafeFilename } from '../src/js/core/utils.js'
import { detectExternalRenames } from '../src/js/pages/syncPlan.js'
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
  fontSize: '1.1rem',
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
        lines: ['1 234 567,89'],
        settings: { ...defaultSettings, numberFormat: '1 234,56', thouSep: true, copyThouSep: false },
        currencies: mockCurrencies
      })
      assert.strictEqual(spaceCommaOff.answers[0], '<span class="answer" data-answer="1234567,89">1 234 567,89</span>')

      const spaceDotOn = runCalculation({
        activePage: 'test-space-dot-copy-on',
        lines: ['1 234 567.89'],
        settings: { ...defaultSettings, numberFormat: '1 234.56', thouSep: true, copyThouSep: true },
        currencies: mockCurrencies
      })
      assert.strictEqual(spaceDotOn.answers[0], '<span class="answer" data-answer="1 234 567.89">1 234 567.89</span>')
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
  })
})
