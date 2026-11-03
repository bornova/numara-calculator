import { app, ipcMain, Notification } from 'electron'
import log from 'electron-log'
import updater from 'electron-updater'

import { getWindow, setAppQuitting } from './window.js'

const { autoUpdater } = updater

const sendUpdateStatus = (...args) => {
  const win = getWindow()

  if (win && !win.isDestroyed() && win.webContents) {
    win.webContents.send('updateStatus', ...args)
  }
}

/**
 * Configures electron-updater and registers update IPC handlers and event listeners.
 */
export function setupAutoUpdater() {
  autoUpdater.autoInstallOnAppQuit = false
  autoUpdater.logger = log
  autoUpdater.logger.transports.file.level = 'info'

  ipcMain.on('checkUpdate', () => {
    autoUpdater.checkForUpdates().catch((err) => log.error('Failed to check for updates:', err))
  })

  ipcMain.on('updateApp', () => {
    setAppQuitting(true)
    setImmediate(() => autoUpdater.quitAndInstall(true, true))
  })

  autoUpdater.on('checking-for-update', () => sendUpdateStatus('checking'))

  autoUpdater.on('update-available', (info) => sendUpdateStatus('available', info.version))

  autoUpdater.on('update-not-available', () => sendUpdateStatus('notAvailable'))

  autoUpdater.on('download-progress', (progress) => sendUpdateStatus('downloading', null, progress))

  autoUpdater.on('update-downloaded', (info) => {
    sendUpdateStatus('downloaded', info.version)

    if (Notification.isSupported()) {
      const notification = new Notification({
        title: 'A new update is ready to install',
        body: `${app.getName()} version ${info.version} has been downloaded and is ready to install.`
      })

      notification.on('click', () => {
        const activeWin = getWindow()

        if (!activeWin || activeWin.isDestroyed()) return

        if (activeWin.isMinimized()) activeWin.restore()

        activeWin.show()
        activeWin.focus()

        if (activeWin.webContents) activeWin.webContents.send('showAbout')
      })

      notification.show()
    }
  })

  autoUpdater.on('error', () => sendUpdateStatus('error'))
}
