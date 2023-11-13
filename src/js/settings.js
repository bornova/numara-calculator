import { $, $all, app, store } from './common'
import { cm, udfInput, uduInput } from './editor'
import { getRates } from './forex'
import { calculate, math } from './math'
import { checkLocale, checkSize, isElectron } from './utils'

import DeepDiff from 'deep-diff'

/** Show/hide Defaults link. */
function checkDefaults() {
  $('#defaultSettingsButton').style.display = DeepDiff.diff(app.settings, settings.defaults) ? 'inline' : 'none'
}

/** Show warning if big number option is selected. */
function bigNumberWarning() {
  $('#bigNumWarn').style.display = app.settings.numericOutput === 'BigNumber' ? 'inline-block' : 'none'
}

/** Show warning if locale uses comma as decimal point separator. */
function localeWarning() {
  $('#localeWarn').style.display = checkLocale() ? 'inline-block' : 'none'
}

/** Check for app settings modifications. */
function checkMods(key) {
  $('#' + key + 'Mod').style.display = app.settings[key] !== settings.defaults[key] ? 'inline-block' : 'none'
}

/** Check for app settings schema changes. */
function checkSchema() {
  DeepDiff.observableDiff(app.settings, settings.defaults, (d) => {
    if (d.kind !== 'E') {
      DeepDiff.applyChange(app.settings, settings.defaults, d)

      store.set('settings', app.settings)
    }
  })
}

export const settings = {
  /** Default settings. */
  defaults: {
    alwaysOnTop: false,
    autocomplete: true,
    closeBrackets: true,
    contPrevLine: true,
    copyThouSep: false,
    currency: true,
    dateDay: false,
    divider: true,
    expLower: '-12',
    expNotation: false,
    expUpper: '12',
    fontSize: '1.1rem',
    fontWeight: '400',
    inputWidth: 60,
    keywordTips: true,
    lineErrors: true,
    lineHeight: '2em',
    lineNumbers: true,
    lineWrap: true,
    locale: 'system',
    matchBrackets: true,
    matrixType: 'Matrix',
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
    app.settings = store.get('settings')

    if (app.settings) {
      checkSchema()
    } else {
      app.settings = app.settings = JSON.parse(JSON.stringify(settings.defaults))

      store.set('settings', settings.defaults)
    }

    settings.apply()

    $all('.settingItem').forEach((item) => {
      const span = document.createElement('span')
      const icon = document.createElement('span')

      icon.setAttribute('data-lucide', 'undo-2')

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

    $('#locale').innerHTML = ''

    for (const l of locales) {
      $('#locale').innerHTML += `<option value="${l[1]}">${l[0]}</option>`
    }

    $('#precision-label').innerHTML = app.settings.precision
    $('#expLower-label').innerHTML = app.settings.expLower
    $('#expUpper-label').innerHTML = app.settings.expUpper
    $('#numericOutput').innerHTML = ''

    for (const n of numericOutputs) {
      $('#numericOutput').innerHTML += `<option value="${n}">${n.charAt(0).toUpperCase() + n.slice(1)}</option>`
    }

    $('#matrixType').innerHTML = ''

    for (const m of matrixTypes) {
      $('#matrixType').innerHTML += `<option value="${m}">${m}</option>`
    }

    $('#lastUpdated').innerHTML = app.settings.currency ? store.get('rateDate') : ''
    $('#currencyUpdate').style.visibility = app.settings.currency ? 'visible' : 'hidden'

    Object.keys(app.settings).forEach((key) => {
      const el = $('#' + key)

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
    const appTheme =
      app.settings.theme === 'system'
        ? isElectron
          ? numara.isDark()
            ? 'dark'
            : 'light'
          : 'light'
        : app.settings.theme === 'light'
          ? 'light'
          : 'dark'

    $('#style').setAttribute('href', 'css/' + appTheme + '.css')
    $('#numaraLogo').setAttribute('src', 'assets/logo-' + appTheme + '.png')

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

    const elements = $all('.panelFont, .input .CodeMirror')

    for (const el of elements) {
      el.style.fontSize = app.settings.fontSize
      el.style.fontWeight = app.settings.fontWeight
      el.style.setProperty('line-height', app.settings.lineHeight, 'important')
    }

    $('#input').style.width = (app.settings.divider ? app.settings.inputWidth : settings.defaults.inputWidth) + '%'
    $('#panelDivider').style.display = app.settings.divider ? 'block' : 'none'
    $('#output').style.textAlign = app.settings.divider ? 'left' : 'right'

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

    setTimeout(calculate, 10)
  },

  /** Save settings to local storage. */
  save: () => {
    Object.keys(app.settings).forEach((key) => {
      const el = $('#' + key)

      if (el) {
        app.settings[key] = el.getAttribute('type') === 'checkbox' ? el.checked : el.value

        checkMods(key)
      }
    })

    if (!$('#currency').checked) {
      localStorage.removeItem('rateDate')

      app.currencyRates = {}
    }

    $('#currencyUpdate').style.visibility = $('#currency').checked ? 'visible' : 'hidden'

    if (!store.get('rateDate') && app.settings.currency) {
      getRates()
    }

    checkDefaults()
    localeWarning()
    bigNumberWarning()

    store.set('settings', app.settings)
  },

  /** Toggle settings sliders to enabled/disabled based on parent setting. */
  toggleSubs: () => {
    $('#keywordTips').disabled = !$('#syntax').checked
    $('#matchBrackets').disabled = !$('#syntax').checked
    $('#copyThouSep').disabled = !$('#thouSep').checked

    $('#keywordTips').parentNode.style.opacity = $('#syntax').checked ? '1' : '0.5'
    $('#matchBrackets').parentNode.style.opacity = $('#syntax').checked ? '1' : '0.5'
    $('#copyThouSep').parentNode.style.opacity = $('#thouSep').checked ? '1' : '0.5'

    $('#keywordTipsMod').style.pointerEvents = $('#syntax').checked ? 'auto' : 'none'
    $('#matchBracketsMod').style.pointerEvents = $('#syntax').checked ? 'auto' : 'none'
    $('#copyThouSepMod').style.pointerEvents = $('#thouSep').checked ? 'auto' : 'none'

    $('#keywordTipsMod').parentNode.style.opacity = $('#syntax').checked ? '1' : '0.5'
    $('#matchBracketsMod').parentNode.style.opacity = $('#syntax').checked ? '1' : '0.5'
    $('#copyThouSepMod').parentNode.style.opacity = $('#thouSep').checked ? '1' : '0.5'
  }
}
