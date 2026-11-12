import { BUILTIN_MATH_KEYS, BUILTIN_UNIT_KEYS, refreshCurrencyState } from '../core/mathInstance.js'
import { escapeHTML } from '../core/utils.js'
import { dom } from '../dom.js'
import { CLASS_NAMES, refreshCurrencyTokens } from '../editor/constants.js'
import { numaraHints } from '../editor/hints.js'
import { cm } from '../editor/index.js'
import { app } from '../state/appState.js'
import { store } from '../state/store.js'
import { notify } from '../ui/dialogs.js'
import { calculate, clearEvaluationCache } from './calcManager.js'

const RATES_URL = 'https://api.frankfurter.dev/v2/rates?base=USD'
const SYMBOLS_URL = 'https://api.frankfurter.dev/v2/currencies'

const DEFAULTS = {
  USD: { symbol: '$', name: 'U.S. Dollar' },
  EUR: { symbol: '€', name: 'Euro' },
  GBP: { symbol: '£', name: 'British Pound' },
  CNY: { symbol: '¥', name: 'Chinese Yuan' },
  INR: { symbol: '₹', name: 'Indian Rupee' },
  KRW: { symbol: '₩', name: 'South Korean Won' },
  RUB: { symbol: '₽', name: 'Russian Ruble' },
  TRY: { symbol: '₺', name: 'Turkish Lira' },
  BRL: { symbol: 'R$', name: 'Brazilian Real' },
  ILS: { symbol: '₪', name: 'Israeli New Shekel' },
  PHP: { symbol: '₱', name: 'Philippine Peso' },
  THB: { symbol: '฿', name: 'Thai Baht' },
  VND: { symbol: '₫', name: 'Vietnamese Dong' },
  UAH: { symbol: '₴', name: 'Ukrainian Hryvnia' },
  NGN: { symbol: '₦', name: 'Nigerian Naira' },
  PLN: { symbol: 'zł', name: 'Polish Zloty' },
  CZK: { symbol: 'Kč', name: 'Czech Koruna' },
  SEK: { symbol: 'kr', name: 'Swedish Krona' },
  DKK: { symbol: 'kr.', name: 'Danish Krone' },
  IDR: { symbol: 'Rp', name: 'Indonesian Rupiah' },
  MYR: { symbol: 'RM', name: 'Malaysian Ringgit' },
  KZT: { symbol: '₸', name: 'Kazakhstani Tenge' },
  AZN: { symbol: '₼', name: 'Azerbaijani Manat' },
  GEL: { symbol: '₾', name: 'Georgian Lari' },
  BDT: { symbol: '৳', name: 'Bangladeshi Taka' },
  PKR: { symbol: '₨', name: 'Pakistani Rupee' },
  IRR: { symbol: '﷼', name: 'Iranian Rial' },
  SAR: { symbol: 'ر.س', name: 'Saudi Riyal' },
  AED: { symbol: 'د.إ', name: 'United Arab Emirates Dirham' },
  CRC: { symbol: '₡', name: 'Costa Rican Colón' },
  PYG: { symbol: '₲', name: 'Paraguayan Guaraní' },
  GHS: { symbol: '₵', name: 'Ghanaian Cedi' },
  LAK: { symbol: '₭', name: 'Lao Kip' },
  MNT: { symbol: '₮', name: 'Mongolian Tögrög' },
  KHR: { symbol: '៛', name: 'Cambodian Riel' },
  AMD: { symbol: '֏', name: 'Armenian Dram' },
  AFN: { symbol: '؋', name: 'Afghan Afghani' },
  ANG: { symbol: 'ƒ', name: 'Netherlands Antillean Guilder' },
  XPF: { symbol: '₣', name: 'CFP Franc' },
  PEN: { symbol: 'S/', name: 'Peruvian Sol' },
  NIO: { symbol: 'C$', name: 'Nicaraguan Córdoba' },
  TOP: { symbol: 'T$', name: 'Tongan Paʻanga' },
  UYU: { symbol: '$U', name: 'Uruguayan Peso' },
  BTC: { symbol: '₿', name: 'Bitcoin' },
  ETH: { symbol: 'Ξ', name: 'Ethereum' },
  LTC: { symbol: 'Ł', name: 'Litecoin' },
  ADA: { symbol: '₳', name: 'Cardano' }
}

const registeredCurrencyHints = new Set()

function hasBuiltinConflict(token) {
  return (
    BUILTIN_UNIT_KEYS.has(token) ||
    BUILTIN_UNIT_KEYS.has(token.toLowerCase()) ||
    BUILTIN_MATH_KEYS.has(token.toLowerCase())
  )
}

/**
 * Return true if the currency symbol conflicts with a built-in mathjs unit, function, or constant.
 * @param {string} symbol Currency symbol.
 * @returns {boolean}
 */
