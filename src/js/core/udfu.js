export const VALID_IDENTIFIER = /^[a-zA-Z_$][\w$]*$/
export const RESERVED_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

const defaultProxy = new Proxy(() => defaultProxy, {
  get: (target, prop) => (prop === Symbol.toPrimitive ? () => 0 : defaultProxy)
})

/**
 * Finds the index of the closing parenthesis matching the opening parenthesis at `openIndex`.
 * @param {string} str Source string.
 * @param {number} openIndex Index of `(`.
 * @returns {number} Matching `)` index, or `-1` if unbalanced.
 */
function findMatchingParen(str, openIndex) {
  let depth = 0
  let inString = null

  for (let i = openIndex; i < str.length; i++) {
    const ch = str[i]

    if (inString) {
      if (ch === '\\') {
        i++
      } else if (ch === inString) {
        inString = null
      }

      continue
    }

    if (ch === '"' || ch === "'" || ch === '`') {
      inString = ch
    } else if (ch === '(') {
      depth++
    } else if (ch === ')') {
      depth--
      if (depth === 0) return i
    }
  }

  return -1
}

/**
 * Strips a single balanced pair of outer parentheses from an expression string,
 * preserving parentheses when they wrap an object literal (`({ ... })`) or multiple groups (`(a) * (b)`).
 * @param {string} str Expression string.
 * @returns {string} Unwrapped expression string.
 */
function unwrapBalancedParens(str) {
  if (!str.startsWith('(') || !str.endsWith(')')) return str

  const closeIdx = findMatchingParen(str, 0)
  if (closeIdx !== str.length - 1) return str

  const inner = str.slice(1, -1).trim()
  return inner.startsWith('{') ? str : inner
}

/**
 * Strips outer block braces or balanced parentheses from an arrow-function body string.
 * @param {string} rawBody Trimmed right-hand side of `=>`.
 * @returns {string}
 */
function normalizeArrowBody(rawBody) {
  return rawBody.startsWith('{') && rawBody.endsWith('}') ? rawBody.slice(1, -1).trim() : unwrapBalancedParens(rawBody)
}

/**
 * Evaluates a compiled UDF/UDU object-body string inside a `with (math)` scope.
 * @param {string} body Object-literal interior string.
 * @param {object} [math=defaultProxy] Math.js instance or fallback proxy.
 * @param {object} [externalLibs={}] Optional external libraries `{ luxon, nerdamer, formulajs }`.
 * @returns {object}
 */
function evalUdfuObject(body, math = defaultProxy, externalLibs = {}) {
  const luxon = externalLibs.luxon ?? defaultProxy
  const nerdamer = externalLibs.nerdamer ?? defaultProxy
  const formulajs = externalLibs.formulajs ?? defaultProxy
  const fn = new Function('math', 'luxon', 'nerdamer', 'formulajs', `with (math) { return {${body}} }`)

  return fn(math, luxon, nerdamer, formulajs)
}

/**
 * Extracts parameter list and body source from a runtime function value.
 * @param {Function} fn Function to inspect.
 * @returns {{ params: string, body: string }}
 */
