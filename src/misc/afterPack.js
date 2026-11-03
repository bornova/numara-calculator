import { promises as fs } from 'fs'
import path from 'path'

const UNUSED_FILES = ['dxcompiler.dll']

/**
 * Removes unused Chromium runtime files from the packaged application directory.
 * @param {object} context The electron-builder afterPack context.
 */
export default async function afterPack(context) {
  await Promise.all(
    UNUSED_FILES.map((file) =>
      fs.rm(path.join(context.appOutDir, file), {
        force: true
      })
    )
  )
}
