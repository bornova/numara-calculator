import { escapeHTML } from '../core/utils.js'
import { dom } from '../dom.js'
import { cm, udfInput, uduInput } from '../editor/index.js'
import { isElectron } from '../state/env.js'
import { notify } from './dialogs.js'

/**
 * Helper to safely copy text to clipboard and show notification.
 * @param {string} text The text to copy.
 * @param {string} message The notification message.
 */
function copyToClipboard(text, message) {
  if (!text) {
    notify('Nothing to copy.')
    return
  }

  navigator.clipboard.writeText(text).then(() => notify(message))
}

/**
 * Extracts the copyable answer text from an output line element, respecting copyThouSep.
 * @param {Element} outputEl The output element with data-index.
 * @returns {string} The copyable answer string.
 */
function getLineCopyableAnswer(outputEl) {
  if (!outputEl) return ''

  const answerEl = outputEl.querySelector('[data-answer]')
  if (answerEl) return answerEl.dataset.answer || ''

  const plotEl = outputEl.querySelector('.plotButton, [data-plot]')
  if (plotEl) return plotEl.dataset.plot || ''

  return ''
}

/**
 * Main context menus for input.
 */
function inputContext() {
  requestAnimationFrame(() => {
    const lineIndex = cm.getCursor().line
    const isEmpty = cm.getValue() === ''
    const outputEl = dom.el(`[data-index="${lineIndex}"]`)
    const isPlot =
      Boolean(outputEl?.querySelector('.plotButton, [data-plot]')) ||
      Boolean(outputEl?.classList?.contains('plotButton'))
    const answerValue = outputEl?.dataset?.answer || outputEl?.querySelector('[data-answer]')?.dataset?.answer
    const hasAnswer = Boolean(answerValue) && !isPlot
    const selections = cm.listSelections()
    const isMultiLine = selections.length > 1 || selections[0].anchor.line !== selections[0].head.line

    numara.inputContextMenu(lineIndex, isEmpty, isMultiLine, hasAnswer)
  })
}

/**
 * Textbox context menu.
 */
function textboxContext() {
  requestAnimationFrame(() => numara.textboxContextMenu())
}

/**
 * Copy a single input line.
 * @param {number|string} index The 0-based index of the line.
 */
function copyLine(index) {
  index = +index

  const line = cm.getLine(index).trim()

  copyToClipboard(line, `Copied Line ${index + 1} to clipboard.`)
}

/**
 * Copy line answer.
 * @param {number|string} lineIndex The 0-based index of the line.
 * @param {boolean} [withLines=false] Whether to include the line expression in the copied text.
 */
function copyAnswer(lineIndex, withLines) {
  lineIndex = +lineIndex

  const line = cm.getLine(lineIndex).trim()
  const answer = getLineCopyableAnswer(dom.el(`[data-index="${lineIndex}"]`))
  if (!answer) return copyToClipboard()

  const copiedText = withLines ? `${line} = ${answer}` : `${answer}`
  const safeText = escapeHTML(copiedText)

  copyToClipboard(
    copiedText,
    withLines ? `Copied Line ${lineIndex + 1} with answer to clipboard.` : `Copied '${safeText}' to clipboard.`
  )
}

/**
 * Copy all inputs.
 */
function copyAllLines() {
  copyToClipboard(cm.getValue(), 'Copied all lines to clipboard.')
}

/**
 * Builds a map of line index to copyable answer text for all rendered output lines.
 * @returns {Record<string, string>} Map of line index to answer text.
 */
function getAnswersMap() {
  const answersMap = {}

  document.querySelectorAll('[data-index]').forEach((el) => {
    answersMap[el.getAttribute('data-index')] = getLineCopyableAnswer(el)
  })

  return answersMap
}

/**
 * Copy all answers.
 */
function copyAllAnswers() {
  if (cm.getValue() === '') return copyToClipboard()

  const copiedOutputs = []
  const answersMap = getAnswersMap()
  let lineIdx = 0

  cm.eachLine(() => {
    copiedOutputs.push(answersMap[lineIdx] ?? '')
    lineIdx++
  })

  copyToClipboard(copiedOutputs.join('\n'), 'Copied all answers to clipboard.')
}

/**
 * Output panel context menu.
 * @param {Event} event The event object.
 */
export function outputContext(event) {
  event.stopPropagation()

  if (!isElectron) return

  const target = event.target.closest('[data-index]')
  const lineIndex = target ? target.dataset.index : cm.lastLine()
  const isPlot =
    Boolean(target?.classList?.contains('plotButton')) ||
    Boolean(target?.closest?.('.plotButton, [data-plot]')) ||
    Boolean(target?.querySelector?.('.plotButton, [data-plot]'))
  const answer =
    target?.dataset?.answer ||
    target?.querySelector?.('[data-answer]')?.dataset?.answer ||
    target?.textContent?.trim() ||
    ''
  const hasAnswer = lineIndex !== null && Boolean(answer) && answer !== 'Error' && answer !== 'Plot' && !isPlot
  const isEmpty = cm.getValue() === ''

  numara.outputContextMenu(lineIndex, isEmpty, hasAnswer)
}

/**
 * Copy page.
 */
export function copyAll() {
  if (cm.getValue() === '') return copyToClipboard()

  const copiedCalc = []
  const answersMap = getAnswersMap()
  let lineIdx = 0

  cm.eachLine((line) => {
    const text = line.text.trim()

    copiedCalc.push(!text ? '' : text.match(/^(#|\/\/)/) ? text : `${text} = ${answersMap[lineIdx] ?? ''}`)

    lineIdx++
  })

  copyToClipboard(copiedCalc.join('\n'), 'Copied page to clipboard.')
}

/**
 * Binds mouse click context menu actions for input, outputs, and textboxes.
 */
export function initializeContextMenus() {
  if (!isElectron) return

  cm.on('contextmenu', inputContext)
  udfInput.on('contextmenu', textboxContext)
  uduInput.on('contextmenu', textboxContext)

  dom.output.addEventListener('contextmenu', outputContext)

  dom.els('.textBox').forEach((el) => el.addEventListener('contextmenu', textboxContext))

  numara.copyLine(copyLine)
  numara.copyAnswer(copyAnswer)
  numara.copyAllLines(copyAllLines)
  numara.copyAllAnswers(copyAllAnswers)
  numara.copyAll(copyAll)
}
