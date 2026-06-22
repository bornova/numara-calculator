import { checkColorChange, colors } from './ui/theme'
import { copyAll, initializeContextMenus, safeCopyText } from './ui/contextMenu'
import { dom } from './dom'
import { cm, refreshEditor, udfInput, uduInput } from './editor'
import { calculate } from './calc/calcManager'
import { initCurrencies } from './calc/currencies'
import { initializeSettingsTooltips } from './ui/settingsTips'
import { generateIcons } from './ui/icons'
import { numaraKeys } from './editor/keybindings.js'
import { modal, notify, showError } from './ui/dialogs'
import { getPageName, initializePages, pageOrder, populatePages, setupSideBar } from './ui/pageManager'
import { plot } from './ui/functionPlot'
import { applyAnswerPositionLayout, settings } from './ui/settings'
import { applyUdfu } from './calc/userDefined'
import { app, checkAppUpdate, isMac, isElectron, store } from './appState'
import { triggerFolderSync, checkSyncDir, handleSyncDirDeleted } from './calc/sync'

import { author, description, homepage, name, version } from './../../package.json'

import UIkit from 'uikit'

document.title = description

/**
 * Configures the application title headers based on OS (Windows vs. macOS).
 */
const setupHeaders = () => {
  const isWin = isElectron && !isMac
  const active = isWin ? 'Win' : 'Mac'
  const inactive = isWin ? 'Mac' : 'Win'

  dom[`header${inactive}`].remove()
  dom[`header${active}`].style.display = 'block'
  dom[`header${active}Title`].innerHTML = name
}

/**
 * Binds click event handlers for main application buttons in the title bar / actions.
 */
const setupAppButtons = () => {
  const buttons = {
    printButton: () => {
      window.print()
      if (!app.sidebarDocked) {
        UIkit.offcanvas('#sideBar').hide()
      }
    },
    clearButton: () => {
      cm.setValue('')
      cm.focus()
      calculate()
      if (!app.sidebarDocked) {
        UIkit.offcanvas('#sideBar').hide()
      }
    },
    copyButton: () => {
      copyAll()
      if (!app.sidebarDocked) {
        UIkit.offcanvas('#sideBar').hide()
      }
    },
    udfuButton: () => modal.show('#dialogUdfu'),
    settingsButton: () => modal.show('#dialogSettings'),
    aboutButton: () => modal.show('#dialogAbout')
  }

  Object.entries(buttons).forEach(([btn, action]) => dom[btn].addEventListener('click', action))
}

/**
 * Sets up global click event listeners on the document to handle interactions
 * with answers (copying to clipboard), errors (showing error modal), and plots.
 */
const setupResultActions = () => {
  document.addEventListener('click', (event) => {
    const answerEl = event.target.closest('[data-answer]')
    const errorEl = event.target.closest('[data-error]')
    const plotEl = event.target.closest('[data-plot]')

    if (plotEl) {
      const func = plotEl.getAttribute('data-plot')

      app.plotFunction = func.startsWith('line') ? app.mathScope.get(func) : func

      try {
        dom.plotCrossModal.checked = app.plotSettings.showCross
        dom.plotDerivativeModal.checked = app.plotSettings.showDerivative
        dom.plotGridModal.checked = app.plotSettings.showGrid

        plot()
        modal.show('#dialogPlot')
      } catch (error) {
        showError('Error', error)
      }

      return
    }

    if (errorEl) {
      showError(
        `Error on Line ${+errorEl.parentElement.getAttribute('data-index') + 1}`,
        errorEl.getAttribute('data-error')
      )

      return
    }

    if (answerEl) {
      const textToCopy = answerEl.dataset.answer
      const safeText = safeCopyText(textToCopy)

      navigator.clipboard.writeText(textToCopy)

      notify(`Copied '${safeText}' to clipboard.`)

      return
    }
  })

  dom.output.addEventListener('mousedown', () => {
    dom.els('.CodeMirror-selected').forEach((el) => el.classList.remove('CodeMirror-selected'))
  })
}

