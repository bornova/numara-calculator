import { dom } from '../dom'
import { cm, numaraHints, refreshCurrencyTokens } from '../editor'
import { calculate, math, refreshCurrencyState } from './calcManager'
import { notify } from '../ui/dialogs'
import { app, store } from '../appState'

const USD_UNIT = 'USD'
const RATES_URL = 'https://api.frankfurter.dev/v2/rates?base=USD'
const SYMBOLS_URL = 'https://api.frankfurter.dev/v2/currencies'

const DEFAULTS = {
  USD: { symbol: '$', name: 'U.S. Dollar', locale: 'en-US' },
  EUR: { symbol: '€', name: 'Euro', locale: 'de-DE' },
  GBP: { symbol: '£', name: 'British Pound', locale: 'en-GB' },
  CNY: { symbol: '¥', name: 'Chinese Yuan', locale: 'zh-CN' },
  RUB: { symbol: '₽', name: 'Russian Ruble', locale: 'ru-RU' },
  TRY: { symbol: '₺', name: 'Turkish Lira', locale: 'tr-TR' }
}

const BUILTIN_UNIT_KEYS = new Set(Object.keys(math.Unit.UNITS))
const BUILTIN_MATH_KEYS = new Set(Object.keys(math.expression.mathWithTransform))

/**
 * Return true if the code or symbol conflicts with a built-in mathjs unit OR function/constant.
 * This prevents currency codes like MAD (Moroccan Dirham) from shadowing functions like mad().
 * @param {string} code Currency code.
 * @param {string} symbol Currency symbol.
 * @returns {boolean} True if the code or symbol conflicts with a built-in mathjs unit or function/constant.
 */
function isMathUnit(code, symbol) {
  if (BUILTIN_UNIT_KEYS.has(code) || BUILTIN_UNIT_KEYS.has(code.toLowerCase())) return true
  if (symbol && (BUILTIN_UNIT_KEYS.has(symbol) || BUILTIN_UNIT_KEYS.has(symbol.toLowerCase()))) return true
  if (BUILTIN_MATH_KEYS.has(code.toLowerCase())) return true

  return false
}

/**
 * Register a currency code as a math unit and an autocomplete hint.
 * @param {string} code Currency code.
 * @param {string} name Currency name.
 * @param {number} rate Currency rate.
 */
function registerCurrencyUnit(code, name, rate) {
  if (code !== USD_UNIT && rate) {
    math.createUnit(
      code,
      {
        aliases:
          code.toLowerCase() in math.Unit.UNITS || BUILTIN_MATH_KEYS.has(code.toLowerCase())
            ? []
            : [code.toLowerCase()],
        definition: math.unit(`${rate} ${USD_UNIT}`)
      },
      { override: true }
    )
  }

  if (!numaraHints.some((h) => h.text === code)) {
    numaraHints.push({ text: code, desc: name, className: 'cm-currency' })
  }
}

/** Initialize USD as the base unit and refresh currencies. */
export function initCurrencies() {
  math.createUnit(USD_UNIT, { aliases: [USD_UNIT.toLowerCase()] })

  const stored = store.get('currencies') || { USD: { ...DEFAULTS.USD } }

  for (const [code, def] of Object.entries(DEFAULTS)) {
    stored[code] = { ...(stored[code] || {}), ...def }
  }

  for (const code of Object.keys(stored)) {
    const { symbol } = stored[code]
    if (!DEFAULTS[code] && isMathUnit(code, symbol)) delete stored[code]
  }

  app.currencies = stored

  for (const [code, { name, rate }] of Object.entries(app.currencies)) {
    registerCurrencyUnit(code, name, rate)
  }

  refreshCurrencyState()
  refreshCurrencyTokens()
}

/**
 * Fetch a URL and return parsed JSON, retrying on failure.
 * @param {string} url URL to fetch.
 * @param {number} retries Number of retries.
 * @returns {Promise<object>} Parsed JSON response.
 */
async function fetchJSON(url, retries = 3) {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch(url)

      if (!response.ok) throw new Error(`HTTP error ${response.status}`)

      const contentType = response.headers.get('content-type') || ''

      if (!contentType.includes('application/json')) {
        throw new Error(`Unexpected currency API response format (${contentType || 'unknown'})`)
      }

      return await response.json()
    } catch (error) {
      if (attempt === retries - 1) throw error

      await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt))
    }
  }
}

/**
 * Build the unified currencies map from API responses.
 * @param {*} symbolList List of currency symbols.
 * @param {*} rateList List of currency rates.
 * @returns {{currencies: object, lastDate: string}} The unified currencies map and last date.
 */
function buildCurrencies(symbolList, rateList) {
  const currencies = {}

  for (const [code, def] of Object.entries(DEFAULTS)) {
    currencies[code] = { ...def }
  }

  if (Array.isArray(symbolList)) {
    for (const { iso_code: code, symbol, name } of symbolList) {
      if (!code || currencies[code] || isMathUnit(code, symbol)) continue

      currencies[code] = { symbol: symbol || code, name: name || code }
    }
  }

  let lastDate = null

  if (Array.isArray(rateList)) {
    for (const { quote: code, rate, date } of rateList) {
      if (!code || !rate) continue
      if (!currencies[code] && isMathUnit(code, null)) continue

      currencies[code] = currencies[code] || { symbol: code, name: code }
      currencies[code].rate = 1 / rate
      lastDate = date
    }
  }

  return { currencies, lastDate }
}

/** Fetch latest rates and refresh the application's currency state. */
export async function getRates(isManual = false) {
  if (!navigator.onLine) {
    if (dom.lastUpdated) dom.lastUpdated.textContent = 'Offline'

    if (isManual || !store.get('rateDate')) {
      notify('No internet connection. Could not update exchange rates.', 'warning')
    }

    return
  }

  if (dom.lastUpdated) dom.lastUpdated.innerHTML = '<div uk-spinner="ratio: 0.3"></div>'

  const startTime = Date.now()

  if (dom.updateRatesLink) dom.updateRatesLink.classList.add('spin')

  try {
    const [symbols, rates] = await Promise.all([fetchJSON(SYMBOLS_URL), fetchJSON(RATES_URL)])
    const { currencies, lastDate } = buildCurrencies(symbols, rates)

    for (const [code, { name, rate }] of Object.entries(currencies)) {
      registerCurrencyUnit(code, name, rate)
    }

    app.currencies = currencies
    store.set('currencies', currencies)

    if (lastDate) {
      store.set('rateDate', lastDate)
    }

    refreshCurrencyState()
    refreshCurrencyTokens()

    if (dom.lastUpdated) {
      dom.lastUpdated.textContent = store.get('rateDate')
    }

    cm.setOption('mode', app.settings.syntax ? 'numara' : 'plain')

    calculate()
  } catch (error) {
    if (dom.lastUpdated) {
      dom.lastUpdated.textContent = 'n/a'
    }

    if (isManual || !store.get('rateDate')) {
      notify('Failed to get exchange rates (' + error + ')', 'warning')
    }
  } finally {
    const elapsed = Date.now() - startTime
    const minDuration = 1000 // 1s matches CSS animation speed for 1 full rotation

    if (elapsed < minDuration) {
      setTimeout(() => {
        if (dom.updateRatesLink) {
          dom.updateRatesLink.classList.remove('spin')
        }
      }, minDuration - elapsed)
    } else {
      if (dom.updateRatesLink) {
        dom.updateRatesLink.classList.remove('spin')
      }
    }
  }
}
