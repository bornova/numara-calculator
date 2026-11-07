import { app, BrowserWindow, ipcMain, nativeTheme, screen, session, shell } from 'electron'
import log from 'electron-log'
import * as path from 'node:path'

import { config, DARK_COLOR, getThemeColor, isMac, isWin, LIGHT_COLOR, schema, TRANS_COLOR } from './config.js'

let win = null
let isQuitting = false
let isOverlayTrans = false

/**
 * Returns the active BrowserWindow instance if available.
 * @returns {BrowserWindow|null}
 */
export function getWindow() {
  return win
}

/**
 * Returns whether the application is currently in the process of quitting.
 * @returns {boolean}
 */
export function isAppQuitting() {
  return isQuitting
}

/**
 * Updates the application quitting flag.
 * @param {boolean} value Whether the app is quitting.
 */
export function setAppQuitting(value) {
  isQuitting = Boolean(value)
}

/**
 * Checks whether a saved window position is visible on at least one connected display.
 * @param {number[]} pos Saved `[x, y]` coordinates.
 * @returns {boolean}
 */
function isPositionOnScreen(pos) {
  if (!Array.isArray(pos) || pos.length !== 2) return false

  const [x, y] = pos

  if (!Number.isFinite(x) || !Number.isFinite(y) || x <= -10000 || y <= -10000) return false

  const displays = screen.getAllDisplays()

  return displays.some(({ workArea }) => {
    return (
      x >= workArea.x - 100 && x < workArea.x + workArea.width && y >= workArea.y && y < workArea.y + workArea.height
    )
  })
}

/**
 * Sets the title bar overlay configuration based on the transparency state.
 * @param {boolean} [isTrans=false] Determines if the title bar should be transparent.
 */
function setTitleBarOverlay(isTrans = isOverlayTrans) {
  isOverlayTrans = Boolean(isTrans)

  if (!isWin || !win || win.isDestroyed()) return

  const titleBarConfig = {
    color: isTrans ? TRANS_COLOR : getThemeColor(),
    symbolColor: getThemeColor() === DARK_COLOR ? LIGHT_COLOR : DARK_COLOR
  }

  win.setTitleBarOverlay(titleBarConfig)
}

/**
 * Reset window size to default.
 * @param {number} [appWrapperWidth=schema.appWidth.default] Target width of the app wrapper.
 * @param {number} [appWrapperHeight=schema.appHeight.default] Target height of the app wrapper.
 * @param {number} [pageListWidth=0] Current width of the docked page list.
 */
export function resetSize(
  appWrapperWidth = schema.appWidth.default,
  appWrapperHeight = schema.appHeight.default,
  pageListWidth = 0
) {
  if (!win || win.isDestroyed()) return

  if (win.isFullScreen()) {
    win.setFullScreen(false)
  }

  if (win.isMaximized()) {
    win.unmaximize()
  }

  const [minWidth, minHeight] = win.getMinimumSize()
  const width = Math.round(Number(appWrapperWidth) || schema.appWidth.default)
  const height = Math.round(Number(appWrapperHeight) || schema.appHeight.default)
  const pageList = Math.max(0, Math.round(Number(pageListWidth) || 0))

  win.setContentSize(Math.max(minWidth, width + pageList), Math.max(minHeight, height))
}

/**
 * Create the main application window.
 * @param {object} [options]
 * @param {function} [options.onWindowCreated] Callback invoked after window creation (e.g. to update tray state).
 */