function isSymbolConflict(symbol) {
  return !symbol || /\s/.test(symbol) || hasBuiltinConflict(symbol)
}

/**
 * Return true if the code conflicts with a built-in mathjs unit OR function/constant.
 * This prevents currency codes like MAD (Moroccan Dirham) from shadowing functions like mad().
 * @param {string} code Currency code.
 * @param {string} [symbol] Optional currency symbol.
 * @returns {boolean} True if the code or symbol conflicts with a built-in mathjs unit or function/constant.
 */
function isMathUnit(code, symbol) {
  return hasBuiltinConflict(code) || Boolean(symbol && isSymbolConflict(symbol))
}

/**
 * Applies updated currencies to app state, autocomplete hints, Math.js units, and syntax tokens.
 * @param {object} currencies Currencies map.
 */
function applyCurrenciesState(currencies) {
  app.currencies = currencies

  for (const [code, { name }] of Object.entries(currencies)) {
    if (!registeredCurrencyHints.has(code)) {
      registeredCurrencyHints.add(code)
      numaraHints.push({ text: code, desc: name, className: CLASS_NAMES.CURRENCY })
    }
  }

  refreshCurrencyState(currencies)
  refreshCurrencyTokens()
}

/**
 * Fetch a URL and return parsed JSON, retrying on transient failure.
 * @param {string} url URL to fetch.
 * @param {number} [retries=3] Number of retries.
 * @returns {Promise<any>} Parsed JSON response.
 */
async function fetchJSON(url, retries = 3) {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(10000) })

      if (!response.ok) {
        const httpError = new Error(`HTTP error ${response.status}`)

        httpError.status = response.status
        throw httpError
      }

      const contentType = response.headers.get('content-type') || ''

      if (!contentType.includes('application/json')) {
        throw new Error(`Unexpected currency API response format (${contentType || 'unknown'})`)
      }

      return await response.json()
    } catch (error) {
      if (attempt === retries - 1 || (error.status >= 400 && error.status < 500)) throw error

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
      if (!code || currencies[code] || isMathUnit(code)) continue

      const safeSymbol = symbol && !isSymbolConflict(symbol) ? symbol : code

      currencies[code] = { symbol: safeSymbol, name: name || code }
    }
  } else if (app.currencies) {
    for (const [code, info] of Object.entries(app.currencies)) {
      if (!currencies[code] && info && !isMathUnit(code, info.symbol)) {
        currencies[code] = { symbol: info.symbol || code, name: info.name || code }
      }
    }
  }

  let lastDate = null

  if (Array.isArray(rateList)) {
    for (const { quote: code, rate, date } of rateList) {
      const numRate = Number(rate)

      if (!code || !Number.isFinite(numRate) || numRate <= 0) continue
      if (!currencies[code] && isMathUnit(code, null)) continue

      currencies[code] = currencies[code] || { symbol: code, name: code }
      currencies[code].rate = 1 / numRate
      lastDate = date
    }
  }

  return { currencies, lastDate }
}

/**
 * Initialize USD as the base unit and refresh currencies from local storage.
 */
export function initCurrencies() {
  const stored = store.get('currencies') || { USD: { ...DEFAULTS.USD } }

  for (const [code, def] of Object.entries(DEFAULTS)) {
    stored[code] = { ...(stored[code] || {}), ...def }
  }

  for (const code of Object.keys(stored)) {
    const { symbol } = stored[code]

    if (!DEFAULTS[code] && isMathUnit(code, symbol)) delete stored[code]
  }

  applyCurrenciesState(stored)
}

/**
 * Fetch latest rates and refresh the application's currency state.
 * @param {boolean} [isManual=false] Whether the update was triggered manually.
 * @returns {Promise<void>}
 */
export async function getRates(isManual = false) {
  if (!navigator.onLine) {
    if (isManual || !store.get('rateDate')) {
      notify('No internet connection. Could not update exchange rates.', 'warning')
    }

    return
  }

  const startTime = Date.now()

  if (dom.updateRatesLink) dom.updateRatesLink.classList.add('spin')

  try {
    const [symbols, rates] = await Promise.all([fetchJSON(SYMBOLS_URL).catch(() => null), fetchJSON(RATES_URL)])
    const { currencies, lastDate } = buildCurrencies(symbols, rates)

    applyCurrenciesState(currencies)
    store.set('currencies', currencies)

    if (lastDate) {
      store.set('rateDate', lastDate)
    }

    cm.setOption('mode', app.settings?.syntax ? 'numara' : 'plain')

    clearEvaluationCache()
    calculate()
  } catch (error) {
    if (isManual || !store.get('rateDate')) {
      notify('Failed to get exchange rates (' + escapeHTML(String(error)) + ')', 'warning')
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
