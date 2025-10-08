const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('numara', {
  // Calls from main.js
  main: {
    importPage: (callback) => ipcRenderer.on('importPage', callback),
    exportPage: (callback) => ipcRenderer.on('exportPage', callback),
    print: (callback) => ipcRenderer.on('print', callback)
  },

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
  importData: (callback) => ipcRenderer.on('importData', callback),
  importDataError: (callback) => ipcRenderer.on('importDataError', callback),

  //Export
  exportPage: (arg1, arg2) => ipcRenderer.send('exportPage', arg1, arg2),
  exportData: (callback) => ipcRenderer.on('exportData', callback),
  exportDataError: (callback) => ipcRenderer.on('exportDataError', callback),

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
