import { calculate, debouncedSavePageState } from '../calc/calcManager.js'
import { escapeHTML, getSafeFilename, sanitizePageName } from '../core/utils.js'
import { dom } from '../dom.js'
import { cm } from '../editor/index.js'
import { app } from '../state/appState.js'
import { isElectron } from '../state/env.js'
import { store } from '../state/store.js'
import { customConfirm, notify } from '../ui/dialogs.js'
import { defaultPage, generatePageId, loadPage, populatePages, updatePageName } from './pageManager.js'
import { detectExternalRenames, getSyncKey } from './syncPlan.js'

const lastSyncContent = new Map()
const debounceTimeouts = new Map()

let currentSyncDir = null
let isSyncing = false
let pendingResync = false
let activeDeletionDialog = false

/**
 * Returns whether Electron folder synchronization is currently enabled and configured.
 * @returns {boolean}
 */
function isSyncActive() {
  return isElectron && Boolean(app.settings.syncDirEnabled && app.settings.syncDir)
}

/**
 * Updates the sync directory UI elements and tooltip in the settings dialog.
 * @param {boolean} enabled Whether folder sync is enabled.
 * @param {string} [dirPath=''] The sync directory path.
 */
export function updateSyncUiState(enabled, dirPath = '') {
  if (dom.syncDir) {
    dom.syncDir.value = dirPath
  }

  if (dom.selectSyncDirButton) {
    if (dirPath) {
      const safePath = escapeHTML(dirPath).replaceAll(';', '&#59;')

      dom.selectSyncDirButton.textContent = dirPath
      dom.selectSyncDirButton.setAttribute('uk-tooltip', `title: ${safePath}; pos: bottom`)
    } else {
      dom.selectSyncDirButton.textContent = 'Choose Folder'
      dom.selectSyncDirButton.removeAttribute('uk-tooltip')
    }
  }

  if (dom.syncDirEnabled) {
    dom.syncDirEnabled.checked = enabled
  }

  if (dom.syncDirSection) {
    dom.syncDirSection.style.display = enabled ? 'flex' : 'none'
  }
}

/**
 * Clears any pending debounced save timeout for a given sync key.
 * @param {string} syncKey The normalized sync key.
 */
function clearSyncDebounce(syncKey) {
  const pendingTimeout = debounceTimeouts.get(syncKey)

  if (pendingTimeout) {
    clearTimeout(pendingTimeout)
    debounceTimeouts.delete(syncKey)
  }
}

/**
 * Restores or deletes the cached sync content for a key after a failed disk operation.
 * @param {string} key The normalized sync key.
 * @param {string|undefined} content The previous content to restore, or undefined to remove.
 */
function restoreSyncContent(key, content) {
  if (content === undefined) {
    lastSyncContent.delete(key)
  } else {
    lastSyncContent.set(key, content)
  }
}

/**
 * Disables folder synchronization and updates the Settings UI accordingly.
 * @param {string} message Notification message to display.
 */
function disableSyncState(message) {
  app.settings.syncDirEnabled = false
  app.settings.syncDir = ''
  store.set('settings', app.settings)

  clearSyncCache()
  numara.stopWatchingSyncDir()
  updateSyncUiState(false)

  notify(message, 'danger')
}

/**
 * Prompts the user to resolve a synchronization conflict.
 * @param {string} pageName The name of the conflicting page.
 * @returns {Promise<string>} Resolves to 'overwrite' or 'sync_local'.
 */
function askSyncResolution(pageName) {
  return new Promise((resolve) => {
    customConfirm(
      `A file named "<b>${escapeHTML(pageName)}.num</b>" already exists in the sync folder with different calculations than your local page. <br><br>Do you want to overwrite your local page with the sync folder file, or sync (keep) your local calculations?`,
      'Overwrite Local',
      'Sync Local',
      () => resolve('overwrite'),
      () => resolve('sync_local')
    )
  })
}

