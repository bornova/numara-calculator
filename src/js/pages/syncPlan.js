import { getSafeFilename } from '../core/utils.js'

/**
 * Computes a normalized case-insensitive sync key for a page or file name.
 * @param {string} name Page or file name.
 * @returns {string}
 */
export function getSyncKey(name) {
  return getSafeFilename(name).toLowerCase()
}

/**
 * Pure helper that detects external file renames in the sync directory by matching
 * missing previously synced pages against unmatched new disk files.
 *
 * @param {object} params
 * @param {Array<{ id: string, name: string, data?: string }>} params.pages Local pages.
 * @param {Array<{ name: string, content: string }>} params.files Disk `.num` files.
 * @param {Map<string, string>} params.lastSyncContent Map of previously synced `syncKey -> content`.
 * @param {string|null} [params.activePageId=null] Currently active page ID (prioritized on tie).
 * @returns {Array<{ page: object, file: object, oldSyncKey: string, newSyncKey: string, sanitizedName: string }>}
 */
export function detectExternalRenames({ pages, files, lastSyncContent, activePageId = null }) {
  const diskSyncKeys = new Set(files.map((f) => getSyncKey(f.name)))
  const existingSyncKeys = new Set(pages.map((p) => getSyncKey(p.name)))
  const missingSyncedPages = pages.filter((p) => {
    const key = getSyncKey(p.name)

    return lastSyncContent.has(key) && !diskSyncKeys.has(key)
  })
  const unmatchedNewFiles = files.filter((f) => !existingSyncKeys.has(getSyncKey(f.name)))
  const matchedMissingIds = new Set()
  const matchedNewFileSyncKeys = new Set()
  const detectedRenames = []

  const recordRename = (page, file) => {
    const oldSyncKey = getSyncKey(page.name)
    const sanitizedName = file.name.replace(/<|>/g, '').trim() || 'Untitled'
    const newSyncKey = getSyncKey(sanitizedName)

    matchedMissingIds.add(page.id)
    matchedNewFileSyncKeys.add(newSyncKey)
    detectedRenames.push({ page, file, oldSyncKey, newSyncKey, sanitizedName })
  }

  for (const file of unmatchedNewFiles) {
    const candidates = missingSyncedPages.filter(
      (p) =>
        !matchedMissingIds.has(p.id) &&
        ((p.data || '') === file.content || lastSyncContent.get(getSyncKey(p.name)) === file.content)
    )

    if (candidates.length > 0) {
      const chosen = candidates.find((p) => p.id === activePageId) || candidates[0]

      recordRename(chosen, file)
    }
  }

  const remainingMissing = missingSyncedPages.filter((p) => !matchedMissingIds.has(p.id))
  const remainingNewFiles = unmatchedNewFiles.filter((f) => !matchedNewFileSyncKeys.has(getSyncKey(f.name)))

  if (remainingMissing.length === 1 && remainingNewFiles.length === 1) {
    recordRename(remainingMissing[0], remainingNewFiles[0])
  }

  return detectedRenames
}
