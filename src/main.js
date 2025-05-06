import { app, BrowserWindow, dialog, globalShortcut, ipcMain, Menu, nativeTheme, session, shell } from 'electron'
import log from 'electron-log'
import Store from 'electron-store'
import updater from 'electron-updater'

import * as path from 'node:path'
import * as fs from 'node:fs'

process.env['ELECTRON_DISABLE_SECURITY_WARNINGS'] = 'true'

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
  theme: { type: 'string', default: 'system' }
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

const titleBarConfig = (isTrans) => ({
  color: isTrans ? TRANS_COLOR : getThemeColor(),
  symbolColor: getThemeColor() === DARK_COLOR ? LIGHT_COLOR : DARK_COLOR
})

const setTitleBarOverlay = () => {
  if (!isWin) return

  win.setTitleBarOverlay(titleBarConfig())
}

let win

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
    if (config.get('fullSize') && isWin) {
      win.maximize()
    }

    setTitleBarOverlay()

    if (config.get('position')) {
      win.setPosition(config.get('position')[0], config.get('position')[1])
    }

    if (isMac && !app.isPackaged) {
      win.webContents.openDevTools()
    }

    win.show()
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  win.on('close', () => {
    config.set('fullSize', win.isMaximized())
    config.set('position', win.getPosition())

    if (!win.isMaximized()) {
      const [width, height] = win.getSize()

      config.set('appWidth', width)
      config.set('appHeight', height)
    }
  })

  if (app.isPackaged) {
    win.on('focus', () => globalShortcut.registerAll(['CommandOrControl+R', 'F5'], () => {}))
    win.on('blur', () => globalShortcut.unregisterAll())
  }
}

app.setAppUserModelId(app.name)
app.whenReady().then(createAppWindow)
app.requestSingleInstanceLock() ? app.on('second-instance', () => win.focus()) : app.quit()

nativeTheme.on('updated', () => {
  win.webContents.send('themeUpdate', nativeTheme.shouldUseDarkColors)
  setTitleBarOverlay()
})

ipcMain.on('isDark', (event) => (event.returnValue = nativeTheme.shouldUseDarkColors))
ipcMain.on('setTheme', (event, mode) => {
  config.set('theme', mode)
  setTitleBarOverlay()
})
ipcMain.on('transControls', (event, isTrans) => setTitleBarOverlay(titleBarConfig(isTrans)))
ipcMain.on('setOnTop', (event, bool) => win.setAlwaysOnTop(bool))
ipcMain.on('isMaximized', (event) => (event.returnValue = win.isMaximized()))
ipcMain.on('isResized', (event) => {
  const [width, height] = win.getSize()
  event.returnValue = width !== schema.appWidth.default || height !== schema.appHeight.default
})
ipcMain.on('import', (event) => {
  const file = dialog.showOpenDialogSync(win, {
    filters: [{ name: 'Numara', extensions: ['numara'] }],
    properties: ['openFile'],
    title: 'Open Calculations'
  })

  if (file) {
    fs.readFile(file[0], 'utf8', (error, data) => {
      if (error) {
        event.sender.send('importDataError', error)
        return
      }

      event.sender.send('importData', data, 'Imported from: ' + file[0])
    })
  }
})
ipcMain.on('export', (event, fileName, content) => {
  const file = dialog.showSaveDialogSync(win, {
    defaultPath: fileName,
    filters: [{ name: 'Numara', extensions: ['numara'] }],
    title: 'Export Calculations'
  })

  if (file) {
    fs.writeFile(file, content, (error) => {
      if (error) {
        event.sender.send('exportDataError', error)
        return
      }

      event.sender.send('exportData', 'Exported to: ' + file)
    })
  }
})

/**
 * Reset window size to default.
 */
function resetSize() {
  win.setSize(schema.appWidth.default, schema.appHeight.default)
}

ipcMain.on('resetSize', resetSize)
ipcMain.on('resetApp', () => {
  session.defaultSession.clearStorageData().then(() => {
    config.clear()
    app.relaunch()
    app.exit()
  })
})
ipcMain.on('openDevTools', () => win.webContents.openDevTools())
ipcMain.on('openLogs', () => {
  shell.openPath(path.join(app.getPath('logs'), 'main.log'))
})

/**
 * Generate context menu header.
 * @param {number} index - The line index.
 * @param {boolean} isMultiLine - Is it a multi-line selection.
 * @param {boolean} hasAnswer - Does the line have an answer.
 * @returns {Array} - The context menu header template.
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
 * @param {Event} event - The event object.
 * @param {number} index - The line index.
 * @param {boolean} isEmpty - Is the input empty.
 * @param {boolean} isSelection - Is there a selection.
 * @param {boolean} isMultiLine - Is it a multi-line selection.
 * @param {boolean} hasAnswer - Does the line have an answer.
 * @returns {Array} - The common context menu template.
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
 * @param {Electron.IpcMainEvent} event - The IPC event object.
 * @param {number} index - The index of the line.
 * @param {boolean} isEmpty - Is the input is empty.
 * @param {boolean} isLine - Indicates if the current line is not empty.
 * @param {boolean} isSelection - Indicates if there is a selection.
 * @param {boolean} isMultiLine - Indicates if the selection spans multiple lines.
 * @param {boolean} hasAnswer - Indicates if the line has an answer.
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
 * @param {Electron.IpcMainEvent} event - The IPC event object.
 * @param {number} index - The index of the line.
 * @param {boolean} isEmpty - Indicates if the input is empty.
 * @param {boolean} hasAnswer - Indicates if the line has an answer.
 */
ipcMain.on('outputContextMenu', (event, index, isEmpty, hasAnswer) => {
  const contextMenuTemplate = [
    ...contextHeader(index, false, hasAnswer),
    ...commonContext(event, index, isEmpty, false, false, hasAnswer)
  ]

  const contextMenu = Menu.buildFromTemplate(contextMenuTemplate)

  contextMenu.popup()
})

ipcMain.on('textboxContextMenu', () => {
  const contextMenuTemplate = [{ role: 'cut' }, { role: 'copy' }, { role: 'paste' }]
  const contextMenu = Menu.buildFromTemplate(contextMenuTemplate)

  contextMenu.popup()
})

ipcMain.on('checkUpdate', () => {
  autoUpdater.checkForUpdatesAndNotify({
    title: 'A new update is ready to install',
    body: '{appName} version {version} has been downloaded and is ready to install.'
  })
})

ipcMain.on('updateApp', () => setImmediate(() => autoUpdater.quitAndInstall(true, true)))

autoUpdater.on('checking-for-update', () => win.webContents.send('updateStatus', 'checking'))
autoUpdater.on('update-available', (info) => win.webContents.send('updateStatus', 'available', info.version))
autoUpdater.on('update-not-available', () => win.webContents.send('updateStatus', 'notAvailable'))
autoUpdater.on('download-progress', (progress) => win.webContents.send('updateStatus', 'downloading', null, progress))
autoUpdater.on('update-downloaded', (info) => win.webContents.send('updateStatus', 'downloaded', info.version))
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
        label: 'Import',
        click: () => {
          win.webContents.send('import')
        }
      },
      {
        label: 'Export',
        click: () => {
          win.webContents.send('export')
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
