import UIkit from 'uikit'

import { calculate, clearEvaluationCache } from '../calc/calcManager.js'
import { getRates } from '../calc/currencies.js'
import { syncOutputHeights } from '../calc/outputRenderer.js'
import { reapplyMainThreadUdu } from '../calc/userDefined.js'
import { refreshCurrencyState } from '../core/mathInstance.js'
import { isCommaDecimal } from '../core/utils.js'
import { dom } from '../dom.js'
import { cm } from '../editor/index.js'
import { clearSyncCache, triggerFolderSync, updateSyncUiState } from '../pages/sync.js'
import { app, DEFAULT_INPUT_WIDTH, DEFAULT_SETTINGS, SETTING_SELECT_OPTIONS } from '../state/appState.js'
import { DEFAULT_APP_HEIGHT, DEFAULT_APP_WIDTH, isElectron, isLinux, isMac } from '../state/env.js'
import { initStoreObject, store } from '../state/store.js'
import { confirm, modal, showError } from './dialogs.js'
import { checkSize, getDockedPageListWidth, setupPageList } from './pageList.js'
import { colors } from './theme.js'

let updateInterval
let eventsInitialized = false

const RANGE_KEYS = ['precision', 'expUpper', 'expLower', 'calcTimeout']

const FONT_SIZE_ZOOM_MAP = {
  smaller: { '12px': '11px', '13px': '12px', '14px': '13px', '15px': '14px', '16px': '15px' },
  normal: { '12px': '12px', '13px': '13px', '14px': '14px', '15px': '15px', '16px': '16px' },
  larger: { '12px': '13px', '13px': '14px', '14px': '15px', '15px': '16px', '16px': '17px' }
}

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
 * @param {Array<[string|null, string]>} options Ordered `[value, label]` tuples (`null` value renders a disabled option).
 */
function populateSelect(selectEl, options) {
  selectEl.innerHTML = options
    .map(([value, label]) =>
      value === null ? `<option disabled>${label}</option>` : `<option value="${value}">${label}</option>`
    )
    .join('')
}

/**
 * Binds UI event listeners for settings dialog controls.
 */