export function createAppWindow({ onWindowCreated } = {}) {
  win = new BrowserWindow({
    backgroundColor: getThemeColor(),
    frame: false,
    height: parseInt(config.get('appHeight')) || schema.appHeight.default,
    width: parseInt(config.get('appWidth')) || schema.appWidth.default,
    minHeight: 390,
    minWidth: 450,
    show: false,
    titleBarStyle: isMac ? 'hiddenInset' : 'hidden',
    titleBarOverlay: true,
    webPreferences: {
      preload: path.join(import.meta.dirname, 'preload.cjs'),
      spellcheck: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  win.loadFile('build/index.html')

  let initialLoadComplete = false
  let normalBounds = win.getBounds()

  const updateNormalBounds = () => {
    if (!win || win.isDestroyed() || win.isMaximized() || win.isMinimized()) return

    try {
      normalBounds = win.getBounds()
    } catch {
      // Ignore
    }
  }

  win.on('resize', updateNormalBounds)
  win.on('move', updateNormalBounds)

  win.webContents.on('did-finish-load', () => {
    setTitleBarOverlay(isOverlayTrans)

    if (initialLoadComplete) return

    initialLoadComplete = true

    const pos = config.get('position')

    if (isPositionOnScreen(pos)) {
      win.setPosition(pos[0], pos[1])
      updateNormalBounds()
    }

    if (config.get('fullSize') && isWin) win.maximize()
    if (!app.isPackaged) win.webContents.openDevTools()

    const showTray = config.get('showTray')
    const loginItemSettings = app.getLoginItemSettings()
    const wasOpenedAtLogin =
      loginItemSettings.wasOpenedAsHidden || loginItemSettings.wasOpenedAtLogin || process.argv.includes('--hidden')
    const startHidden = showTray && wasOpenedAtLogin

    if (!startHidden) {
      win.show()
    } else if (isMac) {
      app.dock.hide()
    }
  })

  win.webContents.on('will-navigate', (event) => {
    event.preventDefault()
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsedUrl = new URL(url)

      if (['http:', 'https:'].includes(parsedUrl.protocol)) {
        shell.openExternal(url)
      }
    } catch {
      // Ignore invalid URLs
    }
    return { action: 'deny' }
  })

  if (app.isPackaged) {
    win.webContents.on('before-input-event', (event, input) => {
      if (
        input.type === 'keyDown' &&
        (input.key === 'F5' || ((input.control || input.meta) && !input.alt && input.key.toLowerCase() === 'r'))
      ) {
        event.preventDefault()
      }
    })
  }

  win.on('close', (e) => {
    const isMax = win.isMaximized()
    const isMin = win.isMinimized()

    if (!isMin) {
      config.set('fullSize', isMax)
    }

    if (!isMax && !isMin) {
      updateNormalBounds()
    }

    if (normalBounds) {
      if (isPositionOnScreen([normalBounds.x, normalBounds.y])) {
        config.set('position', [normalBounds.x, normalBounds.y])
      }

      if (normalBounds.width >= 450 && normalBounds.height >= 390) {
        config.set('appWidth', normalBounds.width)
        config.set('appHeight', normalBounds.height)
      }
    }

    if (config.get('showTray') && !isQuitting) {
      e.preventDefault()
      win.hide()
    }
  })

  if (isMac) {
    win.on('show', () => {
      app.dock.show()
    })

    win.on('hide', () => {
      app.dock.hide()
    })
  }

  win.on('closed', () => {
    win = null
  })

  if (typeof onWindowCreated === 'function') {
    onWindowCreated()
  }
}

/**
 * Registers IPC handlers and native theme listeners for window management.
 * @param {object} [options]
 * @param {function} [options.onTrayChanged] Callback invoked when the showTray setting is updated.
 */
export function setupWindowHandlers({ onTrayChanged } = {}) {
  nativeTheme.on('updated', () => {
    if (win && !win.isDestroyed() && win.webContents) {
      win.webContents.send('themeUpdate', nativeTheme.shouldUseDarkColors)
      setTitleBarOverlay(isOverlayTrans)
    }
  })

  ipcMain.handle('isDark', () => nativeTheme.shouldUseDarkColors)

  ipcMain.on('setTheme', (event, mode) => {
    config.set('theme', mode)
    setTitleBarOverlay(isOverlayTrans)
  })

  ipcMain.on('transControls', (event, isTrans) => setTitleBarOverlay(isTrans))

  ipcMain.on('setOnTop', (event, bool) => {
    if (win && !win.isDestroyed()) {
      win.setAlwaysOnTop(bool)
    }
  })

  ipcMain.on('close-window', () => {
    if (win && !win.isDestroyed()) {
      if (config.get('showTray')) {
        win.hide()
      } else {
        win.minimize()
      }
    }
  })

  ipcMain.on('setTray', (event, bool) => {
    config.set('showTray', bool)

    if (typeof onTrayChanged === 'function') {
      onTrayChanged()
    }
  })

  ipcMain.on('setOpenAtLogin', (event, bool) => {
    if (!app.isPackaged) return

    const openAtLogin = Boolean(bool)

    if (app.getLoginItemSettings().openAtLogin === openAtLogin) return

    app.setLoginItemSettings({
      openAtLogin,
      openAsHidden: true,
      args: ['--hidden']
    })
  })

  ipcMain.handle('isMaximized', () => (win && !win.isDestroyed() ? win.isMaximized() : false))

  ipcMain.handle('resetSize', (event, appWrapperWidth, appWrapperHeight, pageListWidth) => {
    resetSize(appWrapperWidth, appWrapperHeight, pageListWidth)
  })

  ipcMain.on('resetApp', () => {
    session.defaultSession
      .clearStorageData()
      .catch((error) => log.error('Failed to clear session storage data on reset:', error))
      .finally(() => {
        config.clear()
        app.relaunch()
        app.exit()
      })
  })

  ipcMain.on('openDevTools', () => {
    if (win && !win.isDestroyed() && win.webContents) {
      win.webContents.openDevTools()
    }
  })

  ipcMain.on('openLogs', () => {
    shell.openPath(path.join(app.getPath('logs'), 'main.log'))
  })
}
