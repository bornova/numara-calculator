import UIkit from 'uikit'

import { dom } from '../dom.js'
import { app } from '../state/appState.js'
import { isElectron } from '../state/env.js'
import { events } from '../state/events.js'

const MODAL_MIN_MARGIN = 10
const MODAL_MIN_TOP = 44

let modalOpenState = false
let defaultYesText = null
let defaultNoText = null
let pendingCancelHandler = null
let suppressConfirmReset = false
let confirmRequestId = 0

const modalShowRequests = new WeakMap()

const modal = {
  /**
   * Show modal dialog for given id, deferring safely if UIkit is still finishing a hide transition.
   * @param {string|HTMLElement} id Modal selector or element.
   */
  show: (id) => {
    const el = typeof id === 'string' ? document.querySelector(id) : id

    if (el?.classList?.contains('uk-togglable-leave')) {
      const requestId = (modalShowRequests.get(el) || 0) + 1

      modalShowRequests.set(el, requestId)

      UIkit.util.once(
        el,
        'hidden',
        () => {
          queueMicrotask(() => {
            if (modalShowRequests.get(el) === requestId) {
              UIkit.modal(el, { bgClose: false, stack: true })?.show()
            }
          })
        },
        { self: true }
      )

      return
    }

    if (el) {
      modalShowRequests.set(el, (modalShowRequests.get(el) || 0) + 1)
    }

    return UIkit.modal(id, { bgClose: false, stack: true })?.show()
  },

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
    const element =
      typeof target === 'string'
        ? document.querySelector(`${target} .uk-modal-dialog`)
        : target?.querySelector?.('.uk-modal-dialog') || target

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
        position: 'absolute',
        left: `${Math.max(MODAL_MIN_MARGIN, Math.round((width - element.offsetWidth) / 2))}px`,
        top: `${Math.max(MODAL_MIN_TOP, Math.round((height - element.offsetHeight) / 2))}px`,
        visibility: ''
      })
    })
  },

  /**
   * Centers all currently open modal dialogs.
   * @param {boolean} [animate=true] Whether to smoothly animate the dialogs to center.
   * @param {number} [targetWidth] Optional target viewport width.
   * @param {number} [targetHeight] Optional target viewport height.
   */
  centerOpen: (animate = true, targetWidth, targetHeight) => {
    dom.els('.modal.uk-open .uk-modal-dialog').forEach((dialog) => {
      modal.center(dialog, animate, targetWidth, targetHeight)
    })
  }
}

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

  if (!dialog) return

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

  const header = dialog.querySelector('.uk-modal-title')

  if (!header) return

  let dragging = false
  let offsetX = 0
  let offsetY = 0

  const move = (e) => {
    if (!dragging) return

    const maxLeft = Math.max(MODAL_MIN_MARGIN, window.innerWidth - dialog.offsetWidth - MODAL_MIN_MARGIN)
    const maxTop = Math.max(MODAL_MIN_TOP, window.innerHeight - dialog.offsetHeight - MODAL_MIN_MARGIN)

    dialog.style.left = `${Math.round(Math.max(MODAL_MIN_MARGIN, Math.min(e.clientX - offsetX, maxLeft)))}px`
    dialog.style.top = `${Math.round(Math.max(MODAL_MIN_TOP, Math.min(e.clientY - offsetY, maxTop)))}px`
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

/**
 * Checks whether any modal dialog or offcanvas panel is currently open.
 * @returns {boolean} True if any modal or page list panel is open.
 */
const isModalOpen = () => modalOpenState

/**
 * Show error dialog.
 * @param {string} title Title of dialog box.
 * @param {string} error Error message to show.
 * @param {boolean} [allowHtml=false] Whether to render error message as HTML.
 */
function showError(title, error, allowHtml = false) {
  dom.errTitle.textContent = title

  if (allowHtml) {
    dom.errMsg.innerHTML = error
  } else {
    dom.errMsg.textContent = error
  }

  modal.show('#dialogError')
}

/**
 * Opens `#dialogConfirm` with `options`, waiting for any in-flight hide transition without resetting the new prompt.
 * @param {object} options UIkit modal options.
 */
function showConfirmModal(options) {
  const el = dom.dialogConfirm

  if (el?.classList?.contains('uk-togglable-leave')) {
    suppressConfirmReset = true
    const requestId = ++confirmRequestId

    UIkit.util.once(
      el,
      'hidden',
      () => {
        queueMicrotask(() => {
          if (requestId === confirmRequestId) {
            UIkit.modal('#dialogConfirm', options).show()
          }
        })
      },
      { self: true }
    )
    return
  }

  UIkit.modal('#dialogConfirm', options).show()
}

/**
 * Show confirmation dialog.
 * @param {string} msg Confirmation message to show.
 * @param {function} action Function to run upon selecting Yes.
 */
function confirm(msg, action) {
  resetConfirmDialog()

  dom.confirmMsg.textContent = msg

  const yesAction = (event) => {
    if (dom.confirmYes) dom.confirmYes.blur()

    const keepSync = dom.confirmKeepSync?.checked

    event.stopPropagation()
    pendingCancelHandler = null

    Promise.resolve(UIkit.modal('#dialogConfirm').hide()).then(() => action(keepSync))
  }

  dom.confirmYes.onclick = yesAction
  showConfirmModal({ bgClose: false, stack: true })
}

/**
 * Displays a custom confirmation modal dialog with custom button labels.
 * @param {string} msg The message markup text to show.
 * @param {string} yesLabel Action button label.
 * @param {string} noLabel Dismiss button label.
 * @param {function} yesAction Callback fired on yes/action select.
 * @param {function} noAction Callback fired on no/dismiss select.
 */
function customConfirm(msg, yesLabel, noLabel, yesAction, noAction) {
  resetConfirmDialog()

  dom.confirmMsg.innerHTML = msg
  dom.confirmYes.textContent = yesLabel
  dom.confirmNo.textContent = noLabel
  dom.confirmNo.classList.remove('uk-modal-close')

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
    Promise.resolve(UIkit.modal('#dialogConfirm').hide()).then(() => yesAction?.())
  }

  dom.confirmNo.onclick = (event) => {
    event.stopPropagation()
    cleanup()
    Promise.resolve(UIkit.modal('#dialogConfirm').hide()).then(() => noAction?.())
  }

  showConfirmModal({ bgClose: false, escClose: false, stack: true })
}

