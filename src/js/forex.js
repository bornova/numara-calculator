import { dom } from './dom'
import { cm, numaraHints } from './editor'
import { notify } from './modal'
import { app, store } from './utils'

const USD_UNIT = 'USD'
const EXCHANGE_RATE_URL = 'https://www.floatrates.com/widget/1030/cfc5515dfc13ada8d7b0e50b8143d55f/usd.json'

/**
 * Currency symbol to code mappings.
 * Maps common currency symbols to their ISO 4217 three-letter codes.
 * Symbols are sorted by specificity (e.g., A$ for AUD, C$ for CAD before generic $).
 */
export const CURRENCY_SYMBOLS = {
  $: 'USD', // US Dollar
  '£': 'GBP', // British Pound
  '€': 'EUR', // Euro
  '¥': 'JPY', // Japanese Yen
  '₹': 'INR', // Indian Rupee
  '₩': 'KRW', // South Korean Won
  '₽': 'RUB', // Russian Ruble
  C$: 'CAD', // Canadian Dollar
  A$: 'AUD', // Australian Dollar
  NZ$: 'NZD', // New Zealand Dollar
  HK$: 'HKD', // Hong Kong Dollar
  S$: 'SGD', // Singapore Dollar
  R$: 'BRL', // Brazilian Real
  R: 'ZAR', // South African Rand
  kr: 'SEK', // Swedish Krona
  Fr: 'CHF', // Swiss Franc
  '₪': 'ILS', // Israeli Shekel
  '₺': 'TRY', // Turkish Lira
  '₴': 'UAH', // Ukrainian Hryvnia
  '₱': 'PHP', // Philippine Peso
  '₨': 'PKR', // Pakistani Rupee
  '₦': 'NGN', // Nigerian Naira
  '₵': 'GHS', // Ghanaian Cedi
  '₡': 'CRC', // Costa Rican Colón
  '₸': 'KZT', // Kazakhstani Tenge
  '₮': 'MNT', // Mongolian Tugrik
  '₿': 'BTC' // Bitcoin
}

/**
 * Initialize USD currency hints and unit.
 *
 * USD must be initialized separately because:
 * 1. It's the base currency - all other currencies are defined relative to USD
 * 2. It needs to exist before other currencies can be created (they're defined as multiples of USD)
 * 3. It should be available even when offline or if the exchange rate API fails
 *
 * @param {object} math - The math.js instance
 */
export function initializeUSDHints(math) {
  // Create USD unit with symbol alias
  math.createUnit(USD_UNIT, { aliases: [USD_UNIT.toLowerCase(), '$'] })

  numaraHints.push({ text: USD_UNIT, desc: 'U.S. Dollar', className: 'cm-currency' })
  numaraHints.push({ text: '$', desc: 'U.S. Dollar ($)', className: 'cm-currency' })
}

/**
 * Get exchange rates and update the application.
 * @param {object} math - The math.js instance
 * @param {function} calculate - The calculate function
 */
export function getRates(math, calculate) {
  if (!navigator.onLine) {
    dom.lastUpdated.innerHTML = 'No internet connection.'
    notify('No internet connection. Could not update exchange rates.', 'warning')
    return
  }

  dom.lastUpdated.innerHTML = '<div uk-spinner="ratio: 0.3"></div>'

  fetch(EXCHANGE_RATE_URL)
    .then((response) => response.json())
    .then((rates) => {
      updateCurrencyRates(rates, math)
      dom.lastUpdated.innerHTML = store.get('rateDate')
      cm.setOption('mode', app.settings.syntax ? 'numara' : 'plain')
      calculate()
    })
    .catch((error) => {
      dom.lastUpdated.innerHTML = 'n/a'
      notify('Failed to get exchange rates (' + error + ')', 'warning')
    })
}

/**
 * Update currency rates in the application.
 * @param {Object} rates - The exchange rates data.
 * @param {object} math - The math.js instance
 */
function updateCurrencyRates(rates, math) {
  if (!rates || typeof rates !== 'object') return

  let lastDate = null

  app.currencyRates = rates

  for (const rateCode in rates) {
    const { code, inverseRate, name, date } = rates[rateCode]

    // Find symbol for this currency
    const symbol = Object.keys(CURRENCY_SYMBOLS).find((sym) => CURRENCY_SYMBOLS[sym] === code)

    // Build aliases array
    const aliases = []
    if (!Object.keys(math.Unit.UNITS).includes(code.toLowerCase())) {
      aliases.push(code.toLowerCase())
    }
    if (symbol) {
      aliases.push(symbol)
    }

    math.createUnit(
      code,
      {
        aliases: aliases,
        definition: math.unit(inverseRate + USD_UNIT)
      },
      { override: true }
    )

    if (numaraHints.every((hint) => hint.text !== code)) {
      numaraHints.push({ text: code, desc: name, className: 'cm-currency' })
    }

    // Add symbol hint if it exists
    if (symbol && numaraHints.every((hint) => hint.text !== symbol)) {
      numaraHints.push({ text: symbol, desc: `${name} (${symbol})`, className: 'cm-currency' })
    }

    lastDate = date
  }

  if (lastDate) store.set('rateDate', lastDate)
}
