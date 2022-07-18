const { app, BrowserWindow, dialog, globalShortcut, ipcMain, Menu, nativeTheme, session, shell } = require('electron')
const autoUpdater = require('electron-updater').autoUpdater
const fs = require('fs')
const Store = require('electron-store')
const schema = {
  appHeight: {
    type: 'number',
    default: 480
  },
  appWidth: {
    type: 'number',
    default: 560
  },
  theme: {
    type: 'string',
    default: 'system'
  },
  fullSize: {
    type: 'boolean',
    default: false
  }
}
const dims = new Store({
  schema,
  fileExtension: '',
  clearInvalidConfig: true
})
const theme = dims.get('theme')
const light = '#ffffff'
const dark = '#1f1f1f'
const bg = theme === 'system' ? (nativeTheme.shouldUseDarkColors ? dark : light) : theme === 'dark' ? dark : light

let win

function appWindow() {
  win = new BrowserWindow({
    height: parseInt(dims.get('appHeight')),
    width: parseInt(dims.get('appWidth')),
    backgroundColor: bg,
    frame: false,
    hasShadow: true,
    minHeight: 420,
    minWidth: 420,
    paintWhenInitiallyHidden: false,
    show: false,
    titleBarStyle: 'hiddenInset',
    useContentSize: true,
    webPreferences: {
      contextIsolation: false,
      devTools: !app.isPackaged,
      nativeWindowOpen: true,
      nodeIntegration: true,
      spellcheck: false
    }
  })

  win.loadFile('build/index.html')

  win.on('close', () => {
    if (win.isMaximized()) {
      dims.set('fullSize', true)
    } else {
      dims.set('appWidth', win.getSize()[0])
      dims.set('appHeight', win.getSize()[1])
      dims.set('fullSize', false)
    }
  })

  win.on('maximize', () => {
    win.webContents.send('isMax', true)
  })

  win.on('unmaximize', () => {
    win.webContents.send('isMax', false)
  })

  win.webContents.on('did-finish-load', () => {
    if (dims.get('fullSize') & (process.platform === 'win32')) {
      win.webContents.send('fullscreen', true)
    }
    win.setHasShadow(true)
    win.show()
  })

  win.webContents.on('new-window', (event, url) => {
    event.preventDefault()
    shell.openExternal(url)
  })

  if (app.isPackaged) {
    win.on('focus', () => {
      globalShortcut.registerAll(['CommandOrControl+R', 'F5'], () => {})
    })

    win.on('blur', () => {
      globalShortcut.unregisterAll()
    })
  } else {
    win.webContents.openDevTools()
  }
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    win.focus()
  })
}

app.setAppUserModelId(app.name)
app.whenReady().then(appWindow)

autoUpdater.on('checking-for-update', () => {
  win.webContents.send('updateStatus', 'Checking for update...')
})

autoUpdater.on('update-available', () => {
  win.webContents.send('notifyUpdate')
})

autoUpdater.on('update-not-available', () => {
  win.webContents.send('updateStatus', app.name + ' is up to date.')
})

autoUpdater.on('error', () => {
  win.webContents.send('updateStatus', 'Error checking for update.')
})

autoUpdater.on('download-progress', (progress) => {
  win.webContents.send('updateStatus', 'Downloading latest version... (' + Math.round(progress.percent) + '%)')
})

autoUpdater.on('update-downloaded', () => {
  win.webContents.send('updateStatus', 'ready')
})

ipcMain.on('setOnTop', (event, bool) => {
  win.setAlwaysOnTop(bool)
})

ipcMain.on('close', () => {
  app.quit()
})

ipcMain.on('minimize', () => {
  win.minimize()
})

ipcMain.on('maximize', () => {
  win.maximize()
})

ipcMain.on('unmaximize', () => {
  win.unmaximize()
})

ipcMain.on('isMaximized', (event) => {
  event.returnValue = win.isMaximized()
})

ipcMain.on('isResized', (event) => {
  event.returnValue = win.getSize()[0] !== schema.appWidth.default || win.getSize()[1] !== schema.appHeight.default
})

ipcMain.on('resetSize', resetSize)

ipcMain.on('print', (event) => {
  win.webContents.print({}, (success) => {
    event.sender.send('printReply', success ? 'Sent to printer' : false)
  })
})

ipcMain.on('setTheme', (event, mode) => {
  dims.set('theme', mode)
})

ipcMain.on('isDark', (event) => {
  event.returnValue = nativeTheme.shouldUseDarkColors
})

ipcMain.on('updateApp', () => {
  setImmediate(() => {
    autoUpdater.quitAndInstall(true, true)
  })
})

ipcMain.on('checkUpdate', () => {
  if (app.isPackaged) {
    autoUpdater.checkForUpdatesAndNotify()
  }
})

ipcMain.on('resetApp', () => {
  session.defaultSession.clearStorageData().then(() => {
    dims.clear()
    app.relaunch()
    app.exit()
  })
})

