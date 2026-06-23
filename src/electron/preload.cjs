const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('numara', {
  versions: {
    chrome: () => process.versions.chrome,
    electron: () => process.versions.electron,
    node: () => process.versions.node,
    v8: () => process.versions.v8
  },

  // App theme
  isDark: () => ipcRenderer.invoke('isDark'),
  setTheme: (theme) => ipcRenderer.send('setTheme', theme),
  themeUpdate: (callback) => ipcRenderer.on('themeUpdate', (event, isDark) => callback(isDark)),

  // Window controls
  isMaximized: () => ipcRenderer.invoke('isMaximized'),
  isResized: () => ipcRenderer.invoke('isResized'),
  resetSize: (appWrapperWidth, appWrapperHeight, sidebarWidth) =>
    ipcRenderer.send('resetSize', appWrapperWidth, appWrapperHeight, sidebarWidth),
  setOnTop: (callback) => ipcRenderer.send('setOnTop', callback),
  setTray: (bool) => ipcRenderer.send('setTray', bool),
  setOpenAtLogin: (bool) => ipcRenderer.send('setOpenAtLogin', bool),
  transControls: (isTrans) => ipcRenderer.send('transControls', isTrans),

  // Import
  importPage: () => ipcRenderer.send('importPage'),
  pageImported: (callback) => ipcRenderer.on('pageImported', (event, data, msg) => callback(data, msg)),
  importDataError: (callback) => ipcRenderer.on('importDataError', (event, error) => callback(error)),

  //Export
  exportPage: (pageName, pageData) => ipcRenderer.send('exportPage', pageName, pageData),
  pageExported: (callback) => ipcRenderer.on('pageExported', (event, data) => callback(data)),
  exportDataError: (callback) => ipcRenderer.on('exportDataError', (event, error) => callback(error)),

  // Print
  print: (callback) => ipcRenderer.on('print', () => callback()),

  // Context menus
  inputContextMenu: (index, isEmpty, isLine, isSelection, isMultiLine, hasAnswer) =>
    ipcRenderer.send('inputContextMenu', index, isEmpty, isLine, isSelection, isMultiLine, hasAnswer),
  outputContextMenu: (index, isEmpty, hasAnswer) => ipcRenderer.send('outputContextMenu', index, isEmpty, hasAnswer),
  textboxContextMenu: () => ipcRenderer.send('textboxContextMenu'),

  copyAll: (callback) => ipcRenderer.on('copyAll', () => callback()),
  copyAllLines: (callback) => ipcRenderer.on('copyAllLines', () => callback()),
  copyAllAnswers: (callback) => ipcRenderer.on('copyAllAnswers', () => callback()),
  copyLine: (callback) => ipcRenderer.on('copyLine', (event, index) => callback(index)),
  copyAnswer: (callback) => ipcRenderer.on('copyAnswer', (event, index, withLines) => callback(index, withLines)),
  copyLineWithAnswer: (callback) => ipcRenderer.on('copyLineWithAnswer', (event, index) => callback(index)),

  // Update app
  updateApp: () => ipcRenderer.send('updateApp'),
  checkUpdate: () => ipcRenderer.send('checkUpdate'),
  updateStatus: (callback) => ipcRenderer.on('updateStatus', (event, status) => callback(status)),
  showAbout: (callback) => ipcRenderer.on('showAbout', (event, data) => callback(data)),

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
  onSyncDirChanged: (callback) => ipcRenderer.on('syncDirChanged', () => callback()),
  onSyncDirDeleted: (callback) => ipcRenderer.on('syncDirDeleted', () => callback()),
  syncDirContextMenu: (dirPath) => ipcRenderer.send('syncDirContextMenu', dirPath),

  // Open path in file explorer
  openPath: (path) => ipcRenderer.send('openPath', path),

  // Developer Tools
  openDevTools: () => ipcRenderer.send('openDevTools'),
  openLogs: () => ipcRenderer.send('openLogs'),

  // Reset
  resetApp: () => ipcRenderer.send('resetApp')
})