function setupSettingsEvents() {
  if (eventsInitialized) return

  eventsInitialized = true

  UIkit.util.on('#dialogSettings', 'beforeshow', settings.prep, { self: true })

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
      `When ${app.settings.numberFormat} format is selected, comma (,) is used as the decimal separator. Therefore, you must use semicolon (;) as the argument separator in all applicable functions. Ex. sum(1;3) // 4`
    )
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
        } else if (!isElectron) {
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
 * Get the active application theme ('dark' or 'light').
 * @returns {Promise<string>} Resolves to 'dark' or 'light'.
 */
async function getTheme() {
  const theme = app.settings.theme

  if (theme === 'dark') return 'dark'
  if (theme !== 'system') return 'light'

  const prefersDark = isElectron ? await numara.isDark() : window.matchMedia('(prefers-color-scheme: dark)').matches

  return prefersDark ? 'dark' : 'light'
}

/**
 * Apply input/output panel widths and styles based on the current answerPosition setting.
 */
function applyAnswerPositionLayout() {
  const pos = app.settings.answerPosition
  const isBottom = pos === 'bottom'
  const isLeft = pos === 'left'

  dom.input.style.width = isBottom
    ? '100%'
    : isLeft
      ? `${store.get('inputWidth') ?? DEFAULT_INPUT_WIDTH}%`
      : `${DEFAULT_INPUT_WIDTH}%`
  dom.output.style.width = isBottom ? '20px' : ''
  dom.output.style.minWidth = isBottom ? '20px' : isLeft ? '120px' : ''
  dom.output.style.textAlign = isLeft ? 'left' : 'right'
  dom.panelDivider.style.display = isLeft ? 'block' : 'none'
}

export const settings = {
  /** Default settings. */
  defaults: DEFAULT_SETTINGS,

  /** Initialize settings. */
  initialize: async () => {
    setupSettingsEvents()

    app.settings = initStoreObject('settings', settings.defaults)

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

    for (const [id, options] of Object.entries(SETTING_SELECT_OPTIONS)) {
      populateSelect(dom[id], options)
    }

    dom.els('#alwaysOnTopContainer, #showTrayContainer, #escToCloseContainer, #syncTab').forEach((el) => {
      el.style.display = isElectron ? '' : 'none'
    })

    if (dom.openAtLoginContainer) {
      dom.openAtLoginContainer.style.display = isElectron && !isLinux ? '' : 'none'
    }

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
    clearEvaluationCache()

    await settings.setTheme()
    if (app.colors) colors.apply()
    if (refreshCurrencyState(app.currencies, app.settings.currency)) {
      reapplyMainThreadUdu()
    }

    if (isElectron) {
      numara.setTheme(app.settings.theme)
      numara.setOnTop(app.settings.alwaysOnTop)
      numara.setTray(app.settings.showTray)
      numara.setOpenAtLogin(app.settings.openAtLogin)
    }

    const zoomLevel = app.settings.zoomLevel || 'normal'
    document.documentElement.dataset.zoom = zoomLevel

    const effectiveFontSize = FONT_SIZE_ZOOM_MAP[zoomLevel]?.[app.settings.fontSize] || app.settings.fontSize
    const effectiveLineHeight = LINE_HEIGHT_ZOOM_MAP[zoomLevel]?.[app.settings.lineHeight] || app.settings.lineHeight

    dom.els('.panelFont, .input .CodeMirror').forEach((el) => {
      el.style.fontSize = effectiveFontSize
      el.style.fontWeight = app.settings.fontWeight
      el.style.setProperty('line-height', effectiveLineHeight, 'important')
    })

    dom.mainPanel.classList.toggle('showRulers', app.settings.rulers)
    dom.mainPanel.classList.toggle('truncateAnswers', app.settings.truncateAnswers)
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
    const prevCurrency = app.settings.currency
    const prevInterval = app.settings.currencyInterval

    Object.keys(app.settings).forEach((key) => {
      const el = dom.el('#' + key)

      if (el) {
        app.settings[key] = el.getAttribute('type') === 'checkbox' ? el.checked : el.value
        checkMods(key)
      }
    })

    if (!app.settings.currency) {
      store.remove('rateDate')
    }

    if (
      app.settings.currency &&
      (!prevCurrency || (prevInterval === 'manual' && app.settings.currencyInterval !== 'manual')) &&
      !store.get('rateDate')
    ) {
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

        if (mod.parentNode !== el.parentNode) {
          mod.style.opacity = enabled ? '1' : '0.5'
        }
      }
    }

    toggle(dom.keywordTips, app.settings.syntax)
    toggle(dom.matchBrackets, app.settings.syntax)

    const isAutoNotation = app.settings.notation === 'auto'

    toggle(dom.expUpper, isAutoNotation)
    toggle(dom.expLower, isAutoNotation)
    dom.expUpperLabel.style.opacity = isAutoNotation ? '1' : '0.5'
    dom.expLowerLabel.style.opacity = isAutoNotation ? '1' : '0.5'

    toggle(dom.copyThouSep, app.settings.thouSep)

    const isCurrency = app.settings.currency

    dom.currencyInterval.disabled = !isCurrency
    dom.currencyInterval.style.opacity = isCurrency ? '1' : '0.5'
    dom.updateRatesLink.dataset.enabled = isCurrency

    const currencyIntervalMod = dom.el('#currencyIntervalMod')
    if (currencyIntervalMod) {
      currencyIntervalMod.style.pointerEvents = isCurrency ? 'auto' : 'none'
      currencyIntervalMod.style.opacity = isCurrency ? '1' : '0.5'
    }
  }
}
