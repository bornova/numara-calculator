import {
  app,
  BrowserWindow,
  dialog,
  globalShortcut,
  ipcMain,
  Menu,
  nativeImage,
  nativeTheme,
  Notification,
  session,
  shell,
  Tray
} from 'electron'
import log from 'electron-log'
import Store from 'electron-store'
import updater from 'electron-updater'

import * as path from 'node:path'
import * as fs from 'node:fs'

log.info(`Starting Numara... [v${app.getVersion()}] ${app.isPackaged ? '' : '(Dev)'}`)
log.initialize({ spyRendererConsole: true })
log.errorHandler.startCatching()
log.eventLogger.startLogging()

const { autoUpdater } = updater
autoUpdater.autoInstallOnAppQuit = false
autoUpdater.logger = log
autoUpdater.logger.transports.file.level = 'info'

const schema = {
  appHeight: { type: 'number', default: 480 },
  appWidth: { type: 'number', default: 560 },
  fullSize: { type: 'boolean', default: false },
  position: { type: 'array', items: { type: 'integer' } },
  theme: { type: 'string', default: 'system' },
  showTray: { type: 'boolean', default: false }
}

const config = new Store({ schema, clearInvalidConfig: true, fileExtension: '' })

const isMac = process.platform === 'darwin'
const isWin = process.platform === 'win32'

const DARK_COLOR = '#1f1f1f'
const LIGHT_COLOR = '#ffffff'
const TRANS_COLOR = '#00000000'

const getThemeColor = () =>
  config.get('theme') === 'dark' || (config.get('theme') === 'system' && nativeTheme.shouldUseDarkColors)
    ? DARK_COLOR
    : LIGHT_COLOR

let win
let tray = null
let isQuitting = false

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

