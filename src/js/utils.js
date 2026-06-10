import { dom } from './dom'

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
   * @param {string} key - The key of the item to retrieve.
   * @returns {any} The parsed value from local storage.
   */
  get: (key) => {
    try {
      const item = localStorage.getItem(key)

      return item ? JSON.parse(item) : null
    } catch (error) {
      console.error(`Error parsing local storage for key "${key}":`, error)

      return null
    }
  },

  /**
   * Save value to local storage.
   * @param {string} key - The key under which to store the value.
   * @param {any} value - The value to store.
   */
  set: (key, value) => {
    localStorage.setItem(key, JSON.stringify(value))
  }
}

const userAgent = navigator.userAgent.toLowerCase()
/** Check if app is running on MacOS. */
export const isMac = userAgent.includes('mac')
/** Check if app is running in Electron. */
export const isElectron = userAgent.includes('electron')

/** Get app theme */
export async function getTheme() {
  if (app.settings.theme === 'dark') return 'dark'
  if (app.settings.theme === 'system' && isElectron) return (await numara.isDark()) ? 'dark' : 'light'

  if (app.settings.theme === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }

  return 'light'
}

/** Check window size. */
export async function checkSize() {
  dom.resetSizeButton.style.display =
    isElectron && (await numara.isResized()) && !(await numara.isMaximized()) ? 'block' : 'none'
}

/** Get standard BCP 47 standard locale tag based on selection */
export function getAppLocale() {
  const loc = app.settings.locale || 'system'
  if (loc === 'period') return 'en-US'
  if (loc === 'comma') return 'tr-TR'
  return navigator.languages?.[0] ?? navigator.language
}

/** Check user locale for decimal separator. */
export function localeUsesComma() {
  const loc = app.settings.locale || 'system'
  if (loc === 'period') return false
  if (loc === 'comma') return true
  const locale = navigator.languages?.[0] ?? navigator.language

  return (1.11).toLocaleString(locale).includes(',')
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

const HTML_ESCAPES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  "'": '&#39;',
  '"': '&quot;'
}

/**
 * Escape HTML special characters in a string.
 *
 * @param {string} str - The string to escape.
 * @returns {string} - The escaped string.
 */
export function escapeHTML(str) {
  if (typeof str !== 'string') return str
  return str.replace(/[&<>'"]/g, (tag) => HTML_ESCAPES[tag])
}

/**
 * Escape special characters in a string for use in a regular expression.
 * @param {string} string - The string to escape.
 * @returns {string} - The escaped string.
 */
export function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Creates a debounced function that delays invoking func until after wait milliseconds have elapsed
 * @param {Function} func - The function to debounce
 * @param {number} wait - The delay in milliseconds
 * @returns {Function} - The debounced function
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
