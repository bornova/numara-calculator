import { dom } from './dom'
import {
  getAppLocale as coreGetAppLocale,
  getSystemLocale as coreGetSystemLocale,
  localeUsesComma as coreLocaleUsesComma
} from './core/utils.js'

/** App globals. */
export const app = {
  activePlot: null,
  activePage: null,
  colors: null,
  currencies: {},
  iconCache: {},
  mathScope: new Map(),
  plotFunction: null,
  plotSettings: null,
  refreshCM: true,
  settings: null,
  sidebarDocked: null,
  udfList: [],
  uduList: [],
  widgetMap: new WeakMap()
}

/** Local storage utility. */
export const store = {
  /**
   * Get value from local storage.
   * @param {string} key The key of the item to retrieve.
   * @returns {any} The parsed value from local storage.
   */
  get: (key) => {
    try {
      const consolidated = localStorage.getItem('numara')

      if (consolidated) {
        const obj = JSON.parse(consolidated)

        return obj[key] !== undefined ? obj[key] : null
      }

      const rootItem = localStorage.getItem(key)

      if (rootItem) {
        const parsed = JSON.parse(rootItem)

        store.set(key, parsed)
        localStorage.removeItem(key)

        return parsed
      }

      return null
    } catch (error) {
      console.error(`Error parsing local storage for key "${key}":`, error)

      return null
    }
  },

  /**
   * Save value to local storage.
   * @param {string} key The key under which to store the value.
   * @param {any} value The value to store.
   */
  set: (key, value) => {
    try {
      const consolidated = localStorage.getItem('numara')
      const obj = consolidated ? JSON.parse(consolidated) : {}

      obj[key] = value
      localStorage.setItem('numara', JSON.stringify(obj))
    } catch (error) {
      console.error(`Error writing key "${key}" to local storage:`, error)
    }
  },

  /**
   * Remove value from local storage.
   * @param {string} key The key of the item to remove.
   */
  remove: (key) => {
    try {
      localStorage.removeItem(key)

      const consolidated = localStorage.getItem('numara')

      if (consolidated) {
        const obj = JSON.parse(consolidated)

        delete obj[key]
        localStorage.setItem('numara', JSON.stringify(obj))
      }
    } catch (error) {
      console.error(`Error removing key "${key}" from local storage:`, error)
    }
  }
}

const userAgent = navigator.userAgent.toLowerCase()
const DEFAULT_APP_WIDTH = 560
const DEFAULT_APP_HEIGHT = 480
/** Check if app is running on MacOS. */
export const isMac = userAgent.includes('mac')
/** Check if app is running on Windows. */
export const isWindows = userAgent.includes('win')
/** Check if app is running on Linux. */
export const isLinux = userAgent.includes('linux')
/** Check if app is running in Electron. */
export const isElectron = userAgent.includes('electron')

/** Get app theme */
export async function getTheme() {
  const theme = app.settings.theme

  return theme === 'dark'
    ? 'dark'
    : theme === 'system'
      ? isElectron
        ? (await numara.isDark())
          ? 'dark'
          : 'light'
        : window.matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light'
      : 'light'
}

/** Check window size. */
export async function checkSize() {
  const appWrapperRect = dom.appWrapper.getBoundingClientRect()
  const appWrapperWidth = Math.round(appWrapperRect.width)
  const appWrapperHeight = Math.round(appWrapperRect.height)
  const widthDiff = Math.abs(appWrapperWidth - DEFAULT_APP_WIDTH)
  const heightDiff = Math.abs(appWrapperHeight - DEFAULT_APP_HEIGHT)
  const isAppWrapperResized = widthDiff > 1 || heightDiff > 1

  dom.resetSizeButton.style.display =
    isElectron && isAppWrapperResized && !(await numara.isMaximized()) ? 'block' : 'none'
}

/** Get standard BCP 47 standard locale tag based on selection */
export function getAppLocale(settings = app.settings) {
  return coreGetAppLocale(settings)
}

/** Get standard BCP 47 standard locale tag based on system preference */
export function getSystemLocale(settings = app.settings) {
  return coreGetSystemLocale(settings)
}

/** Check user locale for decimal separator. */
export function localeUsesComma(settings = app.settings) {
  return coreLocaleUsesComma(settings)
}

/** Check for app update */
export function checkAppUpdate() {
  if (!isElectron) return

  const updateStatusMessage = (message) => {
    dom.dialogAboutUpdateStatus.innerHTML = message
  }

  numara.checkUpdate()

  numara.updateStatus((status, version, progress) => {
    switch (status) {
      case 'checking':
        updateStatusMessage('Checking for updates...')
        break
      case 'available':
        dom.notificationDot.style.display = 'block'
        dom.notificationDot.setAttribute('uk-tooltip', `New version available`)
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

        dom.updateButton.style.display = 'inline-block'
        dom.updateButton.addEventListener('click', () => numara.updateApp(), { once: true })
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

/**
 * Creates a debounced function that delays invoking func until after wait milliseconds have elapsed
 * @param {Function} func The function to debounce
 * @param {number} wait The delay in milliseconds
 * @returns {Function} The debounced function
 */
export function debounce(func, wait) {
  let timeout
  const debounced = function (...args) {
    const context = this

    clearTimeout(timeout)
    timeout = setTimeout(() => func.apply(context, args), wait)
  }

  debounced.flush = function () {
    if (timeout) {
      clearTimeout(timeout)
      func()
    }
  }

  return debounced
}
