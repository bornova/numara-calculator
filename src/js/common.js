/**
 * Query DOM element that matches the selector.
 * @param {string} selector - The CSS selector to match.
 * @returns {Element} The first matching element.
 */
export const $ = (selector) => document.querySelector(selector)

/**
 * Query all DOM elements matching the selector.
 * @param {string} selector - The CSS selector to match.
 * @returns {NodeList} A list of matching elements.
 */
export const $all = (selector) => document.querySelectorAll(selector)

/** Local storage utility. */
export const store = {
  /**
   * Get value from local storage.
   * @param {string} key - The key of the item to retrieve.
   * @returns {any} The parsed value from local storage.
   */
  get: (key) => JSON.parse(localStorage.getItem(key)),

  /**
   * Save value to local storage.
   * @param {string} key - The key under which to store the value.
   * @param {any} value - The value to store.
   */
  set: (key, value) => {
    localStorage.setItem(key, JSON.stringify(value))
  }
}

/** App globals. */
export const app = {
  activePlot: null,
  activePage: null,
  colors: null,
  currencyRates: {},
  mathScope: {},
  plotFunction: null,
  refreshCM: true,
  settings: null,
  udfList: [],
  uduList: []
}