function updateTrayState() {
  const showTray = config.get('showTray')

  if (showTray) {
    if (!tray) {
      const contextMenu = Menu.buildFromTemplate([
        {
          label: 'Show Numara',
          click: () => {
            if (win) {
              win.show()
              win.focus()
            }
          }
        },
        {
          label: 'Hide Numara',
          click: () => {
            if (win) {
              win.hide()
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Quit',
          click: () => {
            isQuitting = true
            app.quit()
          }
        }
      ])

      try {
        const trayIconPath = getTrayIconPath()
        let trayIcon = nativeImage.createFromPath(trayIconPath)

        if (isMac) {
          trayIcon.setTemplateImage(true)
        }

        tray = new Tray(trayIcon)
        tray.setToolTip('Numara Calculator')
        tray.setContextMenu(contextMenu)

        tray.on('click', () => {
          if (win) {
            if (win.isVisible()) {
              win.hide()
            } else {
              win.show()
              win.focus()
            }
          }
        })
      } catch (err) {
        log.error('Failed to create tray:', err)
      }
    }
  } else {
    if (tray) {
      tray.destroy()
      tray = null
    }
  }
}

/**
 * Sets the title bar overlay configuration based on the transparency state.
 * @param {boolean} isTrans Determines if the title bar should be transparent.
 */
function setTitleBarOverlay(isTrans) {
  if (!isWin) return

  const titleBarConfig = {
    color: isTrans ? TRANS_COLOR : getThemeColor(),
    symbolColor: getThemeColor() === DARK_COLOR ? LIGHT_COLOR : DARK_COLOR
  }

  win.setTitleBarOverlay(titleBarConfig)
}

/**
 * Create the main application window.
 */
function createAppWindow() {
  win = new BrowserWindow({
    backgroundColor: getThemeColor(),
    frame: false,
    height: parseInt(config.get('appHeight')),
    width: parseInt(config.get('appWidth')),
    minHeight: 360,
    minWidth: 420,
    show: false,
    titleBarStyle: isMac ? 'hiddenInset' : 'hidden',
    titleBarOverlay: true,
    webPreferences: {
      preload: path.join(import.meta.dirname, 'preload.cjs'),
      spellcheck: false
    }
  })

  win.loadFile('build/index.html')

  win.webContents.on('did-finish-load', () => {
    const pos = config.get('position')

    if (config.get('fullSize') && isWin) win.maximize()
    if (pos) win.setPosition(...pos)
    if (!app.isPackaged) win.webContents.openDevTools()

    setTitleBarOverlay()

    win.show()
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  win.on('close', (e) => {
    config.set('fullSize', win.isMaximized())
    try {
      config.set('position', win.getPosition())
    } catch {
      // Ignore
    }

    if (!win.isMaximized()) {
      const [width, height] = win.getSize()
      config.set('appWidth', width)
      config.set('appHeight', height)
    }

    if (config.get('showTray') && !isQuitting) {
      e.preventDefault()
      win.hide()
    }
  })

  updateTrayState()

  if (app.isPackaged) {
    win.on('focus', () => globalShortcut.registerAll(['CommandOrControl+R', 'F5'], () => {}))
    win.on('blur', () => globalShortcut.unregisterAll())
  }
}

app.setAppUserModelId('com.numara.app')
app.whenReady().then(createAppWindow)
app.requestSingleInstanceLock()
  ? app.on('second-instance', () => {
      if (win) {
        if (!win.isVisible()) win.show()
        win.focus()
      }
    })
  : app.quit()

nativeTheme.on('updated', () => {
  win.webContents.send('themeUpdate', nativeTheme.shouldUseDarkColors)
  setTitleBarOverlay()
})

ipcMain.handle('isDark', () => nativeTheme.shouldUseDarkColors)
ipcMain.on('setTheme', (event, mode) => {
  config.set('theme', mode)
  setTitleBarOverlay(true)
})
ipcMain.on('transControls', (event, isTrans) => setTitleBarOverlay(isTrans))

ipcMain.on('setOnTop', (event, bool) => win.setAlwaysOnTop(bool))
ipcMain.on('setTray', (event, bool) => {
  config.set('showTray', bool)
  updateTrayState()
})
ipcMain.handle('isMaximized', () => win.isMaximized())
ipcMain.handle('isResized', () => {
  const [width, height] = win.getSize()

  return width !== schema.appWidth.default || height !== schema.appHeight.default
})

ipcMain.on('importPage', (event) => {
  const file = dialog.showOpenDialogSync(win, {
    filters: [{ name: 'Numara', extensions: ['num'] }],
    properties: ['openFile'],
    title: 'Import Page'
  })

  if (!file) return

  fs.readFile(file[0], 'utf8', (error, data) => {
    if (error) {
      event.sender.send('importDataError', error)
      return
    }

    event.sender.send('pageImported', data, 'Imported from: ' + file[0])
  })
})

ipcMain.on('exportPage', (event, fileName, content) => {
  const file = dialog.showSaveDialogSync(win, {
    defaultPath: fileName,
    filters: [{ name: 'Numara', extensions: ['num'] }],
    title: 'Export Page'
  })

  if (!file) return

  fs.writeFile(file, content, (error) => {
    if (error) {
      event.sender.send('exportDataError', error)
      return
    }

    event.sender.send('pageExported', 'Exported to: ' + file)
  })
})

/**
 * Reset window size to default.
 */
function resetSize(
  appWrapperWidth = schema.appWidth.default,
  appWrapperHeight = schema.appHeight.default,
  sidebarWidth = 0
) {
  if (!win || win.isDestroyed()) return

  const [minWidth, minHeight] = win.getMinimumSize()
  const width = Math.round(Number(appWrapperWidth) || schema.appWidth.default)
  const height = Math.round(Number(appWrapperHeight) || schema.appHeight.default)
  const sidebar = Math.max(0, Math.round(Number(sidebarWidth) || 0))

  win.setSize(Math.max(minWidth, width + sidebar), Math.max(minHeight, height))
}

ipcMain.on('resetSize', (event, appWrapperWidth, appWrapperHeight, sidebarWidth) => {
  resetSize(appWrapperWidth, appWrapperHeight, sidebarWidth)
})
ipcMain.on('resetApp', () => {
  session.defaultSession.clearStorageData().then(() => {
    config.clear()
    app.relaunch()
    app.exit()
  })
})
ipcMain.on('openDevTools', () => win.webContents.openDevTools())
ipcMain.on('openPath', (event, dirPath) => {
  shell.openPath(dirPath)
})
ipcMain.on('openLogs', () => {
  shell.openPath(path.join(app.getPath('logs'), 'main.log'))
})

let syncWatcher = null

ipcMain.handle('checkSyncDirectory', async (event, dirPath) => {
  try {
    return fs.existsSync(dirPath) && fs.lstatSync(dirPath).isDirectory()
  } catch {
    return false
  }
})

ipcMain.handle('selectSyncDirectory', async () => {
  const result = await dialog.showOpenDialog(win, {
    properties: ['openDirectory', 'createDirectory'],
    title: 'Select Local Sync Directory'
  })

  return result.canceled ? null : result.filePaths[0]
})

ipcMain.handle('readSyncDirectory', async (event, dirPath) => {
  try {
    const files = await fs.promises.readdir(dirPath)
    const numFiles = files.filter((f) => f.endsWith('.num'))
    const fileContents = []

    for (const file of numFiles) {
      const filePath = path.join(dirPath, file)
      const content = await fs.promises.readFile(filePath, 'utf8')
      const name = path.basename(file, '.num')

      fileContents.push({ name, content })
    }

    return fileContents
  } catch (error) {
    log.error('Error reading sync directory:', error)
    throw error
  }
})

ipcMain.handle('writeSyncFile', async (event, dirPath, filename, content) => {
  try {
    const filePath = path.join(dirPath, filename + '.num')

    await fs.promises.writeFile(filePath, content, 'utf8')

    return true
  } catch (error) {
    log.error('Error writing sync file:', error)
    throw error
  }
})

ipcMain.handle('deleteSyncFile', async (event, dirPath, filename) => {
  try {
    const filePath = path.join(dirPath, filename + '.num')

    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath)
    }

    return true
  } catch (error) {
    log.error('Error deleting sync file:', error)
    throw error
  }
})

ipcMain.handle('renameSyncFile', async (event, dirPath, oldFilename, newFilename) => {
  try {
    const oldPath = path.join(dirPath, oldFilename + '.num')
    const newPath = path.join(dirPath, newFilename + '.num')

    if (fs.existsSync(oldPath)) {
      await fs.promises.rename(oldPath, newPath)
    }

    return true
  } catch (error) {
    log.error('Error renaming sync file:', error)
    throw error
  }
})

ipcMain.on('startWatchingSyncDir', (event, dirPath) => {
  if (syncWatcher) {
    syncWatcher.close()
    syncWatcher = null
  }

  if (!dirPath || !fs.existsSync(dirPath)) return

  try {
    let fsTimeout = null
    syncWatcher = fs.watch(dirPath, (eventType, filename) => {
      if (!fs.existsSync(dirPath)) {
        if (win && !win.isDestroyed()) {
          win.webContents.send('syncDirDeleted')
        }
        return
      }

      if (filename && filename.endsWith('.num')) {
        if (fsTimeout) return

        fsTimeout = setTimeout(() => {
          fsTimeout = null
        }, 100)

        if (win && !win.isDestroyed()) {
          win.webContents.send('syncDirChanged')
        }
      }
    })

    syncWatcher.on('error', (error) => {
      log.error('Sync watcher error:', error)
      if (!fs.existsSync(dirPath)) {
        if (win && !win.isDestroyed()) {
          win.webContents.send('syncDirDeleted')
        }
      }
    })
  } catch (error) {
    log.error('Error starting sync watcher:', error)
  }
})

ipcMain.on('stopWatchingSyncDir', () => {
  if (syncWatcher) {
    syncWatcher.close()
    syncWatcher = null
  }
})

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
 * @param {Event} event The event object.
 * @param {number} index The line index.
 * @param {boolean} isEmpty Is the input empty.
 * @param {boolean} isSelection Is there a selection.
 * @param {boolean} isMultiLine Is it a multi-line selection.
 * @param {boolean} hasAnswer Does the line have an answer.
 * @returns {Array} The common context menu template.
 */
const commonContext = (event, index, isEmpty, isSelection, isMultiLine, hasAnswer) => {
  const context = [
    {
      label: 'Copy line',
      enabled: hasAnswer && !isMultiLine,
      click: () => event.sender.send('copyLine', index, false)
    },
    {
      label: 'Copy answer',
      enabled: hasAnswer && !isMultiLine,
      click: () => event.sender.send('copyAnswer', index, false)
    },
    {
      label: 'Copy line with answer',
      enabled: hasAnswer && !isMultiLine,
      click: () => event.sender.send('copyLineWithAnswer', index, true)
    }
  ]

  return [
    ...context,
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
}

/**
 * Handles the input context menu event.
 *
 * @param {Electron.IpcMainEvent} event The IPC event object.
 * @param {number} index The index of the line.
 * @param {boolean} isEmpty Is the input is empty.
 * @param {boolean} isLine Indicates if the current line is not empty.
 * @param {boolean} isSelection Indicates if there is a selection.
 * @param {boolean} isMultiLine Indicates if the selection spans multiple lines.
 * @param {boolean} hasAnswer Indicates if the line has an answer.
 */
ipcMain.on('inputContextMenu', (event, index, isEmpty, isLine, isSelection, isMultiLine, hasAnswer) => {
  const contextMenuTemplate = [
    ...contextHeader(index, isMultiLine, hasAnswer),
    ...commonContext(event, index, isEmpty, isSelection, isMultiLine, hasAnswer)
  ]
  const contextMenu = Menu.buildFromTemplate(contextMenuTemplate)

  contextMenu.popup()
})

/**
 * Handles the output context menu event.
 *
 * @param {Electron.IpcMainEvent} event The IPC event object.
 * @param {number} index The index of the line.
 * @param {boolean} isEmpty Indicates if the input is empty.
 * @param {boolean} hasAnswer Indicates if the line has an answer.
 */
ipcMain.on('outputContextMenu', (event, index, isEmpty, hasAnswer) => {
  const contextMenuTemplate = [
    ...contextHeader(index, false, hasAnswer),
    ...commonContext(event, index, isEmpty, false, false, hasAnswer)
  ]
  const contextMenu = Menu.buildFromTemplate(contextMenuTemplate)

  contextMenu.popup()
})

ipcMain.on('textboxContextMenu', () =>
  Menu.buildFromTemplate([{ role: 'cut' }, { role: 'copy' }, { role: 'paste' }]).popup()
)

ipcMain.on('checkUpdate', () => {
  autoUpdater.checkForUpdates()
})

ipcMain.on('updateApp', () => setImmediate(() => autoUpdater.quitAndInstall(true, true)))

autoUpdater.on('checking-for-update', () => win.webContents.send('updateStatus', 'checking'))
autoUpdater.on('update-available', (info) => win.webContents.send('updateStatus', 'available', info.version))
autoUpdater.on('update-not-available', () => win.webContents.send('updateStatus', 'notAvailable'))
autoUpdater.on('download-progress', (progress) => win.webContents.send('updateStatus', 'downloading', null, progress))
autoUpdater.on('update-downloaded', (info) => {
  win.webContents.send('updateStatus', 'downloaded', info.version)

  if (Notification.isSupported()) {
    const notification = new Notification({
      title: 'A new update is ready to install',
      body: `${app.getName()} version ${info.version} has been downloaded and is ready to install.`
    })

    notification.on('click', () => {
      if (!win) return

      if (win.isMinimized()) win.restore()
      win.show()
      win.focus()
      win.webContents.send('showAbout')
    })

    notification.show()
  }
})
autoUpdater.on('error', () => win.webContents.send('updateStatus', 'error'))

const menuTemplate = [
  {
    label: app.name,
    submenu: [
      { role: 'about' },
      { type: 'separator' },
      { role: 'hide' },
      { role: 'hideothers' },
      { role: 'unhide' },
      { type: 'separator' },
      { role: 'quit' }
    ]
  },
  {
    label: 'File',
    submenu: [
      {
        label: 'Import Page',
        click: () => {
          win.webContents.send('importPage')
        }
      },
      {
        label: 'Export Page',
        click: () => {
          win.webContents.send('exportPage')
        }
      },
      { type: 'separator' },
      {
        label: 'Print',
        click: () => {
          win.webContents.send('print')
        }
      }
    ]
  },
  {
    label: 'Edit',
    submenu: [{ role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }]
  },
  {
    label: 'View',
    submenu: [
      { role: 'reload' },
      { type: 'separator' },
      { role: 'resetzoom' },
      { role: 'zoomin' },
      { role: 'zoomout' },
      { type: 'separator' }
    ]
  },
  {
    label: 'Window',
    submenu: [
      { role: 'minimize' },
      { role: 'zoom' },
      { role: 'togglefullscreen' },
      {
        label: 'Reset Size',
        click: () => {
          resetSize()
        }
      },
      { type: 'separator' },
      { role: 'front' },
      { type: 'separator' },
      { role: 'window' }
    ]
  },
  {
    role: 'help',
    submenu: [
      {
        label: 'Learn More',
        click: () => shell.openExternal('https://github.com/bornova/numara-calculator')
      },
      { type: 'separator' },
      { role: 'toggleDevTools' }
    ]
  }
]

Menu.setApplicationMenu(isMac || process.platform === 'linux' ? Menu.buildFromTemplate(menuTemplate) : null)