/**
 * Loads and applies user defined functions and units from the local store.
 */
const setupUserDefined = () => {
  applyUdfu(store.get('udf') ?? '', 'func')
  applyUdfu(store.get('udu') ?? '', 'unit')
}

/**
 * Initializes resizer interactions for adjusting the width ratio of input and output panels.
 */
const setupPanelResizer = () => {
  const defaultWidth = settings.defaults.inputWidth

  let isResizing = false
  let resizeRaf // Request Animation Frame reference
  let calcTimeout

  applyAnswerPositionLayout()

  const dividerTooltip = () => {
    dom.panelDivider.title =
      dom.input.style.width === `${defaultWidth}%` ? 'Drag to resize' : 'Double click to reset position'
  }

  dom.panelDivider.addEventListener('dblclick', (event) => {
    event.preventDefault()
    window.getSelection()?.removeAllRanges()
    dom.input.style.width = `${defaultWidth}%`
    store.set('inputWidth', defaultWidth)
    dividerTooltip()
    cm.refresh()
    calculate()
  })

  dom.panelDivider.addEventListener('mousedown', (event) => {
    isResizing = event.target === dom.panelDivider
  })

  document.addEventListener('mouseup', () => {
    if (isResizing) {
      isResizing = false
      cm.refresh()
      calculate()
    }
  })

  document.addEventListener('mousemove', (event) => {
    if (!isResizing) return

    if (resizeRaf) cancelAnimationFrame(resizeRaf)

    resizeRaf = requestAnimationFrame(() => {
      const offset = 10
      const pointerRelativeXpos = event.clientX - dom.mainPanel.getBoundingClientRect().left - offset
      let inputWidth = (pointerRelativeXpos / dom.mainPanel.clientWidth) * 100

      inputWidth = Math.max(0, Math.min(100, inputWidth))

      dom.input.style.width = inputWidth + '%'

      clearTimeout(calcTimeout)
      calcTimeout = setTimeout(() => {
        store.set('inputWidth', inputWidth)
        calculate()
      }, 50)
    })
  })

  dom.panelDivider.addEventListener('mousemove', dividerTooltip)
}

/**
 * Synchronizes scrolling between the CodeMirror editor and the output display panel.
 */
const setupSyncScroll = () => {
  const inputPanel = dom.el('.CodeMirror-scroll')
  const outputPanel = dom.output

  let activePanel = null
  let scrollTimeout = null
  let ticking = false

  const clearActivePanel = () => {
    clearTimeout(scrollTimeout)
    scrollTimeout = setTimeout(() => {
      activePanel = null
    }, 100)
  }

  inputPanel.addEventListener(
    'scroll',
    () => {
      if (activePanel === null) {
        activePanel = inputPanel
      }
      if (activePanel === inputPanel) {
        if (!ticking) {
          requestAnimationFrame(() => {
            outputPanel.scrollTop = inputPanel.scrollTop
            ticking = false
          })

          ticking = true
        }

        clearActivePanel()
      }
    },
    { passive: true }
  )

  outputPanel.addEventListener(
    'scroll',
    () => {
      dom.scrollTop.style.display = outputPanel.scrollTop > 50 ? 'block' : 'none'

      if (activePanel === null) {
        activePanel = outputPanel
      }

      if (activePanel === outputPanel) {
        if (!ticking) {
          requestAnimationFrame(() => {
            inputPanel.scrollTop = outputPanel.scrollTop
            ticking = false
          })

          ticking = true
        }

        clearActivePanel()
      }
    },
    { passive: true }
  )

  dom.scrollTop.addEventListener('click', () => {
    activePanel = null
    inputPanel.scroll({ top: 0, behavior: 'smooth' })
    outputPanel.scroll({ top: 0, behavior: 'smooth' })
  })
}

