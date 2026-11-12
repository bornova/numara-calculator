import { description } from '../../package.json'
import { initCurrencies } from './calc/currencies.js'
import { setupUserDefined } from './calc/userDefined.js'
import { cm, setupEditor } from './editor/index.js'
import { isSearchPanelOpen } from './editor/searchPanel.js'
import { initializePages } from './pages/pageManager.js'
import { checkSyncDir, handleSyncDirDeleted, triggerFolderSync } from './pages/sync.js'
import { app } from './state/appState.js'
import { isElectron, isMobile } from './state/env.js'
import { migrateStorageAndPages } from './state/migration.js'
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

document.title = description

/**
 * Bootstraps the application, initializes settings, currencies, colors, and UI layout.
 * @returns {Promise<void>}
 */
async function initializeApp() {
  const isCoarsePointer = Boolean(window.matchMedia?.('(hover: none), (pointer: coarse)')?.matches)
  document.documentElement.classList.toggle('is-mobile', isMobile || isCoarsePointer)

  if (!isElectron && 'serviceWorker' in navigator) {
    let refreshing = false

    if (navigator.serviceWorker.controller) {
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (refreshing) return
        refreshing = true
        window.location.reload()
      })
    }

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

  if (document.fonts?.load) {
    Promise.all([
      document.fonts.load('400 1rem "Google Sans"'),
      document.fonts.load('500 1rem "Google Sans"'),
      document.fonts.load('600 1rem "Google Sans"'),
      document.fonts.load('700 1rem "Google Sans"')
    ]).catch(() => {})
  }

  migrateStorageAndPages()
  generateIcons()
  setupEditor()
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
  initializePages()
  initializeContextMenus()
  initializeSettingsTooltips()
  initAppUpdate()
  checkAppUpdate()

  if (isElectron) {
    if (app.settings.syncDirEnabled && app.settings.syncDir) {
      const syncDirExists = await checkSyncDir()

      if (syncDirExists) {
        numara.startWatchingSyncDir(app.settings.syncDir)
        triggerFolderSync().catch(console.error)
      }
    }

    numara.onSyncDirChanged(() => {
      triggerFolderSync().catch(console.error)
    })

    numara.onSyncDirDeleted(() => {
      handleSyncDirDeleted().catch(console.error)
    })

    numara.rendererReady()
  }

  window.addEventListener('focus', () => {
    if (!isModalOpen() && !isSearchPanelOpen()) {
      cm.focus()
    }
  })

  setTimeout(() => {
    if (!isModalOpen() && !isSearchPanelOpen()) {
      cm.focus()
    }
  }, 500)
}

initializeApp().catch((error) => console.error('Failed to initialize app:', error))
