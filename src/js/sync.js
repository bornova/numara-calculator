import { DateTime } from 'luxon'
import { app, store, isElectron } from './utils'
import { cm } from './editor/editor'
import { calculate } from './eval'
import { populatePages } from './ui/pages'

export function getSafeFilename(name) {
  return name.replace(/[/\\:*?"<>|]/g, '-').trim()
}

export async function triggerFolderSync() {
  if (!isElectron) return
  if (!app.settings.syncDirEnabled || !app.settings.syncDir) {
    return
  }

  const dirPath = app.settings.syncDir
  try {
    const files = await numara.readSyncDirectory(dirPath)
    const pages = store.get('pages') || []
    let modified = false

    const processedPageIds = new Set()

    // 1. Sync files -> local storage pages
    for (const file of files) {
      const pageName = file.name
      const fileContent = file.content

      const localPage = pages.find((p) => getSafeFilename(p.name) === getSafeFilename(pageName))
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
        await numara.writeSyncFile(dirPath, safeName, page.data || '')
      }
    }

    if (modified) {
      store.set('pages', pages)
      populatePages()
      calculate()
    }
  } catch (error) {
    console.error('Error triggering folder sync:', error)
  }
}

export async function syncPageSave(pageName, content) {
  if (!isElectron) return
  if (!app.settings.syncDirEnabled || !app.settings.syncDir) return

  const dirPath = app.settings.syncDir
  const safeName = getSafeFilename(pageName)
  try {
    await numara.writeSyncFile(dirPath, safeName, content || '')
  } catch (error) {
    console.error(`Error saving page ${pageName} to sync dir:`, error)
  }
}

export async function syncPageRename(oldName, newName) {
  if (!isElectron) return
  if (!app.settings.syncDirEnabled || !app.settings.syncDir) return

  const dirPath = app.settings.syncDir
  const safeOldName = getSafeFilename(oldName)
  const safeNewName = getSafeFilename(newName)
  try {
    await numara.renameSyncFile(dirPath, safeOldName, safeNewName)
  } catch (error) {
    console.error(`Error renaming page ${oldName} to ${newName} in sync dir:`, error)
  }
}

export async function syncPageDelete(pageName) {
  if (!isElectron) return
  if (!app.settings.syncDirEnabled || !app.settings.syncDir) return

  const dirPath = app.settings.syncDir
  const safeName = getSafeFilename(pageName)
  try {
    await numara.deleteSyncFile(dirPath, safeName)
  } catch (error) {
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
