/** Query DOM element that matches the selector. */
export const $ = (selector) => document.querySelector(selector)

/** Query all DOM elements matching the selector. */
export const $all = (selector) => document.querySelectorAll(selector)

/** Local storage. */
export const store = {
  /** Get value from local storage. */
  get: (key) => JSON.parse(localStorage.getItem(key)),
  /** Save value to local storage. */
  set: (key, value) => {
    localStorage.setItem(key, JSON.stringify(value))
  }
}

/** App globals. */
export const app = {
  activePlot: null,
  activePage: null,
  currencyRates: {},
  mathScope: {},
  plotFunction: null,
  refreshCM: true,
  settings: null,
  udfList: [],
  uduList: []
}
