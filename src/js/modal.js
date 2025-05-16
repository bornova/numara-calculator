import { dom } from './dom'
import { app } from './utils'

import UIkit from 'uikit'

export const modal = {
  /**
   * Show modal dialog for given id.
   * @param {string} id Modal Id.
   */
  show: (id) => {
    UIkit.modal(id, { bgClose: false, stack: true }).show()
  },
  /**
   * Hide modal dialog for given id.
   * @param {string} id Modal Id.
   */
  hide: (id) => {
    UIkit.modal(id).hide()
  }
}

/**
 * Show error dialog.
 * @param {string} title Title of dialog box.
 * @param {string} error Error message to show.
 */
export function showError(title, error) {
  dom.errTitle.innerHTML = title
  dom.errMsg.innerHTML = error

  modal.show('#dialogError')
}

/**
 * Show confirmation dialog.
 * @param {string} msg Confirmation message to show.
 * @param {function} action Function to run upon selecting Yes.
 */
export function confirm(msg, action) {
  dom.confirmMsg.innerHTML = msg

  modal.show('#dialogConfirm')

  const yesAction = (event) => {
    action()
    event.stopPropagation()
    UIkit.modal('#dialogConfirm').hide()
  }

  dom.confirmYes.onclick = yesAction
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
 * Centers the modal dialog on the screen.
 * @param {HTMLElement} modal - The modal element to center.
 */
const centerModal = (modal) => {
  requestAnimationFrame(() => {
    modal.style.left = `${(window.innerWidth - modal.offsetWidth) / 2}px`
    modal.style.top = `${(window.innerHeight - modal.offsetHeight) / 2}px`
    modal.style.visibility = ''
  })
}

/**
 * Makes a UIkit modal dialog draggable by its title/header.
 * @param {HTMLElement} modal - The root modal element containing the dialog and title.
 */
function makeModalDraggable(modal) {
  const dialog = modal.querySelector('.uk-modal-dialog')
  const header = dialog?.querySelector('.uk-modal-title')

  if (!dialog || !header) return

  UIkit.util.on(modal, 'beforeshow', () => {
    if (dom.els('#dialogUdfu.uk-open').length > 0) return

    Object.assign(dialog.style, { visibility: 'hidden', display: 'block', position: 'absolute' })

    centerModal(dialog)
  })

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
    offsetX = e.clientX - dialog.offsetLeft
    offsetY = e.clientY - dialog.offsetTop
    dragging = true

    document.addEventListener('mousemove', move)
    document.addEventListener('mouseup', up)
  })

  header.addEventListener('dblclick', () => centerModal(dialog))
}

// Make all modals draggable
dom.els('.modal').forEach(makeModalDraggable)
