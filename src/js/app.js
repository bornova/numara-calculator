import { checkColorChange, colors } from './colors'
import { copyAll } from './context'
import { dom } from './dom'
import { cm, refreshEditor, udfInput, uduInput } from './editor'
import { calculate } from './eval'
import { generateIcons } from './icons'
import { modal, notify, showError } from './modal'
import { getPageName, initializePages, pageOrder, populatePages } from './pages'
import { plot } from './plot'
import { settings } from './settings'
import { applyUdfu } from './userDefined'
import { app, checkAppUpdate, isMac, isElectron, store } from './utils'

import { author, description, homepage, name, version } from './../../package.json'
import { tinykeys } from 'tinykeys'

import UIkit from 'uikit'

document.title = description

const setupHeaders = () => {
  if (isElectron && !isMac) {
    dom.headerMac.remove()
    dom.headerWin.style.display = 'block'
    dom.headerWinTitle.innerHTML = name
  } else {
    dom.headerWin.remove()
    dom.headerMac.style.display = 'block'
    dom.headerMacTitle.innerHTML = name
  }
}

const setupActionButtons = () => {
  const actionButtons = [
    { btn: 'printButton', action: () => window.print() },
    {
      btn: 'clearButton',
      action: () => {
        cm.setValue('')
        cm.focus()
        calculate()
      }
    },
    { btn: 'copyButton', action: () => copyAll() },
    { btn: 'udfuButton', action: () => modal.show('#dialogUdfu') },
    { btn: 'settingsButton', action: () => modal.show('#dialogSettings') },
    { btn: 'aboutButton', action: () => modal.show('#dialogAbout') }
  ]

  actionButtons.forEach(({ btn, action }) => dom[btn].addEventListener('click', action))
}

const setupOutputPanelActions = () => {
  document.addEventListener('click', (event) => {
    switch (event.target.className) {
      case 'answer':
        navigator.clipboard.writeText(event.target.dataset.copy)
        notify(`Copied '${event.target.dataset.copy}' to clipboard.`)
        break
      case 'plotButton answer': {
        const func = event.target.getAttribute('data-func')

        app.plotFunction = func.startsWith('line') ? app.mathScope[func] : func

        try {
          dom.plotCrossModal.checked = app.settings.plotCross
          dom.plotDerivativeModal.checked = app.settings.plotDerivative
          dom.plotGridModal.checked = app.settings.plotGrid

          plot()

          modal.show('#dialogPlot')
        } catch (error) {
          showError('Error', error)
        }
        break
      }
      case 'lineError':
        showError('Error on Line ' + event.target.getAttribute('data-line'), event.target.getAttribute('data-error'))
        break
    }
    event.stopPropagation()
  })

  dom.output.addEventListener('mousedown', () => {
    dom.els('.CodeMirror-selected').forEach((el) => el.classList.remove('CodeMirror-selected'))
  })
}

const setupUserDefined = () => {
  applyUdfu(store.get('udf') || '', 'func')
  applyUdfu(store.get('udu') || '', 'unit')
}

const setupPanelResizer = () => {
  const defaultWidth = 60
  let resizeDelay
  let isResizing = false

  let inputWidth = store.get('inputWidth') || defaultWidth
  if (app.settings.answerPosition === 'left') {
    dom.input.style.width = inputWidth + '%'
  } else if (app.settings.answerPosition === 'bottom') {
    dom.input.style.width = '100%'
  } else {
    dom.input.style.width = defaultWidth + '%'
  }

  const dividerTooltip = () => {
    dom.panelDivider.title =
      dom.input.style.width === `${defaultWidth}%` ? 'Drag to resize' : 'Double click to reset position'
  }

  dom.panelDivider.addEventListener('dblclick', () => {
    dom.input.style.width = `${defaultWidth}%`
    store.set('inputWidth', defaultWidth)
    dividerTooltip()
  })

  dom.panelDivider.addEventListener('mousedown', (event) => {
    isResizing = event.target === dom.panelDivider
  })

  dom.mainPanel.addEventListener('mouseup', () => {
    isResizing = false
  })

  dom.mainPanel.addEventListener('mousemove', (event) => {
    if (isResizing) {
      const offset = 10
      const pointerRelativeXpos = event.clientX - dom.mainPanel.offsetLeft - offset
      let inputWidth = (pointerRelativeXpos / dom.mainPanel.clientWidth) * 100
      inputWidth = Math.max(0, Math.min(100, inputWidth))

      dom.input.style.width = inputWidth + '%'
      store.set('inputWidth', inputWidth)

      clearTimeout(resizeDelay)
      resizeDelay = setTimeout(calculate, 10)
    }
  })

  dom.panelDivider.addEventListener('mousemove', dividerTooltip)
}

