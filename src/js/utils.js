import { $, app } from './common.js'

/** Check if app is running on MacOS. */
export const isMac = navigator.userAgent.toLowerCase().includes('mac')

/** Check if app is running on Node (Electron). */
export const isNode = navigator.userAgent.toLowerCase().includes('electron')

/** IPC Renderer process if running on Node */
export const ipc = isNode ? require('electron').ipcRenderer : null

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
  $('#resetSizeButton').style.display = isNode
    ? ipc.sendSync('isResized') && !ipc.sendSync('isMaximized')
      ? 'block'
      : 'none'
    : 'none'
}

/** Minimize/maximize window. */
export function toggleMinMax() {
  ipc.send(ipc.sendSync('isMaximized') ? 'unmaximize' : 'maximize')
}
