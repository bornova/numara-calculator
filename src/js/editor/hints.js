import CodeMirror from 'codemirror'

import { math } from '../core/mathInstance.js'
import { stripComments } from '../core/preprocessor.js'
import { escapeHTML, escapeRegExp } from '../core/utils.js'
import { app } from '../state/appState.js'
import { store } from '../state/store.js'
import {
  allUnits,
  CLASS_NAMES,
  dateTimeInstanceMethods,
  dateTimeStaticMethods,
  keywords,
  keywordTokens,
  mathConstants,
  mathFunctions
} from './constants.js'

const functionHints = mathFunctions
  .filter(([f]) => f !== 'DateTime')
  .map(([f]) => ({ text: f, className: CLASS_NAMES.FUNCTION }))

const constantHints = mathConstants.map(([c]) => ({
  text: c,
  desc: math.help(c).doc.description,
  className: CLASS_NAMES.CONSTANT
}))

const unitHints = allUnits.map((u) => u.hint)
const keywordHints = keywords.map((key) => ({ ...key, className: CLASS_NAMES.KEYWORD }))
const excelHints = []

const dateTimeStaticHints = [
  { text: 'DateTime', className: CLASS_NAMES.DATETIME, desc: 'Luxon DateTime class' },
  ...dateTimeStaticMethods.map((m) => ({
    text: `DateTime.${m}`,
    className: CLASS_NAMES.DATETIME,
    desc: `DateTime.${m} static method`,
    render: (el) => {
      el.innerHTML = `<span class="cm-datetime">DateTime</span>.<span class="cm-function">${escapeHTML(m)}</span>`
    }
  }))
]

export const numaraHints = [
  ...functionHints,
  ...constantHints,
  ...unitHints,
  ...keywordHints,
  ...excelHints,
  ...dateTimeStaticHints
]

/**
 * Registers Formula.js function names for editor autocomplete hints.
 * @param {string[]} keys List of Formula.js function names.
 */
export function registerExcelFunctions(keys) {
  if (!Array.isArray(keys) || excelHints.length > 0) return

  for (const key of keys) {
    const hint = { text: `formulajs.${key}`, className: CLASS_NAMES.EXCEL }
    excelHints.push(hint)
    numaraHints.push(hint)
  }
}

/**
 * Extracts exported variable names from a target page's raw data string.
 * @param {string} rawPageName Page name or ID.
 * @param {Array<{ id: string, name?: string, data?: string }>} [pages] Workbook pages list.
 * @returns {string[] | null}
 */
export function getPageExportedVars(rawPageName, pages = store.get('pages') || []) {
  if (!rawPageName) return null

  const query = rawPageName
    .trim()
    .toLowerCase()
    .replace(/\.num$/, '')
  const foundPage = (pages || []).find((p) => {
    if (!p) return false
    const name = (p.name || '')
      .trim()
      .toLowerCase()
      .replace(/\.num$/, '')

    return name === query || p.id === rawPageName.trim()
  })

  if (!foundPage || !foundPage.data) return null

  const varNames = new Set()

  for (const rawLine of foundPage.data.split('\n')) {
    let cleaned = stripComments(rawLine.trim())
    const labelMatch = cleaned.match(/^\s*([a-zA-Z_\p{L}][\w\p{L}\p{M}\s]*):\s+(.+)$/u)
    if (labelMatch && !cleaned.startsWith('{')) {
      cleaned = labelMatch[2].trim()
    }

    const assignMatch = cleaned.match(/^([\p{L}\p{M}_$][\p{L}\p{M}\w$]*)\s*=[^=]/u)
    const varName = assignMatch?.[1]

    if (varName && !['ans', '_', 'now', 'today'].includes(varName) && !/^line\d+$/.test(varName)) {
      varNames.add(varName)
    }
  }

  return varNames.size > 0 ? [...varNames] : null
}

/**
 * Registers the `'numaraHints'` autocomplete helper and command on CodeMirror.
 */
