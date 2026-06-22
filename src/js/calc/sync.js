import { DateTime } from 'luxon'
import { app, store, isElectron } from '../appState'
import { cm } from '../editor'
import { calculate } from './calcManager'
import { populatePages } from '../ui/pageManager'
import { dom } from '../dom'
import UIkit from 'uikit'
import { notify } from '../ui/dialogs'

const lastSyncContent = new Map()
let currentSyncDir = null
let isSyncing = false

/**
 * Clears the folder synchronization cache state.
 */
export function clearSyncCache() {
  currentSyncDir = null
  lastSyncContent.clear()
}

/**
 * Checks if the sync directory exists. If not, disables sync, clears cache, stops watching, and displays a notification.
 * @returns {Promise<boolean>} Resolves to true if the directory exists, otherwise false.
 */
export async function checkSyncDir() {
  if (!isElectron) return false
  if (!app.settings.syncDirEnabled || !app.settings.syncDir) return false

  try {
    const exists = await numara.checkSyncDirectory(app.settings.syncDir)

    if (!exists) {
      disableSyncState('Sync directory could not be found. Sync has been disabled.')

      return false
    }

    return true
  } catch (error) {
    console.error('Error checking sync directory:', error)
    return false
  }
}

let activeDeletionDialog = false

/**
 * Handles the event when the sync directory is deleted or no longer accessible, presenting options to select a new folder or disable sync.
 */
export async function handleSyncDirDeleted() {
  if (!isElectron) return
  if (!app.settings.syncDirEnabled || !app.settings.syncDir) return
  if (activeDeletionDialog) return

  activeDeletionDialog = true
  numara.stopWatchingSyncDir()

  customConfirm(
    'The sync folder has been deleted or is no longer accessible. What would you like to do?',
    'Disable Sync',
    'Select New Folder',
    () => {
      activeDeletionDialog = false
      disableSyncState('Sync has been disabled.')
    },
    async () => {
      activeDeletionDialog = false

      const path = await numara.selectSyncDirectory()

      if (path) {
        app.settings.syncDirEnabled = true
        app.settings.syncDir = path
        store.set('settings', app.settings)

        const syncDirInput = dom.el('#syncDir')

        if (syncDirInput) {
          syncDirInput.value = path
        }

        const syncDirEnabledCheckbox = dom.el('#syncDirEnabled')

        if (syncDirEnabledCheckbox) {
          syncDirEnabledCheckbox.checked = true
        }

        const syncDirSection = dom.el('#syncDirSection')

        if (syncDirSection) {
          syncDirSection.style.display = 'flex'
        }

        numara.startWatchingSyncDir(path)
        triggerFolderSync().catch(console.error)
      } else {
        disableSyncState('Sync has been disabled.')
      }
    }
  )
}

function disableSyncState(message) {
  app.settings.syncDirEnabled = false
  app.settings.syncDir = ''
  store.set('settings', app.settings)

  clearSyncCache()
  numara.stopWatchingSyncDir()

  const syncDirEnabledCheckbox = dom.el('#syncDirEnabled')

  if (syncDirEnabledCheckbox) {
    syncDirEnabledCheckbox.checked = false
  }

  const syncDirSection = dom.el('#syncDirSection')

  if (syncDirSection) {
    syncDirSection.style.display = 'none'
  }

  notify(message, 'danger')
}

/**
 * Sanitizes a page name to ensure it's safe to use as a file name.
 * @param {string} name The page name.
 * @returns {string} The safe file name.
 */
