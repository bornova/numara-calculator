import { BUILTIN_MATH_KEYS, BUILTIN_UNIT_KEYS } from '../core/mathInstance.js'
import { escapeHTML } from '../core/utils.js'
import { dom } from '../dom.js'
import { CLASS_NAMES, cm, numaraHints, refreshCurrencyTokens } from '../editor/index.js'
import { app } from '../state/appState.js'
import { store } from '../state/store.js'
import { notify } from '../ui/dialogs.js'
import { calculate, clearEvaluationCache, refreshCurrencyState } from './calcManager.js'

const RATES_URL = 'https://api.frankfurter.dev/v2/rates?base=USD'
const SYMBOLS_URL = 'https://api.frankfurter.dev/v2/currencies'

const DEFAULTS = {
  USD: { symbol: '$', name: 'U.S. Dollar', locale: 'en-US' },
  EUR: { symbol: '€', name: 'Euro', locale: 'de-DE' },
  GBP: { symbol: '£', name: 'British Pound', locale: 'en-GB' },
  CNY: { symbol: '¥', name: 'Chinese Yuan', locale: 'zh-CN' },
  INR: { symbol: '₹', name: 'Indian Rupee', locale: 'en-IN' },
  KRW: { symbol: '₩', name: 'South Korean Won', locale: 'ko-KR' },
  RUB: { symbol: '₽', name: 'Russian Ruble', locale: 'ru-RU' },
  TRY: { symbol: '₺', name: 'Turkish Lira', locale: 'tr-TR' },
  BRL: { symbol: 'R$', name: 'Brazilian Real', locale: 'pt-BR' },
  ILS: { symbol: '₪', name: 'Israeli New Shekel', locale: 'he-IL' },
  PHP: { symbol: '₱', name: 'Philippine Peso', locale: 'en-PH' },
  THB: { symbol: '฿', name: 'Thai Baht', locale: 'th-TH' },
  VND: { symbol: '₫', name: 'Vietnamese Dong', locale: 'vi-VN' },
  UAH: { symbol: '₴', name: 'Ukrainian Hryvnia', locale: 'uk-UA' },
  NGN: { symbol: '₦', name: 'Nigerian Naira', locale: 'en-NG' },
  PLN: { symbol: 'zł', name: 'Polish Zloty', locale: 'pl-PL' },
  CZK: { symbol: 'Kč', name: 'Czech Koruna', locale: 'cs-CZ' },
  SEK: { symbol: 'kr', name: 'Swedish Krona', locale: 'sv-SE' },
  DKK: { symbol: 'kr.', name: 'Danish Krone', locale: 'da-DK' },
  IDR: { symbol: 'Rp', name: 'Indonesian Rupiah', locale: 'id-ID' },
  MYR: { symbol: 'RM', name: 'Malaysian Ringgit', locale: 'ms-MY' },
  KZT: { symbol: '₸', name: 'Kazakhstani Tenge', locale: 'kk-KZ' },
  AZN: { symbol: '₼', name: 'Azerbaijani Manat', locale: 'az-AZ' },
  GEL: { symbol: '₾', name: 'Georgian Lari', locale: 'ka-GE' },
  BDT: { symbol: '৳', name: 'Bangladeshi Taka', locale: 'bn-BD' },
  PKR: { symbol: '₨', name: 'Pakistani Rupee', locale: 'ur-PK' },
  IRR: { symbol: '﷼', name: 'Iranian Rial', locale: 'fa-IR' },
  SAR: { symbol: 'ر.س', name: 'Saudi Riyal', locale: 'ar-SA' },
  AED: { symbol: 'د.إ', name: 'United Arab Emirates Dirham', locale: 'ar-AE' },
  CRC: { symbol: '₡', name: 'Costa Rican Colón', locale: 'es-CR' },
  PYG: { symbol: '₲', name: 'Paraguayan Guaraní', locale: 'es-PY' },
  GHS: { symbol: '₵', name: 'Ghanaian Cedi', locale: 'en-GH' },
  LAK: { symbol: '₭', name: 'Lao Kip', locale: 'lo-LA' },
  MNT: { symbol: '₮', name: 'Mongolian Tögrög', locale: 'mn-MN' },
  KHR: { symbol: '៛', name: 'Cambodian Riel', locale: 'km-KH' },
  AMD: { symbol: '֏', name: 'Armenian Dram', locale: 'hy-AM' },
  AFN: { symbol: '؋', name: 'Afghan Afghani', locale: 'ps-AF' },
  ANG: { symbol: 'ƒ', name: 'Netherlands Antillean Guilder', locale: 'nl-CW' },
  XPF: { symbol: '₣', name: 'CFP Franc', locale: 'fr-PF' },
  PEN: { symbol: 'S/', name: 'Peruvian Sol', locale: 'es-PE' },
  NIO: { symbol: 'C$', name: 'Nicaraguan Córdoba', locale: 'es-NI' },
  TOP: { symbol: 'T$', name: 'Tongan Paʻanga', locale: 'to-TO' },
  UYU: { symbol: '$U', name: 'Uruguayan Peso', locale: 'es-UY' },
  BTC: { symbol: '₿', name: 'Bitcoin', locale: 'en-US' },
  ETH: { symbol: 'Ξ', name: 'Ethereum', locale: 'en-US' },
  LTC: { symbol: 'Ł', name: 'Litecoin', locale: 'en-US' },
  ADA: { symbol: '₳', name: 'Cardano', locale: 'en-US' }
}

const registeredCurrencyHints = new Set()

/**
 * Return true if the currency symbol conflicts with a built-in mathjs unit, function, or constant.
 * @param {string} symbol Currency symbol.
 * @returns {boolean}
 */
function isSymbolConflict(symbol) {
  if (!symbol || /\s/.test(symbol)) return true
  if (BUILTIN_UNIT_KEYS.has(symbol) || BUILTIN_UNIT_KEYS.has(symbol.toLowerCase())) return true
  if (BUILTIN_MATH_KEYS.has(symbol.toLowerCase())) return true

  return false
}

/**
 * Return true if the code conflicts with a built-in mathjs unit OR function/constant.
 * This prevents currency codes like MAD (Moroccan Dirham) from shadowing functions like mad().
 * @param {string} code Currency code.
 * @param {string} [symbol] Optional currency symbol.
 * @returns {boolean} True if the code or symbol conflicts with a built-in mathjs unit or function/constant.
 */
function isMathUnit(code, symbol) {
  if (BUILTIN_UNIT_KEYS.has(code) || BUILTIN_UNIT_KEYS.has(code.toLowerCase())) return true
  if (symbol && isSymbolConflict(symbol)) return true
  if (BUILTIN_MATH_KEYS.has(code.toLowerCase())) return true

  return false
}

/**
 * Register a currency code as an autocomplete hint.
 * @param {string} code Currency code.
 * @param {string} name Currency name.
 */
function registerCurrencyHint(code, name) {
  if (!registeredCurrencyHints.has(code)) {
    registeredCurrencyHints.add(code)
    numaraHints.push({ text: code, desc: name, className: CLASS_NAMES.CURRENCY })
  }
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

  app.currencies = stored

  for (const [code, { name }] of Object.entries(app.currencies)) {
    registerCurrencyHint(code, name)
  }

  refreshCurrencyState()
  refreshCurrencyTokens()
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

    for (const [code, { name }] of Object.entries(currencies)) {
      registerCurrencyHint(code, name)
    }

    app.currencies = currencies
    store.set('currencies', currencies)

    if (lastDate) {
      store.set('rateDate', lastDate)
    }

    refreshCurrencyState()
    refreshCurrencyTokens()

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