const setupSyncScroll = () => {
  const inputPanel = dom.el('.CodeMirror-scroll')
  const outputPanel = dom.output

  let inputScroll = false
  let outputScroll = false

  inputPanel.addEventListener('scroll', () => {
    if (!inputScroll) {
      outputScroll = true
      outputPanel.scrollTop = inputPanel.scrollTop
    }

    inputScroll = false
  })

  outputPanel.addEventListener('scroll', () => {
    if (!outputScroll) {
      inputScroll = true
      inputPanel.scrollTop = outputPanel.scrollTop
    }

    outputScroll = false
    dom.scrollTop.style.display = outputPanel.scrollTop > 50 ? 'block' : 'none'
  })

  dom.scrollTop.addEventListener('click', () => {
    inputPanel.scroll({ top: 0, behavior: 'smooth' })
    outputPanel.scroll({ top: 0, behavior: 'smooth' })
  })
}

const setupAppInfo = () => {
  dom.dialogAboutCopyright.innerHTML = `Copyright &copy; ${new Date().getFullYear()} ${author.name}`
  dom.dialogAboutAppVersion.innerHTML = isElectron
    ? `Version ${version}`
    : `Version ${version}
      <div class="versionCtnr">
        <div>
          <a href="https://github.com/bornova/numara-calculator/releases" target="_blank">Download desktop version</a>
        </div>
      </div>`
  dom.gitLink.setAttribute('href', homepage)
  dom.webLink.setAttribute('href', author.url)
  dom.licenseLink.setAttribute('href', `${homepage}/blob/master/LICENSE`)
  dom.helpLink.setAttribute('href', `${homepage}/wiki`)

  if (isElectron) {
    dom.dialogAboutAppVersion.title = `
    <div class="uk-text-small">
      <div><b>Chrome</b>: ${numara.versions.chrome()}</div>
      <div><b>Electron</b>: ${numara.versions.electron()}</div>
      <div><b>Node</b>: ${numara.versions.node()}</div>
      <div><b>V8</b>: ${numara.versions.v8()}</div>
    </div>`

    dom.logsLink.parentElement.style.display = 'block'
    dom.logsLink.addEventListener('click', numara.openLogs)

    // Open developer Tools
    dom.dialogAboutAppVersion.addEventListener('click', (event) => {
      if (event.detail === 9) numara.openDevTools()
    })
  }
}

const setupKeyboardShortcuts = () => {
  const keys = {
    clearButton: ['$mod+D'],
    newPageButton: ['$mod+N'],
    printButton: ['$mod+P'],
    sidePanelButton: ['Shift+TAB']
  }

  for (const [button, command] of Object.entries(keys)) {
    tinykeys(window, {
      [command]: (event) => {
        event.preventDefault()

        const modalOpen = dom.els('.uk-open').length > 0

        if (!modalOpen) {
          document.getElementById(button).click()
        } else if (dom.sidePanel.classList.contains('uk-open') && !dom.dialogNewPage.classList.contains('uk-open')) {
          dom.closeSidePanelButton.click()
        }
      }
    })
  }
}

