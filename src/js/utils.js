import { dom } from './dom'
import { notify } from './modal'

/** App globals. */
export const app = {
  activePlot: null,
  activePage: null,
  colors: null,
  currencyRates: {},
  mathScope: {},
  plotFunction: null,
  refreshCM: true,
  settings: null,
  udfList: [],
  uduList: []
}

/** Local storage utility. */
export const store = {
  /**
   * Get value from local storage.
   * @param {string} key - The key of the item to retrieve.
   * @returns {any} The parsed value from local storage.
   */
  get: (key) => JSON.parse(localStorage.getItem(key)),

  /**
   * Save value to local storage.
   * @param {string} key - The key under which to store the value.
   * @param {any} value - The value to store.
   */
  set: (key, value) => {
    localStorage.setItem(key, JSON.stringify(value))
  }
}

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

        dom.notificationDot.style.display = 'block'
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

        dom.updateButton.style.display = 'inline-block'
        dom.updateButton.addEventListener('click', () => numara.updateApp())
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
