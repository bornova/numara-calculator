import UIkit from 'uikit'

import { name } from '../../../package.json'
import { calculate, syncOutputHeights } from '../calc/calcManager.js'
import { escapeHTML } from '../core/utils.js'
import { dom } from '../dom.js'
import { cm } from '../editor/index.js'
import { loadPage } from '../pages/pageManager.js'
import { app } from '../state/appState.js'
import { isElectron, isMac } from '../state/env.js'
import { store } from '../state/store.js'
import { copyAll } from './contextMenu.js'
import { isModalOpen, modal, notify, showError } from './dialogs.js'
import { resetPlotSelection } from './plot.js'
import { applyAnswerPositionLayout, settings } from './settings.js'

/**
 * Configures the application title headers based on OS (Windows vs. macOS).
 */
export function setupHeaders() {
  const isWin = isElectron && !isMac
  const active = isWin ? 'Win' : 'Mac'
  const inactive = isWin ? 'Mac' : 'Win'

  dom[`header${inactive}`].remove()
  dom[`header${active}`].style.display = 'block'
  dom[`header${active}Title`].textContent = name
}

/**
 * Binds click event handlers for main application buttons in the title bar / actions.
 */
export function setupAppButtons() {
  const buttons = {
    printButton: () => {
      UIkit.dropdown('#moreDropdown')?.hide(0)
      if (!app.pageListDocked) {
        UIkit.offcanvas('#pageListPanel').hide()
      }
      window.print()
    },
    clearButton: () => {
      if (!cm.getValue()) return

      UIkit.tooltip(dom.clearButton)?.hide()
      cm.replaceRange(
        '',
        { line: cm.firstLine(), ch: 0 },
        { line: cm.lastLine(), ch: cm.getLine(cm.lastLine()).length }
      )
      cm.focus()
      calculate()
      if (!app.pageListDocked) {
        UIkit.offcanvas('#pageListPanel').hide()
      }
    },
    copyButton: () => {
      UIkit.dropdown('#moreDropdown')?.hide(0)
      copyAll()
      if (!app.pageListDocked) {
        UIkit.offcanvas('#pageListPanel').hide()
      }
    },
    udfuButton: () => {
      UIkit.dropdown('#moreDropdown')?.hide(0)
      modal.show('#dialogUdfu')
    },
    settingsButton: () => {
      UIkit.dropdown('#moreDropdown')?.hide(0)
      modal.show('#dialogSettings')
    },
    aboutButton: () => {
      UIkit.dropdown('#moreDropdown')?.hide(0)
      modal.show('#dialogAbout')
    }
  }

  Object.entries(buttons).forEach(([btn, action]) => dom[btn].addEventListener('click', action))

  if (isElectron) {
    numara.menuAction((action) => {
      switch (action) {
        case 'newPage':
          if (!isModalOpen()) dom.newPageButton.click()
          break
        case 'clearPage':
          if (!isModalOpen()) dom.clearButton.click()
          break
        case 'togglePageList':
          if (app.settings.pageListPosition === 'tabs') break
          if (!app.pageListDocked && !isModalOpen()) {
            dom.pageName.click()
          } else if (
            dom.pageListPanel.classList.contains('uk-open') &&
            !dom.dialogNewPage.classList.contains('uk-open')
          ) {
            dom.closePageListButton.click()
          }
          break
        case 'openSettings':
          buttons.settingsButton()
          break
        case 'openUdfu':
          buttons.udfuButton()
          break
        case 'checkUpdates':
          modal.show('#dialogAbout')
          numara.checkUpdate()
          break
        case 'resetSize':
          dom.resetSizeButton.click()
          break
        case 'undo':
        case 'redo':
          if (cm?.hasFocus() || !isModalOpen()) {
            cm?.[action]()
          }
          break
      }
    })
  }

  dom.updateMenuLink.addEventListener('click', (event) => {
    event.stopPropagation()
    UIkit.dropdown('#moreDropdown')?.hide(0)

    if (app.updateReady) {
      numara.updateApp()
    } else {
      modal.show('#dialogAbout')
    }
  })
}

