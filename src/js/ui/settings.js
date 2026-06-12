import { colors } from './colors'
import { dom } from '../dom'
import { cm, udfInput, uduInput } from '../editor/editor'
import { calculate, clearEvaluationCache, math } from '../eval'
import { getRates } from '../calc/forex'
import { confirm, modal, showError } from './modal'
import { setupSidePanel } from './pages'
import { app, checkSize, getTheme, isElectron, store } from '../utils'
import { triggerFolderSync } from '../sync'

import { applyChange, observableDiff } from '@bornova/deep-diff'

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

/** Configures warnings by checking a condition mapped to a dom component. */
function checkWarnings() {
  dom.bigNumWarn.style.display = app.settings.numericOutput === 'BigNumber' ? 'inline-block' : 'none'
  dom.localeWarn.style.display = app.settings.thouSep && app.settings.inputLocale ? 'inline-block' : 'none'
}

/**
 * Populates a select HTML element with given options.
 *
 * @param {HTMLSelectElement} selectEl - The select element to populate.
 * @param {Array<string|Array>} options - The options to add. Each option can be a string or an array [label, value].
 * @param {string|null} [disabledValue=null] - An optional value to disable in the select options.
 */
function populateSelect(selectEl, options, disabledValue = null) {
  const htmlOptions = options.map((option) => {
    const [value, opt] = Object.entries(option)[0]

    return value === disabledValue ? `<option disabled>${opt}</option>` : `<option value="${value}">${opt}</option>`
  })

  selectEl.innerHTML = htmlOptions.join('')
}

let updateInterval

export const settings = {
  /** Default settings. */
  defaults: {
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
    dateFormat: 'system',
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
    pageListPosition: 'auto',
    precision: '4',
    calcTimeout: '10',
    predictable: false,
    rulers: false,
    syntax: true,
    theme: 'system',
    thouSep: true
  },

  /** Initialize settings. */
  initialize: async () => {
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
      if (item.getAttribute('id') === 'syncDir') return

      const span = document.createElement('span')
      const icon = dom.icons.Dot

      span.setAttribute('id', item.getAttribute('id') + 'Mod')
      span.setAttribute('class', item.getAttribute('type') === 'checkbox' ? 'settingModToggle' : 'settingMod')
      span.innerHTML = icon
      span.addEventListener('click', async () => {
        const key = item.getAttribute('id')

        app.settings[key] = settings.defaults[key]

        await settings.prep()
        settings.save()
        await settings.apply()
      })

      item.getAttribute('type') === 'checkbox' ? item.parentElement.before(span) : item.parentElement.prepend(span)
    })

    if (app.settings.currency && (app.settings.currencyInterval !== 'manual' || !store.get('rateDate'))) getRates()
  },

  /** Prepare settings dialog items. */
  prep: async () => {
    const locales = [
      { system: 'System' },
      { period: 'Comma (1,234.56)' },
      { comma: 'Period (1.234,56)' },
      { disabled: 'Disabled' }
    ]
    const dateFormats = [
      { system: 'System' },
      { 'MM/dd/yyyy': 'MM/DD/YYYY' },
      { 'dd/MM/yyyy': 'DD/MM/YYYY' },
      { 'yyyy-MM-dd': 'YYYY-MM-DD' }
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
    populateSelect(dom.dateFormat, dateFormats)
    populateSelect(dom.numericOutput, numericOutputs)
    populateSelect(dom.notation, notations, 'spacer')
    populateSelect(dom.matrixType, matrixTypes)

    dom.precisionLabel.textContent = app.settings.precision
    dom.calcTimeoutLabel.textContent = app.settings.calcTimeout
    dom.expLowerLabel.textContent = app.settings.expLower
    dom.expUpperLabel.textContent = app.settings.expUpper
    dom.lastUpdated.textContent = app.settings.currency ? store.get('rateDate') : ''
    dom.currencyUpdate.style.visibility = app.settings.currency ? 'visible' : 'hidden'

    Object.keys(app.settings).forEach((key) => {
      const el = dom.el('#' + key)

      if (!el) return

      el[el.getAttribute('type') === 'checkbox' ? 'checked' : 'value'] = app.settings[key]

      checkMods(key)
    })

    const currentTheme = app.settings.theme

    dom.els('.theme-pill-button').forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-theme-value') === currentTheme)
    })

    const syncDirPathDisplay = dom.el('#syncDirPathDisplay')

    if (syncDirPathDisplay) {
      syncDirPathDisplay.textContent = app.settings.syncDir || 'No folder chosen'
    }

    const syncDirSection = dom.el('#syncDirSection')

    if (syncDirSection) {
      syncDirSection.style.display = app.settings.syncDirEnabled ? 'grid' : 'none'
    }

    const syncTab = dom.el('#syncTab')

    if (syncTab) {
      syncTab.style.display = isElectron ? '' : 'none'
    }

    const alwaysOnTopContainer = dom.el('#alwaysOnTopContainer')

    if (alwaysOnTopContainer) {
      alwaysOnTopContainer.style.display = isElectron ? '' : 'none'
    }

    await checkSize()
    checkDefaults()
    checkWarnings()

    settings.toggleSubs()
  },

  /** Apply settings. */
  apply: async () => {
    clearEvaluationCache()

    const appTheme = await getTheme()
    const cssColorScheme =
      app.settings.theme === 'light' ? 'light' : app.settings.theme === 'dark' ? 'dark' : 'light dark'

    document.documentElement.style.colorScheme = cssColorScheme

    dom.numaraLogo.setAttribute('src', 'assets/logo-' + appTheme + '.png')

    setTimeout(colors.apply, 50)

    const udfuTheme =
      app.settings.theme === 'system'
        ? isElectron
          ? (await numara.isDark())
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

    dom.mainPanel.classList.toggle('showRulers', app.settings.rulers)

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

    const interval = +app.settings.currencyInterval

    if (app.settings.currency && interval > 0) {
      updateInterval = setInterval(getRates, interval)

      store.set('rateInterval', true)
    } else {
      store.set('rateInterval', false)
    }

    if (app.settings.syncDirEnabled && !app.settings.syncDir) {
      app.settings.syncDirEnabled = false
      store.set('settings', app.settings)
      const syncDirEnabledCheckbox = dom.el('#syncDirEnabled')
      if (syncDirEnabledCheckbox) {
        syncDirEnabledCheckbox.checked = false
      }
    }

    const syncDirSection = dom.el('#syncDirSection')
    if (syncDirSection) {
      syncDirSection.style.display = app.settings.syncDirEnabled ? 'grid' : 'none'
    }

    if (isElectron) {
      if (app.settings.syncDirEnabled && app.settings.syncDir) {
        numara.startWatchingSyncDir(app.settings.syncDir)
      } else {
        numara.stopWatchingSyncDir()
      }
    }

    setupSidePanel()

    calculate()
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
      store.remove('rateDate')
    }

    dom.currencyUpdate.style.visibility = dom.currency.checked ? 'visible' : 'hidden'
    dom.currencyWarn.style.display = app.settings.currency ? 'none' : 'inline-block'

    if (!store.get('rateDate') && app.settings.currency) {
      getRates()
    }

    checkDefaults()
    checkWarnings()

    settings.toggleSubs()

    store.set('settings', app.settings)
  },

  /** Toggle settings sliders to enabled/disabled based on parent setting. */
  toggleSubs: () => {
    const toggle = (el, enabled) => {
      el.disabled = !enabled
      el.parentNode.style.opacity = enabled ? '1' : '0.5'

      const mod = dom.el(`#${el.id}Mod`)

      if (mod) {
        mod.style.pointerEvents = enabled ? 'auto' : 'none'
        mod.parentNode.style.opacity = enabled ? '1' : '0.5'
      }
    }

    app.settings.thouSep = app.settings.locale !== 'disabled'

    toggle(dom.keywordTips, app.settings.syntax)
    toggle(dom.matchBrackets, app.settings.syntax)

    const isAutoNotation = app.settings.notation === 'auto'

    toggle(dom.expUpper, isAutoNotation)
    toggle(dom.expLower, isAutoNotation)
    toggle(dom.inputLocale, app.settings.thouSep)
    toggle(dom.copyThouSep, app.settings.thouSep)

    dom.currencyInterval.disabled = !app.settings.currency
    dom.updateRatesLink.dataset.enabled = app.settings.currency
  }
}

