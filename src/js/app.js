import { description } from '../../package.json'
import { setupCalcManager } from './calc/calcManager.js'
import { initCurrencies } from './calc/currencies.js'
import { setupUserDefined } from './calc/userDefined.js'
import { cm, setupEditor } from './editor/index.js'
import { isSearchPanelOpen } from './editor/searchPanel.js'
import { setupPageIo } from './pages/pageIo.js'
import { initializePages } from './pages/pageManager.js'
import { initializeSync, setupSync } from './pages/sync.js'
import { isElectron, isMobile } from './state/env.js'
import { migrateAppState } from './state/migration.js'
import { initializeContextMenus } from './ui/contextMenu.js'
import { isModalOpen, setupUIkitUtils } from './ui/dialogs.js'
import { generateIcons } from './ui/icons.js'
import { setupAppButtons, setupHeaders, setupPanelResizer, setupResultActions, setupSyncScroll } from './ui/layout.js'
import { initializePageList } from './ui/pageList.js'
import { setupPlot } from './ui/plot.js'
import { setupPrintArea } from './ui/print.js'
import { settings } from './ui/settings.js'
import { initializeSettingsTooltips } from './ui/settingsTips.js'
import { setupKeyboardShortcuts } from './ui/shortcuts.js'
import { colors } from './ui/theme.js'
import { checkAppUpdate, initAppUpdate, setupAppInfo } from './ui/updater.js'

/**
 * Bootstraps the application, initializes settings, currencies, colors, and UI layout.
 * @returns {Promise<void>}
 */
async function initializeApp() {
  document.title = description
  const isCoarsePointer = Boolean(window.matchMedia?.('(hover: none), (pointer: coarse)')?.matches)
  document.documentElement.classList.toggle('is-mobile', isMobile || isCoarsePointer)

  if (!isElectron && 'serviceWorker' in navigator) {
    const registerSW = () => {
      navigator.serviceWorker
        .register('sw.js', { updateViaCache: 'none' })
        .then((reg) => reg.update().catch(() => {}))
        .catch((error) => console.error('Service worker registration failed:', error))
    }

    if (document.readyState === 'complete') {
      registerSW()
    } else {
      window.addEventListener('load', registerSW)
    }
  }

  migrateAppState({ defaultColors: colors.defaults })
  generateIcons()
  setupEditor()
  setupCalcManager()
  setupSync()
  initCurrencies()
  setupUserDefined()
  setupPlot()

  colors.initialize()
  await settings.initialize()
  await settings.apply(false)

  setupHeaders()
  setupAppButtons()
  setupResultActions()
  setupPanelResizer()
  setupSyncScroll()
  setupAppInfo()
  setupKeyboardShortcuts()
  setupPrintArea()
  setupUIkitUtils()
  initializePageList()
  setupPageIo()

  await initializeSync()

  initializePages()
  initializeContextMenus()
  initializeSettingsTooltips()
  initAppUpdate()
  checkAppUpdate()

  if (isElectron) {
    numara.rendererReady()
  }

  const focusEditorIfIdle = () => {
    if (
      !isModalOpen() &&
      !isSearchPanelOpen() &&
      !document.activeElement?.matches?.('.pageListRenameInput, .pageTabRenameInput')
    ) {
      cm.focus()
    }
  }

  window.addEventListener('focus', focusEditorIfIdle)
  setTimeout(focusEditorIfIdle, 500)
}

initializeApp().catch((error) => console.error('Failed to initialize app:', error))
