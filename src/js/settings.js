import { colors } from './colors'
import { app, store } from './common'
import { dom } from './dom'
import { cm, udfInput, uduInput } from './editor'
import { calculate, math } from './eval'
import { getRates } from './forex'
import { generateIcons } from './icons'
import { confirm, showError } from './modal'
import { checkLocale, checkSize, getTheme, isElectron } from './utils'

import DeepDiff from 'deep-diff'

/** Show/hide Defaults link. */
function checkDefaults() {
  dom.defaultSettingsButton.style.display = DeepDiff.diff(app.settings, settings.defaults) ? 'inline' : 'none'
}

/** Show warning if big number option is selected. */
function bigNumberWarning() {
  dom.bigNumWarn.style.display = app.settings.numericOutput === 'BigNumber' ? 'inline-block' : 'none'
}

/** Show warning if locale uses comma as decimal point separator. */
function localeWarning() {
  dom.localeWarn.style.display = checkLocale() ? 'inline-block' : 'none'
}

/** Check for app settings modifications. */
function checkMods(key) {
  dom.el('#' + key + 'Mod').style.display = app.settings[key] !== settings.defaults[key] ? 'inline-block' : 'none'
}

/** Check for app settings schema changes. */
function checkSchema() {
  app.settings = store.get('settings')

  DeepDiff.observableDiff(app.settings, settings.defaults, (d) => {
    if (d.kind !== 'E') {
      DeepDiff.applyChange(app.settings, settings.defaults, d)

      store.set('settings', app.settings)
    }
  })
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
    if (store.get('settings')) {
      checkSchema()
    } else {
      store.set('settings', settings.defaults)
    }

    app.settings = store.get('settings')

    // Get exchange rates
    if (app.settings.currency) {
      getRates()
    }

    // Start required line height fix
    if (app.settings.lineHeight.endsWith('em')) {
      switch (app.settings.lineHeight) {
        case '1.5em':
          app.settings.lineHeight = '16px'
          break
        case '1.75em':
          app.settings.lineHeight = '20px'
          break
        case '2em':
          app.settings.lineHeight = '24px'
          break
        case '2.5em':
          app.settings.lineHeight = '28px'
          break
        case '3em':
          app.settings.lineHeight = '32px'
          break
      }

      store.set('settings', app.settings)
    }
    // End fix

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

      if (item.getAttribute('type') === 'checkbox') {
        item.parentElement.before(span)
      } else {
        item.before(span)
      }

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

    dom.locale.innerHTML = ''

    for (const l of locales) {
      dom.locale.innerHTML += `<option value="${l[1]}">${l[0]}</option>`
    }

    dom.precisionLabel.innerHTML = app.settings.precision
    dom.expLowerLabel.innerHTML = app.settings.expLower
    dom.expUpperLabel.innerHTML = app.settings.expUpper

    dom.numericOutput.innerHTML = ''

    for (const n of numericOutputs) {
      dom.numericOutput.innerHTML += `<option value="${n}">${n.charAt(0).toUpperCase() + n.slice(1)}</option>`
    }

    dom.notation.innerHTML = ''

    for (const n of notations) {
      dom.notation.innerHTML +=
        n === '-'
          ? '<option disabled>-</option>'
          : `<option value="${n}">${n.charAt(0).toUpperCase() + n.slice(1)}</option>`
    }

    dom.matrixType.innerHTML = ''

    for (const m of matrixTypes) {
      dom.matrixType.innerHTML += `<option value="${m}">${m}</option>`
    }

    dom.lastUpdated.innerHTML = app.settings.currency ? store.get('rateDate') : ''
    dom.currencyUpdate.style.visibility = app.settings.currency ? 'visible' : 'hidden'

    Object.keys(app.settings).forEach((key) => {
      const el = dom.el('#' + key)

      if (el) {
        if (el.getAttribute('type') === 'checkbox') {
          el.checked = app.settings[key]
        } else {
          el.value = app.settings[key]
        }

        checkMods(key)
      }
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

    if (app.settings.currency) {
      if (app.settings.currencyInterval === '0') {
        clearInterval(updateInterval)
        store.set('rateInterval', false)
      } else {
        clearInterval(updateInterval)
        updateInterval = setInterval(getRates, +app.settings.currencyInterval)
        store.set('rateInterval', true)
      }
    }

    if (app.settings.currencyInterval === '0') {
      clearInterval(updateInterval)
    } else {
      clearInterval(updateInterval)
      updateInterval = setInterval(getRates, +app.settings.currencyInterval)
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
    localeWarning()
    bigNumberWarning()

    settings.toggleSubs()

    store.set('settings', app.settings)
  },

  /** Toggle settings sliders to enabled/disabled based on parent setting. */
  toggleSubs: () => {
    dom.expUpper.disabled = app.settings.notation !== 'auto'
    dom.expLower.disabled = app.settings.notation !== 'auto'
    dom.keywordTips.disabled = !app.settings.syntax
    dom.matchBrackets.disabled = !app.settings.syntax
    dom.copyThouSep.disabled = !app.settings.thouSep
    dom.currencyInterval.disabled = !app.settings.currency
    dom.updateRatesLink.dataset.enabled = app.settings.currency

    dom.expUpper.parentNode.style.opacity = app.settings.notation === 'auto' ? '1' : '0.5'
    dom.expLower.parentNode.style.opacity = app.settings.notation === 'auto' ? '1' : '0.5'
    dom.keywordTips.parentNode.style.opacity = app.settings.syntax ? '1' : '0.5'
    dom.matchBrackets.parentNode.style.opacity = app.settings.syntax ? '1' : '0.5'
    dom.copyThouSep.parentNode.style.opacity = app.settings.thouSep ? '1' : '0.5'

    dom.el('#expUpperMod').style.pointerEvents = app.settings.notation === 'auto' ? 'auto' : 'none'
    dom.el('#expLowerMod').style.pointerEvents = app.settings.notation === 'auto' ? 'auto' : 'none'
    dom.el('#keywordTipsMod').style.pointerEvents = app.settings.syntax ? 'auto' : 'none'
    dom.el('#matchBracketsMod').style.pointerEvents = app.settings.syntax ? 'auto' : 'none'
    dom.el('#copyThouSepMod').style.pointerEvents = app.settings.thouSep ? 'auto' : 'none'

    dom.el('#expUpperMod').parentNode.style.opacity = app.settings.notation === 'auto' ? '1' : '0.5'
    dom.el('#expLowerMod').parentNode.style.opacity = app.settings.notation === 'auto' ? '1' : '0.5'
    dom.el('#keywordTipsMod').parentNode.style.opacity = app.settings.syntax ? '1' : '0.5'
    dom.el('#matchBracketsMod').parentNode.style.opacity = app.settings.syntax ? '1' : '0.5'
    dom.el('#copyThouSepMod').parentNode.style.opacity = app.settings.thouSep ? '1' : '0.5'
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

dom.localeWarn.addEventListener('click', () => {
  showError(
    'Caution: Locale',
    `Your locale (${app.settings.locale}) uses comma (,) as decimal separator.  Therefore, you must use semicolon (;) as argument separator when using functions.<br><br>Ex. sum(1;3) // 4`
  )
})

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
