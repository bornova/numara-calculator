import { $, $all } from './common.js'
import { cm, udfInput, uduInput } from './editor.js'
import { notify } from './modal.js'
import { ipc, isElectron } from './utils.js'

/** Main context menus */
export function inputContext() {
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

    ipc.send('inputContextMenu', index, isEmpty, isLine, isSelection, isMultiLine, hasAnswer)
  }, 20)
}

/** Output panel context menu. */
export function outputContext(e) {
  const index = e.srcElement.getAttribute('line-no') || e.srcElement.parentElement.getAttribute('line-no')
  const answer = e.srcElement.innerText
  const isEmpty = cm.getValue() === ''
  const hasAnswer = index !== null && answer !== '' && answer !== 'Error' && answer !== 'Plot'

  ipc.send('outputContextMenu', index, isEmpty, hasAnswer)
}

/** Textbox context menu. */
export function textboxContext() {
  setTimeout(() => {
    ipc.send('textboxContextMenu')
  }, 20)
}

/** Copy line answer. */
export function copyLine(event, index) {
  index = +index

  const line = cm.getLine(index).trim()

  navigator.clipboard.writeText(line).then(() => {
    notify(`Copied Line ${index + 1} to clipboard.`)
  })
}

/** Copy line answer. */
export function copyAnswer(event, index, withLines) {
  index = +index

  const line = cm.getLine(index).trim()
  const answer = $('#output').children[index].children[0].dataset.copy
  const copiedText = withLines ? `${line} = ${answer}` : `${answer}`

  navigator.clipboard.writeText(copiedText).then(() => {
    notify(withLines ? `Copied Line ${index + 1} with answer to clipboard.` : `Copied '${answer}' to clipboard.`)
  })
}

/** Copy all inputs. */
export function copyAllLines() {
  if (cm.getValue() === '') {
    notify('Nothing to copy.')
  } else {
    navigator.clipboard.writeText(cm.getValue()).then(() => {
      notify('Copied all lines to clipboard.')
    })
  }
}

/** Copy all answers. */
export function copyAllAnswers() {
  if (cm.getValue() === '') {
    notify('Nothing to copy.')
  } else {
    let copiedOutputs = ''

    cm.eachLine((line) => {
      const index = cm.getLineNumber(line)

      copiedOutputs += `${$('#output').children[index].innerText}\n`
    })

    navigator.clipboard.writeText(copiedOutputs).then(() => {
      notify('Copied all answers to clipboard.')
    })
  }
}

/** Copy all calculations. */
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

    navigator.clipboard.writeText(copiedCalc).then(() => {
      notify('Copied all calculations to clipboard.')
    })
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

  ipc.on('copyLine', copyLine)
  ipc.on('copyAnswer', copyAnswer)
  ipc.on('copyLineWithAnswer', copyAnswer)
  ipc.on('copyAllLines', copyAllLines)
  ipc.on('copyAllAnswers', copyAllAnswers)
  ipc.on('copyAll', copyAll)
}
