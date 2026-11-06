/**
 * DOM elements cache and utility functions.
 */
export const dom = {
  /**
   * Query DOM element that matches the selector.
   * @param {string} selector The selector to match.
   * @returns {Element|null} The first matching element.
   */
  el: (selector) => document.querySelector(selector),

  /**
   * Query all DOM elements matching the selector.
   * @param {string} selector The selector to match.
   * @returns {NodeList} A list of matching elements.
   */
  els: (selector) => document.querySelectorAll(selector),

  // Cached icons
  icons: {},

  // Cached elements
  appWrapper: document.getElementById('appWrapper'),
  mainPanel: document.getElementById('mainPanel'),
  input: document.getElementById('input'),
  inputArea: document.getElementById('inputArea'),
  output: document.getElementById('output'),
  panelDivider: document.getElementById('panelDivider'),

  // Headers
  headerWin: document.getElementById('winHeader'),
  headerWinTitle: document.getElementById('winHeaderTitle'),
  headerMac: document.getElementById('macHeader'),
  headerMacTitle: document.getElementById('macHeaderTitle'),

  // Actions
  newPageButton: document.getElementById('newPageButton'),
  clearButton: document.getElementById('clearButton'),
  pageName: document.getElementById('pageName'),
  selectionStats: document.getElementById('selectionStats'),
  udfuButton: document.getElementById('udfuButton'),
  settingsButton: document.getElementById('settingsButton'),
  aboutButton: document.getElementById('aboutButton'),
  updateMenuLink: document.getElementById('updateMenuLink'),
  notificationDot: document.getElementById('notificationDot'),

  // Page list
  pageListPanel: document.getElementById('pageListPanel'),
  pageListBar: document.querySelector('#pageListPanel .uk-offcanvas-bar'),
  pageListResizer: document.getElementById('pageListResizer'),
  sortOldNew: document.getElementById('sortOldNew'),
  sortNewOld: document.getElementById('sortNewOld'),
  sortAZ: document.getElementById('sortAZ'),
  sortZA: document.getElementById('sortZA'),
  pageList: document.getElementById('pageList'),
  closePageListButton: document.getElementById('closePageListButton'),
  dockPageListButton: document.getElementById('dockPageListButton'),
  newPageButtonPL: document.getElementById('newPageButtonPL'),

  copyButton: document.getElementById('copyButton'),
  importPageButton: document.getElementById('importPageButton'),
  exportPageButton: document.getElementById('exportPageButton'),
  printButton: document.getElementById('printButton'),

  // Dialogs
  dialogNewPage: document.getElementById('dialogNewPage'),
  newPageTitleInput: document.getElementById('newPageTitleInput'),
  dialogNewPageSave: document.getElementById('dialogNewPageSave'),
  udfInput: document.getElementById('udfInput'),
  uduInput: document.getElementById('uduInput'),
  dialogUdfuSaveF: document.getElementById('dialogUdfuSaveF'),
  dialogUdfuSaveU: document.getElementById('dialogUdfuSaveU'),

  // Settings dialog
  customizeThemeButton: document.getElementById('customizeThemeButton'),
  numericOutput: document.getElementById('numericOutput'),
  bigNumWarn: document.getElementById('bigNumWarn'),
  notation: document.getElementById('notation'),
  precision: document.getElementById('precision'),
  precisionLabel: document.getElementById('precisionLabel'),
  expUpper: document.getElementById('expUpper'),
  expUpperLabel: document.getElementById('expUpperLabel'),
  expLower: document.getElementById('expLower'),
  expLowerLabel: document.getElementById('expLowerLabel'),
  calcTimeout: document.getElementById('calcTimeout'),
  calcTimeoutLabel: document.getElementById('calcTimeoutLabel'),
  matrixType: document.getElementById('matrixType'),
  answerPosition: document.getElementById('answerPosition'),
  keywordTips: document.getElementById('keywordTips'),
  matchBrackets: document.getElementById('matchBrackets'),
  numberFormat: document.getElementById('numberFormat'),
  dateFormat: document.getElementById('dateFormat'),
  localeWarn: document.getElementById('localeWarn'),
  copyThouSep: document.getElementById('copyThouSep'),
  currency: document.getElementById('currency'),
  currencyWarn: document.getElementById('currencyWarn'),
  currencyInterval: document.getElementById('currencyInterval'),
  updateRatesLink: document.getElementById('updateRatesLink'),
  syncDir: document.getElementById('syncDir'),
  syncDirEnabled: document.getElementById('syncDirEnabled'),
  syncDirSection: document.getElementById('syncDirSection'),
  selectSyncDirButton: document.getElementById('selectSyncDirButton'),
  dialogSettingsReset: document.getElementById('dialogSettingsReset'),
  resetSizeButton: document.getElementById('resetSizeButton'),
  defaultSettingsButton: document.getElementById('defaultSettingsButton'),

  // Theme dialog
  defaultColorsButton: document.getElementById('defaultColorsButton'),

  // About dialog
  numaraLogo: document.getElementById('numaraLogo'),
  dialogAboutAppVersion: document.getElementById('dialogAboutAppVersion'),
  dialogAboutUpdateStatus: document.getElementById('dialogAboutUpdateStatus'),
  updateButton: document.getElementById('updateButton'),
  dialogAboutCopyright: document.getElementById('dialogAboutCopyright'),
  gitLink: document.getElementById('gitLink'),
  webLink: document.getElementById('webLink'),
  licenseLink: document.getElementById('licenseLink'),
  helpLink: document.getElementById('helpLink'),
  logsLink: document.getElementById('logsLink'),

  // Plot dialog
  dialogPlot: document.getElementById('dialogPlot'),
  dialogPlotAxisSettings: document.getElementById('dialogPlotAxisSettings'),
  dialogPlotAxisSettingsSave: document.getElementById('dialogPlotAxisSettingsSave'),
  defaultDomainsButton: document.getElementById('defaultDomainsButton'),
  plotSeriesList: document.getElementById('plotSeriesList'),
  plot: document.getElementById('plot'),
  axisSettingsButton: document.getElementById('axisSettingsButton'),
  plotAutoDomain: document.getElementById('plotAutoDomain'),
  plotAxisPrecision: document.getElementById('plotAxisPrecision'),
  plotAxisPrecisionLabel: document.getElementById('plotAxisPrecisionLabel'),
  plotXMin: document.getElementById('xMin'),
  plotXMax: document.getElementById('xMax'),
  plotYMin: document.getElementById('yMin'),
  plotYMax: document.getElementById('yMax'),
  resetPlot: document.getElementById('resetPlot'),
  plotCrossModal: document.getElementById('plotCrossModal'),
  plotDerivativeModal: document.getElementById('plotDerivativeModal'),
  plotGridModal: document.getElementById('plotGridModal'),
  exportPlot: document.getElementById('exportPlot'),

  // Error dialog
  errTitle: document.getElementById('errTitle'),
  errMsg: document.getElementById('errMsg'),

  // Confirm dialog
  confirmMsg: document.getElementById('confirmMsg'),
  confirmYes: document.getElementById('confirmYes'),
  confirmNo: document.querySelector('#dialogConfirm .uk-modal-close'),
  confirmKeepSyncContainer: document.getElementById('confirmKeepSyncContainer'),
  confirmKeepSync: document.getElementById('confirmKeepSync'),

  // Calc Timeout dialog
  calcTimeoutMsg: document.getElementById('calcTimeoutMsg'),
  calcTimeoutContinue: document.getElementById('calcTimeoutContinue'),
  calcTimeoutIgnore: document.getElementById('calcTimeoutIgnore'),

  // Other elements
  printArea: document.getElementById('printArea'),
  scrollTop: document.getElementById('scrollTop'),
  colorSheet: document.getElementById('colorSheet')
}
