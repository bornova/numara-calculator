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

// Make dialogs draggable
const centerModal = (modal) => {
  requestAnimationFrame(() => {
    modal.style.left = `${(window.innerWidth - modal.offsetWidth) / 2}px`
    modal.style.top = `${(window.innerHeight - modal.offsetHeight) / 2}px`
    modal.style.visibility = ''
  })
}

dom.els('.modal').forEach((modal) => {
  const dialog = modal.querySelector('.uk-modal-dialog')
  const header = dialog.querySelector('.uk-modal-title')

  if (!dialog || !header) return

  // Center dialog on show
  UIkit.util.on(modal, 'beforeshow', () => {
    const udOpen = dom.els('#dialogUdfu.uk-open').length > 0

    if (udOpen) return

    Object.assign(dialog.style, { visibility: 'hidden', display: 'block', position: 'absolute' })

    centerModal(dialog)
  })

  let dragging = false

  header.addEventListener('mousedown', (e) => {
    const offsetX = e.clientX - dialog.offsetLeft
    const offsetY = e.clientY - dialog.offsetTop
    dragging = true

    const move = (e) => {
      if (!dragging) return

      const left = Math.max(10, Math.min(e.clientX - offsetX, window.innerWidth - dialog.offsetWidth - 10))
      const top = Math.max(40, Math.min(e.clientY - offsetY, window.innerHeight - dialog.offsetHeight - 10))

      dialog.style.left = `${left}px`
      dialog.style.top = `${top}px`
    }

    const up = () => {
      dragging = false
      document.removeEventListener('mousemove', move)
      document.removeEventListener('mouseup', up)
    }

    document.addEventListener('mousemove', move)
    document.addEventListener('mouseup', up)
  })

  header.addEventListener('dblclick', () => centerModal(dialog))
})
