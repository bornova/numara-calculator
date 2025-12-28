// Help tooltips for settings in the application
const helpTooltips = {
  // Help tooltips for various settings
  alwaysOnTop: 'Keep Numara on top off all other windows on the screen.',
  answerPosition: 'Position of the answer display area.',
  autocomplete: 'Enable or disable autocomplete suggestions when typing expressions.',
  closeBrackets: 'Automatically insert closing brackets when opening brackets are typed.',
  contPrevLine: "Continue calculations from the previous line's answer.",
  copyThouSep: 'Copy the answer with thousands separator.',
  currency: 'Enable currency conversion using up-to-date exchange rates.',
  currencyInterval: 'Set how often the currency exchange rates are updated.',
  dateDay: 'Show the day of the week when displaying dates.',
  expLower: 'Set the lower threshold for scientific notation display.',
  expUpper: 'Set the upper threshold for scientific notation display.',
  fontSize: 'Set the font size for the calculator display.',
  fontWeight: 'Set the font weight for the calculator display.',
  inputLocale: 'Enable locale-specific number formatting for input values (e.g., decimal and thousands separators).',
  keywordTips: 'Show keyword hints when typing expressions.',
  lineErrors: 'Highlight errors directly in the expression input line.',
  lineHeight: 'Set the line height for the calculator display.',
  lineNumbers: 'Show line numbers in the calculator display.',
  lineWrap: 'Enable or disable line wrapping in the calculator display.',
  locale: 'Set the locale for number formatting and other locale-specific settings.',
  matchBrackets: 'Highlight matching brackets when the cursor is next to a bracket.',
  matrixType: 'Set the default type for matrices.',
  newPageOnStart: 'Open a new calculation page when the application starts.',
  notation: 'Set the number notation format.',
  notifyDuration: 'Set how long notifications are displayed on the screen.',
  notifyLocation: 'Set the position on the screen where notifications appear.',
  numericOutput: 'Set the format for numeric output display.',
  precision: 'Set the number of significant digits for numeric calculations and display.',
  predictable: 'Enable predictable mode for consistent results across different platforms.',
  rulers: 'Show rulers in the calculator display for better alignment.',
  syntax: 'Enable syntax highligting mode for expression input and evaluation.',
  theme: 'Set the visual theme of the application.',
  thouSep: 'Show the thousands separator in numbers for answers.'
}

/**
 * Initialize help tooltips for elements with data-help attributes.
 */
export function initializeHelpTooltips() {
  document.querySelectorAll('[data-help]').forEach((el) => {
    const key = el.getAttribute('data-help')

    if (key && helpTooltips[key]) {
      el.setAttribute('uk-tooltip', helpTooltips[key])
    }
  })
}
