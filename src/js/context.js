import { dom } from './dom'
import { cm, udfInput, uduInput } from './editor'
import { notify } from './modal'
import { isElectron } from './utils'

/**
 * Helper to safely copy text to clipboard and show notification.
 * @param {string} text - The text to copy.
 * @param {string} message - The notification message.
 */
function copyToClipboard(text, message) {
  if (!text) {
    notify('Nothing to copy.')
    return
  }

  navigator.clipboard.writeText(text).then(() => notify(message))
}

const nothingToCopy = () => notify('Nothing to copy.')
const safeCopy = (text, message) => (text ? copyToClipboard(text, message) : nothingToCopy())

/**
 * Main context menus for input.
 */
function inputContext() {
  setTimeout(() => {
    const index = cm.getCursor().line
    const line = cm.getLine(index)
    const isLine = line.length > 0
    const isEmpty = cm.getValue() === ''
    const isSelection = cm.somethingSelected()
    const answer = dom.el(`[data-line="${index}"]`).innerText
    const hasAnswer = answer !== '' && answer !== 'Error' && answer !== 'Plot'
    const selections = cm.listSelections()
    const isMultiLine = selections.length > 1 || selections[0].anchor.line !== selections[0].head.line

    numara.inputContextMenu(index, isEmpty, isLine, isSelection, isMultiLine, hasAnswer)
  }, 20)
}

/**
 * Output panel context menu.
 * @param {Event} event - The event object.
 */
function outputContext(event) {
  const answer = event.target.innerText
  const index = event.target.dataset.line || event.target.firstChild.dataset.line || cm.lastLine()
  const hasAnswer = index !== null && answer !== '' && answer !== 'Error' && answer !== 'Plot'
  const isEmpty = cm.getValue() === ''

  numara.outputContextMenu(index, isEmpty, hasAnswer)
}

/**
 * Textbox context menu.
 */
function textboxContext() {
  setTimeout(numara.textboxContextMenu, 20)
}

/**
 * Copy line answer.
 * @param {Event} event - The event object.
 * @param {number} index - The index of the line.
 */
function copyLine(event, index) {
  index = +index

  const line = cm.getLine(index).trim()

  copyToClipboard(line, `Copied Line ${index + 1} to clipboard.`)
}

/**
 * Copy line answer.
 * @param {Event} event - The event object.
 * @param {number} index - The index of the line.
 * @param {boolean} withLines - Whether to include the line in the copied text.
 */
function copyAnswer(event, index, withLines) {
  index = +index

  const line = cm.getLine(index).trim()
  const answer = dom.el(`[data-line="${index}"]`).dataset.copy
  const copiedText = withLines ? `${line} = ${answer}` : `${answer}`

  copyToClipboard(
    copiedText,
    withLines ? `Copied Line ${index + 1} with answer to clipboard.` : `Copied '${answer}' to clipboard.`
  )
}

/**
 * Copy all inputs.
 */
function copyAllLines() {
  safeCopy(cm.getValue(), 'Copied all lines to clipboard.')
}

/**
 * Copy all answers.
 */
function copyAllAnswers() {
  if (cm.getValue() === '') return nothingToCopy()

  let copiedOutputs = ''

  cm.eachLine((line) => {
    const index = cm.getLineNumber(line)

    copiedOutputs += `${dom.el(`[data-line="${index}"]`).innerText ?? ''}\n`
  })

  safeCopy(copiedOutputs, 'Copied all answers to clipboard.')
}

/**
 * Copy page.
 */
export function copyAll() {
  if (cm.getValue() === '') return nothingToCopy()

  let copiedCalc = ''

  cm.eachLine((line) => {
    const index = cm.getLineNumber(line)
    const text = line.text.trim()

    copiedCalc += text
      ? text.match(/^(#|\/\/)/)
        ? `${text}\n`
        : `${text} = ${dom.el(`[data-line="${index}"]`).innerText ?? ''}\n`
      : '\n'
  })

  safeCopy(copiedCalc, 'Copied page to clipboard.')
}

// Context menus
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
