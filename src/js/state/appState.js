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
  plotFunction: null,
  plotSettings: null,
  refreshCM: true,
  scopeProperties: {},
  scopeTypes: {},
  settings: null,
  sidebarDocked: null,
  udfList: [],
  uduList: [],
  updateReady: false,
  widgetMap: new WeakMap()
}
