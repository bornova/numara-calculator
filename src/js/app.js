import { checkColorChange, colors } from './colors'
import { $, $all, app, store } from './common'
import { copyAll } from './context'
import { cm, refreshEditor, udfInput, uduInput } from './editor'
import { calculate } from './eval'
import { generateIcons } from './icons'
import { modal, notify, showError } from './modal'
import { plot } from './plot'
import { settings } from './settings'
import { defaultPage, lastPage, loadPage, migrateSaved, getPageName, pageOrder, populatePages } from './pages'
import { applyUdfu } from './userDefined'
import { checkSize, checkUpdate, isMac, isElectron, toggleMinMax } from './utils'

import { author, description, homepage, name, version } from './../../package.json'

import { tinykeys } from 'tinykeys'

import UIkit from 'uikit'

document.title = description

const setupElectronHeaders = () => {
  if (isElectron && !isMac) {
    $('#header-mac').remove()
    $('#header-win').style.display = 'block'
    $('#header-win-title').innerHTML = name

    $('#max').style.display = numara.isMaximized() ? 'none' : 'block'
    $('#unmax').style.display = numara.isMaximized() ? 'block' : 'none'

    $('#min').addEventListener('click', numara.minimize)
    $('#max').addEventListener('click', numara.maximize)
    $('#unmax').addEventListener('click', numara.unmaximize)
    $('#close').addEventListener('click', numara.close)

    numara.isMax((event, isMax) => {
      $('#unmax').style.display = isMax ? 'block' : 'none'
      $('#max').style.display = isMax ? 'none' : 'block'
    })

    $('#header-win').addEventListener('dblclick', toggleMinMax)
  } else {
    $('#header-win').remove()
    $('#header-mac').style.display = 'block'
    $('#header-mac-title').innerHTML = name

    if (isElectron) {
      $('#header-mac').addEventListener('dblclick', toggleMinMax)
    }
  }
}

const setupAppInfo = () => {
  $('#dialog-about-copyright').innerHTML = `Copyright &copy; ${new Date().getFullYear()} ${author.name}`
  $('#dialog-about-appVersion').innerHTML = isElectron
    ? `Version ${version}`
    : `Version ${version}
      <div class="versionCtnr">
        <div>
          <a href="https://github.com/bornova/numara-calculator/releases" target="_blank">Download desktop version</a>
        </div>
      </div>`
  $('#gitLink').setAttribute('href', homepage)
  $('#webLink').setAttribute('href', author.url)
  $('#licenseLink').setAttribute('href', `${homepage}/blob/master/LICENSE`)
  $('#helpLink').setAttribute('href', `${homepage}/wiki`)

  if (isElectron) {
    $('#logsLink').parentElement.style.display = 'block'
    $('#logsLink').addEventListener('click', numara.openLogs)
  }
}

const setupActionButtons = () => {
  $('#clearButton').addEventListener('click', () => {
    if (cm.getValue() !== '') {
      cm.setValue('')
      cm.focus()

      calculate()
    }
  })

  $('#copyButton').addEventListener('click', copyAll)

  $('#udfuButton').addEventListener('click', () => {
    modal.show('#dialog-udfu')
  })

  $('#settingsButton').addEventListener('click', () => {
    modal.show('#dialog-settings')
  })

  $('#aboutButton').addEventListener('click', () => {
    modal.show('#dialog-about')
  })
}

