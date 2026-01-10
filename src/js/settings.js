import { colors } from './colors'
import { dom } from './dom'
import { cm, udfInput, uduInput } from './editor'
import { calculate, math } from './eval'
import { getRates } from './forex'
import { confirm, modal, showError } from './modal'
import { app, checkSize, getTheme, isElectron, store } from './utils'

import { applyChange, observableDiff } from 'deep-diff-esm'

/** Show/hide Defaults link. */
function checkDefaults() {
  dom.defaultSettingsButton.style.display = observableDiff(app.settings, settings.defaults).length ? 'inline' : 'none'
}

/** Check for app settings modifications. */
function checkMods(key) {
  const el = dom.el('#' + key + 'Mod')
  if (el) {
    el.style.display = app.settings[key] !== settings.defaults[key] ? 'inline-block' : 'none'
  }
}

/** Show warning if big number option is selected. */
function bigNumberWarning() {
  dom.bigNumWarn.style.display = app.settings.numericOutput === 'BigNumber' ? 'inline-block' : 'none'
}

/** Show warning if locale uses comma as decimal point separator. */
function localeWarning() {
  dom.localeWarn.style.display = app.settings.inputLocale ? 'inline-block' : 'none'
}

/**
 * Populates a select HTML element with given options.
 *
 * @param {HTMLSelectElement} selectEl - The select element to populate.
 * @param {Array<string|Array>} options - The options to add. Each option can be a string or an array [label, value].
 * @param {string|null} [disabledValue=null] - An optional value to disable in the select options.
 */
function populateSelect(selectEl, options, disabledValue = null) {
  selectEl.innerHTML = ''

  options.forEach((option) => {
    const [value, opt] = Object.entries(option)[0]

    selectEl.innerHTML +=
      value === disabledValue ? `<option disabled>${opt}</option>` : `<option value="${value}">${opt}</option>`
  })
}

let updateInterval

