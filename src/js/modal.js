import { app } from './common'
import { dom } from './dom'

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

// Track if error handler is already attached
let errorHandlerAttached = false

/**
 * Show error dialog.
 * @param {string} title Title of dialog box.
 * @param {string} error Error message to show.
 */
export function showError(title, error) {
  if (!errorHandlerAttached) {
    UIkit.util.on('#dialogError', 'beforeshow', () => {
      dom.errTitle.innerHTML = title
      dom.errMsg.innerHTML = error
    })
    errorHandlerAttached = true
  } else {
    dom.errTitle.innerHTML = title
    dom.errMsg.innerHTML = error
  }

  modal.show('#dialogError')
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
