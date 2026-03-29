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

/** Update user defined functions.
 * @param {object} newUdfObj Object containing new user defined functions to import.
 */
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

/** Update user defined units.
 * @param {object} newUduObj Object containing new user defined units to import.
 */
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

const VALID_IDENTIFIER = /^[a-zA-Z_$][\w$]*$/
const RESERVED_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

/**
 * Validate user defined function/unit object keys and guard against prototype pollution.
 * @param {object} obj - The object to validate.
 */
function validateUdfObj(obj) {
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
    throw new TypeError('User defined input must resolve to an object.')
  }

  for (const key of Object.keys(obj)) {
    if (RESERVED_KEYS.has(key)) throw new Error(`Reserved key not allowed: "${key}"`)
    if (!VALID_IDENTIFIER.test(key)) throw new Error(`Invalid identifier: "${key}"`)
  }
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

      validateUdfObj(udfObj)

      if (isFunc) {
        updateUserDefinedFunctions(udfObj)
      } else {
        updateUserDefinedUnits(udfObj)
      }

      app[isFunc ? 'udfList' : 'uduList'] = Object.keys(udfObj)

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