export const settings = {
  /** Default settings. */
  defaults: {
    alwaysOnTop: false,
    answerPosition: 'left',
    autocomplete: true,
    closeBrackets: true,
    contPrevLine: true,
    copyThouSep: false,
    currency: true,
    currencyInterval: '0',
    dateDay: false,
    expLower: '-12',
    expUpper: '12',
    fontSize: '1.1rem',
    fontWeight: '400',
    inputLocale: false,
    inputWidth: 60,
    keywordTips: true,
    lineErrors: false,
    lineHeight: '24px',
    lineNumbers: true,
    lineWrap: true,
    locale: 'system',
    matchBrackets: true,
    matrixType: 'Matrix',
    newPageOnStart: false,
    notation: 'auto',
    notifyDuration: '5000',
    notifyLocation: 'bottom-center',
    numericOutput: 'number',
    precision: '4',
    predictable: false,
    rulers: false,
    syntax: true,
    theme: 'system',
    thouSep: true
  },

  /** Initialize settings. */
  initialize: () => {
    app.settings = store.get('settings')

    if (app.settings) {
      observableDiff(app.settings, settings.defaults, (diff) => {
        if (diff.kind === 'E') return

        applyChange(app.settings, settings.defaults, diff)
        store.set('settings', app.settings)
      })
    } else {
      app.settings = { ...settings.defaults }
      store.set('settings', app.settings)
    }

    dom.els('.settingItem').forEach((item) => {
      const span = document.createElement('span')
      const icon = dom.icons.Dot

      span.setAttribute('id', item.getAttribute('id') + 'Mod')
      span.setAttribute('class', item.getAttribute('type') === 'checkbox' ? 'settingModToggle' : 'settingMod')
      span.innerHTML = icon
      span.addEventListener('click', () => {
        const key = item.getAttribute('id')

        app.settings[key] = settings.defaults[key]

        settings.prep()
        settings.save()
        settings.apply()
      })

      item.getAttribute('type') === 'checkbox' ? item.parentElement.before(span) : item.before(span)
    })

    if (app.settings.currency) getRates()
  },

  /** Prepare settings dialog items. */
  prep: () => {
    const locales = [
      { system: 'System' },
      { 'zh-CN': 'Chinese (PRC)' },
      { 'en-CA': 'English (Canada)' },
      { 'en-GB': 'English (UK)' },
      { 'en-US': 'English (US)' },
      { 'fr-FR': 'French (France)' },
      { 'de-DE': 'German (Germany)' },
      { 'it-IT': 'Italian (Italy)' },
      { 'ja-JP': 'Japanese (Japan)' },
      { 'pt-BR': 'Portuguese (Brazil)' },
      { 'ru-RU': 'Russian (Russia)' },
      { 'es-MX': 'Spanish (Mexico)' },
      { 'es-ES': 'Spanish (Spain)' },
      { 'tr-TR': 'Turkish (Turkiye)' }
    ]

    const answerPositions = [
      { left: 'Left (with divider)' },
      { right: 'Right (no divider)' },
      { bottom: 'Below Expression' }
    ]
    const matrixTypes = [{ Matrix: 'Matrix' }, { Array: 'Array' }]
    const numericOutputs = [{ number: 'Number' }, { BigNumber: 'BigNumber' }, { Fraction: 'Fraction' }]
    const notations = [
      { auto: 'Auto' },
      { engineering: 'Engineering' },
      { exponential: 'Exponential' },
      { fixed: 'Fixed' },
      { spacer: '-' },
      { bin: 'Binary' },
      { hex: 'Hexadecimal' },
      { oct: 'Octal' }
    ]

    populateSelect(dom.answerPosition, answerPositions)
    populateSelect(dom.locale, locales)
    populateSelect(dom.numericOutput, numericOutputs)
    populateSelect(dom.notation, notations, 'spacer')
    populateSelect(dom.matrixType, matrixTypes)

    dom.precisionLabel.innerHTML = app.settings.precision
    dom.expLowerLabel.innerHTML = app.settings.expLower
    dom.expUpperLabel.innerHTML = app.settings.expUpper
    dom.lastUpdated.innerHTML = app.settings.currency ? store.get('rateDate') : ''
    dom.currencyUpdate.style.visibility = app.settings.currency ? 'visible' : 'hidden'

    Object.keys(app.settings).forEach((key) => {
      const el = dom.el('#' + key)

      if (!el) return

      el[el.getAttribute('type') === 'checkbox' ? 'checked' : 'value'] = app.settings[key]
      checkMods(key)
    })

    checkSize()
    checkDefaults()
    localeWarning()
    bigNumberWarning()

    settings.toggleSubs()
  },

  /** Apply settings. */
  apply: () => {
    const appTheme = getTheme()

    dom.inlineStyle.setAttribute('href', 'css/' + appTheme + '.css')
    dom.numaraLogo.setAttribute('src', 'assets/logo-' + appTheme + '.png')

    setTimeout(colors.apply, 50)

    const udfuTheme =
      app.settings.theme === 'system'
        ? isElectron
          ? numara.isDark()
            ? 'material-darker'
            : 'default'
          : 'default'
        : app.settings.theme === 'light'
          ? 'default'
          : 'material-darker'

    udfInput.setOption('theme', udfuTheme)
    uduInput.setOption('theme', udfuTheme)

    if (isElectron) {
      numara.setTheme(app.settings.theme)
      numara.setOnTop(app.settings.alwaysOnTop)
    }

    dom.els('.panelFont, .input .CodeMirror').forEach((el) => {
      el.style.fontSize = app.settings.fontSize
      el.style.fontWeight = app.settings.fontWeight
      el.style.setProperty('line-height', app.settings.lineHeight, 'important')
    })

    if (app.settings.answerPosition !== 'bottom') {
      cm.eachLine((cmLine) => {
        const existingWidget = app.widgetMap.get(cmLine)

        if (existingWidget) {
          existingWidget.clear()
          app.widgetMap.delete(cmLine)
        }
      })
    }

    // Set input/output widths and styles based on answer position
    switch (app.settings.answerPosition) {
      case 'bottom':
        dom.input.style.width = '100%'
        dom.output.style.width = '20px'
        dom.output.style.minWidth = '20px'
        dom.output.style.textAlign = 'right'
        break
      case 'left':
        dom.input.style.width = (store.get('inputWidth') || 60) + '%'
        dom.output.style.minWidth = '120px'
        dom.output.style.textAlign = 'left'
        break
      case 'right':
      default:
        dom.input.style.width = '60%'
        dom.output.style.textAlign = 'right'
        break
    }

    dom.panelDivider.style.display = app.settings.answerPosition === 'left' ? 'block' : 'none'

    cm.setOption('mode', app.settings.syntax ? 'numara' : 'plain')
    cm.setOption('lineNumbers', app.settings.lineNumbers)
    cm.setOption('lineWrapping', app.settings.lineWrap)
    cm.setOption('matchBrackets', app.settings.syntax && app.settings.matchBrackets ? { maxScanLines: 1 } : false)
    cm.setOption('autoCloseBrackets', app.settings.closeBrackets)

    math.config({
      matrix: app.settings.matrixType,
      number: app.settings.numericOutput,
      predictable: app.settings.predictable
    })

    clearInterval(updateInterval)
    if (app.settings.currency && app.settings.currencyInterval !== '0') {
      updateInterval = setInterval(getRates, +app.settings.currencyInterval)
      store.set('rateInterval', true)
    } else {
      store.set('rateInterval', false)
    }

    setTimeout(calculate, 10)
  },

  /** Save settings to local storage. */
  save: () => {
    Object.keys(app.settings).forEach((key) => {
      const el = dom.el('#' + key)

      if (el) {
        app.settings[key] = el.getAttribute('type') === 'checkbox' ? el.checked : el.value
        checkMods(key)
      }
    })

    if (!dom.currency.checked) {
      localStorage.removeItem('rateDate')

      app.currencyRates = {}
    }

    dom.currencyUpdate.style.visibility = dom.currency.checked ? 'visible' : 'hidden'
    dom.currencyWarn.style.display = app.settings.currency ? 'none' : 'inline-block'

    if (!store.get('rateDate') && app.settings.currency) getRates()

    checkDefaults()
    bigNumberWarning()
    localeWarning()

    settings.toggleSubs()

    store.set('settings', app.settings)
  },

  /** Toggle settings sliders to enabled/disabled based on parent setting. */
  toggleSubs: () => {
    // Helper to enable/disable and set opacity for related controls
    const toggle = (el, enabled) => {
      el.disabled = !enabled
      el.parentNode.style.opacity = enabled ? '1' : '0.5'

      const mod = dom.el('#' + el.id + 'Mod')
      if (!mod) return

      mod.style.pointerEvents = enabled ? 'auto' : 'none'
      mod.parentNode.style.opacity = enabled ? '1' : '0.5'
    }

    toggle(dom.keywordTips, app.settings.syntax)
    toggle(dom.matchBrackets, app.settings.syntax)
    toggle(dom.expUpper, app.settings.notation === 'auto')
    toggle(dom.expLower, app.settings.notation === 'auto')
    toggle(dom.copyThouSep, app.settings.thouSep)

    dom.currencyInterval.disabled = !app.settings.currency
    dom.updateRatesLink.dataset.enabled = app.settings.currency
  }
}

