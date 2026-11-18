import { dialog, ipcMain } from 'electron'
import * as fs from 'node:fs'
import * as path from 'node:path'

import { getWindow, sendToWindow } from './window.js'

const pendingFiles = []
let isRendererReady = false

/**
 * Resets renderer-ready tracking when the main window closes.
 */
export function resetRendererReady() {
  isRendererReady = false
}

/**
 * Extracts a `.num` file path from command-line arguments if present.
 * @param {string[]} args Command-line arguments array.
 * @param {string} [baseDir] Optional working directory used to resolve relative paths.
 * @returns {string|null} Resolved path to `.num` file or null.
 */
export function getNumFilePath(args, baseDir) {
  if (!args || !Array.isArray(args)) {
    return null
  }

  for (const arg of args) {
    if (typeof arg !== 'string' || arg.startsWith('-') || !arg.toLowerCase().endsWith('.num')) {
      continue
    }

    const resolved = baseDir && !path.isAbsolute(arg) ? path.resolve(baseDir, arg) : path.resolve(arg)

    try {
      if (fs.statSync(resolved).isFile()) {
        return resolved
      }
    } catch {
      // Ignore missing or inaccessible paths
    }
  }

  return null
}

/**
 * Reads a `.num` file from disk and sends its content to the renderer process.
 * @param {string} filePath Absolute path to the `.num` file.
 */
function openFileInRenderer(filePath) {
  fs.readFile(filePath, 'utf8', (error, data) => {
    if (error) {
      sendToWindow('importDataError', error)
      return
    }

    sendToWindow('pageImported', data, 'Imported from: ' + filePath, path.basename(filePath).replace(/\.num$/i, ''))
  })
}

/**
 * Opens a `.num` file immediately if the renderer is ready, or queues it until `renderer-ready`.
 * @param {string} filePath Absolute path to the `.num` file.
 */
export function queueOrOpenFile(filePath) {
  if (!filePath) return

  if (isRendererReady && getWindow()) {
    openFileInRenderer(filePath)
  } else if (!pendingFiles.includes(filePath)) {
    pendingFiles.push(filePath)
  }
}

/**
 * Shows the native Open File dialog to import a `.num` page.
 */
export function promptImportPage() {
  const win = getWindow()

  if (!win) return

  const file = dialog.showOpenDialogSync(win, {
    filters: [{ name: 'Numara', extensions: ['num'] }],
    properties: ['openFile'],
    title: 'Import Page'
  })

  if (!file) return

  openFileInRenderer(file[0])
}

/**
 * Registers IPC handlers for page file importing, exporting, and startup file opening.
 */
export function setupFileHandlers() {
  ipcMain.on('renderer-ready', () => {
    isRendererReady = true

    for (const filePath of pendingFiles.splice(0)) {
      openFileInRenderer(filePath)
    }
  })

  ipcMain.on('importPage', promptImportPage)

  ipcMain.on('exportPage', (event, fileName, content) => {
    const win = getWindow()

    if (!win) return

    const file = dialog.showSaveDialogSync(win, {
      defaultPath: fileName,
      filters: [{ name: 'Numara', extensions: ['num'] }],
      title: 'Export Page'
    })

    if (!file) return

    fs.writeFile(file, String(content ?? ''), (error) => {
      if (!getWindow() || event.sender.isDestroyed()) return

      if (error) {
        event.sender.send('exportDataError', error)
        return
      }

      event.sender.send('pageExported', 'Exported to: ' + file)
    })
  })
}
