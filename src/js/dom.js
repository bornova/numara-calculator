const ELEMENT_SELECTORS = {
  // Layout & core panels
  appWrapper: 'appWrapper',
  mainPanel: 'mainPanel',
  input: 'input',
  inputArea: 'inputArea',
  output: 'output',
  panelDivider: 'panelDivider',

  // Headers
  headerWin: 'winHeader',
  headerWinTitle: 'winHeaderTitle',
  headerMac: 'macHeader',
  headerMacTitle: 'macHeaderTitle',

  // Actions
  actions: 'actions',
  newPageButton: 'newPageButton',
  clearButton: 'clearButton',
  pageName: 'pageName',
  pageTabs: 'pageTabs',
  pageTabsLeft: 'pageTabsLeft',
  pageTabsRight: 'pageTabsRight',
  tabContextMenu: 'tabContextMenu',
  tabContextRename: 'tabContextRename',
  tabContextDuplicate: 'tabContextDuplicate',
  tabContextDelete: 'tabContextDelete',
  selectionStats: 'selectionStats',
  udfuButton: 'udfuButton',
  settingsButton: 'settingsButton',
  aboutButton: 'aboutButton',
  updateMenuLink: 'updateMenuLink',
  notificationDot: 'notificationDot',

  // Page list
  pageListPanel: 'pageListPanel',
  pageListBar: { selector: '#pageListPanel .uk-offcanvas-bar' },
  pageListResizer: 'pageListResizer',
  sortOldNew: 'sortOldNew',
  sortNewOld: 'sortNewOld',
  sortAZ: 'sortAZ',
  sortZA: 'sortZA',
  pageList: 'pageList',
  closePageListButton: 'closePageListButton',
  dockPageListButton: 'dockPageListButton',
  newPageButtonPL: 'newPageButtonPL',

  searchButton: 'searchButton',
  copyButton: 'copyButton',
  importPageButton: 'importPageButton',
  exportPageButton: 'exportPageButton',
  printButton: 'printButton',

  // Dialogs
  udfNameInput: 'udfNameInput',
  udfParamsInput: 'udfParamsInput',
  udfBodyInput: 'udfBodyInput',
  udfSaveButton: 'udfSaveButton',
  udfSaveIcon: 'udfSaveIcon',
  udfSaveLabel: 'udfSaveLabel',
  udfCancelButton: 'udfCancelButton',
  udfList: 'udfList',
  uduNameInput: 'uduNameInput',
  uduDefInput: 'uduDefInput',
  uduAliasesInput: 'uduAliasesInput',
  uduPrefixesSelect: 'uduPrefixesSelect',
  uduSaveButton: 'uduSaveButton',
  uduSaveIcon: 'uduSaveIcon',
  uduSaveLabel: 'uduSaveLabel',
  uduCancelButton: 'uduCancelButton',
  uduList: 'uduList',

  // Settings dialog
  customizeThemeButton: 'customizeThemeButton',
  numericOutput: 'numericOutput',
  bigNumWarn: 'bigNumWarn',
  notation: 'notation',
  precision: 'precision',
  precisionLabel: 'precisionLabel',
  expUpper: 'expUpper',
  expUpperLabel: 'expUpperLabel',
  expLower: 'expLower',
  expLowerLabel: 'expLowerLabel',
  calcTimeout: 'calcTimeout',
  calcTimeoutLabel: 'calcTimeoutLabel',
  matrixType: 'matrixType',
  answerPosition: 'answerPosition',
  keywordTips: 'keywordTips',
  matchBrackets: 'matchBrackets',
  numberFormat: 'numberFormat',
  dateFormat: 'dateFormat',
  localeWarn: 'localeWarn',
  copyThouSep: 'copyThouSep',
  currency: 'currency',
  currencyWarn: 'currencyWarn',
  currencyInterval: 'currencyInterval',
  updateRatesLink: 'updateRatesLink',
  syncDir: 'syncDir',
  syncDirEnabled: 'syncDirEnabled',
  syncDirSection: 'syncDirSection',
  selectSyncDirButton: 'selectSyncDirButton',
  dialogSettingsReset: 'dialogSettingsReset',
  resetSizeButton: 'resetSizeButton',
  defaultSettingsButton: 'defaultSettingsButton',

  // Theme dialog
  defaultColorsButton: 'defaultColorsButton',

  // About dialog
  numaraLogo: 'numaraLogo',
  dialogAboutAppVersion: 'dialogAboutAppVersion',
  dialogAboutUpdateStatus: 'dialogAboutUpdateStatus',
  updateButton: 'updateButton',
  dialogAboutCopyright: 'dialogAboutCopyright',
  gitLink: 'gitLink',
  webLink: 'webLink',
  licenseLink: 'licenseLink',
  helpLink: 'helpLink',
  logsLink: 'logsLink',

  // Plot dialog
  dialogPlot: 'dialogPlot',
  dialogPlotAxisSettings: 'dialogPlotAxisSettings',
  dialogPlotAxisSettingsSave: 'dialogPlotAxisSettingsSave',
  defaultDomainsButton: 'defaultDomainsButton',
  plotSeriesList: 'plotSeriesList',
  plot: 'plot',
  axisSettingsButton: 'axisSettingsButton',
  plotAutoDomain: 'plotAutoDomain',
  plotAxisPrecision: 'plotAxisPrecision',
  plotAxisPrecisionLabel: 'plotAxisPrecisionLabel',
  plotXMin: 'xMin',
  plotXMax: 'xMax',
  plotYMin: 'yMin',
  plotYMax: 'yMax',
  resetPlot: 'resetPlot',
  plotCrossModal: 'plotCrossModal',
  plotDerivativeModal: 'plotDerivativeModal',
  plotGridModal: 'plotGridModal',
  exportPlot: 'exportPlot',

  // Error dialog
  errTitle: 'errTitle',
  errMsg: 'errMsg',

  // Confirm dialog
  confirmMsg: 'confirmMsg',
  confirmYes: 'confirmYes',
  confirmNo: { selector: '#dialogConfirm .uk-modal-close' },
  confirmKeepSyncContainer: 'confirmKeepSyncContainer',
  confirmKeepSync: 'confirmKeepSync',

  // Calc Timeout dialog
  calcTimeoutMsg: 'calcTimeoutMsg',
  calcTimeoutContinue: 'calcTimeoutContinue',
  calcTimeoutIgnore: 'calcTimeoutIgnore',

  // Other elements
  scrollTop: 'scrollTop',
  colorSheet: 'colorSheet'
}