dom.defaultSettingsButton.addEventListener('click', () => {
  confirm('All settings will revert back to defaults.', async () => {
    app.settings = { ...settings.defaults }

    await settings.prep()
    await settings.apply()
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
      <a target="_blank" rel="noopener noreferrer" href="https://mathjs.org/docs/datatypes/bignumbers.html">Read more on BigNumbers</a>`
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

dom.calcTimeout.addEventListener('input', () => {
  dom.calcTimeoutLabel.innerHTML = dom.calcTimeout.value
})

dom.expLower.addEventListener('input', () => {
  dom.expLowerLabel.innerHTML = dom.expLower.value
})

dom.expUpper.addEventListener('input', () => {
  dom.expUpperLabel.innerHTML = dom.expUpper.value
})

dom.updateRatesLink.addEventListener('click', getRates)

dom.els('.theme-pill-button').forEach((btn) => {
  btn.addEventListener('click', () => {
    const val = btn.getAttribute('data-theme-value')
    const themeInput = dom.el('#theme')

    if (themeInput && themeInput.value !== val) {
      themeInput.value = val
      themeInput.dispatchEvent(new Event('change'))

      dom.els('.theme-pill-button').forEach((b) => {
        b.classList.toggle('active', b.getAttribute('data-theme-value') === val)
      })
    }
  })
})

if (isElectron) {
  const selectSyncDirButton = dom.el('#selectSyncDirButton')
  if (selectSyncDirButton) {
    selectSyncDirButton.addEventListener('click', async () => {
      const path = await numara.selectSyncDirectory()
      if (path) {
        const syncDirInput = dom.el('#syncDir')
        if (syncDirInput) {
          syncDirInput.value = path
          syncDirInput.dispatchEvent(new Event('change'))
        }
        const syncDirPathDisplay = dom.el('#syncDirPathDisplay')
        if (syncDirPathDisplay) {
          syncDirPathDisplay.textContent = path
        }
      }
    })
  }
}

dom.els('.settingItem').forEach((el) => {
  el.addEventListener('change', async () => {
    const id = el.getAttribute('id')

    if (id === 'syncDirEnabled' && el.checked && !dom.el('#syncDir').value) {
      const path = await numara.selectSyncDirectory()
      if (path) {
        dom.el('#syncDir').value = path
        const syncDirPathDisplay = dom.el('#syncDirPathDisplay')
        if (syncDirPathDisplay) {
          syncDirPathDisplay.textContent = path
        }
      } else {
        el.checked = false
        showError('Sync Folder Required', 'A folder must be chosen to enable directory sync.')
      }
    }

    settings.save()
    await settings.apply()

    if (id === 'syncDirEnabled' || id === 'syncDir') {
      if (app.settings.syncDirEnabled && app.settings.syncDir) {
        triggerFolderSync().catch(console.error)
      }
    }
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
