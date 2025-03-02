import { $, app, store } from './common'
import { cm, numaraHints } from './editor'
import { calculate, math } from './eval'
import { notify } from './modal'

const USD_UNIT = 'USD'
const EXCHANGE_RATE_URL = 'https://www.floatrates.com/widget/1030/cfc5515dfc13ada8d7b0e50b8143d55f/usd.json'

math.createUnit(USD_UNIT)
numaraHints.push({ text: USD_UNIT, desc: 'U.S. Dollar', className: 'cm-currency' })

/**
 * Get exchange rates and update the application.
 */
export function getRates() {
  if (navigator.onLine) {
    $('#lastUpdated').innerHTML = '<div uk-spinner="ratio: 0.3"></div>'

    fetch(EXCHANGE_RATE_URL)
      .then((response) => response.json())
      .then((rates) => {
        updateCurrencyRates(rates)
        $('#lastUpdated').innerHTML = store.get('rateDate')
        cm.setOption('mode', app.settings.syntax ? 'numara' : 'plain')
        calculate()
      })
      .catch((error) => {
        handleFetchError(error)
      })
  } else {
    handleNoInternetConnection()
  }
}

/**
 * Update currency rates in the application.
 * @param {Object} rates - The exchange rates data.
 */
function updateCurrencyRates(rates) {
  app.currencyRates = rates

  Object.keys(rates).forEach((currency) => {
    const rate = rates[currency]

    math.createUnit(rate.code, { definition: math.unit(rate.inverseRate + USD_UNIT) }, { override: true })

    if (!numaraHints.some((hint) => hint.text === rate.code)) {
      numaraHints.push({ text: rate.code, desc: rate.name, className: 'cm-currency' })
    }

    store.set('rateDate', rate.date)
  })
}

/**
 * Handle fetch error for exchange rates.
 * @param {Error} error - The error object.
 */
function handleFetchError(error) {
  $('#lastUpdated').innerHTML = 'n/a'
  notify('Failed to get exchange rates (' + error + ')', 'warning')
}

/**
 * Handle no internet connection scenario.
 */
function handleNoInternetConnection() {
  $('#lastUpdated').innerHTML = 'No internet connection.'
  notify('No internet connection. Could not update exchange rates.', 'warning')
}
