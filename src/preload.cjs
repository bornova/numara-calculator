const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('numara', {
  // Calls from main.js
  main: {
    import: (callback) => ipcRenderer.on('import', callback),
    export: (callback) => ipcRenderer.on('export', callback),
    print: (callback) => ipcRenderer.on('print', callback)
  },

  // App theme
  isDark: () => ipcRenderer.sendSync('isDark'),
  setTheme: (theme) => ipcRenderer.send('setTheme', theme),
  themeUpdate: (callback) => ipcRenderer.on('themeUpdate', callback),

  // Window controls
  fullscreen: () =>
    ipcRenderer.on('fullscreen', (event, isFullscreen) => {
      if (isFullscreen) {
        ipcRenderer.send('maximize')
      }
    }),
  setOnTop: (callback) => ipcRenderer.send('setOnTop', callback),
  close: () => ipcRenderer.send('close'),
  minimize: () => ipcRenderer.send('minimize'),
  maximize: () => ipcRenderer.send('maximize'),
  unmaximize: () => ipcRenderer.send('unmaximize'),
  isMax: (callback) => ipcRenderer.on('isMax', callback),
  isMaximized: () => ipcRenderer.sendSync('isMaximized'),
  isResized: () => ipcRenderer.sendSync('isResized'),
  resetSize: () => ipcRenderer.send('resetSize'),

  // Import
  import: () => ipcRenderer.send('import'),
  importData: (callback) => ipcRenderer.on('importData', callback),
  importDataError: (callback) => ipcRenderer.on('importDataError', callback),

  //Export
  export: (arg1, arg2) => ipcRenderer.send('export', arg1, arg2),
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
  notifyUpdate: (callback) => ipcRenderer.on('notifyUpdate', callback),
  updateStatus: (callback) => ipcRenderer.on('updateStatus', callback),

  // Developer Tools
  openDevTools: () => ipcRenderer.send('openDevTools'),

  // App console logger
  logMessage: (callback) => ipcRenderer.on('logMessage', callback),

  // Reset
  resetApp: () => ipcRenderer.send('resetApp')
})
