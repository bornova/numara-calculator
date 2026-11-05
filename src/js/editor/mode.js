import CodeMirror from 'codemirror'

import { USD_UNIT } from '../core/constants.js'
import { math } from '../core/mathInstance.js'
import { app } from '../state/appState.js'
import {
  constantTokens,
  currencySymbolRegex,
  currencyTokens,
  dateTimeMethodsSet,
  functionTokens,
  keywordTokens,
  unitTokens
} from './constants.js'

/**
 * Registers the `'numara'` and `'plain'` syntax highlighting modes on CodeMirror.
 */
export function registerEditorModes() {
  CodeMirror.defineMode('numara', () => ({
    startState: () => ({
      lastToken: null
    }),
    blankLine: (state) => {
      state.lastToken = null
    },
    token: (stream, state) => {
      if (stream.sol()) state.lastToken = null
      if (stream.eatSpace()) return null

      if (stream.match(/\/\/.*/) || stream.match(/#.*/)) {
        state.lastToken = 'comment'
        return 'comment'
      }

      if (stream.match(/^(?:0x[\da-f]+|0b[01]+|0o[0-7]+|(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)/i)) {
        state.lastToken = 'number'
        return 'number'
      }

      if (stream.match(/(?:\+|-|\*|\/|,|;|\.|:|@|~|=|>|<|&|\||`|'|\^|\?|!|%)/)) {
        const isDot = stream.current() === '.'
        let nextState = 'operator'

        if (isDot) {
          if (state.lastToken === 'formulajs') nextState = 'formulajs.'
          else if (state.lastToken === 'nerdamer') nextState = 'nerdamer.'
          else if (state.lastToken === 'datetime') nextState = 'datetime.'
        }

        state.lastToken = nextState

        return 'operator'
      }

      if (stream.match(/\bformulajs(?=[.]|\b)/)) {
        state.lastToken = 'formulajs'
        return 'formulajs'
      }

      if (stream.match(/\bnerdamer(?=[.(]|\b)/)) {
        state.lastToken = 'nerdamer'
        return 'nerdamer'
      }

      if (stream.match(/\bDateTime(?=[.]|\b)/)) {
        state.lastToken = 'datetime'
        return 'datetime'
      }

      const prevChar = stream.pos > 0 ? stream.string.charAt(stream.pos - 1) : ''

      if (
        currencySymbolRegex &&
        (!prevChar || !/[\w\p{L}\p{M}]/u.test(prevChar)) &&
        stream.match(currencySymbolRegex)
      ) {
        state.lastToken = 'currency'
        return 'currency'
      }

      stream.eatWhile(/[\w\p{L}\p{M}]/u)

      const cmStream = stream.current()

      let style = null
      if (cmStream) {
        if (state.lastToken === 'formulajs.') {
          style = 'excel'
        } else if (state.lastToken === 'nerdamer.') {
          style = 'nerdamer'
        } else if (state.lastToken === 'datetime.') {
          style = 'function'
        } else {
          const memberMatch = stream.string.slice(0, stream.start).match(/([a-zA-Z_$][\w$]*)\.\s*$/)
          const parentIdent = memberMatch?.[1]
          const memberKey = parentIdent ? `${parentIdent}.${cmStream}` : null
          const parentVal = parentIdent
            ? app.mathScope?.get
              ? app.mathScope.get(parentIdent)
              : app.mathScope?.[parentIdent]
            : null
          const isMemberVariable =
            parentIdent &&
            ((app.mathScope?.has?.(memberKey) &&
              typeof app.mathScope.get(memberKey) !== 'function' &&
              app.scopeTypes?.[memberKey] !== 'function') ||
              (memberKey in (app.mathScope || {}) &&
                typeof app.mathScope[memberKey] !== 'function' &&
                app.scopeTypes?.[memberKey] !== 'function') ||
              app.scopeProperties?.[parentIdent]?.includes?.(cmStream) ||
              (parentVal &&
                typeof parentVal === 'object' &&
                cmStream in parentVal &&
                typeof parentVal[cmStream] !== 'function'))

          if (isMemberVariable) style = 'variable'
          else if (parentIdent && dateTimeMethodsSet.has(cmStream)) style = 'function'
          else if (currencyTokens.has(cmStream)) style = 'currency'
          else if (/\bline\d+\b/.test(cmStream)) style = 'lineNo'
          else if (keywordTokens.has(cmStream)) style = 'keyword'
          else if (
            app.mathScope.has(cmStream) &&
            typeof app.mathScope.get(cmStream) !== 'function' &&
            app.scopeTypes?.[cmStream] !== 'function'
          )
            style = 'variable'
          else if (math.Unit.UNITS[cmStream]?.base.key === `${USD_UNIT}_STUFF`) style = 'currency'
          else if (functionTokens.has(cmStream) || dateTimeMethodsSet.has(cmStream)) style = 'function'
          else if (constantTokens.has(cmStream)) style = 'constant'
          else if (unitTokens.has(cmStream)) style = 'unit'
          else if (app.udfList.includes(cmStream)) style = 'udf'
          else if (app.uduList.includes(cmStream)) style = 'udu'
          else style = 'text'
        }
      }

      if (style) {
        state.lastToken = style
        return style
      }

      stream.next()
      state.lastToken = 'text'
      return 'text'
    }
  }))

  CodeMirror.defineMode('plain', () => ({
    token: (stream) => {
      stream.next()
      return 'plain'
    }
  }))
}
