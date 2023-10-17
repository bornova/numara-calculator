import { $, app } from './common.js'
import { notify } from './modal.js'

/** Check if app is running on MacOS. */
export const isMac = navigator.userAgent.toLowerCase().includes('mac')

/** Check if app is running in Electron. */
export const isElectron = navigator.userAgent.toLowerCase().includes('electron')

/** IPC Renderer process if running in Electron */
export const ipc = isElectron ? window.require('electron').ipcRenderer : null

/** Check user locale for thousands separator. */
export function checkLocale() {
  const locale =
    app.settings.locale === 'system'
      ? navigator.languages && navigator.languages.length
        ? navigator.languages[0]
        : navigator.language
      : app.settings.locale

  const test = (1.11).toLocaleString(locale)

  return test.match(/[,]/)
}

/** Check window size. */
export function checkSize() {
  $('#resetSizeButton').style.display = isElectron
    ? ipc.sendSync('isResized') && !ipc.sendSync('isMaximized')
      ? 'block'
      : 'none'
    : 'none'
}

/** Minimize/maximize window. */
export function toggleMinMax() {
  ipc.send(ipc.sendSync('isMaximized') ? 'unmaximize' : 'maximize')
}

/** Check for app updates */
export function checkUpdates() {
  if (isElectron) {
    ipc.send('checkUpdate')

    ipc.on('notifyUpdate', () => {
      notify(
        'Updating Numara... <a class="notificationLink" onclick="document.querySelector(`#aboutButton`).click()">View update status</a>'
      )

      $('#notificationDot').style.display = 'block'
    })

    ipc.on('updateStatus', (event, status) => {
      if (status === 'ready') {
        $('#dialog-about-updateStatus').innerHTML = 'Restart Numara to finish updating.'
        $('#restartButton').style.display = 'inline-block'

        if (!$('#dialog-about').classList.contains('uk-open')) {
          notify(
            'Restart Numara to finish updating. <a class="notificationLink" onclick="document.querySelector(`#restartButton`).click()">Restart Now</a>'
          )
        }
      } else {
        $('#dialog-about-updateStatus').innerHTML = status
      }
    })
  }
}
