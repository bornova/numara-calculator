import { $, app, store } from './common'
import { udfInput, uduInput } from './editor'
import { showError } from './modal'

/**
 * Apply user defined functions or units.
 *
 * @param {string} input User defined function or unit to apply.
 * @param {string} type 'func' | 'unit'
 * @returns {Promise<void>}
 */
export function applyUdfu(input, type) {
  return new Promise((resolve, reject) => {
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

/**
 * Save user defined functions.
 */
function saveUserDefinedFunctions() {
  applyUdfu(udfInput.getValue().trim(), 'func')
    .then(() => {
      location.reload()
    })
    .catch((error) => {
      showError(error.name, error.message)
    })
}

/**
 * Save user defined units.
 */
function saveUserDefinedUnits() {
  applyUdfu(uduInput.getValue().trim(), 'unit')
    .then(() => {
      location.reload()
    })
    .catch((error) => {
      showError(error.name, error.message)
    })
}

// Event listeners for saving user defined functions and units
$('#dialog-udfu-save-f').addEventListener('click', saveUserDefinedFunctions)
$('#dialog-udfu-save-u').addEventListener('click', saveUserDefinedUnits)
