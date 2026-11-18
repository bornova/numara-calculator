import assert from 'node:assert'
import fs from 'node:fs'
import path from 'node:path'
import { before, describe, it } from 'node:test'
import vm from 'node:vm'

import { applyUdfu, runCalculation } from '../src/js/core/evaluator.js'
import { parseLocaleNumber } from '../src/js/core/formatter.js'
import { isCommaDecimal } from '../src/js/core/utils.js'
import { DEFAULT_SETTINGS } from '../src/js/state/appState.js'

const MOCK_CURRENCIES = {
  USD: { symbol: '$', name: 'U.S. Dollar', locale: 'en-US' },
  EUR: { symbol: '€', name: 'Euro', locale: 'de-DE', rate: 1.25 },
  GBP: { symbol: '£', name: 'British Pound', locale: 'en-GB', rate: 1.5 },
  DKK: { symbol: 'kr.', name: 'Danish Krone', locale: 'da-DK', rate: 0.15 },
  SEK: { symbol: 'kr', name: 'Swedish Krona', locale: 'sv-SE', rate: 0.1 }
}

function unescapeHTML(str) {
  if (!str) return ''

  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
}

function parseRenderedCell(htmlStr) {
  if (!htmlStr) return { copy: '', display: '', isError: false, isPlot: false }

  const errorMatch = htmlStr.match(/data-error="([^"]*)"/)
  if (errorMatch || htmlStr.includes('class="lineError"')) {
    const text = htmlStr.replace(/<\/?[^>]+(>|$)/g, '').trim()

    return {
      isError: true,
      error: unescapeHTML(errorMatch?.[1] || ''),
      display: unescapeHTML(text)
    }
  }

  if (htmlStr.includes('plotButton')) {
    const plotMatch = htmlStr.match(/data-plot="([^"]+)"/)

    return {
      isError: false,
      isPlot: true,
      copy: plotMatch ? unescapeHTML(plotMatch[1]) : '',
      display: 'Plot'
    }
  }

  const answerMatch = htmlStr.match(/data-answer="([^"]*)"/)
  const text = unescapeHTML(htmlStr.replace(/<\/?[^>]+(>|$)/g, '').trim())

  return {
    isError: false,
    isPlot: false,
    copy: answerMatch ? unescapeHTML(answerMatch[1]) : text,
    display: text
  }
}

/**
 * Deterministic greedy IPOG-style 2-way (pairwise) covering array generator.
 * Guarantees that every valid pair (dimA=valA, dimB=valB) appears in at least one generated row.
 *
 * @param {Array<{ key: string, values: Array<*> }>} dimensions
 * @returns {Array<Record<string, *>>}
 */
function generatePairwiseProfiles(dimensions) {
  const uncovered = new Set()

  for (let i = 0; i < dimensions.length; i++) {
    for (let j = i + 1; j < dimensions.length; j++) {
      for (let vi = 0; vi < dimensions[i].values.length; vi++) {
        for (let vj = 0; vj < dimensions[j].values.length; vj++) {
          uncovered.add(`${i}:${vi}|${j}:${vj}`)
        }
      }
    }
  }

  const rows = []

  while (uncovered.size > 0) {
    // Seed with the first remaining uncovered pair
    const firstPair = uncovered.values().next().value
    const [leftPart, rightPart] = firstPair.split('|')
    const [d1, v1] = leftPart.split(':').map(Number)
    const [d2, v2] = rightPart.split(':').map(Number)

    const chosenIndices = new Array(dimensions.length).fill(-1)
    chosenIndices[d1] = v1
    chosenIndices[d2] = v2

    // Fill remaining dimensions in descending domain-size order to maximize pair coverage per row
    const remainingDims = dimensions
      .map((d, idx) => ({ idx, len: d.values.length }))
      .filter(({ idx }) => chosenIndices[idx] === -1)
      .sort((a, b) => b.len - a.len)

    for (const { idx, len } of remainingDims) {
      let bestValIdx = 0
      let bestGain = -1

      for (let candidate = 0; candidate < len; candidate++) {
        let gain = 0

        for (let other = 0; other < dimensions.length; other++) {
          const otherVal = chosenIndices[other]
          if (otherVal === -1) continue

          const pairKey =
            idx < other ? `${idx}:${candidate}|${other}:${otherVal}` : `${other}:${otherVal}|${idx}:${candidate}`
          if (uncovered.has(pairKey)) {
            gain++
          }
        }

        if (gain > bestGain) {
          bestGain = gain
          bestValIdx = candidate
        }
      }

      chosenIndices[idx] = bestValIdx
    }

    // Mark all pairs covered by this row
    for (let i = 0; i < dimensions.length; i++) {
      for (let j = i + 1; j < dimensions.length; j++) {
        uncovered.delete(`${i}:${chosenIndices[i]}|${j}:${chosenIndices[j]}`)
      }
    }

    const profile = {}
    dimensions.forEach((dim, idx) => {
      profile[dim.key] = dim.values[chosenIndices[idx]]
    })
    rows.push(profile)
  }

  return rows
}

