/**
 * Shared application runtime state.
 */
export const app = {
  activePlot: null,
  activePage: null,
  colors: null,
  currencies: {},
  loadingPage: false,
  mathScope: new Map(),
  pageAnswers: new Map(),
  pageHistory: new Map(),
  pageListDocked: null,
  plotFunction: null,
  plotSettings: null,
  refreshCM: true,
  scopeProperties: {},
  scopeTypes: {},
  settings: null,
  udfList: [],
  uduList: [],
  updateReady: false,
  widgetMap: new WeakMap()
}
