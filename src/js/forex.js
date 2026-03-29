import { dom } from './dom'
import { cm, numaraHints } from './editor'
import { calculate, math } from './eval'
import { notify } from './modal'
import { app, store } from './utils'

const USD_UNIT = 'USD'
const EXCHANGE_RATE_URL = 'https://www.floatrates.com/widget/1030/cfc5515dfc13ada8d7b0e50b8143d55f/usd.json'

export const currencySymbols = {
  CNY: '¥',
  GBP: '£',
  EUR: '€',
  RUB: '₽',
  TRY: '₺',
  USD: '$'
}

export function initializeUSD() {
  math.createUnit(USD_UNIT, { aliases: [USD_UNIT.toLowerCase()] })
  numaraHints.push({ text: USD_UNIT, desc: 'U.S. Dollar', className: 'cm-currency' })
}

/**
 * Fetch a URL and return parsed JSON, retrying on failure.
 * @param {string} url - The URL to fetch.
 * @param {number} retries - Number of attempts.
 * @returns {Promise<any>} Parsed JSON response.
 */
async function fetchWithRetry(url, retries = 3) {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch(url)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      return await response.json()
    } catch (error) {
      if (attempt === retries - 1) throw error
      await new Promise((resolve) => setTimeout(resolve, 1000 * Math.pow(2, attempt)))
    }
  }
}

/**
 * Get exchange rates and update the application.
 */
export async function getRates() {
  if (!navigator.onLine) {
    dom.lastUpdated.textContent = 'No internet connection.'
    notify('No internet connection. Could not update exchange rates.', 'warning')
    return
  }

  dom.lastUpdated.innerHTML = '<div uk-spinner="ratio: 0.3"></div>'

  try {
    const rates = await fetchWithRetry(EXCHANGE_RATE_URL)
    updateCurrencyRates(rates)
    dom.lastUpdated.textContent = store.get('rateDate')
    cm.setOption('mode', app.settings.syntax ? 'numara' : 'plain')
    calculate()
  } catch (error) {
    dom.lastUpdated.textContent = 'n/a'
    notify('Failed to get exchange rates (' + error + ')', 'warning')
  }
}

/**
 * Update currency rates in the application.
 * @param {Object} rates - The exchange rates data.
 */
function updateCurrencyRates(rates) {
  if (!rates || typeof rates !== 'object') return

  let lastDate = null

  app.currencyRates = rates

  Object.values(rates).forEach(({ code, inverseRate, name, date }) => {
    math.createUnit(
      code,
      {
        aliases: code.toLowerCase() in math.Unit.UNITS ? [] : [code.toLowerCase()],
        definition: math.unit(`${inverseRate} ${USD_UNIT}`)
      },
      { override: true }
    )

    if (!numaraHints.some((hint) => hint.text === code)) {
      numaraHints.push({ text: code, desc: name, className: 'cm-currency' })
    }

    lastDate = date
  })

  if (lastDate) store.set('rateDate', lastDate)
}
