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

/** Check for app updates */
export function checkUpdates() {
  if (isElectron) {
    numara.checkUpdate()

    numara.notifyUpdate(() => {
      notify(
        'Downloading latest version... <a class="notificationLink" onclick="document.querySelector(`#aboutButton`).click()">View status</a>'
      )

      $('#notificationDot').style.display = 'block'
    })

    numara.updateStatus((event, status) => {
      if (status === 'ready') {
        $('#dialog-about-updateStatus').innerHTML = 'New version is ready to be installed.'
        $('#updateButton').style.display = 'inline-block'

        if (!$('#dialog-about').classList.contains('uk-open')) {
          notify(
            'New version is ready to be installed. <a class="notificationLink" onclick="document.querySelector(`#updateButton`).click()">Install Now</a>'
          )
        }
      } else {
        $('#dialog-about-updateStatus').innerHTML = status
      }
    })
  }
}
