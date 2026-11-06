import CodeMirror from 'codemirror'
import './addons.js'

import { calculate, syncOutputHeights } from '../calc/calcManager.js'
import { debounce } from '../core/utils.js'
import { dom } from '../dom.js'
import { app } from '../state/appState.js'
import { isMobile } from '../state/env.js'
import { store } from '../state/store.js'
import { showError } from '../ui/dialogs.js'
import { CLASS_NAMES, refreshCurrencyTokens } from './constants.js'
import { registerEditorFolding, toggleFoldedOutputs } from './folding.js'
import { numaraHints, registerEditorHints, registerExcelFunctions } from './hints.js'
import { registerEditorModes } from './mode.js'
import { hideSearchPanel, isSearchPanelOpen, showSearchPanel } from './searchPanel.js'
import { updateSelectionStats } from './stats.js'
import { initTooltips } from './tooltips.js'

export { CLASS_NAMES, numaraHints, refreshCurrencyTokens, registerExcelFunctions, updateSelectionStats }

registerEditorModes()
registerEditorHints()
registerEditorFolding()

let previousActiveLine = -1

/**
 * Forces CodeMirror editor scroll to focus line alignment at the bottom of the visible screen.
 */
function cmForceBottom() {
  const line = cm.getCursor().line
  const totalLines = cm.lineCount()

  if (line === totalLines - 1) {
    const inputScroll = dom.el('.CodeMirror-scroll')

    inputScroll.scrollTop = inputScroll.scrollHeight
    dom.output.scrollTop = dom.output.scrollHeight

    return
  }

  const lineRect = cm.charCoords({ line, ch: 0 }, 'window')
  const barTop = dom.el('.CodeMirror-hscrollbar')?.getBoundingClientRect()?.top

  if (barTop === undefined) return

  const lineHeight = lineRect.bottom - lineRect.top

  if (barTop - lineRect.top < lineHeight) {
    dom.output.scrollTop += lineHeight - (barTop - lineRect.top)
  }
}

/**
 * Toggles comments on the selected lines.
 * @param {CodeMirror} cmInstance The CodeMirror instance to toggle comments on.
 */
function toggleComment(cmInstance) {
  cmInstance.operation(() => {
    for (const selection of cmInstance.listSelections()) {
      const isAnchorFirst =
        selection.anchor.line < selection.head.line ||
        (selection.anchor.line === selection.head.line && selection.anchor.ch <= selection.head.ch)
      const startPos = selection.from ? selection.from() : isAnchorFirst ? selection.anchor : selection.head
      const endPos = selection.to ? selection.to() : isAnchorFirst ? selection.head : selection.anchor
      const startLine = startPos.line
      let endLine = endPos.line

      if (selection.anchor.line !== selection.head.line && endPos.ch === 0) {
        endLine = Math.max(startLine, endLine - 1)
      }

      const lines = []

      for (let i = startLine; i <= endLine; i++) {
        const line = cmInstance.getLine(i)

        if (line != null) lines.push(line)
      }

      const nonEmptyLines = lines.filter((line) => line.trim() !== '')
      const allCommented = (nonEmptyLines.length > 0 ? nonEmptyLines : lines).every((line) =>
        line.trim().startsWith('//')
      )

      for (let i = startLine; i <= endLine; i++) {
        const line = cmInstance.getLine(i)

        if (line == null || (nonEmptyLines.length > 0 && line.trim() === '')) continue

        if (allCommented) {
          const match = line.match(/^(\s*)(\/\/\s?)/)

          if (match) {
            cmInstance.replaceRange(
              '',
              { line: i, ch: match[1].length },
              { line: i, ch: match[1].length + match[2].length }
            )
          }
        } else {
          const indentLen = line.match(/^\s*/)[0].length

          cmInstance.replaceRange('// ', { line: i, ch: indentLen }, { line: i, ch: indentLen })
        }
      }
    }
  })
}

