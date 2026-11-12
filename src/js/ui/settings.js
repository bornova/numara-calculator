import UIkit from 'uikit'

import { calculate, clearEvaluationCache, syncOutputHeights } from '../calc/calcManager.js'
import { getRates } from '../calc/currencies.js'
import { app as coreApp } from '../core/mathInstance.js'
import { isCommaDecimal, resolveEditorFontSize } from '../core/utils.js'
import { dom } from '../dom.js'
import { cm } from '../editor/index.js'
import { clearSyncCache, triggerFolderSync, updateSyncUiState } from '../pages/sync.js'
import { app } from '../state/appState.js'
import {
  checkSize,
  DEFAULT_APP_HEIGHT,
  DEFAULT_APP_WIDTH,
  getTheme,
  isElectron,
  isMac,
  isMobile
} from '../state/env.js'
import { migrateFromV7 } from '../state/migration.js'
import { initStoreObject, store } from '../state/store.js'
import { confirm, modal, showError } from './dialogs.js'
import { getDockedPageListWidth, setupPageList } from './pageList.js'
import { colors } from './theme.js'

let updateInterval
let eventsInitialized = false

const RANGE_KEYS = ['precision', 'expUpper', 'expLower', 'calcTimeout']

const LINE_HEIGHT_ZOOM_MAP = {
  smaller: { '17px': '16px', '21px': '20px', '26px': '24px', '30px': '28px', '34px': '32px' },
  normal: { '17px': '17px', '21px': '21px', '26px': '26px', '30px': '30px', '34px': '34px' },
  larger: { '17px': '18px', '21px': '22px', '26px': '28px', '30px': '32px', '34px': '36px' }
}

/**
 * Check if a setting is modified from its default value and toggle its indicator dot.
 * @param {string} key The setting key.
 */
function checkMods(key) {
  const el = dom.el('#' + key + 'Mod')

  if (el) {
    el.style.display = app.settings[key] !== settings.defaults[key] ? 'inline-block' : 'none'
  }
}

/** Configures warnings by checking a condition mapped to a dom component. */
function checkWarnings() {
  dom.bigNumWarn.style.display = app.settings.numericOutput === 'BigNumber' ? 'inline-flex' : 'none'
  dom.localeWarn.style.display = isCommaDecimal(app.settings) ? 'inline-flex' : 'none'
}

/**
 * Populates a select HTML element with given options.
 *
 * @param {HTMLSelectElement} selectEl The select element to populate.
 * @param {Record<string, string>} options Value-to-label map.
 * @param {string|null} [disabledValue=null] An optional value to disable in the select options.
 */
function populateSelect(selectEl, options, disabledValue = null) {
  selectEl.innerHTML = Object.entries(options)
    .map(([value, label]) =>
      value === disabledValue ? `<option disabled>${label}</option>` : `<option value="${value}">${label}</option>`
    )
    .join('')
}

/**
 * Binds UI event listeners for settings dialog controls.
 */
function setupSettingsEvents() {
  if (eventsInitialized) return

  eventsInitialized = true

  if (isElectron) {
    numara.themeUpdate(() => settings.setTheme())
  }

  dom.defaultSettingsButton.addEventListener('click', () => {
    confirm('All settings will revert back to defaults.', async (keepSync = dom.confirmKeepSync?.checked) => {
      const currentSyncDir = app.settings.syncDir
      const currentSyncDirEnabled = app.settings.syncDirEnabled

      app.settings = { ...settings.defaults }

      if (keepSync) {
        app.settings.syncDir = currentSyncDir
        app.settings.syncDirEnabled = currentSyncDirEnabled
      }

      store.remove('inputWidth')
      store.remove('pageListWidth')

      await settings.prep()
      await settings.apply()
      settings.save()

      setTimeout(() => {
        modal.center('#dialogSettings', true)
      }, 250)
    })

    if (app.settings.syncDirEnabled && dom.confirmKeepSyncContainer) {
      dom.confirmKeepSyncContainer.style.display = 'block'
    }
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
      <a target="_blank" rel="noopener noreferrer" href="https://mathjs.org/docs/datatypes/bignumbers.html">Read more on BigNumbers</a>`,
      true
    )
  })

  dom.localeWarn.addEventListener('click', () => {
    showError(
      'Caution: Semicolon argument separator',
      `When ${app.settings.numberFormat} format is selected, comma (,) is used as the decimal separator. Therefore, you must use semicolon (;) as the argument separator in all applicable functions. Ex. sum(1;3) // 4`,
      true
    )
  })

  dom.currencyWarn.addEventListener('click', () => {
    showError('App restart needed', `Currencies used in existing calculations will be removed after app restart.`)
  })

  RANGE_KEYS.forEach((key) => {
    dom[key].addEventListener('input', () => {
      dom[`${key}Label`].textContent = dom[key].value
    })
  })

  dom.updateRatesLink.addEventListener('click', () => getRates(true))

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
    if (dom.selectSyncDirButton) {
      dom.selectSyncDirButton.addEventListener('click', async (e) => {
        e.preventDefault()
        const path = await numara.selectSyncDirectory()

        if (path) {
          updateSyncUiState(dom.syncDirEnabled?.checked ?? true, path)
          dom.syncDir?.dispatchEvent(new Event('change'))
        }
      })

      dom.selectSyncDirButton.addEventListener('contextmenu', (e) => {
        e.preventDefault()
        if (app.settings.syncDir) {
          numara.syncDirContextMenu(app.settings.syncDir)
        }
      })
    }
  }

  dom.els('.settingItem').forEach((el) => {
    el.addEventListener('change', async () => {
      const id = el.getAttribute('id')

      if (id === 'syncDirEnabled' && el.checked && !dom.syncDir.value) {
        const path = await numara.selectSyncDirectory()

        if (path) {
          updateSyncUiState(true, path)
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
        } else {
          clearSyncCache()
        }
      }

      if (id === 'pageListPosition' || id === 'zoomLevel') {
        setTimeout(() => {
          modal.center('#dialogSettings', true)
        }, 250)
      }
    })
  })

  if (isElectron) {
    dom.resetSizeButton.addEventListener('click', async () => {
      UIkit.tooltip(dom.resetSizeButton)?.hide()
      const pageListWidth = app.settings.pageListPosition === 'dock' ? getDockedPageListWidth() : 0

      await numara.resetSize(DEFAULT_APP_WIDTH, DEFAULT_APP_HEIGHT, pageListWidth)
      setupPageList(true, true)
      modal.centerOpen(true, DEFAULT_APP_WIDTH + pageListWidth, DEFAULT_APP_HEIGHT)

      setTimeout(() => {
        checkSize()
        modal.center('#dialogSettings', true)
      }, 250)
    })
  }
}