/**
 * Clears the folder synchronization cache state.
 */
export function clearSyncCache() {
  currentSyncDir = null
  lastSyncContent.clear()

  for (const timeout of debounceTimeouts.values()) {
    clearTimeout(timeout)
  }

  debounceTimeouts.clear()
}

/**
 * Checks if the sync directory exists. If not, disables sync, clears cache, stops watching, and displays a notification.
 * @returns {Promise<boolean>} Resolves to true if the directory exists, otherwise false.
 */
export async function checkSyncDir() {
  if (!isSyncActive()) return false

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

/**
 * Handles the event when the sync directory is deleted or no longer accessible, presenting options to select a new folder or disable sync.
 */
export async function handleSyncDirDeleted() {
  if (!isSyncActive() || activeDeletionDialog) return

  activeDeletionDialog = true
  numara.stopWatchingSyncDir()

  if (dom.selectSyncDirButton) {
    dom.selectSyncDirButton.textContent = 'Choose Folder'
    dom.selectSyncDirButton.removeAttribute('uk-tooltip')
  }

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

        updateSyncUiState(true, path)

        numara.startWatchingSyncDir(path)
        triggerFolderSync().catch(console.error)
      } else {
        disableSyncState('Sync has been disabled.')
      }
    }
  )
}

/**
 * Triggers a full synchronization between local storage pages and the chosen sync directory.
 * @returns {Promise<void>}
 */