const elementCache = new Map()

const baseDom = {
  /**
   * Query DOM element that matches the selector.
   * @param {string} selector The selector to match.
   * @returns {Element|null} The first matching element.
   */
  el: (selector) => (typeof document !== 'undefined' ? document.querySelector(selector) : null),

  /**
   * Query all DOM elements matching the selector.
   * @param {string} selector The selector to match.
   * @returns {NodeList|Array} A list of matching elements.
   */
  els: (selector) => (typeof document !== 'undefined' ? document.querySelectorAll(selector) : []),

  // Cached icons
  icons: {}
}

/**
 * Clears all lazily cached DOM element references.
 */
export function resetDomCache() {
  elementCache.clear()
}

/**
 * Lazy DOM elements cache and utility functions.
 */
export const dom = new Proxy(baseDom, {
  get(target, prop, receiver) {
    if (Reflect.has(target, prop)) {
      return Reflect.get(target, prop, receiver)
    }

    if (typeof prop === 'string' && Object.hasOwn(ELEMENT_SELECTORS, prop)) {
      if (elementCache.has(prop)) {
        return elementCache.get(prop)
      }

      if (typeof document === 'undefined') return null

      const entry = ELEMENT_SELECTORS[prop]
      const resolved =
        typeof entry === 'string' ? document.getElementById(entry) : document.querySelector(entry.selector)

      elementCache.set(prop, resolved)
      return resolved
    }

    return Reflect.get(target, prop, receiver)
  },

  set(target, prop, value, receiver) {
    if (typeof prop === 'string' && Object.hasOwn(ELEMENT_SELECTORS, prop)) {
      elementCache.set(prop, value)
      return true
    }

    return Reflect.set(target, prop, value, receiver)
  }
})
