const { contextBridge, ipcRenderer } = require('electron')

const addIpcListener = (channel, wrapper) => {
  ipcRenderer.on(channel, wrapper)
  return () => ipcRenderer.removeListener(channel, wrapper)
}

contextBridge.exposeInMainWorld('numara', {
  isMac: process.platform === 'darwin',
  isWindows: process.platform === 'win32',
  isLinux: process.platform === 'linux',

  versions: {
    chrome: () => process.versions.chrome,
    electron: () => process.versions.electron,
    node: () => process.versions.node,
    v8: () => process.versions.v8
  },

  // App theme
  isDark: () => ipcRenderer.invoke('isDark'),
  setTheme: (theme) => ipcRenderer.send('setTheme', theme),
  themeUpdate: (callback) => addIpcListener('themeUpdate', (event, isDark) => callback(isDark)),

  // Window controls
  isMaximized: () => ipcRenderer.invoke('isMaximized'),
  isResized: () => ipcRenderer.invoke('isResized'),
  resetSize: (appWrapperWidth, appWrapperHeight, sidebarWidth) =>
    ipcRenderer.send('resetSize', appWrapperWidth, appWrapperHeight, sidebarWidth),
  setOnTop: (callback) => ipcRenderer.send('setOnTop', callback),
  setTray: (bool) => ipcRenderer.send('setTray', bool),
  setOpenAtLogin: (bool) => ipcRenderer.send('setOpenAtLogin', bool),
  transControls: (isTrans) => ipcRenderer.send('transControls', isTrans),
  closeWindow: () => ipcRenderer.send('close-window'),

  // Import
  rendererReady: () => ipcRenderer.send('renderer-ready'),
  importPage: () => ipcRenderer.send('importPage'),
  pageImported: (callback) => addIpcListener('pageImported', (event, data, msg, name) => callback(data, msg, name)),
  importDataError: (callback) => addIpcListener('importDataError', (event, error) => callback(error)),

  //Export
  exportPage: (pageName, pageData) => ipcRenderer.send('exportPage', pageName, pageData),
  pageExported: (callback) => addIpcListener('pageExported', (event, data) => callback(data)),
  exportDataError: (callback) => addIpcListener('exportDataError', (event, error) => callback(error)),

  // Print
  print: (callback) => addIpcListener('print', () => callback()),

  // Context menus
  inputContextMenu: (index, isEmpty, isLine, isSelection, isMultiLine, hasAnswer) =>
    ipcRenderer.send('inputContextMenu', index, isEmpty, isLine, isSelection, isMultiLine, hasAnswer),
  outputContextMenu: (index, isEmpty, hasAnswer) => ipcRenderer.send('outputContextMenu', index, isEmpty, hasAnswer),
  textboxContextMenu: () => ipcRenderer.send('textboxContextMenu'),

  copyAll: (callback) => addIpcListener('copyAll', () => callback()),
  copyAllLines: (callback) => addIpcListener('copyAllLines', () => callback()),
  copyAllAnswers: (callback) => addIpcListener('copyAllAnswers', () => callback()),
  copyLine: (callback) => addIpcListener('copyLine', (event, index) => callback(index)),
  copyAnswer: (callback) => addIpcListener('copyAnswer', (event, index, withLines) => callback(index, withLines)),
  copyLineWithAnswer: (callback) => addIpcListener('copyLineWithAnswer', (event, index) => callback(index, true)),

  // Update app
  updateApp: () => ipcRenderer.send('updateApp'),
  checkUpdate: () => ipcRenderer.send('checkUpdate'),
  updateStatus: (callback) =>
    addIpcListener('updateStatus', (event, status, version, progress) => callback(status, version, progress)),
  showAbout: (callback) => addIpcListener('showAbout', (event, data) => callback(data)),

  // Directory Sync
  checkSyncDirectory: (dirPath) => ipcRenderer.invoke('checkSyncDirectory', dirPath),
  selectSyncDirectory: () => ipcRenderer.invoke('selectSyncDirectory'),
  readSyncDirectory: (dirPath) => ipcRenderer.invoke('readSyncDirectory', dirPath),
  writeSyncFile: (dirPath, filename, content) => ipcRenderer.invoke('writeSyncFile', dirPath, filename, content),
  deleteSyncFile: (dirPath, filename) => ipcRenderer.invoke('deleteSyncFile', dirPath, filename),
  renameSyncFile: (dirPath, oldFilename, newFilename) =>
    ipcRenderer.invoke('renameSyncFile', dirPath, oldFilename, newFilename),
  startWatchingSyncDir: (dirPath) => ipcRenderer.send('startWatchingSyncDir', dirPath),
  stopWatchingSyncDir: () => ipcRenderer.send('stopWatchingSyncDir'),
  onSyncDirChanged: (callback) => addIpcListener('syncDirChanged', () => callback()),
  onSyncDirDeleted: (callback) => addIpcListener('syncDirDeleted', () => callback()),
  syncDirContextMenu: (dirPath) => ipcRenderer.send('syncDirContextMenu', dirPath),

  // Open path in file explorer
  openPath: (path) => ipcRenderer.send('openPath', path),

  // Developer Tools
  openDevTools: () => ipcRenderer.send('openDevTools'),
  openLogs: () => ipcRenderer.send('openLogs'),

  // Reset
  resetApp: () => ipcRenderer.send('resetApp')
})
