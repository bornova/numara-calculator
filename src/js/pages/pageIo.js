import UIkit from 'uikit'

import { debouncedSavePageState } from '../calc/calcManager.js'
import { escapeHTML, getSafeFilename } from '../core/utils.js'
import { dom } from '../dom.js'
import { cm } from '../editor/index.js'
import { app } from '../state/appState.js'
import { isElectron } from '../state/env.js'
import { store } from '../state/store.js'
import { notify } from '../ui/dialogs.js'
import { newPage } from './pageManager.js'

/**
 * Exports the currently active page to a `.num` file via the Electron main process.
 */
function exportActivePage() {
  debouncedSavePageState.flush()
  const pages = store.get('pages') || []
  const page = pages.find((p) => p.id === app.activePage)

  if (page) {
    numara.exportPage(getSafeFilename(page.name), page.data)
  }
}

/**
 * Binds page import/export buttons and IPC listeners in Electron, or removes those buttons in web builds.
 */
export function setupPageIo() {
  if (isElectron) {
    dom.importPageButton.addEventListener('click', () => {
      UIkit.dropdown('#moreDropdown')?.hide(0)
      numara.importPage()
    })

    dom.exportPageButton.addEventListener('click', () => {
      UIkit.dropdown('#moreDropdown')?.hide(0)
      exportActivePage()
    })

    numara.pageImported((data, msg, name) => {
      newPage(true, name, data)
      cm.clearHistory()
      notify(escapeHTML(msg), 'success')
    })

    numara.importDataError((error) => notify(escapeHTML(String(error)), 'danger'))

    numara.pageExported((msg) => {
      if (!app.pageListDocked) {
        UIkit.offcanvas('#pageListPanel').hide()
      }

      notify(escapeHTML(msg), 'success')
    })

    numara.exportDataError((error) => notify(escapeHTML(String(error)), 'danger'))
    numara.requestExportPage(exportActivePage)

    numara.print(() => {
      if (!app.pageListDocked) {
        UIkit.offcanvas('#pageListPanel').hide()
      }

      window.print()
    })
  } else {
    dom.els('#importPageButton, #exportPageButton').forEach((el) => el.remove())
  }
}
