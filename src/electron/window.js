import { app, BrowserWindow, ipcMain, nativeTheme, screen, session, shell } from 'electron'
import log from 'electron-log'
import * as path from 'node:path'

import { areBoundsEqual, isBoundsOnScreen, MIN_WINDOW_HEIGHT, MIN_WINDOW_WIDTH, resolveWindowBounds } from './bounds.js'
import { config, DARK_COLOR, getThemeColor, isMac, isWin, LIGHT_COLOR, schema, TRANS_COLOR } from './config.js'

let win = null
let normalBounds = null
let isQuitting = false
let isOverlayTrans = false
let displayListenersBound = false

const defaultSizeOptions = {
  defaultWidth: schema.appWidth.default,
  defaultHeight: schema.appHeight.default,
  minWidth: MIN_WINDOW_WIDTH,
  minHeight: MIN_WINDOW_HEIGHT
}

/**
 * Returns the active BrowserWindow instance if available.
 * @returns {BrowserWindow|null}
 */
export function getWindow() {
  return win
}

/**
 * Sends an IPC message to the active renderer window if it exists and is not destroyed.
 * @param {string} channel IPC channel name.
 * @param {...any} args Payload arguments.
 */
export function sendToWindow(channel, ...args) {
  if (win && !win.isDestroyed() && win.webContents) {
    win.webContents.send(channel, ...args)
  }
}

/**
 * Hides the window when tray mode is enabled, or minimizes it otherwise.
 */
export function hideOrMinimizeWindow() {
  if (!win || win.isDestroyed()) return

  if (config.get('showTray')) {
    win.hide()
  } else {
    win.minimize()
  }
}

/**
 * Opens the Electron main process log file in the system viewer.
 */
