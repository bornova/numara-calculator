import UIkit from 'uikit'

import { dom } from '../dom.js'
import { cm, refreshEditor, udfInput, uduInput } from '../editor/index.js'
import { getPageName } from '../pages/pageManager.js'
import { app } from '../state/appState.js'
import { isElectron } from '../state/env.js'
import { store } from '../state/store.js'
import { plot } from './plot.js'
import { settings } from './settings.js'
import { checkColorChange, colors } from './theme.js'
import { checkAppUpdate } from './updater.js'

let modalOpenState = false
let defaultYesText = null
let defaultNoText = null
let pendingCancelHandler = null

/**
 * Resets the confirmation modal buttons to their default labels/handlers and settles any active pending confirmation.
 */
function resetConfirmDialog() {
  if (defaultYesText === null && dom.confirmYes) {
    defaultYesText = dom.confirmYes.textContent
  }

  if (defaultNoText === null && dom.confirmNo) {
    defaultNoText = dom.confirmNo.textContent
  }

  if (pendingCancelHandler) {
    const cancel = pendingCancelHandler
    pendingCancelHandler = null
    cancel()
  }

  if (dom.confirmYes) {
    if (defaultYesText !== null) {
      dom.confirmYes.textContent = defaultYesText
    }
    dom.confirmYes.onclick = null
  }

  if (dom.confirmNo) {
    if (defaultNoText !== null) {
      dom.confirmNo.textContent = defaultNoText
    }
    dom.confirmNo.classList.add('uk-modal-close')
    dom.confirmNo.onclick = null
  }

  if (dom.confirmKeepSyncContainer) {
    dom.confirmKeepSyncContainer.style.display = 'none'
  }

  if (dom.confirmKeepSync) {
    dom.confirmKeepSync.checked = true
  }
}

/**
 * Makes a UIkit modal dialog draggable by its title/header.
 * @param {HTMLElement} modalElement The root modal element containing the dialog and title.
 */
function makeModalDraggable(modalElement) {
  const dialog = modalElement.querySelector('.uk-modal-dialog')
  const header = dialog?.querySelector('.uk-modal-title')

  if (!dialog || !header) return

  UIkit.util.on(
    modalElement,
    'beforeshow',
    (e) => {
      if (e.target !== modalElement) return

      Object.assign(dialog.style, { visibility: 'hidden', display: 'block', position: 'absolute' })

      modal.center(dialog)
    },
    { self: true }
  )

  let dragging = false
  let offsetX = 0
  let offsetY = 0

  const move = (e) => {
    if (!dragging) return

    dialog.style.left = `${Math.max(10, Math.min(e.clientX - offsetX, window.innerWidth - dialog.offsetWidth - 10))}px`
    dialog.style.top = `${Math.max(40, Math.min(e.clientY - offsetY, window.innerHeight - dialog.offsetHeight - 10))}px`
  }

  const up = () => {
    dragging = false
    document.removeEventListener('mousemove', move)
    document.removeEventListener('mouseup', up)
  }

  header.addEventListener('mousedown', (e) => {
    if (e.target.closest('button, a, input')) return
    dialog.classList.remove('modal-centering')
    offsetX = e.clientX - dialog.offsetLeft
    offsetY = e.clientY - dialog.offsetTop
    dragging = true

    document.addEventListener('mousemove', move)
    document.addEventListener('mouseup', up)
  })

  header.addEventListener('dblclick', () => modal.center(dialog, true))
}

export const modal = {
  /**
   * Show modal dialog for given id.
   * @param {string|HTMLElement} id Modal selector or element.
   */
  show: (id) => UIkit.modal(id, { bgClose: false, stack: true }).show(),

  /**
   * Hide modal dialog for given id.
   * @param {string|HTMLElement} id Modal selector or element.
   */
  hide: (id) => UIkit.modal(id).hide(),

  /**
   * Center the dialog of a modal. Uses requestAnimationFrame to center precisely.
   * @param {string|HTMLElement} target Modal Id or modal dialog HTMLElement.
   * @param {boolean} [animate=false] Whether to smoothly animate the dialog to center.
   * @param {number} [targetWidth] Optional target viewport width.
   * @param {number} [targetHeight] Optional target viewport height.
   */
  center: (target, animate = false, targetWidth, targetHeight) => {
    const element = typeof target === 'string' ? document.querySelector(`${target} .uk-modal-dialog`) : target

    if (!element) return

    if (animate) {
      element.classList.add('modal-centering')
      clearTimeout(element._centerTimeout)
      element._centerTimeout = setTimeout(() => {
        element.classList.remove('modal-centering')
      }, 220)
    }

    requestAnimationFrame(() => {
      const width = targetWidth ?? window.innerWidth
      const height = targetHeight ?? window.innerHeight

      Object.assign(element.style, {
        left: `${(width - element.offsetWidth) / 2}px`,
        top: `${(height - element.offsetHeight) / 2}px`,
        visibility: ''
      })
    })
  }
}

