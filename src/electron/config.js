import { nativeTheme } from 'electron'
import Store from 'electron-store'

export const isMac = process.platform === 'darwin'
export const isWin = process.platform === 'win32'

export const DARK_COLOR = '#1f1f1f'
export const LIGHT_COLOR = '#ffffff'
export const TRANS_COLOR = '#00000000'

export const schema = {
  appHeight: { type: 'number', default: 480 },
  appWidth: { type: 'number', default: 560 },
  fullSize: { type: 'boolean', default: false },
  position: { type: 'array', items: { type: 'integer' } },
  theme: { type: 'string', default: 'system' },
  showTray: { type: 'boolean', default: false },
  syncDir: { type: 'string', default: '' }
}

export const config = new Store({ schema, clearInvalidConfig: true, fileExtension: '' })

/**
 * Resolves the background hex color for the current theme configuration.
 * @returns {string} Hex color string.
 */
export const getThemeColor = () =>
  config.get('theme') === 'dark' || (config.get('theme') === 'system' && nativeTheme.shouldUseDarkColors)
    ? DARK_COLOR
    : LIGHT_COLOR
