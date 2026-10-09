import { dom } from '../dom'
import { refreshEditor, udfInput, uduInput } from '../editor'
import { calculate, math } from './calcManager'
import { modal, showError } from '../ui/dialogs'
import { app, store } from '../appState'
import { applyUdfuToMath } from '../core/udfu'

const udfuState = {
  previouslyImportedUDFs: [],
  previouslyCreatedUnits: []
}

/**
 * Apply user defined functions or units.
 * @param {string} input User defined function or unit to apply.
 * @param {string} type 'func' | 'unit'
 * @returns {void}
 */
export function applyUdfu(input, type) {
  try {
    const isFunc = type === 'func'
    const keys = applyUdfuToMath(math, input, isFunc, udfuState)

    app[isFunc ? 'udfList' : 'uduList'] = keys
    store.set(isFunc ? 'udf' : 'udu', input)
  } catch (error) {
    if (app.settings.lineErrors) {
      showError(error.name, error.message)
    }

    throw error
  }
}

/**
 * Save user defined functions or units.
 * @param {object} input Input element containing user defined function or unit.
 * @param {string} type 'func' | 'unit'
 */
function saveUserDefined(input, type) {
  try {
    applyUdfu(input.getValue().trim(), type)

    refreshEditor()
    calculate()

    modal.hide('#dialogUdfu')
  } catch (error) {
    showError(error.name, error.message)
  }
}

// Event listeners for saving user defined functions and units
dom.dialogUdfuSaveF.addEventListener('click', () => saveUserDefined(udfInput, 'func'))
dom.dialogUdfuSaveU.addEventListener('click', () => saveUserDefined(uduInput, 'unit'))
