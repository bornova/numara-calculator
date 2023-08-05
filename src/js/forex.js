import { $, app, store } from './common.js'
import { cm } from './editor.js'
import { calculate, math } from './math.js'
import { notify } from './modal.js'

math.createUnit('USD', { aliases: ['usd'] })

/** Get exchange rates. */
export function getRates() {
  const url = 'https://www.floatrates.com/widget/1030/cfc5515dfc13ada8d7b0e50b8143d55f/usd.json'

  if (navigator.onLine) {
    $('#lastUpdated').innerHTML = '<div uk-spinner="ratio: 0.3"></div>'

    fetch(url)
      .then((response) => response.json())
      .then((rates) => {
        const dups = ['cup']

        app.currencyRates = rates

        Object.keys(rates).forEach((currency) => {
          math.createUnit(
            rates[currency].code,
            {
              definition: math.unit(rates[currency].inverseRate + 'USD'),
              aliases: [dups.includes(rates[currency].code.toLowerCase()) ? '' : rates[currency].code.toLowerCase()]
            },
            { override: true }
          )

          store.set('rateDate', rates[currency].date)
        })

        $('#lastUpdated').innerHTML = store.get('rateDate')

        cm.setOption('mode', app.settings.syntax ? 'numara' : 'plain')

        calculate()
      })
      .catch((e) => {
        $('#lastUpdated').innerHTML = 'n/a'

        notify('Failed to get exchange rates (' + e + ')', 'warning')
      })
  } else {
    $('#lastUpdated').innerHTML = 'No internet connection.'

    notify('No internet connection. Could not update exchange rates.', 'warning')
  }
}
