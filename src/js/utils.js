import { app, store } from './common'
import { dom } from './dom'
import { notify } from './modal'

// Cache user agent checks
const userAgent = navigator.userAgent.toLowerCase()
/** Check if app is running on MacOS. */
export const isMac = userAgent.includes('mac')
/** Check if app is running in Electron. */
export const isElectron = userAgent.includes('electron')

/** Get app theme */
export function getTheme() {
  app.settings = store.get('settings')

  if (app.settings?.theme === 'dark') return 'dark'
  if (app.settings?.theme === 'system' && isElectron) return numara.isDark() ? 'dark' : 'light'
  return 'light'
}

/** Check user locale for thousands separator. */
export function checkLocale() {
  const locale = app.settings.locale === 'system' ? navigator.language : app.settings.locale

  return (1.11).toLocaleString(locale).match(/[,]/)
}

/** Check window size. */
export function checkSize() {
  dom.resetSizeButton.style.display = isElectron && numara.isResized() && !numara.isMaximized() ? 'block' : 'none'
}

/** Minimize/maximize window. */
export function toggleMinMax() {
  numara.isMaximized() ? numara.minimize() : numara.maximize()
}

/** Check for app update */
export function checkAppUpdate() {
  if (!isElectron) return

  const updateStatusMessage = (message) => {
    dom.dialogAboutUpdateStatus.innerHTML = message
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

        if (!dom.dialogAbout.classList.contains('uk-open')) {
          notify(
            `${notice} <a class="notificationLink" onclick="document.querySelector('#updateButton').click()">Install Now</a>`
          )
        }

        dom.notificationDot.style.display = 'block'
        dom.updateButton.style.display = 'inline-block'
        dom.updateButton.addEventListener('click', () => {
          numara.updateApp()
        })
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