/**
 * Show app notifications.
 * @param {string} msg Notification to show.
 * @param {string} [stat='primary'] Notification status: primary | success | warning | danger
 */
function notify(msg, stat = 'primary') {
  UIkit.notification({
    message: msg,
    pos: app.settings.notifyLocation,
    status: stat,
    timeout: +app.settings.notifyDuration
  })
}

/**
 * Hides the floating `#pageListPanel` offcanvas drawer when undocked and currently open.
 * @returns {Promise<void>|undefined}
 */
function hideFloatingPageList() {
  if (!app.pageListDocked && dom.pageListPanel?.classList.contains('uk-open')) {
    return UIkit.offcanvas('#pageListPanel')?.hide()
  }
}

/**
 * Hides all open UIkit dropdowns, optionally excluding a specific dropdown element.
 * @param {Element|null} [excludeEl=null] Optional dropdown element to leave untouched.
 */
function hideOpenDropdowns(excludeEl = null) {
  events.emit('ui:hideDropdowns', excludeEl)

  dom.els('.uk-dropdown.uk-open').forEach((el) => {
    if (el !== excludeEl) {
      if (el.hasAttribute('uk-dropdown')) {
        UIkit.dropdown(el)?.hide(false)
      }

      el.classList.remove('uk-open')
    }
  })
}

/**
 * Synchronizes `modalOpenState`, Electron titlebar controls, and `ui:modalsClosed` with open dialogs and floating page list.
 */
function syncModalOpenState() {
  const wasOpen = modalOpenState

  modalOpenState =
    dom.els('.modal.uk-open, .dialogConfirm.uk-open, #pageListPanel.uk-open:not(.page-list-docked)').length > 0

  if (isElectron && modalOpenState !== wasOpen) {
    numara.transControls(modalOpenState)
  }

  if (wasOpen && !modalOpenState) {
    events.emit('ui:modalsClosed')
  }
}

/**
 * Configures UIkit helper events, modals, and tab initialization callbacks.
 */
function setupUIkitUtils() {
  dom.els('.modal').forEach(makeModalDraggable)

  UIkit.mixin({ data: { offset: 5, delay: 300 } }, 'tooltip')

  UIkit.util.on(
    '.modal, .dialogConfirm, #pageListPanel',
    'beforeshow',
    (event) => {
      if (event.target.id === 'pageListPanel' && app.pageListDocked) return

      hideOpenDropdowns()
      modalOpenState = true

      if (isElectron) {
        numara.transControls(true)
      }
    },
    { self: true }
  )

  UIkit.util.on('.modal, .dialogConfirm, #pageListPanel', 'hidden', syncModalOpenState, { self: true })

  UIkit.util.on(
    '#dialogConfirm',
    'hidden',
    () => {
      if (suppressConfirmReset) {
        suppressConfirmReset = false
        return
      }

      resetConfirmDialog()
    },
    { self: true }
  )

  UIkit.util.on(
    '#pageListPanel',
    'beforehide',
    (event) => {
      if (app.pageListDocked) {
        event.preventDefault()
        return
      }

      hideOpenDropdowns()
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

export {
  confirm,
  customConfirm,
  hideFloatingPageList,
  hideOpenDropdowns,
  isModalOpen,
  modal,
  notify,
  setupUIkitUtils,
  showError,
  syncModalOpenState
}
