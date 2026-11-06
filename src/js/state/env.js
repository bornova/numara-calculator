import { getSystemLocale as coreGetSystemLocale } from '../core/utils.js'
import { dom } from '../dom.js'
import { app } from './appState.js'

const userAgent = navigator.userAgent.toLowerCase()

export const DEFAULT_APP_WIDTH = 560
export const DEFAULT_APP_HEIGHT = 480

/** Check if app is running in Electron. */
export const isElectron = typeof window !== 'undefined' && window.numara !== undefined

/** Check if app is running on macOS. */
export const isMac = isElectron ? window.numara.isMac : userAgent.includes('mac') && !/iphone|ipad|ipod/.test(userAgent)

/** Check if app is running on a mobile device. */
export const isMobile =
  /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent) ||
  (typeof navigator !== 'undefined' && !!navigator.userAgentData?.mobile)

/**
 * Get the active application theme ('dark' or 'light').
 * @returns {Promise<string>} Resolves to 'dark' or 'light'.
 */
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

/**
 * Check whether the window size differs from the default dimensions and toggle the reset size button.
 * @returns {Promise<void>}
 */
export async function checkSize() {
  const appWrapperRect = dom.appWrapper.getBoundingClientRect()
  const appWrapperWidth = Math.round(appWrapperRect.width)
  const appWrapperHeight = Math.round(appWrapperRect.height)
  const widthDiff = Math.abs(appWrapperWidth - DEFAULT_APP_WIDTH)
  const heightDiff = Math.abs(appWrapperHeight - DEFAULT_APP_HEIGHT)
  const isAppWrapperResized = widthDiff > 1 || heightDiff > 1

  dom.resetSizeButton.style.display =
    isElectron && isAppWrapperResized && !(await numara.isMaximized()) ? 'inline-flex' : 'none'
}

/**
 * Get standard BCP 47 locale tag based on system preference.
 * @param {object} [settings=app.settings] The application settings.
 * @returns {string} The system locale.
 */
export function getSystemLocale(settings = app.settings) {
  return coreGetSystemLocale(settings)
}
