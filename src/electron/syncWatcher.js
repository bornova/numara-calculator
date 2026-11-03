import { dialog, ipcMain } from 'electron'
import log from 'electron-log'
import * as fs from 'node:fs'
import * as path from 'node:path'

import { config } from './config.js'
import { getWindow } from './window.js'

let syncWatcher = null
let syncWatchTimeout = null

const TRANSIENT_FS_CODES = new Set(['EBUSY', 'EPERM', 'EACCES', 'UNKNOWN'])

/**
 * Retries an async filesystem operation on transient Windows/OneDrive file-lock errors.
 * @template T
 * @param {() => Promise<T>} fn Async filesystem operation.
 * @param {number} [retries=3] Number of attempts.
 * @returns {Promise<T>}
 */
async function withFsRetry(fn, retries = 3) {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      if (attempt === retries - 1 || !TRANSIENT_FS_CODES.has(error?.code)) {
        throw error
      }

      await new Promise((resolve) => setTimeout(resolve, 100 * (attempt + 1)))
    }
  }
}

/**
 * Validates that a directory path is an existing local directory.
 * @param {string} dirPath Directory path to check.
 * @returns {boolean}
 */
function isValidDirectory(dirPath) {
  try {
    return (
      typeof dirPath === 'string' &&
      dirPath.trim().length > 0 &&
      path.isAbsolute(dirPath) &&
      fs.existsSync(dirPath) &&
      fs.lstatSync(dirPath).isDirectory()
    )
  } catch {
    return false
  }
}

/**
 * Validates and resolves a sync directory, runs `fn(resolvedDir)`, and logs/rethrows any error.
 * @template T
 * @param {string} dirPath Sync directory path.
 * @param {string} label Action description for error logging.
 * @param {(resolvedDir: string) => Promise<T>} fn Operation to run with the resolved directory.
 * @returns {Promise<T>}
 */
async function withValidSyncDir(dirPath, label, fn) {
  try {
    if (!isValidDirectory(dirPath)) {
      throw new Error('Invalid sync directory')
    }

    return await fn(path.resolve(dirPath))
  } catch (error) {
    log.error(`Error ${label}:`, error)
    throw error
  }
}

/**
 * Sanitizes a page filename and ensures it does not traverse directories.
 * @param {string} filename Raw page filename (without `.num`).
 * @returns {string} Safe basename without `.num`.
 */
function getSafeSyncBasename(filename) {
  const base = path.basename(String(filename || '').trim()).replace(/\.num$/i, '')

  if (!base || base === '.' || base === '..') {
    throw new Error('Invalid sync file name')
  }

  return base
}

/**
 * Stops any active file watcher and pending debounce timeout on the sync directory.
 */
function stopSyncWatcher() {
  if (syncWatchTimeout) {
    clearTimeout(syncWatchTimeout)
    syncWatchTimeout = null
  }

  if (syncWatcher) {
    syncWatcher.close()
    syncWatcher = null
  }
}

/**
 * Registers IPC handlers for local directory synchronization and file watching.
 */
export function setupSyncHandlers() {
  ipcMain.handle('checkSyncDirectory', async (event, dirPath) => {
    const valid = isValidDirectory(dirPath)

    if (valid) {
      config.set('syncDir', path.resolve(dirPath))
    }

    return valid
  })

  ipcMain.handle('selectSyncDirectory', async () => {
    const win = getWindow()
    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory', 'createDirectory'],
      title: 'Select Local Sync Directory'
    })

    if (result.canceled || !result.filePaths[0]) return null

    const selectedDir = path.resolve(result.filePaths[0])

    config.set('syncDir', selectedDir)

    return selectedDir
  })

  ipcMain.handle('readSyncDirectory', (event, dirPath) =>
    withValidSyncDir(dirPath, 'reading sync directory', async (resolvedDir) => {
      const files = await fs.promises.readdir(resolvedDir)
      const numFiles = files.filter((f) => f.toLowerCase().endsWith('.num'))

      return Promise.all(
        numFiles.map(async (file) => {
          const filePath = path.join(resolvedDir, file)
          const content = await withFsRetry(() => fs.promises.readFile(filePath, 'utf8'))
          const name = file.slice(0, -4)

          return { name, content }
        })
      )
    })
  )

  ipcMain.handle('writeSyncFile', (event, dirPath, filename, content) =>
    withValidSyncDir(dirPath, 'writing sync file', async (resolvedDir) => {
      const base = getSafeSyncBasename(filename)
      const filePath = path.join(resolvedDir, base + '.num')

      await withFsRetry(() => fs.promises.writeFile(filePath, String(content ?? ''), 'utf8'))

      return true
    })
  )

  ipcMain.handle('deleteSyncFile', (event, dirPath, filename) =>
    withValidSyncDir(dirPath, 'deleting sync file', async (resolvedDir) => {
      const base = getSafeSyncBasename(filename)
      const filePath = path.join(resolvedDir, base + '.num')

      try {
        await withFsRetry(() => fs.promises.unlink(filePath))
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error
      }

      return true
    })
  )

  ipcMain.handle('renameSyncFile', (event, dirPath, oldFilename, newFilename) =>
    withValidSyncDir(dirPath, 'renaming sync file', async (resolvedDir) => {
      const oldBase = getSafeSyncBasename(oldFilename)
      const newBase = getSafeSyncBasename(newFilename)
      const oldPath = path.join(resolvedDir, oldBase + '.num')
      const newPath = path.join(resolvedDir, newBase + '.num')

      const pathExists = async (targetPath) => {
        try {
          await fs.promises.access(targetPath)
          return true
        } catch {
          return false
        }
      }

      if (oldPath.toLowerCase() !== newPath.toLowerCase() && (await pathExists(newPath))) {
        throw new Error(`Target sync file "${newBase}.num" already exists`)
      }

      if (await pathExists(oldPath)) {
        await withFsRetry(() => fs.promises.rename(oldPath, newPath))
      }

      return true
    })
  )

  ipcMain.on('startWatchingSyncDir', (event, dirPath) => {
    stopSyncWatcher()

    if (!isValidDirectory(dirPath)) return

    const resolvedDir = path.resolve(dirPath)

    try {
      syncWatcher = fs.watch(resolvedDir, (eventType, filename) => {
        const win = getWindow()

        if (!fs.existsSync(resolvedDir)) {
          if (win && !win.isDestroyed()) {
            win.webContents.send('syncDirDeleted')
          }

          return
        }

        if (filename && filename.toLowerCase().endsWith('.num')) {
          if (syncWatchTimeout) {
            clearTimeout(syncWatchTimeout)
          }

          syncWatchTimeout = setTimeout(() => {
            syncWatchTimeout = null
            const activeWin = getWindow()

            if (activeWin && !activeWin.isDestroyed()) {
              activeWin.webContents.send('syncDirChanged')
            }
          }, 100)
        }
      })

      syncWatcher.on('error', (error) => {
        log.error('Sync watcher error:', error)
        const win = getWindow()

        if (!fs.existsSync(resolvedDir)) {
          if (win && !win.isDestroyed()) {
            win.webContents.send('syncDirDeleted')
          }
        }
      })
    } catch (error) {
      log.error('Error starting sync watcher:', error)
    }
  })

  ipcMain.on('stopWatchingSyncDir', stopSyncWatcher)
}
