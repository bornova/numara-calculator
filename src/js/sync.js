import { DateTime } from 'luxon'
import { app, store, isElectron } from './utils'
import { cm } from './editor/editor'
import { calculate } from './eval'
import { populatePages } from './ui/pages'
import { dom } from './dom'
import UIkit from 'uikit'

const lastSyncContent = new Map()
let currentSyncDir = null
let isSyncing = false

export function clearSyncCache() {
  currentSyncDir = null
  lastSyncContent.clear()
}

export function getSafeFilename(name) {
  return name.replace(/[/\\:*?"<>|]/g, '-').trim()
}

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

export async function triggerFolderSync() {
  if (!isElectron) return
  if (isSyncing) return
  if (!app.settings.syncDirEnabled || !app.settings.syncDir) {
    clearSyncCache()
    return
  }

  isSyncing = true
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
  } finally {
    isSyncing = false
  }
}

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
  }
}

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
  }
}

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
  }
}

let debounceTimeout = null
export function syncPageSaveDebounced(pageName, content) {
  if (!isElectron) return
  if (!app.settings.syncDirEnabled || !app.settings.syncDir) return

  clearTimeout(debounceTimeout)
  debounceTimeout = setTimeout(() => {
    syncPageSave(pageName, content)
  }, 500)
}
