import { app, ipcMain, Notification } from 'electron'
import log from 'electron-log'
import updater from 'electron-updater'

import { sendToWindow, setAppQuitting, showAndFocusWindow } from './window.js'

const { autoUpdater } = updater

const sendUpdateStatus = (...args) => sendToWindow('updateStatus', ...args)

let isInstallingUpdate = false
let isUpdateInProgress = false
let downloadedVersion = null
let activeUpdateNotification = null

/**
 * Configures electron-updater and registers update IPC handlers and event listeners.
 */
export function setupAutoUpdater() {
  autoUpdater.autoInstallOnAppQuit = false
  autoUpdater.logger = log
  autoUpdater.logger.transports.file.level = 'info'

  ipcMain.on('checkUpdate', () => {
    if (!app.isPackaged) {
      sendUpdateStatus('notAvailable')
      return
    }

    if (downloadedVersion) {
      sendUpdateStatus('downloaded', downloadedVersion)
      return
    }

    if (isUpdateInProgress) return

    isUpdateInProgress = true
    autoUpdater.checkForUpdates().catch((err) => {
      isUpdateInProgress = false
      log.error('Failed to check for updates:', err)
    })
  })

  ipcMain.on('updateApp', () => {
    if (isInstallingUpdate) return

    isInstallingUpdate = true
    setAppQuitting(true)
    setImmediate(() => autoUpdater.quitAndInstall(true, true))
  })

  autoUpdater.on('checking-for-update', () => {
    isUpdateInProgress = true
    sendUpdateStatus('checking')
  })

  autoUpdater.on('update-available', (info) => {
    isUpdateInProgress = true
    sendUpdateStatus('available', info.version)
  })

  autoUpdater.on('update-not-available', () => {
    isUpdateInProgress = false
    sendUpdateStatus('notAvailable')
  })

  autoUpdater.on('download-progress', (progress) => {
    isUpdateInProgress = true
    sendUpdateStatus('downloading', null, progress)
  })

  autoUpdater.on('update-downloaded', (info) => {
    isUpdateInProgress = false
    downloadedVersion = info.version
    sendUpdateStatus('downloaded', info.version)

    if (Notification.isSupported()) {
      activeUpdateNotification = new Notification({
        title: 'A new update is ready to install',
        body: `${app.getName()} version ${info.version} has been downloaded and is ready to install.`
      })

      activeUpdateNotification.on('click', () => {
        const activeWin = showAndFocusWindow()

        if (activeWin?.webContents) {
          activeWin.webContents.send('showAbout')
        }
      })

      activeUpdateNotification.show()
    }
  })

  autoUpdater.on('error', () => {
    isUpdateInProgress = false
    isInstallingUpdate = false
    setAppQuitting(false)
    sendUpdateStatus('error')
  })
}