export async function triggerFolderSync() {
  if (!isElectron) return

  if (isSyncing) {
    pendingResync = true
    return
  }

  if (!app.settings.syncDirEnabled || !app.settings.syncDir) {
    clearSyncCache()
    return
  }

  isSyncing = true

  try {
    debouncedSavePageState.flush()

    const exists = await checkSyncDir()

    if (!exists) return

    const dirPath = app.settings.syncDir

    if (dirPath !== currentSyncDir) {
      currentSyncDir = dirPath
      lastSyncContent.clear()
    }

    const files = await numara.readSyncDirectory(dirPath)

    debouncedSavePageState.flush()
    const pages = store.get('pages') || []
    let modified = false

    const processedPageIds = new Set()
    const updatedPageData = new Map()
    const renamedPageNames = new Map()
    const addedPages = []
    const deletedPageIds = new Set()

    // Detect external file renames before matching by name so renamed pages preserve their ID and active state
    const detectedRenames = detectExternalRenames({
      pages,
      files,
      lastSyncContent,
      activePageId: app.activePage
    })

    for (const { page, file, oldSyncKey, newSyncKey, sanitizedName } of detectedRenames) {
      clearSyncDebounce(oldSyncKey)

      lastSyncContent.delete(oldSyncKey)
      lastSyncContent.set(newSyncKey, file.content)
      page.name = sanitizedName
      renamedPageNames.set(page.id, sanitizedName)
      modified = true
    }

    // 1. Sync files -> local storage pages
    for (const file of files) {
      const pageName = file.name
      const fileContent = file.content
      const sanitizedName = sanitizePageName(pageName, 'Untitled')
      const syncKey = getSyncKey(pageName)

      const localPage = pages.find((p) => getSyncKey(p.name) === syncKey)

      if (localPage && localPage.name !== sanitizedName) {
        localPage.name = sanitizedName
        renamedPageNames.set(localPage.id, sanitizedName)
        modified = true
      }

      // Prompt user if file already exists in sync folder and is different from local page content on sync initialisation
      if (localPage && !lastSyncContent.has(syncKey)) {
        if (localPage.data !== fileContent) {
          const resolution = await askSyncResolution(pageName)

          if (resolution === 'overwrite') {
            localPage.data = fileContent
            updatedPageData.set(localPage.id, fileContent)
            modified = true
            lastSyncContent.set(syncKey, fileContent)
          } else {
            // Keep local: write local content to sync dir
            debouncedSavePageState.flush()
            const latestPage = (store.get('pages') || []).find((p) => p.id === localPage.id) || localPage
            const localData = latestPage.data || ''

            lastSyncContent.set(syncKey, localData)

            await numara.writeSyncFile(dirPath, getSafeFilename(latestPage.name), localData)
          }

          processedPageIds.add(localPage.id)
          continue
        }
      }

      // Skip importing if the file content on disk hasn't changed since our last write/read
      if (localPage && lastSyncContent.has(syncKey) && lastSyncContent.get(syncKey) === fileContent) {
        processedPageIds.add(localPage.id)
        continue
      }

      // Update the cache with the new content
      lastSyncContent.set(syncKey, fileContent)

      if (localPage) {
        processedPageIds.add(localPage.id)
        if (localPage.data !== fileContent) {
          localPage.data = fileContent
          updatedPageData.set(localPage.id, fileContent)
          modified = true
        }
      } else {
        // Create new page in local storage from the file
        const newPageId = generatePageId()

        const newPageObj = {
          id: newPageId,
          name: sanitizedName,
          data: fileContent,
          folds: [],
          cursor: { line: 0, ch: 0 }
        }
        pages.push(newPageObj)
        addedPages.push(newPageObj)
        processedPageIds.add(newPageId)
        modified = true
      }
    }

    // 2. Sync local storage pages -> files (write local pages that don't exist in folder yet, or remove externally deleted pages)
    let activePageDeleted = false

    for (let i = pages.length - 1; i >= 0; i--) {
      const page = pages[i]

      if (!processedPageIds.has(page.id)) {
        const safeName = getSafeFilename(page.name)
        const syncKey = getSyncKey(page.name)

        if (lastSyncContent.has(syncKey)) {
          lastSyncContent.delete(syncKey)
          pages.splice(i, 1)
          deletedPageIds.add(page.id)
          modified = true

          if (page.id === app.activePage) {
            activePageDeleted = true
          }

          continue
        }

        const content = page.data || ''
        const previousContent = lastSyncContent.get(syncKey)

        try {
          lastSyncContent.set(syncKey, content)

          await numara.writeSyncFile(dirPath, safeName, content)
        } catch (error) {
          restoreSyncContent(syncKey, previousContent)

          console.error(`Error writing local page ${page.name} to sync dir:`, error)
        }
      }
    }

    if (modified) {
      if (activePageDeleted || updatedPageData.has(app.activePage) || renamedPageNames.has(app.activePage)) {
        debouncedSavePageState.cancel?.()
      } else {
        debouncedSavePageState.flush()
      }

      for (const id of deletedPageIds) {
        app.pageHistory?.delete(id)
        app.pageAnswers?.delete(id)
      }

      const latestStoredPages = store.get('pages')
      const basePages = Array.isArray(latestStoredPages) ? latestStoredPages : pages
      const mergedPages = basePages.filter((p) => !deletedPageIds.has(p.id))

      for (const page of mergedPages) {
        if (renamedPageNames.has(page.id)) {
          page.name = renamedPageNames.get(page.id)
        }

        if (updatedPageData.has(page.id)) {
          page.data = updatedPageData.get(page.id)
        }
      }

      for (const added of addedPages) {
        if (!mergedPages.some((p) => p.id === added.id)) {
          mergedPages.push(added)
        }
      }

      store.set('pages', mergedPages)

      if (mergedPages.length === 0) {
        app.activePage = null
        defaultPage()
      } else if (activePageDeleted) {
        app.activePage = null
        loadPage(mergedPages[0].id)
      } else {
        if (renamedPageNames.has(app.activePage)) {
          updatePageName(renamedPageNames.get(app.activePage), app.activePage)
        }

        if (updatedPageData.has(app.activePage)) {
          app.loadingPage = true
          try {
            cm.setValue(updatedPageData.get(app.activePage))
          } finally {
            app.loadingPage = false
          }
        }

        populatePages()
        calculate()
      }
    }
  } catch (error) {
    console.error('Error triggering folder sync:', error)
    await checkSyncDir()
  } finally {
    isSyncing = false

    if (pendingResync) {
      pendingResync = false
      triggerFolderSync().catch(console.error)
    }
  }
}

