import { app, dialog } from 'electron'
import log from 'electron-log'
import * as path from 'node:path'

import { config } from './config.js'
import { getNumFilePath, promptImportPage, queueOrOpenFile, setupFileHandlers } from './fileHandlers.js'
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
app.userAgentFallback = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${process.versions.chrome || '130.0.0.0'} Safari/537.36`

// macOS open-file event handling
app.on('open-file', (event, filePath) => {
  event.preventDefault()
  queueOrOpenFile(filePath)
})

app.whenReady().then(() => {
  createAppWindow({ onWindowCreated: updateTrayState })
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

app.on('activate', () => {
  if (getWindow()) {
    showAndFocusWindow()
  } else if (app.isReady()) {
    createAppWindow({ onWindowCreated: updateTrayState })
  }
})

app.on('second-instance', (event, commandLine) => {
  const win = getWindow()
  const winValid = win && !win.isDestroyed()

  if (winValid) {
    const fileArg = getNumFilePath(commandLine)

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

    if (fileArg) {
      queueOrOpenFile(fileArg)
    }
  }
})

setupWindowHandlers({ onTrayChanged: updateTrayState })
setupFileHandlers()
setupSyncHandlers()
setupContextMenus()
setupAutoUpdater()
setupApplicationMenu({ promptImportPage, resetSize })
