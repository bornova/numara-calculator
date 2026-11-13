import CodeMirror from 'codemirror'
import './addons.js'

import { dom } from '../dom.js'
import { app } from '../state/appState.js'
import { events } from '../state/events.js'
import { hideOpenDropdowns, showError } from '../ui/dialogs.js'
import { createFoldMarkerWidget, registerEditorFolding, toggleFoldedOutputs } from './folding.js'
import { registerEditorHints } from './hints.js'
import { registerEditorModes } from './mode.js'
import { hideSearchPanel, isSearchPanelOpen, showSearchPanel } from './searchPanel.js'
import { getSelectionLineRange, initStats, updateSelectionStats } from './stats.js'
import { initTooltips } from './tooltips.js'

let previousActiveLine = -1

/** Main calculator CodeMirror instance. */
export let cm = null

/**
 * Forces CodeMirror editor scroll to focus line alignment at the bottom of the visible screen.
 */
function cmForceBottom() {
  const line = cm.getCursor().line
  const totalLines = cm.lineCount()

  if (line === totalLines - 1) {
    const inputScroll = cm.getScrollerElement()

    inputScroll.scrollTop = inputScroll.scrollHeight
    dom.output.scrollTop = dom.output.scrollHeight

    return
  }

  const lineRect = cm.charCoords({ line, ch: 0 }, 'window')
  const barTop = cm.display.scrollbars?.horiz?.getBoundingClientRect()?.top

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
      const { startLine, endLine } = getSelectionLineRange(selection)

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

/**
 * Refreshes the CodeMirror editor layout and syntax mode.
 */
export function refreshEditor() {
  cm.operation(() => {
    cm.refresh()
    cm.setOption('mode', cm.getOption('mode'))
  })
}

/**
 * Initializes CodeMirror, registers editor modes/hints/folding, and binds event listeners.
 */
export function setupEditor() {
  registerEditorModes()
  registerEditorHints()
  registerEditorFolding()

  cm = CodeMirror.fromTextArea(dom.inputArea, {
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
      rangeFinder: CodeMirror.fold.numara,
      widget: createFoldMarkerWidget
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

  cm.getWrapperElement().addEventListener('pointerdown', () => hideOpenDropdowns())

  events.on('ui:modalsClosed', () => {
    if (!isSearchPanelOpen()) {
      setTimeout(() => cm?.focus(), 100)
    }
  })

  cm.on('changes', (_editor, changes) => {
    if (app.loadingPage) return

    events.emit('editor:changes', changes)
  })

  const handleFoldChange = (isFolded) => (editor, from, to) => {
    if (app.loadingPage) return

    toggleFoldedOutputs(editor, from.line, to.line, isFolded)
    events.emit('editor:foldChanges')
  }

  cm.on('fold', handleFoldChange(true))
  cm.on('unfold', handleFoldChange(false))

  cm.on('update', () => {
    if (app.loadingPage) return

    events.emit('editor:update')
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

    updateSelectionStats(editor)
    setTimeout(cmForceBottom, 20)
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

  initStats(cm)
  initTooltips(cm)
}
