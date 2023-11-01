const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('numara', {
  // App theme
  isDark: () => ipcRenderer.sendSync('isDark'),
  setTheme: (theme) => {
    ipcRenderer.send('setTheme', theme)
  },
  themeUpdate: (callback) => {
    ipcRenderer.on('themeUpdate', callback)
  },

  // Always on top
  setOnTop: (callback) => {
    ipcRenderer.send('setOnTop', callback)
  },

  // Window controls
  fullscreen: () => {
    ipcRenderer.on('fullscreen', (event, isFullscreen) => {
      if (isFullscreen) {
        ipcRenderer.send('maximize')
      }
    })
  },
  isResized: () => ipcRenderer.sendSync('isResized'),
  isMaximized: () => ipcRenderer.sendSync('isMaximized'),
  isMax: (callback) => {
    ipcRenderer.on('isMax', callback)
  },
  minimize: () => {
    ipcRenderer.send('minimize')
  },
  maximize: () => {
    ipcRenderer.send('maximize')
  },
  unmaximize: () => {
    ipcRenderer.send('unmaximize')
  },
  close: () => {
    ipcRenderer.send('close')
  },

  // Print
  print: () => {
    ipcRenderer.send('print')
  },
  printReply: (callback) => {
    callback()
  },

  // Import calculations
  import: () => {
    ipcRenderer.send('import')
  },
  importData: (callback) => {
    ipcRenderer.on('importData', callback)
  },
  importDataError: (callback) => {
    ipcRenderer.on('importDataError', callback)
  },

  //Export calculations
  export: (arg1, arg2) => {
    ipcRenderer.send('export', arg1, arg2)
  },
  exportData: (callback) => {
    ipcRenderer.on('exportData', callback)
  },
  exportDataError: (callback) => {
    ipcRenderer.on('exportDataError', callback)
  },

  // Context menus
  inputContextMenu: (index, isEmpty, isLine, isSelection, isMultiLine, hasAnswer) => {
    ipcRenderer.send('inputContextMenu', index, isEmpty, isLine, isSelection, isMultiLine, hasAnswer)
  },
  outputContextMenu: (index, isEmpty, hasAnswer) => {
    ipcRenderer.send('outputContextMenu', index, isEmpty, hasAnswer)
  },
  textboxContextMenu: () => {
    ipcRenderer.send('textboxContextMenu')
  },
  copyLine: (callback) => {
    ipcRenderer.on('copyLine', callback)
  },
  copyAnswer: (callback) => {
    ipcRenderer.on('copyAnswer', callback)
  },
  copyLineWithAnswer: (callback) => {
    ipcRenderer.on('copyLineWithAnswer', callback)
  },
  copyAllLines: (callback) => {
    ipcRenderer.on('copyAllLines', callback)
  },
  copyAllAnswers: (callback) => {
    ipcRenderer.on('copyAllAnswers', callback)
  },
  copyAll: (callback) => {
    ipcRenderer.on('copyAll', callback)
  },

  // Update app
  checkUpdate: () => {
    ipcRenderer.send('checkUpdate')
  },
  notifyUpdate: (callback) => {
    ipcRenderer.on('notifyUpdate', callback)
  },
  updateApp: () => {
    ipcRenderer.send('updateApp')
  },
  updateStatus: (callback) => {
    ipcRenderer.on('updateStatus', callback)
  },

  // Reset
  resetApp: () => {
    ipcRenderer.send('resetApp')
  },
  resetSize: () => {
    ipcRenderer.send('resetSize')
  }
})
