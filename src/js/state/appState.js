export const DEFAULT_INPUT_WIDTH = 60

/**
 * Default application settings.
 */
export const DEFAULT_SETTINGS = {
  alwaysOnTop: false,
  syncDirEnabled: false,
  syncDir: '',
  answerPosition: 'left',
  autocomplete: true,
  closeBrackets: true,
  contPrevLine: true,
  copyThouSep: false,
  currency: true,
  currencyInterval: '0',
  dateDay: false,
  dateFormat: 'MM/dd/yyyy',
  expLower: '-12',
  expUpper: '12',
  fontSize: '14px',
  fontWeight: '400',
  keywordTips: true,
  lineErrors: false,
  lineHeight: '26px',
  lineNumbers: true,
  lineWrap: true,
  truncateAnswers: true,
  matchBrackets: true,
  matrixType: 'Matrix',
  newPageOnStart: false,
  notation: 'auto',
  notifyDuration: '5000',
  notifyLocation: 'bottom-center',
  numberFormat: '1,234.56',
  numericOutput: 'number',
  pageListPosition: 'auto',
  precision: '4',
  calcTimeout: '10',
  predictable: false,
  rulers: false,
  syntax: true,
  theme: 'system',
  zoomLevel: 'normal',
  thouSep: true,
  showTray: false,
  openAtLogin: false,
  escToClose: false
}

/**
 * Ordered `[value, label]` option tuples (`null` value renders a disabled separator) for settings `<select>` controls.
 */
export const SETTING_SELECT_OPTIONS = {
  zoomLevel: [
    ['smaller', 'Smaller'],
    ['normal', 'Normal'],
    ['larger', 'Larger']
  ],
  pageListPosition: [
    ['auto', 'Auto'],
    ['float', 'Floating'],
    ['dock', 'Docked'],
    ['tabs', 'Tabs']
  ],
  notifyLocation: [
    ['top-left', 'Top Left'],
    ['top-center', 'Top Center'],
    ['top-right', 'Top Right'],
    [null, '-'],
    ['bottom-left', 'Bottom Left'],
    ['bottom-center', 'Bottom Center'],
    ['bottom-right', 'Bottom Right']
  ],
  notifyDuration: [
    ['1000', '1 second'],
    ['3000', '3 seconds'],
    ['5000', '5 seconds'],
    ['10000', '10 seconds'],
    ['30000', '30 seconds'],
    ['0', 'Close manually']
  ],
  fontSize: [
    ['12px', 'Tiny'],
    ['13px', 'Small'],
    ['14px', 'Normal'],
    ['15px', 'Large'],
    ['16px', 'X-Large']
  ],
  fontWeight: [
    ['200', 'Light'],
    ['300', 'Thin'],
    ['400', 'Normal'],
    ['500', 'Semi Bold'],
    ['700', 'Bold']
  ],
  lineHeight: [
    ['17px', 'Tiny'],
    ['21px', 'Small'],
    ['26px', 'Normal'],
    ['30px', 'Large'],
    ['34px', 'X-Large']
  ],
  answerPosition: [
    ['left', 'Left (with divider)'],
    ['right', 'Right (no divider)'],
    ['bottom', 'Below Expression']
  ],
  numericOutput: [
    ['number', 'Number'],
    ['BigNumber', 'BigNumber'],
    ['Fraction', 'Fraction']
  ],
  matrixType: [
    ['Matrix', 'Matrix'],
    ['Array', 'Array']
  ],
  notation: [
    ['auto', 'Auto'],
    ['engineering', 'Engineering'],
    ['exponential', 'Exponential'],
    ['fixed', 'Fixed'],
    [null, '-'],
    ['bin', 'Binary'],
    ['hex', 'Hexadecimal'],
    ['oct', 'Octal']
  ],
  numberFormat: [
    ['1,234.56', '1,234.56'],
    ['1.234,56', '1.234,56'],
    ['1 234.56', '1 234.56'],
    ['1 234,56', '1 234,56']
  ],
  dateFormat: [
    ['MM/dd/yyyy', 'MM/DD/YYYY'],
    ['dd/MM/yyyy', 'DD/MM/YYYY'],
    ['yyyy-MM-dd', 'YYYY-MM-DD']
  ],
  currencyInterval: [
    ['0', 'On start'],
    ['3600000', '1 hour'],
    ['10800000', '3 hours'],
    ['21600000', '6 hours'],
    ['43200000', '12 hours'],
    ['manual', 'Manual']
  ]
}

/**
 * Shared application runtime state.
 */
export const app = {
  activePlot: null,
  activePage: null,
  colors: null,
  currencies: {},
  loadingPage: false,
  mathScope: new Map(),
  pageAnswers: new Map(),
  pageHistory: new Map(),
  pageListDocked: null,
  plotFunction: null,
  plotSettings: null,
  refreshCM: true,
  scopeProperties: {},
  scopeTypes: {},
  settings: null,
  udfList: [],
  uduList: [],
  updateReady: false,
  widgetMap: new WeakMap()
}
