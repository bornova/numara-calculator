const VALID_IDENTIFIER = /^[a-zA-Z_$][\w$]*$/
const RESERVED_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

const defaultProxy = new Proxy(() => defaultProxy, {
  get: (target, prop) => (prop === Symbol.toPrimitive ? () => 0 : defaultProxy)
})

/**
 * Validate user defined function/unit object keys and guard against prototype pollution.
 * @param {object} obj The object to validate.
 * @param {boolean} [isFunc=true] True if validating functions, false if validating units.
 */
function validateUdfObj(obj, isFunc = true) {
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
    throw new TypeError('User defined input must resolve to an object.')
  }

  for (const [key, val] of Object.entries(obj)) {
    if (RESERVED_KEYS.has(key)) throw new Error(`Reserved key not allowed: "${key}"`)
    if (!VALID_IDENTIFIER.test(key)) throw new Error(`Invalid identifier: "${key}"`)

    if (!isFunc && val && typeof val === 'object' && Array.isArray(val.aliases)) {
      for (const alias of val.aliases) {
        if (typeof alias !== 'string' || RESERVED_KEYS.has(alias) || !VALID_IDENTIFIER.test(alias)) {
          throw new Error(`Invalid unit alias: "${alias}"`)
        }
      }
    }
  }
}

/**
 * Checks whether a UDF entry is a plain namespace object that should not be flattened by `math.import`.
 * @param {*} val Value to inspect.
 * @returns {boolean}
 */
function isPlainNamespaceObject(val) {
  return Boolean(
    val &&
    typeof val === 'object' &&
    !Array.isArray(val) &&
    !val.isBigNumber &&
    !val.isComplex &&
    !val.isFraction &&
    !val.isUnit &&
    !val.isMatrix
  )
}

/**
 * Restores a previously overridden key on the Math.js instance, or deletes it if it was user-defined.
 * @param {object} math The Math.js instance.
 * @param {string} key Key or unit name to restore.
 * @param {Map} savedMap Map of saved built-in descriptors.
 * @param {boolean} [isUnit=false] Whether to also restore/delete from `math.Unit.UNITS`.
 */
function restoreBuiltinKey(math, key, savedMap, isUnit = false) {
  const saved = savedMap.get(key)

  if (isUnit && math.Unit?.UNITS) {
    if (saved?.hasUnit) {
      math.Unit.UNITS[key] = saved.unitVal
    } else {
      delete math.Unit.UNITS[key]
    }
  }

  if (saved?.hasMath) {
    math[key] = saved.mathVal
  } else {
    delete math[key]
  }

  if (math.expression?.mathWithTransform) {
    if (saved?.hasTransform) {
      math.expression.mathWithTransform[key] = saved.transformVal
    } else {
      delete math.expression.mathWithTransform[key]
    }
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

  validateUdfObj(udfObj, isFunc)

  if (isFunc) {
    state.savedBuiltinUDFs ??= new Map()

    state.previouslyImportedUDFs.forEach((key) => restoreBuiltinKey(math, key, state.savedBuiltinUDFs, false))

    for (const key of Object.keys(udfObj)) {
      if (!state.savedBuiltinUDFs.has(key)) {
        const hasMath = key in math
        const hasTransform = Boolean(math.expression?.mathWithTransform && key in math.expression.mathWithTransform)

        if (hasMath || hasTransform) {
          state.savedBuiltinUDFs.set(key, {
            hasMath,
            mathVal: math[key],
            hasTransform,
            transformVal: math.expression?.mathWithTransform?.[key]
          })
        }
      }
    }

    state.previouslyImportedUDFs = Object.keys(udfObj)

    // Separate plain objects from functions/primitives because math.import flattens plain objects
    // into top-level math properties (which would overwrite built-ins without tracking).
    const importableObj = {}

    for (const [key, val] of Object.entries(udfObj)) {
      if (isPlainNamespaceObject(val)) {
        math[key] = val

        if (math.expression?.mathWithTransform) {
          math.expression.mathWithTransform[key] = val
        }
      } else {
        importableObj[key] = val
      }
    }

    if (Object.keys(importableObj).length > 0) {
      math.import(importableObj, { override: true })
    }
  } else {
    state.savedBuiltinUnits ??= new Map()

    state.previouslyCreatedUnits.forEach((unitName) => restoreBuiltinKey(math, unitName, state.savedBuiltinUnits, true))

    const createdUnitNames = [...Object.keys(udfObj)]

    for (const val of Object.values(udfObj)) {
      if (val && typeof val === 'object' && Array.isArray(val.aliases)) {
        createdUnitNames.push(...val.aliases)
      }
    }

    for (const unitName of createdUnitNames) {
      if (!state.savedBuiltinUnits.has(unitName)) {
        const hasUnit = Boolean(math.Unit?.UNITS && unitName in math.Unit.UNITS)
        const hasMath = unitName in math
        const hasTransform = Boolean(
          math.expression?.mathWithTransform && unitName in math.expression.mathWithTransform
        )

        if (hasUnit || hasMath || hasTransform) {
          state.savedBuiltinUnits.set(unitName, {
            hasUnit,
            unitVal: math.Unit?.UNITS?.[unitName],
            hasMath,
            mathVal: math[unitName],
            hasTransform,
            transformVal: math.expression?.mathWithTransform?.[unitName]
          })
        }
      }
    }

    state.previouslyCreatedUnits = createdUnitNames

    math.createUnit(udfObj, { override: true })

    return createdUnitNames
  }

  return Object.keys(udfObj)
}
