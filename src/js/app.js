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
import { app, checkAppUpdate, isMac, isElectron, store, toggleMinMax } from './utils'

import { author, description, homepage, name, version } from './../../package.json'

import { tinykeys } from 'tinykeys'

import UIkit from 'uikit'

document.title = description

/**
 * Sets up the application headers based on platform and environment.
 */
const setupHeaders = () => {
  if (isElectron && !isMac) {
    dom.headerMac.remove()
    dom.headerWin.style.display = 'block'
    dom.headerWinTitle.innerHTML = name
  } else {
    dom.headerWin.remove()
    dom.headerMac.style.display = 'block'
    dom.headerMacTitle.innerHTML = name

    if (isElectron) {
      dom.headerMac.addEventListener('dblclick', toggleMinMax)
    }
  }
}

/**
 * Attaches click handlers to main action buttons in the UI.
 */
const setupActionButtons = () => {
  const buttonActions = [
    {
      btn: dom.clearButton,
      handler: () => {
        if (cm.getValue() !== '') {
          cm.setValue('')
          cm.focus()
          calculate()
        }
      }
    },
    { btn: dom.copyButton, handler: copyAll },
    { btn: dom.udfuButton, handler: () => modal.show('#dialogUdfu') },
    { btn: dom.settingsButton, handler: () => modal.show('#dialogSettings') },
    { btn: dom.aboutButton, handler: () => modal.show('#dialogAbout') }
  ]

  buttonActions.forEach(({ btn, handler }) => btn.addEventListener('click', handler))
}

/**
 * Sets up click and mouse events for the output panel.
 */
const setupOutputPanelActions = () => {
  dom.output.addEventListener('click', (event) => {
    switch (event.target.className) {
      case 'answer':
        navigator.clipboard.writeText(event.target.dataset.copy)
        notify(`Copied '${event.target.dataset.copy}' to clipboard.`)
        break
      case 'plotButton': {
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
    const sels = document.getElementsByClassName('CodeMirror-selected')

    while (sels[0]) {
      sels[0].classList.remove('CodeMirror-selected')
    }
  })
}

/**
 * Initializes UIkit utilities, dialog events, and user-defined input editors.
 * Handles focus management and page sorting.
 */
const setupUIkitUtils = () => {
  // Tooltip defaults
  UIkit.mixin({ data: { offset: 5 } }, 'tooltip')

  // Windows controls transparency when modal is shown/hidden
  UIkit.util.on('.modal, #sidePanel', 'beforeshow', () => {
    if (isElectron) numara.transControls(true)
  })

  UIkit.util.on('.modal, #sidePanel', 'hidden', () => {
    const modalOpen = dom.els('.uk-open').length > 0

    if (isElectron) numara.transControls(modalOpen)
    // Focus on input when dialog is closed
    setTimeout(() => {
      cm.focus()
    }, 100)
  })

  // Initiate theme dialog
  UIkit.util.on('#dialogTheme', 'shown', () => {
    checkColorChange()
  })

  // Initiate settings dialog
  UIkit.util.on('#dialogSettings', 'beforeshow', settings.prep)

  let udTab = 1
  // Prepare user defined dialog inputs
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

  // Plot dialog
  UIkit.util.on('#dialogPlot', 'shown', plot)
  UIkit.util.on('#dialogPlot', 'hide', () => {
    app.activePlot = false
  })

  // Save page sort order after move
  UIkit.util.on('#pageList', 'moved', () => {
    pageOrder()
    populatePages()
  })

  // Save dialog title focus on shown
  UIkit.util.on('#dialogNewPage', 'shown', () => {
    dom.newPageTitleInput.setAttribute('placeholder', getPageName())
    dom.newPageTitleInput.focus()
  })

  // Focus rename input on show
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

/**
 * Loads and applies user-defined functions and units from storage.
 */
const setupUserDefined = () => {
  // Set user defined values
  if (!store.get('udf')) {
    store.set('udf', '')
  }

  if (!store.get('udu')) {
    store.set('udu', '')
  }

  applyUdfu(store.get('udf'), 'func')
  applyUdfu(store.get('udu'), 'unit')
}

/**
 * Enables resizing of the input/output panel via a draggable divider.
 * Handles double-click to reset and mouse events for resizing.
 */
const setupPanelResizer = () => {
  let resizeDelay
  let isResizing = false

  const panel = dom.panel
  const divider = dom.panelDivider
  const dividerTooltip = () => {
    divider.title =
      dom.input.style.width === settings.defaults.inputWidth + '%' ? 'Drag to resize' : 'Double click to reset position'
  }

  divider.addEventListener('dblclick', () => {
    app.settings.inputWidth = settings.defaults.inputWidth
    store.set('settings', app.settings)
    settings.apply()
    dividerTooltip()
  })

  divider.addEventListener('mousedown', (event) => {
    isResizing = event.target === divider
  })

  dom.panel.addEventListener('mouseup', () => {
    isResizing = false
  })

  dom.panel.addEventListener('mousemove', (event) => {
    if (isResizing) {
      const offset = app.settings.lineNumbers ? 12 : 27
      const pointerRelativeXpos = event.clientX - panel.offsetLeft - offset
      let inputWidth = (pointerRelativeXpos / panel.clientWidth) * 100
      inputWidth = Math.max(0, Math.min(100, inputWidth))

      dom.input.style.width = inputWidth + '%'
      app.settings.inputWidth = inputWidth
      store.set('settings', app.settings)

      clearTimeout(resizeDelay)
      resizeDelay = setTimeout(calculate, 10)
    }

    dividerTooltip()
  })
}

/**
 * Synchronizes scrolling between the input and output panels.
 * Adds scroll-to-top button functionality.
 */
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

/**
 * Populates the About dialog with app info and sets up related links.
 */
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
  }
}

/**
 * Registers keyboard shortcuts for common actions using tinykeys.
 * Handles modal state and side panel toggling.
 */
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

/**
 * Prepares the print layout and cleans up after printing.
 * Dynamically generates a print-friendly version of the current page.
 */
const setupPrint = () => {
  window.addEventListener('beforeprint', () => {
    const printArea = document.createElement('div')

    printArea.setAttribute('id', 'printArea')
    printArea.className = 'printArea'
    printArea.innerHTML = `
      <div id="printTitle" class="printTitle">${name}</div>
      <table id="printPage"
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
          <td class="printAnswer${app.settings.divider ? 'Left' : 'Right'}">${answer}</td>
        </tr>`

      document.getElementById('printPage').innerHTML += row
    })

    printArea.innerHTML += `</table>`
  })

  window.addEventListener('afterprint', () => {
    document.getElementById('printArea').remove()
  })
}

const electronActions = () => {
  if (!isElectron) return

  numara.themeUpdate(settings.apply)
  numara.restored(() => {
    cm.focus()
  })
  // Check for updates
  checkAppUpdate()
  // Open developer Tools
  dom.dialogAboutAppVersion.addEventListener('click', (event) => {
    if (event.detail === 9) {
      numara.openDevTools()
    }
  })
}

/**
 * Main application initializer. Calls all setup functions and loads initial state.
 */
const initializeApp = () => {
  generateIcons()

  colors.initialize()
  colors.apply()

  settings.initialize()
  settings.apply()

  setupHeaders()
  setupActionButtons()
  setupOutputPanelActions()
  setupUIkitUtils()
  setupUserDefined()
  setupPanelResizer()
  setupSyncScroll()
  setupAppInfo()
  setupKeyboardShortcuts()
  setupPrint()

  electronActions()
  initializePages()

  setTimeout(() => {
    cm.focus()
  }, 500)
}

initializeApp()
