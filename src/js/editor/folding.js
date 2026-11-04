import CodeMirror from 'codemirror'

import { dom } from '../dom.js'
import { app } from '../state/appState.js'

const HEADER_REGEXP = /^\s*(?:\/\/\s*)?(#{1,6})\s+(\S.*)$/
const END_SECTION_REGEXP = /^\s*(?:\/\/\s*)?#[!\s]*$/

/**
 * Registers the `'numara'` markdown section fold rangefinder on CodeMirror.
 */
export function registerEditorFolding() {
  CodeMirror.registerHelper('fold', 'numara', (cm, start) => {
    const startLineText = cm.getLine(start.line)

    if (!startLineText || END_SECTION_REGEXP.test(startLineText)) return

    const match = HEADER_REGEXP.exec(startLineText)

    if (match) {
      const headerLevel = match[1].length
      const lastLine = cm.lineCount() - 1
      let endLine = -1

      for (let i = start.line + 1; i <= lastLine; i++) {
        const text = cm.getLine(i)

        if (END_SECTION_REGEXP.test(text)) {
          endLine = i
          break
        }

        const m = HEADER_REGEXP.exec(text)

        if (m) {
          const nextLevel = m[1].length

          if (nextLevel <= headerLevel) {
            endLine = i - 1
            break
          }
        }
      }

      if (endLine === -1) {
        endLine = lastLine
      }

      if (endLine > start.line) {
        while (endLine > start.line && cm.getLine(endLine).trim() === '') {
          endLine--
        }

        if (endLine > start.line) {
          return {
            from: CodeMirror.Pos(start.line, startLineText.length),
            to: CodeMirror.Pos(endLine, cm.getLine(endLine).length)
          }
        }
      }
    }
  })
}

/**
 * Toggle folded output rows when an editor section is folded or unfolded.
 * @param {CodeMirror} cm The CodeMirror instance.
 * @param {number} fromLine Start line.
 * @param {number} toLine End line.
 * @param {boolean} isFolded Whether the outputs are folded.
 */
export function toggleFoldedOutputs(cm, fromLine, toLine, isFolded) {
  const hasLineWidget = app.settings.answerPosition === 'bottom'
  const outputChildren = dom.output.firstElementChild?.children

  for (let i = fromLine + 1; i <= toLine; i++) {
    if (hasLineWidget) {
      const lineHandle = cm.getLineHandle(i)

      if (lineHandle) {
        const widget = app.widgetMap.get(lineHandle)

        if (widget) {
          const newDisplay = isFolded ? 'none' : ''

          if (widget.node.style.display !== newDisplay) {
            widget.node.style.display = newDisplay
            widget.changed()
          }
        }
      }
    } else {
      const el = outputChildren?.[i] || dom.el(`[data-index="${i}"]`)

      if (el) {
        el.style.display = isFolded ? 'none' : ''
      }
    }

    if (!isFolded && typeof cm.findMarksAt === 'function') {
      const lineText = cm.getLine(i)
      const marks = cm.findMarksAt(CodeMirror.Pos(i, lineText?.length ?? 0))
      const foldMark = marks?.find((m) => m.__isFold || m.collapsed)
      const range = foldMark?.find?.()

      if (range?.from?.line === i && range?.to?.line > i) {
        i = range.to.line
      }
    }
  }
}
