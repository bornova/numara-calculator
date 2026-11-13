export const VALID_IDENTIFIER = /^[a-zA-Z_$][\w$]*$/
export const RESERVED_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

export const defaultProxy = new Proxy(() => defaultProxy, {
  get: (target, prop) => (prop === Symbol.toPrimitive ? () => 0 : defaultProxy)
})

/**
 * If `idx` starts a string literal, template literal, or JS comment, returns the index
 * immediately following it; otherwise returns `-1`.
 * @param {string} str Source string.
 * @param {number} idx Current character index.
 * @returns {number} End index past the string/comment, or `-1`.
 */
export function skipStringOrComment(str, idx) {
  const ch = str[idx]

  if (ch === '/' && str[idx + 1] === '/') {
    let i = idx + 2

    while (i < str.length && str[i] !== '\n') i++

    return i
  }

  if (ch === '/' && str[idx + 1] === '*') {
    const end = str.indexOf('*/', idx + 2)
    return end === -1 ? str.length : end + 2
  }

  if (ch === "'" || ch === '"') {
    let i = idx + 1

    while (i < str.length) {
      if (str[i] === '\\') {
        i += 2
        continue
      }

      if (str[i] === ch) return i + 1
      i++
    }

    return str.length
  }

  if (ch === '`') {
    let i = idx + 1

    while (i < str.length) {
      if (str[i] === '\\') {
        i += 2
        continue
      }

      if (str[i] === '`') return i + 1

      if (str[i] === '$' && str[i + 1] === '{') {
        const closeIdx = findMatchingClose(str, i + 1)

        i = closeIdx === -1 ? str.length : closeIdx + 1
        continue
      }

      i++
    }

    return str.length
  }

  return -1
}

/**
 * Finds the index of the closing delimiter matching `(`, `[`, or `{` at `openIndex`.
 * Respects nested strings, template expressions, and comments.
 * @param {string} str Source string.
 * @param {number} openIndex Index of opening delimiter.
 * @returns {number} Matching closing delimiter index, or `-1` if unbalanced.
 */
export function findMatchingClose(str, openIndex) {
  const openChar = str[openIndex]
  const closeChar = openChar === '(' ? ')' : openChar === '[' ? ']' : openChar === '{' ? '}' : null

  if (!closeChar) return -1

  let depth = 0
  let i = openIndex

  while (i < str.length) {
    const after = skipStringOrComment(str, i)

    if (after !== -1) {
      i = after
      continue
    }

    const ch = str[i]

    if (ch === openChar) depth++
    else if (ch === closeChar) {
      depth--

      if (depth === 0) return i
    }

    i++
  }

  return -1
}

/**
 * Wraps an expression in parentheses, placing line breaks around multi-line or `//`-commented bodies
 * so a trailing line comment cannot comment out the closing `)`.
 * @param {string} expr Expression string.
 * @returns {string}
 */
function wrapParenExpr(expr) {
  return expr.includes('//') ? `(\n${expr}\n)` : `(${expr})`
}

/**
 * Checks whether a trimmed body string contains a top-level `return` statement (or an outer
 * statement-block `return`), avoiding false positives inside nested functions or object methods.
 * @param {string} str Body string.
 * @param {boolean} isBlock Whether the outer string is a single `{ ... }` brace pair.
 * @returns {boolean}
 */
function hasTopLevelReturn(str, isBlock) {
  const targetBraceDepth = isBlock ? 1 : 0
  let parenDepth = 0
  let bracketDepth = 0
  let braceDepth = 0
  let sawReturnAtBlockDepth = false
  let i = 0

  while (i < str.length) {
    const after = skipStringOrComment(str, i)

    if (after !== -1) {
      i = after
      continue
    }

    const ch = str[i]
    if (ch === '(') parenDepth++
    else if (ch === ')') parenDepth--
    else if (ch === '[') bracketDepth++
    else if (ch === ']') bracketDepth--
    else if (ch === '{') braceDepth++
    else if (ch === '}') braceDepth--
    else if (isBlock && ch === ':' && parenDepth === 0 && bracketDepth === 0 && braceDepth === 1) {
      // Object literal syntax at outer brace depth (e.g. `{ return: 1, calc(x) { return x } }`)
      return false
    } else if (
      parenDepth === 0 &&
      bracketDepth === 0 &&
      braceDepth === targetBraceDepth &&
      str.startsWith('return', i) &&
      !/[\w$.]/.test(str[i - 1] || '') &&
      !/[\w$:]/.test(str[i + 6] || '')
    ) {
      if (!isBlock) return true

      sawReturnAtBlockDepth = true
    }

    i++
  }

  return sawReturnAtBlockDepth
}

/**
 * Evaluates a compiled UDF/UDU object-body string inside a `with (math)` scope.
 * @param {string} body Object-literal interior string.
 * @param {object} [math=defaultProxy] Math.js instance or fallback proxy.
 * @param {object} [externalLibs={}] Optional external libraries `{ luxon, nerdamer, formulajs }`.
 * @returns {object}
 */
export function evalUdfuObject(body, math = defaultProxy, externalLibs = {}) {
  const luxon = externalLibs.luxon ?? defaultProxy
  const nerdamer = externalLibs.nerdamer ?? defaultProxy
  const formulajs = externalLibs.formulajs ?? defaultProxy
  const fn = new Function('math', 'luxon', 'nerdamer', 'formulajs', `with (math) { return {${body}} }`)

  return fn(math, luxon, nerdamer, formulajs)
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
      const isBlock = cleanBody.startsWith('{') && findMatchingClose(cleanBody, 0) === cleanBody.length - 1
      const hasReturn = /\breturn\b/.test(cleanBody)
      const isMultiStmt = cleanBody.includes('\n') || cleanBody.includes(';') || hasReturn

      if (cleanParams.length > 0 || isZeroArgFunc) {
        if (isBlock && (hasReturn || cleanBody.includes(';'))) {
          return `${JSON.stringify(cleanName)}: (${cleanParams}) => ${cleanBody}`
        }

        if (!isBlock && isMultiStmt) {
          return `${JSON.stringify(cleanName)}: (${cleanParams}) => {\n${cleanBody}\n}`
        }

        return `${JSON.stringify(cleanName)}: (${cleanParams}) => ${wrapParenExpr(cleanBody)}`
      }

      if (hasTopLevelReturn(cleanBody, isBlock)) {
        if (isBlock) return `${JSON.stringify(cleanName)}: () => ${cleanBody}`

        return `${JSON.stringify(cleanName)}: () => {\n${cleanBody}\n}`
      }

      return `${JSON.stringify(cleanName)}: ${wrapParenExpr(cleanBody)}`
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
