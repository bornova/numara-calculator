import { $, app, store } from './common'
import { cm, numaraHints } from './editor'
import { calculate, math } from './eval'
import { notify } from './modal'

math.createUnit('USD')

numaraHints.push({ text: 'USD', desc: 'U.S. Dollar', className: 'cm-currency' })

/** Get exchange rates. */
export function getRates() {
  const url = 'https://www.floatrates.com/widget/1030/cfc5515dfc13ada8d7b0e50b8143d55f/usd.json'

  if (navigator.onLine) {
    $('#lastUpdated').innerHTML = '<div uk-spinner="ratio: 0.3"></div>'

    fetch(url)
      .then((response) => response.json())
      .then((rates) => {
        app.currencyRates = rates

        Object.keys(rates).forEach((currency) => {
          math.createUnit(
            rates[currency].code,
            { definition: math.unit(rates[currency].inverseRate + 'USD') },
            { override: true }
          )

          if (!numaraHints.some((hint) => hint.text === rates[currency].code)) {
            numaraHints.push({ text: rates[currency].code, desc: rates[currency].name, className: 'cm-currency' })
          }

          store.set('rateDate', rates[currency].date)
        })

        $('#lastUpdated').innerHTML = store.get('rateDate')

        cm.setOption('mode', app.settings.syntax ? 'numara' : 'plain')

        calculate()
      })
      .catch((error) => {
        $('#lastUpdated').innerHTML = 'n/a'

        notify('Failed to get exchange rates (' + error + ')', 'warning')
      })
  } else {
    $('#lastUpdated').innerHTML = 'No internet connection.'

    notify('No internet connection. Could not update exchange rates.', 'warning')
  }
}
