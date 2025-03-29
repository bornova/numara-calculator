import { $, app, store } from './common'
import { notify } from './modal'

/** Check if app is running on MacOS. */
export const isMac = navigator.userAgent.toLowerCase().includes('mac')

/** Check if app is running in Electron. */
export const isElectron = navigator.userAgent.toLowerCase().includes('electron')

/** Get app theme */
export function getTheme() {
  app.settings = store.get('settings')

  return app.settings?.theme === 'system'
    ? isElectron
      ? numara.isDark()
        ? 'dark'
        : 'light'
      : 'light'
    : app.settings?.theme === 'dark'
      ? 'dark'
      : 'light'
}

/** Check user locale for thousands separator. */
export function checkLocale() {
  const locale =
    app.settings.locale === 'system'
      ? navigator.languages && navigator.languages.length
        ? navigator.languages[0]
        : navigator.language
      : app.settings.locale

  return (1.11).toLocaleString(locale).match(/[,]/)
}

/** Check window size. */
export function checkSize() {
  $('#resetSizeButton').style.display = isElectron
    ? numara.isResized() && !numara.isMaximized()
      ? 'block'
      : 'none'
    : 'none'
}

/** Minimize/maximize window. */
export function toggleMinMax() {
  if (numara.isMaximized()) {
    numara.unmaximize()
  } else {
    numara.maximize()
  }
}

/** Check for app update */
export function checkUpdate() {
  if (!isElectron) return

  const updateStatusMessage = (message) => {
    $('#dialog-about-updateStatus').innerHTML = message
  }

  numara.checkUpdate()

  numara.updateStatus((event, status, version, progress) => {
    switch (status) {
      case 'checking':
        updateStatusMessage('Checking for updates...')
        break

      case 'available':
        notify(
          `A new updated version ${version} is available. <a class="notificationLink" onclick="document.querySelector('#aboutButton').click()">Update status</a>`
        )
        break

      case 'notAvailable':
        updateStatusMessage('Numara is up to date.')
        break

      case 'downloading':
        updateStatusMessage(`Downloading update... (${Math.round(progress.percent)}%)`)
        break

      case 'downloaded': {
        const notice = `New version ${version} is ready to install.`

        updateStatusMessage(notice)

        if (!$('#dialog-about').classList.contains('uk-open')) {
          notify(
            `${notice} <a class="notificationLink" onclick="document.querySelector('#updateButton').click()">Install Now</a>`
          )
        }

        $('#notificationDot').style.display = 'block'
        $('#updateButton').style.display = 'inline-block'

        break
      }

      case 'error':
        updateStatusMessage('Error while checking for updates.')
        break

      default:
        updateStatusMessage('Unable to check for update.')
    }
  })
}
