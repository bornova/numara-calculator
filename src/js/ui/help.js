import UIkit from 'uikit'

// Help tooltips for settings in the application
const helpTooltips = {
  alwaysOnTop: 'Keep Numara on top off all other windows on the screen. (Default: Disabled)',
  answerPosition: 'Position of the answer display area. (Default: Left)',
  autocomplete: 'Enable or disable autocomplete suggestions when typing expressions. (Default: Enabled)',
  closeBrackets: 'Automatically insert closing brackets when opening brackets are typed. (Default: Enabled)',
  contPrevLine: "Continue calculations from the previous line's answer. (Default: Enabled)",
  copyThouSep: 'Copy the answer with thousands separator. (Default: Disabled)',
  currency: 'Enable currency conversion using up-to-date exchange rates. (Default: Enabled)',
  currencyInterval: 'Set how often the currency exchange rates are updated. (Default: On start)',
  dateDay: 'Show the day of the week when displaying dates. (Default: Disabled)',
  dateFormat: 'Set the date format for date and time calculations. (Default: System)',
  expLower: 'Set the lower threshold for scientific notation display. (Default: -12)',
  expUpper: 'Set the upper threshold for scientific notation display. (Default: 12)',
  fontSize: 'Set the font size for the calculator display. (Default: Normal)',
  fontWeight: 'Set the font weight for the calculator display. (Default: Normal)',
  inputLocale: 'Enable thousands separators for input expressions. (Default: Disabled)',
  keywordTips: 'Show keyword hints when typing expressions. (Default: Enabled)',
  lineErrors: 'Highlight errors directly in the expression input line. (Default: Disabled)',
  lineHeight: 'Set the line height for the calculator display. (Default: Normal)',
  lineNumbers: 'Show line numbers in the calculator display. (Default: Enabled)',
  lineWrap: 'Enable or disable line wrapping in the calculator display. (Default: Enabled)',
  matchBrackets: 'Highlight matching brackets when the cursor is next to a bracket. (Default: Enabled)',
  matrixType: 'Set the default type for matrices. (Default: Matrix)',
  newPageOnStart: 'Open a new calculation page when the application starts. (Default: Disabled)',
  notation: 'Set the number notation format. (Default: Auto)',
  notifyDuration: 'Set how long notifications are displayed on the screen. (Default: 5 seconds)',
  notifyLocation: 'Set the position on the screen where notifications appear. (Default: Bottom Center)',
  numericOutput: 'Set the format for numeric output display. (Default: Number)',
  pageListPosition: 'Position of the page list sidebar. (Default: Auto)',
  precision: 'Set the number of significant digits for numeric calculations and display. (Default: 4)',
  predictable: 'Enable predictable mode for consistent results across different platforms. (Default: Disabled)',
  rulers: 'Show rulers in the calculator display for better alignment. (Default: Disabled)',
  syntax: 'Enable syntax highligting mode for expression input and evaluation. (Default: Enabled)',
  theme: 'Set the visual theme of the application. (Default: System)',
  thouSep: 'Set the thousands separator formatting. (Default: System)',
  truncateAnswers: 'Truncate long answers with ellipses instead of showing a horizontal scrollbar. (Default: Enabled)',
  syncDirEnabled: 'Enable folder synchronization. (Default: Disabled)',
  syncDir: 'Set the folder to use for folder synchronization.',
  calcTimeout: 'Set the timeout for calculations in seconds. (Default: 10)'
}

/**
 * Initialize help tooltips for elements with data-help attributes.
 */
export function initializeHelpTooltips() {
  document.querySelectorAll('[data-help]').forEach((el) => {
    const key = el.getAttribute('data-help')

    if (key && helpTooltips[key]) {
      UIkit.tooltip(el, { title: helpTooltips[key] })
    }
  })
}