function extractFunctionParts(fn) {
  const src = fn.toString().trim()

  if (src.startsWith('(')) {
    const closeIdx = findMatchingParen(src, 0)

    if (closeIdx !== -1) {
      const arrowMatch = src.slice(closeIdx + 1).match(/^\s*=>\s*([\s\S]*)$/)

      if (arrowMatch) {
        const rawParams = src.slice(1, closeIdx).trim()
        const params = rawParams.length > 0 ? rawParams : '()'

        return { params, body: normalizeArrowBody(arrowMatch[1].trim()) }
      }
    }
  }

  const singleArrow = src.match(/^([a-zA-Z_$][\w$]*)\s*=>\s*([\s\S]*)$/)

  if (singleArrow) {
    return { params: singleArrow[1].trim(), body: normalizeArrowBody(singleArrow[2].trim()) }
  }

  const headerMatch = src.match(
    /^(?:(?:async\s+)?function\s*(?:\*\s*)?[a-zA-Z_$]*[\w$]*|(?:async\s+)?[a-zA-Z_$][\w$]*)\s*\(/
  )

  if (headerMatch) {
    const openIdx = headerMatch[0].length - 1
    const closeIdx = findMatchingParen(src, openIdx)

    if (closeIdx !== -1) {
      const afterParams = src.slice(closeIdx + 1).trim()

      if (afterParams.startsWith('{') && afterParams.endsWith('}')) {
        const rawParams = src.slice(openIdx + 1, closeIdx).trim()
        const params = rawParams.length > 0 ? rawParams : '()'
        const body = afterParams.slice(1, -1).trim()

        return { params, body }
      }
    }
  }

  return { params: '', body: src }
}

/**
 * Compiles structured user-defined function/constant items into a JS object body string.
 * @param {Array<{name: string, params: string, body: string}>} items
 * @returns {string}
 */
export function compileUdfItems(items) {
  return items
    .map(({ name, params, body }) => {
      const cleanName = name.trim()
      const rawParams = (params ?? '').trim()
      const isZeroArgFunc = rawParams === '()'
      const cleanParams = rawParams.replace(/^\(|\)$/g, '').trim()
      const cleanBody = (body ?? '').trim()
      const isBlock = cleanBody.startsWith('{') && cleanBody.endsWith('}')
      const hasReturn = /\breturn\b/.test(cleanBody)
      const isMultiStmt = cleanBody.includes('\n') || cleanBody.includes(';') || hasReturn

      if (cleanParams.length > 0 || isZeroArgFunc) {
        if (isBlock && (hasReturn || cleanBody.includes(';'))) {
          return `${JSON.stringify(cleanName)}: (${cleanParams}) => ${cleanBody}`
        }

        if (!isBlock && isMultiStmt) {
          return `${JSON.stringify(cleanName)}: (${cleanParams}) => {\n${cleanBody}\n}`
        }

        return `${JSON.stringify(cleanName)}: (${cleanParams}) => (${cleanBody})`
      }

      if (hasReturn) {
        if (isBlock) return `${JSON.stringify(cleanName)}: () => ${cleanBody}`

        return `${JSON.stringify(cleanName)}: () => {\n${cleanBody}\n}`
      }

      return `${JSON.stringify(cleanName)}: (${cleanBody})`
    })
    .join(',\n')
}

/**
 * Compiles structured user-defined unit items into a JS object body string.
 * @param {Array<{name: string, definition: string, prefixes?: string, aliases?: string}>} items
 * @returns {string}
 */
export function compileUduItems(items) {
  return items
    .map(({ name, definition, prefixes, aliases }) => {
      const cleanName = name.trim()
      const cleanDef = (definition ?? '').trim().replace(/^["']|["']$/g, '')
      const cleanPrefixes = (prefixes ?? 'none').trim()
      const aliasList = (aliases ?? '')
        .split(',')
        .map((a) => a.trim())
        .filter(Boolean)

      if ((!cleanPrefixes || cleanPrefixes === 'none') && aliasList.length === 0) {
        return `${JSON.stringify(cleanName)}: ${JSON.stringify(cleanDef)}`
      }

      const unitObj = { definition: cleanDef }

      if (cleanPrefixes && cleanPrefixes !== 'none') {
        unitObj.prefixes = cleanPrefixes
      }

      if (aliasList.length > 0) {
        unitObj.aliases = aliasList
      }

      return `${JSON.stringify(cleanName)}: ${JSON.stringify(unitObj)}`
    })
    .join(',\n')
}

/**
 * Parses a legacy v7 `udf` object-body string into structured `udfItems`.
 * @param {string} rawUdf Legacy `udf` string.
 * @param {object} [math] Optional Math.js instance.
 * @param {object} [externalLibs] Optional libraries `{ luxon, nerdamer, formulajs }`.
 * @returns {Array<{name: string, params: string, body: string}>}
 */
export function parseLegacyUdf(rawUdf, math = defaultProxy, externalLibs = {}) {
  const trimmed = (rawUdf ?? '').trim()
  if (!trimmed) return []

  const udfItems = []

  try {
    const obj = evalUdfuObject(trimmed, math, externalLibs)

    for (const [key, val] of Object.entries(obj || {})) {
      if (RESERVED_KEYS.has(key) || !VALID_IDENTIFIER.test(key)) continue

      if (typeof val === 'function') {
        const { params, body } = extractFunctionParts(val)
        udfItems.push({ name: key, params, body })
      } else if (val !== null && typeof val === 'object') {
        udfItems.push({ name: key, params: '', body: JSON.stringify(val) })
      } else {
        udfItems.push({
          name: key,
          params: '',
          body: typeof val === 'string' ? JSON.stringify(val) : String(val)
        })
      }
    }
  } catch {
    // Return empty array if legacy string cannot be evaluated
  }

  return udfItems
}

/**
 * Parses a legacy v7 `udu` object-body string into structured `uduItems`.
 * @param {string} rawUdu Legacy `udu` string.
 * @param {object} [math] Optional Math.js instance.
 * @param {object} [externalLibs] Optional libraries `{ luxon, nerdamer, formulajs }`.
 * @returns {Array<{name: string, definition: string, prefixes: string, aliases: string}>}
 */
export function parseLegacyUdu(rawUdu, math = defaultProxy, externalLibs = {}) {
  const trimmed = (rawUdu ?? '').trim()
  if (!trimmed) return []

  const uduItems = []

  try {
    const obj = evalUdfuObject(trimmed, math, externalLibs)

    for (const [key, val] of Object.entries(obj || {})) {
      if (RESERVED_KEYS.has(key) || !VALID_IDENTIFIER.test(key)) continue

      if (typeof val === 'string') {
        uduItems.push({ name: key, definition: val, prefixes: 'none', aliases: '' })
      } else if (val && typeof val === 'object') {
        if (val.isUnit && typeof val.toString === 'function') {
          uduItems.push({ name: key, definition: val.toString(), prefixes: 'none', aliases: '' })
        } else {
          uduItems.push({
            name: key,
            definition: String(val.definition ?? ''),
            prefixes: val.prefixes || 'none',
            aliases: Array.isArray(val.aliases) ? val.aliases.join(', ') : ''
          })
        }
      }
    }
  } catch {
    // Return empty array if legacy string cannot be evaluated
  }

  return uduItems
}

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
export function isPlainNamespaceObject(val) {
  return Boolean(
    val &&
    typeof val === 'object' &&
    !Array.isArray(val) &&
    !val.isBigNumber &&
    !val.isComplex &&
    !val.isFraction &&
    !val.isUnit &&
    !val.isMatrix &&
    !val.isLuxonDateTime
  )
}

/**
 * Snapshots any existing built-in Math.js property, transform, or unit before overriding it.
 * @param {object} math The Math.js instance.
 * @param {string} key Key or unit name about to be overridden.
 * @param {Map} savedMap Map of saved built-in descriptors.
 * @param {boolean} [isUnit=false] Whether to also snapshot `math.Unit.UNITS[key]`.
 */
function saveBuiltinKey(math, key, savedMap, isUnit = false) {
  if (savedMap.has(key)) return

  const hasUnit = Boolean(isUnit && math.Unit?.UNITS && key in math.Unit.UNITS)
  const hasMath = key in math
  const hasTransform = Boolean(math.expression?.mathWithTransform && key in math.expression.mathWithTransform)

  if (hasUnit || hasMath || hasTransform) {
    savedMap.set(key, {
      hasUnit,
      unitVal: hasUnit ? math.Unit.UNITS[key] : undefined,
      hasMath,
      mathVal: math[key],
      hasTransform,
      transformVal: math.expression?.mathWithTransform?.[key]
    })
  }
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
  if (isFunc) {
    state.savedBuiltinUDFs ??= new Map()

    state.previouslyImportedUDFs.forEach((key) => restoreBuiltinKey(math, key, state.savedBuiltinUDFs, false))
    state.previouslyImportedUDFs = []
  }

  const udfObj = evalUdfuObject(input, math, externalLibs)

  validateUdfObj(udfObj, isFunc)

  if (isFunc) {
    const udfKeys = Object.keys(udfObj)

    udfKeys.forEach((key) => saveBuiltinKey(math, key, state.savedBuiltinUDFs, false))
    state.previouslyImportedUDFs = udfKeys

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

    return udfKeys
  }

  state.savedBuiltinUnits ??= new Map()

  state.previouslyCreatedUnits.forEach((unitName) => restoreBuiltinKey(math, unitName, state.savedBuiltinUnits, true))

  const createdUnitNames = [...Object.keys(udfObj)]

  for (const val of Object.values(udfObj)) {
    if (val && typeof val === 'object' && Array.isArray(val.aliases)) {
      createdUnitNames.push(...val.aliases)
    }
  }

  createdUnitNames.forEach((unitName) => saveBuiltinKey(math, unitName, state.savedBuiltinUnits, true))
  state.previouslyCreatedUnits = createdUnitNames

  math.createUnit(udfObj, { override: true })

  return createdUnitNames
}
