import { $, $all } from './common'
import { cm, udfInput, uduInput } from './editor'
import { notify } from './modal'
import { isElectron } from './utils'

/** Main context menus */
function inputContext() {
  setTimeout(() => {
    const index = cm.getCursor().line
    const line = cm.getLine(index)
    const answer = $('#output').children[index].innerText
    const isEmpty = cm.getValue() === ''
    const isLine = line.length > 0
    const isSelection = cm.somethingSelected()
    const isMultiLine =
      cm.listSelections().length > 1 || cm.listSelections()[0].anchor.line !== cm.listSelections()[0].head.line
    const hasAnswer = answer !== '' && answer !== 'Error' && answer !== 'Plot'

    numara.inputContextMenu(index, isEmpty, isLine, isSelection, isMultiLine, hasAnswer)
  }, 20)
}

/** Output panel context menu. */
function outputContext(event) {
  const answer = event.srcElement.innerText
  const index = event.srcElement.dataset.line || event.srcElement.parentElement.dataset.line || cm.lastLine()
  const hasAnswer = index !== null && answer !== '' && answer !== 'Error' && answer !== 'Plot'
  const isEmpty = cm.getValue() === ''

  numara.outputContextMenu(index, isEmpty, hasAnswer)
}

/** Textbox context menu. */
function textboxContext() {
  setTimeout(() => {
    numara.textboxContextMenu()
  }, 20)
}

/** Copy line answer. */
function copyLine(event, index) {
  index = +index

  const line = cm.getLine(index).trim()

  navigator.clipboard.writeText(line).then(notify(`Copied Line ${index + 1} to clipboard.`))
}

/** Copy line answer. */
function copyAnswer(event, index, withLines) {
  index = +index

  const line = cm.getLine(index).trim()
  const answer = $('#output').children[index].children[0].dataset.copy
  const copiedText = withLines ? `${line} = ${answer}` : `${answer}`

  navigator.clipboard
    .writeText(copiedText)
    .then(notify(withLines ? `Copied Line ${index + 1} with answer to clipboard.` : `Copied '${answer}' to clipboard.`))
}

/** Copy all inputs. */
function copyAllLines() {
  if (cm.getValue() === '') {
    notify('Nothing to copy.')
  } else {
    navigator.clipboard.writeText(cm.getValue()).then(notify('Copied all lines to clipboard.'))
  }
}

/** Copy all answers. */
function copyAllAnswers() {
  if (cm.getValue() === '') {
    notify('Nothing to copy.')
  } else {
    let copiedOutputs = ''

    cm.eachLine((line) => {
      const index = cm.getLineNumber(line)

      copiedOutputs += `${$('#output').children[index].innerText}\n`
    })

    navigator.clipboard.writeText(copiedOutputs).then(notify('Copied all answers to clipboard.'))
  }
}

/** Copy page. */
export function copyAll() {
  if (cm.getValue() === '') {
    notify('Nothing to copy.')
  } else {
    let copiedCalc = ''

    cm.eachLine((line) => {
      const index = cm.getLineNumber(line)

      line = line.text.trim()

      copiedCalc += line
        ? line.match(/^(#|\/\/)/)
          ? `${line}\n`
          : `${line} = ${$('#output').children[index].innerText}\n`
        : '\n'
    })

    navigator.clipboard.writeText(copiedCalc).then(notify('Copied page to clipboard.'))
  }
}

// Context menus
if (isElectron) {
  cm.on('contextmenu', inputContext)

  udfInput.on('contextmenu', textboxContext)
  uduInput.on('contextmenu', textboxContext)

  $('#output').addEventListener('contextmenu', outputContext)

  $all('.textBox').forEach((el) => {
    el.addEventListener('contextmenu', textboxContext)
  })

  numara.copyLine(copyLine)
  numara.copyAnswer(copyAnswer)
  numara.copyLineWithAnswer(copyAnswer)
  numara.copyAllLines(copyAllLines)
  numara.copyAllAnswers(copyAllAnswers)
  numara.copyAll(copyAll)
}