/**
 * Apply input/output panel widths and styles based on the current answerPosition setting.
 */
function applyAnswerPositionLayout() {
  const pos = app.settings.answerPosition
  const isBottom = pos === 'bottom'
  const isLeft = pos === 'left'

  dom.input.style.width = isBottom ? '100%' : isLeft ? `${store.get('inputWidth') ?? 60}%` : '60%'
  dom.output.style.width = isBottom ? '20px' : ''
  dom.output.style.minWidth = isBottom ? '20px' : isLeft ? '120px' : ''
  dom.output.style.textAlign = isLeft ? 'left' : 'right'
  dom.panelDivider.style.display = isLeft ? 'block' : 'none'
}

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
    dateFormat: 'MM/dd/yyyy',
    expLower: '-12',
    expUpper: '12',
    fontSize: '14px',
    fontWeight: '400',
    inputWidth: 60,
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
  },

  /** Initialize settings. */
  initialize: async () => {
    setupSettingsEvents()

    app.settings = initStoreObject('settings', settings.defaults, migrateFromV7)
    coreApp.settings = app.settings

    dom.els('.settingItem').forEach((item) => {
      const id = item.getAttribute('id')

      if (id === 'syncDir' || id === 'syncDirEnabled') return

      const span = document.createElement('span')

      span.id = `${id}Mod`
      span.className = 'settingMod'
      span.innerHTML = dom.icons.Dot
      span.addEventListener('click', async () => {
        app.settings[id] = settings.defaults[id]

        await settings.prep()
        settings.save()
        await settings.apply()

        if (id === 'pageListPosition' || id === 'zoomLevel') {
          setTimeout(() => {
            modal.center('#dialogSettings', true)
          }, 250)
        }
      })

      if (item.getAttribute('type') === 'checkbox') {
        item.parentElement.parentElement.prepend(span)
      } else {
        item.parentElement.prepend(span)
      }
    })

    populateSelect(dom.answerPosition, {
      left: 'Left (with divider)',
      right: 'Right (no divider)',
      bottom: 'Below Expression'
    })
    populateSelect(dom.numberFormat, {
      '1,234.56': '1,234.56',
      '1.234,56': '1.234,56',
      '1 234.56': '1 234.56',
      '1 234,56': '1 234,56'
    })
    populateSelect(dom.dateFormat, {
      'MM/dd/yyyy': 'MM/DD/YYYY',
      'dd/MM/yyyy': 'DD/MM/YYYY',
      'yyyy-MM-dd': 'YYYY-MM-DD'
    })
    populateSelect(dom.numericOutput, { number: 'Number', BigNumber: 'BigNumber', Fraction: 'Fraction' })
    populateSelect(
      dom.notation,
      {
        auto: 'Auto',
        engineering: 'Engineering',
        exponential: 'Exponential',
        fixed: 'Fixed',
        spacer: '-',
        bin: 'Binary',
        hex: 'Hexadecimal',
        oct: 'Octal'
      },
      'spacer'
    )
    populateSelect(dom.matrixType, { Matrix: 'Matrix', Array: 'Array' })

    dom
      .els('#alwaysOnTopContainer, #showTrayContainer, #openAtLoginContainer, #escToCloseContainer, #syncTab')
      .forEach((el) => {
        el.style.display = isElectron ? '' : 'none'
      })

    const showTrayLabel = dom.el('#showTrayContainer [data-help="showTray"]')
    if (showTrayLabel) {
      showTrayLabel.textContent = isMac ? 'Keep in menu bar' : 'Keep in system tray'
    }

    await settings.prep()

    if (app.settings.currency && (app.settings.currencyInterval !== 'manual' || !store.get('rateDate'))) getRates()
  },

  /** Prepare settings dialog items. */
  prep: async () => {
    RANGE_KEYS.forEach((key) => {
      dom[`${key}Label`].textContent = app.settings[key]
    })

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

    updateSyncUiState(app.settings.syncDirEnabled, app.settings.syncDir)

    await checkSize()
    checkWarnings()

    settings.toggleSubs()
  },

  /**
   * Apply active theme to the document and logo.
   * @returns {Promise<void>}
   */
  setTheme: async () => {
    const appTheme = await getTheme()
    const cssColorScheme =
      app.settings.theme === 'light' ? 'light' : app.settings.theme === 'dark' ? 'dark' : 'light dark'

    document.documentElement.style.colorScheme = cssColorScheme

    dom.numaraLogo.setAttribute('src', 'assets/logo-' + appTheme + '.png')
  },

  /**
   * Apply settings.
   * @param {boolean} [shouldCalculate=true] Whether to trigger a recalculation after applying settings.
   */
  apply: async (shouldCalculate = true) => {
    coreApp.settings = app.settings
    clearEvaluationCache()

    await settings.setTheme()
    if (app.colors) colors.apply()

    if (isElectron) {
      numara.setTheme(app.settings.theme)
      numara.setOnTop(app.settings.alwaysOnTop)
      numara.setTray(app.settings.showTray)
      numara.setOpenAtLogin(app.settings.openAtLogin)
    }

    const zoomLevel = app.settings.zoomLevel || 'normal'
    document.documentElement.dataset.zoom = zoomLevel

    const effectiveFontSize = resolveEditorFontSize(app.settings.fontSize, zoomLevel, isMac || isMobile)
    const effectiveLineHeight = LINE_HEIGHT_ZOOM_MAP[zoomLevel]?.[app.settings.lineHeight] || app.settings.lineHeight

    dom.els('.panelFont, .input .CodeMirror').forEach((el) => {
      el.style.fontSize = effectiveFontSize
      el.style.fontWeight = app.settings.fontWeight
      el.style.setProperty('line-height', effectiveLineHeight, 'important')
    })

    dom.mainPanel.classList.toggle('showRulers', app.settings.rulers)
    dom.output.classList.toggle('truncateAnswers', app.settings.truncateAnswers)

    if (app.settings.answerPosition !== 'bottom') {
      cm.eachLine((cmLine) => {
        const existingWidget = app.widgetMap.get(cmLine)

        if (existingWidget) {
          existingWidget.clear()
          app.widgetMap.delete(cmLine)
        }
      })
    }

    applyAnswerPositionLayout()

    cm.setOption('mode', app.settings.syntax ? 'numara' : 'plain')
    cm.setOption('lineNumbers', app.settings.lineNumbers)
    cm.setOption('lineWrapping', app.settings.lineWrap)
    cm.setOption('matchBrackets', app.settings.syntax && app.settings.matchBrackets ? { maxScanLines: 1 } : false)
    cm.setOption('autoCloseBrackets', app.settings.closeBrackets)

    clearInterval(updateInterval)

    const interval = +app.settings.currencyInterval

    if (app.settings.currency && interval > 0) {
      updateInterval = setInterval(getRates, interval)
    }

    if (app.settings.syncDirEnabled && !app.settings.syncDir) {
      app.settings.syncDirEnabled = false
      store.set('settings', app.settings)
    }

    updateSyncUiState(app.settings.syncDirEnabled, app.settings.syncDir)

    if (isElectron && shouldCalculate) {
      if (app.settings.syncDirEnabled && app.settings.syncDir) {
        numara.startWatchingSyncDir(app.settings.syncDir)
      } else {
        numara.stopWatchingSyncDir()
        clearSyncCache()
      }
    }

    setupPageList(true)
    cm.refresh()
    syncOutputHeights()
    await checkSize()

    if (shouldCalculate) {
      calculate()
    }
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

    dom.currencyWarn.style.display = app.settings.currency ? 'none' : 'inline-flex'

    if (!store.get('rateDate') && app.settings.currency) {
      getRates()
    }

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

    toggle(dom.keywordTips, app.settings.syntax)
    toggle(dom.matchBrackets, app.settings.syntax)

    const isAutoNotation = app.settings.notation === 'auto'

    toggle(dom.expUpper, isAutoNotation)
    toggle(dom.expLower, isAutoNotation)
    toggle(dom.copyThouSep, app.settings.thouSep)

    dom.currencyInterval.disabled = !app.settings.currency
    dom.updateRatesLink.dataset.enabled = app.settings.currency
  }
}
