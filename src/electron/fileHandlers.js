import { dialog, ipcMain } from 'electron'
import * as fs from 'node:fs'
import * as path from 'node:path'

import { getWindow } from './window.js'

let fileToOpen = null
let isRendererReady = false

/**
 * Extracts a valid `.num` file path from command-line arguments if present.
 * @param {string[]} args Command-line arguments array.
 * @returns {string|null} Path to `.num` file or null.
 */
export function getNumFilePath(args) {
  if (!args || !Array.isArray(args)) return null

  return args.find((arg) => arg.toLowerCase().endsWith('.num') && fs.existsSync(arg)) || null
}

/**
 * Reads a `.num` file from disk and sends its content to the renderer process.
 * @param {string} filePath Absolute path to the `.num` file.
 */
function openFileInRenderer(filePath) {
  const win = getWindow()

  fs.readFile(filePath, 'utf8', (error, data) => {
    if (!win || win.isDestroyed() || !win.webContents) return

    if (error) {
      win.webContents.send('importDataError', error)
      return
    }

    win.webContents.send(
      'pageImported',
      data,
      'Imported from: ' + filePath,
      path.basename(filePath).replace(/\.num$/i, '')
    )
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
  } else {
    fileToOpen = filePath
  }
}

/**
 * Shows the native Open File dialog to import a `.num` page.
 */
export function promptImportPage() {
  const win = getWindow()
  if (!win || win.isDestroyed()) return

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

    if (fileToOpen) {
      openFileInRenderer(fileToOpen)
      fileToOpen = null
    }
  })

  ipcMain.on('importPage', () => {
    promptImportPage()
  })

  ipcMain.on('exportPage', (event, fileName, content) => {
    const win = getWindow()
    if (!win || win.isDestroyed()) return

    const file = dialog.showSaveDialogSync(win, {
      defaultPath: fileName,
      filters: [{ name: 'Numara', extensions: ['num'] }],
      title: 'Export Page'
    })

    if (!file) return

    fs.writeFile(file, content, (error) => {
      if (!win || win.isDestroyed() || event.sender.isDestroyed()) return

      if (error) {
        event.sender.send('exportDataError', error)
        return
      }

      event.sender.send('pageExported', 'Exported to: ' + file)
    })
  })
}