/**
 * Configures the "About" dialog contents, version, copyright, and system dependencies info.
 */
const setupAppInfo = () => {
  dom.dialogAboutCopyright.textContent = `Copyright © ${new Date().getFullYear()} ${author.name}`
  dom.dialogAboutAppVersion.innerHTML = isElectron
    ? `Version ${version}`
    : `Version ${version}
      <div class="versionCtnr">
        <div>
          <a href="https://github.com/bornova/numara-calculator/releases" target="_blank" rel="noopener noreferrer">Download desktop version</a>
        </div>
      </div>`
  dom.gitLink.href = homepage
  dom.webLink.href = author.url
  dom.licenseLink.href = `${homepage}/blob/master/LICENSE`
  dom.helpLink.href = `${homepage}/wiki`

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

    numara.showAbout(() => modal.show('#dialogAbout'))
  }
}

let modalOpenState = false

/**
 * Checks whether any modal dialog or offcanvas panel is currently open.
 * @returns {boolean} True if any modal or side panel is open.
 */
const isModalOpen = () => modalOpenState

/**
 * Registers application-wide keyboard shortcuts using numaraKeys.
 */
const setupKeyboardShortcuts = () => {
  const keys = {
    '$mod+D': 'clearButton',
    '$mod+N': 'newPageButton',
    '$mod+P': 'printButton',
    'Shift+TAB': 'sideBarButton'
  }

  const shortcuts = {}

  for (const [command, button] of Object.entries(keys)) {
    shortcuts[command] = (event) => {
      event.preventDefault()

      if (!isModalOpen()) {
        dom[button].click()
      } else if (dom.sideBar.classList.contains('uk-open') && !dom.dialogNewPage.classList.contains('uk-open')) {
        dom.closeSideBarButton.click()
      }
    }
  }

  numaraKeys(window, shortcuts)
}

/**
 * Configures print area beforeprint/afterprint event listeners.
 */
