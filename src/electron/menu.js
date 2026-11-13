import { app, ipcMain, Menu, nativeImage, shell, Tray } from 'electron'
import log from 'electron-log'
import * as fs from 'node:fs'
import * as path from 'node:path'

import { config, isMac, isWin } from './config.js'
import { isValidDirectory } from './syncWatcher.js'
import { getWindow, openMainLog, sendToWindow, setAppQuitting, showAndFocusWindow } from './window.js'

let tray = null

/**
 * Resolves the platform-appropriate tray icon path.
 * @returns {string} Path to the tray icon asset.
 */
function getTrayIconPath() {
  const iconFileName = isWin ? 'icon.ico' : isMac ? 'trayTemplate.png' : 'icon.png'
  const possiblePaths = [
    path.join(import.meta.dirname, `../../build/assets/${iconFileName}`),
    path.join(app.getAppPath(), `build/assets/${iconFileName}`)
  ]

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) return p
  }

  return path.join(app.getAppPath(), `build/assets/${iconFileName}`)
}

/**
 * Creates or destroys the system tray / menu bar icon based on the `showTray` setting.
 */
export function updateTrayState() {
  const showTray = config.get('showTray')

  if (showTray) {
    if (!tray) {
      const contextMenu = Menu.buildFromTemplate([
        {
          label: 'Show Numara',
          click: showAndFocusWindow
        },
        {
          label: 'Hide Numara',
          click: () => {
            const win = getWindow()

            if (win && !win.isDestroyed()) {
              win.hide()
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Quit',
          click: () => {
            setAppQuitting(true)
            app.quit()
          }
        }
      ])

      try {
        const trayIconPath = getTrayIconPath()
        const trayIcon = nativeImage.createFromPath(trayIconPath)

        if (isMac) {
          trayIcon.setTemplateImage(true)
        }

        tray = new Tray(trayIcon)
        tray.setToolTip('Numara Calculator')

        tray.on('right-click', () => {
          tray.popUpContextMenu(contextMenu)
        })

        tray.on('click', showAndFocusWindow)
      } catch (err) {
        log.error('Failed to create tray:', err)
      }
    }
  } else if (tray) {
    tray.destroy()
    tray = null
  }
}

/**
 * Generate context menu header.
 * @param {number} index The line index.
 * @param {boolean} isMultiLine Is it a multi-line selection.
 * @param {boolean} hasAnswer Does the line have an answer.
 * @returns {Array} The context menu header template.
 */
const contextHeader = (index, isMultiLine, hasAnswer) =>
  hasAnswer || index !== null
    ? [
        { label: isMultiLine ? 'Multiple lines:' : `Line ${+index + 1}:`, enabled: false, click: () => {} },
        { type: 'separator' },
        { role: 'copy' },
        { role: 'paste' },
        { type: 'separator' }
      ]
    : [{ label: '', visible: false }]

/**
 * Generate common context menu items.
 * @param {Electron.IpcMainEvent} event The IPC event object.
 * @param {number} index The line index.
 * @param {boolean} isEmpty Is the input empty.
 * @param {boolean} isMultiLine Is it a multi-line selection.
 * @param {boolean} hasAnswer Does the line have an answer.
 * @returns {Array} The common context menu template.
 */
const commonContext = (event, index, isEmpty, isMultiLine, hasAnswer) => [
  {
    label: 'Copy line',
    enabled: hasAnswer && !isMultiLine,
    click: () => event.sender.send('copyLine', index)
  },
  {
    label: 'Copy answer',
    enabled: hasAnswer && !isMultiLine,
    click: () => event.sender.send('copyAnswer', index, false)
  },
  {
    label: 'Copy line with answer',
    enabled: hasAnswer && !isMultiLine,
    click: () => event.sender.send('copyAnswer', index, true)
  },
  { type: 'separator' },
  {
    label: 'Copy all lines',
    enabled: !isEmpty,
    click: () => event.sender.send('copyAllLines')
  },
  {
    label: 'Copy all answers',
    enabled: !isEmpty,
    click: () => event.sender.send('copyAllAnswers')
  },
  {
    label: 'Copy all lines with answers',
    enabled: !isEmpty,
    click: () => event.sender.send('copyAll')
  }
]

/**
 * Registers IPC handlers for input, output, textbox, and sync folder context menus.
 */
export function setupContextMenus() {
  ipcMain.on('inputContextMenu', (event, index, isEmpty, isMultiLine, hasAnswer) => {
    Menu.buildFromTemplate([
      ...contextHeader(index, isMultiLine, hasAnswer),
      ...commonContext(event, index, isEmpty, isMultiLine, hasAnswer)
    ]).popup()
  })

  ipcMain.on('outputContextMenu', (event, index, isEmpty, hasAnswer) => {
    Menu.buildFromTemplate([
      ...contextHeader(index, false, hasAnswer),
      ...commonContext(event, index, isEmpty, false, hasAnswer)
    ]).popup()
  })

  ipcMain.on('textboxContextMenu', () =>
    Menu.buildFromTemplate([{ role: 'cut' }, { role: 'copy' }, { role: 'paste' }]).popup()
  )

  ipcMain.on('syncDirContextMenu', (event, dirPath) => {
    Menu.buildFromTemplate([
      {
        label: 'Open folder',
        click: () => {
          try {
            if (isValidDirectory(dirPath)) {
              shell.openPath(dirPath)
            }
          } catch (err) {
            log.error('Failed to open sync folder:', err)
          }
        }
      }
    ]).popup()
  })
}

/**
 * Builds and sets the native application menu on macOS and Linux.
 * @param {object} handlers
 * @param {function} handlers.promptImportPage Callback to open the import page dialog.
 * @param {function} handlers.resetSize Callback to reset the window dimensions.
 */
export function setupApplicationMenu({ promptImportPage, resetSize }) {
  const menuTemplate = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              {
                label: `About ${app.name}`,
                click: () => sendToWindow('showAbout')
              },
              {
                label: 'Check for Updates...',
                click: () => sendToWindow('menuAction', 'checkUpdates')
              },
              { type: 'separator' },
              {
                label: 'Settings...',
                accelerator: 'CmdOrCtrl+,',
                click: () => sendToWindow('menuAction', 'openSettings')
              },
              {
                label: 'User Definitions...',
                click: () => sendToWindow('menuAction', 'openUdfu')
              },
              { type: 'separator' },
              { role: 'services' },
              { type: 'separator' },
              { role: 'hide' },
              { role: 'hideOthers' },
              { role: 'unhide' },
              { type: 'separator' },
              { role: 'quit' }
            ]
          }
        ]
      : []),
    {
      label: 'File',
      submenu: [
        {
          label: 'New Page',
          accelerator: 'CmdOrCtrl+N',
          registerAccelerator: false,
          click: () => sendToWindow('menuAction', 'newPage')
        },
        {
          label: 'Clear Page',
          accelerator: 'CmdOrCtrl+D',
          registerAccelerator: false,
          click: () => sendToWindow('menuAction', 'clearPage')
        },
        { type: 'separator' },
        {
          label: 'Import Page...',
          click: () => {
            promptImportPage()
          }
        },
        {
          label: 'Export Page...',
          click: () => sendToWindow('requestExportPage')
        },
        { type: 'separator' },
        {
          label: 'Print...',
          accelerator: 'CmdOrCtrl+P',
          registerAccelerator: false,
          click: () => sendToWindow('print')
        },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        {
          label: 'Undo',
          accelerator: 'CmdOrCtrl+Z',
          registerAccelerator: false,
          click: () => sendToWindow('menuAction', 'undo')
        },
        {
          label: 'Redo',
          accelerator: 'Shift+CmdOrCtrl+Z',
          registerAccelerator: false,
          click: () => sendToWindow('menuAction', 'redo')
        },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
        { type: 'separator' },
        {
          label: 'Copy All Lines',
          click: () => sendToWindow('copyAllLines')
        },
        {
          label: 'Copy All Answers',
          click: () => sendToWindow('copyAllAnswers')
        },
        {
          label: 'Copy All Lines with Answers',
          click: () => sendToWindow('copyAll')
        }
      ]
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Toggle Page List',
          accelerator: 'Shift+Tab',
          registerAccelerator: false,
          click: () => sendToWindow('menuAction', 'togglePageList')
        },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { type: 'separator' },
        { role: 'toggleDevTools' }
      ]
    },
    {
      label: 'Window',
      role: 'windowMenu',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        {
          label: 'Reset Window Size',
          click: () => {
            const win = getWindow()

            if (win && !win.isDestroyed() && win.webContents) {
              sendToWindow('menuAction', 'resetSize')
            } else {
              resetSize()
            }
          }
        },
        ...(isMac ? [{ type: 'separator' }, { role: 'front' }] : [])
      ]
    },
    {
      role: 'help',
      submenu: [
        {
          label: 'Documentation',
          click: () => shell.openExternal('https://github.com/bornova/numara-calculator/wiki')
        },
        {
          label: 'Report an Issue',
          click: () => shell.openExternal('https://github.com/bornova/numara-calculator/issues')
        },
        {
          label: 'Learn More',
          click: () => shell.openExternal('https://github.com/bornova/numara-calculator')
        },
        { type: 'separator' },
        {
          label: 'Open Logs',
          click: openMainLog
        }
      ]
    }
  ]

  Menu.setApplicationMenu(isMac || process.platform === 'linux' ? Menu.buildFromTemplate(menuTemplate) : null)
}