/**
 * Checks whether any modal dialog or offcanvas panel is currently open.
 * @returns {boolean} True if any modal or side panel is open.
 */
export const isModalOpen = () => modalOpenState

/**
 * Show error dialog.
 * @param {string} title Title of dialog box.
 * @param {string} error Error message to show.
 * @param {boolean} [allowHtml=false] Whether to render error message as HTML.
 */
export function showError(title, error, allowHtml = false) {
  dom.errTitle.textContent = title

  if (allowHtml) {
    dom.errMsg.innerHTML = error
  } else {
    dom.errMsg.textContent = error
  }

  modal.show('#dialogError')
}

/**
 * Show confirmation dialog.
 * @param {string} msg Confirmation message to show.
 * @param {function} action Function to run upon selecting Yes.
 */
export function confirm(msg, action) {
  resetConfirmDialog()

  dom.confirmMsg.textContent = msg

  modal.show('#dialogConfirm')

  const yesAction = (event) => {
    if (dom.confirmYes) dom.confirmYes.blur()

    const keepSync = dom.confirmKeepSync?.checked

    event.stopPropagation()
    pendingCancelHandler = null
    UIkit.modal('#dialogConfirm').hide()
    setTimeout(() => action(keepSync), 50)
  }

  dom.confirmYes.onclick = yesAction
}

/**
 * Displays a custom confirmation modal dialog with custom button labels.
 * @param {string} msg The message markup text to show.
 * @param {string} yesLabel Action button label.
 * @param {string} noLabel Dismiss button label.
 * @param {function} yesAction Callback fired on yes/action select.
 * @param {function} noAction Callback fired on no/dismiss select.
 */
export function customConfirm(msg, yesLabel, noLabel, yesAction, noAction) {
  resetConfirmDialog()

  dom.confirmMsg.innerHTML = msg

  dom.confirmYes.textContent = yesLabel
  dom.confirmNo.textContent = noLabel

  dom.confirmNo.classList.remove('uk-modal-close')

  UIkit.modal('#dialogConfirm', { bgClose: false, escClose: false, stack: true }).show()

  const cleanup = () => {
    pendingCancelHandler = null
    resetConfirmDialog()
  }

  pendingCancelHandler = () => {
    cleanup()
    if (noAction) {
      setTimeout(noAction, 50)
    }
  }

  dom.confirmYes.onclick = (event) => {
    event.stopPropagation()
    cleanup()
    UIkit.modal('#dialogConfirm').hide()
    setTimeout(yesAction, 50)
  }

  dom.confirmNo.onclick = (event) => {
    event.stopPropagation()
    cleanup()
    UIkit.modal('#dialogConfirm').hide()
    setTimeout(noAction, 50)
  }
}

/**
 * Show app notifications.
 * @param {string} msg Notification to show.
 * @param {string} [stat='primary'] Notification status: primary | success | warning | danger
 */
export function notify(msg, stat = 'primary') {
  UIkit.notification({
    message: msg,
    pos: app.settings.notifyLocation,
    status: stat,
    timeout: +app.settings.notifyDuration
  })
}

/**
 * Makes all modal dialogs draggable by their header.
 */
function setupDraggableModals() {
  dom.els('.modal').forEach(makeModalDraggable)
}

/**
 * Configures UIkit helper events, modals, and tab initialization callbacks.
 */