const setupPrintArea = () => {
  window.addEventListener('beforeprint', () => {
    const printArea = document.createElement('div')
    const rows = []

    printArea.setAttribute('id', 'printArea')
    printArea.className = 'printArea'
    printArea.innerHTML = `
      <div id="printTitle" class="printTitle">${name}</div>
      <table
        id="printPage"
        class="printPage ${app.settings.rulers ? 'printRulers' : ''}"
        style="
          font-size: ${app.settings.fontSize};
          font-weight: ${app.settings.fontWeight};
          line-height: ${app.settings.lineHeight};"
      >`

    document.body.appendChild(printArea)

    cm.eachLine((line) => {
      const lineNo = cm.getLineNumber(line)
      const input = cm.getLine(lineNo)
      const answer = dom.output.children[lineNo].innerText
      const row = `
        <tr style="
          height: ${app.settings.lineHeight};
          font-size: ${app.settings.fontSize};
          font-weight: ${app.settings.fontWeight};"
        >
          ${app.settings.lineNumbers ? '<td class="printLineNumCol">' + (lineNo + 1) + '</td>' : ''}
          <td style="width:${app.settings.inputWidth}%;">${input}</td>
          <td class="printAnswer${app.settings.answerPosition === 'left' ? 'Left' : 'Right'}">${answer}</td>
        </tr>`

      rows.push(row)
    })

    document.getElementById('printPage').innerHTML = rows.join('')
    printArea.innerHTML += `</table>`
  })

  window.addEventListener('afterprint', () => document.getElementById('printArea').remove())
}

const setupUIkitUtils = () => {
  UIkit.mixin({ data: { offset: 5, delay: 300 } }, 'tooltip')

  UIkit.util.on('.modal, #sidePanel', 'beforeshow', () => {
    if (isElectron) numara.transControls(true)
  })

  UIkit.util.on('.modal, #sidePanel', 'hidden', () => {
    const modalOpen = dom.els('.uk-open').length > 0

    if (isElectron) numara.transControls(modalOpen)

    setTimeout(() => cm.focus(), 100)
  })

  UIkit.util.on('#dialogTheme', 'shown', () => {
    checkColorChange()
    colors.checkDefaults()
  })

  UIkit.util.on('#dialogSettings', 'beforeshow', settings.prep)

  let udTab = 1

  UIkit.util.on('#dialogUdfu', 'shown', (event) => {
    if (event.target.id === 'dialogUdfu') {
      const udf = store.get('udf').trim()
      const udu = store.get('udu').trim()

      refreshEditor(udTab === 1 ? udfInput : uduInput)

      udfInput.setValue(udf)
      uduInput.setValue(udu)
    }
  })

  UIkit.util.on('#udfTab', 'shown', () => {
    udTab = 1
    refreshEditor(udfInput)
  })

  UIkit.util.on('#uduTab', 'shown', () => {
    udTab = 2
    refreshEditor(uduInput)
  })

  UIkit.util.on('#dialogPlot', 'shown', plot)
  UIkit.util.on('#dialogPlot', 'hide', () => {
    app.activePlot = false
  })

  UIkit.util.on('#pageList', 'moved', () => {
    pageOrder()
    populatePages()
  })

  UIkit.util.on('#dialogNewPage', 'shown', () => {
    dom.newPageTitleInput.setAttribute('placeholder', getPageName())
    dom.newPageTitleInput.focus()
  })

  UIkit.util.on('#dialogRenamePage', 'shown', () => {
    setTimeout(() => {
      dom.renamePageTitleInput.focus()
      dom.renamePageTitleInput.select()
    }, 20)
  })

  UIkit.util.on('#dialogError', 'hidden', () => {
    dom.errTitle.innerHTML = ''
    dom.errMsg.innerHTML = ''
  })
}

const initializeApp = () => {
  generateIcons()

  settings.initialize()
  settings.apply()

  colors.initialize()
  colors.apply()

  setupHeaders()
  setupActionButtons()
  setupOutputPanelActions()
  setupUserDefined()
  setupPanelResizer()
  setupSyncScroll()
  setupAppInfo()
  setupKeyboardShortcuts()
  setupPrintArea()
  setupUIkitUtils()
  initializePages()
  checkAppUpdate()

  setTimeout(() => cm.focus(), 500)
}

initializeApp()