/**
 * Parses a scalar numeric value back from a formatted Numara answer across all notations and number formats.
 */
function parseFormattedScalar(str, settings) {
  const trimmed = String(str)
    .replace(/^[$€£]|USD|EUR|GBP|km|m|ft|hours|days|%/g, '')
    .trim()

  if (/^-?0b[01]+(?:\.[01]+)?$/i.test(trimmed)) {
    const neg = trimmed.startsWith('-') ? -1 : 1
    const body = trimmed.replace(/^-?0b/i, '')
    const [intPart, fracPart = ''] = body.split('.')
    let val = parseInt(intPart, 2)

    for (let i = 0; i < fracPart.length; i++) {
      if (fracPart[i] === '1') val += Math.pow(2, -(i + 1))
    }

    return neg * val
  }

  if (/^-?0o[0-7]+(?:\.[0-7]+)?$/i.test(trimmed)) {
    const neg = trimmed.startsWith('-') ? -1 : 1
    const body = trimmed.replace(/^-?0o/i, '')
    const [intPart, fracPart = ''] = body.split('.')
    let val = parseInt(intPart, 8)

    for (let i = 0; i < fracPart.length; i++) {
      val += parseInt(fracPart[i], 8) * Math.pow(8, -(i + 1))
    }

    return neg * val
  }

  if (/^-?0x[0-9a-f]+(?:\.[0-9a-f]+)?$/i.test(trimmed)) {
    const neg = trimmed.startsWith('-') ? -1 : 1
    const body = trimmed.replace(/^-?0x/i, '')
    const [intPart, fracPart = ''] = body.split('.')
    let val = parseInt(intPart, 16)

    for (let i = 0; i < fracPart.length; i++) {
      val += parseInt(fracPart[i], 16) * Math.pow(16, -(i + 1))
    }

    return neg * val
  }

  if (/^-?\d+\/\d+$/.test(trimmed)) {
    const [n, d] = trimmed.split('/').map(Number)

    return n / d
  }

  const parsed = parseLocaleNumber(trimmed, settings)

  if (!Number.isNaN(parsed)) {
    return parsed
  }

  return Number(trimmed.replace(/,/g, '.'))
}

