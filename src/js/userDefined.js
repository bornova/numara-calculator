import { dom } from './dom'
import { refreshEditor, udfInput, uduInput } from './editor'
import { calculate, math } from './eval'
import { modal, showError } from './modal'
import { app, store } from './utils'
import { DateTime as luxon } from 'luxon'
import * as formulajs from '@formulajs/formulajs'
import nerdamer from 'nerdamer-prime/all.js'

let previouslyImportedUDFs = []
let previouslyCreatedUnits = []

function updateUserDefinedFunctions(newUdfObj) {
  previouslyImportedUDFs.forEach((key) => {
    delete math[key]

    if (math.expression && math.expression.mathWithTransform) {
      delete math.expression.mathWithTransform[key]
    }
  })

  math.import(newUdfObj, { override: true })

  previouslyImportedUDFs = Object.keys(newUdfObj)
}

function updateUserDefinedUnits(newUduObj) {
  previouslyCreatedUnits.forEach((unitName) => {
    if (math.Unit && math.Unit.UNITS) {
      delete math.Unit.UNITS[unitName]
    }

    delete math[unitName]

    if (math.expression && math.expression.mathWithTransform) {
      delete math.expression.mathWithTransform[unitName]
    }
  })

  math.createUnit(newUduObj, { override: true })

  previouslyCreatedUnits = Object.keys(newUduObj)
}

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
      const UDFunc = new Function('math', 'luxon', 'nerdamer', 'formulajs', `'use strict'; return {${input}}`)
      const udfObj = UDFunc(math, luxon, nerdamer, formulajs)

      if (isFunc) {
        updateUserDefinedFunctions(udfObj)
      } else {
        updateUserDefinedUnits(udfObj)
      }

      app[isFunc ? 'udfList' : 'uduList'].length = 0

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
    .then(() => {
      refreshEditor()
      calculate()

      modal.hide('#dialogUdfu')
    })
    .catch((error) => showError(error.name, error.message))
}

// Event listeners for saving user defined functions and units
dom.dialogUdfuSaveF.addEventListener('click', () => saveUserDefined(udfInput, 'func'))
dom.dialogUdfuSaveU.addEventListener('click', () => saveUserDefined(uduInput, 'unit'))