const setupPrintArea = () => {
  window.addEventListener('beforeprint', () => {
    const printArea = document.createElement('div')
    const tableRows = []

    printArea.setAttribute('id', 'printArea')
    printArea.className = 'printArea'

    cm.eachLine((line) => {
      const lineIndex = cm.getLineNumber(line)
      const input = cm.getLine(lineIndex)
      const answerEl = dom.el(`[data-index="${lineIndex}"]`)
      const answer = answerEl ? answerEl.textContent : ''
      const trHeader = `<tr style="
        height: ${app.settings.lineHeight};
        font-size: ${app.settings.fontSize};
        font-weight: ${app.settings.fontWeight};"
      >`
      const noBB = app.settings.answerPosition ? 'border-bottom: none !important;' : ''

      const rowHtml =
        app.settings.answerPosition === 'bottom'
          ? `
          ${trHeader}
            ${app.settings.lineNumbers ? `<td class="printLineNumCol" style="${noBB}">${lineIndex + 1}</td>` : ''}
            <td style="width:100%; ${noBB};">${input}</td>
          </tr>
          ${trHeader}
            ${app.settings.lineNumbers ? '<td class="printLineNumCol"></td>' : ''}
            <td>${answer}</td>
          </tr>`
          : `
          ${trHeader}
            ${app.settings.lineNumbers ? `<td class="printLineNumCol">${lineIndex + 1}</td>` : ''}
            <td style="width:${app.settings.inputWidth}%;">${input}</td>
            <td class="printAnswer${app.settings.answerPosition === 'left' ? 'Left' : 'Right'}">${answer}</td>
          </tr>`

      tableRows.push(rowHtml)
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

    document.body.appendChild(printArea)
  })

  window.addEventListener('afterprint', () => {
    const printArea = document.getElementById('printArea')

    if (printArea) {
      printArea.remove()
    }
  })
}

/**
 * Configures UIkit helper events, modals, and tab initialization callbacks.
 */
const setupUIkitUtils = () => {
  UIkit.mixin({ data: { offset: 5, delay: 300 } }, 'tooltip')

  UIkit.util.on('.modal, #sideBar', 'beforeshow', () => {
    if (isElectron) {
      numara.transControls(true)
    }
  })

  UIkit.util.on('.modal, #sideBar', 'hidden', () => {
    modalOpenState = dom.els('.uk-open').length > 0

    if (isElectron) {
      numara.transControls(modalOpenState)
    }

    setTimeout(() => cm.focus(), 100)
  })

  UIkit.util.on('#sideBar', 'beforehide', (event) => {
    if (app.sidebarDocked) {
      event.preventDefault()
    }
  })

  UIkit.util.on('#dialogTheme', 'shown', () => {
    checkColorChange()
    colors.checkDefaults()
  })

  UIkit.util.on('#dialogSettings', 'beforeshow', settings.prep)

  let udTab = 1

  UIkit.util.on('#dialogUdfu', 'shown', () => {
    const udf = store.get('udf').trim()
    const udu = store.get('udu').trim()

    refreshEditor(udTab === 1 ? udfInput : uduInput)

    udfInput.setValue(udf)
    uduInput.setValue(udu)
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

  UIkit.util.on('#dialogPlotAxisSettings', 'shown', () => {
    const { auto, x, y, axisPrecision } = app.plotSettings.domain
    const minMaxInputs = [dom.plotXMin, dom.plotXMax, dom.plotYMin, dom.plotYMax]

    dom.plotAutoDomain.checked = auto
    dom.plotAxisPrecision.value = axisPrecision
    dom.plotAxisPrecisionLabel.innerHTML = axisPrecision

    minMaxInputs.forEach((input, i) => {
      input.value = [...x, ...y][i]
      input.disabled = auto
    })
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

  UIkit.util.on(document, 'beforeshow', '.uk-tooltip', (event) => {
    const tooltipEl = event.target
    const triggerEl = document.querySelector(`[aria-describedby="${tooltipEl.id}"]`)
    const answerEl = triggerEl ? triggerEl.closest('.answer') : null

    if (answerEl && answerEl.offsetWidth < dom.output.clientWidth - 8) {
      event.preventDefault()
    }
  })
}

/**
 * Initializes the side panel settings, offcanvas drawer, and handles window resize changes.
 */
function initializeSideBar() {
  let resizeTimer

  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer)

    resizeTimer = setTimeout(() => {
      setupSideBar(true)
      calculate()
    }, 100)
  })

  setupSideBar(true)
}

/**
 * Bootstraps the application, initialises settings, currencies, colors, and UI layout.
 * @returns {Promise<void>}
 */
const initializeApp = async () => {
  generateIcons()
  initCurrencies()

  await settings.initialize()
  await settings.apply()

  colors.initialize()
  colors.apply()

  setupHeaders()
  setupAppButtons()
  setupResultActions()
  setupUserDefined()
  setupPanelResizer()
  setupSyncScroll()
  setupAppInfo()
  setupKeyboardShortcuts()
  setupPrintArea()
  setupUIkitUtils()
  initializeSideBar()
  initializePages()
  initializeContextMenus()
  initializeSettingsTooltips()
  checkAppUpdate()

  if (isElectron) {
    if (app.settings.syncDirEnabled && app.settings.syncDir) {
      const syncDirExists = await checkSyncDir()

      if (syncDirExists) {
        numara.startWatchingSyncDir(app.settings.syncDir)
        triggerFolderSync().catch(console.error)
      }
    }

    numara.onSyncDirChanged(() => {
      triggerFolderSync().catch(console.error)
    })

    numara.onSyncDirDeleted(() => {
      handleSyncDirDeleted().catch(console.error)
    })
  }

  setTimeout(() => cm.focus(), 500)
}

initializeApp()
