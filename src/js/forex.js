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
 * Get exchange rates and update the application.
 */
export function getRates() {
  if (!navigator.onLine) {
    dom.lastUpdated.innerHTML = 'No internet connection.'
    notify('No internet connection. Could not update exchange rates.', 'warning')
    return
  }

  dom.lastUpdated.innerHTML = '<div uk-spinner="ratio: 0.3"></div>'

  fetch(EXCHANGE_RATE_URL)
    .then((response) => response.json())
    .then((rates) => {
      updateCurrencyRates(rates)
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
 */
function updateCurrencyRates(rates) {
  if (!rates || typeof rates !== 'object') return

  let lastDate = null

  app.currencyRates = rates

  for (const rateCode in rates) {
    const { code, inverseRate, name, date } = rates[rateCode]

    math.createUnit(
      code,
      {
        aliases: Object.keys(math.Unit.UNITS).includes(code.toLowerCase()) ? [] : [code.toLowerCase()],
        definition: math.unit(inverseRate + USD_UNIT)
      },
      { override: true }
    )

    if (numaraHints.every((hint) => hint.text !== code)) {
      numaraHints.push({ text: code, desc: name, className: 'cm-currency' })
    }

    lastDate = date
  }

  if (lastDate) store.set('rateDate', lastDate)
}