export function setupUIkitUtils() {
  setupDraggableModals()

  UIkit.mixin({ data: { offset: 5, delay: 300 } }, 'tooltip')

  const hideOpenDropdowns = () => {
    dom.els('.uk-dropdown.uk-open').forEach((el) => {
      UIkit.dropdown(el)?.hide(false)
    })
  }

  cm.getWrapperElement().addEventListener('pointerdown', hideOpenDropdowns)

  UIkit.util.on(
    '.modal, .dialogConfirm, #sideBar',
    'beforeshow',
    (event) => {
      if (event.target.id === 'sideBar' && app.sidebarDocked) return

      modalOpenState = true
      if (isElectron) {
        numara.transControls(true)
      }
    },
    { self: true }
  )

  UIkit.util.on(
    '.modal, .dialogConfirm, #sideBar',
    'hidden',
    () => {
      modalOpenState =
        dom.els('.modal.uk-open, .dialogConfirm.uk-open, #sideBar.uk-open:not(.sidebar-docked)').length > 0

      if (isElectron) {
        numara.transControls(modalOpenState)
      }

      if (!modalOpenState) {
        setTimeout(() => cm.focus(), 100)
      }
    },
    { self: true }
  )

  UIkit.util.on(
    '#dialogConfirm',
    'hidden',
    () => {
      resetConfirmDialog()
    },
    { self: true }
  )

  UIkit.util.on(
    '#sideBar',
    'beforehide',
    (event) => {
      if (app.sidebarDocked) {
        event.preventDefault()
        return
      }

      hideOpenDropdowns()
    },
    { self: true }
  )

  UIkit.util.on(
    '#dialogTheme',
    'shown',
    () => {
      checkColorChange()
      colors.checkDefaults()
    },
    { self: true }
  )

  UIkit.util.on('#dialogSettings', 'beforeshow', settings.prep, { self: true })

  let udTab = 1

  UIkit.util.on(
    '#dialogUdfu',
    'shown',
    () => {
      const udf = (store.get('udf') ?? '').trim()
      const udu = (store.get('udu') ?? '').trim()

      refreshEditor(udTab === 1 ? udfInput : uduInput)

      udfInput.setValue(udf)
      uduInput.setValue(udu)
    },
    { self: true }
  )

  UIkit.util.on(
    '#udfTab',
    'shown',
    () => {
      udTab = 1
      refreshEditor(udfInput)
    },
    { self: true }
  )

  UIkit.util.on(
    '#uduTab',
    'shown',
    () => {
      udTab = 2
      refreshEditor(uduInput)
    },
    { self: true }
  )

  UIkit.util.on(
    '#dialogPlot',
    'shown',
    () => {
      app.activePlot = null
      plot()
    },
    { self: true }
  )
  UIkit.util.on(
    '#dialogPlot',
    'hide',
    () => {
      app.activePlot = false
    },
    { self: true }
  )

  UIkit.util.on(
    '#dialogPlotAxisSettings',
    'shown',
    () => {
      const { auto, x, y, axisPrecision } = app.plotSettings.domain
      const minMaxInputs = [dom.plotXMin, dom.plotXMax, dom.plotYMin, dom.plotYMax]

      dom.plotAutoDomain.checked = auto
      dom.plotAxisPrecision.value = axisPrecision
      dom.plotAxisPrecisionLabel.textContent = axisPrecision

      minMaxInputs.forEach((input, i) => {
        input.value = [...x, ...y][i]
        input.disabled = auto
      })
    },
    { self: true }
  )

  UIkit.util.on(
    '#dialogNewPage',
    'shown',
    () => {
      dom.newPageTitleInput.setAttribute('placeholder', getPageName())
      dom.newPageTitleInput.focus()
    },
    { self: true }
  )

  UIkit.util.on(
    '#dialogRenamePage',
    'shown',
    () => {
      setTimeout(() => {
        dom.renamePageTitleInput.focus()
        dom.renamePageTitleInput.select()
      }, 20)
    },
    { self: true }
  )

  UIkit.util.on(
    '#dialogAbout',
    'shown',
    () => {
      checkAppUpdate()
    },
    { self: true }
  )

  UIkit.util.on(
    '#dialogError',
    'hidden',
    () => {
      dom.errTitle.textContent = ''
      dom.errMsg.textContent = ''
    },
    { self: true }
  )

  UIkit.util.on(document, 'beforeshow', '.uk-tooltip', (event) => {
    const tooltipEl = event.target
    const triggerEl = document.querySelector(`[aria-describedby="${tooltipEl.id}"]`)
    const answerEl = triggerEl ? triggerEl.closest('.answer') : null

    if (answerEl && !answerEl.classList.contains('pageLink') && answerEl.offsetWidth < dom.output.clientWidth - 8) {
      event.preventDefault()
    }
  })
}