/**
 * Copies text to the clipboard, triggers a brief `.copied` highlight on `el`, and shows a notification.
 * @param {HTMLElement} el Element to flash with `.copied`.
 * @param {string} textToCopy Text to write to the clipboard.
 */
function copyWithFlash(el, textToCopy) {
  if (!textToCopy) return

  navigator.clipboard.writeText(textToCopy)

  el.classList.remove('copied')
  void el.offsetWidth
  el.classList.add('copied')
  clearTimeout(el._copiedTimer)
  el._copiedTimer = setTimeout(() => el.classList.remove('copied'), 350)

  notify(`Copied '${escapeHTML(textToCopy)}' to clipboard.`)
}

/**
 * Sets up global click event listeners on the document to handle interactions
 * with page links, answers (copying to clipboard), errors (showing error modal), and plots.
 */
export function setupResultActions() {
  document.addEventListener('click', (event) => {
    const pageEl = event.target.closest('[data-page-id]')
    const answerEl = event.target.closest('[data-answer]')
    const errorEl = event.target.closest('[data-error]')
    const plotEl = event.target.closest('[data-plot]')

    if (pageEl) {
      const pageId = pageEl.getAttribute('data-page-id')

      if (pageId) {
        loadPage(pageId)
      }

      return
    }

    if (plotEl) {
      const func = plotEl.getAttribute('data-plot')

      app.plotFunction = func.startsWith('line') ? app.mathScope.get(func) : func

      try {
        dom.plotCrossModal.checked = app.plotSettings.showCross
        dom.plotDerivativeModal.checked = app.plotSettings.showDerivative
        dom.plotGridModal.checked = app.plotSettings.showGrid

        resetPlotSelection()
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
      copyWithFlash(answerEl, answerEl.dataset.answer)
    }
  })

  dom.selectionStats?.addEventListener('click', () => {
    copyWithFlash(dom.selectionStats, dom.selectionStats.dataset.copy)
  })

  dom.output.addEventListener('mousedown', () => {
    dom.els('.CodeMirror-selected').forEach((el) => el.classList.remove('CodeMirror-selected'))
  })
}

/**
 * Initializes resizer interactions for adjusting the width ratio of input and output panels.
 */
export function setupPanelResizer() {
  const defaultWidth = settings.defaults.inputWidth
  const transitionMs = 180

  let isResizing = false
  let resizeRaf // Request Animation Frame reference
  let calcTimeout
  let transitionTimer

  applyAnswerPositionLayout()

  const dividerTooltip = () => {
    dom.panelDivider.title =
      dom.input.style.width === `${defaultWidth}%` ? 'Drag to resize' : 'Double click to reset position'
  }

  dom.panelDivider.addEventListener('dblclick', (event) => {
    event.preventDefault()
    window.getSelection()?.removeAllRanges()

    dom.input.classList.add('panel-width-animating')
    clearTimeout(transitionTimer)

    dom.input.style.width = `${defaultWidth}%`
    store.set('inputWidth', defaultWidth)
    dividerTooltip()

    transitionTimer = setTimeout(() => {
      dom.input.classList.remove('panel-width-animating')
      cm.refresh()
      syncOutputHeights()
    }, transitionMs)
  })

  dom.panelDivider.addEventListener('mousedown', (event) => {
    isResizing = event.button === 0 && event.target === dom.panelDivider

    if (isResizing) {
      clearTimeout(transitionTimer)
      dom.input.classList.remove('panel-width-animating')
      dom.panelDivider.classList.add('resizing')
    }
  })

  document.addEventListener('mouseup', () => {
    if (isResizing) {
      isResizing = false
      dom.panelDivider.classList.remove('resizing')
      cm.refresh()
      syncOutputHeights()
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
      syncOutputHeights()

      clearTimeout(calcTimeout)
      calcTimeout = setTimeout(() => {
        store.set('inputWidth', inputWidth)
        cm.refresh()
        syncOutputHeights()
      }, 50)
    })
  })

  dom.panelDivider.addEventListener('mousemove', dividerTooltip)
}

/**
 * Synchronizes scrolling between the CodeMirror editor and the output display panel.
 */
