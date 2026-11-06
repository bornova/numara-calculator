import { dom } from '../dom.js'
import { cm } from '../editor/index.js'
import { numaraKeys } from '../editor/keybindings.js'
import { isSearchPanelOpen } from '../editor/searchPanel.js'
import { app } from '../state/appState.js'
import { isElectron } from '../state/env.js'
import { isModalOpen } from './dialogs.js'

/**
 * Registers application-wide keyboard shortcuts using numaraKeys.
 */
export function setupKeyboardShortcuts() {
  const keys = {
    '$mod+D': 'clearButton',
    '$mod+N': 'newPageButton',
    '$mod+P': 'printButton',
    'Shift+TAB': 'pageName'
  }

  const closePageListIfOpen = () =>
    dom.pageListPanel.classList.contains('uk-open') &&
    !dom.dialogNewPage.classList.contains('uk-open') &&
    (dom.closePageListButton.click(), true)

  const shortcuts = {}

  for (const [command, button] of Object.entries(keys)) {
    shortcuts[command] = (event) => {
      if (command === 'Shift+TAB') {
        if (app.pageListDocked || app.settings.pageListPosition === 'tabs') return

        if (isModalOpen()) {
          if (closePageListIfOpen()) {
            event.preventDefault()
          }

          return
        }

        event.preventDefault()
        dom[button].click()
        return
      }

      event.preventDefault()

      if (command === '$mod+D') {
        event.stopPropagation()
      }

      if (!isModalOpen()) {
        dom[button].click()
      } else {
        closePageListIfOpen()
      }
    }
  }

  numaraKeys(window, shortcuts)

  // Listen to Escape key in the capture phase to close/hide the window safely.
  window.addEventListener(
    'keydown',
    (event) => {
      if (event.key === 'Escape') {
        if (
          isElectron &&
          app.settings.escToClose &&
          !isModalOpen() &&
          !isSearchPanelOpen() &&
          !event.target.closest?.('.pageListRenameInput, .pageTabRenameInput') &&
          !dom.tabContextMenu?.classList.contains('uk-open') &&
          !dom.dialogNewPage?.classList.contains('uk-open') &&
          (!cm || !cm.state.completionActive)
        ) {
          event.preventDefault()
          event.stopPropagation()
          numara.closeWindow()
        }
      }
    },
    true
  )
}