describe('Pairwise Combinatorial Engine & Feature Matrix', () => {
  const DIMENSIONS = [
    { key: 'numericOutput', values: ['number', 'BigNumber', 'Fraction'] },
    { key: 'notation', values: ['auto', 'fixed', 'exponential', 'engineering', 'bin', 'oct', 'hex'] },
    { key: 'precision', values: ['0', '4', '12'] },
    {
      key: 'expBounds',
      values: [
        ['-12', '12'],
        ['-3', '3']
      ]
    },
    { key: 'numberFormat', values: ['1,234.56', '1.234,56', '1 234.56', '1 234,56'] },
    {
      key: 'grouping',
      values: [
        [true, false],
        [true, true],
        [false, false],
        [false, true]
      ]
    },
    { key: 'matrixType', values: ['Matrix', 'Array'] },
    { key: 'predictable', values: [false, true] },
    { key: 'contPrevLine', values: [false, true] },
    { key: 'dateFormat', values: ['MM/dd/yyyy', 'dd/MM/yyyy', 'yyyy-MM-dd'] },
    { key: 'dateDay', values: [false, true] },
    { key: 'currency', values: [true, false] },
    { key: 'lineErrors', values: [true, false] }
  ]

  const pairwiseRows = generatePairwiseProfiles(DIMENSIONS)

  before(() => {
    const compiledUdf = `
      "udfAdd": function(a, b) { return add(a, b) },
      "udfClamp": function(x) { if (larger(x, 0)) { return multiply(x, 2) } return 0 }
    `
    const compiledUdu = `"myfoot": {"definition":"0.5 m","prefixes":"none"}`

    applyUdfu(true, compiledUdf)
    applyUdfu(false, compiledUdu)
  })

  it('covers 100% of all 2-way setting pairs across all 13 engine & formatting dimensions', () => {
    let totalPairs = 0

    for (let i = 0; i < DIMENSIONS.length; i++) {
      for (let j = i + 1; j < DIMENSIONS.length; j++) {
        const dimA = DIMENSIONS[i]
        const dimB = DIMENSIONS[j]

        for (const valA of dimA.values) {
          for (const valB of dimB.values) {
            totalPairs++
            const covered = pairwiseRows.some((row) => row[dimA.key] === valA && row[dimB.key] === valB)

            assert.ok(covered, `Missing pairwise combination: ${dimA.key}=${valA} + ${dimB.key}=${valB}`)
          }
        }
      }
    }

    assert.ok(totalPairs > 350, `Expected >350 setting pairs, verified ${totalPairs}`)
  })

  pairwiseRows.forEach((row, profileIdx) => {
    const [expLower, expUpper] = row.expBounds
    const [thouSep, copyThouSep] = row.grouping
    const settings = {
      ...DEFAULT_SETTINGS,
      numericOutput: row.numericOutput,
      notation: row.notation,
      precision: row.precision,
      expLower,
      expUpper,
      numberFormat: row.numberFormat,
      thouSep,
      copyThouSep,
      matrixType: row.matrixType,
      predictable: row.predictable,
      contPrevLine: row.contPrevLine,
      dateFormat: row.dateFormat,
      dateDay: row.dateDay,
      currency: row.currency,
      lineErrors: row.lineErrors
    }

    const label = [
      `#${profileIdx + 1}`,
      row.numericOutput,
      row.notation,
      `p=${row.precision}`,
      row.numberFormat,
      `thou=${thouSep}/${copyThouSep}`,
      row.matrixType,
      `pred=${row.predictable}`,
      `cont=${row.contPrevLine}`,
      row.dateFormat,
      `day=${row.dateDay}`,
      `cur=${row.currency}`,
      `err=${row.lineErrors}`
    ].join(', ')

    it(`evaluates full Numara feature worksheet under profile (${label})`, () => {
      const commaDec = isCommaDecimal(settings)
      const dec = (s) => (commaDec ? s.replace(/\./g, ',') : s)
      const sep = commaDec ? ';' : ','

      const dateJan15 =
        row.dateFormat === 'MM/dd/yyyy' ? '01/15/2026' : row.dateFormat === 'dd/MM/yyyy' ? '15/01/2026' : '2026-01-15'
      const dateJan20 =
        row.dateFormat === 'MM/dd/yyyy' ? '01/20/2026' : row.dateFormat === 'dd/MM/yyyy' ? '20/01/2026' : '2026-01-20'

      const pages = [
        {
          id: `rates-${profileIdx}`,
          name: 'Rates',
          data: `hourly = ${dec('25.5')}\nbonus = 10`
        }
      ]

      const lines = [
        // 0..5: Variables, Unicode, labels, comments, keywords
        `ücret = ${dec('200.5')}`, // 0 -> 200.5
        'Rent: 100 // inline comment', // 1 -> 100
        'subtotal', // 2 -> 300.5
        'subavg', // 3 -> 150.25
        'ans', // 4 -> 150.25
        'line2 + 50', // 5 -> 150
        '', // 6 -> blank resets subtotal
        // 7..9: Line continuation block
        '100', // 7 -> 100
        '+ 50', // 8 -> 150 (cont=true) or 50 (cont=false)
        '* 2', // 9 -> 300 (cont=true) or Error (cont=false)
        '', // 10
        // 11..16: Percentages
        '20% of 150', // 11 -> 30
        '100 + 25%', // 12 -> 125
        '100 - 10%', // 13 -> 90
        '50 as % of 200', // 14 -> 25%
        '30 is what % of 120', // 15 -> 25%
        `${dec('0.5')} in %`, // 16 -> 50%
        '', // 17
        // 18..20: Base conversions
        '255 in hex', // 18 -> 0xff
        '10 in bin', // 19 -> 0b1010
        '64 in oct', // 20 -> 0o100
        // 21..25: Units & Currencies
        '100 cm to m', // 21 -> 1 m
        '$100 + $50', // 22 -> $150
        '-$20 + $50', // 23 -> $30
        '100 eur + 50 eur', // 24 -> €150
        '$100 to EUR', // 25 -> €80 (currency=true) or Error (currency=false)
        // 26..28: Date math & Date diff
        `${dateJan15} + 5 days`, // 26 -> dateJan20 (with optional weekday)
        `${dateJan20} - ${dateJan15}`, // 27 -> 5 days
        'today + 1 day', // 28 -> valid date string
        // 29..36: Strings, Objects, Matrices, Predictable Complex, Plot, Cross-page, UDF/UDU, External libs
        '"Item #1 // not comment"', // 29 -> Item #1 // not comment
        `obj = {a: 10${sep} b: 20}`, // 30 -> object
        'obj.a + obj.b', // 31 -> 30
        `[1${sep} 2] + [3${sep} 4]`, // 32 -> [4, 6]
        row.numericOutput === 'Fraction' ? '(3/2)^2' : 'sqrt(-4)', // 33 -> 9/4 (Fraction) or NaN/2i
        'f(x) = 2x + 1', // 34 -> plot
        'f(3)', // 35 -> 7
        'p = page("Rates")', // 36 -> page link "Rates"
        'p.hourly * 2', // 37 -> 51
        `udfAdd(3${sep} 4) + udfClamp(5)`, // 38 -> 17
        '2 myfoot to m', // 39 -> 1 m
        `formulajs.SUM(5${sep} 10) + DateTime.fromISO("2026-05-01").day`, // 40 -> 16
        dec('1234567.5') // 41 -> grouping check
      ]

      const res = runCalculation({
        activePage: `pw-page-${profileIdx}`,
        lines,
        pages,
        settings,
        currencies: MOCK_CURRENCIES
      })

      const cells = res.answers.map(parseRenderedCell)

      // Expected error indices: line 9 when !contPrevLine, line 25 when !currency
      const expectedErrorIndices = []
      if (!row.contPrevLine) expectedErrorIndices.push(9)
      if (!row.currency) expectedErrorIndices.push(25)

      assert.deepStrictEqual(
        res.errorLines,
        expectedErrorIndices,
        `Unexpected error lines under (${label}): got [${res.errorLines}] vs expected [${expectedErrorIndices}] — details: ${res.errorLines.map((idx) => `L${idx}:${cells[idx].error}`).join('; ')}`
      )

      // Verify lineErrors setting controls error link text
      for (const errIdx of expectedErrorIndices) {
        assert.strictEqual(cells[errIdx].isError, true)
        assert.strictEqual(cells[errIdx].display, row.lineErrors ? 'Error' : '')
      }

      // Numeric tolerances (precision='0' rounds .5/.25 to integer)
      const tol = row.precision === '0' ? 1 : 1e-2

      assert.ok(Math.abs(parseFormattedScalar(cells[0].copy, settings) - 200.5) <= tol)
      assert.ok(Math.abs(parseFormattedScalar(cells[2].copy, settings) - 300.5) <= tol)
      assert.ok(Math.abs(parseFormattedScalar(cells[3].copy, settings) - 150.25) <= tol)
      assert.ok(Math.abs(parseFormattedScalar(cells[5].copy, settings) - 150) <= tol)

      // Line continuation verification
      if (row.contPrevLine) {
        assert.ok(Math.abs(parseFormattedScalar(cells[8].copy, settings) - 150) <= tol)
        assert.ok(Math.abs(parseFormattedScalar(cells[9].copy, settings) - 300) <= tol)
      } else {
        assert.ok(Math.abs(parseFormattedScalar(cells[8].copy, settings) - 50) <= tol)
      }

      // Percentages
      assert.ok(Math.abs(parseFormattedScalar(cells[11].copy, settings) - 30) <= tol)
      assert.ok(Math.abs(parseFormattedScalar(cells[12].copy, settings) - 125) <= tol)
      assert.ok(Math.abs(parseFormattedScalar(cells[13].copy, settings) - 90) <= tol)
      assert.ok(cells[14].copy.endsWith('%'))
      assert.ok(cells[15].copy.endsWith('%'))
      assert.ok(cells[16].copy.endsWith('%'))

      // Explicit base conversions ALWAYS produce 0xff / 0b1010 / 0o100 across ALL numericOutput & notation settings
      assert.strictEqual(cells[18].copy, '0xff')
      assert.strictEqual(cells[19].copy, '0b1010')
      assert.strictEqual(cells[20].copy, '0o100')

      // Units & currencies
      assert.ok(cells[21].copy.endsWith(' m'))
      assert.ok(/\$|usd/i.test(cells[22].copy))
      assert.ok(/\$|usd/i.test(cells[23].copy))
      assert.ok(/€|eur/i.test(cells[24].copy))
      if (row.currency) {
        assert.ok(/€|eur/i.test(cells[25].copy))
      }

      // Dates
      assert.ok(cells[26].copy.endsWith(dateJan20), `Expected ${cells[26].copy} to end with ${dateJan20}`)
      if (row.dateDay) {
        assert.ok(cells[26].copy.includes(', '), `Expected weekday prefix in ${cells[26].copy}`)
      } else {
        assert.strictEqual(cells[26].copy, dateJan20)
      }
      assert.ok(cells[27].copy.endsWith(' days'))
      assert.ok(cells[28].copy.length >= 8)

      // Strings, Objects, Matrices, Predictable, Plot, Cross-page, UDF/UDU, External libs
      assert.strictEqual(cells[29].copy, 'Item #1 // not comment')
      assert.ok(Math.abs(parseFormattedScalar(cells[31].copy, settings) - 30) <= tol)
      assert.ok(cells[32].copy.startsWith('[') && cells[32].copy.endsWith(']'))

      if (row.numericOutput === 'Fraction') {
        assert.ok(Math.abs(parseFormattedScalar(cells[33].copy, settings) - 2.25) <= tol)
      } else if (row.predictable) {
        assert.strictEqual(cells[33].copy, 'NaN')
      } else {
        assert.ok(cells[33].copy.includes('i'))
      }

      assert.strictEqual(cells[34].isPlot, true)
      assert.ok(Math.abs(parseFormattedScalar(cells[35].copy, settings) - 7) <= tol)
      assert.strictEqual(cells[36].copy, 'Rates')
      assert.ok(res.answers[36].includes('pageLink'))
      assert.ok(Math.abs(parseFormattedScalar(cells[37].copy, settings) - 51) <= tol)
      assert.ok(Math.abs(parseFormattedScalar(cells[38].copy, settings) - 17) <= tol)
      assert.ok(cells[39].copy.endsWith(' m'))
      assert.ok(Math.abs(parseFormattedScalar(cells[40].copy, settings) - 16) <= tol)

      // Verify thouSep vs copyThouSep on 1234567.5 when notation is auto/fixed and numericOutput !== Fraction
      if (
        (row.notation === 'auto' || row.notation === 'fixed') &&
        row.numericOutput !== 'Fraction' &&
        expUpper === '12'
      ) {
        const groupChar = row.numberFormat.startsWith('1 ') ? ' ' : row.numberFormat.startsWith('1.') ? '.' : ','

        if (thouSep) {
          assert.ok(
            cells[41].display.includes(groupChar),
            `Display "${cells[41].display}" should include "${groupChar}"`
          )
          assert.strictEqual(cells[41].copy.includes(groupChar), copyThouSep)
        } else {
          assert.strictEqual(cells[41].display.includes(' '), false)
        }
      }
    })
  })
})

