import { dom } from './dom'
import { udfInput, uduInput } from './editor'
import { math } from './eval'
import { showError } from './modal'
import { app, store } from './utils'

/**
 * Apply user defined functions or units.
 * @param {string} input User defined function or unit to apply.
 * @param {string} type 'func' | 'unit'
 * @returns {Promise<void>}
 */
export function applyUdfu(input, type) {
  return new Promise((resolve, reject) => {
    try {
      const isFunc = type === 'func'
      const UDFunc = new Function(`'use strict'; return {${input}}`)
      const udfObj = UDFunc()

      if (isFunc) {
        math.import(udfObj, { override: true })
      } else {
        math.createUnit(udfObj, { override: true })
      }

      for (const f in udfObj) {
        app[isFunc ? 'udfList' : 'uduList'].push(f)
      }

      store.set(isFunc ? 'udf' : 'udu', input)
      resolve()
    } catch (error) {
      reject(error)
    }
  })
}

/**
 * Save user defined functions or units.
 * @param {object} input Input element containing user defined function or unit.
 * @param {string} type 'func' | 'unit'
 */
function saveUserDefined(input, type) {
  applyUdfu(input.getValue().trim(), type)
    .then(() => location.reload())
    .catch((error) => showError(error.name, error.message))
}

// Event listeners for saving user defined functions and units
dom.dialogUdfuSaveF.addEventListener('click', () => saveUserDefined(udfInput, 'func'))
dom.dialogUdfuSaveU.addEventListener('click', () => saveUserDefined(uduInput, 'unit'))
