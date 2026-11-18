import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert'
import fs from 'node:fs'
import path from 'node:path'
import { build as esbuild } from 'esbuild'
import { create, all } from 'mathjs'
import { areBoundsEqual, isBoundsOnScreen, resolveWindowBounds } from '../src/electron/bounds.js'
import { INTERNAL_SCOPE_KEYS, isInternalScopeKey } from '../src/js/core/constants.js'
import { runCalculation, applyUdfu } from '../src/js/core/evaluator.js'
import { formatAnswer, parseLocaleNumber, parseStrictLocaleNumber } from '../src/js/core/formatter.js'
import { stripComments } from '../src/js/core/preprocessor.js'
import { applyUdfuToMath, compileUdfItems, compileUduItems } from '../src/js/core/udfu.js'
import { debounce, escapeHTML, escapeRegExp, getSafeFilename, isCommaDecimal } from '../src/js/core/utils.js'
import { dom, resetDomCache } from '../src/js/dom.js'
import { currencyCodeTokens, refreshCurrencyTokens } from '../src/js/editor/constants.js'
import { getSelectionLineRange, updateSelectionStats } from '../src/js/editor/stats.js'
import { detectExternalRenames } from '../src/js/pages/syncPlan.js'
import { app as appState, DEFAULT_SETTINGS } from '../src/js/state/appState.js'
import { isElectron } from '../src/js/state/env.js'
import { clearEvents, events } from '../src/js/state/events.js'
import {
  migrateAppState,
  migrateColors,
  migrateFromV7,
  migrateStorageAndPages,
  parseLegacyUdf,
  parseLegacyUdu
} from '../src/js/state/migration.js'
import { initStoreObject, store } from '../src/js/state/store.js'
import { isModalOpen, modal } from '../src/js/ui/dialogs.js'
import { customCases } from './custom-cases.js'