export function openMainLog() {
  shell.openPath(path.join(app.getPath('logs'), 'main.log'))
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
 * Records the current unmaximized, unminimized, non-fullscreen window bounds.
 */
function updateNormalBounds() {
  if (!win || win.isDestroyed() || win.isMaximized() || win.isMinimized() || win.isFullScreen()) return

  try {
    normalBounds = win.getBounds()
  } catch {
    // Ignore
  }
}

/**
 * Registers display change listeners once the Electron app is ready so monitor changes relocate off-screen windows.
 */
function bindDisplayListeners() {
  if (displayListenersBound) return

  displayListenersBound = true

  let displayTimer = null
  const scheduleEnsureOnScreen = () => {
    clearTimeout(displayTimer)
    displayTimer = setTimeout(() => {
      ensureWindowOnScreen()
    }, 150)
  }

  screen.on('display-added', scheduleEnsureOnScreen)
  screen.on('display-removed', scheduleEnsureOnScreen)
  screen.on('display-metrics-changed', scheduleEnsureOnScreen)
}

/**
 * Ensures the active window (and tracked normalBounds) remains visible on a connected display.
 */
function ensureWindowOnScreen() {
  if (!win || win.isDestroyed() || win.isFullScreen() || win.isMinimized()) return

  const displays = screen.getAllDisplays()
  const primaryDisplay = screen.getPrimaryDisplay()

  if (win.isMaximized()) {
    if (normalBounds) {
      normalBounds = resolveWindowBounds(normalBounds, displays, primaryDisplay, defaultSizeOptions)
    }

    if (!isBoundsOnScreen(win.getBounds(), displays)) {
      win.unmaximize()

      const targetBounds = resolveWindowBounds(
        normalBounds || win.getBounds(),
        displays,
        primaryDisplay,
        defaultSizeOptions
      )

      if (Number.isFinite(targetBounds.x) && Number.isFinite(targetBounds.y)) {
        win.setBounds(targetBounds)
        normalBounds = targetBounds
      }

      win.maximize()
    }

    return
  }

  const currentBounds = win.getBounds()
  const nextBounds = resolveWindowBounds(currentBounds, displays, primaryDisplay, defaultSizeOptions)

  if (Number.isFinite(nextBounds.x) && Number.isFinite(nextBounds.y) && !areBoundsEqual(currentBounds, nextBounds)) {
    win.setBounds(nextBounds)
  }

  updateNormalBounds()
}

/**
 * Restores (if minimized), ensures on-screen bounds, shows, and focuses the main window.
 * @returns {BrowserWindow|null}
 */
export function showAndFocusWindow() {
  if (!win || win.isDestroyed()) return null

  if (win.isMinimized()) {
    win.restore()
  }

  ensureWindowOnScreen()
  win.show()
  win.focus()

  return win
}

const TITLEBAR_OVERLAY_HEIGHT = 38

/**
 * Builds the native window controls overlay configuration.
 * @param {boolean} [isTrans=isOverlayTrans] Whether the title bar background is transparent.
 * @returns {{color: string, symbolColor: string, height: number}}
 */
function getTitleBarOverlayConfig(isTrans = isOverlayTrans) {
  return {
    color: isTrans ? TRANS_COLOR : getThemeColor(),
    symbolColor: getThemeColor() === DARK_COLOR ? LIGHT_COLOR : DARK_COLOR,
    height: TITLEBAR_OVERLAY_HEIGHT
  }
}

/**
 * Sets the title bar overlay configuration based on the transparency state.
 * @param {boolean} [isTrans=false] Determines if the title bar should be transparent.
 */
function setTitleBarOverlay(isTrans = isOverlayTrans) {
  isOverlayTrans = Boolean(isTrans)

  if (isMac || !win || win.isDestroyed()) return

  try {
    win.setTitleBarOverlay(getTitleBarOverlayConfig(isTrans))
  } catch {
    // Ignore on platforms/WMs without titleBarOverlay support
  }
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
  ensureWindowOnScreen()
}

/**
 * Create the main application window.
 * @param {object} [options]
 * @param {function} [options.onWindowCreated] Callback invoked after window creation (e.g. to update tray state).
 */
export function createAppWindow({ onWindowCreated } = {}) {
  bindDisplayListeners()

  const initialBounds = resolveWindowBounds(
    {
      position: config.get('position'),
      width: parseInt(config.get('appWidth')),
      height: parseInt(config.get('appHeight'))
    },
    screen.getAllDisplays(),
    screen.getPrimaryDisplay(),
    defaultSizeOptions
  )
  const hasInitialPos = Number.isFinite(initialBounds.x) && Number.isFinite(initialBounds.y)

  win = new BrowserWindow({
    ...(hasInitialPos ? { x: initialBounds.x, y: initialBounds.y } : {}),
    backgroundColor: getThemeColor(),
    frame: false,
    height: initialBounds.height,
    width: initialBounds.width,
    minHeight: MIN_WINDOW_HEIGHT,
    minWidth: MIN_WINDOW_WIDTH,
    show: false,
    titleBarStyle: isMac ? 'hiddenInset' : 'hidden',
    titleBarOverlay: isMac ? false : getTitleBarOverlayConfig(),
    webPreferences: {
      preload: path.join(import.meta.dirname, 'preload.cjs'),
      spellcheck: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  if (hasInitialPos && !areBoundsEqual(win.getBounds(), initialBounds)) {
    win.setBounds(initialBounds)
  }

  win.loadFile('build/index.html')

  let initialLoadComplete = false
  normalBounds = win.getBounds()

  win.on('resize', updateNormalBounds)
  win.on('move', updateNormalBounds)
  win.on('restore', ensureWindowOnScreen)
  win.on('unmaximize', ensureWindowOnScreen)

  win.webContents.on('did-finish-load', () => {
    setTitleBarOverlay(isOverlayTrans)

    if (initialLoadComplete) return

    initialLoadComplete = true

    ensureWindowOnScreen()

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
    const isFull = win.isFullScreen()

    if (!isMin) {
      config.set('fullSize', isMax)
    }

    if (!isMax && !isMin && !isFull) {
      updateNormalBounds()
    }

    if (normalBounds) {
      if (isBoundsOnScreen(normalBounds, screen.getAllDisplays())) {
        config.set('position', [Math.round(normalBounds.x) || 0, Math.round(normalBounds.y) || 0])
      }

      if (normalBounds.width >= MIN_WINDOW_WIDTH && normalBounds.height >= MIN_WINDOW_HEIGHT) {
        config.set('appWidth', Math.round(normalBounds.width))
        config.set('appHeight', Math.round(normalBounds.height))
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
    normalBounds = null
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
      sendToWindow('themeUpdate', nativeTheme.shouldUseDarkColors)
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

  ipcMain.on('close-window', hideOrMinimizeWindow)

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

  ipcMain.on('openLogs', openMainLog)
}