export function getSafeFilename(name) {
  return name.replace(/[/\\:*?"<>|]/g, '-').trim()
}

/**
 * Displays a custom confirmation modal dialog with custom button labels.
 * @param {string} msg The message markup text to show.
 * @param {string} yesLabel Action button label.
 * @param {string} noLabel Dismiss button label.
 * @param {function} yesAction Callback fired on yes/action select.
 * @param {function} noAction Callback fired on no/dismiss select.
 */
function customConfirm(msg, yesLabel, noLabel, yesAction, noAction) {
  dom.confirmMsg.innerHTML = msg

  const yesBtn = dom.confirmYes
  const noBtn = document.querySelector('#dialogConfirm .uk-button-default')
  const originalYesText = yesBtn.textContent
  const originalNoText = noBtn.textContent

  yesBtn.textContent = yesLabel
  noBtn.textContent = noLabel

  noBtn.classList.remove('uk-modal-close')

  UIkit.modal('#dialogConfirm', { bgClose: false, escClose: false, stack: true }).show()

  const cleanup = () => {
    yesBtn.textContent = originalYesText
    noBtn.textContent = originalNoText
    noBtn.classList.add('uk-modal-close')
    yesBtn.onclick = null
    noBtn.onclick = null
  }

  yesBtn.onclick = (event) => {
    event.stopPropagation()
    UIkit.modal('#dialogConfirm').hide()
    cleanup()
    setTimeout(yesAction, 50)
  }

  noBtn.onclick = (event) => {
    event.stopPropagation()
    UIkit.modal('#dialogConfirm').hide()
    cleanup()
    setTimeout(noAction, 50)
  }
}

/**
 * Prompts the user to resolve a synchronization conflict.
 * @param {string} pageName The name of the conflicting page.
 * @returns {Promise<string>} Resolves to 'overwrite' or 'sync_local'.
 */
function askSyncResolution(pageName) {
  return new Promise((resolve) => {
    customConfirm(
      `A file named "<b>${pageName}.num</b>" already exists in the sync folder with different calculations than your local page. <br><br>Do you want to overwrite your local page with the sync folder file, or sync (keep) your local calculations?`,
      'Overwrite Local',
      'Sync Local',
      () => resolve('overwrite'),
      () => resolve('sync_local')
    )
  })
}

/**
 * Triggers a full synchronization between local storage pages and the chosen sync directory.
 * @returns {Promise<void>}
 */
export async function triggerFolderSync() {
  if (!isElectron) return
  if (isSyncing) return

  if (!app.settings.syncDirEnabled || !app.settings.syncDir) {
    clearSyncCache()
    return
  }

  isSyncing = true

  const exists = await checkSyncDir()
  if (!exists) {
    isSyncing = false
    return
  }

  const dirPath = app.settings.syncDir

  if (dirPath !== currentSyncDir) {
    currentSyncDir = dirPath
    lastSyncContent.clear()
  }

  try {
    const files = await numara.readSyncDirectory(dirPath)
    const pages = store.get('pages') || []
    let modified = false

    const processedPageIds = new Set()

    // 1. Sync files -> local storage pages
    for (const file of files) {
      const pageName = file.name
      const fileContent = file.content
      const safeName = getSafeFilename(pageName)

      const localPage = pages.find((p) => getSafeFilename(p.name) === safeName)

      // Prompt user if file already exists in sync folder and is different from local page content on sync initialisation
      if (localPage && !lastSyncContent.has(safeName)) {
        if (localPage.data !== fileContent) {
          const resolution = await askSyncResolution(pageName)

          if (resolution === 'overwrite') {
            localPage.data = fileContent
            modified = true
            lastSyncContent.set(safeName, fileContent)

            // If it is the active page, reload it in CodeMirror
            if (localPage.id === app.activePage) {
              const cursor = cm.getCursor()

              cm.setValue(fileContent)
              cm.setCursor(cursor)
            }
          } else {
            // Keep local: write local content to sync dir
            lastSyncContent.set(safeName, localPage.data || '')

            await numara.writeSyncFile(dirPath, safeName, localPage.data || '')
          }

          processedPageIds.add(localPage.id)
          continue
        }
      }

      // Skip importing if the file content on disk hasn't changed since our last write/read
      if (localPage && lastSyncContent.has(safeName) && lastSyncContent.get(safeName) === fileContent) {
        processedPageIds.add(localPage.id)
        continue
      }

      // Update the cache with the new content
      lastSyncContent.set(safeName, fileContent)

      if (localPage) {
        processedPageIds.add(localPage.id)
        if (localPage.data !== fileContent) {
          localPage.data = fileContent
          modified = true

          // If it is the active page, reload it in CodeMirror
          if (localPage.id === app.activePage) {
            const cursor = cm.getCursor()

            cm.setValue(fileContent)
            cm.setCursor(cursor)
          }
        }
      } else {
        // Create new page in local storage from the file
        const newPageId = DateTime.local().toFormat('yyyyMMddHHmmssSSS')
        await new Promise((resolve) => setTimeout(resolve, 2)) // guarantee unique id

        const newPage = {
          id: newPageId,
          name: pageName,
          data: fileContent,
          folds: [],
          history: null,
          cursor: { line: 0, ch: 0 }
        }
        pages.push(newPage)
        processedPageIds.add(newPageId)
        modified = true
      }
    }

    // 2. Sync local storage pages -> files (write local pages that don't exist in folder yet)
    for (const page of pages) {
      if (!processedPageIds.has(page.id)) {
        const safeName = getSafeFilename(page.name)
        const content = page.data || ''
        const previousContent = lastSyncContent.get(safeName)

        try {
          lastSyncContent.set(safeName, content)

          await numara.writeSyncFile(dirPath, safeName, content)
        } catch (error) {
          if (previousContent === undefined) {
            lastSyncContent.delete(safeName)
          } else {
            lastSyncContent.set(safeName, previousContent)
          }

          console.error(`Error writing local page ${page.name} to sync dir:`, error)
        }
      }
    }

    if (modified) {
      store.set('pages', pages)
      populatePages()
      calculate()
    }
  } catch (error) {
    console.error('Error triggering folder sync:', error)
    await checkSyncDir()
  } finally {
    isSyncing = false
  }
}

/**
 * Saves/writes a page's calculations content to the sync folder.
 * @param {string} pageName The name of the page to save.
 * @param {string} content The content string to write.
 * @returns {Promise<void>}
 */
export async function syncPageSave(pageName, content) {
  if (!isElectron) return
  if (!app.settings.syncDirEnabled || !app.settings.syncDir) return

  const dirPath = app.settings.syncDir
  const safeName = getSafeFilename(pageName)
  const previousContent = lastSyncContent.get(safeName)

  try {
    lastSyncContent.set(safeName, content || '')

    await numara.writeSyncFile(dirPath, safeName, content || '')
  } catch (error) {
    if (previousContent === undefined) {
      lastSyncContent.delete(safeName)
    } else {
      lastSyncContent.set(safeName, previousContent)
    }

    console.error(`Error saving page ${pageName} to sync dir:`, error)
    await checkSyncDir()
  }
}

/**
 * Renames a page's corresponding file in the sync folder.
 * @param {string} oldName The old page name.
 * @param {string} newName The new page name.
 * @returns {Promise<void>}
 */
export async function syncPageRename(oldName, newName) {
  if (!isElectron) return
  if (!app.settings.syncDirEnabled || !app.settings.syncDir) return

  const dirPath = app.settings.syncDir
  const safeOldName = getSafeFilename(oldName)
  const safeNewName = getSafeFilename(newName)
  const content = lastSyncContent.get(safeOldName) || ''

  try {
    lastSyncContent.delete(safeOldName)
    lastSyncContent.set(safeNewName, content)

    await numara.renameSyncFile(dirPath, safeOldName, safeNewName)
  } catch (error) {
    lastSyncContent.delete(safeNewName)
    lastSyncContent.set(safeOldName, content)

    console.error(`Error renaming page ${oldName} to ${newName} in sync dir:`, error)
    await checkSyncDir()
  }
}

/**
 * Deletes a page's corresponding file from the sync folder.
 * @param {string} pageName The name of the page to delete.
 * @returns {Promise<void>}
 */
export async function syncPageDelete(pageName) {
  if (!isElectron) return
  if (!app.settings.syncDirEnabled || !app.settings.syncDir) return

  const dirPath = app.settings.syncDir
  const safeName = getSafeFilename(pageName)
  const previousContent = lastSyncContent.get(safeName)

  try {
    lastSyncContent.delete(safeName)
    await numara.deleteSyncFile(dirPath, safeName)
  } catch (error) {
    if (previousContent !== undefined) {
      lastSyncContent.set(safeName, previousContent)
    }

    console.error(`Error deleting page ${pageName} from sync dir:`, error)
    await checkSyncDir()
  }
}

let debounceTimeout = null
/**
 * Triggers a debounced save of the page calculations to the sync folder.
 * @param {string} pageName The name of the page to save.
 * @param {string} content The content string to write.
 */
export function syncPageSaveDebounced(pageName, content) {
  if (!isElectron) return
  if (!app.settings.syncDirEnabled || !app.settings.syncDir) return

  clearTimeout(debounceTimeout)
  debounceTimeout = setTimeout(() => {
    syncPageSave(pageName, content)
  }, 500)
}