describe('Service Worker Lifecycle & Offline Caching (src/sw.js)', () => {
  function createSwHarness({ online = true, redirected = false } = {}) {
    const storeMap = new Map()
    const fetchCalls = []
    const listeners = {}
    let claimed = false
    let skippedWaiting = false

    const cachesMock = {
      async open(name) {
        if (!storeMap.has(name)) storeMap.set(name, new Map())
        const bucket = storeMap.get(name)

        return {
          async put(req, res) {
            const key = typeof req === 'string' ? req : req.url
            bucket.set(key, res)
          },
          async match(req) {
            const key = typeof req === 'string' ? req : req.url
            const u = new URL(key, 'https://numara.io/')
            return bucket.get(key) || bucket.get(`./${u.pathname.replace(/^\//, '')}${u.search}`)
          }
        }
      },
      async keys() {
        return [...storeMap.keys()]
      },
      async delete(name) {
        return storeMap.delete(name)
      },
      async match(req) {
        const key = typeof req === 'string' ? req : req.url
        for (const bucket of storeMap.values()) {
          if (bucket.has(key)) return bucket.get(key)
        }
        return undefined
      }
    }

    class MockRequest {
      constructor(input, init = {}) {
        if (input instanceof MockRequest) {
          if (input.mode === 'navigate' && Object.keys(init).length > 0) {
            throw new TypeError('Cannot construct a Request with a Request whose mode is navigate and non-empty init')
          }
          this.url = input.url
          this.method = init.method || input.method
          this.mode = init.mode || input.mode
        } else {
          this.url = new URL(input, 'https://numara.io/').href
          this.method = init.method || 'GET'
          this.mode = init.mode || 'cors'
        }
      }
    }

    class MockResponse {
      constructor(body, init = {}) {
        this.body = body
        this.status = init.status ?? 200
        this.statusText = init.statusText ?? 'OK'
        this.headers = init.headers ?? {}
        this.ok = this.status >= 200 && this.status < 300
        this.type = init.type ?? 'basic'
        this.redirected = Boolean(init.redirected)
      }

      clone() {
        return new MockResponse(this.body, {
          status: this.status,
          statusText: this.statusText,
          headers: this.headers,
          type: this.type,
          redirected: this.redirected
        })
      }

      static error() {
        return new MockResponse('', { status: 0, type: 'error' })
      }
    }

    const state = { online, redirected }

    const fetchMock = async (input, init) => {
      // Mimic WebKit spec check: fetch(navigateRequest, nonEmptyInit) constructs new Request(input, init)
      if (input instanceof MockRequest && init && Object.keys(init).length > 0) {
        void new MockRequest(input, init)
      }

      const url = typeof input === 'string' ? new URL(input, 'https://numara.io/').href : input.url
      fetchCalls.push({ url, init })

      if (!state.online) {
        throw new TypeError('Failed to fetch')
      }

      return new MockResponse(`body:${url}`, { status: 200, redirected: state.redirected })
    }

    const swSource = fs
      .readFileSync(path.resolve('src/sw.js'), 'utf8')
      .replace('{{VERSION}}', '8.0.0-test')
      .replace("['__PRECACHE__']", JSON.stringify(['./', './index.html', './js/numara.js?v=8.0.0-test']))

    const context = vm.createContext({
      self: {
        location: new URL('https://numara.io/'),
        addEventListener(type, fn) {
          listeners[type] = fn
        },
        skipWaiting: () => {
          skippedWaiting = true
        },
        clients: {
          claim: async () => {
            claimed = true
          }
        }
      },
      caches: cachesMock,
      fetch: fetchMock,
      Request: MockRequest,
      Response: MockResponse,
      URL
    })

    vm.runInContext(swSource, context)

    return {
      state,
      storeMap,
      fetchCalls,
      listeners,
      MockRequest,
      getClaimed: () => claimed,
      getSkippedWaiting: () => skippedWaiting
    }
  }

  it('precaches clean non-redirected responses, purges old caches, and handles WebKit navigate + offline fallback', async () => {
    const sw = createSwHarness({ online: true, redirected: true })
    sw.storeMap.set('numara-v7.6.3', new Map([['./old.js', {}]]))

    // 1. Install
    let installPromise
    sw.listeners.install({ waitUntil: (p) => (installPromise = p) })
    await installPromise
    assert.strictEqual(sw.getSkippedWaiting(), true)

    const cacheBucket = sw.storeMap.get('numara-v8.0.0-test')
    assert.ok(cacheBucket)
    assert.strictEqual(cacheBucket.get('./index.html').redirected, false)

    // 2. Activate purges v7 cache and claims clients
    let activatePromise
    sw.listeners.activate({ waitUntil: (p) => (activatePromise = p) })
    await activatePromise
    assert.strictEqual(sw.storeMap.has('numara-v7.6.3'), false)
    assert.strictEqual(sw.storeMap.has('numara-v8.0.0-test'), true)
    assert.strictEqual(sw.getClaimed(), true)

    // 3. Navigate online (must NOT throw WebKit Request-with-navigate-and-init TypeError, and strips redirected)
    sw.fetchCalls.length = 0
    let navResult
    sw.listeners.fetch({
      request: new sw.MockRequest('https://numara.io/index.html', { mode: 'navigate' }),
      respondWith: (p) => (navResult = p)
    })
    const onlineNavRes = await navResult
    assert.strictEqual(onlineNavRes.ok, true)
    assert.strictEqual(onlineNavRes.redirected, false)
    assert.strictEqual(sw.fetchCalls.length, 1)

    // 4. Static precached asset is served cache-first with zero network calls
    sw.fetchCalls.length = 0
    let assetResult
    sw.listeners.fetch({
      request: new sw.MockRequest('https://numara.io/js/numara.js?v=8.0.0-test'),
      respondWith: (p) => (assetResult = p)
    })
    const cachedAsset = await assetResult
    assert.strictEqual(cachedAsset.ok, true)
    assert.strictEqual(sw.fetchCalls.length, 0)

    // 5. Cross-origin Frankfurter request is ignored by SW
    let crossOriginResponded = false
    sw.listeners.fetch({
      request: new sw.MockRequest('https://api.frankfurter.dev/v1/latest'),
      respondWith: () => (crossOriginResponded = true)
    })
    assert.strictEqual(crossOriginResponded, false)

    // 6. Offline navigation falls back to cached ./index.html shell
    sw.state.online = false
    let offlineNavResult
    sw.listeners.fetch({
      request: new sw.MockRequest('https://numara.io/?offline=1', { mode: 'navigate' }),
      respondWith: (p) => (offlineNavResult = p)
    })
    const offlineRes = await offlineNavResult
    assert.strictEqual(offlineRes.ok, true)
  })
})