const defaultSettings = {
  ...DEFAULT_SETTINGS,
  contPrevLine: false, // Disabled line-continuation for pure mathematical matching
  lineErrors: true
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

function evaluateStandardLines(expressions, settings = defaultSettings, useGrouping = false) {
  const standardScope = {}

  standardMath.config({
    matrix: settings.matrixType || 'Matrix',
    number: settings.numericOutput || 'number',
    predictable: settings.predictable || false
  })

  return expressions.map((expr) => {
    try {
      const val = standardMath.evaluate(expr, standardScope)

      return {
        answer: val !== undefined && val !== null ? formatAnswer(val, useGrouping, settings, mockCurrencies) : ''
      }
    } catch (e) {
      return { error: e.message }
    }
  })
}

function parseNumericForTolerance(str, settings) {
  const localized = parseLocaleNumber(str, settings)

  if (!Number.isNaN(localized)) {
    return localized
  }

  return !isCommaDecimal(settings) ? parseFloat(str) : NaN
}

function compareStandardAndNumara(
  expressions,
  standardAnswers,
  {
    pageId,
    pages = [],
    settings = defaultSettings,
    transform,
    allowPlot = false,
    warmUp = false,
    contextLabel = '',
    collectErrors = false
  }
) {
  if (warmUp) {
    runCalculation({ activePage: pageId, lines: [], settings, currencies: mockCurrencies })
  }

  const lines = transform ? expressions.map(transform) : expressions
  const numaraResult = runCalculation({
    activePage: pageId,
    lines,
    pages,
    settings,
    currencies: mockCurrencies
  })
  const prefix = contextLabel ? `${contextLabel} ` : ''
  const errors = []
  const reportFailure = (msg) => {
    if (collectErrors) {
      errors.push(msg)
    } else {
      assert.fail(msg)
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const expr = lines[i]
    const std = standardAnswers[i]
    const num = extractAnswer(numaraResult.answers[i])

    if (std.error) {
      if (num.error) continue

      reportFailure(
        `${prefix}Expected standard error: "${std.error}" but got successful Numara answer: "${num.answer}" for expression "${expr}"`
      )
    } else if (!allowPlot || !num.isPlot) {
      if (num.error) {
        reportFailure(
          `${prefix}Expression "${expr}" failed in Numara with error: "${num.error}" (MathJS expected: "${std.answer}")`
        )
      } else if (std.answer !== num.answer) {
        const stdNum = parseNumericForTolerance(std.answer, settings)
        const numNum = parseNumericForTolerance(num.answer, settings)

        if (!isNaN(stdNum) && !isNaN(numNum) && Math.abs(stdNum - numNum) < 1e-4) continue

        const mismatchMsg = `${prefix}Value mismatch for expression: "${expr}" (got "${num.answer}", expected "${std.answer}")`

        if (collectErrors) {
          errors.push(mismatchMsg)
        } else {
          assert.strictEqual(num.answer, std.answer, mismatchMsg)
        }
      }
    }
  }

  return errors
}

function assertMatchesStandardMath(expressions, options) {
  const standardAnswers = evaluateStandardLines(
    expressions,
    options.standardSettings ?? options.settings,
    options.useGrouping
  )

  compareStandardAndNumara(expressions, standardAnswers, options)
}

function withMockLocalStorage(fn) {
  const storage = new Map()
  const stats = { setCount: 0 }
  const prevDesc = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')

  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    writable: true,
    value: {
      getItem: (k) => (storage.has(k) ? storage.get(k) : null),
      setItem: (k, v) => {
        stats.setCount++
        storage.set(k, String(v))
      },
      removeItem: (k) => storage.delete(k)
    }
  })

  try {
    return fn(storage, stats)
  } finally {
    if (prevDesc) {
      Object.defineProperty(globalThis, 'localStorage', prevDesc)
    } else {
      delete globalThis.localStorage
    }
  }
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
        assertMatchesStandardMath(fn.examples, {
          pageId: `test-Function-${fn.name}`,
          allowPlot: true,
          warmUp: true
        })
      })
    }
  })

  describe('Math.js Constants', () => {
    for (const cn of constants) {
      it(`should evaluate examples for constant: ${cn.name}`, () => {
        assertMatchesStandardMath(cn.examples, {
          pageId: `test-Constant-${cn.name}`,
          warmUp: true
        })
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
        assertMatchesStandardMath([finalExpr], {
          pageId: `test-Unit-${unit}`,
          warmUp: true
        })
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

        for (const item of items) {
          assertMatchesStandardMath(item.examples, {
            pageId: `test-profile-${profile.name}-${item.name}`,
            settings: profile.settings,
            useGrouping: copyGrouping,
            transform: profile.transform,
            allowPlot: true,
            contextLabel: `[${profile.name}] (${item.name})`
          })
        }
      })
    }
  })

  describe('Custom Test Cases', () => {
    for (const testCase of customCases) {
      it(`should evaluate custom case: "${testCase.name}"`, () => {
        const caseSettings = { ...defaultSettings, ...(testCase.settings || {}) }

        applyUdfu(true, testCase.udf || '')
        applyUdfu(false, testCase.udu || '')

        const pageId = `test-Custom-${testCase.name}`
        let errors = []

        if (testCase.expected) {
          runCalculation({ activePage: pageId, lines: [], settings: caseSettings, currencies: mockCurrencies })

          const numaraResult = runCalculation({
            activePage: pageId,
            lines: testCase.expressions,
            pages: testCase.pages || [],
            settings: caseSettings,
            currencies: mockCurrencies
          })

          for (let i = 0; i < testCase.expressions.length; i++) {
            const expr = testCase.expressions[i]
            const num = extractAnswer(numaraResult.answers[i])
            const expVal = testCase.expected[i]
            const answerValue = num.answer !== undefined ? num.answer : num.error
            const isMatch = expVal instanceof RegExp ? expVal.test(answerValue) : String(expVal) === answerValue

            if (!isMatch) {
              errors.push(
                `Expected value matching "${expVal}" but got "${num.answer || num.error}" for expression "${expr}"`
              )
            }
          }
        } else {
          const standardAnswers = evaluateStandardLines(testCase.expressions, defaultSettings, false)

          errors = compareStandardAndNumara(testCase.expressions, standardAnswers, {
            pageId,
            pages: testCase.pages || [],
            settings: caseSettings,
            warmUp: true,
            collectErrors: true
          })
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

    it('should update lowercase currency unit aliases when exchange rates change and toggle rate conversion dynamically', () => {
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
        lines: ['10 eur in usd', '10 EUR in USD', '12 usd in eur'],
        settings: defaultSettings,
        currencies: ratesA
      })
      assert.deepStrictEqual(
        resA.answers.map((h) => extractAnswer(h).answer),
        ['$12.00', '$12.00', '€10.00']
      )

      const resB = runCalculation({
        activePage: pageId,
        lines: ['10 eur in usd', '10 EUR in USD', '12 usd in eur'],
        settings: defaultSettings,
        currencies: ratesB
      })
      assert.deepStrictEqual(
        resB.answers.map((h) => extractAnswer(h).answer),
        ['$20.00', '$20.00', '€6.00']
      )

      const disabledRes = runCalculation({
        activePage: 'test-currency-toggle',
        lines: ['$10 + $5', '10 eur + 5 eur', '10 eur in usd'],
        settings: { ...defaultSettings, currency: false },
        currencies: ratesB
      })
      assert.deepStrictEqual(disabledRes.errorLines, [2])
      assert.strictEqual(extractAnswer(disabledRes.answers[0]).answer, '$15.00')
      assert.strictEqual(extractAnswer(disabledRes.answers[1]).answer, '€15.00')

      const reEnabledRes = runCalculation({
        activePage: 'test-currency-toggle',
        lines: ['$10 + $5', '10 eur + 5 eur', '10 eur in usd'],
        settings: defaultSettings,
        currencies: ratesB
      })
      assert.deepStrictEqual(reEnabledRes.errorLines, [])
      assert.strictEqual(extractAnswer(reEnabledRes.answers[2]).answer, '$20.00')

      const reDisabledRes = runCalculation({
        activePage: 'test-currency-toggle',
        lines: ['$10 + $5', '10 eur + 5 eur', '25 hours * 50 eur/hr', '10 eur in usd'],
        settings: { ...defaultSettings, currency: false },
        currencies: ratesB
      })
      assert.deepStrictEqual(reDisabledRes.errorLines, [3])
      assert.strictEqual(extractAnswer(reDisabledRes.answers[0]).answer, '$15.00')
      assert.strictEqual(extractAnswer(reDisabledRes.answers[1]).answer, '€15.00')
      assert.strictEqual(extractAnswer(reDisabledRes.answers[2]).answer, '€1250.00')
      assert.strictEqual(reDisabledRes.answers[2].replace(/<\/?[^>]+(>|$)/g, '').trim(), '€1,250.00')
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
      const legacyComma = { thouSep: 'comma', inputLocale: false, dateFormat: 'de-DE', pageListPosition: 'slide' }
      assert.strictEqual(migrateFromV7(legacyComma), true)
      assert.strictEqual(legacyComma.numberFormat, '1.234,56')
      assert.strictEqual(legacyComma.thouSep, true)
      assert.strictEqual(legacyComma.inputLocale, undefined)
      assert.strictEqual(legacyComma.dateFormat, 'dd/MM/yyyy')
      assert.strictEqual(legacyComma.pageListPosition, 'float')

      const legacyPeriod = {
        thouSep: 'period',
        inputLocale: false,
        dateFormat: 'system',
        systemLocale: 'en-US'
      }
      assert.strictEqual(migrateFromV7(legacyPeriod), true)
      assert.strictEqual(legacyPeriod.numberFormat, '1,234.56')
      assert.strictEqual(legacyPeriod.thouSep, true)
      assert.strictEqual(legacyPeriod.dateFormat, 'MM/dd/yyyy')

      const legacyFrench = { thouSep: 'system', inputLocale: false, systemLocale: 'fr-FR' }
      assert.strictEqual(migrateFromV7(legacyFrench), true)
      assert.strictEqual(legacyFrench.numberFormat, '1 234,56')
      assert.strictEqual(legacyFrench.thouSep, true)

      const legacyPolish = { thouSep: 'system', inputLocale: false, systemLocale: 'pl-PL' }
      assert.strictEqual(migrateFromV7(legacyPolish), true)
      assert.strictEqual(legacyPolish.numberFormat, '1 234,56')
      assert.strictEqual(legacyPolish.thouSep, true)

      const legacyGerman = { thouSep: 'system', inputLocale: false, systemLocale: 'de-DE' }
      assert.strictEqual(migrateFromV7(legacyGerman), true)
      assert.strictEqual(legacyGerman.numberFormat, '1.234,56')
      assert.strictEqual(legacyGerman.thouSep, true)

      const legacyDisabled = { thouSep: 'disabled', inputLocale: false, dateFormat: 'sv-SE' }
      assert.strictEqual(migrateFromV7(legacyDisabled), true)
      assert.strictEqual(legacyDisabled.numberFormat, '1,234.56')
      assert.strictEqual(legacyDisabled.thouSep, false)
      assert.strictEqual(legacyDisabled.dateFormat, 'yyyy-MM-dd')

      const lineHeightTiers = [
        ['16px', '17px'],
        ['20px', '21px'],
        ['24px', '26px'],
        ['28px', '30px'],
        ['32px', '34px']
      ]
      for (const [oldLh, expectedLh] of lineHeightTiers) {
        const s = { lineHeight: oldLh }
        assert.strictEqual(migrateFromV7(s), true)
        assert.strictEqual(s.lineHeight, expectedLh)
      }

      const fontSizeTiers = [
        ['0.9rem', '12px'],
        ['1.1rem', '14px'],
        ['1.3rem', '16px']
      ]
      for (const [oldFs, expectedFs] of fontSizeTiers) {
        const s = { fontSize: oldFs }
        assert.strictEqual(migrateFromV7(s), true)
        assert.strictEqual(s.fontSize, expectedFs)
      }

      const validSpaceFormat = {
        numberFormat: '1 234,56',
        thouSep: 'period',
        dateFormat: 'MM/dd/yyyy',
        notation: 'legacyMode'
      }
      assert.strictEqual(migrateFromV7(validSpaceFormat), true)
      assert.strictEqual(validSpaceFormat.numberFormat, '1 234,56')
      assert.strictEqual(validSpaceFormat.thouSep, true)
      assert.strictEqual('notation' in validSpaceFormat, false)
    })

    it('should seamlessly migrate v7 UDF/UDU definitions, theme customizations, pages, and clean up obsolete storage', () => {
      withMockLocalStorage((storage) => {
        // Default v7 sideBarWidth (240) should not override v8 default (265); widths below 210 should clamp
        storage.set('numara', JSON.stringify({ sideBarWidth: 240 }))
        migrateStorageAndPages()
        assert.strictEqual(store.get('pageListWidth'), null)

        storage.clear()
        storage.set('numara', JSON.stringify({ sideBarWidth: 180 }))
        migrateStorageAndPages()
        assert.strictEqual(store.get('pageListWidth'), 210)

        // End-to-end single-entry migrateAppState() across v7 store keys
        const defaultColors = {
          answer: { title: 'Answers', class: '.answer', dark: '#1eb5f0', light: '#17586b' },
          function: {
            title: 'Functions',
            class: '.cm-formulajs, .cm-function, .cm-nerdamer, .cm-udf, .cm-datetime',
            dark: '#cb82f5',
            light: '#6f42c1'
          }
        }
        const legacyUdfStr = `
          // User custom functions
          double: x => x * 2,
          /* Grouped arrow return */
          mulGroups: (a, b) => (a + 1) * (b + 1),
          zeroArg: () => luxon.fromObject({ year: 2026, month: 1 }).daysInMonth,
          mySum: (a, b) => formulajs.SUM(a, b),
          avgConst: formulajs.AVERAGE(10, 20), // top-level external constant
          mySolve: (expr) => nerdamer(expr).solveFor("x").toString(),
          methodStyle(a, b) { return a + b },
          fiveKm: math.unit("5 km"),
          bigVal: math.bignumber("1.25"),
          twoPi: 2 * math.pi,
          sk: { BaseCarry: 300, SteedStone: 100, Necromage: 1.25, boost(x) { return x * 2 } },
          myConst: 42
        `
        const legacyUduStr = `
          foo: "18 foot",
          bar: { definition: "40 rod", prefixes: "long", aliases: ["bars", "br"] }
        `

        storage.clear()
        storage.set(
          'numara',
          JSON.stringify({
            sideBarWidth: 280,
            rateInterval: false,
            lastPage: 'p1',
            settings: {
              thouSep: 'comma',
              inputLocale: false,
              dateFormat: 'de-DE',
              pageListPosition: 'slide',
              fontSize: '1.1rem',
              lineHeight: '28px',
              notation: 'invalidLegacy'
            },
            colors: {
              answer: { title: 'Old Title', class: '.output', dark: '#112233', light: '#445566' },
              function: { title: 'Functions', class: '.cm-udf', dark: '#abcdef', light: '#fedcba' }
            },
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
            udf: legacyUdfStr,
            udu: legacyUduStr
          })
        )

        appState.pageHistory.clear()
        migrateAppState({ defaultColors })

        // Obsolete consolidated v7 keys must be cleaned up
        assert.strictEqual(store.get('sideBarWidth'), null)
        assert.strictEqual(store.get('rateInterval'), null)
        assert.strictEqual(store.get('pageListWidth'), 280)
        assert.strictEqual(store.get('lastPage'), 'p1')

        // Settings must be migrated and invalid select values dropped for initStoreObject defaults
        const migratedSettings = store.get('settings')
        assert.strictEqual(migratedSettings.numberFormat, '1.234,56')
        assert.strictEqual(migratedSettings.thouSep, true)
        assert.strictEqual(migratedSettings.dateFormat, 'dd/MM/yyyy')
        assert.strictEqual(migratedSettings.pageListPosition, 'float')
        assert.strictEqual(migratedSettings.fontSize, '14px')
        assert.strictEqual(migratedSettings.lineHeight, '30px')
        assert.strictEqual('notation' in migratedSettings, false)
        const initializedSettings = initStoreObject('settings', defaultSettings)
        assert.strictEqual(initializedSettings.notation, defaultSettings.notation)

        // Pages should preserve data/cursor/folds, seed session pageHistory, and strip persisted history/answers
        const migratedPages = store.get('pages')
        assert.strictEqual(migratedPages.length, 1)
        assert.strictEqual(migratedPages[0].id, 'p1')
        assert.strictEqual(migratedPages[0].data, 'a = 10\na * 2')
        assert.deepStrictEqual(migratedPages[0].cursor, { line: 1, ch: 5 })
        assert.deepStrictEqual(migratedPages[0].folds, [{ from: 0, to: 1 }])
        assert.strictEqual('history' in migratedPages[0], false)
        assert.strictEqual('answers' in migratedPages[0], false)
        assert.deepStrictEqual(appState.pageHistory.get('p1'), { done: ['op1'], undone: [] })

        // Theme customizations preserve user light/dark hex values while syncing class/title metadata
        const storedColors = store.get('colors')
        assert.strictEqual(migrateColors(storedColors, defaultColors), false)
        assert.strictEqual(storedColors.answer.title, 'Answers')
        assert.strictEqual(storedColors.answer.class, '.answer')
        assert.strictEqual(storedColors.answer.dark, '#112233')
        assert.strictEqual(storedColors.answer.light, '#445566')
        assert.strictEqual(
          storedColors.function.class,
          '.cm-formulajs, .cm-function, .cm-nerdamer, .cm-udf, .cm-datetime'
        )
        assert.strictEqual(storedColors.function.dark, '#abcdef')

        // UDF/UDU migrated via migrateAppState + compile/evaluate check
        const udfItems = store.get('udfItems')
        const uduItems = store.get('uduItems')
        assert.strictEqual(udfItems.length, 12)
        assert.strictEqual(uduItems.length, 2)
        assert.strictEqual(udfItems.find((i) => i.name === 'zeroArg').params, '()')
        assert.strictEqual(udfItems.find((i) => i.name === 'mulGroups').body, '(a + 1) * (b + 1)')
        assert.strictEqual(udfItems.find((i) => i.name === 'avgConst').body, 'formulajs.AVERAGE(10, 20)')
        assert.deepStrictEqual(parseLegacyUdf('', standardMath), [])
        assert.deepStrictEqual(parseLegacyUdu('', standardMath), [])

        applyUdfu(true, store.get('udf'))
        applyUdfu(false, store.get('udu'))

        const calcRes = runCalculation({
          activePage: 'test-migrated-udfu',
          lines: [
            'double(5)',
            'mulGroups(2, 3)',
            'zeroArg()',
            'mySum(10, 15)',
            'avgConst',
            'mySolve("x^2 = 16")',
            'methodStyle(7, 8)',
            'fiveKm in m',
            'bigVal + 0.75',
            'round(twoPi, 2)',
            'sk.BaseCarry + sk.SteedStone * sk.Necromage + sk.boost(5)',
            'myConst',
            '1 foo in foot',
            '1 br in rod'
          ],
          settings: defaultSettings,
          currencies: mockCurrencies
        })

        assert.deepStrictEqual(
          calcRes.answers.map((h) => extractAnswer(h).answer),
          ['10', '12', '31', '25', '15', '4,-4', '15', '5000 m', '2', '6.28', '435', '42', '18 foot', '40 rod']
        )

        applyUdfu(true, '')
        applyUdfu(false, '')
      })
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
      withMockLocalStorage((_, stats) => {
        store.set('settings', { a: 1 })
        const writesAfterSeed = stats.setCount

        // Removing a missing key must not rewrite localStorage
        store.remove('nonExistentObsoleteKey')
        assert.strictEqual(stats.setCount, writesAfterSeed)

        // initStoreObject with multiple missing defaults should batch into a single store.set
        const merged = initStoreObject('settings', { a: 0, b: 2, c: 3 })
        assert.deepStrictEqual(merged, { a: 1, b: 2, c: 3 })
        assert.strictEqual(stats.setCount, writesAfterSeed + 1)

        // Subsequent launch with all keys present must perform zero writes
        initStoreObject('settings', { a: 0, b: 2, c: 3 })
        assert.strictEqual(stats.setCount, writesAfterSeed + 1)
      })

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

describe('Module Graph & Lazy DOM Architecture', () => {
  function walkSourceFiles(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    const files = []

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)

      if (entry.isDirectory()) {
        files.push(...walkSourceFiles(fullPath))
      } else if (entry.name.endsWith('.js') || entry.name.endsWith('.cjs')) {
        files.push(fullPath)
      }
    }

    return files.sort()
  }

  function buildImportGraph() {
    const files = [...walkSourceFiles('src/js'), ...walkSourceFiles('src/electron')]
    const importRe = /(?:import|export)\s+(?:[^'"]*?\s+from\s+)?['"](\.[^'"]+)['"]/g
    const graph = new Map()

    for (const file of files) {
      const src = fs.readFileSync(file, 'utf8')
      const deps = []

      for (const match of src.matchAll(importRe)) {
        const target = path.normalize(path.join(path.dirname(file), match[1])).replace(/\?.*$/, '')
        deps.push(target)
      }

      graph.set(
        file.split(path.sep).join('/'),
        deps.map((d) => d.split(path.sep).join('/'))
      )
    }

    return graph
  }

  function getLayer(filePath) {
    if (filePath.startsWith('src/js/core/')) return 'core'
    if (filePath === 'src/js/dom.js') return 'dom'
    if (filePath.startsWith('src/js/state/')) return 'state'
    if (filePath === 'src/js/ui/dialogs.js') return 'dialogs'
    if (filePath.startsWith('src/js/editor/')) return 'editor'
    if (filePath === 'src/js/calc/calc.worker.js') return 'worker'
    if (filePath.startsWith('src/js/calc/')) return 'calc'
    if (filePath.startsWith('src/js/pages/')) return 'pages'
    if (filePath.startsWith('src/js/ui/')) return 'ui'
    if (filePath === 'src/js/app.js') return 'app'
    return 'other'
  }

  it('has zero circular dependencies across src/js and src/electron', () => {
    const graph = buildImportGraph()
    const visitState = new Map()
    const cycles = []

    function dfs(node, stack) {
      visitState.set(node, 1)

      for (const dep of graph.get(node) || []) {
        if (visitState.get(dep) === 1) {
          cycles.push([...stack.slice(stack.indexOf(dep)), dep].join(' -> '))
        } else if (!visitState.has(dep)) {
          dfs(dep, [...stack, dep])
        }
      }

      visitState.set(node, 2)
    }

    for (const node of graph.keys()) {
      if (!visitState.has(node)) {
        dfs(node, [node])
      }
    }

    assert.deepStrictEqual(cycles, [])
  })

  it('enforces strict downward layer boundaries in src/js', () => {
    const graph = buildImportGraph()
    const allowedLayers = {
      core: new Set(['core']),
      dom: new Set([]),
      state: new Set(['core', 'state']),
      dialogs: new Set(['dom', 'state']),
      editor: new Set(['core', 'dom', 'state', 'dialogs', 'editor']),
      worker: new Set(['core']),
      calc: new Set(['core', 'dom', 'state', 'dialogs', 'editor', 'calc']),
      pages: new Set(['core', 'dom', 'state', 'dialogs', 'editor', 'calc', 'pages']),
      ui: new Set(['core', 'dom', 'state', 'dialogs', 'editor', 'calc', 'pages', 'ui'])
    }
    const violations = []

    for (const [file, deps] of graph.entries()) {
      if (!file.startsWith('src/js/') || file === 'src/js/app.js') continue

      const srcLayer = getLayer(file)
      const allowed = allowedLayers[srcLayer]

      for (const dep of deps) {
        if (dep === 'package.json') continue

        const depLayer = getLayer(dep)

        if (!allowed?.has(depLayer)) {
          violations.push(`${file} (${srcLayer}) -> ${dep} (${depLayer})`)
        }
      }
    }

    assert.deepStrictEqual(violations, [])
    assert.strictEqual(graph.get('src/js/editor/index.js')?.includes('src/js/state/store.js'), false)
  })

  it('resolves dom elements lazily, caches hits, and resets cache cleanly', () => {
    const prevDocDesc = Object.getOwnPropertyDescriptor(globalThis, 'document')
    const idLookups = []
    const selectorLookups = []

    resetDomCache()

    try {
      Object.defineProperty(globalThis, 'document', {
        configurable: true,
        writable: true,
        value: undefined
      })

      assert.strictEqual(dom.output, null)
      assert.strictEqual(dom.confirmNo, null)
      assert.strictEqual(dom.pageListBar, null)

      const mockOutput = { id: 'output' }
      const mockHeaderWin = { id: 'winHeader' }
      const mockDialogConfirm = { id: 'dialogConfirm' }
      const mockOpenAtLogin = { id: 'openAtLoginContainer' }
      const mockConfirmNo = { id: 'confirmNo', className: 'uk-modal-close' }
      const mockPageListBar = { className: 'uk-offcanvas-bar' }

      Object.defineProperty(globalThis, 'document', {
        configurable: true,
        writable: true,
        value: {
          getElementById(id) {
            idLookups.push(id)
            if (id === 'output') return mockOutput
            if (id === 'winHeader') return mockHeaderWin
            if (id === 'dialogConfirm') return mockDialogConfirm
            if (id === 'openAtLoginContainer') return mockOpenAtLogin
            if (id === 'confirmNo') return mockConfirmNo
            return null
          },
          querySelector(selector) {
            selectorLookups.push(selector)
            if (selector === '#pageListPanel .uk-offcanvas-bar') return mockPageListBar
            return null
          },
          querySelectorAll() {
            return []
          }
        }
      })

      assert.strictEqual(dom.then, undefined)
      assert.strictEqual(dom.output, mockOutput)
      assert.strictEqual(dom.output, mockOutput)
      assert.deepStrictEqual(idLookups, ['output'])

      assert.strictEqual(dom.headerWin, mockHeaderWin)
      assert.strictEqual(dom.dialogConfirm, mockDialogConfirm)
      assert.strictEqual(dom.openAtLoginContainer, mockOpenAtLogin)
      assert.strictEqual(dom.confirmNo, mockConfirmNo)
      assert.deepStrictEqual(idLookups, ['output', 'winHeader', 'dialogConfirm', 'openAtLoginContainer', 'confirmNo'])

      assert.strictEqual(dom.pageListBar, mockPageListBar)
      assert.strictEqual(dom.pageListBar, mockPageListBar)
      assert.deepStrictEqual(selectorLookups, ['#pageListPanel .uk-offcanvas-bar'])

      resetDomCache()
      assert.strictEqual(dom.output, mockOutput)
      assert.deepStrictEqual(idLookups, [
        'output',
        'winHeader',
        'dialogConfirm',
        'openAtLoginContainer',
        'confirmNo',
        'output'
      ])
    } finally {
      resetDomCache()

      if (prevDocDesc) {
        Object.defineProperty(globalThis, 'document', prevDocDesc)
      } else {
        delete globalThis.document
      }
    }
  })

  it('handles event bus subscriptions, unsubscribes safely mid-emit, and clears listeners', () => {
    clearEvents()
    const calls = []

    let unsubscribeSecond = null
    const unsubscribeFirst = events.on('test:event', (val) => {
      calls.push(`first:${val}`)
      unsubscribeSecond?.()
    })

    unsubscribeSecond = events.on('test:event', (val) => {
      calls.push(`second:${val}`)
    })

    events.emit('test:event', 1)
    assert.deepStrictEqual(calls, ['first:1', 'second:1'])

    events.emit('test:event', 2)
    assert.deepStrictEqual(calls, ['first:1', 'second:1', 'first:2'])

    unsubscribeFirst()
    events.emit('test:event', 3)
    assert.deepStrictEqual(calls, ['first:1', 'second:1', 'first:2'])

    events.on('test:clear', () => calls.push('should-not-run'))
    clearEvents()
    events.emit('test:clear')
    assert.deepStrictEqual(calls, ['first:1', 'second:1', 'first:2'])
  })

  it('imports Node-safe UI/editor modules cleanly and computes selection stats', () => {
    assert.strictEqual(typeof isElectron, 'boolean')
    assert.strictEqual(isModalOpen(), false)

    assert.deepStrictEqual(
      getSelectionLineRange({
        from: () => ({ line: 1, ch: 0 }),
        to: () => ({ line: 3, ch: 0 }),
        anchor: { line: 1, ch: 0 },
        head: { line: 3, ch: 0 }
      }),
      { startLine: 1, endLine: 2 }
    )

    const prevSettings = appState.settings
    const prevCurrencies = appState.currencies
    const prevScope = appState.mathScope

    const statsEl = { textContent: '', dataset: {}, style: {} }
    const actionClasses = new Set()
    const actionsEl = {
      classList: {
        add: (c) => actionClasses.add(c),
        remove: (c) => actionClasses.delete(c)
      }
    }

    resetDomCache()
    dom.selectionStats = statsEl
    dom.actions = actionsEl
    appState.settings = { ...defaultSettings, thouSep: true, copyThouSep: false, precision: '4' }
    appState.currencies = {}
    appState.mathScope = new Map([
      ['line1', '1000'],
      ['line2', '2000']
    ])

    try {
      const mockCm = {
        somethingSelected: () => true,
        listSelections: () => [
          {
            from: () => ({ line: 0, ch: 0 }),
            to: () => ({ line: 1, ch: 4 }),
            anchor: { line: 0, ch: 0 },
            head: { line: 1, ch: 4 }
          }
        ]
      }

      updateSelectionStats(mockCm)

      assert.strictEqual(statsEl.textContent, 'Sum: 3,000  •  Avg: 1,500  •  Count: 2')
      assert.strictEqual(statsEl.dataset.copy, '3000')
      assert.strictEqual(statsEl.style.display, 'inline-block')
      assert.strictEqual(actionClasses.has('showing-stats'), true)
    } finally {
      resetDomCache()
      appState.settings = prevSettings
      appState.currencies = prevCurrencies
      appState.mathScope = prevScope
    }
  })

  it('rounds modal centering coordinates to integer pixels to prevent half-pixel font blur', () => {
    const prevRaf = globalThis.requestAnimationFrame
    globalThis.requestAnimationFrame = (cb) => cb()

    try {
      const dialogEl = {
        offsetWidth: 451,
        offsetHeight: 373,
        style: { visibility: 'hidden' },
        classList: {
          add() {},
          remove() {}
        }
      }

      modal.center(dialogEl, false, 1920, 1080)

      assert.strictEqual(dialogEl.style.left, '735px')
      assert.strictEqual(dialogEl.style.top, '354px')
      assert.strictEqual(dialogEl.style.visibility, '')

      dialogEl.offsetWidth = 560
      dialogEl.offsetHeight = 470
      modal.center(dialogEl, false, 600, 515)

      assert.strictEqual(dialogEl.style.left, '20px')
      assert.strictEqual(dialogEl.style.top, '44px')
    } finally {
      if (prevRaf) {
        globalThis.requestAnimationFrame = prevRaf
      } else {
        delete globalThis.requestAnimationFrame
      }
    }
  })

  it('references valid WOFF2 font files in fonts.css', () => {
    const fontsDir = path.resolve(import.meta.dirname, '..', 'src', 'assets', 'fonts')
    const fontsCss = fs.readFileSync(path.join(fontsDir, 'fonts.css'), 'utf8')
    const urls = [...fontsCss.matchAll(/url\(['"]?([^'")]+)['"]?\)/g)].map((m) => m[1])

    assert.ok(urls.length > 0, 'fonts.css should declare at least one font file')

    for (const file of urls) {
      const fontPath = path.join(fontsDir, file)
      assert.ok(fs.existsSync(fontPath), `${file} referenced in fonts.css must exist`)

      const header = fs.readFileSync(fontPath).subarray(0, 4).toString('ascii')
      assert.strictEqual(header, 'wOF2', `${file} must be a valid WOFF2 file`)
    }
  })

  describe('v8 Audit Regression Tests', () => {
    it('preserves small non-zero numbers across expLower, notations, units, and cleans IEEE-754 Complex noise', () => {
      const autoRes = runCalculation({
        activePage: 'test-small-auto',
        lines: ['1e-8', '1.234567e-8', '1 mm to km', 'exp(i * pi)', '(1e-8) + (2e-8)i'],
        settings: { ...defaultSettings, precision: '4', expLower: '-12', thouSep: false },
        currencies: mockCurrencies
      })
      assert.deepStrictEqual(
        autoRes.answers.map((h) => extractAnswer(h).answer),
        ['0.00000001', '0.000000012346', '0.000001 km', '-1', '0.00000001 + 0.00000002i']
      )

      const lowerBoundRes = runCalculation({
        activePage: 'test-small-explower',
        lines: ['1e-8', '1.234567e-8'],
        settings: { ...defaultSettings, precision: '4', expLower: '-6', thouSep: false },
        currencies: mockCurrencies
      })
      assert.deepStrictEqual(
        lowerBoundRes.answers.map((h) => extractAnswer(h).answer),
        ['1e-8', '1.2346e-8']
      )

      const expRes = runCalculation({
        activePage: 'test-small-exp',
        lines: ['1.234567e-8'],
        settings: { ...defaultSettings, notation: 'exponential', precision: '4', thouSep: false },
        currencies: mockCurrencies
      })
      assert.strictEqual(extractAnswer(expRes.answers[0]).answer, '1.2346e-8')

      const engRes = runCalculation({
        activePage: 'test-small-eng',
        lines: ['1.234567e-8'],
        settings: { ...defaultSettings, notation: 'engineering', precision: '3', thouSep: false },
        currencies: mockCurrencies
      })
      assert.strictEqual(extractAnswer(engRes.answers[0]).answer, '12.35e-9')

      const fixedRes = runCalculation({
        activePage: 'test-small-fixed',
        lines: ['1.234567e-8'],
        settings: { ...defaultSettings, notation: 'fixed', precision: '3', thouSep: false },
        currencies: mockCurrencies
      })
      assert.strictEqual(extractAnswer(fixedRes.answers[0]).answer, '0.000')
    })

    it('handles matrix transpose apostrophes in comma-decimal mode and apostrophes inside comments', () => {
      assert.strictEqual(stripComments("[1, 2]' // matrix's transpose"), "[1, 2]' ")

      const commaRes = runCalculation({
        activePage: 'test-transpose-comma',
        lines: ["[1,5; 2,5]' + [3,5; 4,5]'", "[1; 2]' // matrix's transpose"],
        settings: { ...defaultSettings, numberFormat: '1.234,56', matrixType: 'Array' },
        currencies: mockCurrencies
      })
      assert.strictEqual(commaRes.errorLines.length, 0)
      assert.strictEqual(extractAnswer(commaRes.answers[0]).answer, '[5, 7]')
      assert.strictEqual(extractAnswer(commaRes.answers[1]).answer, '[1, 2]')

      const dotRes = runCalculation({
        activePage: 'test-transpose-dot',
        lines: ["[1, 2]' // matrix's transpose"],
        settings: defaultSettings,
        currencies: mockCurrencies
      })
      assert.strictEqual(dotRes.errorLines.length, 0)
      assert.strictEqual(extractAnswer(dotRes.answers[0]).answer, '[1, 2]')
    })

    it('preserves currency symbols inside strings, avoids merging multi-element arrays, and formats custom crypto symbols', () => {
      const currenciesWithBtc = {
        ...mockCurrencies,
        BTC: { symbol: '₿', name: 'Bitcoin', rate: 50000 }
      }

      const enRes = runCalculation({
        activePage: 'test-currency-en',
        lines: ['"Price is $100"', '[10, 200 USD]', '2 BTC'],
        settings: { ...defaultSettings, thouSep: true },
        currencies: currenciesWithBtc
      })
      assert.deepStrictEqual(
        enRes.answers.map((h) => extractAnswer(h).answer),
        ['Price is $100', '[10, $200.00]', '₿2.00']
      )

      const btcCommaRes = runCalculation({
        activePage: 'test-currency-btc-comma',
        lines: ['2 BTC'],
        settings: { ...defaultSettings, numberFormat: '1.234,56', thouSep: true },
        currencies: currenciesWithBtc
      })
      assert.strictEqual(extractAnswer(btcCommaRes.answers[0]).answer.includes('₿'), true)
    })

    it('supports sec/min/hr date abbreviations and mixed Fraction/BigNumber date durations', () => {
      const aliasRes = runCalculation({
        activePage: 'test-date-aliases',
        lines: ['01/15/2026 10:00 AM + 2 hr', '01/15/2026 10:00 AM + 30 min', '01/15/2026 10:00 AM + 120 sec'],
        settings: defaultSettings,
        currencies: mockCurrencies
      })
      assert.deepStrictEqual(
        aliasRes.answers.map((h) => extractAnswer(h).answer),
        ['01/15/2026 12:00 PM', '01/15/2026 10:30 AM', '01/15/2026 10:02 AM']
      )

      for (const numericOutput of ['Fraction', 'BigNumber']) {
        const mixedRes = runCalculation({
          activePage: `test-date-${numericOutput}`,
          lines: ['01/15/2026 10:00 AM + 2 days + 3 hours'],
          settings: { ...defaultSettings, numericOutput },
          currencies: mockCurrencies
        })
        assert.strictEqual(extractAnswer(mixedRes.answers[0]).answer, '01/17/2026 1:00 PM')
      }
    })

    it('handles contPrevLine safely with Complex numbers, prior errors, and plot definitions', () => {
      const res = runCalculation({
        activePage: 'test-cont-prev',
        lines: ['2 + 3i', '* 2'],
        settings: { ...defaultSettings, contPrevLine: true },
        currencies: mockCurrencies
      })
      assert.deepStrictEqual(
        res.answers.map((h) => extractAnswer(h).answer),
        ['2 + 3i', '4 + 6i']
      )

      const afterErrorRes = runCalculation({
        activePage: 'test-cont-error',
        lines: ['10', 'unknown_var', '+ 5'],
        settings: { ...defaultSettings, contPrevLine: true },
        currencies: mockCurrencies
      })
      assert.deepStrictEqual(afterErrorRes.errorLines, [1])
      assert.strictEqual(extractAnswer(afterErrorRes.answers[2]).answer, '5')

      const afterPlotRes = runCalculation({
        activePage: 'test-cont-plot',
        lines: ['f(x) = x^2', '+ 5', 'f(3)'],
        settings: { ...defaultSettings, contPrevLine: true },
        currencies: mockCurrencies
      })
      assert.strictEqual(extractAnswer(afterPlotRes.answers[0]).isPlot, true)
      assert.strictEqual(extractAnswer(afterPlotRes.answers[1]).answer, '5')
      assert.strictEqual(extractAnswer(afterPlotRes.answers[2]).answer, '9')
    })

    it('compiles multi-line/callback/semicolon-string UDFs and cleanly restores UDU prefixes and built-ins', () => {
      const compiled = compileUdfItems([
        { name: 'joinSemi', params: 'a, b', body: 'a + "; " + b' },
        { name: 'pairStats', params: 'a, b', body: '{\n  total: a + b,\n  diff: a - b\n}' },
        { name: 'doubleList', params: 'arr', body: 'arr.map((v) => { return v * 2 })' }
      ])

      applyUdfu(true, compiled)

      try {
        const udfRes = runCalculation({
          activePage: 'test-compile-udf',
          lines: ['joinSemi("a", "b")', 'p = pairStats(10, 3)', 'p.total', 'doubleList([1, 2, 3])'],
          settings: { ...defaultSettings, matrixType: 'Array' },
          currencies: mockCurrencies
        })
        assert.deepStrictEqual(
          udfRes.answers.map((h) => extractAnswer(h).answer),
          ['a; b', '{"total": 13, "diff": 7}', '13', '[2, 4, 6]']
        )
      } finally {
        applyUdfu(true, '')
      }

      // Prefixed UDU + built-in override restoration
      const uduCompiled = compileUduItems([
        { name: 'foo', definition: '10 m', prefixes: 'short', aliases: '' },
        { name: 's', definition: '2 m', prefixes: 'short', aliases: '' }
      ])
      applyUdfu(false, uduCompiled)

      const duringUdu = runCalculation({
        activePage: 'test-udu-during',
        lines: ['1 kfoo to m', '1000 ms to m'],
        settings: defaultSettings,
        currencies: mockCurrencies
      })
      assert.deepStrictEqual(
        duringUdu.answers.map((h) => extractAnswer(h).answer),
        ['10000 m', '2 m']
      )

      applyUdfu(false, '')
      const afterUdu = runCalculation({
        activePage: 'test-udu-after',
        lines: ['1 kfoo', '1000 ms to s'],
        settings: defaultSettings,
        currencies: mockCurrencies
      })
      assert.deepStrictEqual(afterUdu.errorLines, [0])
      assert.strictEqual(extractAnswer(afterUdu.answers[1]).answer, '1 s')
    })

    it('preserves currency-based v7 UDUs, deduplicates colliding page names during migration, and isolates initStoreObject', () => {
      withMockLocalStorage((storage) => {
        storage.set(
          'numara',
          JSON.stringify({
            udu: 'grand: "1000 USD"',
            pages: [
              { id: 'p1', name: 'Budget', data: 'a = 1' },
              { id: 'p2', name: 'budget', data: 'b = 2' },
              { id: 'p3', name: 'Q1/Q2', data: 'c = 3' },
              { id: 'p4', name: 'Q1:Q2', data: 'd = 4' }
            ]
          })
        )

        migrateAppState()

        assert.deepStrictEqual(store.get('uduItems'), [
          { name: 'grand', definition: '1000 USD', prefixes: 'none', aliases: '' }
        ])

        const migratedPages = store.get('pages')
        assert.deepStrictEqual(
          migratedPages.map((p) => p.name),
          ['Budget', 'budget (1)', 'Q1/Q2', 'Q1:Q2 (1)']
        )

        // initStoreObject clones nested defaults so mutating stored state does not mutate defaults
        const tmpl = { nested: { x: 1, y: 2 } }
        const initialized = initStoreObject('testObj', tmpl)
        initialized.nested.x = 99
        assert.strictEqual(tmpl.nested.x, 1)
      })
    })

    it('migrates cross-dependent v7 UDF/UDU definitions, normalizes comment-only legacy defs, and populates currencyCodeTokens', () => {
      withMockLocalStorage((storage) => {
        storage.set(
          'numara',
          JSON.stringify({
            udf: 'factor: 2.5',
            udu: 'myu: `${factor} m`'
          })
        )

        migrateAppState()

        assert.deepStrictEqual(store.get('udfItems'), [{ name: 'factor', params: '', body: '2.5' }])
        assert.deepStrictEqual(store.get('uduItems'), [
          { name: 'myu', definition: '2.5 m', prefixes: 'none', aliases: '' }
        ])

        storage.set(
          'numara',
          JSON.stringify({
            udf: '// user comment only',
            udu: '/* block comment */'
          })
        )

        migrateAppState()

        assert.deepStrictEqual(store.get('udfItems'), [])
        assert.deepStrictEqual(store.get('uduItems'), [])
        assert.strictEqual(store.get('udf'), '')
        assert.strictEqual(store.get('udu'), '')
      })

      const prevCurrencies = appState.currencies
      appState.currencies = {
        ...mockCurrencies,
        CAD: { symbol: 'CA$', name: 'Canadian Dollar' },
        MAD: { symbol: 'MAD', name: 'Moroccan Dirham' }
      }

      try {
        refreshCurrencyTokens()
        assert.strictEqual(currencyCodeTokens.has('USD'), true)
        assert.strictEqual(currencyCodeTokens.has('usd'), true)
        assert.strictEqual(currencyCodeTokens.has('CAD'), true)
        assert.strictEqual(currencyCodeTokens.has('cad'), true)
        assert.strictEqual(currencyCodeTokens.has('MAD'), true)
        assert.strictEqual(currencyCodeTokens.has('mad'), false)
      } finally {
        appState.currencies = prevCurrencies
        refreshCurrencyTokens()
      }
    })

    it('bundles app, worker, CSS, and resolves functionPlot CJS/ESM interop cleanly via esbuild', async () => {
      const appBundle = await esbuild({
        entryPoints: ['src/js/app.js'],
        bundle: true,
        minify: true,
        write: false
      })
      assert.strictEqual(appBundle.errors.length, 0)
      assert.ok(appBundle.outputFiles[0].contents.byteLength > 0)

      const workerBundle = await esbuild({
        entryPoints: ['src/js/calc/calc.worker.js'],
        bundle: true,
        metafile: true,
        minify: true,
        write: false
      })
      assert.strictEqual(workerBundle.errors.length, 0)
      assert.ok(workerBundle.outputFiles[0].contents.byteLength > 0)
      assert.strictEqual(
        Object.keys(workerBundle.metafile.inputs).some((p) => p.includes('lucide')),
        false
      )

      const cssBundle = await esbuild({
        entryPoints: ['src/css/app.css'],
        bundle: true,
        minify: true,
        write: false,
        loader: { '.woff2': 'file', '.png': 'file', '.svg': 'file' },
        outdir: 'build/css'
      })
      assert.strictEqual(cssBundle.errors.length, 0)

      // Verify function-plot interop resolves to a callable function inside an esbuild bundle
      const interopProbe = await esbuild({
        stdin: {
          contents: `import functionPlot from 'function-plot'; export const renderPlot = typeof functionPlot === 'function' ? functionPlot : functionPlot.default;`,
          resolveDir: process.cwd(),
          loader: 'js'
        },
        bundle: true,
        format: 'esm',
        write: false
      })
      const modUrl = `data:text/javascript;base64,${Buffer.from(interopProbe.outputFiles[0].text).toString('base64')}`
      const imported = await import(modUrl)
      assert.strictEqual(typeof imported.renderPlot, 'function')
    })

    it('compiles control-flow block UDFs, rejects __proto__ UDF pollution, and preserves UDU offset/baseName', () => {
      const compiledUdf = compileUdfItems([
        { name: 'clampPos', params: 'x', body: 'if (x > 0) { return x * 2 }\nreturn 0' },
        { name: 'sumTo', params: 'n', body: 'let s = 0; for (let i = 1; i <= n; i++) { s += i } return s' },
        { name: '$tax', params: 'v', body: 'v * 0.1' }
      ])

      applyUdfu(true, compiledUdf)

      try {
        const res = runCalculation({
          activePage: 'test-control-flow-udf',
          lines: ['clampPos(5)', 'clampPos(-3)', 'sumTo(4)', '$tax(200)'],
          settings: defaultSettings,
          currencies: mockCurrencies
        })
        assert.deepStrictEqual(
          res.answers.map((h) => extractAnswer(h).answer),
          ['10', '0', '10', '20']
        )
      } finally {
        applyUdfu(true, '')
      }

      assert.throws(
        () => applyUdfuToMath(standardMath, '"__proto__": { "polluted": 1 }', true, {}),
        /User defined input must resolve to an object/
      )

      const compiledUdu = compileUduItems([
        { name: 'degMy', definition: '1 degC', prefixes: 'none', aliases: '', offset: 10, baseName: 'TEMP_MY' }
      ])
      assert.strictEqual(compiledUdu.includes('"offset":10'), true)
      assert.strictEqual(compiledUdu.includes('"baseName":"TEMP_MY"'), true)

      withMockLocalStorage((storage) => {
        storage.set(
          'numara',
          JSON.stringify({
            udf: 'grade: (x) => { if (x >= 50) { return "pass" } return "fail" }',
            udu: 'uoff: { definition: "1 m", offset: 5 }'
          })
        )

        migrateAppState()

        const udfItems = store.get('udfItems')
        assert.strictEqual(udfItems.length, 1)
        assert.doesNotThrow(() => new Function(`return ({${store.get('udf')}})`))
        assert.strictEqual(store.get('uduItems')[0].offset, 5)
      })
    })

    it('evaluates formulajs.* and DateTime.* across number, BigNumber, and Fraction modes', () => {
      for (const numericOutput of ['number', 'BigNumber', 'Fraction']) {
        const res = runCalculation({
          activePage: `test-interop-${numericOutput}`,
          lines: [
            'formulajs.ABS(-42)',
            'formulajs.SUM(10, 20, 30)',
            'formulajs.ROUND(formulajs.PMT(0.05 / 12, 12, -1000), 2)',
            'DateTime.fromISO("2026-05-01").plus({ days: 5 }).toFormat("yyyy-MM-dd")',
            'DateTime.local(2026, 5, 1).plus({ days: 10 }).day'
          ],
          settings: { ...defaultSettings, numericOutput },
          currencies: mockCurrencies
        })

        assert.strictEqual(
          res.errorLines.length,
          0,
          `Unexpected errors in ${numericOutput}: ${res.answers.join(' | ')}`
        )
        assert.deepStrictEqual(
          res.answers.map((h) => extractAnswer(h).answer),
          ['42', '60', '85.61', '2026-05-06', '11']
        )
      }
    })

    it('evaluates non-date time units, keyword assignments, and object/range colons without date hijack', () => {
      const res = runCalculation({
        activePage: 'test-alt-eval-fixes',
        lines: [
          '2 days',
          '3 days',
          'total + 1 day',
          't = total + 1 day',
          '',
          'pct = 10% of 50',
          'obj = {a: subtotal}',
          'arr = 1:3',
          '10% of 100 hours + 2 hours',
          '15/01/2026 + 1 day'
        ],
        settings: { ...defaultSettings, matrixType: 'Array' },
        currencies: mockCurrencies
      })

      assert.deepStrictEqual(
        res.answers.map((h) => extractAnswer(h).answer),
        ['2 days', '3 days', '6 days', '6 days', '', '5', '{"a": 5}', '[1, 2, 3]', '12 hours', 'Invalid Date']
      )
    })

    it('formats negative prefix currencies, Fraction currencies, Nordic kr symbols, and >15-digit BigNumber currencies', () => {
      const nordicCurrencies = {
        ...mockCurrencies,
        DKK: { symbol: 'kr.', name: 'Danish Krone', locale: 'da-DK', rate: 0.15 },
        NOK: { symbol: 'kr', name: 'Norwegian Krone', locale: 'nb-NO', rate: 0.095 },
        ISK: { symbol: 'kr', name: 'Icelandic Króna', locale: 'is-IS', rate: 0.007 },
        SEK: { symbol: 'kr', name: 'Swedish Krona', locale: 'sv-SE', rate: 0.098 }
      }

      const curRes = runCalculation({
        activePage: 'test-currency-fixes',
        lines: ['-$50 + $20', '$-50 + $20', '-€20 + €50', '$100 / $50', '100 DKK', '100 NOK', '100 SEK'],
        settings: { ...defaultSettings, thouSep: true },
        currencies: nordicCurrencies
      })
      assert.strictEqual(curRes.errorLines.length, 0)
      const curAnswers = curRes.answers.map((h) => extractAnswer(h).answer)
      assert.strictEqual(curAnswers[0], '-$30.00')
      assert.strictEqual(curAnswers[1], '-$30.00')
      assert.strictEqual(curAnswers[2].includes('30'), true)
      assert.strictEqual(curAnswers[3], '2')
      assert.strictEqual(curAnswers[4].includes('kr'), true)
      assert.strictEqual(curAnswers[5].includes('kr'), true)
      assert.strictEqual(curAnswers[6].includes('kr'), true)

      const fracRes = runCalculation({
        activePage: 'test-currency-fraction',
        lines: ['$1 / 3', '0 USD - $50'],
        settings: { ...defaultSettings, numericOutput: 'Fraction', thouSep: true },
        currencies: mockCurrencies
      })
      assert.deepStrictEqual(
        fracRes.answers.map((h) => extractAnswer(h).answer),
        ['1/3 USD', '-$50.00']
      )

      const bigCurRes = runCalculation({
        activePage: 'test-currency-bignum',
        lines: ['bignumber("12345678901234567.89") * 1 USD'],
        settings: {
          ...defaultSettings,
          numericOutput: 'BigNumber',
          precision: '4',
          expUpper: '20',
          thouSep: true,
          copyThouSep: true
        },
        currencies: mockCurrencies
      })
      assert.strictEqual(extractAnswer(bigCurRes.answers[0]).answer, '$12,345,678,901,234,567.89')
    })

    it('guards contPrevLine against non-numeric/non-date types while preserving strings, quotes, plots, and bigint %', () => {
      const res = runCalculation({
        activePage: 'test-cont-and-strings',
        lines: [
          '10',
          's = ""',
          '20',
          'subtotal',
          'obj = {a: 1}',
          '+ 5',
          '"He said \\"hello\\""',
          '"f(x) = 1"',
          'f(θ) = θ^2',
          'f(4)',
          'bigint(2) in %',
          '1 : 4',
          '2026-01-01 + 1 day',
          '+ 2 days'
        ],
        settings: { ...defaultSettings, contPrevLine: true, dateFormat: 'yyyy-MM-dd', matrixType: 'Array' },
        currencies: mockCurrencies
      })

      assert.strictEqual(extractAnswer(res.answers[1]).answer, '')
      assert.strictEqual(extractAnswer(res.answers[3]).answer, '30')
      assert.strictEqual(extractAnswer(res.answers[5]).answer, '5')
      assert.strictEqual(extractAnswer(res.answers[6]).answer, 'He said "hello"')
      assert.strictEqual(extractAnswer(res.answers[7]).answer, 'f(x) = 1')
      assert.strictEqual(extractAnswer(res.answers[7]).isPlot, undefined)
      assert.strictEqual(extractAnswer(res.answers[8]).isPlot, true)
      assert.strictEqual(extractAnswer(res.answers[9]).answer, '16')
      assert.strictEqual(extractAnswer(res.answers[10]).answer, '200%')
      assert.strictEqual(extractAnswer(res.answers[11]).answer, '[1, 2, 3, 4]')
      assert.strictEqual(extractAnswer(res.answers[13]).answer, '2026-01-04')
    })

    it('hardens store recovery, legacy root consolidation, page collision non-stealing, syncPlan <>, and Windows filenames', () => {
      assert.strictEqual(getSafeFilename('CON'), '_CON')
      assert.strictEqual(getSafeFilename('aux'), '_aux')
      assert.strictEqual(getSafeFilename('lpt1'), '_lpt1')
      assert.strictEqual(getSafeFilename('Budget\x00\x1f\x7f'), 'Budget')

      withMockLocalStorage((storage) => {
        // Array root in localStorage['numara'] should recover cleanly, back up raw data, and log once
        const loggedErrors = []
        const origConsoleError = console.error
        console.error = (...args) => loggedErrors.push(args)

        try {
          storage.set('numara', '[1, 2, 3]')
          assert.strictEqual(store.get('pages'), null)
        } finally {
          console.error = origConsoleError
        }

        assert.strictEqual(loggedErrors.length, 1)
        assert.match(String(loggedErrors[0][0]), /Error parsing consolidated local storage/)
        assert.strictEqual(
          [...storage.keys()].some((k) => k.startsWith('numara_corrupt_')),
          true
        )
        store.set('inputWidth', 55)
        assert.strictEqual(store.get('inputWidth'), 55)

        // initStoreObject repairs mismatched primitive vs object field types
        storage.set('numara', JSON.stringify({ colors: { answer: 'broken-string' } }))
        const repairedColors = initStoreObject('colors', { answer: { light: '#111', dark: '#eee' } })
        assert.deepStrictEqual(repairedColors, { answer: { light: '#111', dark: '#eee' } })

        // Legacy v6/v7 root keys consolidate and page collision renaming does not steal existing names
        storage.clear()
        storage.set(
          'pages',
          JSON.stringify([
            { id: 'p1', name: 'Budget', data: '1' },
            { id: 'p2', name: 'budget', data: '2' },
            { id: 'p3', name: 'budget (1)', data: '3' },
            { id: 'p4', name: '<Script>', data: '4' },
            null
          ])
        )
        storage.set('settings', JSON.stringify({ locale: 'de-DE', inputWidth: 48 }))

        migrateAppState()

        assert.strictEqual(storage.has('pages'), false)
        assert.strictEqual(storage.has('settings'), false)
        assert.strictEqual(store.get('inputWidth'), 48)
        assert.strictEqual(store.get('settings').numberFormat, '1.234,56')
        assert.deepStrictEqual(
          store.get('pages').map((p) => p.name),
          ['Budget', 'budget (2)', 'budget (1)', 'Script']
        )
      })

      const renames = detectExternalRenames({
        pages: [{ id: 'p1', name: 'OldBudget', data: '10 + 20' }],
        files: [{ name: '<Budget>', content: '10 + 20' }],
        lastSyncContent: new Map([['oldbudget', '10 + 20']])
      })
      assert.strictEqual(renames.length, 1)
      assert.strictEqual(renames[0].sanitizedName, 'Budget')
      assert.strictEqual(renames[0].newSyncKey, 'budget')
    })
  })
})
