import { colors } from './colors'
import { dom } from './dom'
import { cm, udfInput, uduInput } from './editor'
import { calculate, math } from './eval'
import { getRates } from './forex'
import { generateIcons } from './icons'
import { confirm, showError } from './modal'
import { app, checkSize, getTheme, isElectron, store } from './utils'

import DeepDiff from 'deep-diff'

/** Show/hide Defaults link. */
function checkDefaults() {
  dom.defaultSettingsButton.style.display = DeepDiff.diff(app.settings, settings.defaults) ? 'inline' : 'none'
}

/** Show warning if big number option is selected. */
function bigNumberWarning() {
  dom.bigNumWarn.style.display = app.settings.numericOutput === 'BigNumber' ? 'inline-block' : 'none'
}

/** Check for app settings modifications. */
function checkMods(key) {
  dom.el('#' + key + 'Mod').style.display = app.settings[key] !== settings.defaults[key] ? 'inline-block' : 'none'
}

/** Check for app settings schema changes. */
function checkSchema() {
  app.settings = store.get('settings')

  DeepDiff.observableDiff(app.settings, settings.defaults, (d) => {
    if (d.kind === 'E') return

    DeepDiff.applyChange(app.settings, settings.defaults, d)
    store.set('settings', app.settings)
  })
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
  for (const opt of options) {
    if (opt === disabledValue) {
      selectEl.innerHTML += `<option disabled>${opt}</option>`
    } else if (Array.isArray(opt)) {
      selectEl.innerHTML += `<option value="${opt[1]}">${opt[0]}</option>`
    } else {
      selectEl.innerHTML += `<option value="${opt}">${opt.charAt(0).toUpperCase() + opt.slice(1)}</option>`
    }
  }
}

let updateInterval

export const settings = {
  /** Default settings. */
  defaults: {
    alwaysOnTop: false,
    autocomplete: true,
    closeBrackets: true,
    contPrevLine: true,
    copyThouSep: false,
    currency: true,
    currencyInterval: '0',
    dateDay: false,
    divider: true,
    expLower: '-12',
    expUpper: '12',
    fontSize: '1.1rem',
    fontWeight: '400',
    inputWidth: 60,
    keywordTips: true,
    lineErrors: true,
    lineHeight: '24px',
    lineNumbers: true,
    lineWrap: true,
    locale: 'en-US',
    matchBrackets: true,
    matrixType: 'Matrix',
    notation: 'auto',
    notifyDuration: '5000',
    notifyLocation: 'bottom-center',
    numericOutput: 'number',
    pasteThouSep: false,
    plotCross: false,
    plotDerivative: false,
    plotGrid: false,
    precision: '4',
    predictable: false,
    rulers: false,
    syntax: true,
    theme: 'system',
    thouSep: true
  },

  /** Initialize settings. */
  initialize: () => {
    store.get('settings') ? checkSchema() : store.set('settings', settings.defaults)

    app.settings = store.get('settings')

    // Get exchange rates
    if (app.settings.currency) {
      getRates()
    }

    dom.els('.settingItem').forEach((item) => {
      const span = document.createElement('span')
      const icon = document.createElement('span')

      icon.setAttribute('data-lucide', 'dot')

      span.setAttribute('id', item.getAttribute('id') + 'Mod')
      span.setAttribute('class', item.getAttribute('type') === 'checkbox' ? 'settingModToggle' : 'settingMod')
      span.appendChild(icon)
      span.addEventListener('click', () => {
        const key = item.getAttribute('id')

        app.settings[key] = settings.defaults[key]

        settings.prep()
        settings.save()
        settings.apply()
      })

      item.getAttribute('type') === 'checkbox' ? item.parentElement.before(span) : item.before(span)

      generateIcons()
    })
  },

  /** Prepare settings dialog items. */
  prep: () => {
    const locales = [
      ['System', 'system'],
      ['Chinese (PRC)', 'zh-CN'],
      ['English (Canada)', 'en-CA'],
      ['English (UK)', 'en-GB'],
      ['English (US)', 'en-US'],
      ['French (France)', 'fr-FR'],
      ['German (Germany)', 'de-DE'],
      ['Italian (Italy)', 'it-IT'],
      ['Japanese (Japan)', 'ja-JP'],
      ['Portuguese (Brazil)', 'pt-BR'],
      ['Russian (Russia)', 'ru-RU'],
      ['Spanish (Mexico)', 'es-MX'],
      ['Spanish (Spain)', 'es-ES'],
      ['Turkish (Turkey)', 'tr-TR']
    ]

    const matrixTypes = ['Matrix', 'Array']
    const numericOutputs = ['number', 'BigNumber', 'Fraction']
    const notations = ['auto', 'engineering', 'exponential', 'fixed', '-', 'bin', 'hex', 'oct']

    populateSelect(dom.locale, locales)
    populateSelect(dom.numericOutput, numericOutputs)
    populateSelect(dom.notation, notations, '-')
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
    bigNumberWarning()

    settings.toggleSubs()
  },

  /** Apply settings. */
  apply: () => {
    const appTheme = getTheme()

    dom.inlineStyle.setAttribute('href', 'css/' + appTheme + '.css')
    dom.numaraLogo.setAttribute('src', 'assets/logo-' + appTheme + '.png')

    setTimeout(() => {
      colors.apply()
    }, 50)

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

    const elements = dom.els('.panelFont, .input .CodeMirror')

    for (const el of elements) {
      el.style.fontSize = app.settings.fontSize
      el.style.fontWeight = app.settings.fontWeight
      el.style.setProperty('line-height', app.settings.lineHeight, 'important')
    }

    dom.input.style.width = (app.settings.divider ? app.settings.inputWidth : settings.defaults.inputWidth) + '%'
    dom.panelDivider.style.display = app.settings.divider ? 'block' : 'none'
    dom.output.style.textAlign = app.settings.divider ? 'left' : 'right'

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

    if (!store.get('rateDate') && app.settings.currency) {
      getRates()
    }

    checkDefaults()
    bigNumberWarning()

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

      if (mod) {
        mod.style.pointerEvents = enabled ? 'auto' : 'none'
        mod.parentNode.style.opacity = enabled ? '1' : '0.5'
      }
    }

    toggle(dom.keywordTips, app.settings.syntax)
    toggle(dom.matchBrackets, app.settings.syntax)
    toggle(dom.expUpper, app.settings.notation === 'auto')
    toggle(dom.expLower, app.settings.notation === 'auto')
    toggle(dom.copyThouSep, app.settings.thouSep)
    toggle(dom.pasteThouSep, app.settings.thouSep)

    dom.currencyInterval.disabled = !app.settings.currency
    dom.updateRatesLink.dataset.enabled = app.settings.currency
  }
}

dom.defaultSettingsButton.addEventListener('click', () => {
  confirm('All settings will revert back to defaults.', () => {
    app.settings = JSON.parse(JSON.stringify(settings.defaults))
    app.colors = JSON.parse(JSON.stringify(colors.defaults))

    store.set('settings', app.settings)
    store.set('colors', app.colors)

    settings.prep()
    settings.save()
    settings.apply()
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

if (isElectron) {
  dom.resetSizeButton.addEventListener('click', numara.resetSize)
}

dom.bigNumWarn.addEventListener('click', () => {
  showError(
    'Caution: BigNumber Limitations',
    `Using the BigNumber may break function plotting and is not compatible with some math functions. 
      It may also cause unexpected behavior and affect overall performance.<br><br>
      <a target="_blank" href="https://mathjs.org/docs/datatypes/bignumbers.html">Read more on BigNumbers</a>`
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