/** Main calculator CodeMirror instance. */
export const cm = CodeMirror.fromTextArea(dom.inputArea, {
  autofocus: true,
  coverGutterNextToScrollbar: true,
  extraKeys: {
    'Ctrl-Space': 'autocomplete',
    'Cmd-/': toggleComment,
    'Ctrl-/': toggleComment,
    'Ctrl-Q': (editor) => editor.foldCode(editor.getCursor(), { rangeFinder: CodeMirror.fold.numara }),
    'Cmd-F': (editor) => showSearchPanel(editor, false),
    'Ctrl-F': (editor) => showSearchPanel(editor, false),
    'Cmd-Alt-F': (editor) => showSearchPanel(editor, true),
    'Ctrl-H': (editor) => showSearchPanel(editor, true),
    Esc: (editor) => {
      if (isSearchPanelOpen()) {
        hideSearchPanel(editor)
      } else {
        return CodeMirror.Pass
      }
    }
  },
  flattenSpans: true,
  foldGutter: {
    rangeFinder: CodeMirror.fold.numara,
    foldOnChangeTimeSpan: 1,
    updateViewportTimeSpan: 1
  },
  foldOptions: {
    rangeFinder: CodeMirror.fold.numara
  },
  gutters: ['CodeMirror-foldgutter', 'CodeMirror-linenumbers'],
  mode: 'numara',
  smartIndent: false,
  theme: 'numara',
  undoDepth: 100,
  viewportMargin: Infinity
})

const field = cm.getInputField()
field.setAttribute('id', 'inputAreaCodeMirror')
field.setAttribute('name', 'inputAreaCodeMirror')
field.setAttribute('autocorrect', 'off')
field.setAttribute('autocapitalize', 'off')
field.setAttribute('spellcheck', 'false')

export const debouncedCalculate = debounce(calculate, 100)

export const debouncedSaveCursor = debounce(() => {
  const pages = store.get('pages')
  const page = pages?.find((p) => p.id === app.activePage)

  if (!page) return

  const cursor = cm.getCursor()

  if (page.cursor?.line === cursor.line && page.cursor?.ch === cursor.ch) return

  page.cursor = cursor
  store.set('pages', pages)
}, 600)

/**
 * Refreshes the CodeMirror editor and optionally focuses it after a short delay.
 * @param {boolean} [focus=true] Whether to focus the editor after refreshing.
 */
export function refreshEditor(focus = true) {
  cm.operation(() => {
    cm.refresh()
    cm.setOption('mode', cm.getOption('mode'))
  })

  if (focus) {
    setTimeout(() => cm.focus(), 100)
  }
}

/**
 * Binds event listeners on the main CodeMirror instance and initializes hover tooltips.
 */
export function setupEditor() {
  cm.on('changes', (editor, changes) => {
    if (app.loadingPage) return

    if (isMobile) {
      calculate()
      return
    }

    const hasNewLine = changes.some(
      (change) =>
        change.text.length > 1 || change.removed?.length > 1 || (change.origin === '+input' && change.text.includes(''))
    )

    if (hasNewLine) {
      debouncedCalculate.cancel()
      calculate()
    } else {
      debouncedCalculate()
    }
  })

  cm.on('fold', (editor, from, to) => {
    if (app.loadingPage) return

    toggleFoldedOutputs(editor, from.line, to.line, true)
    calculate()
  })

  cm.on('unfold', (editor, from, to) => {
    if (app.loadingPage) return

    toggleFoldedOutputs(editor, from.line, to.line, false)
    calculate()
  })

  cm.on('update', () => {
    if (app.loadingPage) return

    syncOutputHeights(false)
  })

  cm.on('inputRead', (editor) => {
    if (!app.settings.autocomplete) return

    CodeMirror.commands.autocomplete(editor)
  })

  cm.on('cursorActivity', (editor) => {
    const activeLine = editor.getCursor().line

    if (previousActiveLine !== activeLine) {
      editor.operation(() => {
        if (previousActiveLine !== -1) {
          editor.removeLineClass(previousActiveLine, 'gutter', 'activeLine')
        }

        editor.addLineClass(activeLine, 'gutter', 'activeLine')
      })

      previousActiveLine = activeLine
    }

    updateSelectionStats()
    setTimeout(cmForceBottom, 20)

    if (!app.loadingPage) {
      debouncedSaveCursor()
    }
  })

  cm.on('gutterClick', (editor, line, gutter) => {
    if (gutter !== 'CodeMirror-linenumbers') return

    const lineNo = line + 1
    const activeLine = editor.getCursor().line + 1
    const error = dom.el('[data-index="' + line + '"]')?.firstChild?.dataset.error

    if (error) {
      showError(`Error on Line ${lineNo}`, error)
      return
    }

    if (activeLine <= lineNo) return

    editor.replaceSelection('line' + lineNo)
  })

  cm.on('scrollCursorIntoView', cmForceBottom)

  document.addEventListener('keydown', (event) => {
    app.refreshCM = !event.repeat
  })

  document.addEventListener('keyup', () => {
    app.refreshCM = true
  })

  initTooltips(cm)
}
