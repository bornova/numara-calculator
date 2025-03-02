import { $, app } from './common'
import UIkit from 'uikit'

export const modal = {
  /**
   * Show modal dialog for given id.
   *
   * @param {string} id Modal Id.
   */
  show: (id) => {
    UIkit.modal(id, { bgClose: false, stack: true }).show()
  },
  /**
   * Hide modal dialog for given id.
   *
   * @param {string} id Modal Id.
   */
  hide: (id) => {
    UIkit.modal(id).hide()
  }
}

/**
 * Show error dialog.
 *
 * @param {string} title Title of dialog box.
 * @param {string} error Error message to show.
 */
export function showError(title, error) {
  UIkit.util.on('#dialog-error', 'beforeshow', () => {
    $('#errTitle').innerHTML = title
    $('#errMsg').innerHTML = error
  })

  modal.show('#dialog-error')
}

/**
 * Show app notifications.
 *
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
 *
 * @param {string} msg Confirmation message to show.
 * @param {function} action Function to run upon selecting Yes.
 */
export function confirm(msg, action) {
  $('#confirmMsg').innerHTML = msg

  modal.show('#dialog-confirm')

  const yesAction = (event) => {
    action()
    event.stopPropagation()
    UIkit.modal('#dialog-confirm').hide()
    $('#confirm-yes').removeEventListener('click', yesAction)
  }

  $('#confirm-yes').addEventListener('click', yesAction)

  UIkit.util.on('#dialog-confirm', 'hidden', () => {
    $('#confirm-yes').removeEventListener('click', yesAction)
  })
}
