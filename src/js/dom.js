/**
 * DOM elements cache and utility functions.
 */
export const dom = {
  /**
   * Query DOM element that matches the selector.
   * @param {string} selector - The selector to match.
   * @returns {Element} The first matching element.
   */
  el: (selector) => document.querySelector(selector),

  /**
   * Query all DOM elements matching the selector.
   * @param {string} selector - The selector to match.
   * @returns {NodeList} A list of matching elements.
   */
  els: (selector) => document.querySelectorAll(selector),

  // Cached icons
  icons: {},

  // Cached elements
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
  copyButton: document.getElementById('copyButton'),
  pageName: document.getElementById('pageName'),
  udfuButton: document.getElementById('udfuButton'),
  settingsButton: document.getElementById('settingsButton'),
  aboutButton: document.getElementById('aboutButton'),
  notificationDot: document.getElementById('notificationDot'),

  // Side panel
  sidePanel: document.getElementById('sidePanel'),
  sortOldNew: document.getElementById('sortOldNew'),
  sortNewOld: document.getElementById('sortNewOld'),
  sortAZ: document.getElementById('sortAZ'),
  sortZA: document.getElementById('sortZA'),
  pageList: document.getElementById('pageList'),
  closeSidePanelButton: document.getElementById('closeSidePanelButton'),
  newPageButtonSP: document.getElementById('newPageButtonSP'),
  importPageButton: document.getElementById('importPageButton'),
  printButton: document.getElementById('printButton'),
  deleteAllPagesButton: document.getElementById('deleteAllPagesButton'),

  // Dialogs
  dialogNewPage: document.getElementById('dialogNewPage'),
  newPageTitleInput: document.getElementById('newPageTitleInput'),
  dialogNewPageSave: document.getElementById('dialogNewPageSave'),
  dialogRenamePage: document.getElementById('dialogRenamePage'),
  renamePageTitleInput: document.getElementById('renamePageTitleInput'),
  dialogRenamePageSave: document.getElementById('dialogRenamePageSave'),
  dialogUdfu: document.getElementById('dialogUdfu'),
  udfInput: document.getElementById('udfInput'),
  uduInput: document.getElementById('uduInput'),
  dialogUdfuSaveF: document.getElementById('dialogUdfuSaveF'),
  dialogUdfuSaveU: document.getElementById('dialogUdfuSaveU'),

  // Settings dialog
  dialogSettings: document.getElementById('dialogSettings'),
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
  matrixType: document.getElementById('matrixType'),
  answerPosition: document.getElementById('answerPosition'),
  keywordTips: document.getElementById('keywordTips'),
  matchBrackets: document.getElementById('matchBrackets'),
  locale: document.getElementById('locale'),
  localeWarn: document.getElementById('localeWarn'),
  inputLocale: document.getElementById('inputLocale'),
  copyThouSep: document.getElementById('copyThouSep'),
  currency: document.getElementById('currency'),
  currencyWarn: document.getElementById('currencyWarn'),
  currencyInterval: document.getElementById('currencyInterval'),
  currencyUpdate: document.getElementById('currencyUpdate'),
  lastUpdated: document.getElementById('lastUpdated'),
  updateRatesLink: document.getElementById('updateRatesLink'),
  dialogSettingsReset: document.getElementById('dialogSettingsReset'),
  resetSizeButton: document.getElementById('resetSizeButton'),
  defaultSettingsButton: document.getElementById('defaultSettingsButton'),

  // Theme dialog
  defaultColorsButton: document.getElementById('defaultColorsButton'),

  // About dialog
  dialogAbout: document.getElementById('dialogAbout'),
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
  plotTitle: document.getElementById('plotTitle'),
  plot: document.getElementById('plot'),
  axisSettingsButton: document.getElementById('axisSettingsButton'),
  plotAutoDomain: document.getElementById('plotAutoDomain'),
  plotXPrecision: document.getElementById('plotXPrecision'),
  plotXPrecisionLabel: document.getElementById('plotXPrecisionLabel'),
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

  // Other elements
  scrollTop: document.getElementById('scrollTop'),
  colorSheet: document.getElementById('colorSheet'),
  inlineStyle: document.getElementById('style')
}