export function setupSyncScroll() {
  const inputPanel = dom.el('.CodeMirror-scroll')
  const outputPanel = dom.output

  let activePanel = null
  let scrollTimeout = null
  let wheelRaf = null
  let currentScrollTop = 0
  let targetScrollTop = 0
  let lastFrameTime = 0

  const stopWheelAnimation = () => {
    if (wheelRaf) {
      cancelAnimationFrame(wheelRaf)
      wheelRaf = null
    }
  }

  const clearActivePanel = () => {
    clearTimeout(scrollTimeout)
    scrollTimeout = setTimeout(() => {
      activePanel = null
    }, 60)
  }

  const setInputActive = () => {
    stopWheelAnimation()
    activePanel = inputPanel
  }

  const setOutputActive = () => {
    stopWheelAnimation()
    activePanel = outputPanel
  }

  const stepWheelScroll = (now) => {
    const dt = Math.min(32, Math.max(1, now - lastFrameTime))
    lastFrameTime = now

    const factor = 1 - Math.pow(1 - 0.32, dt / 16.667)
    const diff = targetScrollTop - currentScrollTop

    if (Math.abs(diff) <= 0.5) {
      currentScrollTop = targetScrollTop
      wheelRaf = null
    } else {
      currentScrollTop += diff * factor
      wheelRaf = requestAnimationFrame(stepWheelScroll)
    }

    const nextTop = Math.round(currentScrollTop)

    activePanel = null
    inputPanel.scrollTop = nextTop
    outputPanel.scrollTop = nextTop
    dom.scrollTop.style.display = nextTop > 50 ? 'block' : 'none'
  }

  // Smoothly animate vertical wheel scrolling while keeping both panels locked on every frame
  dom.mainPanel.addEventListener(
    'wheel',
    (event) => {
      if (event.ctrlKey || event.deltaY === 0) return
      if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) return

      const maxScroll = inputPanel.scrollHeight - inputPanel.clientHeight

      if (maxScroll <= 0) return

      event.preventDefault()

      const deltaY =
        event.deltaMode === 1
          ? event.deltaY * (parseInt(app.settings?.lineHeight, 10) || 24)
          : event.deltaMode === 2
            ? event.deltaY * inputPanel.clientHeight
            : event.deltaY

      if (!wheelRaf) {
        currentScrollTop = inputPanel.scrollTop
        targetScrollTop = currentScrollTop
        lastFrameTime = performance.now()
      }

      targetScrollTop = Math.max(0, Math.min(maxScroll, targetScrollTop + deltaY))

      if (!wheelRaf) {
        stepWheelScroll(performance.now() + 16.667)
      }
    },
    { passive: false, capture: true }
  )

  inputPanel.addEventListener('pointerdown', setInputActive, { passive: true })
  inputPanel.addEventListener('touchstart', setInputActive, { passive: true })

  outputPanel.addEventListener('pointerdown', setOutputActive, { passive: true })
  outputPanel.addEventListener('touchstart', setOutputActive, { passive: true })

  inputPanel.addEventListener(
    'scroll',
    () => {
      if (wheelRaf || activePanel === outputPanel) return

      activePanel = inputPanel

      const top = inputPanel.scrollTop

      if (outputPanel.scrollTop !== top) {
        outputPanel.scrollTop = top
      }

      dom.scrollTop.style.display = top > 50 ? 'block' : 'none'
      clearActivePanel()
    },
    { passive: true }
  )

  outputPanel.addEventListener(
    'scroll',
    () => {
      const top = outputPanel.scrollTop

      dom.scrollTop.style.display = top > 50 ? 'block' : 'none'

      if (wheelRaf || activePanel === inputPanel) return

      activePanel = outputPanel

      if (inputPanel.scrollTop !== top) {
        inputPanel.scrollTop = top
      }

      clearActivePanel()
    },
    { passive: true }
  )

  dom.scrollTop.addEventListener('click', () => {
    if (inputPanel.scrollTop <= 0) return

    stopWheelAnimation()
    currentScrollTop = inputPanel.scrollTop
    targetScrollTop = 0
    lastFrameTime = performance.now()
    stepWheelScroll(lastFrameTime + 16.667)
  })
}
