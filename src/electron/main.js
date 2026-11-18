import { app, dialog, powerMonitor } from 'electron'
import log from 'electron-log'
import * as path from 'node:path'

import { config } from './config.js'
import {
  getNumFilePath,
  promptImportPage,
  queueOrOpenFile,
  resetRendererReady,
  setupFileHandlers
} from './fileHandlers.js'
import { setupApplicationMenu, setupContextMenus, updateTrayState } from './menu.js'
import { setupSyncHandlers } from './syncWatcher.js'
import { setupAutoUpdater } from './updater.js'
import {
  createAppWindow,
  getWindow,
  hideOrMinimizeWindow,
  isAppQuitting,
  resetSize,
  setAppQuitting,
  setupWindowHandlers,
  showAndFocusWindow
} from './window.js'

if (!app.isPackaged) {
  app.setPath('userData', path.join(app.getPath('appData'), 'Numara-Dev'))
}

if (!app.requestSingleInstanceLock()) {
  app.exit(0)
}

log.initialize({ spyRendererConsole: true })
log.errorHandler.startCatching()
log.eventLogger.startLogging()
log.info(`Starting Numara... [v${app.getVersion()}] ${app.isPackaged ? '' : '(Dev)'}`)

// Check for startup `.num` file argument on Windows/Linux
const startFile = getNumFilePath(process.argv)

if (startFile) {
  queueOrOpenFile(startFile)
}

app.setAppUserModelId('com.numara.app')
app.userAgentFallback = app.userAgentFallback.replace(/\s+(?:Electron|numara)\/\S+/gi, '')

const openAppWindow = () => createAppWindow({ onWindowCreated: updateTrayState, onWindowClosed: resetRendererReady })

const focusOrCreateWindow = () => {
  if (getWindow()) {
    showAndFocusWindow()
  } else if (app.isReady()) {
    openAppWindow()
  }
}

// macOS open-file event handling
app.on('open-file', (event, filePath) => {
  event.preventDefault()
  focusOrCreateWindow()
  queueOrOpenFile(filePath)
})

app.whenReady().then(() => {
  powerMonitor.on('shutdown', () => setAppQuitting(true))
  openAppWindow()
})

app.on('before-quit', (event) => {
  if (app.isReady() && config.get('showTray') && !isAppQuitting()) {
    event.preventDefault()

    const win = showAndFocusWindow()

    const choice = dialog.showMessageBoxSync(win, {
      type: 'question',
      buttons: ['Cancel', 'Quit'],
      defaultId: 0,
      cancelId: 0,
      title: 'Quit Numara',
      message: 'Are you sure you want to quit Numara?',
      detail: 'This will close the calculator and remove it from the menu bar.'
    })

    if (choice === 1) {
      setAppQuitting(true)
      app.quit()
    }
  } else {
    setAppQuitting(true)
  }
})

app.on('activate', focusOrCreateWindow)

app.on('second-instance', (event, commandLine) => {
  const win = getWindow()
  const fileArg = getNumFilePath(commandLine)

  if (!win && !app.isReady()) return

  if (win) {
    if (!app.isPackaged && !fileArg) {
      showAndFocusWindow()
      win.reload()
      return
    }

    if (win.isFocused() && !fileArg) {
      hideOrMinimizeWindow()
      return
    }

    showAndFocusWindow()
  } else {
    openAppWindow()
  }

  if (fileArg) {
    queueOrOpenFile(fileArg)
  }
})

setupWindowHandlers({ onTrayChanged: updateTrayState })
setupFileHandlers()
setupSyncHandlers()
setupContextMenus()
setupAutoUpdater()
setupApplicationMenu({ promptImportPage, resetSize })
