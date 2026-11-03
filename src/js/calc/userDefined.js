import { DateTime } from 'luxon'

import { applyUdfuToMath } from '../core/udfu.js'
import { dom } from '../dom.js'
import { refreshEditor, udfInput, uduInput } from '../editor/index.js'
import { app } from '../state/appState.js'
import { store } from '../state/store.js'
import { modal, showError } from '../ui/dialogs.js'
import { calculate, clearEvaluationCache, math } from './calcManager.js'

const udfuState = {
  previouslyImportedUDFs: [],
  previouslyCreatedUnits: []
}

/**
 * Save user defined functions and units from the dialog editors.
 */
function saveUserDefined() {
  try {
    applyUdfu(udfInput.getValue().trim(), 'func', false)
    applyUdfu(uduInput.getValue().trim(), 'unit', false)

    clearEvaluationCache()
    refreshEditor()
    calculate()

    modal.hide('#dialogUdfu')
  } catch (error) {
    showError(error.name, error.message)
  }
}

/**
 * Apply user defined functions or units to the main-thread Math.js instance and persist to storage.
 * @param {string} input User defined function or unit definition string.
 * @param {string} type 'func' | 'unit'
 * @param {boolean} [showErr=true] Whether to display an error modal if evaluation fails and lineErrors is enabled.
 */
function applyUdfu(input, type, showErr = true) {
  try {
    const isFunc = type === 'func'
    const keys = applyUdfuToMath(math, input, isFunc, udfuState, {
      luxon: DateTime
    })

    app[isFunc ? 'udfList' : 'uduList'] = keys
    store.set(isFunc ? 'udf' : 'udu', input)
  } catch (error) {
    if (showErr && app.settings?.lineErrors) {
      showError(error.name, error.message)
    }

    throw error
  }
}

/**
 * Loads user-defined functions and units from storage and binds dialog save buttons.
 */
export function setupUserDefined() {
  try {
    applyUdfu(store.get('udf') ?? '', 'func')
  } catch (error) {
    console.error('Error loading user-defined functions:', error)
  }

  try {
    applyUdfu(store.get('udu') ?? '', 'unit')
  } catch (error) {
    console.error('Error loading user-defined units:', error)
  }

  dom.dialogUdfuSaveF.addEventListener('click', saveUserDefined)
  dom.dialogUdfuSaveU.addEventListener('click', saveUserDefined)
}