ipcMain.on('export', (event, fileName, content) => {
  let file = dialog.showSaveDialogSync(win, {
    title: 'Save Calculations',
    defaultPath: fileName,
    filters: [{ name: 'Numara', extensions: ['numara'] }]
  })

  if (file) {
    fs.writeFile(file, content, (err) => {
      if (err) {
        event.sender.send('exportDataError', err)
        return
      }

      event.sender.send('exportData', 'Exported to: ' + file)
    })
  }
})

ipcMain.on('import', (event) => {
  let file = dialog.showOpenDialogSync(win, {
    title: 'Open Calculations',
    properties: ['openFile'],
    filters: [{ name: 'Numara', extensions: ['numara'] }]
  })

  if (file) {
    fs.readFile(file[0], 'utf8', (err, data) => {
      if (err) {
        event.sender.send('importDataError', err)
        return
      }

      event.sender.send('importData', data, 'Imported from: ' + file[0])
    })
  }
})

const contextHeader = (index, isMultiLine, hasAnswer) => {
  if (hasAnswer || index !== null) {
    return [
      { label: isMultiLine ? 'Multiple lines:' : `Line ${+index + 1}:`, enabled: false, click: () => {} },
      { type: 'separator' }
    ]
  } else {
    return [{ label: '', visible: false }]
  }
}

const commonContext = (event, index, isEmpty, isSelection, isMultiLine, hasAnswer) => {
  const context = isMultiLine
    ? [
        {
          label: 'Copy Selected Answers',
          enabled: true,
          click: () => {
            event.sender.send('copySelectedAnswers', false)
          }
        },
        {
          label: 'Copy Selected Lines with Answers',
          enabled: true,
          click: () => {
            event.sender.send('copySelectedLinesWithAnswers', true)
          }
        }
      ]
    : [
        {
          label: 'Copy Answer',
          enabled: hasAnswer,
          click: () => {
            event.sender.send('copyAnswer', index, false)
          }
        },
        {
          label: 'Copy Line with Answer',
          enabled: hasAnswer,
          click: () => {
            event.sender.send('copyLineWithAnswer', index, true)
          }
        }
      ]

  const devTools = app.isPackaged
    ? [{ label: '', visible: false }]
    : [{ type: 'separator' }, { role: 'toggleDevTools' }]

  return [
    ...context,
    { type: 'separator' },
    {
      label: 'Copy All Calculations',
      enabled: !isEmpty,
      click: () => {
        event.sender.send('copyAllCalculations')
      }
    },
    ...devTools
  ]
}

ipcMain.on('mainContextMenu', (event, index, isEmpty, isLine, isSelection, isMultiLine, hasAnswer) => {
  const contextMenuTemplate = [
    ...contextHeader(index, isMultiLine, hasAnswer),
    { label: isSelection ? 'Cut Selection' : isLine ? 'Cut Line' : 'Cut', role: 'cut', enabled: isLine || isSelection },
    {
      label: isSelection ? 'Copy Selection' : isLine ? 'Copy Line' : 'Copy',
      role: 'copy',
      enabled: isLine || isSelection
    },
    { role: 'paste' },
    { type: 'separator' },
    ...commonContext(event, index, isEmpty, isSelection, isMultiLine, hasAnswer)
  ]

  const contextMenu = Menu.buildFromTemplate(contextMenuTemplate)
  contextMenu.popup()
})

ipcMain.on('outputContextMenu', (event, index, isEmpty, hasAnswer) => {
  const contextMenuTemplate = [
    ...contextHeader(index, false, hasAnswer),
    ...commonContext(event, index, isEmpty, false, false, hasAnswer)
  ]
  const contextMenu = Menu.buildFromTemplate(contextMenuTemplate)
  contextMenu.popup()
})

ipcMain.on('altContextMenu', () => {
  const contextMenuTemplate = [{ role: 'cut' }, { role: 'copy' }, { role: 'paste' }]

  const contextMenu = Menu.buildFromTemplate(contextMenuTemplate)
  contextMenu.popup()
})

nativeTheme.on('updated', () => {
  win.webContents.send('themeUpdate', nativeTheme.shouldUseDarkColors)
})

function resetSize() {
  if (win) {
    win.setSize(schema.appWidth.default, schema.appHeight.default)
  }
}

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
    label: 'Edit',
    submenu: [
      { role: 'undo' },
      { role: 'redo' },
      { type: 'separator' },
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
      { role: 'selectAll' }
    ]
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
      { label: 'Reset Size', click: resetSize() },
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
        click: () => {
          shell.openExternal('https://github.com/bornova/numara-calculator')
        }
      }
    ]
  }
]

Menu.setApplicationMenu(
  process.platform === 'darwin' || process.platform === 'linux' ? Menu.buildFromTemplate(menuTemplate) : null
)
