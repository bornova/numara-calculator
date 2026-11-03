import { name } from '../../../package.json'
import { escapeHTML } from '../core/utils.js'
import { dom } from '../dom.js'
import { cm } from '../editor/index.js'
import { app } from '../state/appState.js'
import { store } from '../state/store.js'

/**
 * Configures print area beforeprint/afterprint event listeners.
 */
export function setupPrintArea() {
  window.addEventListener('beforeprint', () => {
    const printArea = document.createElement('div')
    const tableRows = []
    const outputChildren = dom.output.firstElementChild?.children
    const isBottom = app.settings.answerPosition === 'bottom'
    const inputWidth = store.get('inputWidth') ?? app.settings.inputWidth ?? 60
    const noBB = 'border-bottom: none !important;'
    let lineIndex = 0

    printArea.setAttribute('id', 'printArea')
    printArea.className = 'printArea'

    cm.eachLine((line) => {
      const input = escapeHTML(line.text)
      const answerEl = isBottom
        ? app.widgetMap.get(line)?.node
        : outputChildren?.[lineIndex] || dom.el(`[data-index="${lineIndex}"]`)
      const answer = escapeHTML(answerEl ? answerEl.textContent : '')
      const trHeader = `<tr style="
        height: ${app.settings.lineHeight};
        font-size: ${app.settings.fontSize};
        font-weight: ${app.settings.fontWeight};"
      >`

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
      <div id="printTitle" class="printTitle">${name}</div>
      <table
        id="printPage"
        class="printPage ${app.settings.rulers ? 'printRulers' : ''}"
        style="
          font-size: ${app.settings.fontSize};
          font-weight: ${app.settings.fontWeight};
          line-height: ${app.settings.lineHeight};"
      >${tableRows.join('')}</table>`

    dom.printArea = printArea
    document.body.appendChild(printArea)
  })

  window.addEventListener('afterprint', () => {
    if (dom.printArea) {
      dom.printArea.remove()
      dom.printArea = null
    }
  })
}
