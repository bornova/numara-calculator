const VALID_IDENTIFIER = /^[a-zA-Z_$][\w$]*$/
const RESERVED_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

const defaultProxy = new Proxy(() => defaultProxy, {
  get: () => defaultProxy
})

/**
 * Validate user defined function/unit object keys and guard against prototype pollution.
 * @param {object} obj The object to validate.
 */
export function validateUdfObj(obj) {
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
    throw new TypeError('User defined input must resolve to an object.')
  }

  for (const key of Object.keys(obj)) {
    if (RESERVED_KEYS.has(key)) throw new Error(`Reserved key not allowed: "${key}"`)
    if (!VALID_IDENTIFIER.test(key)) throw new Error(`Invalid identifier: "${key}"`)
  }
}

/**
 * Applies user defined functions or units to a Math.js instance.
 *
 * @param {object} math The Math.js instance to update.
 * @param {string} input The raw definition string.
 * @param {boolean} isFunc True if functions, false if units.
 * @param {object} state Object holding tracking state: { previouslyImportedUDFs, previouslyCreatedUnits }.
 * @param {object} [externalLibs] Optional libraries to expose in the function scope { luxon, nerdamer, formulajs }.
 * @returns {string[]} List of keys defined in the input.
 */
export function applyUdfuToMath(math, input, isFunc, state, externalLibs = {}) {
  const luxon = externalLibs.luxon ?? defaultProxy
  const nerdamer = externalLibs.nerdamer ?? defaultProxy
  const formulajs = externalLibs.formulajs ?? defaultProxy

  const UDFunc = new Function('math', 'luxon', 'nerdamer', 'formulajs', `'use strict'; return {${input}}`)
  const udfObj = UDFunc(math, luxon, nerdamer, formulajs)

  validateUdfObj(udfObj)

  if (isFunc) {
    state.previouslyImportedUDFs.forEach((key) => {
      delete math[key]

      if (math.expression?.mathWithTransform) {
        delete math.expression.mathWithTransform[key]
      }
    })

    math.import(udfObj, { override: true })

    // math.import flattens nested plain objects, treating them as namespaces rather than variables.
    // Retain top-level plain objects so that dot notation (e.g. sk.BaseCarry) works in expressions.
    for (const [key, val] of Object.entries(udfObj)) {
      if (val && typeof val === 'object' && !Array.isArray(val)) {
        math[key] = val

        if (math.expression?.mathWithTransform) {
          math.expression.mathWithTransform[key] = val
        }
      }
    }

    state.previouslyImportedUDFs = Object.keys(udfObj)
  } else {
    state.previouslyCreatedUnits.forEach((unitName) => {
      if (math.Unit?.UNITS) {
        delete math.Unit.UNITS[unitName]
      }

      delete math[unitName]

      if (math.expression?.mathWithTransform) {
        delete math.expression.mathWithTransform[unitName]
      }
    })

    math.createUnit(udfObj, { override: true })

    state.previouslyCreatedUnits = Object.keys(udfObj)
  }

  return Object.keys(udfObj)
}
