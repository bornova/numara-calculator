/**
 * DOM elements cache
 * This file caches all DOM elements for better performance
 */

export const dom = {
  /**
   * Query DOM element that matches the selector.
   * @param {string} selector - The CSS selector to match.
   * @returns {Element} The first matching element.
   */
  el: (selector) => document.querySelector(selector),

  /**
   * Query all DOM elements matching the selector.
   * @param {string} selector - The CSS selector to match.
   * @returns {NodeList} A list of matching elements.
   */
  els: (selector) => document.querySelectorAll(selector),

  // Main elements
  wrapper: document.getElementById('wrapper'),
  panel: document.getElementById('panel'),
  input: document.getElementById('input'),
  inputArea: document.getElementById('inputArea'),
  output: document.getElementById('output'),
  panelDivider: document.getElementById('panelDivider'),

  // Headers
  headerWin: document.getElementById('winHeader'),
  headerWinTitle: document.getElementById('winHeaderTitle'),
  headerMac: document.getElementById('macHeader'),
  headerMacTitle: document.getElementById('macHeaderTitle'),

  // Window buttons
  winButtons: document.getElementById('winButtons'),
  closeBtn: document.getElementById('close'),
  maxBtn: document.getElementById('max'),
  unmaxBtn: document.getElementById('unmax'),
  minBtn: document.getElementById('min'),

  // Actions
  actions: document.getElementById('actions'),
  leftActions: document.getElementById('leftActions'),
  centerActions: document.getElementById('centerActions'),
  rightActions: document.getElementById('rightActions'),
  sidePanelButton: document.getElementById('sidePanelButton'),
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
  pageListHeader: document.getElementById('pageListHeader'),
  pageListSort: document.getElementById('pageListSort'),
  sortDropdown: document.getElementById('sortDropdown'),
  sortOldNew: document.getElementById('sortOldNew'),
  sortNewOld: document.getElementById('sortNewOld'),
  sortAZ: document.getElementById('sortAZ'),
  sortZA: document.getElementById('sortZA'),
  pageList: document.getElementById('pageList'),
  pageListFooter: document.getElementById('pageListFooter'),
  sidePanelActions: document.getElementById('sidePanelActions'),
  closeSidePanelButton: document.getElementById('closeSidePanelButton'),
  newPageButtonSP: document.getElementById('newPageButtonSP'),
  importButton: document.getElementById('importButton'),
  exportButton: document.getElementById('exportButton'),
  spDivider: document.getElementById('spDivider'),
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
  udfuTabs: document.getElementById('udfuTabs'),
  udfuSwitcher: document.getElementById('udfuSwitcher'),
  udfTab: document.getElementById('udfTab'),
  uduTab: document.getElementById('uduTab'),
  udfInput: document.getElementById('udfInput'),
  uduInput: document.getElementById('uduInput'),
  dialogUdfuSaveF: document.getElementById('dialogUdfuSaveF'),
  dialogUdfuSaveU: document.getElementById('dialogUdfuSaveU'),

  // Settings dialog
  dialogSettings: document.getElementById('dialogSettings'),
  theme: document.getElementById('theme'),
  customizeThemeButton: document.getElementById('customizeThemeButton'),
  alwaysOnTop: document.getElementById('alwaysOnTop'),
  fontSize: document.getElementById('fontSize'),
  fontWeight: document.getElementById('fontWeight'),
  lineHeight: document.getElementById('lineHeight'),
  locale: document.getElementById('locale'),
  localeWarn: document.getElementById('localeWarn'),
  dateDay: document.getElementById('dateDay'),
  thouSep: document.getElementById('thouSep'),
  copyThouSep: document.getElementById('copyThouSep'),
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
  predictable: document.getElementById('predictable'),
  contPrevLine: document.getElementById('contPrevLine'),
  syntax: document.getElementById('syntax'),
  keywordTips: document.getElementById('keywordTips'),
  matchBrackets: document.getElementById('matchBrackets'),
  autocomplete: document.getElementById('autocomplete'),
  closeBrackets: document.getElementById('closeBrackets'),
  divider: document.getElementById('divider'),
  lineNumbers: document.getElementById('lineNumbers'),
  rulers: document.getElementById('rulers'),
  lineErrors: document.getElementById('lineErrors'),
  lineWrap: document.getElementById('lineWrap'),
  plotCross: document.getElementById('plotCross'),
  plotDerivative: document.getElementById('plotDerivative'),
  plotGrid: document.getElementById('plotGrid'),
  notifyLocation: document.getElementById('notifyLocation'),
  notifyDuration: document.getElementById('notifyDuration'),
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
  dialogTheme: document.getElementById('dialogTheme'),
  resetColorsButton: document.getElementById('resetColorsButton'),
  colorInputs: document.querySelectorAll('.colorInput'),

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
  plotTitle: document.getElementById('plotTitle'),
  plot: document.getElementById('plot'),
  resetPlot: document.getElementById('resetPlot'),
  plotCrossModal: document.getElementById('plotCrossModal'),
  plotDerivativeModal: document.getElementById('plotDerivativeModal'),
  plotGridModal: document.getElementById('plotGridModal'),
  exportPlot: document.getElementById('exportPlot'),

  // Error dialog
  dialogError: document.getElementById('dialogError'),
  errTitle: document.getElementById('errTitle'),
  errMsg: document.getElementById('errMsg'),

  // Confirm dialog
  dialogConfirm: document.getElementById('dialogConfirm'),
  confirmMsg: document.getElementById('confirmMsg'),
  confirmYes: document.getElementById('confirmYes'),

  // Other elements
  scrollTop: document.getElementById('scrollTop'),
  colorSheet: document.getElementById('colorSheet'),
  mobileStyle: document.getElementById('mobile'),
  inlineStyle: document.getElementById('style')
}