/**
 * Executes a sync file operation with debounce cleanup, optimistic cache rollback on error, and directory verification.
 * @param {string} syncKey Primary normalized sync key to debounce and snapshot.
 * @param {string} errorLabel Context description logged on failure.
 * @param {(dirPath: string, previousContent: string|undefined) => Promise<void>} operation Async IPC operation.
 * @param {() => void} [extraRollback] Optional additional cache rollback step on failure.
 */
async function runSyncFileOp(syncKey, errorLabel, operation, extraRollback) {
  if (!isSyncActive()) return

  clearSyncDebounce(syncKey)

  const previousContent = lastSyncContent.get(syncKey)

  try {
    await operation(app.settings.syncDir, previousContent)
  } catch (error) {
    extraRollback?.()
    restoreSyncContent(syncKey, previousContent)

    console.error(`Error ${errorLabel}:`, error)
    await checkSyncDir()
  }
}

/**
 * Saves/writes a page's calculations content to the sync folder.
 * @param {string} pageName The name of the page to save.
 * @param {string} content The content string to write.
 * @returns {Promise<void>}
 */
export async function syncPageSave(pageName, content) {
  const syncKey = getSyncKey(pageName)
  const nextContent = content || ''

  await runSyncFileOp(syncKey, `saving page ${pageName} to sync dir`, async (dirPath) => {
    lastSyncContent.set(syncKey, nextContent)
    await numara.writeSyncFile(dirPath, getSafeFilename(pageName), nextContent)
  })
}

/**
 * Renames a page's corresponding file in the sync folder.
 * @param {string} oldName The old page name.
 * @param {string} newName The new page name.
 * @returns {Promise<void>}
 */
export async function syncPageRename(oldName, newName) {
  const oldSyncKey = getSyncKey(oldName)
  const newSyncKey = getSyncKey(newName)

  await runSyncFileOp(
    oldSyncKey,
    `renaming page ${oldName} to ${newName} in sync dir`,
    async (dirPath, previousContent) => {
      const content = previousContent ?? ''

      lastSyncContent.delete(oldSyncKey)
      lastSyncContent.set(newSyncKey, content)

      await numara.renameSyncFile(dirPath, getSafeFilename(oldName), getSafeFilename(newName))

      const page = (store.get('pages') || []).find((p) => getSyncKey(p.name) === newSyncKey)

      if (page && (page.data || '') !== content) {
        await syncPageSave(newName, page.data)
      }
    },
    () => lastSyncContent.delete(newSyncKey)
  )
}

/**
 * Deletes a page's corresponding file from the sync folder.
 * @param {string} pageName The name of the page to delete.
 * @returns {Promise<void>}
 */
export async function syncPageDelete(pageName) {
  const syncKey = getSyncKey(pageName)

  await runSyncFileOp(syncKey, `deleting page ${pageName} from sync dir`, async (dirPath) => {
    lastSyncContent.delete(syncKey)
    await numara.deleteSyncFile(dirPath, getSafeFilename(pageName))
  })
}

/**
 * Triggers a debounced save of the page calculations to the sync folder.
 * @param {string} pageName The name of the page to save.
 * @param {string} content The content string to write.
 */
export function syncPageSaveDebounced(pageName, content) {
  if (!isSyncActive()) return

  const syncKey = getSyncKey(pageName)

  clearSyncDebounce(syncKey)

  const timeout = setTimeout(() => {
    debounceTimeouts.delete(syncKey)
    syncPageSave(pageName, content)
  }, 500)

  debounceTimeouts.set(syncKey, timeout)
}
