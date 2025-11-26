const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('numara', {
  versions: {
    chrome: () => process.versions.chrome,
    electron: () => process.versions.electron,
    node: () => process.versions.node,
    v8: () => process.versions.v8
  },

  // App theme
  isDark: () => ipcRenderer.sendSync('isDark'),
  setTheme: (theme) => ipcRenderer.send('setTheme', theme),
  themeUpdate: (callback) => ipcRenderer.on('themeUpdate', callback),

  // Window controls
  isMaximized: () => ipcRenderer.sendSync('isMaximized'),
  isResized: () => ipcRenderer.sendSync('isResized'),
  resetSize: () => ipcRenderer.send('resetSize'),
  setOnTop: (callback) => ipcRenderer.send('setOnTop', callback),
  transControls: (isTrans) => ipcRenderer.send('transControls', isTrans),

  // Import
  importPage: () => ipcRenderer.send('importPage'),
  pageImported: (callback) => ipcRenderer.on('pageImported', (event, data, msg) => callback(data, msg)),
  importDataError: (callback) => ipcRenderer.on('importDataError', callback),

  //Export
  exportPage: (pageName, pageData) => ipcRenderer.send('exportPage', pageName, pageData),
  pageExported: (callback) => ipcRenderer.on('pageExported', (event, data) => callback(data)),
  exportDataError: (callback) => ipcRenderer.on('exportDataError', callback),

  // Print
  print: (callback) => ipcRenderer.on('print', callback),

  // Context menus
  inputContextMenu: (index, isEmpty, isLine, isSelection, isMultiLine, hasAnswer) =>
    ipcRenderer.send('inputContextMenu', index, isEmpty, isLine, isSelection, isMultiLine, hasAnswer),
  outputContextMenu: (index, isEmpty, hasAnswer) => ipcRenderer.send('outputContextMenu', index, isEmpty, hasAnswer),
  textboxContextMenu: () => ipcRenderer.send('textboxContextMenu'),

  copyAll: (callback) => ipcRenderer.on('copyAll', callback),
  copyAllLines: (callback) => ipcRenderer.on('copyAllLines', callback),
  copyAllAnswers: (callback) => ipcRenderer.on('copyAllAnswers', callback),
  copyLine: (callback) => ipcRenderer.on('copyLine', callback),
  copyAnswer: (callback) => ipcRenderer.on('copyAnswer', callback),
  copyLineWithAnswer: (callback) => ipcRenderer.on('copyLineWithAnswer', callback),

  // Update app
  updateApp: () => ipcRenderer.send('updateApp'),
  checkUpdate: () => ipcRenderer.send('checkUpdate'),
  updateStatus: (callback) => ipcRenderer.on('updateStatus', callback),

  // Developer Tools
  openDevTools: () => ipcRenderer.send('openDevTools'),
  openLogs: () => ipcRenderer.send('openLogs'),

  // Reset
  resetApp: () => ipcRenderer.send('resetApp')
})