const setupOutputPanelActions = () => {
  $('#output').addEventListener('click', (event) => {
    switch (event.target.className) {
      case 'answer':
        navigator.clipboard.writeText(event.target.dataset.copy)
        notify(`Copied '${event.target.dataset.copy}' to clipboard.`)
        break
      case 'plotButton': {
        const func = event.target.getAttribute('data-func')

        app.plotFunction = func.startsWith('line') ? app.mathScope[func] : func

        try {
          $('#plotCrossModal').checked = app.settings.plotCross
          $('#plotDerivativeModal').checked = app.settings.plotDerivative
          $('#plotGridModal').checked = app.settings.plotGrid

          plot()

          modal.show('#dialog-plot')
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

  $('#output').addEventListener('mousedown', () => {
    const sels = document.getElementsByClassName('CodeMirror-selected')

    while (sels[0]) {
      sels[0].classList.remove('CodeMirror-selected')
    }
  })
}

const setupPanelResizer = () => {
  let resizeDelay
  let isResizing = false

  const panel = $('#panel')
  const divider = $('#panelDivider')

  const dividerTooltip = () => {
    divider.title =
      $('#input').style.width === settings.defaults.inputWidth + '%'
        ? 'Drag to resize'
        : 'Double click to reset position'
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

  $('#panel').addEventListener('mouseup', () => {
    isResizing = false
  })

  $('#panel').addEventListener('mousemove', (event) => {
    if (isResizing) {
      const offset = app.settings.lineNumbers ? 12 : 27
      const pointerRelativeXpos = event.clientX - panel.offsetLeft - offset
      const iWidth = (pointerRelativeXpos / panel.clientWidth) * 100
      const inputWidth = iWidth < 0 ? 0 : iWidth > 100 ? 100 : iWidth

      $('#input').style.width = inputWidth + '%'
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
        if ($all('.uk-open').length === 0) {
          $('#' + button).click()
        } else if (
          $('#sidePanel').classList.contains('uk-open') &&
          !$('#dialog-newPage').classList.contains('uk-open')
        ) {
          $('#closeSidePanelButton').click()
        }
      }
    })
  }
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
      const answer = $('#output').children[lineNo].innerText
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

      $('#printPage').innerHTML += row
    })

    printArea.innerHTML += `</table>`
  })

  window.addEventListener('afterprint', () => {
    $('#printArea').remove()
  })
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
    if (app.activePlot && $('#dialog-plot').classList.contains('uk-open')) {
      plot()
    }

    clearTimeout(windowResizeDelay)
    windowResizeDelay = setTimeout(calculate, 10)
    checkSize()
  })
}

const setupSyncScroll = () => {
  const inputPanel = $('.CodeMirror-scroll')
  const outputPanel = $('#output')

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
    $('#scrollTop').style.display = outputPanel.scrollTop > 50 ? 'block' : 'none'
  })

  $('#scrollTop').addEventListener('click', () => {
    inputPanel.scroll({ top: 0, behavior: 'smooth' })
    outputPanel.scroll({ top: 0, behavior: 'smooth' })
  })
}

const setupUIkitUtils = () => {
  // Tooltip defaults
  UIkit.mixin({ data: { offset: 5 } }, 'tooltip')

  // Initiate theme dialog
  UIkit.util.on('#dialog-theme', 'shown', checkColorChange)

  // Initiate settings dialog
  UIkit.util.on('#dialog-settings', 'beforeshow', settings.prep)

  let udTab = 1

  // Prepare user defined dialog inputs
  UIkit.util.on('#dialog-udfu', 'shown', (event) => {
    if (event.target.id === 'dialog-udfu') {
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
  UIkit.util.on('#dialog-plot', 'shown', plot)
  UIkit.util.on('#dialog-plot', 'hide', () => {
    app.activePlot = false
  })

  // Save page sort order after move
  UIkit.util.on('#pageList', 'moved', () => {
    pageOrder()
    populatePages()
  })

  // Save dialog title focus on shown
  UIkit.util.on('#dialog-newPage', 'shown', () => {
    $('#newPageTitleInput').setAttribute('placeholder', getPageName())
    $('#newPageTitleInput').focus()
  })

  // Focus rename input on show
  UIkit.util.on('#dialog-renamePage', 'shown', () => {
    setTimeout(() => {
      $('#renamePageTitleInput').focus()
      $('#renamePageTitleInput').select()
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

const initializeApp = () => {
  // Set theme and maximize if needed
  if (isElectron) {
    numara.themeUpdate(settings.apply)
    numara.fullscreen()
    numara.restored(() => {
      cm.focus()
    })

    // Check for updates
    checkUpdate()

    // Restart button if update is installed
    $('#updateButton').addEventListener('click', () => {
      numara.updateApp()
    })

    // Open developer Tools
    $('#dialog-about-appVersion').addEventListener('click', (event) => {
      if (event.detail === 9) {
        numara.openDevTools()
      }
    })
  }

  setupElectronHeaders()
  setupAppInfo()
  setupActionButtons()
  setupOutputPanelActions()
  setupPanelResizer()
  setupKeyboardShortcuts()
  setupPrint()
  setupEventListeners()
  setupSyncScroll()
  setupUIkitUtils()
  setupUserDefined()

  // Generate app icons
  generateIcons()

  // Initialize theme colors
  colors.initialize()
  colors.apply()

  // Initialize settings
  settings.initialize()
  settings.apply()

  // Set user defined values
  if (!store.get('pages')) {
    defaultPage()
  } else {
    app.activePage = lastPage()
    loadPage(lastPage())
  }

  migrateSaved()

  // Populate saved calculation
  populatePages()

  setTimeout(() => {
    cm.focus()
  }, 500)
}

initializeApp()
