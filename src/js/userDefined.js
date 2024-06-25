import { $, app, store } from './common'
import { udfInput, uduInput } from './editor'
import { showError } from './modal'

/**
 * User defined functions and units.
 *
 * @param {*} input User defined function or unit to apply.
 * @param {string} type 'func' | 'unit'
 */
export function applyUdfu(input, type) {
  return new Promise(function (resolve, reject) {
    try {
      const loadUD =
        type === 'func'
          ? new Function(`'use strict'; let window; let numara; math.import({${input}}, {override: true})`)
          : new Function(`'use strict'; let window; let numara; math.createUnit({${input}}, {override: true})`)

      loadUD()

      const UDFunc = new Function(`'use strict'; return {${input}}`)

      for (const f in UDFunc()) {
        app[type === 'func' ? 'udfList' : 'uduList'].push(f)
      }

      store.set(type === 'func' ? 'udf' : 'udu', input)

      resolve()
    } catch (error) {
      reject(error)
    }
  })
}

$('#dialog-udfu-save-f').addEventListener('click', () => {
  applyUdfu(udfInput.getValue().trim(), 'func')
    .then(() => {
      location.reload()
    })
    .catch((error) => {
      showError(error.name, error.message)
    })
})

$('#dialog-udfu-save-u').addEventListener('click', () => {
  applyUdfu(uduInput.getValue().trim(), 'unit')
    .then(() => {
      location.reload()
    })
    .catch((error) => {
      showError(error.name, error.message)
    })
})
