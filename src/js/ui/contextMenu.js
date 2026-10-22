import { dom } from '../dom'
import { cm, udfInput, uduInput } from '../editor'
import { notify } from './dialogs'
import { isElectron } from '../appState'
import { escapeHTML } from '../core/utils.js'

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
 * Main context menus for input.
 */
function inputContext() {
  requestAnimationFrame(() => {
    const lineIndex = cm.getCursor().line
    const line = cm.getLine(lineIndex)
    const isLine = line.length > 0
    const isEmpty = cm.getValue() === ''
    const isSelection = cm.somethingSelected()
    const answer = dom.el(`[data-index="${lineIndex}"]`)?.textContent ?? ''
    const hasAnswer = answer !== '' && answer !== 'Error' && answer !== 'Plot'
    const selections = cm.listSelections()
    const isMultiLine = selections.length > 1 || selections[0].anchor.line !== selections[0].head.line

    numara.inputContextMenu(lineIndex, isEmpty, isLine, isSelection, isMultiLine, hasAnswer)
  })
}

/**
 * Output panel context menu.
 * @param {Event} event The event object.
 */
export function outputContext(event) {
  const target = event.target.closest('[data-index]')
  const lineIndex = target ? target.dataset.index : cm.lastLine()
  const answer = target ? target.textContent : ''
  const hasAnswer = lineIndex !== null && answer !== '' && answer !== 'Error' && answer !== 'Plot'
  const isEmpty = cm.getValue() === ''

  numara.outputContextMenu(lineIndex, isEmpty, hasAnswer)
}

/**
 * Textbox context menu.
 */
function textboxContext() {
  requestAnimationFrame(() => numara.textboxContextMenu())
}

function copyLine(index) {
  index = +index

  const line = cm.getLine(index).trim()

  copyToClipboard(line, `Copied Line ${index + 1} to clipboard.`)
}

/**
 * Copy line answer.
 * @param {number} lineIndex The index of the line.
 * @param {boolean} withLines Whether to include the line in the copied text.
 */
function copyAnswer(lineIndex, withLines) {
  lineIndex = +lineIndex

  const line = cm.getLine(lineIndex).trim()
  const answer = dom.el(`[data-index="${lineIndex}"]`)?.firstChild?.dataset.answer
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
 * Extracts the copyable answer text from an output line element, respecting copyThouSep.
 * @param {Element} el The output element with data-index.
 * @returns {string} The copyable answer string.
 */
function getLineAnswerText(el) {
  const answerEl = el.querySelector('[data-answer]')
  if (answerEl) return answerEl.dataset.answer ?? ''

  const plotEl = el.querySelector('[data-plot]')
  if (plotEl) return plotEl.dataset.plot ?? ''

  return el.textContent?.trim() ?? ''
}

/**
 * Copy all answers.
 */
function copyAllAnswers() {
  if (cm.getValue() === '') return copyToClipboard()

  const copiedOutputs = []
  const answersMap = {}

  document.querySelectorAll('[data-index]').forEach((el) => {
    answersMap[el.getAttribute('data-index')] = getLineAnswerText(el)
  })

  let lineIdx = 0

  cm.eachLine(() => {
    copiedOutputs.push(answersMap[lineIdx] ?? '')
    lineIdx++
  })

  copyToClipboard(copiedOutputs.join('\n'), 'Copied all answers to clipboard.')
}

/**
 * Copy page.
 */
export function copyAll() {
  if (cm.getValue() === '') return copyToClipboard()

  const copiedCalc = []
  const answersMap = {}

  document.querySelectorAll('[data-index]').forEach((el) => {
    answersMap[el.getAttribute('data-index')] = getLineAnswerText(el)
  })

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
  numara.copyLineWithAnswer(copyAnswer)
  numara.copyAllLines(copyAllLines)
  numara.copyAllAnswers(copyAllAnswers)
  numara.copyAll(copyAll)
}