export function registerEditorHints() {
  CodeMirror.registerHelper('hint', 'numaraHints', (editor) => {
    const cmCursor = editor.getCursor()
    const cmCursorLine = editor.getLine(cmCursor.line)

    // Suggest workbook page names when typing inside `page("...`
    const beforeCursor = cmCursorLine.slice(0, cmCursor.ch)
    const pageArgMatch = beforeCursor.match(/\bpage\s*\(\s*(["'`])([^"'`]*)$/)

    if (pageArgMatch) {
      const partialName = pageArgMatch[2]
      const searchLower = partialName.toLowerCase()
      const argStart = cmCursor.ch - partialName.length
      const pages = store.get('pages') || []
      const pageList = pages
        .filter((p) => p && p.id !== app.activePage && p.name && p.name.toLowerCase().startsWith(searchLower))
        .map((p) => ({
          text: p.name,
          className: CLASS_NAMES.VARIABLE,
          desc: 'Page'
        }))
        .sort((a, b) => a.text.localeCompare(b.text, undefined, { numeric: true }))

      return {
        list: pageList,
        from: CodeMirror.Pos(cmCursor.line, argStart),
        to: CodeMirror.Pos(cmCursor.line, cmCursor.ch)
      }
    }

    let start = cmCursor.ch
    let end = start

    while (end < cmCursorLine.length && /[\w.$\p{L}\p{M}]/u.test(cmCursorLine.charAt(end))) ++end
    while (start && /[\w.$\p{L}\p{M}]/u.test(cmCursorLine.charAt(start - 1))) --start

    const curStr = cmCursorLine.slice(start, end)
    const curWord = start !== end && curStr
    let list = []

    if (curStr && curWord) {
      const searchWord = curWord.toLowerCase()
      const variableHints = []

      // Build hints for all variables from the current math scope
      for (const key of app.mathScope.keys()) {
        if (key.includes('.')) continue

        if (!keywordTokens.has(key)) {
          const lineMatch = key.match(/^line(\d+)$/)

          if (lineMatch) {
            const lineNum = parseInt(lineMatch[1], 10)

            if (lineNum >= cmCursor.line + 1) continue
          }
          variableHints.push({ text: key, className: CLASS_NAMES.VARIABLE })
        }
      }

      const userFunctionHints = app.udfList.map((funcName) => ({ text: funcName, className: CLASS_NAMES.UDF }))
      const userUnitHints = app.uduList.map((unitName) => ({ text: unitName, className: CLASS_NAMES.UDU }))

      let matches

      if (curStr.includes('.')) {
        const dotIndex = curStr.lastIndexOf('.')
        const prefix = curStr.slice(0, dotIndex + 1)
        const suffix = curStr.slice(dotIndex + 1).toLowerCase()
        const baseVar = prefix.slice(0, -1)
        const baseVarLower = baseVar.toLowerCase()

        if (baseVarLower === 'datetime') {
          matches = dateTimeStaticHints.filter(({ text }) => text.toLowerCase().startsWith(searchWord))
        } else if (baseVarLower === 'formulajs') {
          matches = excelHints.filter(({ text }) => text.toLowerCase().startsWith(searchWord))
        } else {
          let objectProps = baseVar ? app.scopeProperties?.[baseVar] : null
          let displayBase = baseVar

          if (!objectProps && !baseVar) {
            const inlinePageMatch = cmCursorLine.slice(0, start).match(/\bpage\s*\(\s*["'`]([^"'`]+)["'`]\s*\)\s*$/)

            if (inlinePageMatch) {
              objectProps = getPageExportedVars(inlinePageMatch[1])
              displayBase = `page("${inlinePageMatch[1]}")`
            }
          }

          if (!objectProps && baseVar) {
            const scopeVal = app.mathScope?.get ? app.mathScope.get(baseVar) : app.mathScope?.[baseVar]

            if (scopeVal && typeof scopeVal === 'object' && !scopeVal.isLuxonDateTime) {
              const keys = Object.keys(scopeVal)
              if (keys.length) objectProps = keys
            }
          }

          if (!objectProps && baseVar && app.mathScope?.keys) {
            const dottedProps = []

            for (const key of app.mathScope.keys()) {
              if (key.startsWith(`${baseVar}.`)) {
                const prop = key.slice(baseVar.length + 1)
                if (prop && !prop.includes('.')) dottedProps.push(prop)
              }
            }

            if (dottedProps.length) objectProps = dottedProps
          }

          if (!objectProps && baseVar) {
            const docText = editor.getValue()
            const pageAssignRegex = new RegExp(
              `^\\s*${escapeRegExp(baseVar)}\\s*=\\s*page\\s*\\(\\s*["'\`]([^"'\`]+)["'\`]\\s*\\)`,
              'm'
            )
            const pageMatch = docText.match(pageAssignRegex)

            if (pageMatch) {
              objectProps = getPageExportedVars(pageMatch[1])
            }
          }

          if (objectProps) {
            matches = objectProps
              .filter((prop) => prop.toLowerCase().startsWith(suffix))
              .map((prop) => ({
                text: prefix + prop,
                className: CLASS_NAMES.VARIABLE,
                desc: `${displayBase}.${prop}`,
                render: (el) => {
                  el.innerHTML = baseVar
                    ? `<span class="cm-variable">${escapeHTML(baseVar)}</span>.<span class="cm-variable">${escapeHTML(prop)}</span>`
                    : `.<span class="cm-variable">${escapeHTML(prop)}</span>`
                }
              }))
          } else if (
            baseVarLower === 'today' ||
            baseVarLower === 'now' ||
            app.scopeTypes?.[baseVar] === 'datetime' ||
            prefix.toLowerCase().startsWith('datetime.')
          ) {
            matches = dateTimeInstanceMethods
              .filter((m) => m.toLowerCase().startsWith(suffix))
              .map((m) => ({
                text: prefix + m,
                className: CLASS_NAMES.DATETIME,
                desc: `DateTime.${m} instance method`,
                render: (el) => {
                  el.innerHTML = `<span class="cm-variable">${escapeHTML(baseVar)}</span>.<span class="cm-function">${escapeHTML(m)}</span>`
                }
              }))
          } else {
            matches = []
          }
        }
      } else {
        const match = ({ text }) => text.toLowerCase().startsWith(searchWord)

        matches = [
          ...numaraHints.filter(match),
          ...variableHints.filter(match),
          ...userFunctionHints.filter(match),
          ...userUnitHints.filter(match)
        ]
      }

      list = matches.sort((a, b) => a.text.localeCompare(b.text, undefined, { numeric: true }))
    }

    return {
      list,
      from: CodeMirror.Pos(cmCursor.line, start),
      to: CodeMirror.Pos(cmCursor.line, end)
    }
  })

  CodeMirror.commands.autocomplete = (cm) => {
    CodeMirror.showHint(cm, CodeMirror.hint.numaraHints, {
      completeSingle: false,
      extraKeys: { Enter: 'newlineAndIndent' }
    })
  }
}
