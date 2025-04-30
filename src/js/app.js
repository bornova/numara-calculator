import { checkColorChange, colors } from './colors'
import { app, store } from './common'
import { copyAll } from './context'
import { dom } from './dom'
import { cm, refreshEditor, udfInput, uduInput } from './editor'
import { calculate } from './eval'
import { generateIcons } from './icons'
import { modal, notify, showError } from './modal'
import { plot } from './plot'
import { settings } from './settings'
import { defaultPage, lastPage, loadPage, migrateSaved, getPageName, pageOrder, populatePages } from './pages'
import { applyUdfu } from './userDefined'
import { checkSize, checkAppUpdate, isMac, isElectron, toggleMinMax } from './utils'

import { author, description, homepage, name, version } from './../../package.json'

import { tinykeys } from 'tinykeys'

import UIkit from 'uikit'

document.title = description

const setupHeaders = () => {
  if (isElectron && !isMac) {
    dom.headerMac.remove()
    dom.headerWin.style.display = 'block'
    dom.headerWinTitle.innerHTML = name

    dom.maxBtn.style.display = numara.isMaximized() ? 'none' : 'block'
    dom.unmaxBtn.style.display = numara.isMaximized() ? 'block' : 'none'

    dom.minBtn.addEventListener('click', numara.minimize)
    dom.maxBtn.addEventListener('click', numara.maximize)
    dom.unmaxBtn.addEventListener('click', numara.unmaximize)
    dom.closeBtn.addEventListener('click', numara.close)

    numara.isMax((event, isMax) => {
      dom.unmaxBtn.style.display = isMax ? 'block' : 'none'
      dom.maxBtn.style.display = isMax ? 'none' : 'block'
    })

    dom.headerWin.addEventListener('dblclick', toggleMinMax)
  } else {
    dom.headerWin.remove()
    dom.headerMac.style.display = 'block'
    dom.headerMacTitle.innerHTML = name

    if (isElectron) {
      dom.headerMac.addEventListener('dblclick', toggleMinMax)
    }
  }
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
    dom.logsLink.parentElement.style.display = 'block'
    dom.logsLink.addEventListener('click', numara.openLogs)
  }
}

const setupActionButtons = () => {
  dom.clearButton.addEventListener('click', () => {
    if (cm.getValue() !== '') {
      cm.setValue('')
      cm.focus()

      calculate()
    }
  })

  dom.copyButton.addEventListener('click', copyAll)

  dom.udfuButton.addEventListener('click', () => {
    modal.show('#dialogUdfu')
  })

  dom.settingsButton.addEventListener('click', () => {
    modal.show('#dialogSettings')
  })

  dom.aboutButton.addEventListener('click', () => {
    modal.show('#dialogAbout')
  })
}

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
        const modalOpen = document.querySelectorAll('.uk-open').length > 0

        if (!modalOpen) {
          document.getElementById(button).click()
        } else if (dom.sidePanel.classList.contains('uk-open') && !dom.dialogNewPage.classList.contains('uk-open')) {
          dom.closeSidePanelButton.click()
        }
      }
    })
  }
}

let windowResizeDelay

const setupEventListeners = () => {
  document.addEventListener('keydown', (event) => {
    app.refreshCM = !event.repeat
  })

  document.addEventListener('keyup', () => {
    app.refreshCM = true
  })

  window.addEventListener('resize', () => {
    if (app.activePlot && dom.dialogPlot.classList.contains('uk-open')) {
      plot()
    }

    clearTimeout(windowResizeDelay)
    windowResizeDelay = setTimeout(calculate, 10)
    checkSize()
  })
}

const setupSyncScroll = () => {
  const inputPanel = document.querySelector('.CodeMirror-scroll')
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

const setupUIkitUtils = () => {
  // Tooltip defaults
  UIkit.mixin({ data: { offset: 5 } }, 'tooltip')
  // Initiate theme dialog
  UIkit.util.on('#dialogTheme', 'shown', checkColorChange)
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

  // Focus on input when dialog is closed
  UIkit.util.on('.modal', 'hidden', () => {
    setTimeout(() => {
      cm.focus()
    }, 100)
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

  UIkit.util.on('#sidePanel', 'hidden', () => {
    setTimeout(() => {
      cm.focus()
    }, 20)
  })
}

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
          font-size: "${app.settings.fontSize}";
          font-weight: "${app.settings.fontWeight}";"
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

const initializeApp = () => {
  setupHeaders()
  setupAppInfo()
  setupActionButtons()
  setupOutputPanelActions()
  setupPanelResizer()
  setupKeyboardShortcuts()
  setupEventListeners()
  setupSyncScroll()
  setupUIkitUtils()
  setupUserDefined()
  setupPrint()
  generateIcons()

  colors.initialize()
  colors.apply()

  settings.initialize()
  settings.apply()

  if (!store.get('pages')) {
    defaultPage()
  } else {
    app.activePage = lastPage()
    loadPage(lastPage())
  }

  migrateSaved()
  populatePages()

  if (isElectron) {
    numara.themeUpdate(settings.apply)
    numara.fullscreen()
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

  setTimeout(() => {
    cm.focus()
  }, 500)
}

initializeApp()
