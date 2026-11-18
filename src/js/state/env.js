const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent.toLowerCase() : ''
const isIpadOS = typeof navigator !== 'undefined' && userAgent.includes('mac') && Number(navigator.maxTouchPoints) > 1

export const MIN_APP_WIDTH = 480
export const MIN_APP_HEIGHT = 420
export const DEFAULT_APP_WIDTH = 600
export const DEFAULT_APP_HEIGHT = 515

/** Check if app is running in Electron. */
export const isElectron = typeof window !== 'undefined' && window.numara !== undefined

/** Check if app is running on macOS. */
export const isMac = isElectron
  ? window.numara.isMac
  : userAgent.includes('mac') && !isIpadOS && !/iphone|ipad|ipod/.test(userAgent)

/** Check if app is running on Linux. */
export const isLinux = isElectron
  ? Boolean(window.numara.isLinux)
  : userAgent.includes('linux') && !userAgent.includes('android')

/** Check if app is running on a mobile device. */
export const isMobile =
  isIpadOS ||
  /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent) ||
  (typeof navigator !== 'undefined' && !!navigator.userAgentData?.mobile)
