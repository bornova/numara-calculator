import { name } from '../../../package.json'
import { escapeHTML } from '../core/utils.js'
import { dom } from '../dom.js'
import { cm } from '../editor/index.js'
import { app } from '../state/appState.js'
import { isElectron } from '../state/env.js'
import { store } from '../state/store.js'
import { hideFloatingPageList } from './dialogs.js'

/**
 * Triggers printing for the current non-empty page after closing any floating page list drawer.
 */
export function printPage() {
  if (!cm.getValue()) return

  hideFloatingPageList()
  window.print()
}

/**
 * Configures print area beforeprint/afterprint event listeners and desktop print IPC.
 */
export function setupPrintArea() {
  let printArea = null

  if (isElectron) {
    numara.print(printPage)
  }

  window.addEventListener('beforeprint', () => {
    printArea?.remove()
    printArea = document.createElement('div')

    const tableRows = []
    const outputChildren = dom.output.firstElementChild?.children
    const isBottom = app.settings.answerPosition === 'bottom'
    const inputWidth = store.get('inputWidth') ?? app.settings.inputWidth ?? 60
    const noBB = 'border-bottom: none !important;'
    const trHeader = `<tr style="height: ${app.settings.lineHeight};">`
    let lineIndex = 0

    printArea.className = 'printArea'

    cm.eachLine((line) => {
      const input = escapeHTML(line.text)
      const answerEl = isBottom
        ? app.widgetMap.get(line)?.node
        : outputChildren?.[lineIndex] || dom.el(`#mainPanel [data-index="${lineIndex}"]`)
      const answer = escapeHTML(answerEl ? answerEl.textContent : '')

      const rowHtml = isBottom
        ? `
          ${trHeader}
            ${app.settings.lineNumbers ? `<td class="printLineNumCol" style="${noBB}">${lineIndex + 1}</td>` : ''}
            <td style="width:100%; ${noBB}">${input}</td>
          </tr>
          ${trHeader}
            ${app.settings.lineNumbers ? '<td class="printLineNumCol"></td>' : ''}
            <td>${answer}</td>
          </tr>`
        : `
          ${trHeader}
            ${app.settings.lineNumbers ? `<td class="printLineNumCol">${lineIndex + 1}</td>` : ''}
            <td style="width:${inputWidth}%;">${input}</td>
            <td class="printAnswer${app.settings.answerPosition === 'left' ? 'Left' : 'Right'}">${answer}</td>
          </tr>`

      tableRows.push(rowHtml)
      lineIndex++
    })

    printArea.innerHTML = `
      <div class="printTitle">${name}</div>
      <table
        class="printPage ${app.settings.rulers ? 'printRulers' : ''}"
        style="
          font-size: ${app.settings.fontSize};
          font-weight: ${app.settings.fontWeight};
          line-height: ${app.settings.lineHeight};"
      >${tableRows.join('')}</table>`

    document.body.appendChild(printArea)
  })

  window.addEventListener('afterprint', () => {
    if (printArea) {
      printArea.remove()
      printArea = null
    }
  })
}