dom.defaultSettingsButton.addEventListener('click', () => {
  confirm('All settings will revert back to defaults.', () => {
    app.settings = { ...settings.defaults }

    settings.prep()
    settings.apply()
    settings.save()
  })
})

dom.dialogSettingsReset.addEventListener('click', () => {
  confirm('All user settings and data will be lost.', () => {
    if (isElectron) {
      numara.resetApp()
    } else {
      localStorage.clear()
      location.reload()
    }
  })
})

dom.bigNumWarn.addEventListener('click', () => {
  showError(
    'Caution: BigNumber Limitations',
    `Using the BigNumber may break function plotting and is not compatible with some math functions. 
      It may also cause unexpected behavior and affect overall performance.<br><br>
      <a target="_blank" href="https://mathjs.org/docs/datatypes/bignumbers.html">Read more on BigNumbers</a>`
  )
})

dom.localeWarn.addEventListener('click', () => {
  showError(
    'Caution: Enable locale on user input',
    `This will allow inputs to contain thousands and decimal separators, per user's selected locale, which will be sanitized for the calculations. Since comma (,) is the default argument seperator, with this setting enabled, you must use semicolon (;) as argument separator in all applicable functions. Ex. sum(1;3) // 4 <br><br>Unexpected results may occur so use with caution.`
  )
})

dom.currencyWarn.addEventListener('click', () => {
  showError('App restart needed', `Currencies used in existing calculations will be removed after app restart.`)
})

dom.precision.addEventListener('input', () => {
  dom.precisionLabel.innerHTML = dom.precision.value
})

dom.expLower.addEventListener('input', () => {
  dom.expLowerLabel.innerHTML = dom.expLower.value
})

dom.expUpper.addEventListener('input', () => {
  dom.expUpperLabel.innerHTML = dom.expUpper.value
})

dom.updateRatesLink.addEventListener('click', getRates)

dom.els('.settingItem').forEach((el) => {
  el.addEventListener('change', () => {
    settings.save()
    settings.apply()
  })
})

if (isElectron) {
  dom.resetSizeButton.addEventListener('click', () => {
    numara.resetSize()

    setTimeout(() => {
      modal.show('#dialogSettings')
    }, 10)
  })
}
