const SELECTOR_OVERRIDES = {
  headerWin: 'winHeader',
  headerWinTitle: 'winHeaderTitle',
  headerMac: 'macHeader',
  headerMacTitle: 'macHeaderTitle',
  pageListBar: { selector: '#pageListPanel .uk-offcanvas-bar' },
  plotXMin: 'xMin',
  plotXMax: 'xMax',
  plotYMin: 'yMin',
  plotYMax: 'yMax'
}

const elementCache = new Map()

const baseDom = {
  /**
   * Query DOM element that matches the selector.
   * @param {string} selector The selector to match.
   * @returns {Element|null} The first matching element.
   */
  el: (selector) => (typeof document !== 'undefined' ? document.querySelector(selector) : null),

  /**
   * Query all DOM elements matching the selector.
   * @param {string} selector The selector to match.
   * @returns {NodeList|Array} A list of matching elements.
   */
  els: (selector) => (typeof document !== 'undefined' ? document.querySelectorAll(selector) : []),

  // Cached icons
  icons: {}
}

/**
 * Clears all lazily cached DOM element references.
 */
export function resetDomCache() {
  elementCache.clear()
}

/**
 * Lazy DOM elements cache and utility functions.
 */
export const dom = new Proxy(baseDom, {
  get(target, prop, receiver) {
    if (Reflect.has(target, prop) || typeof prop !== 'string' || prop === 'then') {
      return Reflect.get(target, prop, receiver)
    }

    if (elementCache.has(prop)) {
      return elementCache.get(prop)
    }

    if (typeof document === 'undefined') {
      return null
    }

    const entry = Object.hasOwn(SELECTOR_OVERRIDES, prop) ? SELECTOR_OVERRIDES[prop] : prop
    const resolved = typeof entry === 'string' ? document.getElementById(entry) : document.querySelector(entry.selector)

    if (resolved) {
      elementCache.set(prop, resolved)
    }

    return resolved
  },

  set(target, prop, value, receiver) {
    if (typeof prop === 'string' && !Reflect.has(target, prop)) {
      elementCache.set(prop, value)
      return true
    }

    return Reflect.set(target, prop, value, receiver)
  }
})
