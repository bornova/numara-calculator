import { $, app } from './common'

import UIkit from 'uikit'

/**
 * Show modal dialog for given id.
 * @param {string} id Modal Id.
 */
export function showModal(id) {
  UIkit.modal(id, { bgClose: false, stack: true }).show()
}

/**
 * Show error dialog.
 * @param {string} title Title of dialog box.
 * @param {string} e Error message to show.
 */
export function showError(title, err) {
  UIkit.util.on('#dialog-error', 'beforeshow', () => {
    $('#errTitle').innerHTML = title
    $('#errMsg').innerHTML = err
  })

  showModal('#dialog-error')
}

/**
 * Show app notifications.
 * @param {string} msg Notification to show.
 * @param {string} stat Notification status: primary | success | warning | danger
 */
export function notify(msg, stat) {
  UIkit.notification({
    message: msg,
    pos: app.settings.notifyLocation,
    status: stat || 'primary',
    timeout: +app.settings.notifyDuration
  })
}

/**
 * Show confirmation dialog.
 * @param {string} msg Confirmation message to show.
 * @param {function} action Function to run upon selecting Yes.
 */
export function confirm(msg, action) {
  $('#confirmMsg').innerHTML = msg

  showModal('#dialog-confirm')

  const yesAction = (e) => {
    action()

    e.stopPropagation()

    UIkit.modal('#dialog-confirm').hide()

    $('#confirm-yes').removeEventListener('click', yesAction)
  }

  $('#confirm-yes').addEventListener('click', yesAction)

  UIkit.util.on('#dialog-confirm', 'hidden', () => {
    $('#confirm-yes').removeEventListener('click', yesAction)
  })
}
